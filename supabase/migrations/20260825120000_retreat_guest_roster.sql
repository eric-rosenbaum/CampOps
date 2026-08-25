-- Named guest roster for retreats, and per-person room assignment.
--
-- Until now housing was counts, not people: a retreat_housing row said "Birch 1, Smith
-- family, 6 people". That is enough to reserve a room and useless for knowing who is in it.
-- This adds the missing noun, a guest, and hangs the assignment off the guest rather than
-- a join table, because a person sleeps in exactly one room and that makes every placement a
-- single UPDATE.
--
-- retreat_housing is deliberately left alone. It stays the record of which rooms a group
-- HOLDS, along with the subgroup label, notes and lock state. Guests point at rooms. Where a
-- roster exists, people_count is kept in step with it; where no roster exists, the old
-- count-only flow keeps working exactly as before. Nothing needs migrating.

-- ─── Camp-level collection settings ──────────────────────────────────────────
-- Names only by default. A roster of 50–100 people sits behind a shareable no-password
-- link, so every additional column is a deliberate opt-in rather than something a camp
-- discovers it has been collecting.
alter table camps add column if not exists roster_collect_gender  boolean not null default false;
alter table camps add column if not exists roster_collect_dietary boolean not null default false;

comment on column camps.roster_collect_gender is
  'Opt-in: ask retreat coordinators for each guest''s gender (for gender-separated cabins).';
comment on column camps.roster_collect_dietary is
  'Opt-in: ask retreat coordinators for each guest''s dietary needs.';

-- ─── The roster ──────────────────────────────────────────────────────────────
create table if not exists retreat_guests (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id)    on delete cascade,
  retreat_id   uuid not null references retreats(id) on delete cascade,

  full_name    text not null,
  subgroup     text,            -- "Smith family", "Staff", "Bus A"
  gender       text,            -- only collected when the camp opts in
  dietary      text,            -- only collected when the camp opts in
  needs_accessible boolean not null default false,
  notes        text,

  -- Their room. NULL means unassigned, which is the state most guests start in.
  location_id  uuid references locations(id) on delete set null,

  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint retreat_guests_name_not_blank check (btrim(full_name) <> '')
);

create index if not exists retreat_guests_retreat_idx  on retreat_guests(retreat_id);
create index if not exists retreat_guests_location_idx on retreat_guests(location_id);
create index if not exists retreat_guests_camp_idx     on retreat_guests(camp_id);

alter table retreat_guests enable row level security;
alter table retreat_guests replica identity full;

drop policy if exists members_select_retreat_guests on retreat_guests;
create policy members_select_retreat_guests on retreat_guests
  for select using (is_camp_member(camp_id));

drop policy if exists staff_manage_retreat_guests on retreat_guests;
create policy staff_manage_retreat_guests on retreat_guests
  for all using (is_camp_member(camp_id) and get_camp_role(camp_id) = any (array['admin','staff']))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) = any (array['admin','staff']));

drop trigger if exists trg_retreat_guests_updated_at on retreat_guests;
create trigger trg_retreat_guests_updated_at
  before update on retreat_guests
  for each row execute function update_updated_at();

-- ─── Roster-driven vs hand-entered rooms ─────────────────────────────────────
-- Whether a room's occupancy comes from the named roster or from a number a human typed.
-- Inferring this from the shape of the row got it wrong in both directions -- it clobbered
-- counts a coordinator had entered, and it stranded rooms at zero -- so it is recorded.
alter table retreat_housing
  add column if not exists roster_driven boolean not null default false;

comment on column retreat_housing.roster_driven is
  'True when people_count is maintained from retreat_guests. False for hand-entered counts, which sync never touches.';

-- ─── Keeping retreat_housing in step with the roster ─────────────────────────
-- Assigning someone to a room is also how that room gets held, so the housing row has to
-- appear on assignment rather than being a separate step the coordinator has to remember.
create or replace function public.sync_retreat_housing_from_roster(p_retreat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r retreats;
begin
  select * into r from retreats where id = p_retreat_id;
  if not found then return; end if;

  -- Assigning a person to a room is also how that room gets held, so the housing row has to
  -- appear on assignment rather than being a separate step the coordinator must remember.
  insert into retreat_housing (camp_id, retreat_id, location_id, space_name, people_count, roster_driven)
  select r.camp_id, r.id, g.location_id,
         (select name from locations where id = g.location_id),
         count(*), true
  from retreat_guests g
  where g.retreat_id = p_retreat_id
    and g.location_id is not null
    and not exists (
      select 1 from retreat_housing h
      where h.retreat_id = p_retreat_id and h.location_id = g.location_id)
  group by g.location_id;

  -- A hand-entered row becomes roster-driven the moment the roster reaches into it. Before
  -- that it is left completely alone, so a group part-way through switching from counts to
  -- names never watches rooms they filled in by hand drop to zero.
  update retreat_housing h
     set roster_driven = true
   where h.retreat_id = p_retreat_id
     and not h.locked
     and not h.roster_driven
     and exists (select 1 from retreat_guests g
                 where g.retreat_id = p_retreat_id and g.location_id = h.location_id);

  -- From here on only roster-driven rows are touched.
  update retreat_housing h
     set people_count = (
           select count(*) from retreat_guests g
           where g.retreat_id = p_retreat_id and g.location_id = h.location_id)
   where h.retreat_id = p_retreat_id
     and h.roster_driven
     and not h.locked;

  -- Emptied and carrying nothing a human typed: the room is no longer held. A row with a
  -- subgroup label or a note survives at zero, for its author to clear deliberately.
  delete from retreat_housing h
   where h.retreat_id = p_retreat_id
     and h.roster_driven
     and not h.locked
     and h.people_count = 0
     and h.subgroup_name is null
     and h.notes is null;
end $$;

revoke all on function public.sync_retreat_housing_from_roster(uuid) from public, anon;

-- ─── Portal: add names ───────────────────────────────────────────────────────
-- p_guests is an array of {full_name, subgroup, gender, dietary, needs_accessible, notes}.
-- p_replace is for the "I re-uploaded my spreadsheet" case; it only clears guests that are
-- still unassigned, so a re-upload never silently undoes rooming work already done.
create or replace function public.portal_save_roster(
  p_token text, p_guests jsonb, p_submitted_by text default null, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r retreats; g jsonb; v_added int := 0; v_next int;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;
  if jsonb_typeof(p_guests) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Expected a list of guests.');
  end if;
  -- A coordinator pasting a spreadsheet column can paste far more than they meant to.
  if jsonb_array_length(p_guests) > 500 then
    return jsonb_build_object('ok', false, 'error', 'That is more than 500 names. Please split it up.');
  end if;

  if p_replace then
    delete from retreat_guests where retreat_id = r.id and location_id is null;
  end if;

  select coalesce(max(sort_order), 0) into v_next from retreat_guests where retreat_id = r.id;

  for g in select * from jsonb_array_elements(p_guests) loop
    continue when coalesce(btrim(g->>'full_name'), '') = '';
    v_next := v_next + 1;
    insert into retreat_guests (camp_id, retreat_id, full_name, subgroup, gender, dietary,
                                needs_accessible, notes, sort_order)
    values (r.camp_id, r.id,
            left(btrim(g->>'full_name'), 120),
            nullif(btrim(coalesce(g->>'subgroup', '')), ''),
            nullif(btrim(coalesce(g->>'gender', '')), ''),
            nullif(btrim(coalesce(g->>'dietary', '')), ''),
            coalesce((g->>'needs_accessible')::boolean, false),
            nullif(btrim(coalesce(g->>'notes', '')), ''),
            v_next);
    v_added := v_added + 1;
  end loop;

  perform sync_retreat_housing_from_roster(r.id);
  return jsonb_build_object('ok', true, 'added', v_added,
                            'total', (select count(*) from retreat_guests where retreat_id = r.id));
end $$;

-- ─── Portal: edit one guest ──────────────────────────────────────────────────
create or replace function public.portal_update_guest(
  p_token text, p_guest_id uuid, p_full_name text default null, p_subgroup text default null,
  p_gender text default null, p_dietary text default null,
  p_needs_accessible boolean default null, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r retreats;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;

  update retreat_guests
     set full_name        = coalesce(nullif(btrim(p_full_name), ''), full_name),
         subgroup         = case when p_subgroup is null then subgroup else nullif(btrim(p_subgroup), '') end,
         gender           = case when p_gender   is null then gender   else nullif(btrim(p_gender), '')   end,
         dietary          = case when p_dietary  is null then dietary  else nullif(btrim(p_dietary), '')  end,
         needs_accessible = coalesce(p_needs_accessible, needs_accessible),
         notes            = case when p_notes    is null then notes    else nullif(btrim(p_notes), '')    end
   where id = p_guest_id and retreat_id = r.id;

  if not found then return jsonb_build_object('ok', false, 'error', 'That guest is not on this roster.'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─── Portal: place / unplace people ──────────────────────────────────────────
-- Bulk by design: the whole point of select-then-place is moving several people at once.
-- p_location_id NULL sends them back to the unassigned pile.
create or replace function public.portal_assign_guests(
  p_token text, p_guest_ids uuid[], p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r retreats; v_moved int;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;
  if exists (select 1 from retreat_housing where retreat_id = r.id and locked) then
    return jsonb_build_object('ok', false, 'error', 'The camp has locked housing for this retreat.');
  end if;

  -- The room has to be a real, retreat-available room at this camp, and not already held by
  -- a group whose stay overlaps. Checked here rather than trusted from the client, because
  -- the client is a public page.
  if p_location_id is not null then
    if not exists (
      select 1 from locations l
      where l.id = p_location_id and l.camp_id = r.camp_id
        and l.is_active and l.retreat_available
    ) then
      return jsonb_build_object('ok', false, 'error', 'That room is not available for retreats.');
    end if;
    if exists (
      select 1 from retreat_housing rh
      join retreats o on o.id = rh.retreat_id
      where rh.location_id = p_location_id
        and o.id <> r.id and o.camp_id = r.camp_id and o.status <> 'cancelled'
        and o.arrival_date < r.departure_date and o.departure_date > r.arrival_date
    ) then
      return jsonb_build_object('ok', false, 'error', 'Another group is already in that room for your dates.');
    end if;
  end if;

  update retreat_guests
     set location_id = p_location_id
   where retreat_id = r.id and id = any(p_guest_ids);
  get diagnostics v_moved = row_count;

  perform sync_retreat_housing_from_roster(r.id);
  return jsonb_build_object('ok', true, 'moved', v_moved);
end $$;

-- ─── Portal: remove people ───────────────────────────────────────────────────
create or replace function public.portal_delete_guests(p_token text, p_guest_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r retreats; v_deleted int;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;

  delete from retreat_guests where retreat_id = r.id and id = any(p_guest_ids);
  get diagnostics v_deleted = row_count;

  perform sync_retreat_housing_from_roster(r.id);
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end $$;

revoke all on function public.portal_save_roster(text, jsonb, text, boolean)          from public;
revoke all on function public.portal_update_guest(text, uuid, text, text, text, text, boolean, text) from public;
revoke all on function public.portal_assign_guests(text, uuid[], uuid)                from public;
revoke all on function public.portal_delete_guests(text, uuid[])                      from public;
grant execute on function public.portal_save_roster(text, jsonb, text, boolean)       to anon, authenticated;
grant execute on function public.portal_update_guest(text, uuid, text, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.portal_assign_guests(text, uuid[], uuid)             to anon, authenticated;
grant execute on function public.portal_delete_guests(text, uuid[])                   to anon, authenticated;


-- get_portal_data gains a 'guests' array and the camp's two opt-in collection flags.
-- Applied separately as migration 20260824223840_get_portal_data_with_roster; the function
-- is recreated there in full rather than patched here.

-- ─── Named and unnamed occupancy coexist ─────────────────────────────────────
-- Applied as 20260824224812_housing_unnamed_count. A room can hold both named guests and
-- people booked as a bare number, and the two must add up rather than overwrite each other:
-- a cabin holding "staff a, 5 people" that then received 5 named guests was being recorded
-- as 5, silently un-booking five beds.
alter table retreat_housing
  add column if not exists unnamed_count integer not null default 0;

comment on column retreat_housing.unnamed_count is
  'People booked into this room without names. people_count = unnamed_count + named guests.';

-- The final sync rule: occupancy is always named + unnamed, and only roster-driven rows are
-- ever recalculated. See the applied migration for the full function body.

-- The front half of the rental funnel: the part of the job that happens before a booking exists.
--
-- retreats.status already started at 'inquiry', so a retreat row was nearly a lead. What was
-- missing is pipeline behaviour. Deliberately NOT a separate CRM: a camp has fifteen to forty
-- groups a year, not four thousand leads, and a kanban with next-actions plus a contact log is
-- the entire job. Anything more goes unused.

alter table retreats add column if not exists lead_stage       text not null default 'won';
alter table retreats add column if not exists lead_source      text;
alter table retreats add column if not exists lost_reason      text;
alter table retreats add column if not exists next_action      text;
alter table retreats add column if not exists next_action_on   date;
alter table retreats add column if not exists owner_id         uuid;
alter table retreats add column if not exists estimated_value  numeric;
alter table retreats add column if not exists date_flexibility text;
alter table retreats add column if not exists intake_notes     text;

-- Existing rows are real bookings, not leads: anything already past inquiry is won.
update retreats set lead_stage = case when status = 'inquiry' then 'new' else 'won' end
where lead_stage = 'won' and status = 'inquiry';

alter table retreats drop constraint if exists retreats_lead_stage_check;
alter table retreats add constraint retreats_lead_stage_check
  check (lead_stage in ('new','qualifying','proposal','contract_out','won','lost'));

comment on column retreats.next_action is
  'The single most important field in any small pipeline. Without "follow up Tuesday", a CRM is just a list.';
comment on column retreats.date_flexibility is
  'A lead says "any weekend in October" before it says October 10th. Free text on purpose -- parsing it would discard what they actually said.';

create index if not exists retreats_lead_idx on retreats (camp_id, lead_stage, next_action_on);

-- A lead has no dates yet, or fuzzy ones. Relax the NOT NULLs, but only for inquiries, so every
-- downstream assumption about a confirmed retreat stays intact.
alter table retreats alter column arrival_date   drop not null;
alter table retreats alter column departure_date drop not null;

alter table retreats drop constraint if exists retreats_dates_when_confirmed;
alter table retreats add constraint retreats_dates_when_confirmed check (
  status = 'inquiry' or (arrival_date is not null and departure_date is not null)
);

comment on constraint retreats_dates_when_confirmed on retreats is
  'Dates may be absent while this is only an inquiry. The moment it becomes a real booking they are required again -- the housing board, the kitchen and the invoice all assume they exist.';

-- A group is several people ------------------------------------------------------
create table if not exists retreat_contacts (
  id         uuid primary key default gen_random_uuid(),
  camp_id    uuid not null references camps(id) on delete cascade,
  retreat_id uuid not null references retreats(id) on delete cascade,
  name       text not null,
  role       text,
  email      text,
  phone      text,
  is_primary boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists retreat_contacts_retreat_idx on retreat_contacts (retreat_id);

comment on table retreat_contacts is
  'A group has a coordinator, a rabbi and a treasurer. retreats.coordinator_* stays as the one the portal emails; this is everyone else.';

create table if not exists retreat_touchpoints (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references camps(id) on delete cascade,
  retreat_id  uuid not null references retreats(id) on delete cascade,
  kind        text not null default 'note',
  occurred_at timestamptz not null default now(),
  summary     text not null,
  by_user_id  uuid,
  by_name     text,
  created_at  timestamptz not null default now()
);
create index if not exists retreat_touchpoints_retreat_idx on retreat_touchpoints (retreat_id, occurred_at desc);

alter table retreat_touchpoints drop constraint if exists retreat_touchpoints_kind_check;
alter table retreat_touchpoints add constraint retreat_touchpoints_kind_check
  check (kind in ('call','email','meeting','site_visit','note'));

alter table retreat_contacts    enable row level security;
alter table retreat_touchpoints enable row level security;
drop policy if exists retreat_contacts_rw on retreat_contacts;
create policy retreat_contacts_rw on retreat_contacts
  for all using (is_camp_member(camp_id)) with check (is_camp_member(camp_id));
drop policy if exists retreat_touchpoints_rw on retreat_touchpoints;
create policy retreat_touchpoints_rw on retreat_touchpoints
  for all using (is_camp_member(camp_id)) with check (is_camp_member(camp_id));

alter table retreat_contacts    replica identity full;
alter table retreat_touchpoints replica identity full;

-- Add-ons: the only upsell surface in the product ---------------------------------
-- retreat_charges already existed but was ad-hoc, so every camp retypes "linens, $8/person"
-- forty times a year. A catalog makes charges reusable, proposals fast, and lets the portal
-- OFFER them.
create table if not exists retreat_addon_catalog (
  id            uuid primary key default gen_random_uuid(),
  camp_id       uuid not null references camps(id) on delete cascade,
  name          text not null,
  description   text,
  unit          text not null default 'per_person',
  rate          numeric not null default 0,
  guest_selectable boolean not null default false,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists retreat_addon_catalog_camp_idx on retreat_addon_catalog (camp_id, is_active, sort_order);

alter table retreat_addon_catalog drop constraint if exists retreat_addon_unit_check;
alter table retreat_addon_catalog add constraint retreat_addon_unit_check
  check (unit in ('per_person','per_night','per_person_night','per_unit','flat'));

alter table retreat_charges add column if not exists addon_id uuid references retreat_addon_catalog(id) on delete set null;
alter table retreat_charges add column if not exists requested_by_guest boolean not null default false;

alter table retreat_addon_catalog enable row level security;
drop policy if exists retreat_addon_catalog_read on retreat_addon_catalog;
create policy retreat_addon_catalog_read on retreat_addon_catalog for select using (is_camp_member(camp_id));
drop policy if exists retreat_addon_catalog_write on retreat_addon_catalog;
create policy retreat_addon_catalog_write on retreat_addon_catalog
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

alter table retreat_addon_catalog replica identity full;

-- Proposals: the document that wins the booking ------------------------------------
-- Between an inquiry and a contract there is a document, and the product had nothing there. The
-- camp wrote it in Word, emailed a PDF and lost the thread. viewed_at alone justifies this
-- table -- knowing they opened it on Tuesday changes the follow-up call.
create table if not exists retreat_proposals (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  retreat_id   uuid not null references retreats(id) on delete cascade,
  version      integer not null default 1,
  line_items   jsonb not null default '[]'::jsonb,   -- same shape as retreat_invoices.line_items
  total        numeric not null default 0,
  valid_until  date,
  terms        text,
  intro        text,
  status       text not null default 'draft',
  sent_at      timestamptz,
  viewed_at    timestamptz,
  accepted_at  timestamptz,
  accepted_by_name text,
  declined_at  timestamptz,
  decline_reason text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists retreat_proposals_retreat_idx on retreat_proposals (retreat_id, version desc);

alter table retreat_proposals drop constraint if exists retreat_proposals_status_check;
alter table retreat_proposals add constraint retreat_proposals_status_check
  check (status in ('draft','sent','viewed','accepted','declined','expired'));

alter table retreat_proposals enable row level security;
drop policy if exists retreat_proposals_rw on retreat_proposals;
create policy retreat_proposals_rw on retreat_proposals
  for all using (is_camp_member(camp_id)) with check (is_camp_member(camp_id));

alter table retreat_proposals replica identity full;

-- Build the lines from what we already know, rather than asking the camp to retype them.
create or replace function public.build_proposal_lines(p_retreat_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  r retreats; v_nights int; v_people int; v_lines jsonb := '[]'::jsonb; v_base numeric := 0;
begin
  select * into r from retreats where id = p_retreat_id;
  if r.id is null or not is_camp_member(r.camp_id) then raise exception 'Forbidden'; end if;

  v_people := coalesce(r.final_headcount, r.headcount, 0);
  v_nights := greatest(coalesce(r.departure_date - r.arrival_date, 1), 1);

  if r.pricing_model = 'per_person_night' then
    v_base := coalesce(r.rate_per_person_night,0) * v_people * v_nights;
    v_lines := v_lines || jsonb_build_object(
      'description', v_people || ' people × ' || v_nights || ' nights @ $'
                     || to_char(coalesce(r.rate_per_person_night,0), 'FM999999.00') || '/person/night',
      'amount', v_base);
  elsif r.pricing_model = 'per_cabin_night' then
    v_base := coalesce(r.flat_rate,0) * v_nights;
    v_lines := v_lines || jsonb_build_object(
      'description', 'Cabin rate × ' || v_nights || ' nights', 'amount', v_base);
  else
    v_base := coalesce(r.flat_rate,0);
    v_lines := v_lines || jsonb_build_object('description', 'Facility fee', 'amount', v_base);
  end if;

  for v_base in select 1 loop exit; end loop;   -- keep the loop variable honest

  return v_lines || coalesce((
    select jsonb_agg(jsonb_build_object('description', c.description, 'amount', c.amount))
    from retreat_charges c where c.retreat_id = p_retreat_id
  ), '[]'::jsonb);
end;
$fn$;

grant execute on function public.build_proposal_lines(uuid) to authenticated;

-- Portal: view and accept ------------------------------------------------------
-- Delivered through the portal link the group already has, so accepting is one button rather
-- than a printed signature.
create or replace function public.portal_proposal(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; v_p retreat_proposals;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return null; end if;

  select * into v_p from retreat_proposals
   where retreat_id = v_retreat.id and status in ('sent','viewed','accepted','declined')
   order by version desc limit 1;
  if v_p.id is null then return null; end if;

  if v_p.status = 'sent' then
    update retreat_proposals set status = 'viewed', viewed_at = coalesce(viewed_at, now())
     where id = v_p.id;
    v_p.status := 'viewed';
  end if;

  return jsonb_build_object(
    'id', v_p.id, 'version', v_p.version, 'line_items', v_p.line_items, 'total', v_p.total,
    'valid_until', v_p.valid_until, 'terms', v_p.terms, 'intro', v_p.intro, 'status', v_p.status,
    'accepted_at', v_p.accepted_at, 'group_name', v_retreat.group_name,
    'arrival', v_retreat.arrival_date, 'departure', v_retreat.departure_date);
end;
$fn$;

create or replace function public.portal_accept_proposal(
  p_token text, p_proposal_id uuid, p_name text
) returns void language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; v_p retreat_proposals;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;

  select * into v_p from retreat_proposals where id = p_proposal_id and retreat_id = v_retreat.id;
  if v_p.id is null then raise exception 'That proposal is not on this booking.' using errcode='22023'; end if;
  if v_p.status = 'accepted' then return; end if;
  if v_p.valid_until is not null and v_p.valid_until < current_date then
    raise exception 'This proposal has expired. Ask the camp for a new one.' using errcode='22023';
  end if;
  if coalesce(btrim(p_name),'') = '' then
    raise exception 'Please type your name to accept.' using errcode='22023';
  end if;

  update retreat_proposals
     set status = 'accepted', accepted_at = now(), accepted_by_name = left(btrim(p_name), 120)
   where id = p_proposal_id;

  -- Accepting closes the funnel on itself: the inquiry becomes a booking.
  update retreats set lead_stage = 'won',
                      status = case when status = 'inquiry' then 'confirmed' else status end,
                      updated_at = now()
   where id = v_retreat.id;
end;
$fn$;

grant execute on function public.portal_proposal(text) to anon, authenticated;
grant execute on function public.portal_accept_proposal(text, uuid, text) to anon, authenticated;

-- What the portal may offer, and what a group asks for -----------------------------
create or replace function public.portal_addons(p_token text)
returns jsonb language sql security definer stable set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name', a.name, 'description', a.description,
           'unit', a.unit, 'rate', a.rate,
           'requested', exists (
             select 1 from retreat_charges c
             where c.addon_id = a.id
               and c.retreat_id = (select id from retreats where portal_token = p_token))
         ) order by a.sort_order, a.name), '[]'::jsonb)
  from retreat_addon_catalog a
  where a.camp_id = (select camp_id from retreats where portal_token = p_token)
    and a.is_active and a.guest_selectable;
$fn$;

create or replace function public.portal_request_addon(
  p_token text, p_addon_id uuid, p_qty numeric default 1, p_wanted boolean default true
) returns void language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; a retreat_addon_catalog; v_qty numeric; v_nights int; v_people int;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;

  select * into a from retreat_addon_catalog
   where id = p_addon_id and camp_id = v_retreat.camp_id and is_active and guest_selectable;
  if a.id is null then raise exception 'That extra is not available.' using errcode='22023'; end if;

  if not p_wanted then
    delete from retreat_charges
     where retreat_id = v_retreat.id and addon_id = p_addon_id and requested_by_guest;
    return;
  end if;

  v_people := coalesce(v_retreat.final_headcount, v_retreat.headcount, 0);
  v_nights := greatest(coalesce(v_retreat.departure_date - v_retreat.arrival_date, 1), 1);
  v_qty := case a.unit
             when 'per_person'       then v_people
             when 'per_night'        then v_nights
             when 'per_person_night' then v_people * v_nights
             else greatest(coalesce(p_qty,1), 1) end;

  insert into retreat_charges (id, camp_id, retreat_id, description, qty, unit_rate, amount,
                               sort_order, addon_id, requested_by_guest, created_at, updated_at)
  select gen_random_uuid(), v_retreat.camp_id, v_retreat.id, a.name, v_qty, a.rate,
         v_qty * a.rate, 100, a.id, true, now(), now()
  where not exists (
    select 1 from retreat_charges c where c.retreat_id = v_retreat.id and c.addon_id = a.id
  );
end;
$fn$;

grant execute on function public.portal_addons(text) to anon, authenticated;
grant execute on function public.portal_request_addon(text, uuid, numeric, boolean) to anon, authenticated;

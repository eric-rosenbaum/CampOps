-- A crew and a trade were the same idea wearing two names.
--
-- `camp_trades` classified WORK ("this is housekeeping"). `staff_groups` classified PEOPLE
-- ("Maria is on Housekeeping"). Camps maintained both lists, in two different screens, and the
-- one camp here that made crews named them Housekeeping and Tech -- two of its own trades. They
-- were already using them as one thing.
--
-- So staff_groups becomes the single list, and it keeps the `key` that everything filing work by
-- trade already writes (issues.trade, work_routing.trade, work_schedules.trade,
-- service_vendors.trade, work_checklist_templates.trade). Nothing that references a trade by
-- text has to change; the row it points at just has members now.
--
-- The one thing this cannot inherit is the cardinality. A trade is a kind of work and a camp has
-- five of them; a crew was ONE per person (camp_members.staff_group_id, a single uuid). Merged
-- under that rule, a camp with three staff who all do everything could not keep five categories
-- of work -- it would have to invent two staff or collapse to three trades. So membership
-- becomes many-to-many, and Sam can be on Maintenance, Grounds and Tech at once, which is what
-- Sam actually does.

-- ── The list ────────────────────────────────────────────────────────────────
alter table public.staff_groups
  add column if not exists key        text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active  boolean not null default true;

comment on column public.staff_groups.key is
  'Stable slug written to issues.trade / work_routing.trade / work_schedules.trade. The name can be renamed freely; this is what the rows point at.';

-- ── Membership, many-to-many ────────────────────────────────────────────────
create table if not exists public.staff_group_members (
  camp_id        uuid not null references public.camps(id)        on delete cascade,
  staff_group_id uuid not null references public.staff_groups(id) on delete cascade,
  user_id        uuid not null references auth.users(id)          on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (staff_group_id, user_id)
);
create index if not exists staff_group_members_user_idx on public.staff_group_members (camp_id, user_id);

comment on table public.staff_group_members is
  'Which crews a person is on. Many-to-many on purpose: at a small camp one person is the whole maintenance, grounds and tech crew, and forcing a single crew would cost that camp its work categories.';

-- ── Backfill: every existing crew gets a key ────────────────────────────────
-- Slug of the name, which is exactly how camp_trades keyed its own rows, so a crew named
-- "Housekeeping" lands on the same key the work orders already carry.
update public.staff_groups g
   set key = regexp_replace(lower(btrim(g.name)), '[^a-z0-9]+', '_', 'g')
 where g.key is null;

-- ── Backfill: every trade that has no crew becomes one ──────────────────────
insert into public.staff_groups (camp_id, name, key, sort_order, is_active,
                                 issues_see_unassigned, can_view_camper_health)
select t.camp_id, t.label, t.key, t.sort_order, t.is_active, true, false
  from public.camp_trades t
 where not exists (
   select 1 from public.staff_groups g
    where g.camp_id = t.camp_id
      and (g.key = t.key
           or regexp_replace(lower(btrim(g.name)), '[^a-z0-9]+', '_', 'g') = t.key)
 );

-- Where a crew and a trade were the same thing under slightly different spelling, the crew keeps
-- its own name and adopts the trade's key -- the key is what the work orders point at, so it is
-- the half that cannot move.
update public.staff_groups g
   set key = t.key, sort_order = t.sort_order
  from public.camp_trades t
 where t.camp_id = g.camp_id
   and g.key is distinct from t.key
   and regexp_replace(lower(btrim(g.name)), '[^a-z0-9]+', '_', 'g') = t.key;

alter table public.staff_groups alter column key set not null;
create unique index if not exists staff_groups_camp_key_uniq on public.staff_groups (camp_id, key);

-- ── Backfill: the one crew each person had becomes their first crew ─────────
insert into public.staff_group_members (camp_id, staff_group_id, user_id)
select m.camp_id, m.staff_group_id, m.user_id
  from public.camp_members m
 where m.staff_group_id is not null
on conflict do nothing;

comment on column public.camp_members.staff_group_id is
  'DEPRECATED -- superseded by staff_group_members, which allows more than one crew. Kept so a rollback has something to read; nothing writes it.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.staff_group_members enable row level security;

drop policy if exists staff_group_members_read on public.staff_group_members;
create policy staff_group_members_read on public.staff_group_members
  for select using (is_camp_member(camp_id));

drop policy if exists staff_group_members_write on public.staff_group_members;
create policy staff_group_members_write on public.staff_group_members
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

grant select on public.staff_group_members to authenticated;
grant insert, update, delete on public.staff_group_members to authenticated;

-- ── Camper health follows the new membership ────────────────────────────────
-- This one is real RLS, not a UI hint, and it is the only gate on camper names and allergy
-- severities. It read camp_members.staff_group_id; that column is now frozen, so a crew granted
-- health access after this migration would have silently stopped working.
create or replace function public.has_camper_health_access(p_camp_id uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select is_platform_admin() or exists (
    select 1
      from public.camp_members m
     where m.camp_id = p_camp_id
       and m.user_id = auth.uid()
       and m.is_active = true
       and (
         m.role = 'admin'
         or exists (
           select 1
             from public.staff_group_members sgm
             join public.staff_groups g on g.id = sgm.staff_group_id
            where sgm.user_id = m.user_id
              and sgm.camp_id = p_camp_id
              and coalesce(g.can_view_camper_health, false)
         )
       )
  );
$fn$;

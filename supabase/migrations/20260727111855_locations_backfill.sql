-- Migrate all existing physical-place data into the unified locations tree, then repoint
-- every consumer. Old tables/columns are KEPT (snapshots) for safety + iOS transition.

alter table public.locations add column _src_building_id uuid;
alter table public.locations add column _src_room_id uuid;
alter table public.locations add column _src_space_id uuid;

-- 1) buildings -> top-level location nodes
insert into public.locations (camp_id, name, category_id, is_dorm, sort_order, notes, _src_building_id)
select b.camp_id, b.name,
  (select id from public.location_categories lc where lc.camp_id=b.camp_id and lc.name =
     case b.type when 'cabin' then 'Housing' when 'dining_hall' then 'Dining' when 'kitchen' then 'Dining'
       when 'infirmary' then 'Health & Safety' when 'office' then 'Admin' when 'activity' then 'Program'
       when 'storage' then 'Maintenance' when 'utility' then 'Maintenance' when 'bathhouse' then 'Housing'
       else 'Other' end),
  (b.type='cabin'), coalesce(b.sort_order,0), b.notes, b.id
from public.buildings b;

insert into public.building_details (location_id, camp_id, building_type, main_water_shutoff, main_electrical_panel, main_gas_shutoff, year_built)
select l.id, b.camp_id, b.type, b.main_water_shutoff, b.main_electrical_panel, b.main_gas_shutoff, b.year_built
from public.buildings b join public.locations l on l._src_building_id = b.id;

-- 2) building_rooms -> child nodes
insert into public.locations (camp_id, parent_id, name, sort_order, notes, _src_room_id)
select r.camp_id, l.id, r.name, coalesce(r.sort_order,0), r.notes, r.id
from public.building_rooms r join public.locations l on l._src_building_id = r.building_id;

-- 3) retreat_spaces -> dorm nodes (3a dedup by name, 3b create new)
update public.locations l set is_dorm=true, retreat_available=true,
  bed_capacity=s.bed_capacity, accessible=s.accessible, notes=coalesce(l.notes, s.notes), _src_space_id=s.id
from public.retreat_spaces s
where l.camp_id=s.camp_id and lower(l.name)=lower(s.name) and l.parent_id is null and l._src_space_id is null;
insert into public.locations (camp_id, name, category_id, is_dorm, retreat_available, bed_capacity, accessible, sort_order, notes, _src_space_id)
select s.camp_id, s.name,
  (select id from public.location_categories lc where lc.camp_id=s.camp_id and lc.name='Housing'),
  true, true, s.bed_capacity, s.accessible, coalesce(s.sort_order,0), s.notes, s.id
from public.retreat_spaces s
where not exists (select 1 from public.locations l where l._src_space_id = s.id);

-- 4) camps.locations strings -> nodes (skip existing names)
insert into public.locations (camp_id, name, category_id, sort_order)
select c.id, x.name,
  (select id from public.location_categories lc where lc.camp_id=c.id and lc.name='Other'), (x.ord)::int
from public.camps c
cross join lateral (
  select (elem #>> '{}') as name, ord
  from jsonb_array_elements(coalesce(c.locations,'[]'::jsonb)) with ordinality as t(elem, ord)
) x
where coalesce(x.name,'') <> ''
  and not exists (select 1 from public.locations l where l.camp_id=c.id and lower(l.name)=lower(x.name));

-- 5) building_components -> location_id
alter table public.building_components add column location_id uuid references public.locations(id) on delete cascade;
update public.building_components bc set location_id = coalesce(
  (select l.id from public.locations l where l._src_room_id = bc.room_id),
  (select l.id from public.locations l where l._src_building_id = bc.building_id));
alter table public.building_components alter column building_id drop not null;

-- 6) building_seasonal_tasks -> location_id
alter table public.building_seasonal_tasks add column location_id uuid references public.locations(id) on delete cascade;
update public.building_seasonal_tasks t set location_id = (select l.id from public.locations l where l._src_building_id = t.building_id);

-- 7) retreat_housing -> location_id
alter table public.retreat_housing add column location_id uuid references public.locations(id) on delete set null;
update public.retreat_housing rh set location_id = (select l.id from public.locations l where l._src_space_id = rh.space_id);

-- 8) issues.location_ids
alter table public.issues add column location_ids uuid[] not null default '{}';
update public.issues i set location_ids = coalesce((
  select array_agg(l.id) from public.locations l
  where l.camp_id=i.camp_id and lower(l.name) = any(select lower(x) from unnest(i.locations) x)), '{}');

-- 9) checklist_tasks.location_ids
alter table public.checklist_tasks add column location_ids uuid[] not null default '{}';
update public.checklist_tasks t set location_ids = coalesce((
  select array_agg(l.id) from public.locations l
  where l.camp_id=t.camp_id and lower(l.name) = any(select lower(x) from unnest(t.locations) x)), '{}');

-- 10) safety_items + camp_assets single location_id (keep text snapshot)
alter table public.safety_items add column location_id uuid references public.locations(id) on delete set null;
update public.safety_items s set location_id =
  (select l.id from public.locations l where l.camp_id=s.camp_id and lower(l.name)=lower(s.location) limit 1)
  where coalesce(s.location,'') <> '';
alter table public.camp_assets add column location_id uuid references public.locations(id) on delete set null;
update public.camp_assets a set location_id =
  (select l.id from public.locations l where l.camp_id=a.camp_id and lower(l.name)=lower(a.storage_location) limit 1)
  where coalesce(a.storage_location,'') <> '';

alter table public.locations drop column _src_building_id;
alter table public.locations drop column _src_room_id;
alter table public.locations drop column _src_space_id;

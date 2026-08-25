-- UNIFIED LOCATIONS, core schema. One nestable, categorized tree per camp that becomes
-- the single source of truth for every physical place (feeds issues, tasks, safety, assets,
-- retreats, building systems). Additive: old columns/tables are kept and backfilled next.

create table public.location_categories (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_preset boolean not null default false,
  created_at timestamptz not null default now(),
  unique (camp_id, name)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  parent_id uuid references public.locations(id) on delete cascade,
  name text not null,
  category_id uuid references public.location_categories(id) on delete set null,
  is_dorm boolean not null default false,
  retreat_available boolean not null default false,
  bed_capacity integer,
  accessible boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_camp_idx on public.locations(camp_id);
create index locations_parent_idx on public.locations(parent_id);
create index locations_retreat_idx on public.locations(camp_id) where is_dorm and retreat_available;

create table public.building_details (
  location_id uuid primary key references public.locations(id) on delete cascade,
  camp_id uuid not null references public.camps(id) on delete cascade,
  building_type text,
  main_water_shutoff text,
  main_electrical_panel text,
  main_gas_shutoff text,
  year_built integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.location_categories enable row level security;
alter table public.locations enable row level security;
alter table public.building_details enable row level security;

create policy loc_cat_select on public.location_categories for select using (is_camp_member(camp_id));
create policy loc_cat_manage on public.location_categories for all
  using (is_camp_member(camp_id) and get_camp_role(camp_id) = any(array['admin','staff']))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) = any(array['admin','staff']));

create policy loc_select on public.locations for select using (is_camp_member(camp_id));
create policy loc_manage on public.locations for all
  using (is_camp_member(camp_id) and get_camp_role(camp_id) = any(array['admin','staff']))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) = any(array['admin','staff']));

create policy bd_select on public.building_details for select using (is_camp_member(camp_id));
create policy bd_manage on public.building_details for all
  using (is_camp_member(camp_id) and get_camp_role(camp_id) = any(array['admin','staff']))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) = any(array['admin','staff']));

create trigger loc_updated before update on public.locations for each row execute function public.update_updated_at();
create trigger bd_updated before update on public.building_details for each row execute function public.update_updated_at();

alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.location_categories;
alter publication supabase_realtime add table public.building_details;
alter table public.locations replica identity full;
alter table public.location_categories replica identity full;
alter table public.building_details replica identity full;

create or replace function public.seed_location_categories(p_camp_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cats text[] := array['Housing','Dining','Waterfront','Athletics','Health & Safety','Program','Admin','Maintenance','Outdoor','Other'];
  c text; i int := 0;
begin
  foreach c in array cats loop
    insert into public.location_categories(camp_id, name, sort_order, is_preset)
    values (p_camp_id, c, i, true) on conflict (camp_id, name) do nothing;
    i := i + 1;
  end loop;
end $$;

do $$ declare r record; begin
  for r in select id from public.camps loop perform public.seed_location_categories(r.id); end loop;
end $$;

create or replace function public.seed_camp_locations_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.seed_location_categories(new.id); return new; end $$;
drop trigger if exists seed_categories_on_camp on public.camps;
create trigger seed_categories_on_camp after insert on public.camps for each row execute function public.seed_camp_locations_trg();

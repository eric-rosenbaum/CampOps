-- Pool Management tables

create table if not exists pool_chemical_readings (
  id text primary key,
  free_chlorine numeric not null,
  ph numeric not null,
  alkalinity numeric not null,
  cyanuric_acid numeric not null,
  water_temp numeric not null,
  calcium_hardness numeric,
  time_of_day text not null,
  logged_by_id text not null,
  logged_by_name text not null,
  corrective_action text,
  pool_status text not null default 'open_all_clear'
    check (pool_status in ('open_all_clear', 'open_monitoring', 'closed_corrective', 'closed_retest')),
  created_at timestamptz default now()
);

create table if not exists pool_equipment (
  id text primary key,
  name text not null,
  type text not null check (type in ('pump', 'filter', 'heater', 'chlorinator', 'safety', 'other')),
  status text not null check (status in ('ok', 'warn', 'alert')),
  status_detail text not null default '',
  last_serviced date,
  next_service_due date,
  vendor text,
  specs text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists pool_service_log (
  id text primary key,
  equipment_id text references pool_equipment(id) on delete cascade,
  service_type text not null
    check (service_type in ('routine_maintenance', 'repair', 'inspection', 'part_replacement', 'vendor_service')),
  date_performed date not null,
  performed_by text not null,
  notes text,
  cost numeric,
  next_service_due date,
  created_at timestamptz default now()
);

create table if not exists pool_inspections (
  id text primary key,
  name text not null,
  frequency text not null,
  authority text not null,
  standard text,
  status text not null check (status in ('ok', 'due', 'overdue')),
  last_completed date,
  next_due date,
  history text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists pool_inspection_log (
  id text primary key,
  inspection_id text references pool_inspections(id) on delete cascade,
  inspection_date date not null,
  conducted_by text not null,
  result text not null check (result in ('passed', 'passed_with_notes', 'conditional', 'failed')),
  notes text,
  next_due date,
  created_at timestamptz default now()
);

create table if not exists pool_seasonal_tasks (
  id text primary key,
  title text not null,
  detail text,
  phase text not null check (phase in ('opening', 'in_season', 'closing')),
  is_complete boolean not null default false,
  completed_by text,
  completed_date date,
  assignees text[] default '{}',
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security
alter table pool_chemical_readings enable row level security;
alter table pool_equipment enable row level security;
alter table pool_service_log enable row level security;
alter table pool_inspections enable row level security;
alter table pool_inspection_log enable row level security;
alter table pool_seasonal_tasks enable row level security;

-- Permissive policies for MVP
create policy "Allow all on pool_chemical_readings" on pool_chemical_readings for all using (true) with check (true);
create policy "Allow all on pool_equipment" on pool_equipment for all using (true) with check (true);
create policy "Allow all on pool_service_log" on pool_service_log for all using (true) with check (true);
create policy "Allow all on pool_inspections" on pool_inspections for all using (true) with check (true);
create policy "Allow all on pool_inspection_log" on pool_inspection_log for all using (true) with check (true);
create policy "Allow all on pool_seasonal_tasks" on pool_seasonal_tasks for all using (true) with check (true);

-- updated_at triggers
create trigger pool_equipment_updated_at before update on pool_equipment
  for each row execute function update_updated_at();

create trigger pool_inspections_updated_at before update on pool_inspections
  for each row execute function update_updated_at();

create trigger pool_seasonal_tasks_updated_at before update on pool_seasonal_tasks
  for each row execute function update_updated_at();

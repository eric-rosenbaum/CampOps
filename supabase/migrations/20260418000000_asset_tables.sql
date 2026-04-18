-- Assets & Vehicles tables

create table if not exists camp_assets (
  id text primary key,
  name text not null,
  category text not null check (category in ('vehicle', 'golf_cart', 'watercraft', 'large_equipment', 'trailer', 'other')),
  subtype text not null,
  make text,
  model text,
  year int,
  serial_number text,
  license_plate text,
  registration_expiry date,
  storage_location text not null default '',
  status text not null default 'available'
    check (status in ('available', 'checked_out', 'in_service', 'retired')),
  current_odometer numeric,
  current_hours numeric,
  tracks_odometer boolean not null default false,
  tracks_hours boolean not null default false,
  notes text,
  is_active boolean not null default true,
  -- Watercraft fields
  hull_id text,
  uscg_registration text,
  uscg_registration_expiry date,
  capacity int,
  motor_type text,
  has_lifejackets boolean,
  lifejacket_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists asset_checkouts (
  id text primary key,
  asset_id text not null references camp_assets(id) on delete cascade,
  checked_out_by text not null,
  purpose text not null,
  checked_out_at timestamptz not null,
  expected_return_at timestamptz not null,
  returned_at timestamptz,
  start_odometer numeric,
  end_odometer numeric,
  start_hours numeric,
  end_hours numeric,
  fuel_level_out text check (fuel_level_out in ('empty', 'quarter', 'half', 'three_quarter', 'full')),
  fuel_level_in text check (fuel_level_in in ('empty', 'quarter', 'half', 'three_quarter', 'full')),
  checkout_notes text,
  return_notes text,
  return_condition text check (return_condition in ('no_issues', 'minor_note', 'needs_attention')),
  created_issue_id text,
  logged_by text not null default '',
  created_at timestamptz default now()
);

create table if not exists asset_service_records (
  id text primary key,
  asset_id text not null references camp_assets(id) on delete cascade,
  service_type text not null,
  date_performed date not null,
  performed_by text not null,
  vendor text,
  description text,
  odometer_at_service numeric,
  hours_at_service numeric,
  cost numeric,
  next_service_date date,
  next_service_odometer numeric,
  next_service_hours numeric,
  is_inspection boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists asset_maintenance_tasks (
  id text primary key,
  asset_id text not null references camp_assets(id) on delete cascade,
  phase text not null check (phase in ('pre_season', 'in_season', 'post_season')),
  title text not null,
  detail text,
  is_complete boolean not null default false,
  completed_by text,
  completed_date date,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for common queries
create index if not exists asset_checkouts_asset_id_idx on asset_checkouts(asset_id);
create index if not exists asset_checkouts_returned_at_idx on asset_checkouts(returned_at) where returned_at is null;
create index if not exists asset_service_records_asset_id_idx on asset_service_records(asset_id);
create index if not exists asset_maintenance_tasks_asset_id_idx on asset_maintenance_tasks(asset_id);

-- Enable realtime
alter publication supabase_realtime add table camp_assets;
alter publication supabase_realtime add table asset_checkouts;
alter publication supabase_realtime add table asset_service_records;
alter publication supabase_realtime add table asset_maintenance_tasks;

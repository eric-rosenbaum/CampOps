-- CampOps initial schema

-- users (simplified, no real auth)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('doe', 'facilities_manager', 'maintenance_staff')),
  initials text not null,
  created_at timestamptz default now()
);

-- seasons
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opening_date date not null,
  closing_date date not null,
  created_at timestamptz default now()
);

-- issues
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text not null,
  priority text not null check (priority in ('urgent', 'high', 'normal')),
  status text not null check (status in ('unassigned', 'assigned', 'in_progress', 'resolved')),
  assignee_id uuid references users(id),
  reported_by_id uuid references users(id),
  estimated_cost_display text,
  estimated_cost_value numeric,
  actual_cost numeric,
  photo_url text,
  due_date date,
  is_recurring boolean default false,
  recurring_interval text check (recurring_interval in ('daily', 'weekly', 'monthly', 'annually')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- issue_activity
create table if not exists issue_activity (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references issues(id) on delete cascade,
  user_id uuid references users(id),
  user_name text not null,
  action text not null,
  created_at timestamptz default now()
);

-- checklist_tasks
create table if not exists checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text not null,
  priority text not null check (priority in ('urgent', 'high', 'normal')),
  status text not null check (status in ('pending', 'in_progress', 'complete')),
  assignee_id uuid references users(id),
  phase text not null check (phase in ('pre', 'post')),
  days_relative_to_opening integer not null,
  due_date date,
  is_recurring boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- checklist_activity
create table if not exists checklist_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references checklist_tasks(id) on delete cascade,
  user_id uuid references users(id),
  user_name text not null,
  action text not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table users enable row level security;
alter table seasons enable row level security;
alter table issues enable row level security;
alter table issue_activity enable row level security;
alter table checklist_tasks enable row level security;
alter table checklist_activity enable row level security;

-- Permissive policies for MVP (all reads/writes OK)
create policy "Allow all on users" on users for all using (true) with check (true);
create policy "Allow all on seasons" on seasons for all using (true) with check (true);
create policy "Allow all on issues" on issues for all using (true) with check (true);
create policy "Allow all on issue_activity" on issue_activity for all using (true) with check (true);
create policy "Allow all on checklist_tasks" on checklist_tasks for all using (true) with check (true);
create policy "Allow all on checklist_activity" on checklist_activity for all using (true) with check (true);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger issues_updated_at before update on issues
  for each row execute function update_updated_at();

create trigger checklist_tasks_updated_at before update on checklist_tasks
  for each row execute function update_updated_at();

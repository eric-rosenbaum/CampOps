-- Drop and recreate all tables with text primary keys
-- (original migration used uuid which rejects short IDs like 'u1', 'i1', etc.)

drop table if exists checklist_activity cascade;
drop table if exists checklist_tasks cascade;
drop table if exists issue_activity cascade;
drop table if exists issues cascade;
drop table if exists seasons cascade;
drop table if exists users cascade;

-- users
create table users (
  id text primary key,
  name text not null,
  role text not null check (role in ('doe', 'facilities_manager', 'maintenance_staff')),
  initials text not null,
  created_at timestamptz default now()
);

-- seasons
create table seasons (
  id text primary key,
  name text not null,
  opening_date date not null,
  closing_date date not null,
  created_at timestamptz default now()
);

-- issues
create table issues (
  id text primary key,
  title text not null,
  description text,
  location text not null,
  priority text not null check (priority in ('urgent', 'high', 'normal')),
  status text not null check (status in ('unassigned', 'assigned', 'in_progress', 'resolved')),
  assignee_id text references users(id),
  reported_by_id text references users(id),
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
create table issue_activity (
  id text primary key,
  issue_id text references issues(id) on delete cascade,
  user_id text references users(id),
  user_name text not null,
  action text not null,
  created_at timestamptz default now()
);

-- checklist_tasks
create table checklist_tasks (
  id text primary key,
  title text not null,
  description text,
  location text not null,
  priority text not null check (priority in ('urgent', 'high', 'normal')),
  status text not null check (status in ('pending', 'in_progress', 'complete')),
  assignee_id text references users(id),
  phase text not null check (phase in ('pre', 'post')),
  days_relative_to_opening integer not null,
  due_date date,
  is_recurring boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- checklist_activity
create table checklist_activity (
  id text primary key,
  task_id text references checklist_tasks(id) on delete cascade,
  user_id text references users(id),
  user_name text not null,
  action text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table users enable row level security;
alter table seasons enable row level security;
alter table issues enable row level security;
alter table issue_activity enable row level security;
alter table checklist_tasks enable row level security;
alter table checklist_activity enable row level security;

-- Permissive MVP policies
create policy "Allow all on users" on users for all using (true) with check (true);
create policy "Allow all on seasons" on seasons for all using (true) with check (true);
create policy "Allow all on issues" on issues for all using (true) with check (true);
create policy "Allow all on issue_activity" on issue_activity for all using (true) with check (true);
create policy "Allow all on checklist_tasks" on checklist_tasks for all using (true) with check (true);
create policy "Allow all on checklist_activity" on checklist_activity for all using (true) with check (true);

-- updated_at triggers
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

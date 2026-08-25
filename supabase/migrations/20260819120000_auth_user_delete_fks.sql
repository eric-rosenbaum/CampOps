-- Make deleting an auth user actually possible.
--
-- Deleting a user from the Supabase dashboard failed with "Database error deleting user".
-- The cause: nine foreign keys into auth.users were declared with no ON DELETE action, so
-- Postgres refused the delete the moment the account had touched anything, reported an
-- issue, logged a pool reading, been assigned a task, issued a join code. public.delete_my_account()
-- worked around this by detaching every reference by hand before the delete, but nothing
-- outside that function could: not the dashboard, not the admin API, not a support script.
--
-- The rule the RPC already encodes is moved into the constraints themselves, so it holds no
-- matter who does the deleting. Identity goes; the camp's operating record stays, detached and
-- attributed by the name snapshot on the row. The two NOT NULL columns cannot be detached, so
-- those rows go instead. Both are credentials the departing user vouched for.

-- Attribution has to be preserved before the id disappears, and the FK action itself cannot do
-- it. delete_my_account() backfills the name snapshots first; a dashboard delete has no such
-- step, so it gets one here and both paths behave the same.
create or replace function public.backfill_deleted_user_names()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  select coalesce(
           nullif(btrim(p.full_name), ''),
           nullif(split_part(coalesce(old.email, ''), '@', 1), ''),
           'Deleted user')
    into v_name
  from (select 1) dummy
  left join profiles p on p.id = old.id;

  update issues
     set reporter_name = coalesce(nullif(btrim(reporter_name), ''), v_name)
   where reported_by_id = old.id;

  update pool_chemical_readings
     set logged_by_name = coalesce(nullif(btrim(logged_by_name), ''), v_name)
   where logged_by_id = old.id;

  return old;
end;
$$;

comment on function public.backfill_deleted_user_names() is
  'Stamps the name snapshot onto rows attributed to a user about to be deleted, so the ON DELETE SET NULL that follows does not leave the camp record anonymous.';

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.backfill_deleted_user_names();

-- Attribution and assignment columns: nullable, so the row survives without the reference.
alter table public.issues
  drop constraint issues_reported_by_id_fkey,
  add  constraint issues_reported_by_id_fkey
       foreign key (reported_by_id) references auth.users(id) on delete set null;

alter table public.issues
  drop constraint issues_assignee_id_fkey,
  add  constraint issues_assignee_id_fkey
       foreign key (assignee_id) references auth.users(id) on delete set null;

alter table public.checklist_tasks
  drop constraint checklist_tasks_assignee_id_fkey,
  add  constraint checklist_tasks_assignee_id_fkey
       foreign key (assignee_id) references auth.users(id) on delete set null;

alter table public.issue_activity
  drop constraint issue_activity_user_id_fkey,
  add  constraint issue_activity_user_id_fkey
       foreign key (user_id) references auth.users(id) on delete set null;

alter table public.checklist_activity
  drop constraint checklist_activity_user_id_fkey,
  add  constraint checklist_activity_user_id_fkey
       foreign key (user_id) references auth.users(id) on delete set null;

alter table public.pool_chemical_readings
  drop constraint pool_chemical_readings_logged_by_id_fkey,
  add  constraint pool_chemical_readings_logged_by_id_fkey
       foreign key (logged_by_id) references auth.users(id) on delete set null;

alter table public.camp_members
  drop constraint camp_members_invited_by_fkey,
  add  constraint camp_members_invited_by_fkey
       foreign key (invited_by) references auth.users(id) on delete set null;

-- NOT NULL columns: the reference cannot be dropped, so the row goes. An unaccepted invitation
-- and a join code still in circulation should not outlive the account that issued them; any
-- remaining admin can issue new ones.
alter table public.camp_invitations
  drop constraint camp_invitations_invited_by_fkey,
  add  constraint camp_invitations_invited_by_fkey
       foreign key (invited_by) references auth.users(id) on delete cascade;

alter table public.camp_join_codes
  drop constraint camp_join_codes_created_by_fkey,
  add  constraint camp_join_codes_created_by_fkey
       foreign key (created_by) references auth.users(id) on delete cascade;

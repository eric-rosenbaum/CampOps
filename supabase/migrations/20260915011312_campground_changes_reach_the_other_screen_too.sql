-- The last four tables the app subscribes to that Postgres was not replicating.
--
-- Same defect the retreats module had: `subscribeToCampground` opens a binding on each of these,
-- the binding is accepted, and it never fires -- so a vendor added on one screen, a routing rule
-- changed by an admin, a work schedule edited, or a session's dates moved all stayed invisible
-- until somebody refreshed. Issues and comments were published, which is exactly why it looked
-- like campground realtime worked.
--
-- Checked against every table in every subscribeTo* in the app: after this, nothing the client
-- listens to is missing from the publication.
do $$
declare t text;
begin
  foreach t in array array[
    'service_vendors',   -- the trades list, shared by every work order
    'work_routing',      -- who a category of job goes to
    'work_schedules',    -- the recurring-work calendar
    'camp_sessions'      -- session dates, read by campground and commissary alike
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;

    -- The camp_id=eq.<id> filter reads the old row on UPDATE/DELETE, which DEFAULT replica
    -- identity does not carry. All four are already FULL; this makes that a guarantee.
    execute format('alter table public.%I replica identity full', t);

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- The Retreats module subscribes to twenty-four tables and Postgres was only replicating
-- eighteen of them, so six of those bindings had never once fired.
--
-- retreat_guests is the one that hurt: the roster IS the thing a group edits in their portal,
-- and the camp's Housing tab only ever showed it after a manual refresh. retreat_proposals is
-- the agreement -- a group signs it and the Relationship tab still says "sent". The other four
-- are the same defect with a smaller blast radius.
--
-- REPLICA IDENTITY is already FULL on all six (every retreat table was set that way when the
-- module was built), so this is only about publication membership. The guard makes it safe to
-- re-run and safe to apply to an environment where some of them were added by hand.
do $$
declare t text;
begin
  foreach t in array array[
    'retreat_guests',        -- the group's roster, written straight from the portal
    'retreat_proposals',     -- the agreement: sent, viewed, signed
    'retreat_contacts',
    'retreat_touchpoints',
    'retreat_addon_catalog',
    'scheduled_messages'     -- the outbox; a queued email that appears only on refresh reads as lost
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;

    -- Realtime's camp_id=eq.<id> filter reads the old row on UPDATE/DELETE, which DEFAULT
    -- replica identity does not carry. Belt and braces: every one of these is already FULL.
    execute format('alter table public.%I replica identity full', t);

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

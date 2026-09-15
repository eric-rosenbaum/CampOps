-- The camp sees the group instantly; the group did not see the camp at all.
--
-- The ops app subscribes with an authenticated client, so postgres_changes works. The portal is
-- anonymous by design -- every retreat table's RLS is `is_camp_member(camp_id)`, which anon fails
-- -- so the same mechanism delivers it nothing. It fetched once on mount and then sat there: a
-- camp could approve a room, answer a question or send an invoice and the coordinator, looking
-- straight at the page, saw none of it.
--
-- So the database sends a BROADCAST instead, on a topic named after the portal token. Broadcast
-- carries no row data and needs no RLS: the payload is just the table that moved, and the client
-- answers it by re-running the same token-keyed RPCs it already uses. The topic is the portal
-- token, which is the same secret as the link itself -- knowing it is already how you read the
-- portal, and the ping alone discloses nothing.
create or replace function public.portal_broadcast_change()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_row record; v_retreat uuid; v_token text;
begin
  -- DELETE has no NEW, and touching an unassigned record raises rather than returning null.
  if TG_OP = 'DELETE' then v_row := old; else v_row := new; end if;

  if TG_TABLE_NAME = 'retreats' then v_retreat := v_row.id; else v_retreat := v_row.retreat_id; end if;
  if v_retreat is null then return null; end if;

  select portal_token into v_token from retreats where id = v_retreat;
  if coalesce(btrim(v_token), '') = '' then return null; end if;

  -- `private => false`: a private channel would need RLS on realtime.messages, and the guest has
  -- no JWT to check it against. The token in the topic is the access control.
  perform realtime.send(
    jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP),
    'changed',
    'portal:' || v_token,
    false
  );
  return null;
end;
$fn$;

comment on function public.portal_broadcast_change() is
  'AFTER trigger: pings realtime topic portal:<portal_token> so the anonymous guest portal knows to refetch. Carries no row data.';

do $$
declare t text;
begin
  foreach t in array array[
    'retreats',                 -- status, deadlines, menu published, dietary
    'retreat_space_messages',   -- the camp answering, which is what prompted this
    'retreat_space_requests',   -- approved / declined
    'retreat_change_requests',  -- replies to what the group asked
    'retreat_documents',        -- an agreement or waiver shared with them
    'retreat_invoices',
    'retreat_payments',
    'retreat_charges',
    'retreat_meals',            -- the published menu
    'retreat_housing',
    'retreat_guests',
    'retreat_proposals'         -- a new version sent
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_portal_broadcast on public.%I', t);
    execute format(
      'create trigger trg_portal_broadcast after insert or update or delete on public.%I
         for each row execute function public.portal_broadcast_change()', t);
  end loop;
end $$;

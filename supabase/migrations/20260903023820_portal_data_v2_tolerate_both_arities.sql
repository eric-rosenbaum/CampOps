-- get_portal_data exists in two shapes depending on the environment.
--
-- `20260825130000_portal_access_gate` documents `get_portal_data(p_token, p_session)` — the form
-- that gates the private half and adds `unlocked`. Staging currently only has the one-argument
-- form, so this wrapper cannot hard-code either arity without breaking one environment.
--
-- Rather than guess, it asks the catalogue and calls whichever is present. The extra `p_session`
-- argument is always accepted on the wrapper's own signature so the client call site never has
-- to change, and it is simply unused where the base function cannot take it.

create or replace function public.get_portal_data_v2(p_token text, p_session text default null)
returns jsonb language plpgsql security definer stable set search_path = public as $fn$
declare
  v_base     jsonb;
  v_retreat  retreats;
  v_has_two  boolean;
begin
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_portal_data'
      and pg_get_function_identity_arguments(p.oid) = 'p_token text, p_session text'
  ) into v_has_two;

  if v_has_two then
    execute 'select public.get_portal_data($1, $2)' into v_base using p_token, p_session;
  else
    execute 'select public.get_portal_data($1)' into v_base using p_token;
  end if;

  if v_base is null then return null; end if;

  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return v_base; end if;

  return v_base || jsonb_build_object(
    -- The live proposal, if there is one worth showing. A draft is the camp's private working
    -- copy and must never reach the group.
    'proposal', (
      select jsonb_build_object(
               'id', p.id, 'version', p.version, 'total', p.total,
               'valid_until', p.valid_until, 'status', p.status,
               'accepted_at', p.accepted_at)
      from retreat_proposals p
      where p.retreat_id = v_retreat.id and p.status in ('sent','viewed','accepted','declined')
      order by p.version desc limit 1),

    'has_program_spaces', exists (
      select 1 from locations l
      where l.camp_id = v_retreat.camp_id and l.program_space and l.is_active
        and l.service_status <> 'out_of_service'),

    'space_request_count', (
      select count(*)::int from retreat_space_requests q where q.retreat_id = v_retreat.id),

    'has_addons', exists (
      select 1 from retreat_addon_catalog a
      where a.camp_id = v_retreat.camp_id and a.is_active and a.guest_selectable),

    -- What the camp says to do when it has not connected Stripe. The Pay section renders this
    -- instead of a button that would not work.
    'payment_note', (select c.retreat_payment_note from camps c where c.id = v_retreat.camp_id),
    'payments_enabled', (select coalesce(c.stripe_charges_enabled, false)
                         from camps c where c.id = v_retreat.camp_id)
  );
end;
$fn$;

grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;

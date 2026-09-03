-- What the portal needs for the four new steps.
--
-- Composed onto get_portal_data() rather than folded into it. That function is long and every
-- existing portal block reads from it; forking it to add five keys would mean keeping two
-- hundred lines in sync forever for no gain. `||` on the jsonb it already returns is the whole
-- change.
--
-- Deliberately flags and counts, not payloads: the proposal, the space list and the add-on list
-- each have their own RPC that the corresponding section calls when it opens. The portal only
-- needs to know whether to OFFER the step — a camp with no bookable spaces must not be shown an
-- empty step asking it to choose from nothing.

create or replace function public.get_portal_data_v2(p_token text)
returns jsonb language plpgsql security definer stable set search_path = public as $fn$
declare
  v_base    jsonb;
  v_retreat retreats;
begin
  v_base := public.get_portal_data(p_token);
  if v_base is null then return null; end if;

  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return v_base; end if;

  return v_base || jsonb_build_object(
    -- The live proposal, if there is one worth showing. Draft proposals are the camp's private
    -- work and must never appear here.
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

    -- How the camp says to pay when it has not connected Stripe. The Pay section renders this
    -- instead of a button that would not work.
    'payment_note', (select c.retreat_payment_note from camps c where c.id = v_retreat.camp_id),
    'payments_enabled', (select coalesce(c.stripe_charges_enabled, false)
                         from camps c where c.id = v_retreat.camp_id)
  );
end;
$fn$;

revoke execute on function public.get_portal_data_v2(text) from public;
grant execute on function public.get_portal_data_v2(text) to anon, authenticated;

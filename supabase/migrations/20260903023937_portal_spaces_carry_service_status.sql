-- Publish service_status on the portal's room list.
--
-- The rooming board greys an out-of-service room and says why, but get_portal_data's `spaces`
-- array carried only id/name/capacity — so the guest half had no way to know, and a coordinator
-- could put twelve people in a cabin that has been out of service since June. The camp side
-- enforces it; this is what lets the group SEE it rather than be corrected later.
--
-- Overriding the key rather than editing the base function, for the same reason the wrapper
-- exists at all: the base is long and read from everywhere.

create or replace function public.get_portal_data_v2(p_token text, p_session text default null)
returns jsonb language plpgsql security definer stable set search_path = public as $fn$
declare
  v_base     jsonb;
  v_retreat  retreats;
  v_has_two  boolean;
  v_spaces   jsonb;
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

  -- Re-emit the room list with the fields the base does not carry. Same rows, same order.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name,
           'building_id', l.parent_id,
           'building', (select p.name from locations p where p.id = l.parent_id),
           'bed_capacity', coalesce(l.bed_capacity, 0),
           'accessible', l.accessible,
           'service_status', l.service_status,
           'out_of_service_reason', l.out_of_service_reason,
           'expected_back', l.expected_back
         ) order by l.sort_order, l.name), '[]'::jsonb)
    into v_spaces
    from locations l
   where l.camp_id = v_retreat.camp_id and l.is_dorm and l.retreat_available and l.is_active;

  return v_base || jsonb_build_object(
    'spaces', v_spaces,

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

    'payment_note', (select c.retreat_payment_note from camps c where c.id = v_retreat.camp_id),
    'payments_enabled', (select coalesce(c.stripe_charges_enabled, false)
                         from camps c where c.id = v_retreat.camp_id)
  );
end;
$fn$;

grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;

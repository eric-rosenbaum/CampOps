-- Tell the group when the camp has said something.
--
-- The portal already raises a "New from the camp" banner for invoices, change-request replies
-- and documents. It could not raise one for a reply on a SPACE request, because space requests
-- were fetched separately by the section that draws them and never reached the payload the
-- banner is built from. So a camp could answer "chairs are in the back closet", the group would
-- only ever see it by opening that one section, and the camp had no way to know.
--
-- Same for a proposal: sending one is the loudest thing a camp does and the portal said nothing
-- at the top of the page.

create or replace function public.get_portal_data_v2(p_token text, p_session text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
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
   where l.camp_id = v_retreat.camp_id and l.is_dorm and l.retreat_available and l.is_active
     and not exists (
       select 1 from locations c
       where c.parent_id = l.id and c.is_dorm and c.retreat_available and c.is_active);

  return v_base || jsonb_build_object(
    'spaces', v_spaces,

    -- Answered space requests that carry a message. The banner reads this; the section that
    -- draws the requests keeps its own fuller fetch.
    'space_replies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id,
               'space_name', l.name,
               'status', q.status,
               'response_message', q.response_message,
               'responded_at', q.responded_at)
             order by q.responded_at desc nulls last)
      from retreat_space_requests q
      left join locations l on l.id = q.location_id
      where q.retreat_id = v_retreat.id
        and coalesce(btrim(q.response_message), '') <> ''), '[]'::jsonb),

    'proposal', (
      select jsonb_build_object(
               'id', p.id, 'version', p.version, 'total', p.total,
               'valid_until', p.valid_until, 'status', p.status,
               'sent_at', p.sent_at,
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

revoke execute on function public.get_portal_data_v2(text, text) from public;
grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;

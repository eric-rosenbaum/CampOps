-- Out-of-service rooms leave the portal's list entirely, and the ones that remain carry what
-- the group needs to choose between them.
--
-- The service fields stop being sent at all rather than merely hidden by the client: a portal
-- is a public link, and the reason a cabin is shut is the camp's business. "The septic line is
-- dug up" is not something a church group needs to read while choosing bunks.
--
-- Everything else in this function is unchanged from 20260910140000. Only the v_spaces query
-- and the keys it builds are different.

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
           -- What this cabin is like: the type the camp wrote once, plus anything true of
           -- this one alone.
           'cabin_type', (select t.name from camp_cabin_types t where t.id = l.cabin_type_id),
           'description', nullif(btrim(concat_ws(
             E'\n',
             (select nullif(btrim(t.description), '') from camp_cabin_types t where t.id = l.cabin_type_id),
             nullif(btrim(l.notes), ''))), '')
         ) order by l.sort_order, l.name), '[]'::jsonb)
    into v_spaces
    from locations l
   where l.camp_id = v_retreat.camp_id and l.is_dorm and l.retreat_available and l.is_active
     -- Available, or not on the list.
     and coalesce(l.service_status, 'in_service') <> 'out_of_service'
     and not exists (
       select 1 from locations c
       where c.parent_id = l.id and c.is_dorm and c.retreat_available and c.is_active
         and coalesce(c.service_status, 'in_service') <> 'out_of_service');

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

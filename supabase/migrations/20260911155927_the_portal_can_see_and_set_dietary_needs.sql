-- The portal rendered `retreat.dietary_flags` and the portal payload never contained it. The
-- display also treated it as an array while the column stores an object of counts, so even once
-- it arrived it would have rendered nothing.
--
-- Adding the key by appending to what the previous version returns, rather than retyping the
-- function: that is how six keys went missing from this exact function once already. The previous
-- v2 body moves to get_portal_data_v2_inner UNCHANGED -- reproduced below exactly as
-- pg_get_functiondef returns it -- and the wrapper adds one key to its result.

CREATE OR REPLACE FUNCTION public.get_portal_data_v2_inner(p_token text, p_session text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

create or replace function public.get_portal_data_v2(p_token text, p_session text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_out jsonb; v_retreat retreats;
begin
  -- Everything the v2 wrapper already assembles, untouched.
  v_out := public.get_portal_data_v2_inner(p_token, p_session);
  if v_out is null then return null; end if;

  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return v_out; end if;

  return v_out || jsonb_build_object(
    -- An object of counts, e.g. {"vegetarian": 4, "gluten_free": 2}. Null when the group has not
    -- been asked yet, which the portal must show differently from "none": a camp that reads
    -- "None flagged" and cooks accordingly has been misled by a field nobody filled in.
    'dietary_flags', v_retreat.dietary_flags
  );
end;
$fn$;

revoke execute on function public.get_portal_data_v2(text, text) from public;
grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;
revoke execute on function public.get_portal_data_v2_inner(text, text) from public;

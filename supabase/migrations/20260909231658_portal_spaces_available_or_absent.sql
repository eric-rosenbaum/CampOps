-- Out-of-service rooms leave the portal's list entirely, and the ones that remain carry what
-- the group needs to choose between them.
--
-- NOTE: this revision dropped six keys the wrapper is responsible for -- proposal,
-- has_program_spaces, space_request_count, has_addons, payment_note and payments_enabled --
-- by rebuilding the return object from memory instead of from the previous version. The very
-- next migration puts them back. Recorded as applied rather than quietly rewritten, because a
-- replay has to reach the same place this database did.

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

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name,
           'building_id', l.parent_id,
           'building', (select p.name from locations p where p.id = l.parent_id),
           'bed_capacity', coalesce(l.bed_capacity, 0),
           'accessible', l.accessible,
           'cabin_type', (select t.name from camp_cabin_types t where t.id = l.cabin_type_id),
           'description', nullif(btrim(concat_ws(
             E'\n',
             (select nullif(btrim(t.description), '') from camp_cabin_types t where t.id = l.cabin_type_id),
             nullif(btrim(l.notes), ''))), '')
         ) order by l.sort_order, l.name), '[]'::jsonb)
    into v_spaces
    from locations l
   where l.camp_id = v_retreat.camp_id and l.is_dorm and l.retreat_available and l.is_active
     and coalesce(l.service_status, 'in_service') <> 'out_of_service'
     and not exists (
       select 1 from locations c
       where c.parent_id = l.id and c.is_dorm and c.retreat_available and c.is_active
         and coalesce(c.service_status, 'in_service') <> 'out_of_service');

  return v_base || jsonb_build_object(
    'spaces', v_spaces,
    'space_replies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'space_name', l.name, 'status', r.status,
               'response_message', r.response_message, 'responded_at', r.responded_at)
             order by r.responded_at desc)
      from retreat_space_requests r
      join locations l on l.id = r.location_id
      where r.retreat_id = v_retreat.id
        and r.responded_at is not null
        and nullif(btrim(coalesce(r.response_message, '')), '') is not null), '[]'::jsonb),
    'proposal', (v_base -> 'proposal'));
end;
$fn$;

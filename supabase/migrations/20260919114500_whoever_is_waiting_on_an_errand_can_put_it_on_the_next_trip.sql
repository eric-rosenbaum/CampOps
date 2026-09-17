-- Whoever is waiting on an errand can put it on the next trip.
--
-- "I need it too" joined the reviewer onto Noor's AA batteries, which sat on a town run that had
-- come back hours earlier without them. Only Noor, the driver or an admin could move the errand,
-- so the person who had just said they needed it could not get it onto a car. Someone listed in
-- also_needed_by may now take it off a trip and put it on one whose errand list is open, exactly
-- as the person who asked first can.

CREATE OR REPLACE FUNCTION public.attach_errands(p_trip_id uuid, p_errand_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare t trips; v_manage boolean; v_n integer;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  perform public.trips_require_writer_internal(t.camp_id);
  if t.status in ('cancelled','back') then raise exception 'trip_not_open'; end if;
  v_manage := public.trips_can_manage_internal(t);

  if not v_manage then
    -- Anyone may put an errand they are waiting on (asked for, or said "I need it too") on
    -- somebody's run while the list is open; only the driver (or creator, or an admin) may load
    -- other people's errands into the car.
    if exists (select 1 from trip_errands where id = any (p_errand_ids)
                and requested_by is distinct from auth.uid()
                and not also_needed_by @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()))) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if not public.trips_errand_list_open_internal(t) then raise exception 'errand_list_closed'; end if;
  end if;

  update trip_errands set trip_id = t.id
   where id = any (p_errand_ids) and camp_id = t.camp_id and status = 'open';
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

CREATE OR REPLACE FUNCTION public.detach_errand(p_errand_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare e trip_errands; t trips;
begin
  select * into e from trip_errands where id = p_errand_id;
  if not found then raise exception 'errand_not_found'; end if;
  perform public.trips_require_writer_internal(e.camp_id);
  if e.trip_id is null then return; end if;
  select * into t from trips where id = e.trip_id for update;
  if e.requested_by is distinct from auth.uid()
     and not e.also_needed_by @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()))
     and not public.trips_can_manage_internal(t) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update trip_errands set trip_id = null where id = e.id;
end;
$fn$;

revoke execute on function public.attach_errands(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.attach_errands(uuid, uuid[]) to authenticated, service_role;
revoke execute on function public.detach_errand(uuid) from public, anon, authenticated;
grant execute on function public.detach_errand(uuid) to authenticated, service_role;

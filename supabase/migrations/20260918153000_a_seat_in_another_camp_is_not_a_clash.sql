-- A seat in another camp is not a clash.
--
-- trips_seat_clash_internal matched a person's seats in every camp. A demo cloned from a camp
-- copies that camp's seats with the same user ids, so a staff member whose camp had been demoed
-- was refused a seat at home with "you already have a seat at that time" -- naming a trip in a
-- camp their screen does not show and that they cannot leave. Caught by e2e J3 on staging, where
-- the QA camp has been cloned into many demos. The rule is per camp, which is also what the board
-- can explain.

CREATE OR REPLACE FUNCTION public.trips_seat_clash_internal(p_trip trips, p_leg text, p_rider uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  select jsonb_build_object('seat_id', s.id, 'trip_id', t.id, 'title', t.title,
           'depart_date', t.depart_date, 'depart_time', to_char(t.depart_time, 'HH24:MI'),
           'leg', s.leg, 'status', s.status)
    from trip_seats s join trips t on t.id = s.trip_id
   where p_rider is not null
     and s.rider_user_id = p_rider
     and t.camp_id = p_trip.camp_id
     and s.status in ('confirmed','waitlist')
     and t.status in ('planned','out')
     and t.id <> p_trip.id
     and ((p_leg in ('both','there') and s.leg in ('both','there'))
       or (p_leg in ('both','back') and s.leg in ('both','back')))
     and (t.depart_date + t.depart_time)
         <= coalesce(p_trip.return_date + p_trip.return_time, p_trip.depart_date + p_trip.depart_time)
     and (p_trip.depart_date + p_trip.depart_time)
         <= coalesce(t.return_date + t.return_time, t.depart_date + t.depart_time)
   order by t.depart_date, t.depart_time
   limit 1;
$fn$
;

revoke execute on function public.trips_seat_clash_internal(public.trips,text,uuid) from public, anon, authenticated;
grant execute on function public.trips_seat_clash_internal(public.trips,text,uuid) to service_role;

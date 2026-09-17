-- A trip says which way it goes, one person holds one car at a time, and a rider with no way home
-- can be offered one.
--
-- What reviewers hit in the demo:
--   * "Evening ride into town" had no return and a note saying one way, yet offered "There & back"
--     and "Back only", defaulted to There & back, and booking it never put the rider on the late
--     pickup. A trip had no idea of its own direction, so every car sold both legs.
--   * One person could hold seats in two cars leaving at the same time.
--   * The red "no ride back" chip explained a problem and offered nothing to do about it.
--   * Adding an errand that was already on the list gave no hint, so the driver bought it twice.
--
-- What changes:
--   * trips.direction: round_trip | outbound (into town only) | pickup (from town back to camp).
--     Existing rows: a title that says pickup is a pickup; no return time is into town only;
--     anything else is a round trip. Seats already on a one-way trip move onto the leg it offers.
--     claim_trip_seat defaults the leg to what the trip does and refuses a leg it doesn't
--     ('leg_not_offered'); match_ride_request covers the part of a request the trip can and
--     leaves a request open for the rest. A new kind, 'pickup', presets the direction.
--   * Overlap rule (decided: prevent, not warn). Two live seats (confirmed or waitlisted) of the
--     same person clash when they use the same leg -- both going into town, or both coming back --
--     on trips whose times overlap ([departure, return], or the departure instant when there is no
--     return). Riding in on the 5pm and home on the 9:30pm pickup does not clash. A clash raises
--     'overlapping_seat' with the other trip in the detail; switch_trip_seat moves the person in
--     one transaction. Prevented rather than warned because a waitlist promotion would otherwise
--     quietly turn a warned-about backup into two confirmed seats, one of them someone else's.
--   * offer_ride_back(seat, trip) puts a stranded there-only rider on a later trip's way back,
--     for the rider, the outbound trip's creator/driver, the return trip's managers, or an admin.
--     request_ride_back(seat) asks on their behalf when nothing is going. Both work for riders
--     who exist only by name (seeded demo riders have no login).
--   * release_trip_seat names who moved up from the waitlist, so the screen can say so.
--   * trip_errands.also_needed_by + also_need_errand(): "I need that too" instead of a duplicate.

alter table public.trips add column if not exists direction text not null default 'round_trip';
alter table public.trips drop constraint if exists trips_direction_check;
alter table public.trips add constraint trips_direction_check check (direction in ('round_trip','outbound','pickup'));
alter table public.trips drop constraint if exists trips_kind_check;
alter table public.trips add constraint trips_kind_check check (kind in ('town_run','day_off','supply_run','pickup','other'));

update public.trips set direction = 'pickup' where direction = 'round_trip' and title ~* '\mpick[- ]?up\M';
update public.trips set direction = 'outbound' where direction = 'round_trip' and return_time is null;
update public.trips set kind = 'pickup' where direction = 'pickup' and kind = 'other';
update public.trip_seats s set leg = case t.direction when 'outbound' then 'there' else 'back' end
  from public.trips t
 where t.id = s.trip_id and t.direction <> 'round_trip' and s.status <> 'cancelled'
   and s.leg <> case t.direction when 'outbound' then 'there' else 'back' end;

alter table public.trip_errands add column if not exists also_needed_by jsonb not null default '[]'::jsonb;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.trips_direction_legs_internal(p_direction text)
returns text[]
language sql
immutable
set search_path to 'public'
as $fn$
  select case p_direction when 'outbound' then array['there'] when 'pickup' then array['back']
              else array['both','there','back'] end;
$fn$;

create or replace function public.trips_natural_leg_internal(p_direction text)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select case p_direction when 'outbound' then 'there' when 'pickup' then 'back' else 'both' end;
$fn$;

-- The first live seat this person already holds that clashes with taking p_leg on p_trip, or null.
-- Mirrored by seatClash() in src/lib/trips.ts, which warns before the button is pressed.
create or replace function public.trips_seat_clash_internal(p_trip public.trips, p_leg text, p_rider uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object('seat_id', s.id, 'trip_id', t.id, 'title', t.title,
           'depart_date', t.depart_date, 'depart_time', to_char(t.depart_time, 'HH24:MI'),
           'leg', s.leg, 'status', s.status)
    from trip_seats s join trips t on t.id = s.trip_id
   where p_rider is not null
     and s.rider_user_id = p_rider
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
$fn$;

-- Cancel a seat, reopen any ride request it satisfied, and promote whoever now fits. The caller
-- has locked the trip. Returns who moved up, by name, so "Theo removed" can also say who got in.
create or replace function public.trips_release_seat_internal(p_seat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare s trip_seats; t trips; v_n integer := 0; v_waiting uuid[]; v_names text[];
begin
  select * into s from trip_seats where id = p_seat_id;
  if not found then raise exception 'seat_not_found'; end if;
  select * into t from trips where id = s.trip_id;
  if s.status = 'cancelled' then
    return jsonb_build_object('promoted', 0, 'promoted_names', '[]'::jsonb, 'trip_id', t.id);
  end if;

  update trip_seats set status = 'cancelled', cancelled_at = now() where id = s.id;
  update ride_requests set status = 'open', matched_trip_id = null, matched_seat_id = null
   where matched_seat_id = s.id and status = 'matched';

  if t.status = 'planned' then
    select array_agg(id) into v_waiting from trip_seats where trip_id = t.id and status = 'waitlist';
    v_n := public.trips_promote_waitlist_internal(t.id);
    select array_agg(rider_name order by queued_at) into v_names
      from trip_seats where id = any (coalesce(v_waiting, '{}')) and status = 'confirmed';
  end if;
  perform public.plan_trip_leaving_soon_internal(t.id);
  return jsonb_build_object('promoted', v_n, 'promoted_names', to_jsonb(coalesce(v_names, '{}'::text[])), 'trip_id', t.id);
end;
$fn$;

-- The same person, a live seat that uses the given one-way leg, and the ride requests of theirs
-- that the seat answers. Riders who exist only by name are matched by name.
create or replace function public.trips_same_rider_internal(p_seat public.trip_seats, p_user uuid, p_name text)
returns boolean
language sql
immutable
set search_path to 'public'
as $fn$
  select case when p_seat.rider_user_id is not null then p_user is not distinct from p_seat.rider_user_id
              else p_user is null and lower(btrim(coalesce(p_name, ''))) = lower(btrim(p_seat.rider_name)) end;
$fn$;

-- ─── Switching cars ──────────────────────────────────────────────────────────

create or replace function public.switch_trip_seat(p_seat_id uuid, p_trip_id uuid, p_leg text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare s trip_seats; t_new trips; v_rel jsonb; v_res jsonb;
begin
  select * into s from trip_seats where id = p_seat_id;
  if not found then raise exception 'seat_not_found'; end if;
  perform public.trips_require_writer_internal(s.camp_id);
  if s.rider_user_id is distinct from auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into t_new from trips where id = p_trip_id and camp_id = s.camp_id;
  if not found then raise exception 'trip_not_found'; end if;
  if t_new.id = s.trip_id then raise exception 'same_trip'; end if;

  -- Both cars locked in one fixed order, so two people swapping opposite ways cannot deadlock.
  perform 1 from trips where id in (s.trip_id, t_new.id) order by id for update;
  select * into s from trip_seats where id = p_seat_id;
  if s.status = 'cancelled' then raise exception 'seat_not_found'; end if;

  v_rel := public.trips_release_seat_internal(s.id);
  -- If the new seat is refused (full leg is fine -- that is a waitlist -- but a trip that left,
  -- or another clash) the whole switch rolls back and the old seat is still theirs.
  v_res := public.trips_claim_seat_internal(t_new.id, coalesce(p_leg, public.trips_natural_leg_internal(t_new.direction)),
                                            s.rider_user_id, s.rider_name);
  return v_res || jsonb_build_object('released_trip_id', s.trip_id, 'promoted_names', v_rel->'promoted_names');
end;
$fn$;

-- ─── A way home for a rider with none ────────────────────────────────────────

create or replace function public.offer_ride_back(p_seat_id uuid, p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare s trip_seats; t_out trips; t trips; v_existing trip_seats; v_res jsonb; v_seat uuid;
begin
  select * into s from trip_seats where id = p_seat_id;
  if not found then raise exception 'seat_not_found'; end if;
  perform public.trips_require_writer_internal(s.camp_id);
  select * into t_out from trips where id = s.trip_id;
  select * into t from trips where id = p_trip_id and camp_id = s.camp_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  if not (coalesce(s.rider_user_id = auth.uid(), false)
          or public.trips_can_manage_internal(t_out)
          or public.trips_can_manage_internal(t)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status not in ('confirmed','waitlist') or s.leg <> 'there' then raise exception 'not_a_one_way_seat'; end if;
  if (t.depart_date + t.depart_time) < (t_out.depart_date + t_out.depart_time) then
    raise exception 'returns_before_ride_out';
  end if;

  if s.rider_user_id is null then
    select * into v_existing from trip_seats x
     where x.trip_id = t.id and x.status <> 'cancelled' and x.rider_user_id is null
       and lower(btrim(x.rider_name)) = lower(btrim(s.rider_name));
    if found then
      return jsonb_build_object('seat_id', v_existing.id, 'status', v_existing.status, 'leg', v_existing.leg, 'already', true);
    end if;
  end if;

  v_res := public.trips_claim_seat_internal(t.id, 'back', s.rider_user_id, s.rider_name);
  v_seat := (v_res->>'seat_id')::uuid;

  -- A rider known only by name and email: the claim could not address them, so the seat takes
  -- the email and the confirmation goes now.
  if s.rider_user_id is null and s.rider_email is not null and not (v_res->>'already')::boolean then
    update trip_seats set rider_email = s.rider_email where id = v_seat and rider_email is null;
    if v_res->>'status' = 'confirmed' then
      perform public.trips_queue_seat_message_internal(v_seat, 'seat_confirmed');
    end if;
    perform public.plan_trip_leaving_soon_internal(t.id);
  end if;

  update ride_requests r set status = 'matched', matched_trip_id = t.id, matched_seat_id = v_seat
   where r.camp_id = s.camp_id and r.status = 'open' and r.leg = 'back'
     and r.wanted_date between t_out.depart_date and t_out.depart_date + 1
     and public.trips_same_rider_internal(s, r.requested_by, r.requester_name);
  return v_res;
end;
$fn$;

create or replace function public.request_ride_back(p_seat_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare s trip_seats; t trips; v_id uuid;
begin
  select * into s from trip_seats where id = p_seat_id;
  if not found then raise exception 'seat_not_found'; end if;
  perform public.trips_require_writer_internal(s.camp_id);
  select * into t from trips where id = s.trip_id;
  if not (coalesce(s.rider_user_id = auth.uid(), false) or public.trips_can_manage_internal(t)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if s.status not in ('confirmed','waitlist') or s.leg <> 'there' then raise exception 'not_a_one_way_seat'; end if;

  -- Asking twice is one request: the driver and the rider may both press it.
  select r.id into v_id from ride_requests r
   where r.camp_id = s.camp_id and r.status = 'open' and r.leg in ('back','both')
     and r.wanted_date between t.depart_date and t.depart_date + 1
     and public.trips_same_rider_internal(s, r.requested_by, r.requester_name)
   order by r.created_at limit 1;
  if v_id is not null then return v_id; end if;

  insert into ride_requests (camp_id, requested_by, requester_name, wanted_date, earliest_time, destination, leg, note)
  values (s.camp_id, s.rider_user_id, s.rider_name, t.depart_date, t.depart_time,
          nullif(btrim(coalesce(t.destination, '')), ''), 'back',
          left('Rode ' || t.title || ' in at ' || lower(to_char(t.depart_date + t.depart_time, 'FMHH12:MIam'))
               || ' and needs a way back'
               || case when s.rider_user_id is distinct from auth.uid()
                       then ' (asked by ' || public.trips_person_name_internal(s.camp_id, auth.uid()) || ')' else '' end,
               300))
  returning id into v_id;
  return v_id;
end;
$fn$;

-- ─── "I need that too" ───────────────────────────────────────────────────────

create or replace function public.also_need_errand(p_errand_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare e trip_errands; v_me uuid := auth.uid();
begin
  select * into e from trip_errands where id = p_errand_id for update;
  if not found then raise exception 'errand_not_found'; end if;
  perform public.trips_require_writer_internal(e.camp_id);
  if e.status <> 'open' then raise exception 'errand_not_open'; end if;
  if e.requested_by is not distinct from v_me
     or e.also_needed_by @> jsonb_build_array(jsonb_build_object('user_id', v_me)) then
    return;
  end if;
  update trip_errands
     set also_needed_by = also_needed_by || jsonb_build_array(jsonb_build_object(
           'user_id', v_me, 'name', public.trips_person_name_internal(e.camp_id, v_me), 'at', now()))
   where id = e.id;
end;
$fn$;

-- ─── Seats: legs are checked against the direction, clashes are refused ──────

CREATE OR REPLACE FUNCTION public.trips_claim_seat_internal(p_trip_id uuid, p_leg text, p_rider uuid, p_rider_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  t trips; v_tz text; v_existing trip_seats; v_status text; v_id uuid; v_clash jsonb;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  if t.status <> 'planned' then raise exception 'trip_not_open'; end if;
  if coalesce(p_leg, '') not in ('both','there','back') then raise exception 'bad_leg'; end if;
  -- An into-town-only car has no seat back to sell, and a pickup has no seat out. Offering them
  -- is how a rider booked "there & back" on a one-way trip and was never put on the pickup.
  if not (p_leg = any (public.trips_direction_legs_internal(t.direction))) then
    raise exception 'leg_not_offered' using detail = t.direction;
  end if;
  select timezone into v_tz from camps where id = t.camp_id;
  if (t.depart_date + t.depart_time) at time zone v_tz <= now() and p_leg <> 'back' then
    raise exception 'trip_already_left';
  end if;
  if p_rider is not null and p_rider = t.driver_user_id then
    raise exception 'driver_is_not_a_passenger';
  end if;

  select * into v_existing from trip_seats
   where trip_id = t.id and rider_user_id = p_rider and status <> 'cancelled';
  if found then
    return jsonb_build_object('seat_id', v_existing.id, 'status', v_existing.status,
                              'leg', v_existing.leg, 'already', true);
  end if;

  -- One person, one car at a time: a seat that uses the same leg of a trip whose times overlap
  -- is refused, with the clashing trip in the detail so the screen can offer to switch.
  v_clash := public.trips_seat_clash_internal(t, p_leg, p_rider);
  if v_clash is not null then
    raise exception 'overlapping_seat' using detail = v_clash::text;
  end if;

  v_status := case when public.trips_leg_fits_internal(t.id, t.passenger_seats, p_leg)
                   then 'confirmed' else 'waitlist' end;
  insert into trip_seats (camp_id, trip_id, rider_user_id, rider_name, leg, status, confirmed_at, created_by)
  values (t.camp_id, t.id, p_rider, coalesce(nullif(btrim(p_rider_name), ''), 'Someone'), p_leg, v_status,
          case when v_status = 'confirmed' then now() end, auth.uid())
  returning id into v_id;

  if v_status = 'confirmed' then
    perform public.trips_queue_seat_message_internal(v_id, 'seat_confirmed');
  end if;
  perform public.plan_trip_leaving_soon_internal(t.id);

  return jsonb_build_object('seat_id', v_id, 'status', v_status, 'leg', p_leg, 'already', false);
end;
$fn$;

CREATE OR REPLACE FUNCTION public.claim_trip_seat(p_trip_id uuid, p_leg text DEFAULT NULL::text, p_rider_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  t trips; v_rider uuid := coalesce(p_rider_user_id, auth.uid());
begin
  select * into t from trips where id = p_trip_id;
  if not found then raise exception 'trip_not_found'; end if;
  perform public.trips_require_writer_internal(t.camp_id);
  if v_rider is distinct from auth.uid() then
    if not public.trips_can_manage_internal(t) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if not exists (select 1 from camp_members where camp_id = t.camp_id and user_id = v_rider and is_active) then
      raise exception 'rider_not_a_member';
    end if;
  end if;
  return public.trips_claim_seat_internal(t.id, coalesce(p_leg, public.trips_natural_leg_internal(t.direction)), v_rider,
                                          public.trips_person_name_internal(t.camp_id, v_rider));
end;
$fn$;

CREATE OR REPLACE FUNCTION public.release_trip_seat(p_seat_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare s trip_seats; t trips;
begin
  select * into s from trip_seats where id = p_seat_id;
  if not found then raise exception 'seat_not_found'; end if;
  -- Lock the trip, then re-read the seat: whatever we decide about the waitlist has to be
  -- decided against the seats as they are once nobody else can change them.
  select * into t from trips where id = s.trip_id for update;
  perform public.trips_require_writer_internal(t.camp_id);
  if s.rider_user_id is distinct from auth.uid() and not public.trips_can_manage_internal(t) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into s from trip_seats where id = p_seat_id;
  return public.trips_release_seat_internal(s.id);
end;
$fn$;

CREATE OR REPLACE FUNCTION public.match_ride_request(p_request_id uuid, p_trip_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare r ride_requests; t trips; v_res jsonb; v_leg text; v_rest uuid;
begin
  select * into r from ride_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  select * into t from trips where id = p_trip_id;
  if not found or t.camp_id <> r.camp_id then raise exception 'trip_not_found'; end if;
  perform public.trips_require_writer_internal(r.camp_id);
  if r.requested_by is distinct from auth.uid() and not public.trips_can_manage_internal(t) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if r.status <> 'open' then raise exception 'request_not_open'; end if;

  -- The part of the request this car covers. "There & back" matched to an into-town-only trip
  -- takes the seat there and leaves a request open for the way back, rather than being marked
  -- matched and forgetting that the person still has no ride home.
  v_leg := case
    when t.direction = 'round_trip' then r.leg
    when t.direction = 'outbound' and r.leg in ('both','there') then 'there'
    when t.direction = 'pickup' and r.leg in ('both','back') then 'back' end;
  if v_leg is null then raise exception 'leg_not_offered' using detail = t.direction; end if;

  v_res := public.trips_claim_seat_internal(t.id, v_leg, r.requested_by, r.requester_name);
  update ride_requests set status = 'matched', leg = v_leg, matched_trip_id = t.id, matched_seat_id = (v_res->>'seat_id')::uuid
   where id = r.id;
  if v_leg <> r.leg then
    insert into ride_requests (camp_id, requested_by, requester_name, wanted_date, earliest_time, latest_time,
                               destination, leg, note)
    values (r.camp_id, r.requested_by, r.requester_name, r.wanted_date, r.earliest_time, r.latest_time,
            r.destination, case v_leg when 'there' then 'back' else 'there' end, r.note)
    returning id into v_rest;
    v_res := v_res || jsonb_build_object('remaining_leg', case v_leg when 'there' then 'back' else 'there' end,
                                         'remaining_request_id', v_rest);
  end if;
  return v_res;
end;
$fn$;

-- ─── Trips carry their direction ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_trip(p_camp_id uuid, p_trip jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_id uuid;
  v_driver uuid := nullif(p_trip->>'driver_user_id', '')::uuid;
  v_vehicle uuid := nullif(p_trip->>'vehicle_asset_id', '')::uuid;
  v_vehicle_label text;
  v_title text := left(btrim(coalesce(p_trip->>'title', '')), 120);
begin
  perform public.trips_require_writer_internal(p_camp_id);
  if v_title = '' then raise exception 'title_required'; end if;
  if nullif(p_trip->>'depart_date', '') is null or nullif(p_trip->>'depart_time', '') is null then
    raise exception 'departure_required';
  end if;
  if v_driver is not null and not exists (
    select 1 from camp_members where camp_id = p_camp_id and user_id = v_driver and is_active) then
    raise exception 'driver_not_a_member';
  end if;
  if v_vehicle is not null then
    select name into v_vehicle_label from camp_assets where id = v_vehicle and camp_id = p_camp_id;
    if not found then raise exception 'vehicle_not_found'; end if;
  end if;

  insert into trips (camp_id, kind, direction, title, destination, depart_date, depart_time, return_date, return_time,
                     driver_user_id, driver_name, vehicle_asset_id, vehicle_label, passenger_seats,
                     errands_close_time, notes, created_by)
  values (p_camp_id,
          coalesce(nullif(p_trip->>'kind', ''), 'town_run'),
          coalesce(nullif(p_trip->>'direction', ''),
                   case when p_trip->>'kind' = 'pickup' then 'pickup' else 'round_trip' end),
          v_title,
          left(btrim(coalesce(p_trip->>'destination', '')), 120),
          (p_trip->>'depart_date')::date,
          (p_trip->>'depart_time')::time,
          coalesce(nullif(p_trip->>'return_date', '')::date,
                   case when nullif(p_trip->>'return_time', '') is not null then (p_trip->>'depart_date')::date end),
          nullif(p_trip->>'return_time', '')::time,
          v_driver,
          coalesce(nullif(left(btrim(p_trip->>'driver_name'), 80), ''),
                   case when v_driver is not null then public.trips_person_name_internal(p_camp_id, v_driver) end),
          v_vehicle,
          coalesce(nullif(left(btrim(p_trip->>'vehicle_label'), 80), ''), v_vehicle_label),
          coalesce(nullif(p_trip->>'passenger_seats', '')::int, 3),
          nullif(p_trip->>'errands_close_time', '')::time,
          nullif(left(btrim(coalesce(p_trip->>'notes', '')), 2000), ''),
          auth.uid())
  returning id into v_id;

  perform public.plan_trip_leaving_soon_internal(v_id);
  return v_id;
end;
$fn$;

CREATE OR REPLACE FUNCTION public.update_trip(p_trip_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  t trips; u record;
  v_seats integer; v_driver uuid; v_vehicle uuid; v_vehicle_label text;
  v_depart_date date; v_return_date date; v_return_time time; v_direction text;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  perform public.trips_require_writer_internal(t.camp_id);
  if not public.trips_can_manage_internal(t) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if t.status = 'cancelled' then raise exception 'trip_cancelled'; end if;

  v_seats := case when p_patch ? 'passenger_seats' then (p_patch->>'passenger_seats')::int else t.passenger_seats end;
  v_driver := case when p_patch ? 'driver_user_id' then nullif(p_patch->>'driver_user_id', '')::uuid else t.driver_user_id end;
  v_vehicle := case when p_patch ? 'vehicle_asset_id' then nullif(p_patch->>'vehicle_asset_id', '')::uuid else t.vehicle_asset_id end;
  v_depart_date := case when p_patch ? 'depart_date' then (p_patch->>'depart_date')::date else t.depart_date end;
  v_return_time := case when p_patch ? 'return_time' then nullif(p_patch->>'return_time', '')::time else t.return_time end;
  v_return_date := case when p_patch ? 'return_date' then nullif(p_patch->>'return_date', '')::date else t.return_date end;
  if v_return_time is not null and v_return_date is null then v_return_date := v_depart_date; end if;
  v_direction := case when p_patch ? 'direction' then coalesce(nullif(p_patch->>'direction', ''), t.direction) else t.direction end;

  if v_driver is not null and v_driver is distinct from t.driver_user_id and not exists (
    select 1 from camp_members where camp_id = t.camp_id and user_id = v_driver and is_active) then
    raise exception 'driver_not_a_member';
  end if;
  if v_vehicle is not null and v_vehicle is distinct from t.vehicle_asset_id then
    select name into v_vehicle_label from camp_assets where id = v_vehicle and camp_id = t.camp_id;
    if not found then raise exception 'vehicle_not_found'; end if;
  end if;

  -- The new driver is not also a passenger in their own car.
  if v_driver is not null and v_driver is distinct from t.driver_user_id then
    update trip_seats set status = 'cancelled', cancelled_at = now()
     where trip_id = t.id and rider_user_id = v_driver and status <> 'cancelled';
  end if;

  -- Shrinking the car below the people already confirmed in it would silently un-seat somebody.
  -- Refused: the driver has to move a rider first, and that rider is told.
  select * into u from public.trips_legs_used_internal(t.id);
  if v_seats < greatest(u.there_used, u.back_used) then
    raise exception 'seats_below_riders'
      using detail = format('%s riders are confirmed; move someone before reducing to %s seats',
                            greatest(u.there_used, u.back_used), v_seats);
  end if;

  -- Turning a round trip into a pickup would leave the people riding out holding seats in a car
  -- that no longer goes out. Refused, like shrinking the car below its riders.
  if v_direction <> t.direction and exists (
    select 1 from trip_seats where trip_id = t.id and status in ('confirmed','waitlist')
       and not (leg = any (public.trips_direction_legs_internal(v_direction)))) then
    raise exception 'riders_on_other_leg';
  end if;

  update trips set
    direction = v_direction,
    kind = case when p_patch ? 'kind' then p_patch->>'kind' else kind end,
    title = case when p_patch ? 'title' then left(btrim(p_patch->>'title'), 120) else title end,
    destination = case when p_patch ? 'destination' then left(btrim(coalesce(p_patch->>'destination', '')), 120) else destination end,
    depart_date = v_depart_date,
    depart_time = case when p_patch ? 'depart_time' then (p_patch->>'depart_time')::time else depart_time end,
    return_date = v_return_date,
    return_time = v_return_time,
    driver_user_id = v_driver,
    driver_name = case
      when p_patch ? 'driver_name' then nullif(left(btrim(p_patch->>'driver_name'), 80), '')
      when v_driver is distinct from t.driver_user_id and v_driver is not null then public.trips_person_name_internal(t.camp_id, v_driver)
      else driver_name end,
    vehicle_asset_id = v_vehicle,
    vehicle_label = case
      when v_vehicle is distinct from t.vehicle_asset_id then coalesce(v_vehicle_label, nullif(p_patch->>'vehicle_label', ''))
      when p_patch ? 'vehicle_label' then nullif(left(btrim(p_patch->>'vehicle_label'), 80), '')
      else vehicle_label end,
    passenger_seats = v_seats,
    errands_close_time = case when p_patch ? 'errands_close_time' then nullif(p_patch->>'errands_close_time', '')::time else errands_close_time end,
    notes = case when p_patch ? 'notes' then nullif(left(btrim(coalesce(p_patch->>'notes', '')), 2000), '') else notes end
  where id = t.id;

  perform public.trips_promote_waitlist_internal(t.id);
  perform public.plan_trip_leaving_soon_internal(t.id);
end;
$fn$;

-- ─── Errands: everyone who needs it hears it was got ─────────────────────────

CREATE OR REPLACE FUNCTION public.set_errand_status(p_errand_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare e trip_errands; t trips; v_role text; v_allowed boolean; v_camp text; v_head text;
  v_subject text; v_html text; v_text text; v_also record;
begin
  select * into e from trip_errands where id = p_errand_id for update;
  if not found then raise exception 'errand_not_found'; end if;
  v_role := public.trips_require_writer_internal(e.camp_id);
  if p_status not in ('open','bought','unavailable','cancelled') then raise exception 'bad_status'; end if;
  if e.trip_id is not null then select * into t from trips where id = e.trip_id; end if;

  if p_status = 'cancelled' then
    v_allowed := v_role = 'admin' or e.requested_by is not distinct from auth.uid();
  else
    -- Ticking an errand off is the driver's call, made in the store.
    v_allowed := v_role = 'admin' or (e.trip_id is not null and public.trips_can_manage_internal(t));
  end if;
  if not coalesce(v_allowed, false) then raise exception 'not_allowed' using errcode = '42501'; end if;

  update trip_errands set
    status = p_status,
    driver_note = case when p_note is not null then nullif(left(btrim(p_note), 300), '') else driver_note end,
    done_by = case when p_status in ('bought','unavailable') then auth.uid() end,
    done_at = case when p_status in ('bought','unavailable') then now() end
  where id = e.id;

  if p_status in ('bought','unavailable') then
    select name into v_camp from camps where id = e.camp_id;
    v_head := case p_status when 'bought' then 'Picked up: ' else 'Couldn''t get: ' end;
    v_subject := v_head || e.item;
    v_html := public.msg_wrap(case p_status when 'bought' then 'Your errand is done' else 'Your errand couldn''t be done' end,
        '<strong>' || public.trips_esc_internal(e.item) || '</strong>'
        || coalesce(' (' || public.trips_esc_internal(e.quantity) || ')', '')
        || case p_status when 'bought' then ' was picked up' else ' was not available' end
        || coalesce(' on ' || public.trips_esc_internal(t.title), '') || '.'
        || coalesce('<br>Note from the driver: ' || public.trips_esc_internal(nullif(btrim(p_note), '')), ''),
        public.trips_esc_internal(v_camp));
    v_text := v_head || e.item || coalesce(' (' || e.quantity || ')', '')
        || coalesce('. ' || nullif(btrim(p_note), ''), '') || '.';
    if e.requested_by is distinct from auth.uid() then
      perform public.queue_message(e.camp_id, 'trip_errand', e.id, 'errand_done:' || p_status, 'requester',
        public.user_email(e.requested_by), e.requester_name, null, now(), v_subject, v_html, v_text);
    end if;
    -- Everyone who said "I need that too" hears the same news, each under their own key.
    for v_also in select * from jsonb_to_recordset(coalesce(e.also_needed_by, '[]'::jsonb)) as x(user_id uuid, name text) loop
      if v_also.user_id is distinct from auth.uid() then
        perform public.queue_message(e.camp_id, 'trip_errand', e.id, 'errand_done:' || p_status || ':' || v_also.user_id,
          'requester', public.user_email(v_also.user_id), v_also.name, null, now(), v_subject, v_html, v_text);
      end if;
    end loop;
  elsif p_status in ('open','cancelled') then
    update scheduled_messages set state = 'cancelled', suppressed_reason = 'errand_reopened', updated_at = now()
     where subject_type = 'trip_errand' and subject_id = e.id and rule_key like 'errand_done:%' and state = 'scheduled';
  end if;
end;
$fn$;

-- ─── Messages say "Town centre → camp" for a pickup ──────────────────────────

CREATE OR REPLACE FUNCTION public.trips_queue_seat_message_internal(p_seat_id uuid, p_rule text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  s record;
  v_head text; v_title text; v_line text;
begin
  select ts.*, tr.title, tr.direction, tr.destination, tr.depart_date, tr.depart_time, tr.return_date, tr.return_time,
         tr.driver_name, c.name as camp_name
    into s
    from trip_seats ts join trips tr on tr.id = ts.trip_id join camps c on c.id = ts.camp_id
   where ts.id = p_seat_id;
  if not found then return; end if;

  v_head := case p_rule when 'waitlist_promoted' then 'A seat opened up — you''re in'
                        else 'You have a seat' end;
  v_title := s.title || case when coalesce(s.destination, '') = '' then ''
                             when s.direction = 'pickup' then ' · ' || s.destination || ' → camp'
                             else ' → ' || s.destination end;
  v_line := case s.leg when 'there' then 'Ride there only — you need your own way back.'
                       when 'back' then case when s.direction = 'pickup' then 'Pickup back to camp.' else 'Ride back only.' end
                       else 'There and back.' end;

  perform public.queue_message(s.camp_id, 'trip_seat', s.id, p_rule, 'rider',
    coalesce(public.user_email(s.rider_user_id), s.rider_email), s.rider_name, null, now(),
    v_head || ': ' || v_title,
    public.msg_wrap(v_head,
      '<strong>' || public.trips_esc_internal(v_title) || '</strong><br>'
      || 'Leaves ' || public.trips_fmt_when_internal(s.depart_date, s.depart_time)
      || coalesce('<br>Back ' || public.trips_fmt_when_internal(coalesce(s.return_date, s.depart_date), s.return_time), '')
      || coalesce('<br>Driver: ' || public.trips_esc_internal(s.driver_name), '')
      || '<br><br>' || v_line,
      public.trips_esc_internal(s.camp_name)),
    v_head || ': ' || v_title || ', leaves ' || public.trips_fmt_when_internal(s.depart_date, s.depart_time)
      || coalesce('. Driver ' || s.driver_name, '') || '. ' || v_line);
end;
$fn$;

CREATE OR REPLACE FUNCTION public.plan_trip_leaving_soon_internal(p_trip_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  t record; s record;
  v_key text; v_driver_key text; v_at timestamptz; v_depart timestamptz; v_n integer := 0;
  v_title text; v_subject text; v_html text; v_text text;
begin
  select tr.*, c.name as camp_name, c.timezone as tz into t
    from trips tr join camps c on c.id = tr.camp_id where tr.id = p_trip_id;
  if not found then return 0; end if;

  v_key := 'leaving_soon@' || to_char(t.depart_date + t.depart_time, 'YYYY-MM-DD"T"HH24:MI');
  v_driver_key := v_key || ':' || coalesce(t.driver_user_id::text, 'none');
  v_depart := (t.depart_date + t.depart_time) at time zone t.tz;
  v_at := public.trip_leaving_soon_at_internal(t.depart_date, t.depart_time, t.tz);

  update scheduled_messages m
     set state = 'cancelled', suppressed_reason = 'trip_changed', updated_at = now()
   where m.state = 'scheduled'
     and m.rule_key like 'leaving_soon@%'
     and (
       (m.subject_type = 'trip_seat'
        and m.subject_id in (select id from trip_seats where trip_id = t.id)
        and (m.rule_key <> v_key or t.status <> 'planned'
             or not exists (select 1 from trip_seats x where x.id = m.subject_id and x.status = 'confirmed')))
       or
       (m.subject_type = 'trip' and m.subject_id = t.id
        and (m.rule_key <> v_driver_key or t.status <> 'planned'))
     );

  if t.status <> 'planned' or v_depart <= now() then return 0; end if;

  v_title := t.title || case when coalesce(t.destination, '') = '' then ''
                             when t.direction = 'pickup' then ' · ' || t.destination || ' → camp'
                             else ' → ' || t.destination end;
  v_subject := 'Leaving soon: ' || v_title;
  v_html := public.msg_wrap('Leaving soon',
    '<strong>' || public.trips_esc_internal(v_title) || '</strong> leaves at '
    || lower(to_char(t.depart_date + t.depart_time, 'FMHH12:MIam'))
    || coalesce(' — back around ' || lower(to_char(coalesce(t.return_date, t.depart_date) + t.return_time, 'FMHH12:MIam')), '')
    || coalesce('.<br>Driver: ' || public.trips_esc_internal(t.driver_name), '.')
    || coalesce('<br>' || public.trips_esc_internal(t.notes), ''),
    public.trips_esc_internal(t.camp_name));
  v_text := 'Leaving soon: ' || v_title || ' at ' || lower(to_char(t.depart_date + t.depart_time, 'FMHH12:MIam'))
    || coalesce(', back ~' || lower(to_char(coalesce(t.return_date, t.depart_date) + t.return_time, 'FMHH12:MIam')), '')
    || coalesce('. Driver ' || t.driver_name, '') || '.';

  for s in select * from trip_seats where trip_id = t.id and status = 'confirmed' loop
    perform public.queue_message(t.camp_id, 'trip_seat', s.id, v_key, 'rider',
      coalesce(public.user_email(s.rider_user_id), s.rider_email), s.rider_name, null, v_at,
      v_subject, v_html, v_text);
    v_n := v_n + 1;
  end loop;

  if t.driver_user_id is not null then
    perform public.queue_message(t.camp_id, 'trip', t.id, v_driver_key, 'assignee',
      public.user_email(t.driver_user_id), t.driver_name, null, v_at,
      'You''re driving soon: ' || v_title, v_html, 'You''re driving: ' || v_text);
    v_n := v_n + 1;
  end if;

  return v_n;
end;
$fn$;

-- ─── The demo week: an into-town-only ride and a pickup ──────────────────────

CREATE OR REPLACE FUNCTION public.seed_demo_trips_internal(p_camp uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_today date := demo_camp_today(p_camp);
  v_n integer := 0;
  r record;
  s record;
  v_trip uuid;
begin
  delete from scheduled_messages where camp_id = p_camp and subject_type in ('trip', 'trip_seat', 'trip_errand')
    and subject_id in (select demo_seed_uuid(p_camp, x) from unnest(array(
      select 'trip:' || k from generate_series(1, 8) k
      union all select 'seat:' || k from generate_series(1, 40) k
      union all select 'errand:' || k from generate_series(1, 12) k)) x);
  delete from ride_requests where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'ride:' || k) from generate_series(1, 5) k);
  delete from trip_errands where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'errand:' || k) from generate_series(1, 12) k);
  delete from trip_seats where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'seat:' || k) from generate_series(1, 40) k);
  delete from trips where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'trip:' || k) from generate_series(1, 8) k);

  -- Trip 4 is an into-town-only evening ride; trip 5 is the pickup that brings people home.
  --  k kind          direction     title                        destination                 day  depart   back day  return  seats driver                vehicle            closes
  for r in select * from (values
    (1, 'town_run',   'round_trip',  'Town run',                  'Main Street',               0,  '14:00', 0,  '16:00', 3, 'Maya Torres',         'Camp van #2',     '13:30'),
    (2, 'day_off',    'round_trip',  'Day-off shuttle into town', 'Town centre',               1,  '09:30', 1,  '17:30', 6, 'Devon Park',          'Camp van #1',     null),
    (3, 'supply_run', 'round_trip',  'Supply run',                'Hardware & building supply', 2, '10:00', 2,  '12:30', 2, 'Luis Ortega',         'Maintenance truck', '09:30'),
    (4, 'day_off',    'outbound',    'Evening ride into town',    'Town centre',               3,  '17:00', null, null,  4, 'Aisha Rahman',        null,              null),
    (5, 'pickup',     'pickup',      'Late pickup from town',     'Town centre',               3,  '21:30', 3,  '22:15', 3, 'Aisha Rahman',        null,              null),
    (6, 'town_run',   'round_trip',  'Town run',                  'Main Street',               5,  '13:00', 5,  '15:00', 4, 'Maya Torres',         'Camp van #2',     '12:30'),
    (7, 'day_off',    'round_trip',  'Day-off shuttle into town', 'Town centre',               8,  '09:30', 8,  '17:30', 6, 'Devon Park',          'Camp van #1',     null)
  ) as t(k, kind, direction, title, destination, depart_offset, depart_time, back_offset, return_time, seats, driver, vehicle, closes)
  loop
    v_trip := demo_seed_uuid(p_camp, 'trip:' || r.k);
    insert into trips (id, camp_id, kind, direction, title, destination, depart_date, depart_time, return_date, return_time,
      driver_name, vehicle_label, passenger_seats, errands_close_time, notes, status, created_at)
    values (v_trip, p_camp, r.kind, r.direction, r.title, r.destination, v_today + r.depart_offset, r.depart_time::time,
      case when r.back_offset is null then null else v_today + r.back_offset end, r.return_time::time,
      r.driver, r.vehicle, r.seats, r.closes::time,
      case r.k when 4 then 'One way — the late pickup brings people back.' when 3 then 'Picking up lumber for the dock; two seats only.' end,
      'planned', now() - interval '2 days');
    v_n := v_n + 1;
  end loop;

  -- Riders. Trip 4 carries three people into town; two of them already have a seat home on the
  -- late pickup (5). The third, Ruby, is who the board's "no ride back" warning is about, and the
  -- pickup still has one seat back to offer her.
  --  k  trip  rider              leg      status
  for s in select * from (values
    (1,  1, 'Noor Haddad',     'both',  'confirmed'),
    (2,  1, 'Ben Kowalski',    'both',  'confirmed'),
    (3,  1, 'Chloé Martin',    'both',  'confirmed'),
    (4,  1, 'Owen Brooks',     'both',  'waitlist'),
    (5,  2, 'Tess Nguyen',     'both',  'confirmed'),
    (6,  2, 'Kai Robinson',    'both',  'confirmed'),
    (7,  2, 'Hannah Frey',     'both',  'confirmed'),
    (8,  2, 'Marcus Webb',     'there', 'confirmed'),
    (9,  3, 'Grace Liu',       'both',  'confirmed'),
    (10, 3, 'Theo Adams',      'both',  'confirmed'),
    (11, 4, 'Ines Moreau',     'there', 'confirmed'),
    (12, 4, 'Jamal Carter',    'there', 'confirmed'),
    (13, 4, 'Ruby Walsh',      'there', 'confirmed'),
    (14, 5, 'Ines Moreau',     'back',  'confirmed'),
    (15, 5, 'Jamal Carter',    'back',  'confirmed'),
    (16, 6, 'Leo Fischer',     'both',  'confirmed'),
    (17, 7, 'Tess Nguyen',     'both',  'confirmed'),
    (18, 7, 'Sofia Rossi',     'both',  'confirmed')
  ) as t(k, trip, rider, leg, status)
  loop
    insert into trip_seats (id, camp_id, trip_id, rider_name, rider_email, leg, status, queued_at, confirmed_at, created_at)
    values (demo_seed_uuid(p_camp, 'seat:' || s.k), p_camp, demo_seed_uuid(p_camp, 'trip:' || s.trip), s.rider,
      lower(split_part(s.rider, ' ', 1)) || '.' || lower(split_part(s.rider, ' ', 2)) || '@example.com',
      s.leg, s.status, now() - interval '1 day' + make_interval(mins => s.k),
      case when s.status = 'confirmed' then now() - interval '1 day' + make_interval(mins => s.k) end,
      now() - interval '1 day' + make_interval(mins => s.k));
  end loop;

  --  k  trip  item                                   qty          store              activity      requester        status
  for s in select * from (values
    (1,  1,    'AA batteries',                         '24',        'Hardware store',  'Waterfront',  'Noor Haddad',   'open'),
    (2,  1,    'Poster board',                         '10 sheets', 'Dollar store',    'Arts & crafts', 'Chloé Martin', 'open'),
    (3,  1,    'Birthday candles',                     '2 packs',   'Grocery',         'Cabin 6',     'Ben Kowalski',  'bought'),
    (4,  3,    'Deck screws, 3 inch',                  '2 boxes',   'Hardware store',  'Dock repair', 'Luis Ortega',   'open'),
    (5,  null, 'Propane cylinder refill',              '2',         'Hardware store',  'Outdoor Ed',  'Sam Okafor',    'open'),
    (6,  null, 'Sunscreen SPF 50',                     '6 bottles', 'Pharmacy',        'Health centre', 'Hannah Frey', 'open'),
    (7,  null, 'Zip ties',                             '1 bag',     'Hardware store',  'Tripping',    'Jordan Lee',    'open'),
    (8,  null, 'Glow sticks',                          '100',       'Dollar store',    'Evening program', 'Kai Robinson', 'open'),
    (9,  6,    'Printer ink (black)',                  '2',         'Office supply',   'Office',      'Tess Nguyen',   'open')
  ) as t(k, trip, item, qty, store, activity, requester, status)
  loop
    insert into trip_errands (id, camp_id, trip_id, requester_name, item, quantity, store, for_activity, needed_by, status, done_at, created_at)
    values (demo_seed_uuid(p_camp, 'errand:' || s.k), p_camp,
      case when s.trip is null then null else demo_seed_uuid(p_camp, 'trip:' || s.trip) end,
      s.requester, s.item, s.qty, s.store, s.activity,
      case when s.trip is null then v_today + 4 end, s.status,
      case when s.status = 'bought' then now() - interval '1 hour' end,
      now() - make_interval(hours => 20 + s.k));
  end loop;

  --  k  requester        day  from     to       destination      leg     note
  for s in select * from (values
    (1, 'Priya Shah',     2,  '13:00', '16:00', 'Town centre',   'both',  'Day off — anything after lunch works'),
    (2, 'Owen Brooks',    3,  '09:00', '12:00', 'Pharmacy',      'both',  'Need to pick up a prescription'),
    (3, 'Ruby Walsh',     3,  '20:00', '23:00', 'Back to camp',  'back',  'Going in on the evening ride — need a way back')
  ) as t(k, requester, day, from_t, to_t, destination, leg, note)
  loop
    insert into ride_requests (id, camp_id, requester_name, wanted_date, earliest_time, latest_time, destination, leg, note, status, created_at)
    values (demo_seed_uuid(p_camp, 'ride:' || s.k), p_camp, s.requester, v_today + s.day, s.from_t::time, s.to_t::time,
      s.destination, s.leg, s.note, 'open', now() - make_interval(hours => 6 * s.k));
  end loop;

  perform plan_trip_messages_internal();
  return v_n;
end;
$fn$;

-- ─── Grants ──────────────────────────────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'trips_direction_legs_internal(text)',
    'trips_natural_leg_internal(text)',
    'trips_seat_clash_internal(public.trips,text,uuid)',
    'trips_release_seat_internal(uuid)',
    'trips_same_rider_internal(public.trip_seats,uuid,text)',
    'trips_claim_seat_internal(uuid,text,uuid,text)',
    'trips_queue_seat_message_internal(uuid,text)',
    'plan_trip_leaving_soon_internal(uuid)',
    'seed_demo_trips_internal(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;

  foreach f in array array[
    'create_trip(uuid,jsonb)',
    'update_trip(uuid,jsonb)',
    'claim_trip_seat(uuid,text,uuid)',
    'release_trip_seat(uuid)',
    'match_ride_request(uuid,uuid)',
    'set_errand_status(uuid,text,text)',
    'switch_trip_seat(uuid,uuid,text)',
    'offer_ride_back(uuid,uuid)',
    'request_ride_back(uuid)',
    'also_need_errand(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

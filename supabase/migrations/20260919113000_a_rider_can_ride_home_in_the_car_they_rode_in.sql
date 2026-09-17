-- A rider can ride home in the car they rode in, the last seat back says who needed it, "I need it
-- too" keeps your amount, and a pickup is reminded like a pickup.
--
-- What reviewers hit in the second demo round:
--   * Marcus Webb rode into town on the 9:30am day-off shuttle, a round trip coming back at 5:30pm
--     with two seats free on the way back, and the board said "Nothing with a free seat is coming
--     back that day or the next". The stranded rule looked for a way back on OTHER trips only, and
--     offer_ride_back could not use the rider's own car either: claiming a seat on a trip the rider
--     already sits in returns the existing there-only seat as "already". offer_ride_back(seat, its
--     own trip) now turns the there-only seat into there-and-back when that car has a seat back.
--   * "Grab a seat" took the last seat back on the late pickup while Ruby Walsh, stranded, had
--     asked for exactly that ride. claim_trip_seat now names who needed a last seat back it just
--     gave away (`last_seat_wanted_by`), from the database's own count, so the toast says so even
--     when the screen's prediction was a moment stale. The screen warns before the press.
--   * "I need it too" dropped the amount typed in the form. also_need_errand takes a quantity and
--     keeps it per person.
--   * The late pickup's reminder went at 7pm "leaving soon", when its riders were already in town
--     and the car had not left camp. A pickup is reminded as close to an hour before the pickup as
--     quiet hours allow (the outbox sends 08:00-19:59 camp-local, so a 9:30pm pickup at 7:30pm),
--     and its emails say "picks you up in town at", not "leaves".

-- ─── Who needs the last seat back ────────────────────────────────────────────

-- Names of people (not the claimer) waiting on the way back this trip offers: open back-only ride
-- requests for that day whose time window takes in the ride back, and there-only riders with no
-- confirmed way back who rode in no later than this car (that day or the day before), the car's
-- own there-only riders included. Mirrored by backSeatWantedBy() in src/lib/trips.ts.
create or replace function public.trips_back_seat_wanted_by_internal(p_trip public.trips, p_claimer uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with back_leg as (
    select case when p_trip.direction = 'pickup' then p_trip.depart_date else coalesce(p_trip.return_date, p_trip.depart_date) end as d,
           case when p_trip.direction = 'pickup' then p_trip.depart_time else coalesce(p_trip.return_time, p_trip.depart_time) end as tm
  ), people as (
    select r.requester_name as name, r.created_at as at
      from ride_requests r, back_leg b
     where p_trip.direction <> 'outbound'
       and r.camp_id = p_trip.camp_id and r.status = 'open' and r.leg = 'back'
       and r.requested_by is distinct from p_claimer
       and r.wanted_date = b.d
       and (r.earliest_time is null or r.earliest_time <= b.tm)
       and (r.latest_time is null or r.latest_time >= b.tm)
    union all
    select s.rider_name, s.queued_at
      from trip_seats s join trips o on o.id = s.trip_id
     where p_trip.direction <> 'outbound'
       and s.camp_id = p_trip.camp_id and s.status = 'confirmed' and s.leg = 'there'
       and o.status <> 'cancelled'
       and s.rider_user_id is distinct from p_claimer
       and p_trip.depart_date - o.depart_date between 0 and 1
       and (p_trip.depart_date > o.depart_date or p_trip.depart_time >= o.depart_time)
       and not exists (
         select 1 from trip_seats x join trips xt on xt.id = x.trip_id
          where x.camp_id = s.camp_id and x.id <> s.id and x.trip_id <> s.trip_id
            and x.status = 'confirmed' and x.leg in ('back','both') and xt.status <> 'cancelled'
            and xt.depart_date - o.depart_date between 0 and 1
            and (xt.depart_date > o.depart_date or xt.depart_time >= o.depart_time)
            and public.trips_same_rider_internal(s, x.rider_user_id, x.rider_name))
  )
  select coalesce(jsonb_agg(name order by first_at), '[]'::jsonb)
    from (select name, min(at) as first_at from people group by name) q;
$fn$;

CREATE OR REPLACE FUNCTION public.claim_trip_seat(p_trip_id uuid, p_leg text DEFAULT NULL::text, p_rider_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  t trips; v_rider uuid := coalesce(p_rider_user_id, auth.uid()); v_leg text; v_wanted jsonb; v_res jsonb; u record;
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
  v_leg := coalesce(p_leg, public.trips_natural_leg_internal(t.direction));

  -- Who was waiting on the last seat back, read before it goes. Informational: the seat is still
  -- the claimer's to take, but the answer says whose ride home it was.
  if v_leg in ('both','back') then
    select * into u from public.trips_legs_used_internal(t.id);
    if t.passenger_seats - u.back_used = 1 then
      v_wanted := public.trips_back_seat_wanted_by_internal(t, v_rider);
    end if;
  end if;

  v_res := public.trips_claim_seat_internal(t.id, v_leg, v_rider, public.trips_person_name_internal(t.camp_id, v_rider));
  if v_res->>'status' = 'confirmed' and not coalesce((v_res->>'already')::boolean, false)
     and jsonb_array_length(coalesce(v_wanted, '[]'::jsonb)) > 0 then
    v_res := v_res || jsonb_build_object('last_seat_wanted_by', v_wanted);
  end if;
  return v_res;
end;
$fn$;

-- ─── A way home in the same car ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.offer_ride_back(p_seat_id uuid, p_trip_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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

  if t.id = s.trip_id then
    -- The car they rode in is coming back: the there-only seat becomes there-and-back when the
    -- way back has room. Allowed while the car is out -- that is when a rider in town asks.
    if t.direction <> 'round_trip' then raise exception 'leg_not_offered' using detail = t.direction; end if;
    if t.status not in ('planned','out') then raise exception 'trip_not_open'; end if;
    select * into s from trip_seats where id = p_seat_id;
    if s.status = 'waitlist' then raise exception 'seat_on_waitlist'; end if;
    if s.status <> 'confirmed' or s.leg <> 'there' then raise exception 'not_a_one_way_seat'; end if;
    if not public.trips_leg_fits_internal(t.id, t.passenger_seats, 'back') then raise exception 'no_seat_back'; end if;
    update trip_seats set leg = 'both' where id = s.id;
    perform public.trips_queue_seat_message_internal(s.id, 'ride_back_added');
    perform public.plan_trip_leaving_soon_internal(t.id);
    v_seat := s.id;
    v_res := jsonb_build_object('seat_id', s.id, 'status', 'confirmed', 'leg', 'both', 'already', false, 'same_trip', true);
  else
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
  end if;

  update ride_requests r set status = 'matched', matched_trip_id = t.id, matched_seat_id = v_seat
   where r.camp_id = s.camp_id and r.status = 'open' and r.leg = 'back'
     and r.wanted_date between t_out.depart_date and t_out.depart_date + 1
     and public.trips_same_rider_internal(s, r.requested_by, r.requester_name);
  return v_res;
end;
$fn$;

-- ─── "I need it too", with how much ──────────────────────────────────────────

drop function if exists public.also_need_errand(uuid);

create or replace function public.also_need_errand(p_errand_id uuid, p_quantity text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare e trip_errands; v_me uuid := auth.uid(); v_qty text := nullif(left(btrim(coalesce(p_quantity, '')), 60), '');
begin
  select * into e from trip_errands where id = p_errand_id for update;
  if not found then raise exception 'errand_not_found'; end if;
  perform public.trips_require_writer_internal(e.camp_id);
  if e.status <> 'open' then raise exception 'errand_not_open'; end if;
  if e.requested_by is not distinct from v_me then return; end if;
  if e.also_needed_by @> jsonb_build_array(jsonb_build_object('user_id', v_me)) then
    -- Asked again with an amount: the amount is updated, the person is not added twice.
    if v_qty is not null then
      update trip_errands
         set also_needed_by = (select jsonb_agg(case when x->>'user_id' = v_me::text
                                                     then x || jsonb_build_object('quantity', v_qty) else x end
                                                order by ord)
                                 from jsonb_array_elements(also_needed_by) with ordinality as a(x, ord))
       where id = e.id;
    end if;
    return;
  end if;
  update trip_errands
     set also_needed_by = also_needed_by || jsonb_build_array(jsonb_build_object(
           'user_id', v_me, 'name', public.trips_person_name_internal(e.camp_id, v_me), 'quantity', v_qty, 'at', now()))
   where id = e.id;
end;
$fn$;

-- ─── A pickup is reminded like a pickup ──────────────────────────────────────

-- An hour before the pickup, except the outbox only sends 08:00-19:59 camp-local: a pickup whose
-- hour-before falls at 8pm or later is reminded at 7:30pm that evening (the last send before quiet
-- hours, when the riders are in town and can still plan), one before 9am at 8am if it is after
-- 8, otherwise at 7:30pm the evening before. Mirrored by pickupReminderAt() in src/lib/trips.ts.
create or replace function public.trip_pickup_reminder_at_internal(p_date date, p_time time, p_tz text)
returns timestamptz
language plpgsql
immutable
set search_path to 'public'
as $fn$
declare v_local timestamp := (p_date + p_time) - interval '60 minutes';
begin
  if extract(hour from v_local) >= 20 then
    v_local := v_local::date + time '19:30';
  elsif extract(hour from v_local) < 8 then
    if p_time >= time '08:00' then
      v_local := p_date + time '08:00';
    else
      v_local := (p_date - 1) + time '19:30';
    end if;
  end if;
  return v_local at time zone p_tz;
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
  v_title text; v_subject text; v_html text; v_text text; v_at_clock text; v_back_clock text; v_where text;
begin
  select tr.*, c.name as camp_name, c.timezone as tz into t
    from trips tr join camps c on c.id = tr.camp_id where tr.id = p_trip_id;
  if not found then return 0; end if;

  v_key := 'leaving_soon@' || to_char(t.depart_date + t.depart_time, 'YYYY-MM-DD"T"HH24:MI');
  v_driver_key := v_key || ':' || coalesce(t.driver_user_id::text, 'none');
  v_depart := (t.depart_date + t.depart_time) at time zone t.tz;
  v_at := case when t.direction = 'pickup'
               then public.trip_pickup_reminder_at_internal(t.depart_date, t.depart_time, t.tz)
               else public.trip_leaving_soon_at_internal(t.depart_date, t.depart_time, t.tz) end;

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
  v_at_clock := lower(to_char(t.depart_date + t.depart_time, 'FMHH12:MIam'));
  v_back_clock := lower(to_char(coalesce(t.return_date, t.depart_date) + t.return_time, 'FMHH12:MIam'));

  if t.direction = 'pickup' then
    -- The riders are in town and the car is coming to them: say where and when it picks up.
    v_where := coalesce(nullif(btrim(t.destination), ''), 'town');
    v_subject := 'Pickup soon: ' || v_title;
    v_html := public.msg_wrap('Your pickup is coming',
      '<strong>' || public.trips_esc_internal(t.title) || '</strong> picks you up in '
      || public.trips_esc_internal(v_where) || ' at ' || v_at_clock
      || coalesce(' — back at camp around ' || v_back_clock, '')
      || coalesce('.<br>Driver: ' || public.trips_esc_internal(t.driver_name), '.')
      || coalesce('<br>' || public.trips_esc_internal(t.notes), ''),
      public.trips_esc_internal(t.camp_name));
    v_text := 'Pickup soon: ' || t.title || ' picks you up in ' || v_where || ' at ' || v_at_clock
      || coalesce(', back at camp ~' || v_back_clock, '')
      || coalesce('. Driver ' || t.driver_name, '') || '.';
  else
    v_subject := 'Leaving soon: ' || v_title;
    v_html := public.msg_wrap('Leaving soon',
      '<strong>' || public.trips_esc_internal(v_title) || '</strong> leaves at ' || v_at_clock
      || coalesce(' — back around ' || v_back_clock, '')
      || coalesce('.<br>Driver: ' || public.trips_esc_internal(t.driver_name), '.')
      || coalesce('<br>' || public.trips_esc_internal(t.notes), ''),
      public.trips_esc_internal(t.camp_name));
    v_text := 'Leaving soon: ' || v_title || ' at ' || v_at_clock
      || coalesce(', back ~' || v_back_clock, '')
      || coalesce('. Driver ' || t.driver_name, '') || '.';
  end if;

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

CREATE OR REPLACE FUNCTION public.trips_queue_seat_message_internal(p_seat_id uuid, p_rule text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  s record;
  v_head text; v_title text; v_line text; v_leaves text;
begin
  select ts.*, tr.title, tr.direction, tr.destination, tr.depart_date, tr.depart_time, tr.return_date, tr.return_time,
         tr.driver_name, c.name as camp_name
    into s
    from trip_seats ts join trips tr on tr.id = ts.trip_id join camps c on c.id = ts.camp_id
   where ts.id = p_seat_id;
  if not found then return; end if;

  v_head := case p_rule when 'waitlist_promoted' then 'A seat opened up — you''re in'
                        when 'ride_back_added' then 'You''re riding back too'
                        else 'You have a seat' end;
  v_title := s.title || case when coalesce(s.destination, '') = '' then ''
                             when s.direction = 'pickup' then ' · ' || s.destination || ' → camp'
                             else ' → ' || s.destination end;
  v_line := case s.leg when 'there' then 'Ride there only — you need your own way back.'
                       when 'back' then case when s.direction = 'pickup' then 'Pickup back to camp.' else 'Ride back only.' end
                       else 'There and back.' end;
  -- A pickup does not "leave" anywhere the rider is: it picks them up in town.
  v_leaves := case when s.direction = 'pickup' then 'Picks up in town ' else 'Leaves ' end;

  perform public.queue_message(s.camp_id, 'trip_seat', s.id, p_rule, 'rider',
    coalesce(public.user_email(s.rider_user_id), s.rider_email), s.rider_name, null, now(),
    v_head || ': ' || v_title,
    public.msg_wrap(v_head,
      '<strong>' || public.trips_esc_internal(v_title) || '</strong><br>'
      || v_leaves || public.trips_fmt_when_internal(s.depart_date, s.depart_time)
      || coalesce('<br>Back ' || public.trips_fmt_when_internal(coalesce(s.return_date, s.depart_date), s.return_time), '')
      || coalesce('<br>Driver: ' || public.trips_esc_internal(s.driver_name), '')
      || '<br><br>' || v_line,
      public.trips_esc_internal(s.camp_name)),
    v_head || ': ' || v_title || ', ' || lower(v_leaves) || public.trips_fmt_when_internal(s.depart_date, s.depart_time)
      || coalesce('. Driver ' || s.driver_name, '') || '. ' || v_line);
end;
$fn$;

-- ─── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function public.trips_back_seat_wanted_by_internal(public.trips, uuid) from public, anon, authenticated;
grant execute on function public.trips_back_seat_wanted_by_internal(public.trips, uuid) to service_role;
revoke execute on function public.trip_pickup_reminder_at_internal(date, time, text) from public, anon, authenticated;
grant execute on function public.trip_pickup_reminder_at_internal(date, time, text) to service_role;
revoke execute on function public.plan_trip_leaving_soon_internal(uuid) from public, anon, authenticated;
revoke execute on function public.trips_queue_seat_message_internal(uuid, text) from public, anon, authenticated;

revoke execute on function public.claim_trip_seat(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_trip_seat(uuid, text, uuid) to authenticated, service_role;
revoke execute on function public.offer_ride_back(uuid, uuid) from public, anon, authenticated;
grant execute on function public.offer_ride_back(uuid, uuid) to authenticated, service_role;
revoke execute on function public.also_need_errand(uuid, text) from public, anon, authenticated;
grant execute on function public.also_need_errand(uuid, text) to authenticated, service_role;

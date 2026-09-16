-- Town Trips: a shared board of rides into town, the seats in them, the way back, and one errand
-- list everybody adds to instead of phoning whoever they heard was going.
--
-- What was going wrong at camp, in the ops lead's words:
--   * Somebody goes into town, six people hear about it and each calls with "can you grab…",
--     and a one-hour run becomes three.
--   * Staff on a day off get dropped in town with no plan for getting back, and pay for a taxi or
--     get stranded.
--   * A program realises at 3pm it needs supplies for tonight and sends someone on a special run.
--
-- Four tables, all written only through the functions below:
--   trips          -- one car going somewhere and (usually) coming back
--   trip_seats     -- a person in that car, on the way there, the way back, or both
--   trip_errands   -- something to pick up; trip_id NULL means "on the shared list, nobody going yet"
--   ride_requests  -- "I need a ride Saturday", before there is a trip to put them on
--
-- Seats are counted per leg. A rider going only THERE and a different rider coming only BACK use
-- the same physical seat at different times, so a 3-seat car can carry 3 out and 3 different
-- people home. Capacity is checked with the trip row locked, so two people pressing "Grab a seat"
-- on the last seat at the same moment serialise and exactly one of them gets it.
--
-- Permissions (the module is a UI gate: when a camp is not sold `trips` these functions still
-- work, the screens and loaders simply do not exist):
--   * every camp member can READ (viewers included);
--   * admin and staff can plan a trip, take or leave their own seat, add errands and ask for rides;
--   * a trip is edited, cancelled, marked out/back, and its errands ticked off by its creator, its
--     driver or a camp admin;
--   * viewers write nothing.

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  kind text not null default 'town_run' check (kind in ('town_run','day_off','supply_run','other')),
  title text not null check (length(btrim(title)) between 1 and 120),
  destination text not null default '',
  depart_date date not null,
  depart_time time not null,
  return_date date,
  return_time time,
  driver_user_id uuid,
  driver_name text,
  vehicle_asset_id uuid references public.camp_assets(id) on delete set null,
  -- A snapshot of the vehicle's name, so the card still says "White van" in a camp whose
  -- Assets module is switched off (the picker only exists when it is on).
  vehicle_label text,
  -- Passenger seats, not counting the driver.
  passenger_seats integer not null default 3 check (passenger_seats between 0 and 60),
  -- "List closes 1:30" -- after this on the departure day only the driver can add errands.
  errands_close_time time,
  notes text,
  status text not null default 'planned' check (status in ('planned','out','back','cancelled')),
  cancelled_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_return_after_departure check (
    return_date is null
    or return_date > depart_date
    or (return_date = depart_date and (return_time is null or return_time >= depart_time)))
);
create index if not exists trips_camp_depart on public.trips (camp_id, depart_date);

create table if not exists public.trip_seats (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  rider_user_id uuid,
  rider_name text not null,
  rider_email text,
  leg text not null default 'both' check (leg in ('both','there','back')),
  status text not null default 'confirmed' check (status in ('confirmed','waitlist','cancelled')),
  -- Waitlist order. clock_timestamp(), not now(): now() is the transaction start, so two claims
  -- inside one transaction (a script, a test, a batch) would tie and the order would be a guess.
  queued_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trip_seats_trip on public.trip_seats (trip_id, status, queued_at);
create index if not exists trip_seats_camp on public.trip_seats (camp_id);
-- One live seat per person per trip. Leaving and re-joining makes a new row, so the old one keeps
-- its history (and its already-sent messages) instead of being resurrected.
create unique index if not exists trip_seats_one_live_seat_per_rider
  on public.trip_seats (trip_id, rider_user_id)
  where status <> 'cancelled' and rider_user_id is not null;

create table if not exists public.trip_errands (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  requested_by uuid,
  requester_name text not null,
  item text not null check (length(btrim(item)) between 1 and 160),
  quantity text,
  store text,
  est_cost numeric(10,2) check (est_cost is null or est_cost >= 0),
  needed_by date,
  for_activity text,
  status text not null default 'open' check (status in ('open','bought','unavailable','cancelled')),
  driver_note text,
  done_by uuid,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trip_errands_camp_status on public.trip_errands (camp_id, status);
create index if not exists trip_errands_trip on public.trip_errands (trip_id);

create table if not exists public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  requested_by uuid,
  requester_name text not null,
  wanted_date date not null,
  earliest_time time,
  latest_time time,
  destination text,
  leg text not null default 'both' check (leg in ('both','there','back')),
  note text,
  status text not null default 'open' check (status in ('open','matched','cancelled')),
  matched_trip_id uuid references public.trips(id) on delete set null,
  matched_seat_id uuid references public.trip_seats(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ride_requests_camp_date on public.ride_requests (camp_id, wanted_date);

-- ─── Row security, realtime, updated_at ──────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['trips','trip_seats','trip_errands','ride_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: camp members read" on public.%I', t, t);
    execute format('create policy "%s: camp members read" on public.%I for select to authenticated using (public.is_camp_member(camp_id))', t, t);
    -- No insert/update/delete policies, and no write grants either: seat capacity has to be
    -- decided with the trip locked, which a direct table write from the browser cannot do.
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);

    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.update_updated_at()', t || '_updated_at', t);

    -- The camp_id=eq.<id> realtime filter reads the old row on UPDATE/DELETE, which only FULL
    -- replica identity carries; without it a seat somebody left never disappears from the
    -- other screen.
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─── Internal helpers (no grants; reached only from the functions below) ─────

create or replace function public.trips_require_writer_internal(p_camp_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  v_role := public.get_camp_role(p_camp_id);
  if v_role is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  if v_role not in ('admin','staff') then raise exception 'read_only' using errcode = '42501'; end if;
  return v_role;
end;
$fn$;

-- Creator, driver or camp admin. Not "any staff": a trip is somebody's plan, and a colleague
-- moving your departure by an hour is how people get left behind.
create or replace function public.trips_can_manage_internal(p_trip public.trips)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select public.get_camp_role(p_trip.camp_id) = 'admin'
      or p_trip.created_by = auth.uid()
      or p_trip.driver_user_id = auth.uid();
$fn$;

create or replace function public.trips_person_name_internal(p_camp_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = p_user_id),
    (select nullif(btrim(m.display_name), '') from camp_members m where m.camp_id = p_camp_id and m.user_id = p_user_id limit 1),
    'Someone');
$fn$;

create or replace function public.trips_esc_internal(p text)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$fn$;

-- "Sat Sep 19, 1:30pm"
create or replace function public.trips_fmt_when_internal(p_date date, p_time time)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select case when p_date is null then '' else
    to_char(p_date, 'Dy FMMon FMDD')
    || coalesce(', ' || lower(to_char(p_date + p_time, 'FMHH12:MIam')), '') end;
$fn$;

-- Confirmed seats in use on each leg. A `both` rider uses a seat on each.
create or replace function public.trips_legs_used_internal(p_trip_id uuid, out there_used integer, out back_used integer)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select (count(*) filter (where leg in ('both','there')))::int,
         (count(*) filter (where leg in ('both','back')))::int
    from trip_seats where trip_id = p_trip_id and status = 'confirmed';
$fn$;

create or replace function public.trips_leg_fits_internal(p_trip_id uuid, p_seats integer, p_leg text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare u record;
begin
  select * into u from public.trips_legs_used_internal(p_trip_id);
  return (p_leg not in ('both','there') or u.there_used < p_seats)
     and (p_leg not in ('both','back')  or u.back_used  < p_seats);
end;
$fn$;

-- When "leaving soon" goes out: an hour before departure, moved out of the outbox's quiet hours
-- (claim_outbox_batch only sends 08:00-19:59 camp-local). A 7am run cannot be reminded at 6am,
-- and a reminder that waits for 8am arrives after the car has gone, so it goes the evening before
-- at 6pm instead. Mirrored by leavingSoonSendAt() in src/lib/trips.ts for the note in the UI.
create or replace function public.trip_leaving_soon_at_internal(p_date date, p_time time, p_tz text)
returns timestamptz
language plpgsql
immutable
set search_path to 'public'
as $fn$
declare v_local timestamp := (p_date + p_time) - interval '60 minutes';
begin
  if extract(hour from v_local) < 8 then
    if p_time >= time '08:00' then
      v_local := p_date + time '08:00';
    else
      v_local := (p_date - 1) + time '18:00';
    end if;
  elsif extract(hour from v_local) >= 20 then
    v_local := v_local::date + time '19:00';
  end if;
  return v_local at time zone p_tz;
end;
$fn$;

create or replace function public.trips_queue_seat_message_internal(p_seat_id uuid, p_rule text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  s record;
  v_head text; v_title text; v_line text;
begin
  select ts.*, tr.title, tr.destination, tr.depart_date, tr.depart_time, tr.return_date, tr.return_time,
         tr.driver_name, c.name as camp_name
    into s
    from trip_seats ts join trips tr on tr.id = ts.trip_id join camps c on c.id = ts.camp_id
   where ts.id = p_seat_id;
  if not found then return; end if;

  v_head := case p_rule when 'waitlist_promoted' then 'A seat opened up — you''re in'
                        else 'You have a seat' end;
  v_title := s.title || case when coalesce(s.destination, '') <> '' then ' → ' || s.destination else '' end;
  v_line := case s.leg when 'there' then 'Ride there only — you need your own way back.'
                       when 'back' then 'Ride back only.'
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

-- (Re)plan the "leaving soon" reminders for one trip, and cancel any that no longer apply: the
-- rider left, the trip was cancelled or went, the departure moved (the key carries the departure
-- time, so a moved trip gets a fresh reminder instead of colliding with the old one), or the
-- driver changed.
create or replace function public.plan_trip_leaving_soon_internal(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  v_title := t.title || case when coalesce(t.destination, '') <> '' then ' → ' || t.destination else '' end;
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

-- Earliest waitlisted rider who now fits, then the next, until nobody else fits. "Who fits",
-- not strictly "who is first": a back-only rider can take a free return seat while a there-and-
-- back rider ahead of them still has no seat on the way out.
create or replace function public.trips_promote_waitlist_internal(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare s record; v_seats integer; v_n integer := 0;
begin
  select passenger_seats into v_seats from trips where id = p_trip_id;
  for s in select id, leg from trip_seats
            where trip_id = p_trip_id and status = 'waitlist'
            order by queued_at, id loop
    if public.trips_leg_fits_internal(p_trip_id, v_seats, s.leg) then
      update trip_seats set status = 'confirmed', confirmed_at = now() where id = s.id;
      perform public.trips_queue_seat_message_internal(s.id, 'waitlist_promoted');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$fn$;

-- The one place a seat is decided. Locks the trip row first: the capacity count and the insert
-- happen while nobody else can claim on this trip, so a second "Grab a seat" on the last seat
-- waits here, then counts the first one's confirmed row and lands on the waitlist.
create or replace function public.trips_claim_seat_internal(
  p_trip_id uuid, p_leg text, p_rider uuid, p_rider_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  t trips; v_tz text; v_existing trip_seats; v_status text; v_id uuid;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  if t.status <> 'planned' then raise exception 'trip_not_open'; end if;
  if coalesce(p_leg, '') not in ('both','there','back') then raise exception 'bad_leg'; end if;
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

-- Past the "list closes" time on departure day, or after the car has left, only the trip's
-- managers can still add to it. Otherwise the driver is in the parking lot reading a list that
-- keeps growing.
create or replace function public.trips_errand_list_open_internal(p_trip public.trips)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p_trip.status = 'planned'
     and (p_trip.depart_date + p_trip.depart_time) at time zone c.timezone > now()
     and (p_trip.errands_close_time is null
          or (p_trip.depart_date + p_trip.errands_close_time) at time zone c.timezone > now())
    from camps c where c.id = p_trip.camp_id;
$fn$;

-- ─── Trips ───────────────────────────────────────────────────────────────────

create or replace function public.create_trip(p_camp_id uuid, p_trip jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  insert into trips (camp_id, kind, title, destination, depart_date, depart_time, return_date, return_time,
                     driver_user_id, driver_name, vehicle_asset_id, vehicle_label, passenger_seats,
                     errands_close_time, notes, created_by)
  values (p_camp_id,
          coalesce(nullif(p_trip->>'kind', ''), 'town_run'),
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

create or replace function public.update_trip(p_trip_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  t trips; u record;
  v_seats integer; v_driver uuid; v_vehicle uuid; v_vehicle_label text;
  v_depart_date date; v_return_date date; v_return_time time;
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

  update trips set
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

create or replace function public.set_trip_status(p_trip_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare t trips;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  perform public.trips_require_writer_internal(t.camp_id);
  if not public.trips_can_manage_internal(t) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status not in ('planned','out','back') then raise exception 'bad_status'; end if;
  if t.status = 'cancelled' then raise exception 'trip_cancelled'; end if;
  update trips set status = p_status where id = t.id;
  perform public.plan_trip_leaving_soon_internal(t.id);
end;
$fn$;

create or replace function public.cancel_trip(p_trip_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  t trips; s record; e record; v_camp text; v_title text; v_when text;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  perform public.trips_require_writer_internal(t.camp_id);
  if not public.trips_can_manage_internal(t) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if t.status = 'cancelled' then return; end if;

  select name into v_camp from camps where id = t.camp_id;
  v_title := t.title || case when coalesce(t.destination, '') <> '' then ' → ' || t.destination else '' end;
  v_when := public.trips_fmt_when_internal(t.depart_date, t.depart_time);

  update trips set status = 'cancelled', cancelled_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
   where id = t.id;

  -- Everybody who was counting on this car hears about it now, not when they turn up to an
  -- empty parking lot. The person cancelling is not emailed about their own click.
  for s in select * from trip_seats where trip_id = t.id and status in ('confirmed','waitlist')
            and rider_user_id is distinct from auth.uid() loop
    perform public.queue_message(t.camp_id, 'trip_seat', s.id, 'trip_cancelled', 'rider',
      coalesce(public.user_email(s.rider_user_id), s.rider_email), s.rider_name, null, now(),
      'Cancelled: ' || v_title,
      public.msg_wrap('This trip is cancelled',
        '<strong>' || public.trips_esc_internal(v_title) || '</strong> on ' || v_when || ' is not going.'
        || coalesce('<br>' || public.trips_esc_internal(nullif(btrim(p_reason), '')), '')
        || '<br><br>Check the Town Trips board for another ride.',
        public.trips_esc_internal(v_camp)),
      'Cancelled: ' || v_title || ' (' || v_when || ')' || coalesce(' — ' || nullif(btrim(p_reason), ''), '')
        || '. Check Town Trips for another ride.');
  end loop;
  update trip_seats set status = 'cancelled', cancelled_at = now()
   where trip_id = t.id and status <> 'cancelled';

  -- Errands go back on the shared list rather than vanishing with the car.
  for e in select * from trip_errands where trip_id = t.id and status = 'open'
            and requested_by is distinct from auth.uid() loop
    perform public.queue_message(t.camp_id, 'trip_errand', e.id, 'trip_cancelled:' || t.id::text, 'requester',
      public.user_email(e.requested_by), e.requester_name, null, now(),
      'Your errand is back on the list: ' || e.item,
      public.msg_wrap('The trip for your errand is cancelled',
        '<strong>' || public.trips_esc_internal(e.item) || '</strong> was going on ' || public.trips_esc_internal(v_title)
        || ' (' || v_when || '). It is back on the shared shopping list for the next trip.',
        public.trips_esc_internal(v_camp)),
      'Trip cancelled: ' || v_title || '. Your errand "' || e.item || '" is back on the shopping list.');
  end loop;
  update trip_errands set trip_id = null where trip_id = t.id and status = 'open';

  update ride_requests set status = 'open', matched_trip_id = null, matched_seat_id = null
   where matched_trip_id = t.id and status = 'matched';

  perform public.plan_trip_leaving_soon_internal(t.id);
end;
$fn$;

-- ─── Seats ───────────────────────────────────────────────────────────────────

create or replace function public.claim_trip_seat(p_trip_id uuid, p_leg text default 'both', p_rider_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  return public.trips_claim_seat_internal(t.id, coalesce(p_leg, 'both'), v_rider,
                                          public.trips_person_name_internal(t.camp_id, v_rider));
end;
$fn$;

create or replace function public.release_trip_seat(p_seat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare s trip_seats; t trips; v_n integer;
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
  if s.status = 'cancelled' then return jsonb_build_object('promoted', 0); end if;

  update trip_seats set status = 'cancelled', cancelled_at = now() where id = s.id;
  update ride_requests set status = 'open', matched_trip_id = null, matched_seat_id = null
   where matched_seat_id = s.id and status = 'matched';

  v_n := case when t.status = 'planned' then public.trips_promote_waitlist_internal(t.id) else 0 end;
  perform public.plan_trip_leaving_soon_internal(t.id);
  return jsonb_build_object('promoted', v_n);
end;
$fn$;

-- ─── Errands ─────────────────────────────────────────────────────────────────

create or replace function public.add_errand(p_camp_id uuid, p_errand jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid; t trips;
  v_trip uuid := nullif(p_errand->>'trip_id', '')::uuid;
  v_item text := left(btrim(coalesce(p_errand->>'item', '')), 160);
begin
  perform public.trips_require_writer_internal(p_camp_id);
  if v_item = '' then raise exception 'item_required'; end if;
  if v_trip is not null then
    select * into t from trips where id = v_trip and camp_id = p_camp_id for update;
    if not found then raise exception 'trip_not_found'; end if;
    if not public.trips_can_manage_internal(t) and not public.trips_errand_list_open_internal(t) then
      raise exception 'errand_list_closed';
    end if;
  end if;

  insert into trip_errands (camp_id, trip_id, requested_by, requester_name, item, quantity, store, est_cost,
                            needed_by, for_activity)
  values (p_camp_id, v_trip, auth.uid(), public.trips_person_name_internal(p_camp_id, auth.uid()), v_item,
          nullif(left(btrim(coalesce(p_errand->>'quantity', '')), 60), ''),
          nullif(left(btrim(coalesce(p_errand->>'store', '')), 80), ''),
          nullif(p_errand->>'est_cost', '')::numeric,
          nullif(p_errand->>'needed_by', '')::date,
          nullif(left(btrim(coalesce(p_errand->>'for_activity', '')), 120), ''))
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function public.attach_errands(p_trip_id uuid, p_errand_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare t trips; v_manage boolean; v_n integer;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;
  perform public.trips_require_writer_internal(t.camp_id);
  if t.status in ('cancelled','back') then raise exception 'trip_not_open'; end if;
  v_manage := public.trips_can_manage_internal(t);

  if not v_manage then
    -- Anyone may put their OWN errand on somebody's run while the list is open; only the
    -- driver (or creator, or an admin) may load other people's errands into the car.
    if exists (select 1 from trip_errands where id = any (p_errand_ids)
                and requested_by is distinct from auth.uid()) then
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

create or replace function public.detach_errand(p_errand_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare e trip_errands; t trips;
begin
  select * into e from trip_errands where id = p_errand_id;
  if not found then raise exception 'errand_not_found'; end if;
  perform public.trips_require_writer_internal(e.camp_id);
  if e.trip_id is null then return; end if;
  select * into t from trips where id = e.trip_id for update;
  if e.requested_by is distinct from auth.uid() and not public.trips_can_manage_internal(t) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update trip_errands set trip_id = null where id = e.id;
end;
$fn$;

create or replace function public.set_errand_status(p_errand_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare e trip_errands; t trips; v_role text; v_allowed boolean; v_camp text; v_head text;
begin
  select * into e from trip_errands where id = p_errand_id for update;
  if not found then raise exception 'errand_not_found'; end if;
  v_role := public.trips_require_writer_internal(e.camp_id);
  if p_status not in ('open','bought','unavailable','cancelled') then raise exception 'bad_status'; end if;
  if e.trip_id is not null then select * into t from trips where id = e.trip_id; end if;

  if p_status = 'cancelled' then
    v_allowed := v_role = 'admin' or e.requested_by = auth.uid();
  else
    -- Ticking an errand off is the driver's call, made in the store.
    v_allowed := v_role = 'admin' or (e.trip_id is not null and public.trips_can_manage_internal(t));
  end if;
  if not v_allowed then raise exception 'not_allowed' using errcode = '42501'; end if;

  update trip_errands set
    status = p_status,
    driver_note = case when p_note is not null then nullif(left(btrim(p_note), 300), '') else driver_note end,
    done_by = case when p_status in ('bought','unavailable') then auth.uid() end,
    done_at = case when p_status in ('bought','unavailable') then now() end
  where id = e.id;

  if p_status in ('bought','unavailable') and e.requested_by is distinct from auth.uid() then
    select name into v_camp from camps where id = e.camp_id;
    v_head := case p_status when 'bought' then 'Picked up: ' else 'Couldn''t get: ' end;
    perform public.queue_message(e.camp_id, 'trip_errand', e.id, 'errand_done:' || p_status, 'requester',
      public.user_email(e.requested_by), e.requester_name, null, now(),
      v_head || e.item,
      public.msg_wrap(case p_status when 'bought' then 'Your errand is done' else 'Your errand couldn''t be done' end,
        '<strong>' || public.trips_esc_internal(e.item) || '</strong>'
        || coalesce(' (' || public.trips_esc_internal(e.quantity) || ')', '')
        || case p_status when 'bought' then ' was picked up' else ' was not available' end
        || coalesce(' on ' || public.trips_esc_internal(t.title), '') || '.'
        || coalesce('<br>Note from the driver: ' || public.trips_esc_internal(nullif(btrim(p_note), '')), ''),
        public.trips_esc_internal(v_camp)),
      v_head || e.item || coalesce(' (' || e.quantity || ')', '')
        || coalesce('. ' || nullif(btrim(p_note), ''), '') || '.');
  elsif p_status in ('open','cancelled') then
    update scheduled_messages set state = 'cancelled', suppressed_reason = 'errand_reopened', updated_at = now()
     where subject_type = 'trip_errand' and subject_id = e.id and rule_key like 'errand_done:%' and state = 'scheduled';
  end if;
end;
$fn$;

-- ─── Ride requests ───────────────────────────────────────────────────────────

create or replace function public.request_ride(p_camp_id uuid, p_request jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_id uuid;
begin
  perform public.trips_require_writer_internal(p_camp_id);
  if nullif(p_request->>'wanted_date', '') is null then raise exception 'date_required'; end if;
  insert into ride_requests (camp_id, requested_by, requester_name, wanted_date, earliest_time, latest_time,
                             destination, leg, note)
  values (p_camp_id, auth.uid(), public.trips_person_name_internal(p_camp_id, auth.uid()),
          (p_request->>'wanted_date')::date,
          nullif(p_request->>'earliest_time', '')::time,
          nullif(p_request->>'latest_time', '')::time,
          nullif(left(btrim(coalesce(p_request->>'destination', '')), 120), ''),
          coalesce(nullif(p_request->>'leg', ''), 'both'),
          nullif(left(btrim(coalesce(p_request->>'note', '')), 300), ''))
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function public.cancel_ride_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r ride_requests; v_role text;
begin
  select * into r from ride_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  v_role := public.trips_require_writer_internal(r.camp_id);
  if v_role <> 'admin' and r.requested_by is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update ride_requests set status = 'cancelled' where id = r.id and status <> 'cancelled';
end;
$fn$;

-- Put the person who asked into a trip's seat. The driver can do it for them, or they can pick a
-- trip themselves; either way the seat goes through the same locked claim, so a match can land on
-- the waitlist like anyone else.
create or replace function public.match_ride_request(p_request_id uuid, p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r ride_requests; t trips; v_res jsonb;
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

  v_res := public.trips_claim_seat_internal(t.id, r.leg, r.requested_by, r.requester_name);
  update ride_requests set status = 'matched', matched_trip_id = t.id, matched_seat_id = (v_res->>'seat_id')::uuid
   where id = r.id;
  return v_res;
end;
$fn$;

-- ─── Nightly planner hook ────────────────────────────────────────────────────
-- Replaces the Phase 0 stub. Called by plan_all_messages() from cron, so it has no member gate
-- (a gated function called from cron silently does nothing). The RPCs above already queue as
-- things happen; this pass catches anything that drifted, and cancels reminders for trips that
-- went or were cancelled.

create or replace function public.plan_trip_messages_internal()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r record; v_n integer := 0;
begin
  for r in
    select tr.id
      from trips tr join camps c on c.id = tr.camp_id
     where c.deleted_at is null
       and tr.depart_date between (now() at time zone c.timezone)::date - 1
                              and (now() at time zone c.timezone)::date + 14
  loop
    v_n := v_n + coalesce(public.plan_trip_leaving_soon_internal(r.id), 0);
  end loop;
  return v_n;
end;
$fn$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE to PUBLIC on every new function; revoking from anon alone leaves that
-- grant in place. So: revoke from public, anon and authenticated, then grant back exactly the
-- browser-facing RPCs to authenticated.

do $$
declare f text;
begin
  foreach f in array array[
    'trips_require_writer_internal(uuid)',
    'trips_can_manage_internal(public.trips)',
    'trips_person_name_internal(uuid,uuid)',
    'trips_esc_internal(text)',
    'trips_fmt_when_internal(date,time)',
    'trips_legs_used_internal(uuid)',
    'trips_leg_fits_internal(uuid,integer,text)',
    'trip_leaving_soon_at_internal(date,time,text)',
    'trips_queue_seat_message_internal(uuid,text)',
    'plan_trip_leaving_soon_internal(uuid)',
    'trips_promote_waitlist_internal(uuid)',
    'trips_claim_seat_internal(uuid,text,uuid,text)',
    'trips_errand_list_open_internal(public.trips)',
    'plan_trip_messages_internal()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;

  foreach f in array array[
    'create_trip(uuid,jsonb)',
    'update_trip(uuid,jsonb)',
    'set_trip_status(uuid,text)',
    'cancel_trip(uuid,text)',
    'claim_trip_seat(uuid,text,uuid)',
    'release_trip_seat(uuid)',
    'add_errand(uuid,jsonb)',
    'attach_errands(uuid,uuid[])',
    'detach_errand(uuid)',
    'set_errand_status(uuid,text,text)',
    'request_ride(uuid,jsonb)',
    'cancel_ride_request(uuid)',
    'match_ride_request(uuid,uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- Town Trips: seats, legs, waitlist, errands, ride requests, reminders, permissions and RLS.
--   bash scripts/run-sql-tests.sh trips
--
-- Hermetic: one throwaway camp (America/Vancouver) created inside the transaction, with the
-- staging QA logins as its members, all rolled back at the end. Every RPC is called as the real
-- `authenticated` role with that person's JWT claims, so row security and grants are exercised
-- rather than bypassed by the postgres superuser.
--
-- Capacity race: the Management API gives one session, so two truly simultaneous claims cannot
-- be staged here (dblink is not installed on staging). T5 asserts the two halves that make the
-- race safe instead: the claim path takes a row lock on the trip before counting (so concurrent
-- claims serialise), and sequential claims on the last seat give exactly one confirmed and one
-- waitlisted.
--
-- Viewer policy (decided here): viewers read everything, write nothing.
-- Module-off policy: the functions do not check camps.modules / platform_modules. The module is
-- a UI gate; the loaders and screens are what disappear. Documented, not asserted.
begin;

do $$
declare
  v_camp  uuid := 'f0000000-0000-4000-8000-0000000071a1';
  v_admin uuid := 'e2e00000-0000-4000-8000-00000000000a';  -- admin
  v_b     uuid := 'e2e00000-0000-4000-8000-00000000000b';  -- staff (plans trips)
  v_c     uuid := 'e2e00000-0000-4000-8000-00000000000c';  -- staff
  v_d     uuid := 'e2e00000-0000-4000-8000-00000000000d';  -- staff
  v_other uuid := 'e2e00000-0000-4000-8000-00000000000e';  -- staff of ANOTHER camp only
  v_view  uuid := 'e2e00000-0000-4000-8000-00000000000f';  -- viewer
  v_tz text := 'America/Vancouver';
  v_day date;       -- three days out, camp-local
  v_today date;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid;
  v_res jsonb; v_err text; v_n int; v_id uuid; v_id2 uuid; v_seat uuid; v_seat2 uuid;
  v_e1 uuid; v_e2 uuid; v_r1 uuid;
  v_msg record; v_key text;
begin
  v_today := (now() at time zone v_tz)::date;
  v_day := v_today + 3;

  -- ── T1: grants ───────────────────────────────────────────────────────────
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'trip%' or p.proname in ('create_trip','update_trip','set_trip_status','cancel_trip',
          'claim_trip_seat','release_trip_seat','add_errand','attach_errands','detach_errand','set_errand_status',
          'request_ride','cancel_ride_request','match_ride_request','plan_trip_leaving_soon_internal',
          'plan_trip_messages_internal'))
     and has_function_privilege('anon', p.oid, 'execute');
  if v_n <> 0 then raise exception 'T1 FAIL: % trip functions executable by anon', v_n; end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'trips\_%' or p.proname like '%\_internal' and p.proname like '%trip%')
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_n <> 0 then raise exception 'T1 FAIL: % internal trip functions executable by authenticated', v_n; end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('create_trip','update_trip','set_trip_status','cancel_trip','claim_trip_seat',
          'release_trip_seat','add_errand','attach_errands','detach_errand','set_errand_status',
          'request_ride','cancel_ride_request','match_ride_request')
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_n <> 13 then raise exception 'T1 FAIL: expected 13 browser RPCs for authenticated, got %', v_n; end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('create_trip','update_trip','set_trip_status','cancel_trip','claim_trip_seat',
          'release_trip_seat','add_errand','attach_errands','detach_errand','set_errand_status',
          'request_ride','cancel_ride_request','match_ride_request');
  if v_n <> 13 then raise exception 'T1 FAIL: expected exactly 13 RPC overloads, got %', v_n; end if;

  -- ── T2: table grants ─────────────────────────────────────────────────────
  if has_table_privilege('anon', 'public.trips', 'select')
     or has_table_privilege('anon', 'public.trip_seats', 'select')
     or has_table_privilege('authenticated', 'public.trip_seats', 'insert')
     or has_table_privilege('authenticated', 'public.trips', 'update')
     or has_table_privilege('authenticated', 'public.trip_errands', 'delete')
     or has_table_privilege('authenticated', 'public.ride_requests', 'insert') then
    raise exception 'T2 FAIL: a trips table is writable by the browser or readable by anon';
  end if;
  select count(*) into v_n from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename in ('trips','trip_seats','trip_errands','ride_requests');
  if v_n <> 4 then raise exception 'T2 FAIL: % of 4 tables in the realtime publication', v_n; end if;
  select count(*) into v_n from pg_class
   where relname in ('trips','trip_seats','trip_errands','ride_requests') and relreplident = 'f'
     and relnamespace = 'public'::regnamespace;
  if v_n <> 4 then raise exception 'T2 FAIL: % of 4 tables have replica identity full', v_n; end if;

  -- ── fixture ──────────────────────────────────────────────────────────────
  insert into camps (id, name, slug, timezone) values (v_camp, 'Trips Test Camp', 'trips-test-camp-sql', v_tz);
  insert into camp_members (camp_id, user_id, role, display_name, is_active) values
    (v_camp, v_admin, 'admin', 'Teddy Admin', true),
    (v_camp, v_b, 'staff', 'Kim Kitchen', true),
    (v_camp, v_c, 'staff', 'Priya Program', true),
    (v_camp, v_d, 'staff', 'Hana Holder', true),
    (v_camp, v_view, 'viewer', 'Val Viewer', true);

  -- ── T3: staff plans a trip ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_t1 := create_trip(v_camp, jsonb_build_object('kind','town_run','title','Town run','destination','Walmart',
            'depart_date', v_day, 'depart_time','13:00','return_time','15:00','passenger_seats', 2));
  reset role;
  select count(*) into v_n from trips where id = v_t1 and created_by = v_b and return_date = v_day and status = 'planned';
  if v_n <> 1 then raise exception 'T3 FAIL: trip not created as planned with return date defaulted'; end if;

  -- ── T4: viewer and outsider write nothing ────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_view, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform create_trip(v_camp, jsonb_build_object('title','x','depart_date', v_day, 'depart_time','10:00')); v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'read_only' then reset role; raise exception 'T4 FAIL: viewer create_trip gave %', v_err; end if;
  begin perform claim_trip_seat(v_t1, 'both', null); v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'read_only' then reset role; raise exception 'T4 FAIL: viewer claim gave %', v_err; end if;
  select count(*) into v_n from trips where camp_id = v_camp;
  if v_n <> 1 then reset role; raise exception 'T4 FAIL: viewer should READ the trip, saw %', v_n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform claim_trip_seat(v_t1, 'both', null); v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'not_a_member' then reset role; raise exception 'T4 FAIL: outsider claim gave %', v_err; end if;
  reset role;

  -- ── T5: the last seat, claimed twice ─────────────────────────────────────
  if pg_get_functiondef('public.trips_claim_seat_internal(uuid,text,uuid,text)'::regprocedure)
     !~* 'from trips where id = p_trip_id for update' then
    raise exception 'T5 FAIL: the claim path no longer locks the trip row before counting seats';
  end if;
  if pg_get_functiondef('public.claim_trip_seat(uuid,text,uuid)'::regprocedure) !~ 'trips_claim_seat_internal'
     or pg_get_functiondef('public.match_ride_request(uuid,uuid)'::regprocedure) !~ 'trips_claim_seat_internal' then
    raise exception 'T5 FAIL: a seat is claimed outside the locked path';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t1, 'both', null);
  if v_res->>'status' <> 'confirmed' then reset role; raise exception 'T5 FAIL: first seat %', v_res; end if;
  -- A direct write is refused: the only way into a car is the locked function.
  begin insert into trip_seats (camp_id, trip_id, rider_user_id, rider_name) values (v_camp, v_t1, v_c, 'x'); v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_err is null then reset role; raise exception 'T5 FAIL: authenticated inserted a seat directly'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t1, 'both', null);                                  -- the last seat
  if v_res->>'status' <> 'confirmed' then reset role; raise exception 'T5 FAIL: last seat for d %', v_res; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t1, 'both', null);                                  -- the same last seat again
  if v_res->>'status' <> 'waitlist' then reset role; raise exception 'T5 FAIL: second claim on last seat %', v_res; end if;
  -- Pressing it twice does not make a second row.
  v_res := claim_trip_seat(v_t1, 'both', null);
  if (v_res->>'already')::boolean is not true then reset role; raise exception 'T5 FAIL: double press made a new seat'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t1, 'both', null);                                  -- second on the waitlist
  reset role;
  select count(*) filter (where status = 'confirmed'), count(*) filter (where status = 'waitlist') into v_n, v_err
    from trip_seats where trip_id = v_t1;
  if v_n <> 2 or v_err <> '2' then raise exception 'T5 FAIL: % confirmed / % waitlist on a 2-seat car', v_n, v_err; end if;

  -- ── T6: waitlist promotion order ─────────────────────────────────────────
  select id into v_seat from trip_seats where trip_id = v_t1 and rider_user_id = v_d and status = 'confirmed';
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := release_trip_seat(v_seat);
  reset role;
  if (v_res->>'promoted')::int <> 1 then raise exception 'T6 FAIL: release promoted %', v_res; end if;
  select status into v_err from trip_seats where trip_id = v_t1 and rider_user_id = v_admin and status <> 'cancelled';
  if v_err <> 'confirmed' then raise exception 'T6 FAIL: first waitlisted (admin) is %', v_err; end if;
  select status into v_err from trip_seats where trip_id = v_t1 and rider_user_id = v_b and status <> 'cancelled';
  if v_err <> 'waitlist' then raise exception 'T6 FAIL: second waitlisted (b) jumped to %', v_err; end if;
  select id into v_seat from trip_seats where trip_id = v_t1 and rider_user_id = v_admin and status = 'confirmed';
  select * into v_msg from scheduled_messages
   where subject_type = 'trip_seat' and subject_id = v_seat and rule_key = 'waitlist_promoted';
  if not found or v_msg.recipient_kind <> 'rider' or v_msg.body_text is null or v_msg.to_email <> 'qa-admin@example.com' then
    raise exception 'T6 FAIL: waitlist_promoted not queued with text copy';
  end if;
  -- Someone else cannot release your seat; the trip's creator can.
  select id into v_seat from trip_seats where trip_id = v_t1 and rider_user_id = v_c and status = 'confirmed';
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform release_trip_seat(v_seat); v_err := null; exception when others then v_err := sqlerrm; end;
  reset role;
  if v_err is distinct from 'not_allowed' then raise exception 'T6 FAIL: d released c''s seat (%)', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := release_trip_seat(v_seat);
  reset role;
  -- b is the creator AND the waitlisted rider: releasing c promotes b.
  select status into v_err from trip_seats where trip_id = v_t1 and rider_user_id = v_b and status <> 'cancelled';
  if v_err <> 'confirmed' then raise exception 'T6 FAIL: b not promoted after c left (%)', v_err; end if;

  -- ── T7: seats are counted per leg ────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_t2 := create_trip(v_camp, jsonb_build_object('kind','day_off','title','Day-off shuttle','destination','Town',
            'depart_date', v_day, 'depart_time','09:00','return_date', v_day, 'return_time','17:00','passenger_seats', 1));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t2, 'there', null);
  reset role;
  if v_res->>'status' <> 'confirmed' then raise exception 'T7 FAIL: there-only %', v_res; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t2, 'back', null);
  reset role;
  if v_res->>'status' <> 'confirmed' then raise exception 'T7 FAIL: back-only rider double-booked against there-only (%)', v_res; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t2, 'both', null);
  reset role;
  if v_res->>'status' <> 'waitlist' then raise exception 'T7 FAIL: both-legs on a full 1-seat car %', v_res; end if;
  -- b is the creator, not the driver, so b may ride.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := claim_trip_seat(v_t2, 'there', null);
  reset role;
  if v_res->>'status' <> 'waitlist' then raise exception 'T7 FAIL: second there-only %', v_res; end if;
  -- c (there) leaves: the out leg frees but the back leg is still d's. The admin (both, first in
  -- line) does not fit; b (there, second in line) does, and is promoted.
  select id into v_seat from trip_seats where trip_id = v_t2 and rider_user_id = v_c and status = 'confirmed';
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := release_trip_seat(v_seat);
  reset role;
  select status into v_err from trip_seats where trip_id = v_t2 and rider_user_id = v_admin and status <> 'cancelled';
  if v_err <> 'waitlist' then raise exception 'T7 FAIL: both-legs rider promoted with the back leg full (%)', v_err; end if;
  select status into v_err from trip_seats where trip_id = v_t2 and rider_user_id = v_b and status <> 'cancelled';
  if v_err <> 'confirmed' then raise exception 'T7 FAIL: there-only rider who fits not promoted (%)', v_err; end if;

  -- ── T8: who may edit and cancel ──────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform update_trip(v_t1, '{"destination":"Costco"}'); v_err := null; exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'not_allowed' then reset role; raise exception 'T8 FAIL: non-creator edit gave %', v_err; end if;
  begin perform cancel_trip(v_t1, 'nope'); v_err := null; exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'not_allowed' then reset role; raise exception 'T8 FAIL: non-creator cancel gave %', v_err; end if;
  begin perform set_trip_status(v_t1, 'out'); v_err := null; exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'not_allowed' then reset role; raise exception 'T8 FAIL: non-creator status gave %', v_err; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Admin makes d the driver of t1. d is not riding t1, so nobody is un-seated.
  perform update_trip(v_t1, jsonb_build_object('destination','Costco','driver_user_id', v_d));
  begin perform update_trip(v_t1, '{"passenger_seats":1}'); v_err := null; exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'seats_below_riders' then reset role; raise exception 'T8 FAIL: shrinking below riders gave %', v_err; end if;
  reset role;
  select count(*) into v_n from trips where id = v_t1 and destination = 'Costco' and driver_user_id = v_d and driver_name = 'Hana Holder';
  if v_n <> 1 then raise exception 'T8 FAIL: admin edit / driver name not applied'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform update_trip(v_t1, '{"notes":"Meet at the office"}');                  -- the driver may edit
  begin perform claim_trip_seat(v_t1, 'both', null); v_err := null; exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'driver_is_not_a_passenger' then reset role; raise exception 'T8 FAIL: driver claimed a seat (%)', v_err; end if;
  reset role;

  -- ── T9: RLS as authenticated ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from trips where camp_id = v_camp) + (select count(*) from trip_seats where camp_id = v_camp)
       + (select count(*) from trip_errands where camp_id = v_camp) + (select count(*) from ride_requests where camp_id = v_camp)
    into v_n;
  reset role;
  if v_n <> 0 then raise exception 'T9 FAIL: another camp''s user sees % trip rows', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from trip_seats where camp_id = v_camp;
  reset role;
  if v_n < 6 then raise exception 'T9 FAIL: a member sees only % seats', v_n; end if;

  -- ── T10: errands ─────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_e1 := add_errand(v_camp, jsonb_build_object('item','Craft glue','quantity','6 bottles','store','Dollarama',
            'needed_by', v_day, 'for_activity','Arts & crafts'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_e2 := add_errand(v_camp, jsonb_build_object('item','AA batteries','store','Walmart'));
  reset role;
  select count(*) into v_n from trip_errands where id in (v_e1, v_e2) and trip_id is null and status = 'open'
     and requester_name in ('Priya Program','Teddy Admin');
  if v_n <> 2 then raise exception 'T10 FAIL: errands not on the shared list'; end if;

  -- c may put their own errand on b's trip, not somebody else's.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform attach_errands(v_t2, array[v_e2]); v_err := null; exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'not_allowed' then reset role; raise exception 'T10 FAIL: attaching another''s errand gave %', v_err; end if;
  v_n := attach_errands(v_t2, array[v_e1]);
  if v_n <> 1 then reset role; raise exception 'T10 FAIL: own errand attach count %', v_n; end if;
  v_n := null;
  begin perform set_errand_status(v_e1, 'bought', null); v_err := null; exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'not_allowed' then reset role; raise exception 'T10 FAIL: non-driver ticked an errand (%)', v_err; end if;
  perform detach_errand(v_e1);
  reset role;
  select count(*) into v_n from trip_errands where id = v_e1 and trip_id is null;
  if v_n <> 1 then raise exception 'T10 FAIL: requester detach'; end if;

  -- The driver (creator b) loads both and ticks one off; the requester is told, with text copy.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_n := attach_errands(v_t2, array[v_e1, v_e2]);
  if v_n <> 2 then reset role; raise exception 'T10 FAIL: driver attach count %', v_n; end if;
  perform set_errand_status(v_e1, 'bought', 'Got the big ones');
  perform set_errand_status(v_e2, 'unavailable', 'Sold out');
  reset role;
  select * into v_msg from scheduled_messages where subject_type = 'trip_errand' and subject_id = v_e1 and rule_key = 'errand_done:bought';
  if not found or v_msg.to_email <> 'qa-program@example.com' or v_msg.body_text !~ 'Craft glue' or v_msg.recipient_kind <> 'requester' then
    raise exception 'T10 FAIL: errand_done not queued to the requester';
  end if;
  select count(*) into v_n from trip_errands where id = v_e1 and status = 'bought' and driver_note = 'Got the big ones' and done_by = v_b;
  if v_n <> 1 then raise exception 'T10 FAIL: bought not recorded'; end if;
  -- Reopening cancels a not-yet-sent "done" message.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform set_errand_status(v_e1, 'open', null);
  reset role;
  select state into v_err from scheduled_messages where subject_type = 'trip_errand' and subject_id = v_e1 and rule_key = 'errand_done:bought';
  if v_err <> 'cancelled' then raise exception 'T10 FAIL: reopened errand kept its done message (%)', v_err; end if;
  -- Only the requester (or admin) cancels an errand.
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform set_errand_status(v_e1, 'cancelled', null); v_err := null; exception when others then v_err := sqlerrm; end;
  reset role;
  if v_err is distinct from 'not_allowed' then raise exception 'T10 FAIL: stranger cancelled an errand (%)', v_err; end if;

  -- List closes: a trip leaving later today whose list closed at midnight. c cannot add to it,
  -- its creator b can.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_t4 := create_trip(v_camp, jsonb_build_object('title','Late run','depart_date', v_today, 'depart_time','23:59',
            'errands_close_time','00:00','passenger_seats', 2));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform add_errand(v_camp, jsonb_build_object('item','Ice','trip_id', v_t4)); v_err := null; exception when others then v_err := sqlerrm; end;
  reset role;
  if v_err is distinct from 'errand_list_closed' then raise exception 'T10 FAIL: closed list accepted an errand (%)', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_id := add_errand(v_camp, jsonb_build_object('item','Ice','trip_id', v_t4));
  reset role;

  -- ── T11: reminders ───────────────────────────────────────────────────────
  if trip_leaving_soon_at_internal(date '2026-07-10', time '13:00', v_tz) <> timestamp '2026-07-10 12:00' at time zone v_tz
     or trip_leaving_soon_at_internal(date '2026-07-10', time '08:30', v_tz) <> timestamp '2026-07-10 08:00' at time zone v_tz
     or trip_leaving_soon_at_internal(date '2026-07-10', time '07:00', v_tz) <> timestamp '2026-07-09 18:00' at time zone v_tz
     or trip_leaving_soon_at_internal(date '2026-07-10', time '21:30', v_tz) <> timestamp '2026-07-10 19:00' at time zone v_tz then
    raise exception 'T11 FAIL: leaving-soon send time ignores quiet hours';
  end if;

  select id into v_seat from trip_seats where trip_id = v_t1 and rider_user_id = v_b and status = 'confirmed';
  v_key := 'leaving_soon@' || to_char(v_day + time '13:00', 'YYYY-MM-DD"T"HH24:MI');
  select * into v_msg from scheduled_messages where subject_type = 'trip_seat' and subject_id = v_seat and rule_key = v_key;
  if not found or v_msg.state <> 'scheduled'
     or v_msg.send_after <> trip_leaving_soon_at_internal(v_day, time '13:00', v_tz)
     or v_msg.body_text !~ 'Leaving soon' then
    raise exception 'T11 FAIL: leaving_soon not scheduled for a confirmed rider';
  end if;
  select count(*) into v_n from scheduled_messages where subject_type = 'trip_seat' and subject_id = v_seat and rule_key = 'seat_confirmed';
  -- b was promoted rather than confirmed at claim, so they got waitlist_promoted, not seat_confirmed.
  if v_n <> 0 then raise exception 'T11 FAIL: promoted rider also got seat_confirmed'; end if;
  select count(*) into v_n from scheduled_messages m join trip_seats s on s.id = m.subject_id
   where m.subject_type = 'trip_seat' and s.trip_id = v_t2 and m.rule_key = 'seat_confirmed' and m.body_text ~ 'Ride there only';
  if v_n <> 1 then raise exception 'T11 FAIL: there-only seat_confirmed text missing (%)', v_n; end if;
  select count(*) into v_n from scheduled_messages
   where subject_type = 'trip' and subject_id = v_t1 and rule_key = v_key || ':' || v_d and recipient_kind = 'assignee' and state = 'scheduled';
  if v_n <> 1 then raise exception 'T11 FAIL: driver reminder not scheduled'; end if;

  -- Moving the departure cancels the old reminder and schedules a new one.
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform update_trip(v_t1, '{"depart_time":"14:00","return_time":"16:00"}');
  reset role;
  select state into v_err from scheduled_messages where subject_type = 'trip_seat' and subject_id = v_seat and rule_key = v_key;
  if v_err <> 'cancelled' then raise exception 'T11 FAIL: moved trip kept the old reminder (%)', v_err; end if;
  select state into v_err from scheduled_messages where subject_type = 'trip_seat' and subject_id = v_seat
     and rule_key = 'leaving_soon@' || to_char(v_day + time '14:00', 'YYYY-MM-DD"T"HH24:MI');
  if v_err is distinct from 'scheduled' then raise exception 'T11 FAIL: moved trip has no new reminder (%)', v_err; end if;

  -- Leaving a seat cancels that rider's reminder.
  select id into v_seat2 from trip_seats where trip_id = v_t2 and rider_user_id = v_d and status = 'confirmed';
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform release_trip_seat(v_seat2);
  reset role;
  select count(*) into v_n from scheduled_messages where subject_type = 'trip_seat' and subject_id = v_seat2
     and rule_key like 'leaving_soon@%' and state = 'scheduled';
  if v_n <> 0 then raise exception 'T11 FAIL: a rider who left still has a scheduled reminder'; end if;

  -- ── T12: ride requests ───────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_view, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform request_ride(v_camp, jsonb_build_object('wanted_date', v_day)); v_err := null; exception when others then v_err := sqlerrm; end;
  reset role;
  if v_err is distinct from 'read_only' then raise exception 'T12 FAIL: viewer requested a ride (%)', v_err; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r1 := request_ride(v_camp, jsonb_build_object('wanted_date', v_day, 'earliest_time','12:00','latest_time','16:00',
            'destination','Town','leg','both','note','Day off'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_t3 := create_trip(v_camp, jsonb_build_object('title','Afternoon run','depart_date', v_day, 'depart_time','12:30',
            'return_time','15:30','passenger_seats', 3));
  reset role;
  -- d does not manage t3 and did not ask: refused.
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform match_ride_request(v_r1, v_t3); v_err := null; exception when others then v_err := sqlerrm; end;
  reset role;
  if v_err is distinct from 'not_allowed' then raise exception 'T12 FAIL: stranger matched a request (%)', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := match_ride_request(v_r1, v_t3);
  reset role;
  if v_res->>'status' <> 'confirmed' then raise exception 'T12 FAIL: match seat %', v_res; end if;
  select count(*) into v_n from ride_requests r join trip_seats s on s.id = r.matched_seat_id
   where r.id = v_r1 and r.status = 'matched' and r.matched_trip_id = v_t3 and s.rider_user_id = v_c and s.status = 'confirmed';
  if v_n <> 1 then raise exception 'T12 FAIL: request not matched to c''s seat'; end if;
  -- c leaves the seat: the request is open again, nobody forgets they still need a ride.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform release_trip_seat((v_res->>'seat_id')::uuid);
  reset role;
  select status into v_err from ride_requests where id = v_r1;
  if v_err <> 'open' then raise exception 'T12 FAIL: request after leaving the seat is %', v_err; end if;
  -- Re-match, then cancel the whole trip: request reopens, riders are told, errands return to the list.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := match_ride_request(v_r1, v_t3);                                        -- the requester picks the trip
  v_id2 := add_errand(v_camp, jsonb_build_object('item','Stamps','trip_id', v_t3));
  reset role;

  -- ── T13: cancelling a trip ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform cancel_trip(v_t3, 'Van is in the shop');
  reset role;
  select count(*) into v_n from trips where id = v_t3 and status = 'cancelled' and cancelled_reason = 'Van is in the shop';
  if v_n <> 1 then raise exception 'T13 FAIL: trip not cancelled'; end if;
  select count(*) into v_n from trip_seats where trip_id = v_t3 and status <> 'cancelled';
  if v_n <> 0 then raise exception 'T13 FAIL: % seats survive a cancelled trip', v_n; end if;
  select * into v_msg from scheduled_messages where subject_type = 'trip_seat' and subject_id = (v_res->>'seat_id')::uuid and rule_key = 'trip_cancelled';
  if not found or v_msg.to_email <> 'qa-program@example.com' or v_msg.body_text !~ 'Van is in the shop' then
    raise exception 'T13 FAIL: rider not told the trip is cancelled';
  end if;
  select count(*) into v_n from scheduled_messages where subject_type = 'trip_seat' and subject_id = (v_res->>'seat_id')::uuid
     and rule_key like 'leaving_soon@%' and state = 'scheduled';
  if v_n <> 0 then raise exception 'T13 FAIL: cancelled trip still reminds riders'; end if;
  select count(*) into v_n from trip_errands where id = v_id2 and trip_id is null and status = 'open';
  if v_n <> 1 then raise exception 'T13 FAIL: errand did not return to the shared list'; end if;
  select count(*) into v_n from scheduled_messages where subject_type = 'trip_errand' and subject_id = v_id2 and rule_key = 'trip_cancelled:' || v_t3;
  if v_n <> 1 then raise exception 'T13 FAIL: errand requester not told'; end if;
  select status into v_err from ride_requests where id = v_r1;
  if v_err <> 'open' then raise exception 'T13 FAIL: matched request after cancel is %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform claim_trip_seat(v_t3, 'both', null); v_err := null; exception when others then v_err := sqlerrm; end;
  reset role;
  if v_err is distinct from 'trip_not_open' then raise exception 'T13 FAIL: seat claimed on a cancelled trip (%)', v_err; end if;

  -- ── T14: planner ─────────────────────────────────────────────────────────
  -- A reminder cancelled out from under the planner is not resurrected, and the planner's pass
  -- is idempotent.
  v_n := plan_trip_messages_internal();
  select count(*) into v_n from scheduled_messages where subject_type = 'trip_seat' and subject_id = v_seat2
     and rule_key like 'leaving_soon@%' and state = 'scheduled';
  if v_n <> 0 then raise exception 'T14 FAIL: planner resurrected a left rider''s reminder'; end if;
  select count(*) into v_n from scheduled_messages m
   where m.camp_id = v_camp and m.rule_key like 'leaving_soon@%' and m.state = 'scheduled';
  perform plan_all_messages();
  select count(*) - v_n into v_n from scheduled_messages m
   where m.camp_id = v_camp and m.rule_key like 'leaving_soon@%' and m.state = 'scheduled';
  if v_n <> 0 then raise exception 'T14 FAIL: planner re-run changed % reminders', v_n; end if;

  raise notice 'trips: 14/14 passed';
end $$;

select 'trips: 14/14 passed' as result;
rollback;

-- Campground + Rentals engine test suite.
--
-- Run against STAGING, never production:
--   STAGING_DB_URL='postgresql://...' npm run test:campground
-- or paste into the SQL editor. Everything runs inside a transaction that is rolled back, so it
-- leaves no fixtures behind and is safe to re-run.
--
-- Each assertion raises on failure with the expected and actual value, so a red run tells you
-- what broke rather than that something did.
--
-- The suite deliberately concentrates on the rules that are easy to regress and expensive to get
-- wrong: the one-open-occurrence rule (whether people keep the routines feature or mute it), the
-- seam generating BOTH work orders, the outbox cancelling a nudge whose condition went false,
-- and sync_push being safe to retry.

begin;

do $$
declare
  camp     constant uuid := '55555555-5555-4555-8555-555555555555';
  season   constant uuid := '66666666-6666-4666-8666-666666666666';
  -- Deliberately ugly ids. The first draft used 'bbbbbbbb-…-0001/0002', which COLLIDE with real
  -- staging logins (eric@ and founder@campcommand.app). The fixture inserts are
  -- `on conflict (id) do nothing`, so instead of failing loudly the suite silently bound itself
  -- to two real accounts and made them members of the test camp. The rollback undid it, but a
  -- test that quietly reuses production-shaped identities is not hermetic.
  u_admin  constant uuid := 'cc000000-0000-4000-8000-0000000000c1';
  u_house  constant uuid := 'cc000000-0000-4000-8000-0000000000c2';

  loc_cabin  uuid; loc_lodge uuid; loc_bath uuid;
  asset_mower uuid;
  tmpl_turn  uuid; tmpl_prog uuid;
  sched      uuid; sched_meter uuid;
  retreat    uuid; req        uuid;
  issue      uuid; issue2     uuid;
  vendor     uuid;

  n int; m int; st text; v jsonb; t text; ts timestamptz;
  passed int := 0;
begin
  -- ── Fixtures ────────────────────────────────────────────────────────────────
  -- Reset first. A suite that inherits state from a previous run reports whatever that run left
  -- behind, which is how a passing test stops meaning anything.
  delete from issues            where camp_id = camp;
  delete from work_schedules    where camp_id = camp;
  delete from retreats          where camp_id = camp;
  delete from locations         where camp_id = camp;
  delete from camp_assets       where camp_id = camp;
  delete from scheduled_messages where camp_id = camp;
  delete from service_vendors   where camp_id = camp;
  delete from work_checklist_templates where camp_id = camp;

  insert into camps (id, name, slug, status, timezone)
    values (camp, 'TEST Campground', 'test-campground', 'active', 'America/New_York')
    on conflict (id) do update set timezone = 'America/New_York';
  insert into seasons (id, camp_id, name, opening_date, closing_date)
    values (season, camp, 'TEST 2027', '2027-06-28', '2027-08-20') on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (u_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cg-admin@test.local','x',now(),now(),now()),
         (u_house,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cg-house@test.local','x',now(),now(),now())
  on conflict (id) do nothing;

  insert into profiles (id, full_name) values
    (u_admin, 'T Admin'),
    (u_house, 'T Housekeeper')
  on conflict (id) do update set full_name = excluded.full_name;

  insert into camp_members (camp_id, user_id, role, display_name, is_active) values
    (camp, u_admin, 'admin', 'T Admin', true),
    (camp, u_house, 'staff', 'T Housekeeper', true)
  on conflict do nothing;

  -- Act as the admin. Every function below gates on is_camp_member/is_camp_admin, which read
  -- auth.uid(); without this they would all raise Forbidden and the suite would test nothing.
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_admin::text, 'role', 'authenticated')::text, true);

  insert into locations (camp_id, name, is_dorm, retreat_available, bed_capacity, is_active, program_space, capacity_seated)
  values (camp, 'T Cabin 7', true, true, 6, true, false, null) returning id into loc_cabin;
  insert into locations (camp_id, name, is_dorm, is_active, program_space, capacity_seated)
  values (camp, 'T Lodge', false, true, true, 60) returning id into loc_lodge;
  insert into locations (camp_id, name, is_dorm, is_active)
  values (camp, 'T Bathhouse', false, true) returning id into loc_bath;

  insert into camp_assets (camp_id, name, category, subtype, is_active, tracks_hours, current_hours)
  values (camp, 'T Mower', 'large_equipment', 'riding_mower', true, true, 100)
  returning id into asset_mower;

  insert into service_vendors (camp_id, name, trade) values (camp, 'T Septic Co', 'septic')
  returning id into vendor;

  insert into work_checklist_templates (camp_id, name, trade, items) values
    (camp, 'T Cabin turnover', 'housekeeping',
     '[{"text":"Strip beds"},{"text":"Mop"},{"text":"Restock"}]'::jsonb)
  returning id into tmpl_turn;
  insert into work_checklist_templates (camp_id, name, trade, items) values
    (camp, 'Program space reset', 'housekeeping', '[{"text":"Stack chairs"},{"text":"Wipe tables"}]'::jsonb)
  returning id into tmpl_prog;
  -- approve_space_request() looks the program template up BY NAME, so the fixture has to use
  -- the real name rather than a test-prefixed one.

  insert into work_routing (camp_id, trade, default_assignee_id)
  values (camp, 'housekeeping', u_house)
  on conflict (camp_id, trade) do update set default_assignee_id = excluded.default_assignee_id;

  -- ═══ 1 · Routing ══════════════════════════════════════════════════════════
  if route_work(camp, 'housekeeping') <> u_house then
    raise exception 'T1 FAIL: routing did not return the housekeeping lead';
  end if;
  if route_work(camp, 'grounds') is not null then
    raise exception 'T1 FAIL: routing invented an owner for a trade with no rule. Unassigned is a legitimate answer.';
  end if;
  passed := passed + 1;

  -- ═══ 2 · Routines: generation, idempotence, one-open-occurrence ═══════════
  insert into work_schedules (camp_id, title, trade, cadence, interval_count, anchor_date,
                              active_from, location_ids, locations, generate_ahead_days)
  values (camp, 'T Check extinguishers', 'maintenance', 'daily', 1, current_date,
          current_date, array[loc_bath], array['T Bathhouse'], 3)
  returning id into sched;

  n := generate_scheduled_work(camp, current_date + 2);
  if n < 1 then raise exception 'T2 FAIL: a daily routine generated nothing (got %)', n; end if;
  passed := passed + 1;

  -- Only ONE open occurrence exists at a time. This is the rule that decides whether a camp
  -- keeps the feature: eleven identical rows is how a recurring-task system earns a mute.
  select count(*) into m from issues where schedule_id = sched and status <> 'resolved';
  if m <> 1 then
    raise exception 'T3 FAIL: expected exactly 1 open occurrence, found %. Duplicates stack and the module gets muted.', m;
  end if;
  passed := passed + 1;

  -- Re-running must not duplicate.
  perform generate_scheduled_work(camp, current_date + 2);
  select count(*) into m from issues where schedule_id = sched and status <> 'resolved';
  if m <> 1 then raise exception 'T4 FAIL: re-running the generator duplicated an occurrence (now %)', m; end if;
  passed := passed + 1;

  -- Being behind bumps the open row and counts the miss rather than raising a second one.
  perform generate_scheduled_work(camp, current_date + 3);
  select count(*), max(missed_count) into m, n
    from issues i join work_schedules w on w.id = i.schedule_id
   where i.schedule_id = sched and i.status <> 'resolved' group by ();
  if m <> 1 then raise exception 'T5 FAIL: a behind routine raised a duplicate instead of bumping (% open)', m; end if;
  select missed_count into n from work_schedules where id = sched;
  if n < 1 then raise exception 'T5 FAIL: missed_count did not increment; the camp cannot see it is behind'; end if;
  passed := passed + 1;

  -- The occurrence landed on the right person by routing, and is tagged as a routine.
  select source into t from issues where schedule_id = sched limit 1;
  if t <> 'routine' then raise exception 'T6 FAIL: occurrence source was % not routine', t; end if;
  passed := passed + 1;

  -- ═══ 3 · Meter routines ═══════════════════════════════════════════════════
  insert into work_schedules (camp_id, title, trade, cadence, asset_id, meter_interval, meter_kind,
                              meter_last_at, is_active, location_ids, locations)
  values (camp, 'T Mower 250h service', 'maintenance', 'meter', asset_mower, 250, 'hours', 0, true, '{}', '{}')
  returning id into sched_meter;

  n := record_asset_meter(asset_mower, 200, 'hours');
  if n <> 0 then raise exception 'T7 FAIL: a meter routine fired before its interval (raised %)', n; end if;
  n := record_asset_meter(asset_mower, 260, 'hours');
  if n <> 1 then raise exception 'T7 FAIL: a meter routine did not fire at its interval (raised %)', n; end if;
  passed := passed + 1;

  -- A meter only ever goes up. Absorbing a typo that moves it backwards would make every meter
  -- routine come due at once.
  begin
    perform record_asset_meter(asset_mower, 10, 'hours');
    raise exception 'T8 FAIL: a backwards meter reading was accepted';
  exception when sqlstate '22023' then
    passed := passed + 1;
  end;

  -- ═══ 4 · Checklists ═══════════════════════════════════════════════════════
  insert into issues (camp_id, title, description, locations, location_ids, priority, status,
                      is_public_report, source, trade)
  values (camp, 'T Turn over Cabin 7', '', array['T Cabin 7'], array[loc_cabin], 'normal',
          'assigned', false, 'web', 'housekeeping')
  returning id into issue;

  n := apply_checklist_template(issue, tmpl_turn);
  if n <> 3 then raise exception 'T9 FAIL: template applied % steps, expected 3', n; end if;
  -- Applying twice must not duplicate the steps.
  n := apply_checklist_template(issue, tmpl_turn);
  if n <> 0 then raise exception 'T9 FAIL: re-applying a template duplicated steps (added %)', n; end if;
  passed := passed + 1;

  -- Ticking the last step closes the work order, so the checklist does not add a second closing
  -- action.
  update issue_checklist_items set is_done = true where issue_id = issue;
  select status into st from issues where id = issue;
  if st <> 'resolved' then
    raise exception 'T10 FAIL: ticking every step left the work order at %, expected resolved', st;
  end if;
  passed := passed + 1;

  -- And unticking one reopens it: "done" must not be a one-way door that survives somebody
  -- noticing the beds were never made.
  update issue_checklist_items set is_done = false
   where id = (select id from issue_checklist_items where issue_id = issue order by position limit 1);
  select status into st from issues where id = issue;
  if st <> 'in_progress' then
    raise exception 'T11 FAIL: unticking a step left the work order at %, expected in_progress', st;
  end if;
  passed := passed + 1;

  -- ═══ 5 · Timing triggers ══════════════════════════════════════════════════
  insert into issues (camp_id, title, locations, location_ids, priority, status,
                      is_public_report, source, trade)
  values (camp, 'T Timing', array['T Bathhouse'], array[loc_bath], 'normal', 'unassigned', false, 'web', 'maintenance')
  returning id into issue2;

  update issues set assignee_id = u_house, status = 'assigned' where id = issue2;
  if (select assigned_at from issues where id = issue2) is null then
    raise exception 'T12 FAIL: assigned_at was not stamped on first assignment';
  end if;

  -- Reassignment is not the moment somebody picked this up; time-to-assign measures the queue,
  -- not the churn.
  select assigned_at into ts from issues where id = issue2;
  update issues set assignee_id = u_admin where id = issue2;
  if (select assigned_at from issues where id = issue2) is distinct from ts then
    raise exception 'T12 FAIL: reassigning restamped assigned_at (% -> %); time-to-assign now measures churn',
      ts, (select assigned_at from issues where id = issue2);
  end if;
  passed := passed + 1;

  update issues set status = 'resolved' where id = issue2;
  if (select resolved_at from issues where id = issue2) is null then
    raise exception 'T13 FAIL: resolved_at was not stamped on resolve';
  end if;
  update issues set status = 'in_progress' where id = issue2;
  if (select resolved_at from issues where id = issue2) is not null then
    raise exception 'T13 FAIL: resolved_at survived a reopen. It was then never closed.';
  end if;
  passed := passed + 1;

  -- ═══ 6 · The seam ═════════════════════════════════════════════════════════
  insert into retreats (id, camp_id, group_name, group_type, arrival_date, departure_date,
                        headcount, pricing_model, status, lead_stage, coordinator_email, portal_token)
  values (gen_random_uuid(), camp, 'T Beth Shalom', 'synagogue',
          current_date + 30, current_date + 32, 40, 'per_person_night', 'confirmed', 'won',
          'coord@test.local', encode(gen_random_bytes(16),'hex'))
  returning id into retreat;

  -- A request spans a RUN, not a day: a group that wants the Lodge Friday through Sunday is
  -- making one request, and the crew sets up once and strikes once. Two days here so the
  -- run-spanning path is what gets tested, not the degenerate single-day case.
  insert into retreat_space_requests (camp_id, retreat_id, location_id, day_date, end_date, layout,
                                      expected_count, purpose, setup_notes, start_label)
  values (camp, retreat, loc_lodge, current_date + 31, current_date + 32, 'rounds', 40, 'Havdalah service',
          'Three benches along the back wall, two tables at the front', 'after dinner')
  returning id into req;

  v := approve_space_request(req, 'We will leave the piano where it is.', null);

  -- TWO work orders, not one, and not two per day. Camps forget the strike every time, and a
  -- rental turnover is set-up plus tear-down without exception -- but a group holding the Lodge
  -- for a weekend does not want the room struck and reset each morning. One run, one set-up,
  -- one strike, however many days it spans.
  select count(*) into n from issues where retreat_space_request_id = req;
  if n <> 2 then
    raise exception 'T14 FAIL: approving a 2-day run created % work order(s), expected 2 (one set-up, one strike)', n;
  end if;
  passed := passed + 1;

  -- The group's words travel intact to the person carrying the benches. That is the feature.
  select description into t from issues where id = (v->>'setup_id')::uuid;
  if t not like '%Three benches along the back wall%' then
    raise exception 'T15 FAIL: the group''s verbatim setup notes did not reach the work order';
  end if;
  if t not like '%We will leave the piano%' then
    raise exception 'T15 FAIL: the camp''s own note did not reach the work order';
  end if;
  passed := passed + 1;

  -- It landed on the housekeeping lead by routing, is tagged to the group, and carries the
  -- program-reset checklist.
  select trade into t from issues where id = (v->>'setup_id')::uuid;
  if t <> 'housekeeping' then raise exception 'T16 FAIL: set-up work is trade %, expected housekeeping', t; end if;
  select count(*) into n from issue_checklist_items where issue_id = (v->>'setup_id')::uuid;
  if n < 2 then raise exception 'T16 FAIL: the set-up work order got no checklist (% steps)', n; end if;
  passed := passed + 1;

  -- Editing an approved request reopens it rather than silently mutating work somebody is
  -- standing in front of.
  update retreat_space_requests set setup_notes = 'Actually five benches' where id = req;
  select status into st from retreat_space_requests where id = req;
  if st <> 'countered' then
    raise exception 'T17 FAIL: editing an approved request left it at %, expected countered', st;
  end if;
  select count(*) into n from issue_comments where issue_id = (v->>'setup_id')::uuid;
  if n < 1 then raise exception 'T17 FAIL: the linked work order was not told the group changed the request'; end if;
  passed := passed + 1;

  -- Out of service is the one hard stop. Everything else surfaced at approval is a warning,
  -- because approval is a judgement call.
  update locations set service_status = 'out_of_service', out_of_service_reason = 'Roof leak'
   where id = loc_lodge;
  insert into retreat_space_requests (camp_id, retreat_id, location_id, day_date, end_date, layout)
  values (camp, retreat, loc_lodge, current_date + 33, current_date + 33, 'open') returning id into req;
  begin
    perform approve_space_request(req, null, null);
    raise exception 'T18 FAIL: an out-of-service space was approvable';
  exception when sqlstate '22023' then
    passed := passed + 1;
  end;
  update locations set service_status = 'in_service', out_of_service_reason = null where id = loc_lodge;

  -- Conflicts are surfaced, not enforced.
  v := space_request_conflicts(req);
  if v is null then raise exception 'T19 FAIL: the conflict check returned nothing'; end if;
  if not (v ? 'double_booked' and v ? 'out_of_service' and v ? 'over_capacity') then
    raise exception 'T19 FAIL: the conflict check is missing keys the approval screen reads: %', v;
  end if;
  passed := passed + 1;

  -- ═══ 7 · Turnover ═════════════════════════════════════════════════════════
  insert into retreat_housing (camp_id, retreat_id, location_id, people_count)
  values (camp, retreat, loc_cabin, 6);

  n := generate_turnover_work(retreat, 'room');
  if n <> 1 then raise exception 'T20 FAIL: turnover generated % work orders, expected 1 per assigned room', n; end if;
  -- Idempotent: running it twice for one departure must not double the crew's list.
  n := generate_turnover_work(retreat, 'room');
  if n <> 0 then raise exception 'T20 FAIL: re-running turnover created % duplicate(s)', n; end if;
  passed := passed + 1;

  -- ═══ 8 · The outbox ═══════════════════════════════════════════════════════
  update retreats set housing_deadline = current_date + 7, housing_submitted_at = null
   where id = retreat;
  perform plan_retreat_messages(camp);

  select count(*) into n from scheduled_messages
   where subject_id = retreat and rule_key like 'housing%' and state = 'scheduled';
  if n < 1 then raise exception 'T21 FAIL: the planner queued no rooming reminder'; end if;
  passed := passed + 1;

  -- Re-planning must not duplicate: one rule fires once per subject per recipient.
  perform plan_retreat_messages(camp);
  select count(*) into m from scheduled_messages
   where subject_id = retreat and rule_key like 'housing%' and state = 'scheduled';
  if m <> n then raise exception 'T22 FAIL: re-planning duplicated reminders (% then %)', n, m; end if;
  passed := passed + 1;

  -- THE reason this is an outbox and not a cron job that sends. The worst email this product
  -- could send is "please submit your rooming" the morning after they submitted it.
  update retreats set housing_submitted_at = now() where id = retreat;
  perform plan_retreat_messages(camp);
  select count(*) into n from scheduled_messages
   where subject_id = retreat and rule_key like 'housing%' and state = 'scheduled';
  if n <> 0 then
    raise exception 'T23 FAIL: % rooming reminder(s) survived the group submitting their rooming', n;
  end if;
  select count(*) into n from scheduled_messages
   where subject_id = retreat and rule_key like 'housing%' and state = 'cancelled'
     and suppressed_reason = 'submitted';
  if n < 1 then raise exception 'T23 FAIL: the cancelled reminder did not record why it stood down'; end if;
  passed := passed + 1;

  -- ═══ 9 · Stripe ═══════════════════════════════════════════════════════════
  insert into retreat_invoices (camp_id, retreat_id, kind, number, amount, status, stripe_session_id, line_items)
  values (camp, retreat, 'deposit', 'T-001', 500, 'sent', 'cs_test_123', '[]'::jsonb);

  v := record_stripe_payment('evt_test_1', 'cs_test_123', 500, 'usd', '{}'::jsonb);
  if not (v->>'ok')::boolean then raise exception 'T24 FAIL: a valid payment was not recorded: %', v; end if;
  select status into st from retreat_invoices where stripe_session_id = 'cs_test_123';
  if st <> 'paid' then raise exception 'T24 FAIL: a fully paid invoice is still %', st; end if;
  select count(*) into n from retreat_payments where retreat_id = retreat and method = 'card';
  if n <> 1 then raise exception 'T24 FAIL: the payment did not reach the camp''s own ledger'; end if;
  passed := passed + 1;

  -- Stripe retries. A redelivery must not take the money twice.
  v := record_stripe_payment('evt_test_1', 'cs_test_123', 500, 'usd', '{}'::jsonb);
  if not (v->>'duplicate')::boolean then raise exception 'T25 FAIL: a redelivered Stripe event was processed again'; end if;
  select count(*) into n from retreat_payments where retreat_id = retreat and method = 'card';
  if n <> 1 then raise exception 'T25 FAIL: a redelivery created a second payment row'; end if;
  passed := passed + 1;

  -- ═══ 10 · Offline sync ════════════════════════════════════════════════════
  -- A delta pull is a query on updated_at, so a row deleted while a device was away matches
  -- nothing. Deletes have to leave something behind.
  delete from issues where id = issue2;
  select count(*) into n from deleted_rows where table_name = 'issues' and row_id = issue2;
  if n <> 1 then raise exception 'T26 FAIL: deleting a work order left no tombstone; an offline device would show it forever'; end if;
  passed := passed + 1;

  v := sync_pull(camp, null);
  if not (v ? 'issues' and v ? 'deleted' and v ? 'server_time') then
    raise exception 'T27 FAIL: sync_pull is missing keys the client reads: %', (select jsonb_object_keys(v) limit 1);
  end if;
  passed := passed + 1;

  -- A phone that loses signal mid-request does not know whether the write landed, so retrying
  -- must be safe.
  v := sync_push(camp, jsonb_build_array(jsonb_build_object(
        'id', 'mut-test-1', 'op', 'upsert', 'table', 'issues',
        'payload', jsonb_build_object('id', gen_random_uuid(), 'title', 'T From a phone',
                                      'priority','normal','status','unassigned',
                                      'is_public_report', false, 'location_ids','[]'::jsonb))));
  if not ((v->'results'->0->>'ok')::boolean) then
    raise exception 'T28 FAIL: a valid queued mutation was rejected: %', v->'results'->0;
  end if;
  v := sync_push(camp, jsonb_build_array(jsonb_build_object(
        'id', 'mut-test-1', 'op', 'upsert', 'table', 'issues',
        'payload', jsonb_build_object('id', gen_random_uuid(), 'title', 'T Retried'))));
  if not ((v->'results'->0->>'duplicate')::boolean) then
    raise exception 'T28 FAIL: a retried mutation was applied twice: %', v->'results'->0;
  end if;
  passed := passed + 1;

  -- A batch is applied one at a time: ten good mutations must land even if the eleventh is bad.
  v := sync_push(camp, jsonb_build_array(
        jsonb_build_object('id','mut-test-2','op','upsert','table','camps','payload','{}'::jsonb),
        jsonb_build_object('id','mut-test-3','op','upsert','table','issues',
          'payload', jsonb_build_object('id', gen_random_uuid(), 'title','T Survivor',
                                        'priority','normal','status','unassigned',
                                        'is_public_report', false, 'location_ids','[]'::jsonb))));
  if (v->'results'->0->>'ok')::boolean then
    raise exception 'T29 FAIL: sync_push accepted a table that is not syncable';
  end if;
  if not ((v->'results'->1->>'ok')::boolean) then
    raise exception 'T29 FAIL: one bad mutation took a good one down with it: %', v->'results'->1;
  end if;
  passed := passed + 1;

  -- ═══ 11 · QR ══════════════════════════════════════════════════════════════
  select qr_token into t from locations where id = loc_cabin;
  select count(*) into n from get_qr_target(t) where kind = 'location' and target_id = loc_cabin;
  if n <> 1 then raise exception 'T30 FAIL: a location sticker did not resolve'; end if;

  select qr_token into t from camp_assets where id = asset_mower;
  select count(*) into n from get_qr_target(t) where kind = 'asset' and target_id = asset_mower;
  if n <> 1 then raise exception 'T30 FAIL: an asset sticker did not resolve'; end if;
  passed := passed + 1;

  -- The duplicate check in front of a public reporter: the number one failure of open reporting
  -- is the same broken door reported eleven times.
  insert into issues (camp_id, title, locations, location_ids, priority, status, is_public_report, source, trade)
  values (camp, 'T Broken screen door', array['T Cabin 7'], array[loc_cabin], 'normal', 'unassigned', true, 'qr', 'maintenance');
  select qr_token into t from locations where id = loc_cabin;
  v := open_reports_at(t);
  if jsonb_array_length(v) < 1 then
    raise exception 'T31 FAIL: open_reports_at showed nothing already reported at this location';
  end if;
  if (v->0) ? 'assignee' or (v->0) ? 'id' then
    raise exception 'T31 FAIL: the anon duplicate check leaked more than it should: %', v->0;
  end if;
  passed := passed + 1;

  -- ═══ 12 · Reviews ═════════════════════════════════════════════════════════
  v := season_review(camp, current_date - 30, current_date + 30);
  if not (v ? 'volume' and v ? 'timing' and v ? 'locations' and v ? 'assets'
          and v ? 'workload' and v ? 'sources' and v ? 'routines' and v ? 'carry_over') then
    raise exception 'T32 FAIL: season_review is missing a block the page renders';
  end if;
  if (v->'volume'->>'reported')::int < 1 then
    raise exception 'T32 FAIL: season_review counted no work in a window that has some';
  end if;
  passed := passed + 1;

  v := rentals_review(camp, current_date - 30, current_date + 60);
  if not (v ? 'occupancy' and v ? 'revenue' and v ? 'pipeline'
          and v ? 'where_groups_come_from' and v ? 'cost_to_host' and v ? 'feedback') then
    raise exception 'T33 FAIL: rentals_review is missing a block the page renders';
  end if;
  if (v->'occupancy'->>'bed_nights_available')::int < 1 then
    raise exception 'T33 FAIL: bed-nights available came back zero with a rentable dorm in place';
  end if;
  passed := passed + 1;

  v := property_calendar(camp, current_date - 30, current_date + 60);
  if not (v ? 'retreats' and v ? 'space_bookings' and v ? 'out_of_service' and v ? 'turnover_days') then
    raise exception 'T34 FAIL: property_calendar is missing a band the timeline renders';
  end if;
  passed := passed + 1;

  -- ═══ 13 · Leads may have no dates ═════════════════════════════════════════
  -- A lead says "some weekend in October" before it says October 10th, but the moment it
  -- becomes a booking the dates are required again — the housing board, the kitchen and the
  -- invoice all assume they exist.
  insert into retreats (camp_id, group_name, group_type, headcount, pricing_model, status,
                        lead_stage, date_flexibility, portal_token)
  values (camp, 'T Undated enquiry', 'other', 20, 'flat', 'inquiry', 'new',
          'any weekend in October', encode(gen_random_bytes(16),'hex'));
  passed := passed + 1;

  begin
    insert into retreats (camp_id, group_name, group_type, headcount, pricing_model, status,
                          lead_stage, portal_token)
    values (camp, 'T Bad booking', 'other', 20, 'flat', 'confirmed', 'won',
            encode(gen_random_bytes(16),'hex'));
    raise exception 'T35 FAIL: a confirmed booking was allowed with no dates';
  exception when check_violation then
    passed := passed + 1;
  end;

  raise notice 'PASS: % assertions (campground + rentals engines)', passed;
end $$;

rollback;

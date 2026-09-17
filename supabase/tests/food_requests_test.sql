-- Food requests: the state machine, the late rule, the no-login front door, RLS as real roles,
-- and every reminder queued and cancelled on each transition.
--   bash scripts/run-sql-tests.sh food_requests
--
-- Hermetic: two throwaway camps inside a transaction that rolls back. The QA logins are used as
-- people (their auth rows exist on staging) but are given memberships only in these camps.
-- RLS is exercised for real: `set local role authenticated` plus JWT claims, not just claims.
begin;

do $$
declare
  v_camp   uuid := 'f0000000-0000-4000-8000-00000000f001';   -- America/Vancouver
  v_other  uuid := 'f0000000-0000-4000-8000-00000000f002';   -- someone else's camp
  u_admin  uuid := 'e2e00000-0000-4000-8000-00000000000a';
  u_staff  uuid := 'e2e00000-0000-4000-8000-00000000000b';
  u_out    uuid := 'e2e00000-0000-4000-8000-00000000000c';   -- member of v_other only
  u_viewer uuid := 'e2e00000-0000-4000-8000-00000000000f';
  v_flour uuid; v_sugar uuid; v_foreign_item uuid;
  v_prog uuid; v_prog_off uuid; v_token text; v_token_off text;
  v_res jsonb; v_req record; v_id uuid; v_id2 uuid; v_id3 uuid; v_status_token text;
  v_n int; v_msg record; v_line record; v_d date; v_t time; v_local timestamp; v_ok boolean;
  v_free_line uuid; v_flour_line uuid; v_sugar_line uuid;
  f text;
  v_payload jsonb;
  v_id2_n int; v_before numeric; v_item record;
begin
  ---------------------------------------------------------------------------------------------
  -- Setup (as postgres)
  ---------------------------------------------------------------------------------------------
  insert into camps (id, name, slug, timezone) values
    (v_camp,  'Food Test Camp',  'food-test-camp-fr-suite',  'America/Vancouver'),
    (v_other, 'Other Food Camp', 'food-test-other-fr-suite', 'America/Toronto');
  insert into camp_members (camp_id, user_id, role, display_name, is_active) values
    (v_camp, u_admin, 'admin', 'Teddy Admin', true),
    (v_camp, u_staff, 'staff', 'Kim Kitchen', true),
    (v_camp, u_viewer, 'viewer', 'Val Viewer', true),
    (v_other, u_out, 'staff', 'Priya Program', true);

  insert into inventory_items (camp_id, name, dimension, base_unit, stock_unit, stock_unit_in_base, on_hand_base)
    values (v_camp, 'Flour', 'weight', 'g', 'lb', 453.592, 10000) returning id into v_flour;
  insert into inventory_items (camp_id, name, dimension, base_unit, stock_unit, stock_unit_in_base)
    values (v_camp, 'Sugar', 'weight', 'g', 'kg', 1000) returning id into v_sugar;
  insert into inventory_items (camp_id, name) values (v_other, 'Their caviar') returning id into v_foreign_item;

  insert into food_request_settings (camp_id, cutoff_hours, kitchen_emails, pickup_location)
    values (v_camp, 72, array['kitchen@example.com','chef@example.com'], 'the kitchen back door');
  insert into food_programs (camp_id, name) values (v_camp, 'Cooking Club') returning id, request_token into v_prog, v_token;
  insert into food_programs (camp_id, name, active) values (v_camp, 'Old Club', false) returning id, request_token into v_prog_off, v_token_off;

  -- A pickup two days out at 14:00 camp time: 48-ish hours, under the 72-hour cutoff.
  v_d := (now() at time zone 'America/Vancouver')::date + 2;
  v_payload := jsonb_build_object(
    'requester_name', 'Casey Counselor', 'requester_email', 'counselor@example.com', 'requester_phone', '555-0100',
    'notify_by', 'text', 'pickup_date', v_d, 'pickup_time', '14:00', 'purpose', 'Pancake night', 'headcount', 14,
    'lines', jsonb_build_array(
      jsonb_build_object('item_id', v_flour, 'qty', 5),
      jsonb_build_object('item_id', v_sugar, 'qty', 2),
      jsonb_build_object('label', 'Big marshmallows', 'qty', 3, 'unit_label', 'bags')));

  ---------------------------------------------------------------------------------------------
  -- T1: privileges. Only the four public entry points are callable signed out; the internal
  --     helpers are callable by nobody but the service role.
  ---------------------------------------------------------------------------------------------
  foreach f in array array['submit_food_request_public(text,jsonb)','get_food_request_form(text)',
                           'get_food_request_status(text)','cancel_food_request_public(text)'] loop
    if not has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'T1 FAIL: anon cannot call %', f; end if;
  end loop;
  foreach f in array array['submit_food_request(uuid,jsonb)','cancel_food_request(uuid)','decide_food_request(uuid,text,jsonb,text)',
                           'mark_food_request_ready(uuid)','mark_food_request_picked_up(uuid,text)','mark_food_request_missed(uuid)',
                           'save_food_program(uuid,uuid,text,text,text,text,text,boolean,integer)','rotate_food_program_link(uuid)',
                           'save_food_request_settings(uuid,numeric,text[],text)','delete_food_request_data(uuid)',
                           'undo_food_request_missed(uuid)','reopen_food_request(uuid)',
                           'add_kitchen_item_for_request(uuid,text,text,text,text,numeric,text)'] loop
    if has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'T1 FAIL: anon can call %', f; end if;
    if not has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'T1 FAIL: authenticated cannot call %', f; end if;
  end loop;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'food_request_%' or p.proname = 'plan_food_request_messages_internal')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_n <> 0 then raise exception 'T1 FAIL: % internal food request helpers are executable by anon/authenticated', v_n; end if;
  -- One of each: adding a parameter later must not leave an old overload behind (trap 5).
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('submit_food_request','submit_food_request_public','decide_food_request','cancel_food_request',
                       'get_food_request_form','get_food_request_status','save_food_program','plan_food_request_messages_internal')
   group by p.proname having count(*) > 1 limit 1;
  if v_n is not null then raise exception 'T1 FAIL: a food request function has overloads'; end if;

  ---------------------------------------------------------------------------------------------
  -- T2: anon cannot read or write the tables directly.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  foreach f in array array['food_requests','food_request_lines','food_programs','food_request_settings','food_request_throttle'] loop
    begin
      execute format('select count(*) from public.%I', f) into v_n;
      if v_n > 0 then raise exception 'T2 FAIL: anon read % rows of %', v_n, f; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into food_requests (camp_id, requester_name, source, pickup_date, pickup_time, notice_hours, cutoff_hours, is_late)
    values (v_camp, 'x', 'link', current_date + 5, '12:00', 100, 72, false);
    raise exception 'T2 FAIL: anon inserted a request';
  exception when insufficient_privilege then null;
  end;
  reset role;

  ---------------------------------------------------------------------------------------------
  -- T3: the public form tells a stranger names and units, nothing else; dead tokens say nothing.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  perform set_config('request.headers', json_build_object('x-forwarded-for','203.0.113.10')::text, true);
  set local role anon;
  v_res := get_food_request_form(v_token);
  if v_res is null or v_res->'program'->>'name' <> 'Cooking Club' then raise exception 'T3 FAIL: form not returned: %', v_res; end if;
  if jsonb_array_length(v_res->'items') <> 2 then raise exception 'T3 FAIL: expected 2 items, got %', v_res->'items'; end if;
  if (v_res->'items'->0) ? 'on_hand_base' or (v_res->'items'->0) ? 'unit_price' then raise exception 'T3 FAIL: form leaks stock or price'; end if;
  if (v_res->>'cutoff_hours')::numeric <> 72 or v_res->'camp'->>'timezone' <> 'America/Vancouver' then raise exception 'T3 FAIL: cutoff/timezone %', v_res; end if;
  if get_food_request_form('not-a-token') is not null then raise exception 'T3 FAIL: wrong token returned a form'; end if;
  if get_food_request_form(v_token_off) is not null then raise exception 'T3 FAIL: deactivated program returned a form'; end if;

  ---------------------------------------------------------------------------------------------
  -- T4: public submit. Late (48h < 72h) but never blocked; three lines incl. free text; both
  --     immediate messages queued with their text copy.
  ---------------------------------------------------------------------------------------------
  v_res := submit_food_request_public(v_token, v_payload);
  v_status_token := v_res->>'status_token';
  if v_status_token is null or (v_res->>'is_late')::boolean is not true then raise exception 'T4 FAIL: submit returned %', v_res; end if;
  v_res := get_food_request_status(v_status_token);
  if v_res->>'status' <> 'submitted' or jsonb_array_length(v_res->'lines') <> 3 then raise exception 'T4 FAIL: status page %', v_res; end if;
  if v_res ? 'requester_email' or v_res ? 'requester_phone' then raise exception 'T4 FAIL: status page leaks contact details'; end if;
  if get_food_request_status('nope') is not null then raise exception 'T4 FAIL: wrong status token answered'; end if;
  -- The status page says what it was for; the form's upcoming list names the asker by first name
  -- and carries a ref (so the phone that sent it can list it as its own), never a status token.
  if v_res->>'purpose' <> 'Pancake night' or (v_res->>'headcount')::int <> 14 or v_res->>'ref' is null then
    raise exception 'T4 FAIL: status page purpose/headcount/ref %', v_res;
  end if;
  v_res := get_food_request_form(v_token);
  if jsonb_array_length(v_res->'upcoming') <> 1 or v_res->'upcoming'->0->>'asked_by' <> 'Casey'
     or v_res->'upcoming'->0->>'ref' is null or (v_res->'upcoming'->0) ? 'status_token' then
    raise exception 'T4 FAIL: upcoming rows %', v_res->'upcoming';
  end if;
  reset role;

  select * into v_req from food_requests where status_token = v_status_token;
  v_id := v_req.id;
  if v_req.source <> 'link' or v_req.program_id <> v_prog or v_req.notify_by <> 'text' or not v_req.is_late
     or v_req.cutoff_hours <> 72 or v_req.notice_hours >= 72 or v_req.notice_hours < 24 then
    raise exception 'T4 FAIL: stored request %', row_to_json(v_req);
  end if;
  select id into v_flour_line from food_request_lines where request_id = v_id and item_id = v_flour;
  select id into v_sugar_line from food_request_lines where request_id = v_id and item_id = v_sugar;
  select id into v_free_line from food_request_lines where request_id = v_id and item_id is null;
  select * into v_line from food_request_lines where id = v_flour_line;
  if v_line.label <> 'Flour' or v_line.unit_label <> 'lb' or abs(v_line.qty_requested_base - 5 * 453.592) > 0.001 then
    raise exception 'T4 FAIL: linked line %', row_to_json(v_line);
  end if;
  select * into v_line from food_request_lines where id = v_free_line;
  if v_line.label <> 'Big marshmallows' or v_line.unit_label <> 'bags' or v_line.qty_requested_base is not null then
    raise exception 'T4 FAIL: free-text line %', row_to_json(v_line);
  end if;
  select count(*) into v_n from scheduled_messages
   where subject_type = 'food_request' and subject_id = v_id and state = 'scheduled' and body_text is not null
     and ((rule_key = 'request_received' and recipient_kind = 'requester' and to_email = 'counselor@example.com')
       or (rule_key in ('new_request:kitchen@example.com','new_request:chef@example.com') and recipient_kind = 'kitchen'));
  if v_n <> 3 then raise exception 'T4 FAIL: expected request_received + 2 new_request rows with body_text, got %', v_n; end if;
  select * into v_msg from scheduled_messages where subject_id = v_id and rule_key = 'new_request:kitchen@example.com';
  if v_msg.subject not like 'Short notice · %' or v_msg.body_text not like 'Short notice · %h:%' or length(v_msg.body_text) > 320
     or v_msg.body_html not like '%short notice (you ask for 3 days’ notice (72 h))%' then
    raise exception 'T4 FAIL: late kitchen message %/%', v_msg.subject, v_msg.body_text;
  end if;

  ---------------------------------------------------------------------------------------------
  -- T5: the public door refuses what it should.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  begin
    perform submit_food_request_public('wrong-token', v_payload);
    raise exception 'T5 FAIL: wrong token accepted';
  exception when others then if sqlerrm like 'T5 FAIL%' then raise; end if;
  end;
  begin
    perform submit_food_request_public(v_token_off, v_payload);
    raise exception 'T5 FAIL: deactivated program accepted';
  exception when others then if sqlerrm like 'T5 FAIL%' then raise; end if;
  end;
  begin
    perform submit_food_request_public(v_token, jsonb_set(v_payload, '{lines}',
      jsonb_build_array(jsonb_build_object('item_id', v_foreign_item, 'qty', 1))));
    raise exception 'T5 FAIL: another camp''s item accepted';
  exception when others then if sqlerrm like 'T5 FAIL%' then raise; end if;
  end;
  begin
    perform submit_food_request_public(v_token, jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d - 5)));
    raise exception 'T5 FAIL: a pickup in the past accepted';
  exception when others then if sqlerrm like 'T5 FAIL%' then raise; end if;
  end;
  begin
    perform submit_food_request_public(v_token, jsonb_set(v_payload, '{requester_email}', '"not-an-email"'));
    raise exception 'T5 FAIL: bad email accepted';
  exception when others then if sqlerrm like 'T5 FAIL%' then raise; end if;
  end;
  -- Lengths are clamped, not trusted.
  v_res := submit_food_request_public(v_token, jsonb_set(v_payload, '{requester_name}', to_jsonb(repeat('x', 5000))));
  reset role;
  if (select length(requester_name) from food_requests where status_token = v_res->>'status_token') > 120 then
    raise exception 'T5 FAIL: requester_name not clamped';
  end if;

  ---------------------------------------------------------------------------------------------
  -- T6: throttle. Ten from one address in an hour, the eleventh refused.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  perform set_config('request.headers', json_build_object('x-forwarded-for','198.51.100.77, 10.0.0.1')::text, true);
  set local role anon;
  for v_n in 1..10 loop
    perform submit_food_request_public(v_token, v_payload);
  end loop;
  begin
    perform submit_food_request_public(v_token, v_payload);
    raise exception 'T6 FAIL: 11th submit in an hour accepted';
  exception when others then
    if sqlerrm like 'T6 FAIL%' then raise; end if;
    if sqlstate <> '54000' then raise exception 'T6 FAIL: 11th submit failed for the wrong reason: %', sqlerrm; end if;
  end;
  reset role;
  perform set_config('request.headers', json_build_object('x-forwarded-for','203.0.113.10')::text, true);

  ---------------------------------------------------------------------------------------------
  -- T7: the late boundary, in Vancouver, on a UTC server, across the November clock change.
  ---------------------------------------------------------------------------------------------
  -- 2026-07-15 21:00 UTC is 14:00 PDT. A Saturday 14:00 pickup is exactly 72 real hours later.
  if food_request_notice_hours(v_camp, '2026-07-18', '14:00', '2026-07-15 21:00:00+00') <> 72 then
    raise exception 'T7 FAIL: summer 72h came out %', food_request_notice_hours(v_camp, '2026-07-18', '14:00', '2026-07-15 21:00:00+00');
  end if;
  -- DST ends 2026-11-01 02:00. Oct 30 14:00 PDT → Nov 2 14:00 PST is 73 real hours; 13:00 PST is 72.
  if food_request_notice_hours(v_camp, '2026-11-02', '14:00', '2026-10-30 21:00:00+00') <> 73 then
    raise exception 'T7 FAIL: across DST 14:00 should be 73h, got %', food_request_notice_hours(v_camp, '2026-11-02', '14:00', '2026-10-30 21:00:00+00');
  end if;
  if food_request_notice_hours(v_camp, '2026-11-02', '13:00', '2026-10-30 21:00:00+00') <> 72 then
    raise exception 'T7 FAIL: across DST 13:00 should be 72h';
  end if;
  -- One way of writing the rule, everywhere.
  if food_request_notice_rule(72) <> '3 days’ notice (72 h)' or food_request_notice_rule(36) <> '36 hours’ notice'
     or food_request_notice_rule(24) <> '1 day’s notice (24 h)' then
    raise exception 'T7 FAIL: notice rule wording %', food_request_notice_rule(72);
  end if;
  -- Through the real submit: exactly the cutoff is on time, one second under is late.
  v_local := (now() + interval '72 hours') at time zone 'America/Vancouver';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  v_res := submit_food_request(v_camp, jsonb_build_object('pickup_date', v_local::date, 'pickup_time', v_local::time,
             'lines', jsonb_build_array(jsonb_build_object('label','Apples','qty',1))));
  if (v_res->>'is_late')::boolean then raise exception 'T7 FAIL: exactly 72h flagged late (% h)', v_res->>'notice_hours'; end if;
  v_local := (now() + interval '72 hours' - interval '1 second') at time zone 'America/Vancouver';
  v_res := submit_food_request(v_camp, jsonb_build_object('pickup_date', v_local::date, 'pickup_time', v_local::time,
             'lines', jsonb_build_array(jsonb_build_object('label','Apples','qty',1))));
  if not (v_res->>'is_late')::boolean then raise exception 'T7 FAIL: 71:59:59 not flagged late'; end if;
  reset role;
  -- The signed-in submit filled the requester in from the account.
  select * into v_req from food_requests where id = (v_res->>'id')::uuid;
  if v_req.requested_by <> u_staff or v_req.requester_name <> 'Kim Kitchen' or v_req.requester_email <> 'qa-kitchen@example.com' or v_req.source <> 'app' then
    raise exception 'T7 FAIL: app submit requester %', row_to_json(v_req);
  end if;

  ---------------------------------------------------------------------------------------------
  -- T8: RLS as real roles.
  ---------------------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  select count(*) into v_n from food_requests where camp_id = v_camp;
  if v_n < 3 then raise exception 'T8 FAIL: staff sees % requests', v_n; end if;
  select count(*) into v_n from food_request_lines where camp_id = v_camp;
  if v_n < 3 then raise exception 'T8 FAIL: staff sees % lines', v_n; end if;
  begin
    update food_requests set status = 'picked_up' where id = v_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then raise exception 'T8 FAIL: staff wrote status directly'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into food_request_lines (request_id, camp_id, label, qty_requested) values (v_id, v_camp, 'sneaky', 1);
    raise exception 'T8 FAIL: staff inserted a line directly';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', u_viewer, 'role','authenticated')::text, true);
  select count(*) into v_n from food_requests where camp_id = v_camp;
  if v_n < 3 then raise exception 'T8 FAIL: viewer sees % requests', v_n; end if;
  begin
    perform decide_food_request(v_id, 'approve', '[]', null);
    raise exception 'T8 FAIL: viewer approved a request';
  exception when others then if sqlerrm like 'T8 FAIL%' then raise; end if;
  end;
  begin
    perform submit_food_request(v_camp, v_payload);
    raise exception 'T8 FAIL: viewer submitted a request';
  exception when others then if sqlerrm like 'T8 FAIL%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role','authenticated')::text, true);
  select count(*) into v_n from food_requests where camp_id = v_camp;
  if v_n <> 0 then raise exception 'T8 FAIL: another camp''s staff sees % requests', v_n; end if;
  select count(*) into v_n from food_programs where camp_id = v_camp;
  if v_n <> 0 then raise exception 'T8 FAIL: another camp''s staff sees % programs', v_n; end if;
  begin
    perform decide_food_request(v_id, 'approve', '[]', null);
    raise exception 'T8 FAIL: another camp''s staff approved a request';
  exception when others then if sqlerrm like 'T8 FAIL%' then raise; end if;
  end;
  begin
    perform cancel_food_request(v_id);
    raise exception 'T8 FAIL: another camp''s staff cancelled a request';
  exception when others then if sqlerrm like 'T8 FAIL%' then raise; end if;
  end;
  begin
    perform save_food_program(v_camp, null, 'Intruders', null, null, null, null, true, null);
    raise exception 'T8 FAIL: another camp''s staff created a program';
  exception when others then if sqlerrm like 'T8 FAIL%' then raise; end if;
  end;
  begin
    perform submit_food_request(v_camp, v_payload);
    raise exception 'T8 FAIL: another camp''s staff submitted into this camp';
  exception when others then if sqlerrm like 'T8 FAIL%' then raise; end if;
  end;
  reset role;

  ---------------------------------------------------------------------------------------------
  -- T9: illegal transitions from submitted.
  ---------------------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  begin perform mark_food_request_ready(v_id); raise exception 'T9 FAIL: submitted → ready';
  exception when others then if sqlerrm like 'T9 FAIL%' then raise; end if; end;
  begin perform mark_food_request_picked_up(v_id, 'Casey'); raise exception 'T9 FAIL: submitted → picked up';
  exception when others then if sqlerrm like 'T9 FAIL%' then raise; end if; end;
  begin perform mark_food_request_missed(v_id); raise exception 'T9 FAIL: submitted → missed';
  exception when others then if sqlerrm like 'T9 FAIL%' then raise; end if; end;
  begin perform decide_food_request(v_id, 'maybe', '[]', null); raise exception 'T9 FAIL: unknown decision';
  exception when others then if sqlerrm like 'T9 FAIL%' then raise; end if; end;

  ---------------------------------------------------------------------------------------------
  -- T10: approve with edits — change a quantity, link the free-text line, and one unavailable.
  ---------------------------------------------------------------------------------------------
  begin
    perform decide_food_request(v_id, 'approve', jsonb_build_array(jsonb_build_object('id', v_free_line, 'item_id', v_foreign_item, 'qty', 1)), null);
    raise exception 'T10 FAIL: linked a line to another camp''s item';
  exception when others then if sqlerrm like 'T10 FAIL%' then raise; end if; end;

  -- "3 bags" linked to an item counted in kg must not become "3 kg": the kitchen has to say how much.
  begin
    perform decide_food_request(v_id, 'approve', jsonb_build_array(jsonb_build_object('id', v_free_line, 'item_id', v_sugar)), null);
    raise exception 'T10 FAIL: linked a bags line to a kg item without a quantity';
  exception when others then
    if sqlerrm like 'T10 FAIL%' then raise; end if;
    if sqlerrm not like 'Enter how much Big marshmallows to approve, in kg. They asked for 3 bags.' then
      raise exception 'T10 FAIL: unit-change refusal said %', sqlerrm;
    end if;
  end;

  v_res := decide_food_request(v_id, 'approve', jsonb_build_array(
    jsonb_build_object('id', v_flour_line, 'qty', 3),
    jsonb_build_object('id', v_free_line, 'item_id', v_sugar, 'qty', 1.5),
    jsonb_build_object('id', v_sugar_line, 'unavailable', true)), 'Only 3 lb left until Monday');
  if v_res->>'status' <> 'approved' or not (v_res->>'changed')::boolean then raise exception 'T10 FAIL: decide returned %', v_res; end if;
  begin perform decide_food_request(v_id, 'approve', '[]', null); raise exception 'T10 FAIL: approved twice';
  exception when others then if sqlerrm like 'T10 FAIL%' then raise; end if; end;
  begin perform mark_food_request_picked_up(v_id, null); raise exception 'T10 FAIL: approved → picked up without ready';
  exception when others then if sqlerrm like 'T10 FAIL%' then raise; end if; end;
  reset role;

  select * into v_req from food_requests where id = v_id;
  if v_req.status <> 'approved' or not v_req.changed_by_kitchen or v_req.decided_by <> u_staff
     or v_req.kitchen_note <> 'Only 3 lb left until Monday' or v_req.decided_by_name <> 'Kim Kitchen' then
    raise exception 'T10 FAIL: request after decide %', row_to_json(v_req);
  end if;
  select * into v_line from food_request_lines where id = v_flour_line;
  if v_line.line_state <> 'changed' or v_line.qty_approved <> 3 or abs(v_line.qty_approved_base - 3 * 453.592) > 0.001 then
    raise exception 'T10 FAIL: changed flour line %', row_to_json(v_line);
  end if;
  select * into v_line from food_request_lines where id = v_free_line;
  if v_line.item_id <> v_sugar or v_line.approved_unit_label <> 'kg' or v_line.qty_approved_base <> 1500 or v_line.line_state <> 'changed' then
    raise exception 'T10 FAIL: linked free-text line %', row_to_json(v_line);
  end if;
  select * into v_line from food_request_lines where id = v_sugar_line;
  if v_line.line_state <> 'unavailable' or v_line.qty_approved_base <> 0 then raise exception 'T10 FAIL: unavailable line %', row_to_json(v_line); end if;

  select * into v_msg from scheduled_messages where subject_id = v_id and rule_key = 'request_decided';
  if v_msg.id is null or v_msg.subject not like 'Approved with changes%' or v_msg.body_text not like '%(asked 5)%'
     or v_msg.body_text not like '%not available%' or v_msg.body_html not like '%asked 5 lb, approved 3 lb%'
     or length(v_msg.body_text) > 320 or v_msg.body_text not like '%/food/status/' || v_status_token then
    raise exception 'T10 FAIL: request_decided message %/%', v_msg.subject, v_msg.body_text;
  end if;

  ---------------------------------------------------------------------------------------------
  -- T11: reminders after approval. 14:00 pickup → 08:00 that day; missed_pickup at 16:00 to the
  --      requester and each kitchen address.
  ---------------------------------------------------------------------------------------------
  select * into v_msg from scheduled_messages where subject_id = v_id and rule_key = 'pickup_reminder';
  if v_msg.id is null or v_msg.state <> 'scheduled' or (v_msg.send_after at time zone 'America/Vancouver') <> (v_d + time '08:00')
     or v_msg.body_text is null then
    raise exception 'T11 FAIL: pickup_reminder %', row_to_json(v_msg);
  end if;
  select count(*) into v_n from scheduled_messages where subject_id = v_id and rule_key like 'missed_pickup%' and state = 'scheduled'
     and (send_after at time zone 'America/Vancouver') = (v_d + time '16:00') and body_text is not null;
  if v_n <> 3 then raise exception 'T11 FAIL: expected 3 missed_pickup rows at 16:00, got %', v_n; end if;

  -- The nightly planner is idempotent: running it again adds nothing.
  select count(*) into v_n from scheduled_messages where subject_id = v_id;
  perform plan_food_request_messages_internal();
  if (select count(*) from scheduled_messages where subject_id = v_id) <> v_n then raise exception 'T11 FAIL: planner duplicated messages'; end if;

  ---------------------------------------------------------------------------------------------
  -- T12: ready, then picked up. ready_now queued; after pickup every pending reminder cancelled.
  ---------------------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  -- The kitchen can call off an approved request (the flour went to pancakes after all).
  begin perform cancel_food_request(v_id);
  exception when others then raise exception 'T12 FAIL: kitchen could not cancel an approved request: %', sqlerrm; end;
  reset role;
  select * into v_req from food_requests where id = v_id;
  if v_req.status <> 'cancelled' or v_req.cancelled_by <> 'kitchen' then raise exception 'T12 FAIL: cancel by kitchen %', row_to_json(v_req); end if;
  select count(*) into v_n from scheduled_messages where subject_id = v_id and state = 'scheduled'
     and (rule_key = 'pickup_reminder' or rule_key like 'missed_pickup%');
  if v_n <> 0 then raise exception 'T12 FAIL: % reminders still scheduled after cancel', v_n; end if;

  -- A fresh request for the happy path, via the link, approved as-is.
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  v_res := submit_food_request_public(v_token, jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d + 3)));
  reset role;
  select id into v_id2 from food_requests where status_token = v_res->>'status_token';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role','authenticated')::text, true);
  perform decide_food_request(v_id2, 'approve', '[]', null);
  perform mark_food_request_ready(v_id2);
  begin perform cancel_food_request(v_id2); raise exception 'T12 FAIL: ready → cancelled';
  exception when others then if sqlerrm like 'T12 FAIL%' then raise; end if; end;
  begin perform mark_food_request_ready(v_id2); raise exception 'T12 FAIL: ready → ready';
  exception when others then if sqlerrm like 'T12 FAIL%' then raise; end if; end;
  reset role;
  select * into v_req from food_requests where id = v_id2;
  if v_req.changed_by_kitchen or v_req.ready_at is null then raise exception 'T12 FAIL: plain approval %', row_to_json(v_req); end if;
  select count(*) into v_n from food_request_lines where request_id = v_id2 and line_state = 'ok' and qty_approved = qty_requested;
  if v_n <> 3 then raise exception 'T12 FAIL: plain approval lines ok=%', v_n; end if;
  if (select subject from scheduled_messages where subject_id = v_id2 and rule_key = 'request_decided') not like 'Approved:%' then
    raise exception 'T12 FAIL: plain approval subject';
  end if;
  select * into v_msg from scheduled_messages where subject_id = v_id2 and rule_key = 'ready_now';
  if v_msg.id is null or v_msg.state <> 'scheduled' or v_msg.body_text not like '%is ready at the kitchen back door%' then
    raise exception 'T12 FAIL: ready_now %', row_to_json(v_msg);
  end if;

  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  if get_food_request_status(v_res->>'status_token')->>'status' <> 'ready' then raise exception 'T12 FAIL: status page not ready'; end if;
  begin perform cancel_food_request_public(v_res->>'status_token'); raise exception 'T12 FAIL: public cancel from ready';
  exception when others then if sqlerrm like 'T12 FAIL%' then raise; end if; end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform mark_food_request_picked_up(v_id2, 'Casey');
  begin perform mark_food_request_missed(v_id2); raise exception 'T12 FAIL: picked up → missed';
  exception when others then if sqlerrm like 'T12 FAIL%' then raise; end if; end;
  reset role;
  select count(*) into v_n from scheduled_messages where subject_id = v_id2 and state = 'scheduled'
     and (rule_key in ('pickup_reminder','ready_now') or rule_key like 'missed_pickup%');
  if v_n <> 0 then raise exception 'T12 FAIL: % reminders still scheduled after pickup', v_n; end if;
  if (select state from scheduled_messages where subject_id = v_id2 and rule_key = 'pickup_reminder') <> 'cancelled' then
    raise exception 'T12 FAIL: pickup_reminder not cancelled after pickup';
  end if;
  -- Picking up takes the food off the shelf: one 'used' adjustment per linked item, naming the
  -- program. Flour 10000 g − 5 lb; sugar had none counted, so it floors at zero but is still logged.
  -- The unlinked marshmallow line has no item to take from.
  if abs((select on_hand_base from inventory_items where id = v_flour) - (10000 - 5 * 453.592)) > 0.001 then
    raise exception 'T12 FAIL: flour on hand after pickup is %', (select on_hand_base from inventory_items where id = v_flour);
  end if;
  select count(*) into v_n from inventory_adjustments
   where item_id in (v_flour, v_sugar) and reason = 'used' and adjusted_by = 'Kim Kitchen'
     and notes like 'Food request picked up: Cooking Club, pickup %';
  if v_n <> 2 then raise exception 'T12 FAIL: expected 2 used adjustments naming the program, got %', v_n; end if;
  if (select delta_base from inventory_adjustments where item_id = v_sugar) <> -2000
     or (select on_hand_base from inventory_items where id = v_sugar) <> 0 then
    raise exception 'T12 FAIL: sugar adjustment';
  end if;
  -- The cancelled and the approved-but-not-picked-up requests wrote nothing.
  if (select count(*) from inventory_adjustments where camp_id = v_camp) <> 2 then
    raise exception 'T12 FAIL: stock written by something other than the pickup';
  end if;

  ---------------------------------------------------------------------------------------------
  -- T13: a 07:00 pickup is reminded at 18:00 the evening before (quiet hours start at 08:00).
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  v_res := submit_food_request_public(v_token, jsonb_set(jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d + 4)), '{pickup_time}', '"07:00"'));
  reset role;
  select id into v_id3 from food_requests where status_token = v_res->>'status_token';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform decide_food_request(v_id3, 'approve', '[]', null);
  reset role;
  select * into v_msg from scheduled_messages where subject_id = v_id3 and rule_key = 'pickup_reminder';
  if v_msg.id is null or (v_msg.send_after at time zone 'America/Vancouver') <> ((v_d + 3) + time '18:00')
     or v_msg.body_text not like '%tomorrow 7am%' then
    raise exception 'T13 FAIL: 07:00 pickup reminder %', row_to_json(v_msg);
  end if;

  -- T14: the requester cancels an approved request from the status link: the kitchen is told,
  --      and the reminders stop.
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  perform cancel_food_request_public(v_res->>'status_token');
  begin perform cancel_food_request_public(v_res->>'status_token'); raise exception 'T14 FAIL: cancelled twice';
  exception when others then if sqlerrm like 'T14 FAIL%' then raise; end if; end;
  reset role;
  select count(*) into v_n from scheduled_messages where subject_id = v_id3 and rule_key like 'request_cancelled:%' and recipient_kind = 'kitchen' and body_text is not null;
  if v_n <> 2 then raise exception 'T14 FAIL: expected 2 kitchen cancellation notices, got %', v_n; end if;
  select count(*) into v_n from scheduled_messages where subject_id = v_id3 and state = 'scheduled'
     and (rule_key = 'pickup_reminder' or rule_key like 'missed_pickup%');
  if v_n <> 0 then raise exception 'T14 FAIL: reminders survived cancellation'; end if;
  if (select cancelled_by from food_requests where id = v_id3) <> 'requester' then raise exception 'T14 FAIL: cancelled_by'; end if;

  ---------------------------------------------------------------------------------------------
  -- T15: decline, and missed. Declined is terminal; missed is reachable from approved.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  v_res := submit_food_request_public(v_token, jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d + 5)));
  reset role;
  select id into v_id3 from food_requests where status_token = v_res->>'status_token';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform decide_food_request(v_id3, 'decline', '[]', 'We are closed that day');
  begin perform decide_food_request(v_id3, 'approve', '[]', null); raise exception 'T15 FAIL: declined → approved';
  exception when others then if sqlerrm like 'T15 FAIL%' then raise; end if; end;
  begin perform cancel_food_request(v_id3); raise exception 'T15 FAIL: declined → cancelled';
  exception when others then if sqlerrm like 'T15 FAIL%' then raise; end if; end;
  reset role;
  if (select subject from scheduled_messages where subject_id = v_id3 and rule_key = 'request_decided') not like 'Declined%' then
    raise exception 'T15 FAIL: decline message';
  end if;
  if exists (select 1 from scheduled_messages where subject_id = v_id3 and rule_key = 'pickup_reminder') then
    raise exception 'T15 FAIL: a declined request got a pickup reminder';
  end if;

  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  v_res := submit_food_request_public(v_token, jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d + 6)));
  reset role;
  select id into v_id3 from food_requests where status_token = v_res->>'status_token';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform decide_food_request(v_id3, 'approve', '[]', null);
  perform mark_food_request_missed(v_id3);
  begin perform mark_food_request_ready(v_id3); raise exception 'T15 FAIL: missed → ready';
  exception when others then if sqlerrm like 'T15 FAIL%' then raise; end if; end;
  reset role;
  if (select state from scheduled_messages where subject_id = v_id3 and rule_key = 'pickup_reminder') <> 'cancelled' then
    raise exception 'T15 FAIL: missed request still has a pending pickup reminder';
  end if;

  ---------------------------------------------------------------------------------------------
  -- T15b: Missed returns the food. A kitchen reviewer saw mozzarella drop 39 → 35 lb after tapping
  --       Missed; the database must write nothing to stock, and the tap must be undoable.
  ---------------------------------------------------------------------------------------------
  select count(*) into v_id2_n from inventory_adjustments where camp_id = v_camp;
  select on_hand_base into v_before from inventory_items where id = v_flour;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  -- v_id3 is the approved-then-missed request from T15: put it back, make it ready, miss it again.
  if undo_food_request_missed(v_id3) <> 'approved' then raise exception 'T15b FAIL: undo did not return to approved'; end if;
  perform mark_food_request_ready(v_id3);
  perform mark_food_request_missed(v_id3);
  if undo_food_request_missed(v_id3) <> 'ready' then raise exception 'T15b FAIL: undo of a ready pickup did not return to ready'; end if;
  begin perform undo_food_request_missed(v_id3); raise exception 'T15b FAIL: undid a request that was not missed';
  exception when others then if sqlerrm like 'T15b FAIL%' then raise; end if; end;
  perform mark_food_request_missed(v_id3);
  reset role;
  if (select on_hand_base from inventory_items where id = v_flour) <> v_before then
    raise exception 'T15b FAIL: missing a pickup changed flour on hand';
  end if;
  if (select count(*) from inventory_adjustments where camp_id = v_camp) <> v_id2_n then
    raise exception 'T15b FAIL: missing a pickup wrote a stock adjustment';
  end if;
  if (select missed_at from food_requests where id = v_id3) is null then raise exception 'T15b FAIL: missed_at not set'; end if;
  -- An outsider cannot undo it.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role','authenticated')::text, true);
  begin perform undo_food_request_missed(v_id3); raise exception 'T15b FAIL: another camp undid a missed pickup';
  exception when others then if sqlerrm like 'T15b FAIL%' then raise; end if; end;
  reset role;

  ---------------------------------------------------------------------------------------------
  -- T15c: a decision can go back to the inbox while its email is unsent, and not after.
  --       A line marked not available carries the kitchen's reason to the status page.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  v_res := submit_food_request_public(v_token, jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d + 8)));
  v_status_token := v_res->>'status_token';
  reset role;
  select id into v_id3 from food_requests where status_token = v_status_token;
  select id into v_sugar_line from food_request_lines where request_id = v_id3 and item_id = v_sugar;
  select id into v_free_line from food_request_lines where request_id = v_id3 and item_id is null;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform decide_food_request(v_id3, 'approve',
    jsonb_build_array(jsonb_build_object('id', v_sugar_line, 'unavailable', true, 'reason', '  Out until Monday, use honey  ')), 'x');
  reset role;
  if (select kitchen_reason from food_request_lines where id = v_sugar_line) <> 'Out until Monday, use honey' then
    raise exception 'T15c FAIL: reason not saved';
  end if;
  if (select body_html from scheduled_messages where subject_id = v_id3 and rule_key = 'request_decided') not like '%Out until Monday, use honey%' then
    raise exception 'T15c FAIL: decision email does not give the reason';
  end if;
  v_res := get_food_request_status(v_status_token);
  select l into v_msg from jsonb_array_elements(v_res->'lines') l where l->>'line_state' = 'unavailable';
  if (v_msg.l->>'kitchen_reason') <> 'Out until Monday, use honey' then raise exception 'T15c FAIL: status page reason %', v_res->'lines'; end if;
  if (select count(*) from jsonb_array_elements(v_res->'lines') l where (l->>'on_kitchen_list')::boolean is false) <> 1 then
    raise exception 'T15c FAIL: the typed-in line is not marked off the kitchen list %', v_res->'lines';
  end if;
  if v_res->>'notify_by' <> 'text' or (v_res->>'has_phone')::boolean is not true or v_res ? 'requester_phone' or v_res->>'timezone' <> 'America/Vancouver' then
    raise exception 'T15c FAIL: status page contact preference %', v_res;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform reopen_food_request(v_id3);
  reset role;
  select * into v_req from food_requests where id = v_id3;
  if v_req.status <> 'submitted' or v_req.decided_at is not null or v_req.kitchen_note is not null then
    raise exception 'T15c FAIL: reopen left %/%/%', v_req.status, v_req.decided_at, v_req.kitchen_note;
  end if;
  if exists (select 1 from food_request_lines where request_id = v_id3 and (line_state <> 'ok' or qty_approved is not null or kitchen_reason is not null)) then
    raise exception 'T15c FAIL: reopen left line decisions behind';
  end if;
  if exists (select 1 from scheduled_messages where subject_id = v_id3 and (rule_key in ('request_decided','pickup_reminder') or rule_key like 'missed_pickup%')) then
    raise exception 'T15c FAIL: reopen left the unsent decision messages';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform decide_food_request(v_id3, 'decline', '[]', 'Closed');
  reset role;
  if (select subject from scheduled_messages where subject_id = v_id3 and rule_key = 'request_decided') not like 'Declined%' then
    raise exception 'T15c FAIL: deciding again did not queue a fresh decision email';
  end if;
  update scheduled_messages set state = 'sent', sent_at = now() where subject_id = v_id3 and rule_key = 'request_decided';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  begin perform reopen_food_request(v_id3); raise exception 'T15c FAIL: reopened after the email went out';
  exception when others then if sqlerrm like 'T15c FAIL%' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', u_viewer, 'role','authenticated')::text, true);
  begin perform reopen_food_request(v_id); raise exception 'T15c FAIL: a viewer reopened a request';
  exception when others then if sqlerrm like 'T15c FAIL%' then raise; end if; end;
  reset role;

  ---------------------------------------------------------------------------------------------
  -- T15d: a typed-in item joins the kitchen's list once, and can then be linked on approval.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  begin perform add_kitchen_item_for_request(v_camp, 'Sprinkles', 'count', 'each', 'jar', 1); raise exception 'T15d FAIL: anon added an item';
  exception when others then if sqlerrm like 'T15d FAIL%' then raise; end if; end;
  v_res := submit_food_request_public(v_token, jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d + 9)));
  reset role;
  select id into v_id3 from food_requests where status_token = v_res->>'status_token';
  select id into v_free_line from food_request_lines where request_id = v_id3 and item_id is null;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  v_id2 := add_kitchen_item_for_request(v_camp, '  Big marshmallows ', 'count', 'each', 'bag', 1, 'snacks');
  if add_kitchen_item_for_request(v_camp, 'big MARSHMALLOWS', 'count', 'each', 'bag', 1) <> v_id2 then
    raise exception 'T15d FAIL: the same name made a second item';
  end if;
  begin perform add_kitchen_item_for_request(v_camp, 'Mystery', 'count', 'each', '', 1); raise exception 'T15d FAIL: an item with no unit';
  exception when others then if sqlerrm like 'T15d FAIL%' then raise; end if; end;
  perform decide_food_request(v_id3, 'approve', jsonb_build_array(jsonb_build_object('id', v_free_line, 'item_id', v_id2, 'qty', 3)), null);
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role','authenticated')::text, true);
  begin perform add_kitchen_item_for_request(v_camp, 'Their thing', 'count', 'each', 'each', 1); raise exception 'T15d FAIL: another camp added an item';
  exception when others then if sqlerrm like 'T15d FAIL%' then raise; end if; end;
  reset role;
  select * into v_item from inventory_items where id = v_id2;
  if v_item.name <> 'Big marshmallows' or v_item.stock_unit <> 'bag' or v_item.category <> 'snacks' or v_item.on_hand_base <> 0 or v_item.last_counted_at is not null then
    raise exception 'T15d FAIL: quick-created item %', row_to_json(v_item);
  end if;
  if (select item_id from food_request_lines where id = v_free_line) <> v_id2 or (select qty_approved_base from food_request_lines where id = v_free_line) <> 3 then
    raise exception 'T15d FAIL: the line did not link to the new item';
  end if;

  ---------------------------------------------------------------------------------------------
  -- T16: the planner cancels a rule whose condition stopped being true behind its back.
  ---------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  v_res := submit_food_request_public(v_token, jsonb_set(v_payload, '{pickup_date}', to_jsonb(v_d + 7)));
  reset role;
  select id into v_id3 from food_requests where status_token = v_res->>'status_token';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform decide_food_request(v_id3, 'approve', '[]', null);
  reset role;
  update food_requests set status = 'declined' where id = v_id3;
  perform plan_all_messages();
  if (select state from scheduled_messages where subject_id = v_id3 and rule_key = 'pickup_reminder') <> 'cancelled' then
    raise exception 'T16 FAIL: nightly planner left a reminder for a request no longer approved';
  end if;

  ---------------------------------------------------------------------------------------------
  -- T17: demo addresses never leave: the example.com requester row is cancelled at claim.
  ---------------------------------------------------------------------------------------------
  perform claim_outbox_batch(500);
  select * into v_msg from scheduled_messages where subject_id = v_id and rule_key = 'request_received';
  if v_msg.state <> 'cancelled' or v_msg.suppressed_reason <> 'demo_address' then
    raise exception 'T17 FAIL: example.com food message was %/%', v_msg.state, v_msg.suppressed_reason;
  end if;

  ---------------------------------------------------------------------------------------------
  -- T18: programs and settings through their RPCs; the kitchen wipe removes food data too.
  ---------------------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  v_prog_off := save_food_program(v_camp, null, 'Canoe trips', 'Robin', 'robin@example.com', null, '#185fa5', true, null);
  v_token_off := rotate_food_program_link(v_prog);
  if v_token_off = v_token then raise exception 'T18 FAIL: rotate kept the token'; end if;
  perform save_food_request_settings(v_camp, 48, array['  Kitchen@Example.com ', 'kitchen@example.com'], 'Dining hall');
  begin perform save_food_request_settings(v_camp, 48, array['nope'], null); raise exception 'T18 FAIL: bad kitchen email saved';
  exception when others then if sqlerrm like 'T18 FAIL%' then raise; end if; end;
  reset role;
  if (select kitchen_emails from food_request_settings where camp_id = v_camp) <> array['kitchen@example.com'] then
    raise exception 'T18 FAIL: kitchen emails not normalised: %', (select kitchen_emails from food_request_settings where camp_id = v_camp);
  end if;
  if get_food_request_form(v_token) is not null then raise exception 'T18 FAIL: the rotated-away link still works'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_viewer, 'role','authenticated')::text, true);
  begin perform delete_food_request_data(v_camp); raise exception 'T18 FAIL: viewer wiped food data';
  exception when others then if sqlerrm like 'T18 FAIL%' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role','authenticated')::text, true);
  perform delete_all_commissary_data(v_camp);
  reset role;
  if exists (select 1 from food_requests where camp_id = v_camp) or exists (select 1 from food_programs where camp_id = v_camp)
     or exists (select 1 from food_request_lines where camp_id = v_camp) or exists (select 1 from food_request_settings where camp_id = v_camp) then
    raise exception 'T18 FAIL: commissary wipe left food request data';
  end if;

  ---------------------------------------------------------------------------------------------
  -- T19: every table is realtime, full replica identity, and cloned with the camp.
  ---------------------------------------------------------------------------------------------
  select count(*) into v_n from pg_publication_tables where pubname = 'supabase_realtime'
     and tablename in ('food_programs','food_requests','food_request_lines','food_request_settings');
  if v_n <> 4 then raise exception 'T19 FAIL: % of 4 tables in supabase_realtime', v_n; end if;
  select count(*) into v_n from pg_class where relname in ('food_programs','food_requests','food_request_lines','food_request_settings')
     and relnamespace = 'public'::regnamespace and relreplident = 'f';
  if v_n <> 4 then raise exception 'T19 FAIL: % of 4 tables have replica identity full', v_n; end if;
  if exists (select 1 from clone_camp_coverage_gaps()) then raise exception 'T19 FAIL: clone coverage gaps %', (select array_agg(missing_table) from clone_camp_coverage_gaps()); end if;

  raise notice 'food_requests: 22/22 passed';
end $$;

select 'food_requests: 22/22 passed' as result;
rollback;

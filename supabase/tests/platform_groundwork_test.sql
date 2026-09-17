-- Groundwork shared by food requests, town trips and receipts.
--   bash scripts/run-sql-tests.sh platform_groundwork
begin;

do $$
declare
  v_camp uuid := 'f0000000-0000-4000-8000-00000000c001';
  v_n int;
  v_msg record;
begin
  -- G1: nothing that sends, claims or reads mail is callable by a signed-out visitor.
  select count(*) into v_n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('queue_message','cancel_message','claim_outbox_batch','mark_outbox_sent','drain_outbox',
                       'plan_all_messages','plan_work_messages','plan_deposit_chase','outbox_health','push_health',
                       'requeue_stuck_outbox','user_email','camp_admin_email',
                       'plan_food_request_messages_internal','plan_trip_messages_internal','plan_receipt_messages_internal',
                       'clone_camp_plan','clone_camp_coverage_gaps')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_n <> 0 then raise exception 'G1 FAIL: % outbox/internal functions still executable by anon or authenticated', v_n; end if;

  -- G2: exactly one queue_message, and it takes the text copy.
  select count(*) into v_n from pg_proc where proname = 'queue_message' and pronamespace = 'public'::regnamespace;
  if v_n <> 1 then raise exception 'G2 FAIL: % queue_message overloads', v_n; end if;

  -- G3: a message queued with text copy keeps it; a demo address is cancelled at claim time,
  --     a real address is not.
  insert into camps (id, name, slug, timezone) values (v_camp, 'G Test Camp', 'g-test-camp-groundwork', 'America/Toronto')
    on conflict (id) do nothing;
  perform queue_message(v_camp, 'g_test', v_camp, 'g_rule', 'requester', 'someone@example.com', 'Some One', null,
                        now() - interval '1 minute', 'Subject', '<p>Body</p>', 'Text copy');
  perform queue_message(v_camp, 'g_test', v_camp, 'g_rule', 'kitchen', 'real.person@campcommand.app', 'Real', null,
                        now() + interval '1 day', 'Subject', '<p>Body</p>', 'Text copy 2');
  select * into v_msg from scheduled_messages where subject_type = 'g_test' and recipient_kind = 'requester';
  if v_msg.body_text is distinct from 'Text copy' then raise exception 'G3 FAIL: body_text not stored'; end if;
  perform claim_outbox_batch(50);
  select * into v_msg from scheduled_messages where subject_type = 'g_test' and recipient_kind = 'requester';
  if v_msg.state <> 'cancelled' or v_msg.suppressed_reason <> 'demo_address' then
    raise exception 'G3 FAIL: example.com message was %/%', v_msg.state, v_msg.suppressed_reason;
  end if;
  select * into v_msg from scheduled_messages where subject_type = 'g_test' and recipient_kind = 'kitchen';
  if v_msg.state <> 'scheduled' then raise exception 'G3 FAIL: real address was touched (%)', v_msg.state; end if;

  -- G4: the new recipient kinds are accepted.
  perform queue_message(v_camp, 'g_test', v_camp, 'g_rule2', 'rider', 'r@example.org', null, null, now(), 's', 'b');
  perform queue_message(v_camp, 'g_test', v_camp, 'g_rule2', 'card_holder', 'c@example.org', null, null, now(), 's', 'b');

  -- G5: the planner still runs end to end with the three new hooks.
  perform plan_all_messages();

  -- G6: every camp table is either cloned or excluded on purpose.
  select count(*) into v_n from clone_camp_coverage_gaps();
  if v_n <> 0 then raise exception 'G6 FAIL: % camp tables neither cloned nor excluded', v_n; end if;

  raise notice 'platform_groundwork: 6/6 passed';
end $$;

select 'platform_groundwork: 6/6 passed' as result;
rollback;

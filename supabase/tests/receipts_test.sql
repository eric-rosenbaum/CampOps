-- Receipts: who can see which receipt, and the rules that keep the books straight.
--   bash scripts/run-sql-tests.sh receipts
--
-- Runs as the real `authenticated` role with a real JWT subject, so table RLS and storage
-- policies are exercised, not bypassed. Everything is rolled back.
begin;

create function pg_temp.login(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;

do $$
declare
  -- Camp under test, and a second camp whose admin must see nothing of the first.
  v_camp  uuid := 'f0000000-0000-4000-8000-00000000e001';
  v_other uuid := 'f0000000-0000-4000-8000-00000000e002';
  -- Existing staging QA logins, given roles in the fixture camps only for this transaction.
  u_admin   uuid := 'e2e00000-0000-4000-8000-00000000000a';
  u_outside uuid := 'e2e00000-0000-4000-8000-00000000000b';  -- admin of the OTHER camp only
  u_staff   uuid := 'e2e00000-0000-4000-8000-00000000000c';  -- staff, holds no card
  u_h1      uuid := 'e2e00000-0000-4000-8000-00000000000d';  -- holder of card 1
  u_h2      uuid := 'e2e00000-0000-4000-8000-00000000000e';  -- holder of card 2
  u_viewer  uuid := 'e2e00000-0000-4000-8000-00000000000f';
  m_h1 uuid; m_h2 uuid;
  c1 uuid; c2 uuid; c_other uuid; code1 uuid;
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid();
  r4 uuid := gen_random_uuid(); r5 uuid := gen_random_uuid();
  v_stmt uuid; l1 uuid; l2 uuid;
  c3 uuid; ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid(); rc uuid := gen_random_uuid();
  rd uuid := gen_random_uuid(); rc2 uuid := gen_random_uuid(); v_sep uuid; v_oct uuid; v_codes text;
  v_n int; v_ok boolean; v_j jsonb; v_passed int := 0; v_fn record;
  c4 uuid; re1 uuid := gen_random_uuid(); re2 uuid := gen_random_uuid(); re3 uuid := gen_random_uuid(); v_nov uuid; v_export uuid;
  v_line uuid; v_removal uuid; v_text text;
begin
  -- ── Fixtures (as postgres) ────────────────────────────────────────────────
  insert into camps (id, name, slug, timezone, account_type, platform_modules, modules)
  values (v_camp, 'R Test Camp', 'r-test-camp-receipts', 'America/Toronto', 'customer', '{"receipts":true}', '{"receipts":true}'),
         (v_other, 'R Other Camp', 'r-other-camp-receipts', 'America/Vancouver', 'customer', '{"receipts":true}', '{"receipts":true}');
  insert into camp_members (camp_id, user_id, role, display_name, is_active) values
    (v_camp, u_admin, 'admin', 'Admin', true),
    (v_camp, u_staff, 'staff', 'Staff NoCard', true),
    (v_camp, u_h1, 'staff', 'Holder One', true),
    (v_camp, u_h2, 'staff', 'Holder Two', true),
    (v_camp, u_viewer, 'viewer', 'Viewer', true),
    (v_other, u_outside, 'admin', 'Outside Admin', true);
  select id into m_h1 from camp_members where camp_id = v_camp and user_id = u_h1;
  select id into m_h2 from camp_members where camp_id = v_camp and user_id = u_h2;

  insert into expense_budget_codes (camp_id, code, name, qb_account) values (v_camp, 'PRG', 'Programs', 'Program Supplies') returning id into code1;
  insert into expense_cards (camp_id, label, holder_member_id, last4, holder_email) values (v_camp, 'Visa 1111', m_h1, '1111', 'holder.one@campcommand.app') returning id into c1;
  insert into expense_cards (camp_id, label, holder_member_id, last4) values (v_camp, 'Visa 2222', m_h2, '2222') returning id into c2;
  insert into expense_cards (camp_id, label, last4) values (v_other, 'Visa 9999', '9999') returning id into c_other;

  insert into receipts (id, camp_id, card_id, submitted_by, vendor, purchase_date, total, status, file_path) values
    (r1, v_camp, c1, u_h1, 'Maple Hardware', '2026-08-03', 45.20, 'ready', v_camp || '/' || r1 || '.jpg'),
    (r2, v_camp, c2, u_h2, 'Lakeview Grocers', '2026-08-04', 12.00, 'ready', v_camp || '/' || r2 || '.jpg'),
    (r3, v_camp, c1, u_staff, 'Borrowed Card Books', '2026-08-05', 30.00, 'needs_review', v_camp || '/' || r3 || '.jpg'),
    (r4, v_camp, null, u_admin, 'Admin Supplies', '2026-08-06', 99.99, 'ready', v_camp || '/' || r4 || '.png'),
    (r5, v_camp, c1, u_h1, 'Maple Hardware', '2026-08-03', 45.20, 'ready', null);

  insert into storage.objects (bucket_id, name) values
    ('receipts', v_camp || '/' || r1 || '.jpg'), ('receipts', v_camp || '/' || r2 || '.jpg'),
    ('receipts', v_camp || '/' || r3 || '.jpg'), ('receipts', v_camp || '/' || r4 || '.png');

  -- ── R1: nothing here is callable by a signed-out visitor; internals not even by members ──
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('is_expense_card_holder','can_see_receipt','can_use_receipts','can_read_receipt_file',
                       'can_write_receipt_file','receipts_guard','statement_lines_guard','card_statements_guard',
                       'expense_cards_guard','expense_html','claim_ai_quota','import_card_statement',
                       'resolve_statement_lines','remind_card_holder','export_receipts','plan_receipt_messages_internal',
                       'card_month_blockers_internal','export_card_statement','merge_duplicate_receipt',
                       'unlock_exported_receipt','unlock_exported_statement','remove_receipt','restore_removed_receipt',
                       'ask_card_holder_about_receipt','receipts_delete_guard','card_statements_delete_guard',
                       'receipts_books_write_allowed','receipts_person_name','receipt_lines_snapshot_internal')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_n <> 0 then raise exception 'R1 FAIL: % receipts functions executable by anon', v_n; end if;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('receipts_guard','statement_lines_guard','card_statements_guard','expense_cards_guard',
                       'expense_html','plan_receipt_messages_internal','card_month_blockers_internal',
                       'receipts_delete_guard','card_statements_delete_guard','receipts_books_write_allowed',
                       'receipts_person_name','receipt_lines_snapshot_internal')
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_n <> 0 then raise exception 'R1 FAIL: % internal receipts functions executable by authenticated', v_n; end if;
  select count(*) into v_n from (values ('receipts'),('expense_cards'),('expense_budget_codes'),('expense_tax_settings'),
                                         ('card_statements'),('statement_lines'),('expense_exports'),('ai_usage')) t(n)
   where has_table_privilege('anon', 'public.' || t.n, 'select');
  if v_n <> 0 then raise exception 'R1 FAIL: anon can select % receipts tables', v_n; end if;
  v_passed := v_passed + 1;

  -- ── R2: who sees which receipt ─────────────────────────────────────────────
  perform pg_temp.login(u_admin);
  select count(*) into v_n from receipts where camp_id = v_camp;
  reset role;
  if v_n <> 5 then raise exception 'R2 FAIL: admin sees % of 5', v_n; end if;

  perform pg_temp.login(u_h1);
  select count(*) into v_n from receipts where camp_id = v_camp;
  if v_n <> 3 then raise exception 'R2 FAIL: holder one sees % (own two + borrowed-card one)', v_n; end if;
  select count(*) into v_n from receipts where id = r2;
  reset role;
  if v_n <> 0 then raise exception 'R2 FAIL: holder one can see holder two''s receipt'; end if;

  perform pg_temp.login(u_h2);
  select count(*) into v_n from receipts where camp_id = v_camp;
  reset role;
  if v_n <> 1 then raise exception 'R2 FAIL: holder two sees % (own one)', v_n; end if;

  perform pg_temp.login(u_staff);
  select count(*) into v_n from receipts where camp_id = v_camp;
  reset role;
  if v_n <> 1 then raise exception 'R2 FAIL: non-holder staff sees % (only what they submitted)', v_n; end if;

  perform pg_temp.login(u_viewer);
  select count(*) into v_n from receipts where camp_id = v_camp;
  reset role;
  if v_n <> 0 then raise exception 'R2 FAIL: viewer sees % receipts', v_n; end if;

  perform pg_temp.login(u_outside);
  select count(*) into v_n from receipts where camp_id = v_camp;
  reset role;
  if v_n <> 0 then raise exception 'R2 FAIL: another camp''s admin sees % receipts', v_n; end if;
  v_passed := v_passed + 1;

  -- ── R3: staff writes are fenced ────────────────────────────────────────────
  perform pg_temp.login(u_h2);
  update receipts set vendor = 'hijacked' where id = r1;
  get diagnostics v_n = row_count;
  reset role;
  if v_n <> 0 then raise exception 'R3 FAIL: holder two updated holder one''s receipt'; end if;

  perform pg_temp.login(u_h1);
  v_ok := false;
  begin insert into receipts (camp_id, card_id, submitted_by, total) values (v_camp, c1, u_h2, 1);
  exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R3 FAIL: staff submitted a receipt as someone else'; end if;
  v_ok := false;
  begin update receipts set status = 'exported' where id = r1;
  exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R3 FAIL: staff marked a receipt exported'; end if;
  v_ok := false;
  begin update receipts set card_id = c_other where id = r1;
  exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R3 FAIL: a receipt was hung on another camp''s card'; end if;
  -- Own receipt, ordinary edit: allowed.
  update receipts set purpose = 'Craft supplies', budget_code_id = code1 where id = r1;
  get diagnostics v_n = row_count;
  reset role;
  if v_n <> 1 then raise exception 'R3 FAIL: holder could not edit their own receipt'; end if;

  perform pg_temp.login(u_viewer);
  v_ok := false;
  begin insert into receipts (camp_id, submitted_by, total) values (v_camp, u_viewer, 1);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R3 FAIL: a viewer submitted a receipt'; end if;
  v_passed := v_passed + 1;

  -- ── R4: cards and codes: staff read, only admins write, viewers nothing ───
  perform pg_temp.login(u_staff);
  select count(*) into v_n from expense_cards where camp_id = v_camp;
  if v_n <> 2 then reset role; raise exception 'R4 FAIL: staff sees % cards', v_n; end if;
  v_ok := false;
  begin insert into expense_cards (camp_id, label) values (v_camp, 'Sneaky');
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R4 FAIL: staff created a card'; end if;
  perform pg_temp.login(u_viewer);
  select count(*) into v_n from expense_cards where camp_id = v_camp;
  reset role;
  if v_n <> 0 then raise exception 'R4 FAIL: viewer sees % cards', v_n; end if;
  v_passed := v_passed + 1;

  -- ── R5 + R6: statements are admin-only, and one per card-month ─────────────
  perform pg_temp.login(u_admin);
  v_stmt := import_card_statement(c1, '2026-08-01', 90.40, 'aug.csv',
    '[{"posted_date":"2026-08-04","description":"MAPLE HARDWARE #12","amount":45.20},
      {"posted_date":"2026-08-05","description":"MAPLE HARDWARE #12","amount":45.20}]'::jsonb);
  select count(*) into v_n from statement_lines where statement_id = v_stmt;
  if v_n <> 2 then reset role; raise exception 'R6 FAIL: % lines imported', v_n; end if;
  v_ok := false;
  begin perform import_card_statement(c1, '2026-08-01', 1, 'again.csv', '[{"posted_date":"2026-08-04","description":"x","amount":1}]'::jsonb);
  exception when unique_violation then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R6 FAIL: the same card-month imported twice'; end if;
  v_ok := false;
  begin insert into card_statements (camp_id, card_id, period_month) values (v_camp, c1, '2026-08-01');
  exception when unique_violation then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R6 FAIL: a direct duplicate statement insert was accepted'; end if;
  -- Replace is explicit, and replaces.
  v_stmt := import_card_statement(c1, '2026-08-01', 90.40, 'aug-v2.csv',
    '[{"posted_date":"2026-08-04","description":"MAPLE HARDWARE #12","amount":45.20},
      {"posted_date":"2026-08-05","description":"MAPLE HARDWARE #12","amount":45.20}]'::jsonb, true);
  select count(*) into v_n from card_statements where card_id = c1;
  reset role;
  if v_n <> 1 then raise exception 'R6 FAIL: replace left % statements', v_n; end if;

  perform pg_temp.login(u_h1);
  select count(*) into v_n from card_statements where camp_id = v_camp;
  if v_n <> 0 then reset role; raise exception 'R5 FAIL: holder sees % statements', v_n; end if;
  select count(*) into v_n from statement_lines where camp_id = v_camp;
  if v_n <> 0 then reset role; raise exception 'R5 FAIL: holder sees % statement lines', v_n; end if;
  v_ok := false;
  begin perform import_card_statement(c1, '2026-07-01', 1, 'x.csv', '[{"posted_date":"2026-07-04","description":"x","amount":1}]'::jsonb);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R5 FAIL: staff imported a statement'; end if;
  v_passed := v_passed + 2;

  -- ── R7: one receipt pays for one charge ────────────────────────────────────
  select id into l1 from statement_lines where statement_id = v_stmt order by posted_date limit 1;
  select id into l2 from statement_lines where statement_id = v_stmt order by posted_date desc limit 1;
  perform pg_temp.login(u_admin);
  perform resolve_statement_lines(jsonb_build_array(jsonb_build_object('line_id', l1, 'match_state', 'matched', 'receipt_id', r1)));
  v_ok := false;
  begin perform resolve_statement_lines(jsonb_build_array(jsonb_build_object('line_id', l2, 'match_state', 'matched', 'receipt_id', r1)));
  exception when unique_violation then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R7 FAIL: one receipt matched two charges via the RPC'; end if;
  v_ok := false;
  begin update statement_lines set match_state = 'matched', receipt_id = r1 where id = l2;
  exception when unique_violation then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R7 FAIL: one receipt matched two charges by direct update'; end if;
  v_ok := false;
  begin update statement_lines set match_state = 'matched', receipt_id = null where id = l2;
  exception when check_violation then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R7 FAIL: a line was matched to no receipt'; end if;
  -- All-or-nothing: the valid first change is rolled back with the invalid second one.
  v_ok := false;
  begin perform resolve_statement_lines(jsonb_build_array(
      jsonb_build_object('line_id', l2, 'match_state', 'matched', 'receipt_id', r5),
      jsonb_build_object('line_id', l1, 'match_state', 'matched', 'receipt_id', r5)));
  exception when unique_violation then v_ok := true; end;
  select count(*) into v_n from statement_lines where receipt_id = r5;
  reset role;
  if not v_ok or v_n <> 0 then raise exception 'R7 FAIL: a failed bulk resolve left % partial matches', v_n; end if;
  v_passed := v_passed + 1;

  -- ── R8: export marks rows and refuses a silent second export ──────────────
  perform pg_temp.login(u_h1);
  v_ok := false;
  begin perform export_receipts(v_camp, array[r1], '2026-08-01', '2026-08-31', array[c1], 'qbo_3col', 'x.csv', false);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R8 FAIL: staff exported receipts'; end if;

  perform pg_temp.login(u_admin);
  v_j := export_receipts(v_camp, array[r1, r2], '2026-08-01', '2026-08-31', array[c1, c2], 'qbo_3col', 'aug.csv', false);
  if (v_j->>'row_count')::int <> 2 or (v_j->>'total')::numeric <> 57.20 then
    reset role; raise exception 'R8 FAIL: export recorded %', v_j;
  end if;
  select count(*) into v_n from receipts where id in (r1, r2) and status = 'exported' and export_id = (v_j->>'export_id')::uuid;
  if v_n <> 2 then reset role; raise exception 'R8 FAIL: % of 2 rows marked exported', v_n; end if;
  v_ok := false;
  begin perform export_receipts(v_camp, array[r1, r4], null, null, null, 'qbo_3col', 'again.csv', false);
  exception when others then v_ok := sqlerrm like '%already exported%'; end;
  if not v_ok then reset role; raise exception 'R8 FAIL: an exported receipt was exported again without opting in'; end if;
  select count(*) into v_n from receipts where id = r4 and status = 'exported';
  if v_n <> 0 then reset role; raise exception 'R8 FAIL: the refused export still marked r4'; end if;
  v_j := export_receipts(v_camp, array[r1, r4], null, null, null, 'detailed', 'again.csv', true);
  if (v_j->>'row_count')::int <> 2 then reset role; raise exception 'R8 FAIL: opted-in re-export recorded %', v_j; end if;
  v_ok := false;
  begin perform export_receipts(v_camp, array[r3], null, null, null, 'qbo_3col', 'r.csv', false);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R8 FAIL: a receipt still needing review was exported'; end if;

  -- An exported receipt is locked for its holder.
  perform pg_temp.login(u_h1);
  v_ok := false;
  begin update receipts set total = 1 where id = r1;
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R8 FAIL: a holder edited an exported receipt'; end if;
  v_passed := v_passed + 1;

  -- ── R9: AI quota ───────────────────────────────────────────────────────────
  update camps set account_type = 'trial' where id = v_camp;
  insert into ai_usage (camp_id, user_id, function, created_at)
    select v_camp, u_h1, 'read-receipt', now() from generate_series(1, 24);
  -- Yesterday's reads do not count against today.
  insert into ai_usage (camp_id, user_id, function, created_at)
    select v_camp, u_h1, 'read-receipt', now() - interval '2 days' from generate_series(1, 30);
  perform pg_temp.login(u_h1);
  v_j := claim_ai_quota(v_camp, 'read-receipt');
  if not (v_j->>'allowed')::boolean or (v_j->>'limit')::int <> 25 then reset role; raise exception 'R9 FAIL: 25th trial read refused: %', v_j; end if;
  v_j := claim_ai_quota(v_camp, 'read-receipt');
  reset role;
  if (v_j->>'allowed')::boolean or v_j->>'reason' <> 'quota' then raise exception 'R9 FAIL: 26th trial read allowed: %', v_j; end if;
  update camps set account_type = 'customer' where id = v_camp;
  perform pg_temp.login(u_h1);
  v_j := claim_ai_quota(v_camp, 'read-receipt');
  reset role;
  if not (v_j->>'allowed')::boolean or (v_j->>'limit')::int <> 60 then raise exception 'R9 FAIL: customer limit not 60: %', v_j; end if;
  perform pg_temp.login(u_viewer);
  v_j := claim_ai_quota(v_camp, 'read-receipt');
  reset role;
  if (v_j->>'allowed')::boolean or v_j->>'reason' <> 'not_member' then raise exception 'R9 FAIL: viewer claimed AI: %', v_j; end if;
  perform pg_temp.login(u_outside);
  v_j := claim_ai_quota(v_camp, 'read-receipt');
  reset role;
  if (v_j->>'allowed')::boolean then raise exception 'R9 FAIL: another camp''s admin spent this camp''s quota'; end if;
  select count(*) into v_n from ai_usage where camp_id = v_camp and created_at > now() - interval '1 hour';
  if v_n <> 26 then raise exception 'R9 FAIL: % usage rows today, expected 26', v_n; end if;
  v_passed := v_passed + 1;

  -- ── R10: storage mirrors the table ─────────────────────────────────────────
  perform pg_temp.login(u_h1);
  select count(*) into v_n from storage.objects where bucket_id = 'receipts' and name like v_camp || '/%';
  reset role;
  if v_n <> 2 then raise exception 'R10 FAIL: holder one can list % receipt files (own + borrowed-card)', v_n; end if;
  perform pg_temp.login(u_h2);
  select count(*) into v_n from storage.objects where bucket_id = 'receipts' and name = v_camp || '/' || r1 || '.jpg';
  reset role;
  if v_n <> 0 then raise exception 'R10 FAIL: holder two can read holder one''s receipt file'; end if;
  perform pg_temp.login(u_viewer);
  select count(*) into v_n from storage.objects where bucket_id = 'receipts' and name like v_camp || '/%';
  reset role;
  if v_n <> 0 then raise exception 'R10 FAIL: viewer can read % receipt files', v_n; end if;
  perform pg_temp.login(u_outside);
  select count(*) into v_n from storage.objects where bucket_id = 'receipts' and name like v_camp || '/%';
  reset role;
  if v_n <> 0 then raise exception 'R10 FAIL: another camp''s admin can read % receipt files', v_n; end if;
  perform pg_temp.login(u_admin);
  select count(*) into v_n from storage.objects where bucket_id = 'receipts' and name like v_camp || '/%';
  reset role;
  if v_n <> 4 then raise exception 'R10 FAIL: admin reads % of 4 files', v_n; end if;

  -- Writes: only to a receipt you submitted and that is not exported.
  perform pg_temp.login(u_h2);
  v_ok := false;
  begin insert into storage.objects (bucket_id, name) values ('receipts', v_camp || '/' || r5 || '.jpg');
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R10 FAIL: holder two uploaded a file for holder one''s receipt'; end if;
  perform pg_temp.login(u_h1);
  insert into storage.objects (bucket_id, name) values ('receipts', v_camp || '/' || r5 || '.jpg');
  v_ok := false;
  begin insert into storage.objects (bucket_id, name) values ('receipts', v_other || '/' || r5 || '.jpg');
  exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R10 FAIL: a file was written under another camp''s folder'; end if;
  v_ok := false;
  begin insert into storage.objects (bucket_id, name) values ('receipts', v_camp || '/' || gen_random_uuid() || '.jpg');
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R10 FAIL: a file was written for a receipt that does not exist'; end if;
  v_passed := v_passed + 1;

  -- ── R11: Remind holder queues one text-ready message a day ────────────────
  perform pg_temp.login(u_admin);
  v_j := remind_card_holder(l2);
  if not (v_j->>'queued')::boolean or v_j->>'to_email' <> 'holder.one@campcommand.app' then
    reset role; raise exception 'R11 FAIL: reminder not queued: %', v_j;
  end if;
  perform remind_card_holder(l2);
  reset role;
  select count(*) into v_n from scheduled_messages
   where subject_type = 'statement_line' and subject_id = l2 and recipient_kind = 'card_holder'
     and rule_key like 'receipt_missing:%' and body_text like 'Receipt needed: $45.20%';
  if v_n <> 1 then raise exception 'R11 FAIL: % reminder rows (want exactly 1 with body_text)', v_n; end if;
  perform pg_temp.login(u_h1);
  v_ok := false;
  begin perform remind_card_holder(l2);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R11 FAIL: staff sent a reminder'; end if;
  v_passed := v_passed + 1;

  -- ── R12: the nightly planner nudges people with receipts left unchecked ───
  update receipts set status = 'needs_review', created_at = now() - interval '3 days' where id = r5;
  perform plan_receipt_messages_internal();
  select count(*) into v_n from scheduled_messages
   where camp_id = v_camp and subject_type = 'receipt_review' and rule_key like 'needs_review:' || u_h1 || ':%';
  if v_n <> 1 then raise exception 'R12 FAIL: % review digests for holder one', v_n; end if;
  v_passed := v_passed + 1;

  -- ── R13: a cloned camp's card holds nobody instead of failing the clone ──
  insert into expense_cards (camp_id, label, holder_member_id) values (v_other, 'Cloned', m_h1) returning id into c_other;
  select count(*) into v_n from expense_cards where id = c_other and holder_member_id is null;
  if v_n <> 1 then raise exception 'R13 FAIL: a foreign holder survived the insert'; end if;
  v_ok := false;
  begin update expense_cards set holder_member_id = m_h1 where id = c_other;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'R13 FAIL: a card was given a holder from another camp'; end if;
  v_passed := v_passed + 1;


  -- ── R14: a month agrees only when nothing is left to explain ─────────────
  -- The same rules as reconcileSummary() in src/lib/receipts.ts, so an export cannot mark a month
  -- the screen would have called unresolved.
  -- As postgres with no signed-in subject: `reset role` leaves the last login's JWT claims behind.
  perform set_config('request.jwt.claims', '', true);
  insert into expense_cards (camp_id, label, last4) values (v_camp, 'Visa 3333', '3333') returning id into c3;
  insert into receipts (id, camp_id, card_id, submitted_by, vendor, purchase_date, total, status, created_at) values
    (ra, v_camp, c3, u_admin, 'North Store', '2026-09-03', 50.00, 'ready', '2026-09-04 12:00-04'),
    (rb, v_camp, c3, u_admin, 'South Store', '2026-09-05', 20.00, 'needs_review', '2026-09-06 12:00-04'),
    (rc, v_camp, c3, u_admin, 'Orphan Shop', '2026-09-30', 7.00, 'ready', '2026-09-30 20:00-04'),
    -- Undated, snapped at 22:30 on September 30th in Ontario (already October in UTC).
    (rd, v_camp, c3, u_admin, 'No Date Diner', null, 3.00, 'needs_review', '2026-10-01 02:30+00');
  perform pg_temp.login(u_admin);
  v_sep := import_card_statement(c3, '2026-09-01', 79.00, 'sep.csv',
    '[{"posted_date":"2026-09-04","description":"NORTH STORE","amount":50.00},
      {"posted_date":"2026-09-06","description":"SOUTH STORE","amount":20.00},
      {"posted_date":"2026-09-12","description":"PARKING","amount":10.00},
      {"posted_date":"2026-09-14","description":"REFUND","amount":-5.00},
      {"posted_date":"2026-09-20","description":"STREAMING","amount":4.00}]'::jsonb);
  reset role;
  select string_agg((b->>'code') || '=' || (b->>'count'), ',' order by b->>'code') into v_codes from jsonb_array_elements(card_month_blockers_internal(v_sep)) b;
  if v_codes is distinct from 'no_charge=3,undated=1,unexplained=4' then raise exception 'R14 FAIL: fresh month blockers %', v_codes; end if;

  perform pg_temp.login(u_admin);
  perform resolve_statement_lines((select jsonb_agg(jsonb_build_object('line_id', id, 'match_state',
      case description when 'NORTH STORE' then 'matched' when 'SOUTH STORE' then 'matched' when 'PARKING' then 'no_receipt_ok' else 'personal' end,
      'receipt_id', case description when 'NORTH STORE' then ra when 'SOUTH STORE' then rb end))
    from statement_lines where statement_id = v_sep and amount > 0));
  reset role;
  select string_agg((b->>'code') || '=' || (b->>'count'), ',' order by b->>'code') into v_codes from jsonb_array_elements(card_month_blockers_internal(v_sep)) b;
  -- The reviewer's green month: everything matched, one match still unchecked, a receipt with no
  -- charge, and an undated receipt the screen never listed.
  if v_codes is distinct from 'matched_needs_review=1,no_charge=1,undated=1' then raise exception 'R14 FAIL: resolved month blockers %', v_codes; end if;

  perform pg_temp.login(u_admin);
  v_ok := false;
  begin perform export_card_statement(v_sep, 'qbo_bills', 'x.csv', 'DD/MM/YYYY', false);
  exception when others then v_ok := sqlerrm like 'This month does not agree%'; end;
  reset role;
  if not v_ok then raise exception 'R14 FAIL: a month that does not agree was exported'; end if;

  -- A holder cannot set their own receipt aside; finance can.
  perform pg_temp.login(u_h1);
  v_ok := false;
  begin update receipts set deferred_month = '2026-08-01' where id = r5;
  exception when others then v_ok := sqlerrm like 'Only finance can set a receipt aside%'; end;
  reset role;
  if not v_ok then raise exception 'R14 FAIL: a holder set a receipt aside'; end if;

  perform pg_temp.login(u_admin);
  update receipts set deferred_month = '2026-09-01', deferred_note = 'Bought on the 30th' where id = rc;   -- posts next month
  update receipts set card_id = c2 where id = rd;                                                        -- wrong card
  update receipts set status = 'ready' where id = rb;                                                   -- checked
  reset role;
  if jsonb_array_length(card_month_blockers_internal(v_sep)) <> 0 then
    raise exception 'R14 FAIL: resolved month still blocked by %', card_month_blockers_internal(v_sep);
  end if;
  -- Each matched receipt against its own charge, and the bill's total against the lines.
  perform set_config('request.jwt.claims', '', true);
  update receipts set total = 51.00 where id = ra;
  if card_month_blockers_internal(v_sep)->0->>'code' <> 'amount_differs' then raise exception 'R14 FAIL: a receipt unequal to its charge was not a blocker'; end if;
  update receipts set total = 50.00 where id = ra;
  update card_statements set statement_total = 97.00 where id = v_sep;
  if card_month_blockers_internal(v_sep)->0->>'code' <> 'total_mismatch' then raise exception 'R14 FAIL: a typo in the total was not a blocker'; end if;
  update card_statements set statement_total = 79.00 where id = v_sep;
  -- The receipt set aside from September is October's to explain.
  perform pg_temp.login(u_admin);
  v_oct := import_card_statement(c3, '2026-10-01', 7.00, 'oct.csv', '[{"posted_date":"2026-10-02","description":"ORPHAN SHOP","amount":7.00}]'::jsonb);
  reset role;
  select string_agg((b->>'code') || '=' || (b->>'count'), ',' order by b->>'code') into v_codes from jsonb_array_elements(card_month_blockers_internal(v_oct)) b;
  if v_codes is distinct from 'no_charge=1,unexplained=1' then raise exception 'R14 FAIL: October blockers %', v_codes; end if;
  v_passed := v_passed + 1;

  -- ── R15: an export follows the statement and is recorded once ─────────────
  perform pg_temp.login(u_h1);
  v_ok := false;
  begin perform export_card_statement(v_sep, 'qbo_bank_3col', 'x.csv', 'DD/MM/YYYY', false);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R15 FAIL: staff exported a statement'; end if;
  perform pg_temp.login(u_admin);
  v_ok := false;
  begin perform export_card_statement(v_sep, 'detailed', 'x.csv', 'DD/MM/YYYY', false);
  exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R15 FAIL: the review spreadsheet marked a month exported'; end if;
  -- Bank upload: every line but the personal one, credits included. 50 + 20 + 10 - 5.
  v_j := export_card_statement(v_sep, 'qbo_bank_3col', 'quickbooks-bank-3col-visa-3333-2026-09.csv', 'DD/MM/YYYY', false);
  if (v_j->>'row_count')::int <> 4 or (v_j->>'total')::numeric <> 75.00 or (v_j->>'personal_total')::numeric <> 4.00 then
    reset role; raise exception 'R15 FAIL: bank export recorded %', v_j;
  end if;
  select count(*) into v_n from receipts where id in (ra, rb) and status = 'exported' and export_id = (v_j->>'export_id')::uuid;
  if v_n <> 2 then reset role; raise exception 'R15 FAIL: % of 2 matched receipts marked exported', v_n; end if;
  select count(*) into v_n from card_statements where id = v_sep and export_id = (v_j->>'export_id')::uuid and exported_at is not null;
  if v_n <> 1 then reset role; raise exception 'R15 FAIL: the statement was not marked exported'; end if;
  v_ok := false;
  begin perform export_card_statement(v_sep, 'qbo_bills', 'again.csv', 'DD/MM/YYYY', false);
  exception when others then v_ok := sqlerrm like '%already exported%'; end;
  if not v_ok then reset role; raise exception 'R15 FAIL: a statement was exported twice without opting in'; end if;
  -- Bills: charges only (no credit memos), personal left out. 50 + 20 + 10.
  v_j := export_card_statement(v_sep, 'qbo_bills', 'quickbooks-bills-visa-3333-2026-09.csv', 'MM/DD/YYYY', true);
  reset role;
  if (v_j->>'row_count')::int <> 3 or (v_j->>'total')::numeric <> 80.00 then raise exception 'R15 FAIL: bills export recorded %', v_j; end if;
  -- The person's own name, not the camp's display name for them ("Demo guest" in a demo camp).
  select count(*) into v_n from expense_exports where statement_id = v_sep
     and created_by_name = (select full_name from profiles where id = u_admin) and created_by_name <> 'Admin';
  if v_n <> 2 then raise exception 'R15 FAIL: % export rows name the person', v_n; end if;
  v_passed := v_passed + 1;

  -- ── R16: keeping one copy of a duplicate moves its statement match ────────
  perform pg_temp.login(u_admin);
  perform resolve_statement_lines((select jsonb_agg(jsonb_build_object('line_id', id, 'match_state', 'matched', 'receipt_id', rc)) from statement_lines where statement_id = v_oct));
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into receipts (id, camp_id, card_id, submitted_by, vendor, purchase_date, total, status, budget_code_id, created_at)
  values (rc2, v_camp, c2, u_h2, 'Orphan Shop Inc.', '2026-09-30', 7.00, 'ready', code1, now());
  -- A holder cannot remove the copy the bill is matched to, nor keep one they cannot see.
  perform pg_temp.login(u_h2);
  v_ok := false;
  begin perform merge_duplicate_receipt(rc, rc2);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R16 FAIL: a holder merged into a receipt they cannot see'; end if;
  perform pg_temp.login(u_admin);
  v_j := merge_duplicate_receipt(rc2, rc);
  reset role;
  select count(*) into v_n from statement_lines where statement_id = v_oct and receipt_id = rc2 and match_state = 'matched';
  if v_n <> 1 then raise exception 'R16 FAIL: the match did not move to the kept copy (%)', v_j; end if;
  select count(*) into v_n from receipts where id = rc;
  if v_n <> 0 then raise exception 'R16 FAIL: the removed copy is still there'; end if;
  if jsonb_array_length(card_month_blockers_internal(v_oct)) <> 0 then raise exception 'R16 FAIL: October no longer agrees after the merge'; end if;
  -- Both copies matched: refused, because one charge would lose its paper.
  perform pg_temp.login(u_admin);
  v_ok := false;
  begin perform merge_duplicate_receipt(ra, rb);
  -- (Both were exported in R15, which is refused first, and just as final.)
  exception when others then v_ok := sqlerrm like 'Both copies are matched%' or sqlerrm like 'That copy was exported to QuickBooks%'; end;
  reset role;
  if not v_ok then raise exception 'R16 FAIL: two matched receipts were merged'; end if;
  v_passed := v_passed + 1;

  -- ── R17: an exported receipt is locked, for finance too, until it is unlocked on the record ──
  perform set_config('request.jwt.claims', '', true);
  insert into expense_cards (camp_id, label, last4) values (v_camp, 'Visa 4444', '4444') returning id into c4;
  insert into expense_tax_settings (camp_id, province, claim_basis, tax_rules)
  values (v_camp, 'ON', 'psb', '[{"type":"HST","recoverable_pct":69.69,"federal_pct":50,"provincial_pct":82},{"type":"GST","recoverable_pct":50}]')
  on conflict (camp_id) do update set tax_rules = excluded.tax_rules, nonrecoverable_tax = null;
  insert into receipts (id, camp_id, card_id, submitted_by, vendor, purchase_date, subtotal, taxes, total, status, file_path) values
    (re1, v_camp, c4, u_admin, 'Lock Hardware', '2026-11-03', 75.00, '[{"type":"HST","rate_pct":13,"amount":9.75}]', 84.75, 'ready', v_camp || '/' || re1 || '.jpg'),
    (re2, v_camp, c4, u_admin, 'Lock Grocer', '2026-11-05', 20.00, '[]', 20.00, 'ready', null);
  perform pg_temp.login(u_admin);
  v_nov := import_card_statement(c4, '2026-11-01', 104.75, 'nov.csv',
    '[{"posted_date":"2026-11-04","description":"LOCK HARDWARE","amount":84.75},{"posted_date":"2026-11-06","description":"LOCK GROCER","amount":20.00}]'::jsonb);
  perform resolve_statement_lines((select jsonb_agg(jsonb_build_object('line_id', id, 'match_state', 'matched',
    'receipt_id', case when description = 'LOCK HARDWARE' then re1 else re2 end)) from statement_lines where statement_id = v_nov));
  v_j := export_card_statement(v_nov, 'qbo_bills', 'nov.csv', 'DD/MM/YYYY', false);
  v_export := (v_j->>'export_id')::uuid;
  if v_j->>'tax_treatment' is distinct from 'expense' then reset role; raise exception 'R17 FAIL: an Ontario charity export recorded %', v_j->>'tax_treatment'; end if;
  -- Finance, directly: refused.
  v_ok := false;
  begin update receipts set total = 1 where id = re1;
  exception when others then v_ok := sqlerrm like 'This receipt was exported to QuickBooks. Unlock it%'; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: finance edited a locked exported receipt'; end if;
  v_ok := false;
  begin delete from receipts where id = re1;
  exception when others then v_ok := sqlerrm like 'This receipt was exported%'; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: finance deleted a locked exported receipt'; end if;
  v_ok := false;
  begin perform remove_receipt(re1);
  exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: remove_receipt removed a locked exported receipt'; end if;
  v_ok := false;
  begin update receipts set unlocked_at = now() where id = re1;
  exception when others then v_ok := sqlerrm like 'Use "Unlock to correct"%'; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: an exported receipt was unlocked by setting a column'; end if;
  -- The statement is locked too: its lines, its total, and deleting it.
  v_ok := false;
  begin perform resolve_statement_lines((select jsonb_agg(jsonb_build_object('line_id', id, 'match_state', 'unmatched')) from statement_lines where statement_id = v_nov));
  exception when others then v_ok := sqlerrm like 'This statement was exported%'; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: a line on an exported statement was unmatched'; end if;
  v_ok := false;
  begin update card_statements set statement_total = 1 where id = v_nov;
  exception when others then v_ok := sqlerrm like 'This statement was exported%'; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: an exported statement total was changed'; end if;
  v_ok := false;
  begin delete from card_statements where id = v_nov;
  exception when others then v_ok := sqlerrm like 'This statement was exported%'; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: an exported statement was deleted'; end if;
  -- A duplicate flag is not a correction.
  update receipts set duplicate_dismissed = true where id = re2;
  reset role;

  -- A holder cannot unlock; finance must say why.
  perform pg_temp.login(u_h1);
  v_ok := false;
  begin perform unlock_exported_receipt(re1, 'mine now');
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R17 FAIL: staff unlocked an exported receipt'; end if;
  perform pg_temp.login(u_admin);
  v_ok := false;
  begin perform unlock_exported_receipt(re1, '  ');
  exception when others then v_ok := sqlerrm like 'Say what needs correcting%'; end;
  if not v_ok then reset role; raise exception 'R17 FAIL: unlocked without a reason'; end if;
  v_j := unlock_exported_receipt(re1, 'Coded to the wrong budget');
  update receipts set purpose = 'Corrected' where id = re1;
  -- The unlocked month's lines can be changed; the other receipt is still locked.
  v_ok := false;
  begin update receipts set total = 2 where id = re2;
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R17 FAIL: unlocking one receipt unlocked another'; end if;
  select count(*) into v_n from receipts where id = re1 and unlocked_at is not null and unlock_reason = 'Coded to the wrong budget'
     and unlocked_by = u_admin and unlocked_by_name is not null and purpose = 'Corrected';
  if v_n <> 1 then raise exception 'R17 FAIL: the unlock was not recorded on the receipt'; end if;
  select count(*) into v_n from card_statements where id = v_nov and reexport_needed_at is not null and reexport_reason like '%Coded to the wrong budget%';
  if v_n <> 1 then raise exception 'R17 FAIL: the export was not flagged as needing to be done again'; end if;
  select count(*) into v_n from receipt_unlocks where receipt_id = re1 and statement_id = v_nov and export_id = v_export
     and reason = 'Coded to the wrong budget' and unlocked_by = u_admin and relocked_at is null;
  if v_n <> 1 then raise exception 'R17 FAIL: % audit rows for the unlock', v_n; end if;
  -- Exporting again needs no "export again" tick, and locks it all again.
  perform pg_temp.login(u_admin);
  v_j := export_card_statement(v_nov, 'qbo_bills', 'nov-corrected.csv', 'DD/MM/YYYY', false);
  reset role;
  select count(*) into v_n from receipts where id = re1 and unlocked_at is null and unlock_reason is null and export_id = (v_j->>'export_id')::uuid;
  if v_n <> 1 then raise exception 'R17 FAIL: re-export did not lock the receipt again'; end if;
  select count(*) into v_n from card_statements where id = v_nov and reexport_needed_at is null;
  if v_n <> 1 then raise exception 'R17 FAIL: re-export left the month flagged'; end if;
  select count(*) into v_n from receipt_unlocks where receipt_id = re1 and relocked_at is not null and relocked_export_id = (v_j->>'export_id')::uuid;
  if v_n <> 1 then raise exception 'R17 FAIL: the audit row was not closed by the re-export'; end if;
  select count(*) into v_n from expense_exports where id = (v_j->>'export_id')::uuid and include_exported;
  if v_n <> 1 then raise exception 'R17 FAIL: the corrected export is not recorded as a re-export'; end if;
  -- A statement can be unlocked on its own, with a reason, and then its lines change.
  perform pg_temp.login(u_admin);
  perform unlock_exported_statement(v_nov, 'Grocer charge was personal');
  perform resolve_statement_lines((select jsonb_agg(jsonb_build_object('line_id', id, 'match_state', 'personal', 'note', 'Repaid')) from statement_lines where statement_id = v_nov and description = 'LOCK GROCER'));
  reset role;
  select count(*) into v_n from receipt_unlocks where statement_id = v_nov and receipt_id is null and reason = 'Grocer charge was personal';
  if v_n <> 1 then raise exception 'R17 FAIL: the statement unlock was not recorded'; end if;
  v_passed := v_passed + 1;

  -- ── R18: a lost receipt needs its note; each kind is booked where it is told ──
  perform pg_temp.login(u_admin);
  select id into v_line from statement_lines where statement_id = v_sep and description = 'PARKING';
  -- (September was exported in R15.) Unlock it to correct.
  perform unlock_exported_statement(v_sep, 'Parking was a lost receipt');
  v_ok := false;
  begin perform resolve_statement_lines(jsonb_build_array(jsonb_build_object('line_id', v_line, 'match_state', 'no_receipt_ok', 'no_receipt_kind', 'lost', 'note', ' ')));
  exception when others then v_ok := sqlerrm like 'Say what the charge was for%'; end;
  if not v_ok then reset role; raise exception 'R18 FAIL: a lost receipt was accepted with no note'; end if;
  perform resolve_statement_lines(jsonb_build_array(jsonb_build_object('line_id', v_line, 'match_state', 'no_receipt_ok', 'no_receipt_kind', 'lost',
    'note', 'Meter at the trailhead, slip blew away', 'budget_code_id', code1)));
  reset role;
  select count(*) into v_n from statement_lines where id = v_line and no_receipt_kind = 'lost' and budget_code_id = code1 and note like 'Meter%';
  if v_n <> 1 then raise exception 'R18 FAIL: the lost receipt was not recorded with its code'; end if;
  v_ok := false;
  begin update statement_lines set note = null where id = v_line;
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'R18 FAIL: a lost receipt''s note was cleared directly'; end if;
  perform pg_temp.login(u_admin);
  perform resolve_statement_lines(jsonb_build_array(jsonb_build_object('line_id', v_line, 'match_state', 'no_receipt_ok')));
  reset role;
  select count(*) into v_n from statement_lines where id = v_line and no_receipt_kind = 'not_expected' and budget_code_id is null;
  if v_n <> 1 then raise exception 'R18 FAIL: a plain "no receipt" was not "not expected"'; end if;
  perform pg_temp.login(u_admin);
  perform resolve_statement_lines(jsonb_build_array(jsonb_build_object('line_id', v_line, 'match_state', 'unmatched')));
  reset role;
  select count(*) into v_n from statement_lines where id = v_line and no_receipt_kind is null and budget_code_id is null;
  if v_n <> 1 then raise exception 'R18 FAIL: unmatching left a no-receipt kind behind'; end if;
  v_ok := false;
  begin update statement_lines set match_state = 'no_receipt_ok', no_receipt_kind = null where id = v_line;
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'R18 FAIL: a no-receipt charge with no kind was accepted'; end if;
  v_passed := v_passed + 1;

  -- ── R19: a removal is saved at once and Undo restores it, match and photo included ──
  perform set_config('request.jwt.claims', '', true);
  insert into receipts (id, camp_id, card_id, submitted_by, vendor, purchase_date, total, status, file_path, budget_code_id) values
    (re3, v_camp, c1, u_h1, 'Photo Hardware', null, 64.10, 'ready', v_camp || '/' || re3 || '.jpg', code1);
  -- r5 (holder one, no photo, matched to nothing) is kept and takes re3's photo.
  perform pg_temp.login(u_admin);
  v_j := merge_duplicate_receipt(r5, re3, true);
  reset role;
  v_removal := (v_j->>'removal_id')::uuid;
  select count(*) into v_n from receipts where id = re3;
  if v_n <> 0 then raise exception 'R19 FAIL: the removed copy is still there'; end if;
  select count(*) into v_n from receipts where id = r5 and file_path = v_camp || '/' || re3 || '.jpg';
  if v_n <> 1 then raise exception 'R19 FAIL: the kept copy did not take the photo'; end if;
  select count(*) into v_n from receipt_removals where id = v_removal and receipt_id = re3 and kind = 'duplicate' and kept_receipt_id = r5 and restored_at is null;
  if v_n <> 1 then raise exception 'R19 FAIL: the removal was not recorded'; end if;
  -- Another holder cannot put it back; the admin who removed it can.
  perform pg_temp.login(u_h2);
  v_ok := false;
  begin perform restore_removed_receipt(v_removal);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R19 FAIL: another holder restored a removal'; end if;
  perform pg_temp.login(u_admin);
  v_j := restore_removed_receipt(v_removal);
  reset role;
  select count(*) into v_n from receipts where id = re3 and file_path = v_camp || '/' || re3 || '.jpg' and budget_code_id = code1 and vendor = 'Photo Hardware';
  if v_n <> 1 then raise exception 'R19 FAIL: the restored receipt is not as it was'; end if;
  select count(*) into v_n from receipts where id = r5 and file_path is null;
  if v_n <> 1 then raise exception 'R19 FAIL: the kept copy did not give the photo back'; end if;
  perform pg_temp.login(u_admin);
  v_ok := false;
  begin perform restore_removed_receipt(v_removal);
  exception when others then v_ok := sqlerrm like '%already put back%'; end;
  reset role;
  if not v_ok then raise exception 'R19 FAIL: a removal was restored twice'; end if;

  -- Deleting a matched receipt unmatches its charge, and Undo matches it again.
  select id into v_line from statement_lines where statement_id = v_oct;
  perform pg_temp.login(u_admin);
  v_j := remove_receipt(rc2);
  reset role;
  select count(*) into v_n from statement_lines where id = v_line and match_state = 'unmatched' and receipt_id is null;
  if v_n <> 1 then raise exception 'R19 FAIL: deleting a matched receipt did not leave its charge unexplained'; end if;
  perform pg_temp.login(u_admin);
  perform restore_removed_receipt((v_j->>'removal_id')::uuid);
  reset role;
  select count(*) into v_n from statement_lines where id = v_line and match_state = 'matched' and receipt_id = rc2;
  if v_n <> 1 then raise exception 'R19 FAIL: restoring did not match the charge again'; end if;
  -- A holder can remove and restore their own; not someone else's.
  perform pg_temp.login(u_h2);
  v_ok := false;
  begin perform remove_receipt(r1);
  exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'R19 FAIL: a holder deleted another holder''s receipt'; end if;
  reset role;
  perform pg_temp.login(u_h1);
  v_j := remove_receipt(re3);
  perform restore_removed_receipt((v_j->>'removal_id')::uuid);
  select count(*) into v_n from receipts where id = re3;
  reset role;
  if v_n <> 1 then raise exception 'R19 FAIL: a holder could not undo their own deletion'; end if;
  v_passed := v_passed + 1;

  -- ── R20: a total nobody typed is recorded as the sum of the lines ─────────
  perform pg_temp.login(u_admin);
  v_stmt := import_card_statement(c4, '2026-12-01', null, 'dec.csv',
    '[{"posted_date":"2026-12-02","description":"A","amount":10.10},{"posted_date":"2026-12-03","description":"B","amount":-2.05}]'::jsonb);
  reset role;
  select count(*) into v_n from card_statements where id = v_stmt and total_source = 'sum_of_lines' and statement_total = 8.05;
  if v_n <> 1 then raise exception 'R20 FAIL: an untyped total was not recorded as the sum of the lines'; end if;
  select count(*) into v_n from card_statements where id = v_nov and total_source = 'typed';
  if v_n <> 1 then raise exception 'R20 FAIL: a typed total was not recorded as typed'; end if;
  v_passed := v_passed + 1;

  -- ── R21: finance can ask the card holder about a receipt ──────────────────
  perform pg_temp.login(u_h1);
  v_ok := false;
  begin perform ask_card_holder_about_receipt(re3);
  exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'R21 FAIL: staff sent a receipt question'; end if;
  perform pg_temp.login(u_admin);
  v_j := ask_card_holder_about_receipt(re3);
  perform ask_card_holder_about_receipt(re3);
  reset role;
  if not (v_j->>'queued')::boolean or v_j->>'to_email' <> 'holder.one@campcommand.app' or v_j->>'body_text' not like 'Receipt question: Photo Hardware, $64.10 (Visa 1111%What date was it bought?%' then
    raise exception 'R21 FAIL: question not queued: %', v_j;
  end if;
  select count(*) into v_n from scheduled_messages where subject_type = 'receipt' and subject_id = re3 and recipient_kind = 'card_holder';
  if v_n <> 1 then raise exception 'R21 FAIL: % question rows (want one a day)', v_n; end if;
  select count(*) into v_n from receipts where id = re3 and holder_asked_at is not null;
  if v_n <> 1 then raise exception 'R21 FAIL: the question was not noted on the receipt'; end if;
  v_passed := v_passed + 1;

  raise notice 'receipts: %/21 passed', v_passed;
  if v_passed <> 21 then raise exception 'receipts FAIL: only % of 21', v_passed; end if;
end $$;

select 'receipts: 21/21 passed' as result;
rollback;

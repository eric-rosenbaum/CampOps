-- Content translations: what gets queued and what does not, who can read a translation, that no
-- client can write one, that a deleted row takes its translations with it, the worker's claim /
-- settle / give-up cycle, and push wording in the recipient's language.
--   bash scripts/run-sql-tests.sh content_translations
--
-- Hermetic: two throwaway camps inside a transaction that rolls back. The triggers do call
-- pg_net, but its request row is written in this transaction too, so the rollback un-sends it.
-- RLS is exercised for real: `set local role authenticated` plus JWT claims, not just claims.
begin;

do $$
declare
  v_camp   uuid := 'f0000000-0000-4000-8000-0000000c7001';
  v_other  uuid := 'f0000000-0000-4000-8000-0000000c7002';
  u_admin  uuid := 'e2e00000-0000-4000-8000-00000000000a';
  u_staff  uuid := 'e2e00000-0000-4000-8000-00000000000b';
  u_out    uuid := 'e2e00000-0000-4000-8000-00000000000c';   -- member of v_other only
  v_issue uuid; v_issue_b uuid; v_comment uuid; v_item uuid;
  v_gen int; v_gen2 int; v_n int; v_job record; v_row record; v_ok boolean;
  f text;
  passed int := 0;
begin
  ---------------------------------------------------------------------------------------------
  -- Setup (as postgres)
  ---------------------------------------------------------------------------------------------
  insert into camps (id, name, slug, timezone) values
    (v_camp,  'Translate Test Camp', 'translate-test-camp-ct-suite', 'America/Vancouver'),
    (v_other, 'Other Translate Camp', 'translate-test-other-ct-suite', 'America/Toronto');
  insert into camp_members (camp_id, user_id, role, display_name, is_active) values
    (v_camp, u_admin, 'admin', 'Teddy Admin', true),
    (v_camp, u_staff, 'staff', 'Kim Kitchen', true),
    (v_other, u_out, 'staff', 'Priya Program', true);

  ---------------------------------------------------------------------------------------------
  -- T1: privileges. Internal functions are callable by nobody but the service role; the table
  --     is readable by signed-in users (RLS does the rest) and writable by no client role.
  ---------------------------------------------------------------------------------------------
  foreach f in array array['enqueue_translation_internal(uuid,text,text)','drain_translations()',
                           'translation_ping()','claim_translation_batch(integer)',
                           'settle_translation_job(bigint,integer,text)','reusable_translations(uuid,text[])',
                           'translated_or_original(text,text,text,text,text)','push_phrase(text,text)'] loop
    if has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'T1 FAIL: anon can call %', f; end if;
    if has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'T1 FAIL: authenticated can call %', f; end if;
  end loop;
  foreach f in array array['claim_translation_batch(integer)','settle_translation_job(bigint,integer,text)',
                           'reusable_translations(uuid,text[])'] loop
    if not has_function_privilege('service_role', 'public.' || f, 'execute') then raise exception 'T1 FAIL: service_role cannot call %', f; end if;
  end loop;
  foreach f in array array['insert','update','delete','truncate'] loop
    if has_table_privilege('authenticated', 'public.content_translations', f) then raise exception 'T1 FAIL: authenticated has % on content_translations', f; end if;
    if has_table_privilege('anon', 'public.content_translations', f) then raise exception 'T1 FAIL: anon has % on content_translations', f; end if;
  end loop;
  if has_table_privilege('anon', 'public.content_translations', 'select') then raise exception 'T1 FAIL: anon can select content_translations'; end if;
  if has_table_privilege('authenticated', 'public.translation_queue', 'select') then raise exception 'T1 FAIL: authenticated can read the queue'; end if;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T2: an insert on each source table queues it — written as a staff member through RLS, the
  --     way the app writes, so the trigger is proven to work for a caller who cannot touch the
  --     queue themselves.
  ---------------------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  insert into issues (camp_id, title, description, priority, status, is_public_report, source, trade)
    values (v_camp, 'Fuga en el baño de la Cabaña 4', 'Gotea debajo del lavabo', 'normal', 'unassigned', false, 'web', 'maintenance')
    returning id into v_issue;
  insert into issue_comments (camp_id, issue_id, author_id, author_name, body)
    values (v_camp, v_issue, u_staff, 'Kim Kitchen', 'צריך להחליף את הצינור')
    returning id into v_comment;
  insert into issue_checklist_items (camp_id, issue_id, position, text)
    values (v_camp, v_issue, 0, 'Cerrar la llave de paso')
    returning id into v_item;
  reset role;

  select count(*) into v_n from translation_queue
   where camp_id = v_camp
     and (source_table, source_id) in (('issues', v_issue::text), ('issue_comments', v_comment::text),
                                       ('issue_checklist_items', v_item::text));
  if v_n <> 3 then raise exception 'T2 FAIL: % of 3 inserted rows queued', v_n; end if;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T3: an update that touches no translated column queues nothing; one that does re-queues
  --     with a new generation and a clean slate.
  ---------------------------------------------------------------------------------------------
  update translation_queue set attempts = 3, last_error = 'earlier failure'
   where source_table = 'issues' and source_id = v_issue::text;
  select generation into v_gen from translation_queue where source_table = 'issues' and source_id = v_issue::text;

  update issues set priority = 'high', status = 'in_progress' where id = v_issue;
  update issue_checklist_items set is_done = true, done_at = now() where id = v_item;
  update issue_comments set visible_to_reporter = true where id = v_comment;
  select generation into v_gen2 from translation_queue where source_table = 'issues' and source_id = v_issue::text;
  if v_gen2 <> v_gen then raise exception 'T3 FAIL: a status/priority change re-queued the issue'; end if;
  if (select generation from translation_queue where source_table = 'issue_checklist_items' and source_id = v_item::text) <> 1 then
    raise exception 'T3 FAIL: ticking a checklist item re-queued it';
  end if;
  if (select generation from translation_queue where source_table = 'issue_comments' and source_id = v_comment::text) <> 1 then
    raise exception 'T3 FAIL: an unrelated comment change re-queued it';
  end if;

  update issues set title = 'Fuga en el baño de la Cabaña 5' where id = v_issue;
  select * into v_row from translation_queue where source_table = 'issues' and source_id = v_issue::text;
  if v_row.generation <> v_gen + 1 or v_row.attempts <> 0 or v_row.last_error is not null then
    raise exception 'T3 FAIL: a title edit did not re-queue cleanly (gen %, attempts %, error %)', v_row.generation, v_row.attempts, v_row.last_error;
  end if;
  update issues set description = 'Gotea mucho' where id = v_issue;
  update issue_checklist_items set note = 'Está detrás del inodoro' where id = v_item;
  update issue_comments set body = 'צריך להחליף את הצינור היום' where id = v_comment;
  if (select generation from translation_queue where source_table = 'issues' and source_id = v_issue::text) <> v_gen + 2
     or (select generation from translation_queue where source_table = 'issue_checklist_items' and source_id = v_item::text) <> 2
     or (select generation from translation_queue where source_table = 'issue_comments' and source_id = v_comment::text) <> 2 then
    raise exception 'T3 FAIL: a description / note / body edit did not re-queue';
  end if;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T4: reading. A member of camp A sees A's translations and not B's; anon sees nothing.
  ---------------------------------------------------------------------------------------------
  insert into issues (camp_id, title, priority, status, is_public_report, source, trade)
    values (v_other, 'Broken dock plank', 'normal', 'unassigned', false, 'web', 'maintenance')
    returning id into v_issue_b;
  insert into content_translations (camp_id, source_table, source_id, field, lang, source_lang, source_text, text, model) values
    (v_camp,  'issues', v_issue::text,   'title', 'en', 'es', 'Fuga en el baño de la Cabaña 5', 'Leak in the Cabaña 5 bathroom', 'test'),
    (v_camp,  'issues', v_issue::text,   'title', 'es', 'es', 'Fuga en el baño de la Cabaña 5', 'Fuga en el baño de la Cabaña 5', 'test'),
    (v_other, 'issues', v_issue_b::text, 'title', 'es', 'en', 'Broken dock plank', 'Tabla del muelle rota', 'test');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  select count(*) into v_n from content_translations where camp_id in (v_camp, v_other);
  if v_n <> 2 then raise exception 'T4 FAIL: camp A staff sees % rows, expected 2', v_n; end if;
  if exists (select 1 from content_translations where camp_id = v_other) then raise exception 'T4 FAIL: camp A staff sees camp B'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  select count(*) into v_n from content_translations where camp_id in (v_camp, v_other);
  if v_n <> 1 then raise exception 'T4 FAIL: camp B staff sees % rows, expected 1', v_n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into v_n from content_translations;
    raise exception 'T4 FAIL: anon could select from content_translations (% rows)', v_n;
  exception when insufficient_privilege then null;
  end;
  reset role;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T5: no client writes, not even an admin of the camp, not even to their own camp's rows.
  ---------------------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  begin
    insert into content_translations (camp_id, source_table, source_id, field, lang, source_text, text)
      values (v_camp, 'issues', v_issue::text, 'title', 'he', 'x', 'y');
    raise exception 'T5 FAIL: an admin inserted a translation';
  exception when insufficient_privilege then null;
  end;
  begin
    update content_translations set text = 'Something else entirely' where camp_id = v_camp;
    raise exception 'T5 FAIL: an admin updated a translation';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from content_translations where camp_id = v_camp;
    raise exception 'T5 FAIL: an admin deleted a translation';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.enqueue_translation_internal(v_camp, 'issues', v_issue::text);
    raise exception 'T5 FAIL: an admin could call enqueue_translation_internal';
  exception when insufficient_privilege then null;
  end;
  reset role;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T6: the worker. Claim takes due jobs once; settling a stale generation leaves the newer job
  --     queued; failures back off and the fifth is the last.
  ---------------------------------------------------------------------------------------------
  -- Only this suite's jobs are due, so whatever else staging has queued is not claimed by a test.
  update translation_queue set next_attempt_at = now() + interval '1 hour' where camp_id not in (v_camp, v_other);

  select count(*) into v_n from claim_translation_batch(100) c where c.camp_id = v_camp;
  if v_n <> 3 then raise exception 'T6 FAIL: claimed % of 3 due jobs', v_n; end if;
  select count(*) into v_n from claim_translation_batch(100) c where c.camp_id = v_camp;
  if v_n <> 0 then raise exception 'T6 FAIL: a claimed job was claimed again (% rows)', v_n; end if;

  select * into v_job from translation_queue where source_table = 'issues' and source_id = v_issue::text;
  update issues set title = 'Fuga en el baño de la Cabaña 6' where id = v_issue;   -- an edit mid-translation
  perform settle_translation_job(v_job.id, v_job.generation, null);
  if not exists (select 1 from translation_queue where id = v_job.id) then
    raise exception 'T6 FAIL: finishing an older generation deleted the newer edit''s job';
  end if;
  select * into v_job from translation_queue where id = v_job.id;
  perform settle_translation_job(v_job.id, v_job.generation, null);
  if exists (select 1 from translation_queue where id = v_job.id) then raise exception 'T6 FAIL: a finished job stayed queued'; end if;

  select * into v_job from translation_queue where source_table = 'issue_comments' and source_id = v_comment::text;
  for v_n in 1..5 loop
    perform settle_translation_job(v_job.id, v_job.generation, 'model unavailable ' || v_n);
  end loop;
  select * into v_row from translation_queue where id = v_job.id;
  if v_row.attempts <> 5 or v_row.last_error <> 'model unavailable 5' or v_row.next_attempt_at <= now() then
    raise exception 'T6 FAIL: five failures left attempts %, error %, next %', v_row.attempts, v_row.last_error, v_row.next_attempt_at;
  end if;
  update translation_queue set next_attempt_at = now() - interval '1 minute' where id = v_job.id;
  if exists (select 1 from claim_translation_batch(100) c where c.id = v_job.id) then
    raise exception 'T6 FAIL: a job that had failed five times was claimed again';
  end if;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T7: a deleted row takes its translations and its queue job with it — directly, and through
  --     the cascade from a deleted work order to its comments and checklist.
  ---------------------------------------------------------------------------------------------
  insert into content_translations (camp_id, source_table, source_id, field, lang, source_lang, source_text, text, model) values
    (v_camp, 'issue_comments', v_comment::text, 'body', 'en', 'he', 'x', 'We need to replace the pipe today', 'test'),
    (v_camp, 'issue_checklist_items', v_item::text, 'text', 'en', 'es', 'Cerrar la llave de paso', 'Close the shutoff valve', 'test');

  delete from issue_comments where id = v_comment;
  if exists (select 1 from content_translations where source_table = 'issue_comments' and source_id = v_comment::text)
     or exists (select 1 from translation_queue where source_table = 'issue_comments' and source_id = v_comment::text) then
    raise exception 'T7 FAIL: a deleted comment left its translation or its job behind';
  end if;

  delete from issues where id = v_issue;
  if exists (select 1 from content_translations where source_id in (v_issue::text, v_item::text))
     or exists (select 1 from translation_queue where source_id in (v_issue::text, v_item::text)) then
    raise exception 'T7 FAIL: a deleted work order left translations or jobs behind (its own or its checklist''s)';
  end if;
  if not exists (select 1 from content_translations where source_id = v_issue_b::text) then
    raise exception 'T7 FAIL: deleting one camp''s work order took another camp''s translations';
  end if;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T8: push in the reader's language. The fixed wording follows the recipient's preference, the
  --     title uses a CURRENT translation only, and no preference means exactly the old push.
  ---------------------------------------------------------------------------------------------
  if translated_or_original('issues', v_issue_b::text, 'title', 'es', 'Broken dock plank') <> 'Tabla del muelle rota' then
    raise exception 'T8 FAIL: a current translation was not used';
  end if;
  if translated_or_original('issues', v_issue_b::text, 'title', 'es', 'Broken dock plank, two of them') <> 'Broken dock plank, two of them' then
    raise exception 'T8 FAIL: a stale translation was used for edited text';
  end if;
  if translated_or_original('issues', v_issue_b::text, 'title', null, 'Broken dock plank') <> 'Broken dock plank' then
    raise exception 'T8 FAIL: no preference still translated';
  end if;

  update profiles set preferred_language = 'es' where id = u_out;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  update issues set assignee_id = u_out where id = v_issue_b;
  select * into v_row from push_notifications where user_id = u_out and subject_id = v_issue_b and rule_key = 'assigned';
  if v_row.id is null then raise exception 'T8 FAIL: no assignment push was queued'; end if;
  if v_row.title <> 'Tabla del muelle rota' or v_row.body not like 'Asignado a ti%' then
    raise exception 'T8 FAIL: Spanish reader got title "%" body "%"', v_row.title, v_row.body;
  end if;

  update profiles set preferred_language = null where id = u_staff;
  insert into camp_members (camp_id, user_id, role, display_name, is_active) values (v_other, u_staff, 'staff', 'Kim Kitchen', true);
  update issues set assignee_id = u_staff where id = v_issue_b;
  select * into v_row from push_notifications where user_id = u_staff and subject_id = v_issue_b and rule_key = 'assigned';
  if v_row.title <> 'Broken dock plank' or v_row.body not like 'Assigned to you%' then
    raise exception 'T8 FAIL: a reader with no preference got title "%" body "%"', v_row.title, v_row.body;
  end if;
  passed := passed + 1;

  ---------------------------------------------------------------------------------------------
  -- T9: realtime, full replica identity, and deliberately not cloned (source_id is text, which
  --     the clone cannot remap; the clone's own inserts queue fresh translations instead).
  ---------------------------------------------------------------------------------------------
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'content_translations') then
    raise exception 'T9 FAIL: content_translations is not in supabase_realtime';
  end if;
  if (select relreplident from pg_class where oid = 'public.content_translations'::regclass) <> 'f' then
    raise exception 'T9 FAIL: content_translations is not replica identity full';
  end if;
  if not ('content_translations' = any (clone_camp_excluded_tables()) and 'translation_queue' = any (clone_camp_excluded_tables())) then
    raise exception 'T9 FAIL: translations would be cloned with stale ids';
  end if;
  if exists (select 1 from clone_camp_coverage_gaps()) then
    raise exception 'T9 FAIL: clone coverage gaps %', (select array_agg(missing_table) from clone_camp_coverage_gaps());
  end if;
  passed := passed + 1;

  if passed <> 9 then raise exception 'content_translations: only %/9 passed', passed; end if;
  raise notice 'content_translations: 9/9 passed';
end $$;

select 'content_translations: 9/9 passed' as result;
rollback;

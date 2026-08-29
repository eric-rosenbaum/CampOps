-- Compliance engine test suite.
--
-- Run against STAGING, never production:
--   psql "$STAGING_DB" -f supabase/tests/compliance_engine_test.sql
-- or paste into the SQL editor. Everything runs inside a transaction that is rolled back, so
-- it leaves no fixtures behind and is safe to re-run.
--
-- Each assertion raises on failure with the expected and actual value, so a red run tells you
-- what broke rather than that something did.

begin;

do $$
declare
  camp    constant uuid := '11111111-1111-4111-8111-111111111111';
  season  constant uuid := '22222222-2222-4222-8222-222222222222';
  u_admin constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  u_view  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  u_out   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  n int; st text; det jsonb; passed int := 0;


  -- assertion helper
begin
  -- ── fixtures ───────────────────────────────────────────────────────────────
  -- Reset first. A suite that inherits state from a previous run reports whatever that run
  -- left behind, which is how a passing test stops meaning anything. Safe: the whole thing
  -- is inside a transaction that rolls back.
  delete from requirement_documents     where camp_id = camp;
  delete from compliance_documents      where camp_id = camp;
  delete from camp_requirement_status   where camp_id = camp;
  delete from compliance_plan_sections  where camp_id = camp;
  delete from camp_compliance_profiles  where camp_id = camp;
  delete from camp_compliance_answers   where camp_id = camp;

  insert into camps (id, name, slug, status) values (camp, 'TEST Pine Ridge', 'test-pine-ridge', 'active')
    on conflict (id) do nothing;
  insert into seasons (id, camp_id, name, opening_date, closing_date)
    values (season, camp, 'TEST 2027', '2027-06-28', '2027-08-20') on conflict (id) do nothing;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (u_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin@test.local','x',now(),now(),now()),
         (u_view ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-view@test.local','x',now(),now(),now()),
         (u_out  ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-out@test.local','x',now(),now(),now())
  on conflict (id) do nothing;

  insert into camp_members (camp_id, user_id, role, display_name, is_active) values
    (camp, u_admin, 'admin', 'T Admin', true),
    (camp, u_view , 'viewer','T Viewer', true)
  on conflict do nothing;

  insert into camp_compliance_answers (camp_id, season_id, key, value)
  select camp, season, k, v from jsonb_each_text('{
    "state":"NY","county":"WESTCHESTER","camp_type":"overnight","water_source":"well",
    "sewage":"septic","has_pool":"true","has_waterfront":"true","has_kitchen":"true",
    "offers_offsite_swim":"false","has_boating":"true","has_equestrian":"false",
    "has_challenge_course":"true","has_archery":"true","has_riflery":"false",
    "offers_trips":"true","operates_vehicles":"true"}'::jsonb) t(k,v)
  on conflict (camp_id, season_id, key) do update set value = excluded.value;

  insert into camp_compliance_profiles (camp_id, season_id, profile_id)
  select camp, season, id from compliance_profiles where code in ('NY-STATE','NY-WESTCHESTER')
  on conflict do nothing;

  insert into compliance_plan_sections (camp_id, season_id, section_code, category, title, sort_order)
  select camp, season, t.code, t.category, t.title, t.sort_order
    from compliance_plan_templates t,
         lateral (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) a
                    from camp_compliance_answers where camp_id=camp and season_id=season) ans
   where compliance_applies(ans.a, t.applies_when)
  on conflict do nothing;

  -- ── T1 · applicability excludes activities the camp does not run ───────────
  select count(*) into n from compliance_plan_sections where camp_id=camp;
  if n <> 73 then raise exception 'T1 FAIL plan sections: expected 73, got %', n; end if;
  passed := passed + 1;

  if exists (select 1 from compliance_plan_sections
              where camp_id=camp and section_code in ('ACT-09','ACT-12','ACT-15')) then
    raise exception 'T1 FAIL: sections for activities the camp does not run were created';
  end if;
  passed := passed + 1;

  -- ── T2 · engine computes a row per applicable requirement ─────────────────
  n := compute_camp_compliance(camp, season);
  if n <> 13 then raise exception 'T2 FAIL requirements computed: expected 13, got %', n; end if;
  passed := passed + 1;

  -- ── T3 · everything starts missing, with a reason ─────────────────────────
  select count(*) into n from camp_requirement_status
   where camp_id=camp and status='missing' and detail ? 'need';
  if n <> 13 then raise exception 'T3 FAIL: expected 13 missing-with-reason, got %', n; end if;
  passed := passed + 1;

  -- ── T4 · an unexpiring document satisfies ─────────────────────────────────
  with d as (
    insert into compliance_documents (camp_id, season_id, title, bucket_path, expires_on)
    values (camp, season, 'T Permit application', 'test/a.pdf', null) returning id)
  insert into requirement_documents (camp_id, requirement_id, document_id, season_id)
  select camp, r.id, d.id, season from d, compliance_requirements r where r.req_code='WC-01';
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s join compliance_requirements r on r.id=s.requirement_id
   where s.camp_id=camp and r.req_code='WC-01';
  if st <> 'satisfied' then raise exception 'T4 FAIL WC-01: expected satisfied, got %', st; end if;
  passed := passed + 1;

  -- ── T5 · a document expiring inside 30 days flags as expiring ─────────────
  with d as (
    insert into compliance_documents (camp_id, season_id, title, bucket_path, expires_on)
    values (camp, season, 'T Workers comp', 'test/b.pdf', current_date + 14) returning id)
  insert into requirement_documents (camp_id, requirement_id, document_id, season_id)
  select camp, r.id, d.id, season from d, compliance_requirements r where r.req_code='WC-04';
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s join compliance_requirements r on r.id=s.requirement_id
   where s.camp_id=camp and r.req_code='WC-04';
  if st <> 'expiring' then raise exception 'T5 FAIL WC-04: expected expiring, got %', st; end if;
  passed := passed + 1;

  -- ── T6 · an ALREADY EXPIRED document does not satisfy ─────────────────────
  -- The subtle one: an expired certificate on file must not read as compliant.
  with d as (
    insert into compliance_documents (camp_id, season_id, title, bucket_path, expires_on)
    values (camp, season, 'T Expired OEM form', 'test/c.pdf', current_date - 5) returning id)
  insert into requirement_documents (camp_id, requirement_id, document_id, season_id)
  select camp, r.id, d.id, season from d, compliance_requirements r where r.req_code='WC-11';
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s join compliance_requirements r on r.id=s.requirement_id
   where s.camp_id=camp and r.req_code='WC-11';
  if st <> 'missing' then raise exception 'T6 FAIL WC-11: an expired document satisfied a requirement (got %)', st; end if;
  passed := passed + 1;

  -- ── T7 · partial plan completion reports partial with real counts ─────────
  update compliance_plan_sections set status='complete'
   where camp_id=camp and section_code in
     (select section_code from compliance_plan_sections where camp_id=camp order by sort_order limit 40);
  perform compute_camp_compliance(camp, season);
  select status, detail into st, det from camp_requirement_status s
    join compliance_requirements r on r.id=s.requirement_id
   where s.camp_id=camp and r.req_code='WC-13';
  if st <> 'partial' then raise exception 'T7 FAIL WC-13: expected partial, got %', st; end if;
  if (det->>'complete')::int <> 40 or (det->>'sections')::int <> 73 then
    raise exception 'T7 FAIL WC-13 detail wrong: %', det; end if;
  passed := passed + 1;

  -- ── T8 · completing every section satisfies ───────────────────────────────
  update compliance_plan_sections set status='complete' where camp_id=camp;
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s join compliance_requirements r on r.id=s.requirement_id
   where s.camp_id=camp and r.req_code='WC-13';
  if st <> 'satisfied' then raise exception 'T8 FAIL WC-13: expected satisfied, got %', st; end if;
  passed := passed + 1;

  -- ── T9 · a camp-declared N/A outranks the evaluators ──────────────────────
  update camp_requirement_status s set na_reason='No amusement devices on site'
    from compliance_requirements r where r.id=s.requirement_id
     and s.camp_id=camp and r.req_code='WC-09';
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s join compliance_requirements r on r.id=s.requirement_id
   where s.camp_id=camp and r.req_code='WC-09';
  if st <> 'not_applicable' then raise exception 'T9 FAIL WC-09: expected not_applicable, got %', st; end if;
  passed := passed + 1;

  -- ── T10 · unanswered questions must not silently enable a requirement ─────
  if compliance_applies('{}'::jsonb, '{"has_pool":"true"}'::jsonb) then
    raise exception 'T10 FAIL: an unanswered question enabled a requirement';
  end if;
  if not compliance_applies('{}'::jsonb, '{}'::jsonb) then
    raise exception 'T10 FAIL: an unconditional requirement was excluded';
  end if;
  passed := passed + 1;

  raise notice 'PASS: % assertions', passed;
end $$;

rollback;

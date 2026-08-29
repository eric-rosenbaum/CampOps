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
  n int; st text; det jsonb; passed int := 0; expected_reqs int; expected_sections int;


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
  -- Derived from the catalog, so seeding another jurisdiction's plan components does not turn
  -- this suite red. What must hold is that the laid-down set equals the applicable set exactly.
  select count(*) into expected_sections
    from compliance_plan_templates t,
         lateral (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) a
                    from camp_compliance_answers where camp_id=camp and season_id=season) ans
   where compliance_applies(ans.a, t.applies_when);
  select count(*) into n from compliance_plan_sections where camp_id=camp;
  if n <> expected_sections then
    raise exception 'T1 FAIL plan sections: expected %, got %', expected_sections, n; end if;
  passed := passed + 1;

  -- Every component the camp will write must know which checklist row it fills. Deriving that
  -- from the title silently dropped seven of them once already.
  select count(*) into n
    from compliance_plan_sections s
    join compliance_plan_templates t on t.code = s.section_code
   where s.camp_id = camp and t.form_row_key is null;
  if n <> 0 then
    raise exception 'T1 FAIL: % plan component(s) have no checklist row key', n; end if;
  passed := passed + 1;

  if exists (select 1 from compliance_plan_sections
              where camp_id=camp and section_code in ('ACT-09','ACT-12','ACT-15')) then
    raise exception 'T1 FAIL: sections for activities the camp does not run were created';
  end if;
  passed := passed + 1;

  -- ── T2 · engine writes a row for every requirement in an enabled package ──
  -- Derived from the catalog rather than hardcoded: seeding another county should not turn
  -- this suite red, but the engine silently skipping requirements must.
  select count(*) into expected_reqs
    from compliance_requirements r join compliance_profiles p on p.id = r.profile_id
   where p.code in ('NY-STATE','NY-WESTCHESTER') and p.is_active;
  n := compute_camp_compliance(camp, season);
  if n <> expected_reqs then
    raise exception 'T2 FAIL requirements computed: expected %, got %', expected_reqs, n; end if;
  passed := passed + 1;

  -- ── T3 · with no evidence on file, nothing may read as met ────────────────
  -- The number that matters is zero. A camp that has uploaded nothing and logged nothing
  -- must not see a single requirement in a met-looking state.
  select count(*) into n from camp_requirement_status
   where camp_id=camp and status in ('satisfied','partial','expiring');
  if n <> 0 then
    raise exception 'T3 FAIL: % requirement(s) read as met before any evidence existed', n; end if;
  passed := passed + 1;

  -- Every row that is not ruled out must say what it wants.
  select count(*) into n from camp_requirement_status
   where camp_id=camp and status not in ('not_applicable') and not (detail ? 'need');
  if n <> 0 then
    raise exception 'T3 FAIL: % requirement(s) reported a gap without saying what is needed', n; end if;
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
  if (det->>'complete')::int <> 40 or (det->>'sections')::int <> expected_sections then
    raise exception 'T7 FAIL WC-13 detail wrong (expected 40 of %): %', expected_sections, det; end if;
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

  -- ── T11 · unscoped evidence must not be borrowed from a neighbour ─────────
  -- The bug this guards: every `certification` requirement declared only min_count, so the
  -- engine counted EVERY certification at the camp. A first aid card held by the health
  -- director was reading as proof that the aquatics director was qualified. A requirement
  -- that cannot say which certifications count does not get to count any of them.
  insert into safety_staff (camp_id, name, title, is_active)
    values (camp, 'T Unrelated Staffer', 'Kitchen', true)
    on conflict do nothing;
  insert into staff_certifications (camp_id, staff_id, cert_type, cert_name, issued_date, expiry_date)
  select camp, id, 'food_handler', 'T Food Handler', current_date - 30, current_date + 300
    from safety_staff where camp_id=camp and name='T Unrelated Staffer';

  perform compute_camp_compliance(camp, season);
  select count(*) into n
    from camp_requirement_status s join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id=camp and r.evidence_type='certification'
     and not (r.evidence_rule ? 'cert_types')
     and s.status in ('satisfied','partial','expiring');
  if n <> 0 then
    raise exception 'T11 FAIL: % unscoped certification requirement(s) claimed an unrelated certification as evidence', n;
  end if;
  passed := passed + 1;

  -- The same trap for the other filtered branches.
  select count(*) into n
    from camp_requirement_status s join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id=camp
     and ((r.evidence_type='inspection'    and not (r.evidence_rule ? 'categories'))
       or (r.evidence_type='drill'         and not (r.evidence_rule ? 'drill_types'))
       or (r.evidence_type='asset_expiry'  and not (r.evidence_rule ? 'categories')))
     and s.status in ('satisfied','partial','expiring');
  if n <> 0 then
    raise exception 'T11 FAIL: % unscoped requirement(s) counted evidence they cannot identify', n;
  end if;
  passed := passed + 1;

  raise notice 'PASS: % assertions', passed;
end $$;

rollback;

-- ─────────────────────────────────────────────────────────────────────────────
-- Applicability is three-valued: yes / no / unknown.
--
-- The distinction that matters for liability is between "you told us no" and "we never
-- asked." The second must never render as "does not apply to you."
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  c record;
  v_got text;
  v_fail integer := 0;
  v_ran  integer := 0;
begin
  for c in
    select * from (values
      ('plain yes',            '{"has_pool":"true"}',  '{"has_pool":true}', 'yes'),
      ('plain no',             '{"has_pool":"false"}', '{"has_pool":true}', 'no'),
      ('unanswered is unknown','{}',                   '{"has_pool":true}', 'unknown'),
      ('any_of one true',      '{"has_pool":"false","has_waterfront":"true"}','{"any_of":{"has_pool":"true","has_waterfront":"true"}}','yes'),
      ('any_of all false',     '{"has_pool":"false","has_waterfront":"false"}','{"any_of":{"has_pool":"true","has_waterfront":"true"}}','no'),
      ('any_of no hit, one unasked','{"has_pool":"false"}','{"any_of":{"has_pool":"true","has_waterfront":"true"}}','unknown'),
      ('any_of hit beats unasked sibling','{"has_pool":"true"}','{"any_of":{"has_pool":"true","has_waterfront":"true"}}','yes'),
      ('any_of nothing asked', '{}','{"any_of":{"has_pool":"true","has_waterfront":"true"}}','unknown'),
      ('empty applies_when',   '{"camp_type":"overnight"}','{}','yes'),
      ('AND with one unasked', '{"camp_type":"overnight"}','{"camp_type":"overnight","has_riflery":true}','unknown'),
      ('a definite no outranks unknown','{"camp_type":"day"}','{"camp_type":"overnight","has_riflery":true}','no'),
      ('AND plus any_of both satisfied','{"camp_type":"overnight","has_pool":"true"}','{"camp_type":"overnight","any_of":{"has_pool":"true","has_waterfront":"true"}}','yes'),
      ('unknown AND survives an any_of hit','{"has_pool":"true"}','{"camp_type":"overnight","any_of":{"has_pool":"true"}}','unknown'),
      ('failed AND outranks an any_of hit','{"camp_type":"day","has_pool":"true"}','{"camp_type":"overnight","any_of":{"has_pool":"true"}}','no'),
      -- An answer that reached the table still JSON-quoted must not silently stop matching and
      -- quietly excuse the camp from the rule.
      ('a quoted answer still matches','{"has_pool":"\"true\""}','{"has_pool":true}','yes'),
      ('a quoted answer still mismatches','{"has_pool":"\"false\""}','{"has_pool":true}','no')
    ) as t(name, answers, applies_when, expect)
  loop
    v_ran := v_ran + 1;
    v_got := compliance_applicability(c.answers::jsonb, c.applies_when::jsonb);
    if v_got is distinct from c.expect then
      raise warning 'FAIL %: expected % got %', c.name, c.expect, v_got;
      v_fail := v_fail + 1;
    end if;
  end loop;
  if v_fail > 0 then raise exception 'compliance_applicability: % case(s) failed', v_fail; end if;
  raise notice 'T12 ok: applicability is three-valued across % cases', v_ran;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- The evidence a requirement counts must be evidence FOR that requirement.
--
-- Two narrow traps, both of which shipped as real bugs:
--   T13  safety_items.category is only four buckets wide, so 'fire' holds extinguishers and
--        smoke alarms alike. A smoke-alarm rule must not be proved by extinguishers.
--   T14  an asset with no registration expiry recorded was reading as registered, and
--        watercraft keep their date in a different column entirely.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

do $$
declare
  camp   constant uuid := '11111111-1111-4111-8111-111111111111';
  season constant uuid := '22222222-2222-4222-8222-222222222222';
  st text; det jsonb; passed int := 0;
begin
  delete from camp_requirement_status  where camp_id = camp;
  delete from camp_compliance_profiles where camp_id = camp;
  delete from camp_compliance_answers  where camp_id = camp;
  delete from safety_items             where camp_id = camp;
  delete from camp_assets              where camp_id = camp;

  insert into camps (id, name, slug, status) values (camp, 'TEST Pine Ridge', 'test-pine-ridge', 'active')
    on conflict (id) do nothing;
  insert into seasons (id, camp_id, name, opening_date, closing_date)
    values (season, camp, 'TEST', current_date - 60, current_date + 10) on conflict (id) do nothing;

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

  -- ── T13 · extinguishers are not smoke alarms ──────────────────────────────
  insert into safety_items (camp_id, name, category, type, location, frequency, frequency_days, last_inspected, next_due)
  values (camp, 'T Extinguisher', 'fire', 'fire_extinguisher', 'Lodge', 'monthly', 30, current_date - 5, current_date + 25);

  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s
    join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id = camp and r.req_code = 'NY-1802';
  if st in ('satisfied','partial','expiring') then
    raise exception 'T13 FAIL NY-1802: an extinguisher was accepted as proof of a smoke alarm (got %)', st;
  end if;
  passed := passed + 1;

  -- The same register DOES prove the rule that owns the whole fire category.
  select status into st from camp_requirement_status s
    join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id = camp and r.req_code = 'NY-1804';
  if st not in ('satisfied','expiring') then
    raise exception 'T13 FAIL NY-1804: a current extinguisher did not satisfy the extinguisher rule (got %)', st;
  end if;
  passed := passed + 1;

  -- Add the alarm and the smoke-alarm rule must come alive.
  insert into safety_items (camp_id, name, category, type, location, frequency, frequency_days, last_inspected, next_due)
  values (camp, 'T Smoke alarm', 'fire', 'smoke_alarm', 'Cabin 1', 'monthly', 30, current_date - 5, current_date + 25);
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s
    join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id = camp and r.req_code = 'NY-1802';
  if st not in ('satisfied','expiring') then
    raise exception 'T13 FAIL NY-1802: a current smoke alarm did not satisfy the smoke alarm rule (got %)', st;
  end if;
  passed := passed + 1;

  -- ── T14 · an undated registration is not a current registration ───────────
  insert into camp_assets (camp_id, name, category, is_active, registration_expiry)
  values (camp, 'T Van', 'vehicle', true, null);
  perform compute_camp_compliance(camp, season);
  select status, detail into st, det from camp_requirement_status s
    join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id = camp and r.req_code = 'NY-1002';
  if st = 'satisfied' then
    raise exception 'T14 FAIL NY-1002: a vehicle with no expiry date on file read as registered';
  end if;
  if (det->>'undated')::int is distinct from 1 then
    raise exception 'T14 FAIL NY-1002: expected 1 undated vehicle, detail was %', det;
  end if;
  passed := passed + 1;

  -- An expired registration is worse than an undated one and must say so.
  update camp_assets set registration_expiry = current_date - 3 where camp_id = camp and name = 'T Van';
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s
    join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id = camp and r.req_code = 'NY-1002';
  if st <> 'missing' then
    raise exception 'T14 FAIL NY-1002: an expired vehicle registration did not read as missing (got %)', st;
  end if;
  passed := passed + 1;

  -- A watercraft keeps its date in uscg_registration_expiry; the branch must read it.
  delete from camp_assets where camp_id = camp;
  insert into camp_assets (camp_id, name, category, is_active, registration_expiry, uscg_registration_expiry)
  values (camp, 'T Canoe', 'watercraft', true, null, current_date + 200);
  perform compute_camp_compliance(camp, season);
  select status into st from camp_requirement_status s
    join compliance_requirements r on r.id = s.requirement_id
   where s.camp_id = camp and r.req_code = 'NY-1112';
  if st <> 'satisfied' then
    raise exception 'T14 FAIL NY-1112: a currently registered canoe did not satisfy the watercraft rule (got %)', st;
  end if;
  passed := passed + 1;

  raise notice 'PASS: % assertions (evidence precision)', passed;
end $$;

rollback;

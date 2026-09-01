-- The Justice Center rules were firing at the wrong camps.
--
-- 10 NYCRR 7-2.25 has two subdivisions with two different populations, and we were treating them
-- as one:
--
--   (a) applies to a camp that ENROLS campers with disabilities — extra staffing ratios, care
--       plans, expanded medical histories, adapted facilities. NY-2501 through NY-2507. These
--       were tagged correctly.
--
--   (b) applies to a "children's camp for children with developmental disabilities", which 7-2.2
--       defines as "a children's camp with 20 percent or more enrollment of campers with a
--       developmental disability". NY-2508, NY-2509 and NY-2510 — the Justice Center staff
--       exclusion list, the three-registry screening, mandated reporter training, the code of
--       conduct, and the incident clocks (immediate report to the Vulnerable Persons' Central
--       Register, investigate within 5 business days, written report in 45 days, corrective
--       action implemented in 90).
--
-- All ten were tagged `enrolls_campers_with_disabilities`, so a camp with one camper with a
-- disability was being told it owed the Justice Center regime. That is a serious over-claim: it
-- puts a whole registry-screening and incident-reporting apparatus in front of a camp that does
-- not owe it, and the module's whole argument is that it does not do that.
--
-- The threshold has always been collected — as a DOH-367 form answer. But requirement
-- applicability reads the SETUP interview, not form answers, so the fact was sitting in the wrong
-- table to be usable. It moves to setup, where it belongs: 20-percent enrolment is not a fact
-- about this year's filing, it is a fact about the camp that decides which regime applies, in the
-- same class as "do you have a pool".

-- ── 1. Carry the answers that already exist across to the setup interview ─────
--
-- Before the form question is retired, anything a camp has already told us is copied to the
-- setup answer, so no camp is asked again for something it has answered.

insert into camp_compliance_answers (camp_id, season_id, key, value, answered_by, answered_at)
select fa.camp_id, fa.season_id, 'is_dd_camp',
       case when lower(trim(both '"' from fa.value)) in ('yes','true') then 'true' else 'false' end,
       fa.answered_by, coalesce(fa.answered_at, now())
  from camp_form_answers fa
 where fa.question_key = 'ny.campers.developmentally_disabled_20pct'
   and trim(both '"' from coalesce(fa.value, '')) <> ''
on conflict (camp_id, season_id, key) do nothing;

-- ── 2. Retire the duplicate form question ────────────────────────────────────
--
-- DOH-367's two boxes are now drawn from the setup answer by `facilityValues()`, the same way
-- every activity tick on that page already is. Asking it in both places would let the form and
-- the regime disagree about the same camp.

delete from camp_form_answers where question_key = 'ny.campers.developmentally_disabled_20pct';
delete from compliance_form_questions where question_key = 'ny.campers.developmentally_disabled_20pct';

-- ── 3. Point subdivision (b) at the threshold ────────────────────────────────

update compliance_requirements
   set applies_when = '{"is_dd_camp": "true"}'::jsonb
 where req_code in ('NY-2508', 'NY-2509', 'NY-2510');

-- NY-2501 through NY-2507 are deliberately left on `enrolls_campers_with_disabilities`: they are
-- subdivision (a), and they are owed by a camp that enrols any camper with a disability.

-- ── 4. Recompute, so no camp keeps a status from the old rule ────────────────
--
-- A camp that answered neither question now gets `needs_answer` on the three, which is the
-- correct three-valued outcome: we have not asked, so we do not claim.

do $$
declare r record;
begin
  for r in select distinct camp_id, season_id from camp_requirement_status loop
    perform compute_camp_compliance(r.camp_id, r.season_id);
  end loop;
end $$;

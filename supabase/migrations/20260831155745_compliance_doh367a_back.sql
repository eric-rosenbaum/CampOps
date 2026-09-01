-- Bring back DOH-367a, the first form unparked since everything but DOH-367 was switched off.
--
-- It is the right one to take first because it is not really a second form: it is the
-- continuation sheet of the one already working. The same camp files both at the same time, and
-- every cell in its three tables comes from the safety roster we already hold — the builder
-- (`staffQualificationValues`) has been filling them since the module was written. What was
-- missing was a way for a camp to see the form, know whether it is ready, and answer the handful
-- of cells the roster cannot answer.
--
-- Three fixes have to land WITH the activation, because switching the form on is what makes each
-- of them visible. `applicableQuestions` hides any question that prints only on a parked form,
-- so every one of these has been dormant and unexercised.

-- ── 1. The riflery instructor is not one of your directors ────────────────────
--
-- `ny.riflery_instructor.dob` sits in the `key_staff` group, whose block on DOH-367 is headed
-- "Camp director, health director and aquatics director" and is built by listing that group.
-- Dormant while DOH-367a was parked; the moment the form comes back, a camp with a rifle range
-- would find the range instructor's date of birth being asked for under their directors, on a
-- form it does not print on. Its own group, and its own block on its own form.

update compliance_form_questions
   set group_key = 'riflery', group_label = 'Riflery instructor'
 where question_key = 'ny.riflery_instructor.dob';

-- ── 2. Three of the four riflery cells had no question at all ─────────────────
--
-- The map has name, date of birth, certification and date issued. Only the date of birth was
-- ever asked, so a camp with riflery would have printed a birthday under a blank name — worse
-- than an empty section, because a half-filled row reads as a filled one. The roster cannot
-- supply these: it holds a free-text title, and nothing on it says who runs the range.

insert into compliance_form_questions
  (question_key, form_code, group_key, group_label, label, help_text, answer_kind, choices,
   renders, depends_on, depends_on_value, derives_from, applies_when, required, sort_order)
values
  ('ny.riflery_instructor.name', 'DOH-367a', 'riflery', 'Riflery instructor',
   'Who runs your riflery range?',
   'The form names one person. Nothing on your staff roster says who this is, so it is asked here.',
   'text', null,
   '[{"form": "DOH-367a", "field": "riflery_instructor_name", "part": "text"}]'::jsonb,
   null, null, null, '{"has_riflery": "true"}'::jsonb, true, 415),

  ('ny.riflery_instructor.certification', 'DOH-367a', 'riflery', 'Riflery instructor',
   'Their riflery certification',
   'What the certificate itself says. The form gives one line for it.',
   'text', null,
   '[{"form": "DOH-367a", "field": "riflery_instructor_certification", "part": "text"}]'::jsonb,
   null, null, null, '{"has_riflery": "true"}'::jsonb, true, 422),

  ('ny.riflery_instructor.certification_issued_on', 'DOH-367a', 'riflery', 'Riflery instructor',
   'When was that certification issued?', null,
   'date', null,
   '[{"form": "DOH-367a", "field": "riflery_instructor_date_issued_month", "part": "month"},
     {"form": "DOH-367a", "field": "riflery_instructor_date_issued_day", "part": "day"},
     {"form": "DOH-367a", "field": "riflery_instructor_date_issued_year", "part": "year"}]'::jsonb,
   null, null, null, '{"has_riflery": "true"}'::jsonb, true, 424)
on conflict (question_key) do nothing;

-- ── 3. "Day camps only" has to mean day camps only ────────────────────────────
--
-- The counselor table's first row is printed "16 (Day camps only)". Both its cells were asked of
-- every camp, so an overnight camp would have been told it had two required answers outstanding
-- for two boxes it must leave blank — and a camp that answered them would have printed a
-- headcount into a row the state says does not apply to it. `camp_type` is already a setup
-- answer with exactly these two values.

update compliance_form_questions
   set applies_when = '{"camp_type": "day"}'::jsonb
 where question_key in ('ny.counselors.16_male', 'ny.counselors.16_female');

-- ── 4. Switch the form on ─────────────────────────────────────────────────────
--
-- Requirement WC-08 comes back into scope with it: `form_codes` was derived from this catalog,
-- so the requirement pointing at DOH-367a is in scope exactly when DOH-367a is.

update compliance_authority_forms
   set is_active = true
 where designation = 'DOH-367a';

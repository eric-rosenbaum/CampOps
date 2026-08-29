-- Compliance — collecting what the New York packet asks for and the platform does not hold.
--
-- Today `nyPacket` fills 204 of the 860 camp-owned cells across the five NY DOH forms and hands
-- the camp a half-typed packet. 285 more are derivable from data we already store (see
-- docs/compliance/form-field-inventory.md §3). The remaining 371 have no home anywhere in the
-- schema. This migration builds the three homes they need.
--
-- Three storage decisions, deliberately different from each other:
--
-- 1 · The catalog (`compliance_form_questions` + `camp_form_answers`) holds the ~105 one-off
--     scalar questions. A catalog rather than 105 columns because that is how this whole module
--     works: a jurisdiction is a seed, never a migration.
--
--     The catalog row is a QUESTION, not a form field. The maps are cells — every date is three
--     of them, every checklist row is two or three — and a catalog keyed on the cell would ask a
--     director for the month, the day and the year of their birth as three separate prompts, on
--     three separate forms. 371 cells are ~105 questions once the answer is modelled instead of
--     the cell. `renders` carries the projection back onto the flat coordinate maps, in the same
--     spirit as `compliance_requirements.evidence_rule` and `applies_when`.
--
-- 2 · DOH-367's camper-capacity table gets a REAL table, not catalog rows. 10 sessions × 12
--     counts is 120 typed integers with a cross-row invariant ("do the bands sum to the count
--     you filed?"); as text answers that invariant is unenforceable and the arithmetic becomes a
--     pivot. It is compliance-owned rather than an extension of `commissary_sessions` because
--     the form asks for LAST season's ACTUAL attendance, while `commissary_sessions.camper_count`
--     is this season's forecast, is edited by a food-service manager to make ordering come out
--     right, and carries no `season_id` at all. Those are different numbers with different
--     owners. A nullable `source_session_id` lets the UI offer to copy the names and dates.
--
-- 3 · Staff dates of birth, education and qualifying experience go on `safety_staff`, because
--     they are facts about a person. Storing a birthday as
--     ('DOH-367a','lifeguard_row3_date_of_birth_year') binds it to a row position on one New
--     York form, must be duplicated for every other state, and follows the wrong person the
--     moment a lifeguard leaves and the rows shift. One column makes all 54 of DOH-367a's DOB
--     cells derivable, for every jurisdiction, forever.
--
-- Nothing here is executed against a database by this file's author; apply it with the usual
-- migration flow.

-- ─── 1 · Staff facts belong on the staff record ──────────────────────────────
-- These are PII. `safety_staff` is currently readable by any camp member; the new columns are
-- not, so a view-level split is enforced below rather than left to the UI.
alter table safety_staff
  add column if not exists date_of_birth               date,
  add column if not exists sex                         text,
  add column if not exists education                   text,
  add column if not exists qualifying_experience       text,
  add column if not exists professional_license_number text;

do $$ begin
  alter table safety_staff add constraint safety_staff_sex_check
    check (sex is null or sex in ('male','female'));
exception when duplicate_object then null; end $$;

comment on column safety_staff.date_of_birth is
  'Required by DOH-367 (directors) and DOH-367a (every certified lifeguard and first-aid staff member). PII: admin-only, see policy safety_staff_pii_read.';
comment on column safety_staff.education is
  'DOH-367 "Education" for the camp director. One printed line on the form.';
comment on column safety_staff.qualifying_experience is
  'DOH-367 "Qualifying Experience" for the camp director. One printed line on the form.';
comment on column safety_staff.professional_license_number is
  'DOH-367 "NYS License Number" for the health director. safety_licenses cannot carry this: it is camp-scoped and has no staff_id.';

-- ─── 2 · The catalog: which questions a jurisdiction asks, and where they land ─
create table if not exists compliance_form_questions (
  id                uuid primary key default gen_random_uuid(),
  jurisdiction_code text not null default 'NY',
  question_key      text not null unique,        -- 'ny.director.dob'
  -- Null means the question feeds several forms (the camp operator's name feeds four).
  form_code         text,
  group_key         text not null,               -- one sitting in the collection UI
  group_label       text not null,
  label             text not null,
  help_text         text,
  answer_kind       text not null check (answer_kind in
                      ('bool','tristate','text','longtext','date','integer','choice')),
  -- [{"value":"rn","label":"RN"}, ...] for answer_kind='choice'.
  choices           jsonb,
  -- How one answer projects onto the flat coordinate maps:
  --   [{"form":"DOH-2271","field":"date_of_birth_month","part":"month"}, ...]
  -- part: text | check | month | day | year.  "when" restricts a cell to one answer value,
  -- which is how a choice ticks exactly one of seven boxes and a tristate one of three.
  renders           jsonb not null,
  -- Intra-form gating: only ask this if another question was answered this way. Distinct from
  -- applies_when, which is evaluated against the camp's setup interview.
  depends_on        text references compliance_form_questions(question_key) deferrable initially deferred,
  depends_on_value  text,
  -- Set when the platform could answer this itself but does not yet. Names the source so the
  -- question can be retired rather than asked forever.
  derives_from      text,
  -- Same shape and same evaluator as compliance_requirements.applies_when.
  applies_when      jsonb not null default '{}'::jsonb,
  required          boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_form_questions_group
  on compliance_form_questions(jurisdiction_code, group_key, sort_order);
create index if not exists idx_form_questions_form
  on compliance_form_questions(form_code, sort_order);
comment on table compliance_form_questions is
  'Catalog of the questions a jurisdiction''s permit forms ask that the platform cannot answer from its own data. Curated reference data, not camp data. One row is one QUESTION; `renders` maps it onto the cells of the coordinate maps in src/lib/compliance/forms/.';

-- ─── 3 · The camp's answers ──────────────────────────────────────────────────
create table if not exists camp_form_answers (
  camp_id      uuid not null references camps(id)   on delete cascade,
  season_id    uuid not null references seasons(id) on delete cascade,
  question_key text not null references compliance_form_questions(question_key) on delete cascade,
  -- 0 for a scalar question. Reserved for a future repeating group; the two repeating tables
  -- New York actually has are modelled properly instead (see compliance_session_capacity and
  -- safety_staff), so nothing seeded here uses a non-zero row_index.
  row_index    integer not null default 0,
  value        text,
  answered_by  text,
  answered_at  timestamptz not null default now(),
  primary key (camp_id, season_id, question_key, row_index)
);
create index if not exists idx_form_answers_camp on camp_form_answers(camp_id, season_id);

-- ─── 4 · DOH-367's camper capacity table ─────────────────────────────────────
-- Last season's ACTUAL attendance, by session, age band and sex. A reporting number the camp
-- files, not the operational headcount the kitchen orders against.
create table if not exists compliance_session_capacity (
  id                uuid primary key default gen_random_uuid(),
  camp_id           uuid not null references camps(id)   on delete cascade,
  season_id         uuid not null references seasons(id) on delete cascade,
  -- Row 1..10: the printed form has ten rows and no overflow room.
  session_index     integer not null check (session_index between 1 and 10),
  session_name      text,
  -- Per row, because a camp may run a day programme and an overnight programme in one season.
  camp_type         text check (camp_type is null or camp_type in ('day','overnight')),
  number_of_days    smallint check (number_of_days is null or number_of_days between 0 and 366),
  -- The form's own six age bands, male and female. smallint because "twelve" must not reach a
  -- signed government form.
  age_1_to_5_male    smallint not null default 0 check (age_1_to_5_male    >= 0),
  age_1_to_5_female  smallint not null default 0 check (age_1_to_5_female  >= 0),
  age_6_7_male       smallint not null default 0 check (age_6_7_male       >= 0),
  age_6_7_female     smallint not null default 0 check (age_6_7_female     >= 0),
  age_8_to_12_male   smallint not null default 0 check (age_8_to_12_male   >= 0),
  age_8_to_12_female smallint not null default 0 check (age_8_to_12_female >= 0),
  age_13_to_15_male  smallint not null default 0 check (age_13_to_15_male  >= 0),
  age_13_to_15_female smallint not null default 0 check (age_13_to_15_female >= 0),
  age_16_17_male     smallint not null default 0 check (age_16_17_male     >= 0),
  age_16_17_female   smallint not null default 0 check (age_16_17_female   >= 0),
  cits_male          smallint not null default 0 check (cits_male          >= 0),
  cits_female        smallint not null default 0 check (cits_female        >= 0),
  -- Prefill only. Null when the camp does not run the commissary module, which is most of them.
  source_session_id uuid references commissary_sessions(id) on delete set null,
  updated_by        text,
  updated_at        timestamptz not null default now(),
  unique (camp_id, season_id, session_index)
);
create index if not exists idx_session_capacity_camp
  on compliance_session_capacity(camp_id, season_id, session_index);
comment on table compliance_session_capacity is
  'DOH-367 camper capacity: last season''s actual attendance per session by age band and sex. Deliberately NOT commissary_sessions — that table holds this season''s forecast, has no season_id, and is edited to make food ordering come out right.';

-- ─── 5 · Facility code ───────────────────────────────────────────────────────
-- headerValues() already reads camp.facilityCode; FormsPanel never sets it, because there has
-- never been anywhere to put it. It prints blank on DOH-367 and DOH-367a on every packet.
alter table camps add column if not exists facility_code text;
comment on column camps.facility_code is
  'NYS DOH facility code. Printed on DOH-367 and DOH-367a; supplied by the local health department when the camp is first permitted.';

-- ─── 6 · RLS ─────────────────────────────────────────────────────────────────
-- Catalog: readable by any signed-in user, written only by us. Camp answers: camp-scoped, on
-- the same helpers the rest of the module uses.
alter table compliance_form_questions  enable row level security;
alter table camp_form_answers          enable row level security;
alter table compliance_session_capacity enable row level security;

drop policy if exists form_questions_read on compliance_form_questions;
create policy form_questions_read on compliance_form_questions
  for select to authenticated using (true);
drop policy if exists form_questions_admin on compliance_form_questions;
create policy form_questions_admin on compliance_form_questions
  for all using (is_platform_admin()) with check (is_platform_admin());

-- The answers include a director's home address and criminal history (DOH-2271). Read is
-- admin-only, not member-wide, unlike the rest of the compliance module.
drop policy if exists form_answers_select on camp_form_answers;
create policy form_answers_select on camp_form_answers
  for select using (is_camp_admin(camp_id));
drop policy if exists form_answers_write on camp_form_answers;
create policy form_answers_write on camp_form_answers
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

drop policy if exists session_capacity_select on compliance_session_capacity;
create policy session_capacity_select on compliance_session_capacity
  for select using (is_camp_member(camp_id));
drop policy if exists session_capacity_write on compliance_session_capacity;
create policy session_capacity_write on compliance_session_capacity
  for all using (get_camp_role(camp_id) = any (array['admin','staff']))
  with check (get_camp_role(camp_id) = any (array['admin','staff']));

-- ─── 7 · Catalog seed — New York, 105 questions ──────────────────────────────
-- Covers every one of the 197 MUST COLLECT cells that is neither a camper-capacity cell (120,
-- in compliance_session_capacity) nor a staff date of birth (54, on safety_staff). Verified
-- key-by-key against the five coordinate maps: every `renders.field` below exists in its map,
-- and every MUST COLLECT cell is rendered by exactly one question.
insert into compliance_form_questions
  (question_key, form_code, group_key, group_label, label, help_text, answer_kind, choices,
   renders, depends_on, depends_on_value, derives_from, applies_when, required, sort_order)
values
  ('ny.capacity.estimates_used', 'DOH-367', 'sessions', 'Sessions and attendance', 'Are these camper numbers estimates because the camp did not operate last season?', 'DOH-367 requires estimated figures to be flagged.', 'bool', null, '[{"form": "DOH-367", "field": "capacity_estimates_used", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 10),
  ('ny.activity.amusement_parks', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Amusement Parks here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_amusement_parks", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 20),
  ('ny.activity.aquatic_theme_parks', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Aquatic Theme Parks here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_aquatic_theme_parks", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 30),
  ('ny.activity.arts_and_crafts', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Arts and Crafts here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_arts_and_crafts", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 40),
  ('ny.activity.bicycling', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Bicycling here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_bicycling", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 50),
  ('ny.activity.classroom_instruction', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Classroom Instruction here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_classroom_instruction", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 60),
  ('ny.activity.cooking', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Cooking here?', 'Camper cooking as an activity period. Running a kitchen is food service, not this.', 'bool', null, '[{"form": "DOH-367", "field": "activity_cooking", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 70),
  ('ny.activity.dancing_acting', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Dancing / Acting here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_dancing_acting", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 80),
  ('ny.activity.gymnastics', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Gymnastics here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_gymnastics", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 90),
  ('ny.activity.high_adventure', 'DOH-367', 'activities', 'Activities offered', 'Do campers do High Adventure here?', 'Starred on the form: also write what it is in the specification lines below.', 'bool', null, '[{"form": "DOH-367", "field": "activity_high_adventure", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 100),
  ('ny.activity.hiking', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Hiking here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_hiking", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 110),
  ('ny.activity.ice_skating', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Ice Skating here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_ice_skating", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 120),
  ('ny.activity.martial_arts', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Martial Arts here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_martial_arts", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 130),
  ('ny.activity.mountain_boarding', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Mountain Boarding here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_mountain_boarding", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 140),
  ('ny.activity.nature_study', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Nature Study here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_nature_study", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 150),
  ('ny.activity.organized_games_play', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Organized Games (Play) here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_organized_games_play", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 160),
  ('ny.activity.petting_zoo', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Petting Zoo here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_petting_zoo", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 170),
  ('ny.activity.roller_skating_blading', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Roller Skating / Blading here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_roller_skating_blading", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 180),
  ('ny.activity.skate_boarding', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Skate Boarding here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_skate_boarding", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 190),
  ('ny.activity.sports', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Sports here?', null, 'bool', null, '[{"form": "DOH-367", "field": "activity_sports", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 200),
  ('ny.activity.swimming_off_site', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Swimming — Off-Site here?', 'Swimming at another facility. The setup interview asks about off-site and wilderness swimming together, which cannot answer either row on its own.', 'bool', null, '[{"form": "DOH-367", "field": "activity_swimming_off_site", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 210),
  ('ny.activity.swimming_wilderness', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Swimming — Wilderness here?', 'Swimming at a natural body of water on a trip.', 'bool', null, '[{"form": "DOH-367", "field": "activity_swimming_wilderness", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 220),
  ('ny.activity.other_water_activities', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Other Water Activities here?', 'Starred on the form: also write what it is in the specification lines below.', 'bool', null, '[{"form": "DOH-367", "field": "activity_other_water_activities", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 230),
  ('ny.activity.other', 'DOH-367', 'activities', 'Activities offered', 'Do campers do Other here?', 'Starred on the form: also write what it is in the specification lines below.', 'bool', null, '[{"form": "DOH-367", "field": "activity_other", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 240),
  ('ny.activity.specify_1', 'DOH-367', 'activities', 'Activities offered', 'Specification line 1 for a starred activity', 'High Adventure, Other Water Activities and Other each require a written specification.', 'text', null, '[{"form": "DOH-367", "field": "activity_specify_1", "part": "text"}]'::jsonb, 'ny.activity.high_adventure', null, null, '{}'::jsonb, false, 250),
  ('ny.activity.specify_2', 'DOH-367', 'activities', 'Activities offered', 'Specification line 2 for a starred activity', 'High Adventure, Other Water Activities and Other each require a written specification.', 'text', null, '[{"form": "DOH-367", "field": "activity_specify_2", "part": "text"}]'::jsonb, 'ny.activity.high_adventure', null, null, '{}'::jsonb, false, 260),
  ('ny.activity.specify_3', 'DOH-367', 'activities', 'Activities offered', 'Specification line 3 for a starred activity', 'High Adventure, Other Water Activities and Other each require a written specification.', 'text', null, '[{"form": "DOH-367", "field": "activity_specify_3", "part": "text"}]'::jsonb, 'ny.activity.high_adventure', null, null, '{}'::jsonb, false, 270),
  ('ny.activity.specify_4', 'DOH-367', 'activities', 'Activities offered', 'Specification line 4 for a starred activity', 'High Adventure, Other Water Activities and Other each require a written specification.', 'text', null, '[{"form": "DOH-367", "field": "activity_specify_4", "part": "text"}]'::jsonb, 'ny.activity.high_adventure', null, null, '{}'::jsonb, false, 280),
  ('ny.activity.specify_5', 'DOH-367', 'activities', 'Activities offered', 'Specification line 5 for a starred activity', 'High Adventure, Other Water Activities and Other each require a written specification.', 'text', null, '[{"form": "DOH-367", "field": "activity_specify_5", "part": "text"}]'::jsonb, 'ny.activity.high_adventure', null, null, '{}'::jsonb, false, 290),
  ('ny.activity.specify_6', 'DOH-367', 'activities', 'Activities offered', 'Specification line 6 for a starred activity', 'High Adventure, Other Water Activities and Other each require a written specification.', 'text', null, '[{"form": "DOH-367", "field": "activity_specify_6", "part": "text"}]'::jsonb, 'ny.activity.high_adventure', null, null, '{}'::jsonb, false, 300),
  ('ny.camp_director.dob', 'DOH-367', 'key_staff', 'Your directors', 'Camp director''s date of birth', null, 'date', null, '[{"form": "DOH-367", "field": "camp_director_dob_month", "part": "month"}, {"form": "DOH-367", "field": "camp_director_dob_day", "part": "day"}, {"form": "DOH-367", "field": "camp_director_dob_year", "part": "year"}]'::jsonb, null, null, 'Move to safety_staff.date_of_birth once that column exists.', '{}'::jsonb, true, 310),
  ('ny.camp_director.education', 'DOH-367', 'key_staff', 'Your directors', 'Camp director''s education', 'One printed line — keep it short.', 'text', null, '[{"form": "DOH-367", "field": "camp_director_education", "part": "text"}]'::jsonb, null, null, 'Move to safety_staff.education once that column exists.', '{}'::jsonb, true, 320),
  ('ny.camp_director.qualifying_experience', 'DOH-367', 'key_staff', 'Your directors', 'Camp director''s qualifying experience', 'One printed line — keep it short.', 'text', null, '[{"form": "DOH-367", "field": "camp_director_qualifying_experience", "part": "text"}]'::jsonb, null, null, 'Move to safety_staff.qualifying_experience once that column exists.', '{}'::jsonb, true, 330),
  ('ny.health_director.qualification', 'DOH-367', 'key_staff', 'Your directors', 'Health director''s qualification', null, 'choice', '[{"value": "doctor", "label": "Doctor"}, {"value": "nurse_practitioner", "label": "Nurse Practitioner"}, {"value": "physician_assistant", "label": "Physician Assistant"}, {"value": "rn", "label": "RN"}, {"value": "lpn", "label": "LPN"}, {"value": "emt", "label": "EMT"}, {"value": "other", "label": "Other"}]'::jsonb, '[{"form": "DOH-367", "field": "health_director_qual_doctor", "part": "check", "when": "doctor"}, {"form": "DOH-367", "field": "health_director_qual_nurse_practitioner", "part": "check", "when": "nurse_practitioner"}, {"form": "DOH-367", "field": "health_director_qual_physician_assistant", "part": "check", "when": "physician_assistant"}, {"form": "DOH-367", "field": "health_director_qual_rn", "part": "check", "when": "rn"}, {"form": "DOH-367", "field": "health_director_qual_lpn", "part": "check", "when": "lpn"}, {"form": "DOH-367", "field": "health_director_qual_emt", "part": "check", "when": "emt"}, {"form": "DOH-367", "field": "health_director_qual_other", "part": "check", "when": "other"}]'::jsonb, null, null, null, '{}'::jsonb, true, 340),
  ('ny.health_director.qualification_other', 'DOH-367', 'key_staff', 'Your directors', 'If other, what qualification?', null, 'text', null, '[{"form": "DOH-367", "field": "health_director_qual_other_text", "part": "text"}]'::jsonb, 'ny.health_director.qualification', 'other', null, '{}'::jsonb, false, 350),
  ('ny.health_director.nys_license_number', 'DOH-367', 'key_staff', 'Your directors', 'Health director''s NYS license number', null, 'text', null, '[{"form": "DOH-367", "field": "health_director_nys_license_number", "part": "text"}]'::jsonb, null, null, 'Move to safety_staff.professional_license_number. safety_licenses is camp-scoped and has no staff_id.', '{}'::jsonb, true, 360),
  ('ny.health_director.site_presence', 'DOH-367', 'key_staff', 'Your directors', 'Day camps only: is the health director on-site or off-site?', null, 'choice', '[{"value": "on_site", "label": "On-site"}, {"value": "off_site", "label": "Off-site"}]'::jsonb, '[{"form": "DOH-367", "field": "health_director_on_site", "part": "check", "when": "on_site"}, {"form": "DOH-367", "field": "health_director_off_site", "part": "check", "when": "off_site"}]'::jsonb, null, null, null, '{"camp_type": "day"}'::jsonb, false, 370),
  ('ny.cert.cpr_assistant', 'DOH-367', 'key_staff', 'Your directors', 'Does a health director assistant hold the CPR certification?', null, 'bool', null, '[{"form": "DOH-367", "field": "cert_cpr_staff_assistant", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 380),
  ('ny.cert.first_aid_assistant', 'DOH-367', 'key_staff', 'Your directors', 'Does a health director assistant hold the First Aid certification?', null, 'bool', null, '[{"form": "DOH-367", "field": "cert_first_aid_staff_assistant", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 390),
  ('ny.aquatics_director.dob', 'DOH-367', 'key_staff', 'Your directors', 'Aquatics director''s date of birth', null, 'date', null, '[{"form": "DOH-367", "field": "aquatics_director_dob_month", "part": "month"}, {"form": "DOH-367", "field": "aquatics_director_dob_day", "part": "day"}, {"form": "DOH-367", "field": "aquatics_director_dob_year", "part": "year"}]'::jsonb, null, null, 'Move to safety_staff.date_of_birth once that column exists.', '{"has_pool": "true"}'::jsonb, true, 400),
  ('ny.aquatics_director.experience_route', 'DOH-367', 'key_staff', 'Your directors', 'Which experience requirement does the aquatics director meet?', null, 'choice', '[{"value": "one_season_director", "label": "One season as a camp aquatics director at a NYS children’s camp"}, {"value": "two_seasons_12_weeks", "label": "Two seasons totalling at least 12 weeks as a children’s camp lifeguard"}, {"value": "18_weeks_lifeguard", "label": "At least 18 weeks of previous lifeguard experience"}]'::jsonb, '[{"form": "DOH-367", "field": "aquatic_exp_one_season_director", "part": "check", "when": "one_season_director"}, {"form": "DOH-367", "field": "aquatic_exp_two_seasons_12_weeks", "part": "check", "when": "two_seasons_12_weeks"}, {"form": "DOH-367", "field": "aquatic_exp_18_weeks_lifeguard", "part": "check", "when": "18_weeks_lifeguard"}]'::jsonb, null, null, null, '{"has_pool": "true"}'::jsonb, true, 410),
  ('ny.riflery_instructor.dob', 'DOH-367a', 'key_staff', 'Your directors', 'Riflery instructor''s date of birth', null, 'date', null, '[{"form": "DOH-367a", "field": "riflery_instructor_dob_month", "part": "month"}, {"form": "DOH-367a", "field": "riflery_instructor_dob_day", "part": "day"}, {"form": "DOH-367a", "field": "riflery_instructor_dob_year", "part": "year"}]'::jsonb, null, null, 'Move to safety_staff.date_of_birth once that column exists.', '{"has_riflery": "true"}'::jsonb, true, 420),
  ('ny.counselors.16_male', 'DOH-367a', 'counselors', 'Counselor headcount', 'Counselors aged 16 (day camps only) — male', 'A headcount, not a roster. safety_staff is a certification roster and does not hold every counselor.', 'integer', null, '[{"form": "DOH-367a", "field": "counselors_age_16_male", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 430),
  ('ny.counselors.16_female', 'DOH-367a', 'counselors', 'Counselor headcount', 'Counselors aged 16 (day camps only) — female', 'A headcount, not a roster. safety_staff is a certification roster and does not hold every counselor.', 'integer', null, '[{"form": "DOH-367a", "field": "counselors_age_16_female", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 440),
  ('ny.counselors.17_male', 'DOH-367a', 'counselors', 'Counselor headcount', 'Counselors aged 17 — male', 'A headcount, not a roster. safety_staff is a certification roster and does not hold every counselor.', 'integer', null, '[{"form": "DOH-367a", "field": "counselors_age_17_male", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 450),
  ('ny.counselors.17_female', 'DOH-367a', 'counselors', 'Counselor headcount', 'Counselors aged 17 — female', 'A headcount, not a roster. safety_staff is a certification roster and does not hold every counselor.', 'integer', null, '[{"form": "DOH-367a", "field": "counselors_age_17_female", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 460),
  ('ny.counselors.18_and_over_male', 'DOH-367a', 'counselors', 'Counselor headcount', 'Counselors aged 18 and over — male', 'A headcount, not a roster. safety_staff is a certification roster and does not hold every counselor.', 'integer', null, '[{"form": "DOH-367a", "field": "counselors_age_18_and_over_male", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 470),
  ('ny.counselors.18_and_over_female', 'DOH-367a', 'counselors', 'Counselor headcount', 'Counselors aged 18 and over — female', 'A headcount, not a roster. safety_staff is a certification roster and does not hold every counselor.', 'integer', null, '[{"form": "DOH-367a", "field": "counselors_age_18_and_over_female", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 480),
  ('ny.dir_stmt.dob', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Camp director''s date of birth', null, 'date', null, '[{"form": "DOH-2271", "field": "date_of_birth_month", "part": "month"}, {"form": "DOH-2271", "field": "date_of_birth_day", "part": "day"}, {"form": "DOH-2271", "field": "date_of_birth_year", "part": "year"}]'::jsonb, null, null, 'Same person as ny.camp_director.dob; ask once.', '{}'::jsonb, true, 490),
  ('ny.dir_stmt.address_street', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Camp director''s home address — Street', 'The director''s own address, not the camp''s.', 'text', null, '[{"form": "DOH-2271", "field": "address_street", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 500),
  ('ny.dir_stmt.address_city', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Camp director''s home address — City', 'The director''s own address, not the camp''s.', 'text', null, '[{"form": "DOH-2271", "field": "address_city", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 510),
  ('ny.dir_stmt.address_state', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Camp director''s home address — State', 'The director''s own address, not the camp''s.', 'text', null, '[{"form": "DOH-2271", "field": "address_state", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 520),
  ('ny.dir_stmt.address_zip', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Camp director''s home address — ZIP', 'The director''s own address, not the camp''s.', 'text', null, '[{"form": "DOH-2271", "field": "address_zip", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 530),
  ('ny.dir_stmt.convicted', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Has the camp director been convicted of a crime, or is a criminal action pending?', null, 'choice', '[{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]'::jsonb, '[{"form": "DOH-2271", "field": "convicted_yes", "part": "check", "when": "yes"}, {"form": "DOH-2271", "field": "convicted_no", "part": "check", "when": "no"}]'::jsonb, null, null, null, '{}'::jsonb, true, 540),
  ('ny.dir_stmt.incident_date', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Date of the incident', null, 'date', null, '[{"form": "DOH-2271", "field": "item1_incident_date_month", "part": "month"}, {"form": "DOH-2271", "field": "item1_incident_date_day", "part": "day"}, {"form": "DOH-2271", "field": "item1_incident_date_year", "part": "year"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 550),
  ('ny.dir_stmt.conviction_date', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Date of the conviction or charge', null, 'date', null, '[{"form": "DOH-2271", "field": "item2_conviction_date_month", "part": "month"}, {"form": "DOH-2271", "field": "item2_conviction_date_day", "part": "day"}, {"form": "DOH-2271", "field": "item2_conviction_date_year", "part": "year"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 560),
  ('ny.dir_stmt.crime', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'The crime convicted of or charged with', null, 'text', null, '[{"form": "DOH-2271", "field": "item3_crime", "part": "text"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 570),
  ('ny.dir_stmt.nature', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'The nature of the incident', null, 'longtext', null, '[{"form": "DOH-2271", "field": "item4_nature", "part": "text"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 580),
  ('ny.dir_stmt.conviction_city', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Convicted in — City', null, 'text', null, '[{"form": "DOH-2271", "field": "item5_city", "part": "text"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 590),
  ('ny.dir_stmt.conviction_county', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Convicted in — County', null, 'text', null, '[{"form": "DOH-2271", "field": "item5_county", "part": "text"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 600),
  ('ny.dir_stmt.conviction_state', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Convicted in — State', null, 'text', null, '[{"form": "DOH-2271", "field": "item5_state", "part": "text"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 610),
  ('ny.dir_stmt.court', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Name of the court', null, 'text', null, '[{"form": "DOH-2271", "field": "item6_court", "part": "text"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 620),
  ('ny.dir_stmt.penalties', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Penalties imposed', null, 'longtext', null, '[{"form": "DOH-2271", "field": "item7_penalties", "part": "text"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 630),
  ('ny.dir_stmt.fine_date_1', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Date of fine (1)', null, 'date', null, '[{"form": "DOH-2271", "field": "item8_row1_fine_date_month", "part": "month"}, {"form": "DOH-2271", "field": "item8_row1_fine_date_day", "part": "day"}, {"form": "DOH-2271", "field": "item8_row1_fine_date_year", "part": "year"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 640),
  ('ny.dir_stmt.restitution_paid_1', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Restitution paid in full (1)', null, 'choice', '[{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]'::jsonb, '[{"form": "DOH-2271", "field": "item8_row1_restitution_paid_yes", "part": "check", "when": "yes"}, {"form": "DOH-2271", "field": "item8_row1_restitution_paid_no", "part": "check", "when": "no"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 650),
  ('ny.dir_stmt.jail_completed_1', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Date jail term completed (1)', null, 'date', null, '[{"form": "DOH-2271", "field": "item8_row1_jail_term_completed_month", "part": "month"}, {"form": "DOH-2271", "field": "item8_row1_jail_term_completed_day", "part": "day"}, {"form": "DOH-2271", "field": "item8_row1_jail_term_completed_year", "part": "year"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 660),
  ('ny.dir_stmt.fine_date_2', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Date of fine (2)', null, 'date', null, '[{"form": "DOH-2271", "field": "item8_row2_fine_date_month", "part": "month"}, {"form": "DOH-2271", "field": "item8_row2_fine_date_day", "part": "day"}, {"form": "DOH-2271", "field": "item8_row2_fine_date_year", "part": "year"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 670),
  ('ny.dir_stmt.restitution_paid_2', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Restitution paid in full (2)', null, 'choice', '[{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]'::jsonb, '[{"form": "DOH-2271", "field": "item8_row2_restitution_paid_yes", "part": "check", "when": "yes"}, {"form": "DOH-2271", "field": "item8_row2_restitution_paid_no", "part": "check", "when": "no"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 680),
  ('ny.dir_stmt.jail_completed_2', 'DOH-2271', 'director_statement', 'Director''s certified statement', 'Date jail term completed (2)', null, 'date', null, '[{"form": "DOH-2271", "field": "item8_row2_jail_term_completed_month", "part": "month"}, {"form": "DOH-2271", "field": "item8_row2_jail_term_completed_day", "part": "day"}, {"form": "DOH-2271", "field": "item8_row2_jail_term_completed_year", "part": "year"}]'::jsonb, 'ny.dir_stmt.convicted', 'yes', null, '{}'::jsonb, false, 690),
  ('ny.pool_plan.chain_of_command_outlined', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Chain of command outlined?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_chain_of_command_outlined_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_chain_of_command_outlined_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_chain_of_command_outlined_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 700),
  ('ny.pool_plan.chain_of_command_flow_chart', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Chain of command flow chart?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_chain_of_command_flow_chart_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_chain_of_command_flow_chart_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_chain_of_command_flow_chart_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 710),
  ('ny.pool_plan.job_duties_and_descriptions', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Job duties and descriptions?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_job_duties_and_descriptions_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_job_duties_and_descriptions_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_job_duties_and_descriptions_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 720),
  ('ny.pool_plan.daily_inspection', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Daily inspection?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_daily_inspection_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_daily_inspection_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_daily_inspection_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 730),
  ('ny.pool_plan.rules_and_regulations', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Rules and regulations?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_rules_and_regulations_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_rules_and_regulations_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_rules_and_regulations_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 740),
  ('ny.pool_plan.diving_safety', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Diving safety?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_diving_safety_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_diving_safety_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_diving_safety_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 750),
  ('ny.pool_plan.deck_slides', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Deck slides?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_deck_slides_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_deck_slides_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_deck_slides_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 760),
  ('ny.pool_plan.weather_water_quality', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Weather and water quality?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_weather_water_quality_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_weather_water_quality_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_weather_water_quality_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 770),
  ('ny.pool_plan.bather_capacity', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Bather capacity?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_bather_capacity_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_bather_capacity_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_bather_capacity_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 780),
  ('ny.pool_plan.supervision', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Supervision?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_supervision_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_supervision_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_supervision_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 790),
  ('ny.pool_plan.chemical_storage_and_handling', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Chemical storage and handling?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_chemical_storage_and_handling_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_chemical_storage_and_handling_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_chemical_storage_and_handling_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 800),
  ('ny.pool_plan.emergency_phone_numbers', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Emergency phone numbers?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_emergency_phone_numbers_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_emergency_phone_numbers_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_emergency_phone_numbers_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 810),
  ('ny.pool_plan.rescue_squad_consulted', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Rescue squad consulted?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_rescue_squad_consulted_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_rescue_squad_consulted_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_rescue_squad_consulted_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 820),
  ('ny.pool_plan.emergency_access', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Emergency access?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_emergency_access_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_emergency_access_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_emergency_access_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 830),
  ('ny.pool_plan.evacuation_route', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Evacuation route?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_evacuation_route_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_evacuation_route_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_evacuation_route_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 840),
  ('ny.pool_plan.first_aid_equipment', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: First aid equipment?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_first_aid_equipment_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_first_aid_equipment_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_first_aid_equipment_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 850),
  ('ny.pool_plan.first_aid_room_area', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: First aid room / area?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_first_aid_room_area_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_first_aid_room_area_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_first_aid_room_area_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 860),
  ('ny.pool_plan.clearing_water_emergency', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Clearing the water in an emergency?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_clearing_water_emergency_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_clearing_water_emergency_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_clearing_water_emergency_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 870),
  ('ny.pool_plan.communication_systems', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Communication systems?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_communication_systems_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_communication_systems_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_communication_systems_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 880),
  ('ny.pool_plan.search_procedures', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Search procedures?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_search_procedures_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_search_procedures_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_search_procedures_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 890),
  ('ny.pool_plan.epileptic_seizures', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Epileptic seizures?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_epileptic_seizures_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_epileptic_seizures_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_epileptic_seizures_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 900),
  ('ny.pool_plan.chlorine_gas_leaks', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Chlorine gas leaks?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_chlorine_gas_leaks_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_chlorine_gas_leaks_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_chlorine_gas_leaks_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 910),
  ('ny.pool_plan.practice_drills', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Practice drills?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_practice_drills_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_practice_drills_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_practice_drills_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 920),
  ('ny.pool_plan.incident_log', 'DOH-2286', 'pool_plan', 'Pool and beach safety plan', 'Does your pool and beach safety plan cover: Incident log?', null, 'tristate', null, '[{"form": "DOH-2286", "field": "row_incident_log_yes", "part": "check", "when": "yes"}, {"form": "DOH-2286", "field": "row_incident_log_no", "part": "check", "when": "no"}, {"form": "DOH-2286", "field": "row_incident_log_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Should become a compliance_plan_templates POOL_PLAN_* section so the camp writes the plan instead of ticking a box.', '{"has_pool": "true"}'::jsonb, true, 930),
  ('ny.campers.developmentally_disabled_20pct', 'DOH-367', 'filing', 'This year’s filing', 'Are 20% or more of your campers developmentally disabled?', 'The setup interview asks whether you enrol any, which cannot establish the 20% threshold.', 'choice', '[{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]'::jsonb, '[{"form": "DOH-367", "field": "developmentally_disabled_yes", "part": "check", "when": "yes"}, {"form": "DOH-367", "field": "developmentally_disabled_no", "part": "check", "when": "no"}]'::jsonb, null, null, null, '{}'::jsonb, true, 940),
  ('ny.safety_plan.previously_submitted', 'DOH-367', 'filing', 'This year’s filing', 'Was your written safety plan submitted in a previous year and is it still up to date?', null, 'bool', null, '[{"form": "DOH-367", "field": "safety_plan_previously_submitted", "part": "check", "when": "true"}]'::jsonb, null, null, null, '{}'::jsonb, false, 950),
  ('ny.safety_plan.previously_submitted_on', 'DOH-367', 'filing', 'This year’s filing', 'When was it submitted?', null, 'date', null, '[{"form": "DOH-367", "field": "safety_plan_previously_submitted_date_month", "part": "month"}, {"form": "DOH-367", "field": "safety_plan_previously_submitted_date_day", "part": "day"}, {"form": "DOH-367", "field": "safety_plan_previously_submitted_date_year", "part": "year"}]'::jsonb, 'ny.safety_plan.previously_submitted', 'true', null, '{}'::jsonb, false, 960),
  ('ny.facility_mods.status', 'DOH-367', 'filing', 'This year’s filing', 'Facility additions or modifications since last season', '"A list is attached" is set by the packet exporter, which knows what it enclosed.', 'choice', '[{"value": "list_attached", "label": "A list is attached"}, {"value": "none", "label": "No additions or modifications"}, {"value": "not_applicable", "label": "Not applicable — the camp did not operate last season"}]'::jsonb, '[{"form": "DOH-367", "field": "facility_mods_none", "part": "check", "when": "none"}, {"form": "DOH-367", "field": "facility_mods_not_applicable", "part": "check", "when": "not_applicable"}]'::jsonb, null, null, null, '{}'::jsonb, true, 970),
  ('ny.brochure.method', 'DOH-367', 'filing', 'This year’s filing', 'Which brochure do you give parents?', null, 'choice', '[{"value": "doh_3601", "label": "“Children’s Camps in New York State” (#3601)"}, {"value": "camp_statement_approved", "label": "Our own statement, submitted to and approved by DOH"}]'::jsonb, '[{"form": "DOH-367", "field": "brochure_doh_3601", "part": "check", "when": "doh_3601"}, {"form": "DOH-367", "field": "brochure_camp_statement_approved", "part": "check", "when": "camp_statement_approved"}]'::jsonb, null, null, null, '{}'::jsonb, true, 980),
  ('ny.plan.write_in_component', 'DOH-2040', 'filing', 'This year’s filing', 'Does your written safety plan carry an extra component the state’s list does not name?', null, 'choice', '[{"value": "yes", "label": "Yes"}, {"value": "na", "label": "Not applicable"}]'::jsonb, '[{"form": "DOH-2040", "field": "row_blank_write_in_yes", "part": "check", "when": "yes"}, {"form": "DOH-2040", "field": "row_blank_write_in_na", "part": "check", "when": "na"}]'::jsonb, null, null, 'Better modelled as an "add your own component" row in the plan tab than as a form question.', '{}'::jsonb, false, 990),
  ('ny.plan.write_in_page', 'DOH-2040', 'filing', 'This year’s filing', 'Which page of the plan covers it?', null, 'text', null, '[{"form": "DOH-2040", "field": "row_blank_write_in_page", "part": "text"}]'::jsonb, 'ny.plan.write_in_component', 'yes', null, '{}'::jsonb, false, 1000),
  ('ny.operator.print_name', null, 'operator', 'Who signs the permit', 'Camp operator — printed name', 'The legal permit holder or the officer signing for the operating corporation. Often not the camp director.', 'text', null, '[{"form": "DOH-367", "field": "operator_print_name", "part": "text"}, {"form": "DOH-367a", "field": "operator_print_name", "part": "text"}, {"form": "DOH-2040", "field": "completed_by_camp_operator", "part": "text"}, {"form": "DOH-2286", "field": "facility_operator_name", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 1010),
  ('ny.operator.title', null, 'operator', 'Who signs the permit', 'Camp operator — title', null, 'text', null, '[{"form": "DOH-367", "field": "operator_title", "part": "text"}, {"form": "DOH-367a", "field": "operator_title", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, true, 1020),
  ('ny.operator.revisions_added_by', 'DOH-2040', 'operator', 'Who signs the permit', 'If the plan was revised, who added the revisions?', null, 'text', null, '[{"form": "DOH-2040", "field": "revisions_added_by_camp_operator", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, false, 1030),
  ('ny.operator.revisions_added_on', 'DOH-2040', 'operator', 'Who signs the permit', 'Date the revisions were added', null, 'text', null, '[{"form": "DOH-2040", "field": "revisions_added_by_date", "part": "text"}]'::jsonb, 'ny.operator.revisions_added_by', null, null, '{}'::jsonb, false, 1040),
  ('ny.operator.signature_text', null, 'operator', 'Who signs the permit', 'Typed signature, if you want one printed', 'Leave blank to print an empty rule for a wet signature. The maps expect a wet signature by default.', 'text', null, '[{"form": "DOH-367", "field": "operator_signature", "part": "text"}, {"form": "DOH-367a", "field": "operator_signature", "part": "text"}, {"form": "DOH-2271", "field": "director_signature", "part": "text"}, {"form": "DOH-2286", "field": "facility_operator_signature", "part": "text"}]'::jsonb, null, null, null, '{}'::jsonb, false, 1050)
on conflict (question_key) do update set
  form_code    = excluded.form_code,    group_key    = excluded.group_key,
  group_label  = excluded.group_label,  label        = excluded.label,
  help_text    = excluded.help_text,    answer_kind  = excluded.answer_kind,
  choices      = excluded.choices,      renders      = excluded.renders,
  depends_on   = excluded.depends_on,   depends_on_value = excluded.depends_on_value,
  derives_from = excluded.derives_from, applies_when = excluded.applies_when,
  required     = excluded.required,
  sort_order   = excluded.sort_order;

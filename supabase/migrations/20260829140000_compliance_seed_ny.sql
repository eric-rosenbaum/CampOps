-- Seed: the New York profiles, the DOH-2040 plan-component template, and Westchester's
-- county-specific packet items.
--
-- The plan-component list is transcribed from DOH-2040 itself — the state's own Written Plan
-- Checklist — so it is authoritative and does not vary by county. Activity-specific components
-- carry applies_when so a camp without a rifle range is never shown a riflery section.
--
-- The Westchester rows are the county's additions on top of the state forms, taken from their
-- 2025 Original Permit Application packet.

create table if not exists compliance_plan_templates (
  code         text primary key,
  category     text not null,
  title        text not null,
  applies_when jsonb not null default '{}'::jsonb,
  sort_order   integer not null default 0
);
alter table compliance_plan_templates enable row level security;
drop policy if exists plan_templates_read on compliance_plan_templates;
create policy plan_templates_read on compliance_plan_templates for select to authenticated using (true);
drop policy if exists plan_templates_admin on compliance_plan_templates;
create policy plan_templates_admin on compliance_plan_templates for all
  using (is_platform_admin()) with check (is_platform_admin());

insert into compliance_plan_templates (code, category, title, applies_when, sort_order) values
  ('TOC', 'TABLE_OF_CONTENTS', 'Table of Contents', '{}'::jsonb, 0),
  ('PERS-01', 'PERSONNEL', 'Chain of Command', '{}'::jsonb, 10),
  ('PERS-02', 'PERSONNEL', 'Job Description', '{}'::jsonb, 20),
  ('PERS-03', 'PERSONNEL', 'Qualification/Reference Verification', '{}'::jsonb, 30),
  ('FAC-01', 'FACILITY_OPERATION', 'Water Supply', '{}'::jsonb, 40),
  ('FAC-02', 'FACILITY_OPERATION', 'On-Site Sewage Treatment System(s)', '{"sewage": "septic"}'::jsonb, 50),
  ('FAC-03', 'FACILITY_OPERATION', 'Lightning Risk Assessment', '{}'::jsonb, 60),
  ('FAC-04', 'FACILITY_OPERATION', 'Transportation', '{}'::jsonb, 70),
  ('FAC-05', 'FACILITY_OPERATION', 'Housing', '{}'::jsonb, 80),
  ('FAC-06', 'FACILITY_OPERATION', 'Food Protection', '{}'::jsonb, 90),
  ('FAC-07', 'FACILITY_OPERATION', 'General Operation/Maintenance', '{}'::jsonb, 100),
  ('FAC-08', 'FACILITY_OPERATION', 'Waterfront Facility Maintenance', '{"has_waterfront": "true"}'::jsonb, 110),
  ('FIRE-01', 'FIRE_SAFETY', 'Evacuation Plans; Assembly Area', '{}'::jsonb, 120),
  ('FIRE-02', 'FIRE_SAFETY', 'Fire Prevention', '{}'::jsonb, 130),
  ('FIRE-03', 'FIRE_SAFETY', 'Electrical Safety', '{}'::jsonb, 140),
  ('FIRE-04', 'FIRE_SAFETY', 'Alarm System & Smoke Detectors', '{}'::jsonb, 150),
  ('FIRE-05', 'FIRE_SAFETY', 'Fire Extinguishers', '{}'::jsonb, 160),
  ('FIRE-06', 'FIRE_SAFETY', 'Exits & Exit Signs', '{}'::jsonb, 170),
  ('FIRE-07', 'FIRE_SAFETY', 'Fire Drills and Log', '{}'::jsonb, 180),
  ('FIRE-08', 'FIRE_SAFETY', 'Submitted To Local Fire Department', '{}'::jsonb, 190),
  ('MED-01', 'MEDICAL_PLAN', 'Duties of Health Director/Personnel', '{}'::jsonb, 200),
  ('MED-02', 'MEDICAL_PLAN', 'Camp Infirmary Description', '{}'::jsonb, 210),
  ('MED-03', 'MEDICAL_PLAN', 'Medication Storage/Administration', '{}'::jsonb, 220),
  ('MED-04', 'MEDICAL_PLAN', 'Universal Precautions', '{}'::jsonb, 230),
  ('MED-05', 'MEDICAL_PLAN', 'Routine Health Care/Surveillance', '{}'::jsonb, 240),
  ('MED-06', 'MEDICAL_PLAN', 'Emergency/Outbreak Procedures', '{}'::jsonb, 250),
  ('MED-07', 'MEDICAL_PLAN', 'Camper Medical History/Screening', '{}'::jsonb, 260),
  ('MED-08', 'MEDICAL_PLAN', 'Existing Health Conditions/Restrictions', '{}'::jsonb, 270),
  ('MED-09', 'MEDICAL_PLAN', 'Medical Log', '{}'::jsonb, 280),
  ('MED-10', 'MEDICAL_PLAN', 'Illness, Injury & Abuse Reporting', '{}'::jsonb, 290),
  ('MED-11', 'MEDICAL_PLAN', 'Camp Sanitation', '{}'::jsonb, 300),
  ('ACT-01', 'ACTIVITIES_SUPERVISION', 'General Supervision; Discipline', '{}'::jsonb, 310),
  ('ACT-02', 'ACTIVITIES_SUPERVISION', 'Passive Activity Supervision', '{}'::jsonb, 320),
  ('ACT-03', 'ACTIVITIES_SUPERVISION', 'Supervision During Rest/Sleep Time', '{}'::jsonb, 330),
  ('ACT-04', 'ACTIVITIES_SUPERVISION', 'Between Activity Supervision', '{}'::jsonb, 340),
  ('ACT-05', 'ACTIVITIES_SUPERVISION', 'Supervision During Transportation', '{}'::jsonb, 350),
  ('ACT-06', 'ACTIVITIES_SUPERVISION', 'Supervision In Emergencies', '{}'::jsonb, 360),
  ('ACT-07', 'ACTIVITIES_SUPERVISION', 'Swimming', '{}'::jsonb, 370),
  ('ACT-08', 'ACTIVITIES_SUPERVISION', 'Buddy System', '{}'::jsonb, 380),
  ('ACT-09', 'ACTIVITIES_SUPERVISION', 'Off-Site & Wilderness Swimming', '{"offers_offsite_swim": "true"}'::jsonb, 390),
  ('ACT-10', 'ACTIVITIES_SUPERVISION', 'Stream Crossing/Incidental Immersion', '{}'::jsonb, 400),
  ('ACT-11', 'ACTIVITIES_SUPERVISION', 'Boating', '{"has_boating": "true"}'::jsonb, 410),
  ('ACT-12', 'ACTIVITIES_SUPERVISION', 'Horseback Riding', '{"has_equestrian": "true"}'::jsonb, 420),
  ('ACT-13', 'ACTIVITIES_SUPERVISION', 'Rope/Challenge Course', '{"has_challenge_course": "true"}'::jsonb, 430),
  ('ACT-14', 'ACTIVITIES_SUPERVISION', 'Archery', '{"has_archery": "true"}'::jsonb, 440),
  ('ACT-15', 'ACTIVITIES_SUPERVISION', 'Riflery', '{"has_riflery": "true"}'::jsonb, 450),
  ('ACT-16', 'ACTIVITIES_SUPERVISION', 'Out-of-Camp Trips', '{"offers_trips": "true"}'::jsonb, 460),
  ('ACT-17', 'ACTIVITIES_SUPERVISION', 'Other Activity Plans', '{}'::jsonb, 470),
  ('ACT-18', 'ACTIVITIES_SUPERVISION', 'Waterfront Swimming Supervision', '{"has_waterfront": "true"}'::jsonb, 480),
  ('TRN-01', 'STAFF_TRAINING', 'Outline of Curriculum', '{}'::jsonb, 490),
  ('TRN-02', 'STAFF_TRAINING', 'Tour of Camp', '{}'::jsonb, 500),
  ('TRN-03', 'STAFF_TRAINING', 'Description of Camp Hazards', '{}'::jsonb, 510),
  ('TRN-04', 'STAFF_TRAINING', 'Chain of Command', '{}'::jsonb, 520),
  ('TRN-05', 'STAFF_TRAINING', 'Supervision and Discipline', '{}'::jsonb, 530),
  ('TRN-06', 'STAFF_TRAINING', 'Child Abuse Recognition & Reporting', '{}'::jsonb, 540),
  ('TRN-07', 'STAFF_TRAINING', 'First Aid/Emergency Medical Response', '{}'::jsonb, 550),
  ('TRN-08', 'STAFF_TRAINING', 'Injury and Illness Reporting', '{}'::jsonb, 560),
  ('TRN-09', 'STAFF_TRAINING', 'Buddy System', '{}'::jsonb, 570),
  ('TRN-10', 'STAFF_TRAINING', 'Lost Swimmer Plan', '{}'::jsonb, 580),
  ('TRN-11', 'STAFF_TRAINING', 'Lost Camper Plan', '{}'::jsonb, 590),
  ('TRN-12', 'STAFF_TRAINING', 'Out-of-Camp Trips', '{"offers_trips": "true"}'::jsonb, 600),
  ('TRN-13', 'STAFF_TRAINING', 'Lightning Plan', '{}'::jsonb, 610),
  ('TRN-14', 'STAFF_TRAINING', 'Fire Safety/Fire Drill Procedures', '{}'::jsonb, 620),
  ('TRN-15', 'STAFF_TRAINING', 'Camp Evacuation Procedures', '{}'::jsonb, 630),
  ('TRN-16', 'STAFF_TRAINING', 'Activity Specific Training', '{}'::jsonb, 640),
  ('TRN-17', 'STAFF_TRAINING', 'Training Attendance Documentation', '{}'::jsonb, 650),
  ('ORI-01', 'CAMPER_ORIENTATION', 'Outline of Curriculum', '{}'::jsonb, 660),
  ('ORI-02', 'CAMPER_ORIENTATION', 'Tour of Camp', '{}'::jsonb, 670),
  ('ORI-03', 'CAMPER_ORIENTATION', 'Description of Camp Hazards', '{}'::jsonb, 680),
  ('ORI-04', 'CAMPER_ORIENTATION', 'Reporting of Illness & Injury Incidents', '{}'::jsonb, 690),
  ('ORI-05', 'CAMPER_ORIENTATION', 'Buddy System', '{}'::jsonb, 700),
  ('ORI-06', 'CAMPER_ORIENTATION', 'Lost Camper Plan', '{}'::jsonb, 710),
  ('ORI-07', 'CAMPER_ORIENTATION', 'Fire Drills & Evacuation', '{}'::jsonb, 720),
  ('ORI-08', 'CAMPER_ORIENTATION', 'Out-of-Camp Trips', '{"offers_trips": "true"}'::jsonb, 730),
  ('ORI-09', 'CAMPER_ORIENTATION', 'Lightning Plan', '{}'::jsonb, 740),
  ('ORI-10', 'CAMPER_ORIENTATION', 'Orientation Attendance Documentation', '{}'::jsonb, 750)
on conflict (code) do update
  set category = excluded.category, title = excluded.title,
      applies_when = excluded.applies_when, sort_order = excluded.sort_order;

-- ─── Profiles ────────────────────────────────────────────────────────────────
insert into compliance_profiles (code, name, jurisdiction_level, jurisdiction_code, reader, description, source_url, sort_order)
values
 ('NY-STATE', 'New York State (Subpart 7-2)', 'state', 'NY', 'lhd',
  'The State Sanitary Code rules every New York children''s camp must meet, enforced by your local health department.',
  'https://www.law.cornell.edu/regulations/new-york/title-10/chapter-I/part-7/subpart-7-2', 10),
 ('NY-WESTCHESTER', 'Westchester County Department of Health', 'county', 'NY-WESTCHESTER', 'lhd',
  'What Westchester County requires in the permit packet on top of the state forms.',
  'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 20)
on conflict (code) do update
  set name = excluded.name, description = excluded.description,
      source_url = excluded.source_url, sort_order = excluded.sort_order;

-- ─── Westchester county requirements ─────────────────────────────────────────
with p_wc as (select id from compliance_profiles where code = 'NY-WESTCHESTER')
insert into compliance_requirements
  (profile_id, req_code, label, summary, category, evidence_type, evidence_rule,
   evidence_hint, frequency, applies_when, citation, citation_url, verify_status, sort_order)
values
  ((select id from p_wc), 'WC-01', 'Application for an Original Permit to Operate a Children''s Camp', 'The county''s own application form, signed and dated, with email contact.', 'permit', 'document', '{}'::jsonb, 'Submit with the permit package', 'once', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 0),
  ((select id from p_wc), 'WC-02', 'Certificate of Resolution for Authorization', 'Required only if the camp is owned by a corporation. Must be notarised.', 'permit', 'document', '{}'::jsonb, 'Submit with the permit package', 'once', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 10),
  ((select id from p_wc), 'WC-03', 'Non-refundable application fee of $200 (or fee exemption)', 'Cheque or money order to Westchester County Health Department, or the credit-card authorisation form. Cash is not accepted.', 'permit', 'manual', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 20),
  ((select id from p_wc), 'WC-04', 'Proof of Workers'' Compensation and Disability insurance', 'An ACORD certificate is NOT accepted. Use C-105.2, U-26.3, SI-12 or CE-200 for workers'' comp and the equivalent disability form.', 'permit', 'document', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 30),
  ((select id from p_wc), 'WC-05', 'Prospective Camp Director Certified Statement (DOH-2271)', 'The state director attestation form, completed and signed by the camp director.', 'personnel', 'document', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 40),
  ((select id from p_wc), 'WC-06', 'State Central Register database check (LDSS-3370)', 'The SCR check form for the director, submitted with the packet.', 'personnel', 'screening', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 50),
  ((select id from p_wc), 'WC-07', 'Children''s Camp Facility and Camp Description (DOH-367)', 'The state facility and staff description form covering the camp, its programme and its senior staff.', 'permit', 'document', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 60),
  ((select id from p_wc), 'WC-08', 'Children''s Camp Additional Staff Qualifications (DOH-367a)', 'Overflow sheet listing staff qualifications by activity where DOH-367 runs out of room.', 'personnel', 'document', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 70),
  ((select id from p_wc), 'WC-09', 'Children''s Camp Amusement Device Survey (HD 91)', 'A Westchester-specific survey of any amusement devices on the property.', 'facility', 'document', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 80),
  ((select id from p_wc), 'WC-10', 'Safety Plan Attestations (Director, Health Director, Trip Leader)', 'Three signed attestations confirming each person has read and will follow the camp safety plan.', 'personnel', 'attestation', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 90),
  ((select id from p_wc), 'WC-11', 'Department of Emergency Services O.E.M. Camp Contact Form', 'Emergency contact details filed with Westchester''s Office of Emergency Management.', 'records', 'document', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 100),
  ((select id from p_wc), 'WC-12', 'Children''s Camp Self-Inspection Form', 'Certifies that a pre-operation self-inspection was carried out before opening.', 'facility', 'document', '{}'::jsonb, 'Before opening', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 110),
  ((select id from p_wc), 'WC-13', 'Complete Children''s Camp Safety Plan and appropriate appendix', 'The full written safety plan covering every component on DOH-2040, plus the activity appendices for the activities this camp runs.', 'plan', 'plan_section', '{}'::jsonb, 'Submit with the permit package', 'annual', '{}'::jsonb, 'Westchester County Department of Health — Children''s Camp Application (2025)', 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator', 'verified', 120)
on conflict (profile_id, req_code) do update
  set label = excluded.label, summary = excluded.summary, category = excluded.category,
      evidence_type = excluded.evidence_type, evidence_hint = excluded.evidence_hint,
      frequency = excluded.frequency, citation = excluded.citation,
      citation_url = excluded.citation_url, verify_status = excluded.verify_status,
      sort_order = excluded.sort_order;

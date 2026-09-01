-- Nine state obligations the module was silent on, ten more forms, and a source on every rule.
--
-- Three groups, and each was missing for a different reason.
--
-- The construction rules (NY-0413, NY-0414) never came up because no camp modelled a build. The
-- 60-day notice is not a deadline a camp can catch up on: it starts before ground is broken.
--
-- The reporting rules (NY-0810, NY-0809) had nowhere to live until compliance_incidents existed.
-- 7-2.8(d) is the list of what counts, verbatim, and the VPD letter is a 2026 addition -- which
-- is exactly the case the What's new tab was built for.
--
-- The people rules (NY-0520, NY-0521, NY-0522) sit on the new screening and training evidence
-- types. Working papers for 14-to-17s catch camps constantly because the hire is legal and the
-- paperwork is not.
--
-- The last statement is small and matters: the county serves its documents from a CMS path with
-- the approval date in the filename, so every one of those links dies at the next amendment.
-- Marking them url_stable = false makes the UI offer our archived copy instead.

begin;

with p as (select id from compliance_profiles where code = 'NY-STATE'),
     a as (select id from compliance_authorities where code = 'WESTCHESTER-DOH'),
     s72 as (select id from compliance_sources where source_key = 'subpart_7_2'),
     svpd as (select id from compliance_sources where source_key = 'vpd_letter'),
     ssor as (select id from compliance_sources where source_key = 'sor_factsheet'),
     sed as (select id from compliance_sources where source_key = 'nysed_working_papers')
insert into compliance_requirements
 (profile_id, authority_id, req_code, label, summary, category, evidence_type, evidence_rule,
  evidence_hint, frequency, applies_when, citation, citation_url, verify_status, sort_order,
  source_id, source_checked_on, form_codes, holds_personal_records)
values
 ((select id from p),(select id from a),'NY-0413','Give 60 days notice before you build or convert',
  'No person shall modify, develop or convert a property for use as a children''s camp without first notifying the permit-issuing official at least 60 days before construction commences, giving the property name and location, a description of the planned facilities and contact details. Construction may not start before the plans are approved.',
  'facility','document','{}'::jsonb,
  'The notice, and the approval you received.','on_event','{}'::jsonb,
  '10 NYCRR 7-2.12','https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.12','verified',412,
  (select id from s72),'2026-08-31','{}',false),
 ((select id from p),(select id from a),'NY-0414','File an architect or engineer certificate before occupancy',
  'A written statement signed by a registered architect or professional engineer certifying construction compliance with the Uniform Code is submitted to the permit-issuing official before occupancy of all new construction.',
  'facility','document','{}'::jsonb,
  'The signed certificate.','on_event','{}'::jsonb,
  '10 NYCRR 7-2.12','https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.12','verified',414,
  (select id from s72),'2026-08-31','{}',false),
 ((select id from p),(select id from a),'NY-0403','Affirm each year that your safety plan is still current',
  'The plan is reviewed annually and updated as required. An updated plan is submitted. In any year no update is required, the operator must submit written affirmation to the permit-issuing official that the approved plan remains up to date and complete.',
  'plan','attestation','{}'::jsonb,
  'The updated plan, or the written affirmation.','annual','{}'::jsonb,
  '10 NYCRR 7-2.4(c)(1)','https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.4','verified',403,
  (select id from s72),'2026-08-31','{"DOH-367"}',false),
 ((select id from p),(select id from a),'NY-0404','Post the permit where the public can see it',
  'The permit is kept on the premises it covers and posted in a conspicuous place, clearly visible to the public, and available for inspection at all times.',
  'permit','permit','{"license_type":"health_permit"}'::jsonb,
  'Record where it is posted.','annual','{}'::jsonb,
  '10 NYCRR 7-2.4; Westchester §873.301(4)',
  'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.4','verified',404,
  (select id from s72),'2026-08-31','{}',false),
 ((select id from p),(select id from a),'NY-0810','Report reportable incidents within 24 hours',
  'Injuries and illnesses resulting in death, resuscitation, hospital admission or the administration of epinephrine; rabies exposures; eye, head, neck or spine injuries referred to hospital; fractures and dislocations; lacerations needing sutures, staples or glue; second or third degree burns to 5% or more; abuse allegations; and suspected water-, food- or air-borne illness.',
  'medical','incident_reporting','{}'::jsonb,
  'Each reportable incident, and when it was reported.','ongoing','{}'::jsonb,
  '10 NYCRR 7-2.8(d)','https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.8','verified',810,
  (select id from s72),'2026-08-31','{}',false),
 ((select id from p),(select id from a),'NY-0809','Report vaccine-preventable disease immediately',
  'Camp operators are required to immediately report any suspected or confirmed vaccine-preventable disease to the permit-issuing official and the city or county health department.',
  'medical','incident_reporting','{}'::jsonb,
  'The report, and when it was made.','ongoing','{}'::jsonb,
  'NYSDOH letter to camp operators, 30 March 2026',
  'https://www.health.ny.gov/environmental/outdoors/camps/docs/vpd_camp_letter.pdf','verified',809,
  (select id from svpd),'2026-08-31','{}',false),
 ((select id from p),(select id from a),'NY-0520','Hold working papers for staff aged 14 to 17',
  'A student aged 14 to 17 needs an employment certificate to work in New York. The employer obtains it before hiring and files it at the place of employment, readily accessible to anyone authorised by law to examine it.',
  'personnel','screening','{"kind":"employment_certificate"}'::jsonb,
  'That the certificate is on file, per person.','annual','{}'::jsonb,
  'NY Labor Law §132; NYSED employment of minors',
  'https://www.nysed.gov/student-support-services/employment-minors-working-papers','verified',520,
  (select id from sed),'2026-08-31','{}',false),
 ((select id from p),(select id from a),'NY-0521','Deliver staff training and record who attended',
  'The written plan must cover the staff training curriculum, and DOH-2040 lists training attendance documentation as a component in its own right.',
  'training','training','{"kind":"staff_orientation"}'::jsonb,
  'The session, the date, and who attended.','annual','{}'::jsonb,
  '10 NYCRR 7-2.5(n); DOH-2040',
  'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.5','verified',521,
  (select id from s72),'2026-08-31','{"DOH-2040"}',false),
 ((select id from p),(select id from a),'NY-0522','Deliver camper orientation and record attendance',
  'DOH-2040 lists camper orientation attendance documentation as a plan component.',
  'training','training','{"kind":"camper_orientation"}'::jsonb,
  'The session, the date, and attendance.','per_session','{}'::jsonb,
  '10 NYCRR 7-2.5(n); DOH-2040',
  'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.5','verified',522,
  (select id from s72),'2026-08-31','{"DOH-2040"}',false)
on conflict (profile_id, req_code) do nothing;

-- Point the existing sex offender requirement at the screening evidence it now has.
update compliance_requirements
   set evidence_type = 'screening',
       evidence_rule = '{"kind":"dcjs_sor"}'::jsonb,
       source_id = (select id from compliance_sources where source_key = 'sor_factsheet'),
       source_checked_on = '2026-08-31',
       citation_url = 'https://www.health.ny.gov/environmental/outdoors/camps/nys_child_safety_act.htm'
 where req_code = 'NY-0504';

update compliance_requirements
   set evidence_type = 'permit', evidence_rule = '{"license_type":"health_permit"}'::jsonb
 where req_code = 'WC-01';

-- Source URLs for everything already in the catalog, by profile.
update compliance_requirements r
   set source_id = s.id, source_checked_on = '2026-08-31'
  from compliance_profiles p, compliance_sources s
 where r.profile_id = p.id and r.source_id is null
   and ((p.code = 'NY-STATE'       and s.source_key = 'subpart_7_2')
     or (p.code = 'NY-POOL'        and s.source_key = 'subpart_6_1')
     or (p.code = 'NY-BEACH'       and s.source_key = 'subpart_6_2')
     or (p.code = 'NY-WESTCHESTER' and s.source_key = 'wcdoh_packet'));

-- The three state forms the catalog never knew about, and the eight incident forms.
with a as (select id from compliance_authorities where code = 'WESTCHESTER-DOH')
insert into compliance_authority_forms
 (authority_id, designation, title, revision, source_url, obtain_note, fillable, issued_by,
  camp_supplied, is_active, is_incident_form, url_stable, source_checked_on, sort_order)
values
 ((select id from a),'DOH-3915','Application for a Permit to Operate','',
  'https://www.health.ny.gov/forms/doh-3915.pdf',
  'The state application. Westchester substitutes its own — confirm which they want.',
  true,'NYSDOH',false,true,false,true,'2026-08-31',12),
 ((select id from a),'DOH-2135','Corporation Officers and Partners','',
  'https://www.health.ny.gov/forms/doh-2135.pdf',
  'Only if the camp is owned or operated by a corporation or partnership.',
  true,'NYSDOH',false,true,false,true,'2026-08-31',14),
 ((select id from a),'DOH-2249','Plan Review Fee Determination Schedule','',
  'https://www.health.ny.gov/forms/doh-2249.pdf',
  'Only for new building or bathing facility construction, or major renovation.',
  true,'NYSDOH',false,true,false,true,'2026-08-31',16),
 ((select id from a),'DOH-61a','Children''s Camp Injury Report','2/03',
  'https://www.nyc.gov/assets/doh/downloads/pdf/camp/camp-injury-rptform.pdf',
  'Filed with the county within 24 hours.',false,'NYSDOH',false,true,true,true,'2026-08-31',300),
 ((select id from a),'DOH-61b','Illness Outbreak Report','',
  'https://www.nyc.gov/assets/doh/downloads/pdf/camp/camp-ill-outbk-rptform.pdf',
  'Filed with the county within 24 hours.',false,'NYSDOH',false,true,true,true,'2026-08-31',310),
 ((select id from a),'NYS-61','Allegation of Abuse Report','',
  'https://www.nyc.gov/assets/doh/downloads/pdf/camp/camp-alleg-of-abuse-rptform.pdf',
  'Filed with the county within 24 hours.',false,'NYSDOH',false,true,true,true,'2026-08-31',320),
 ((select id from a),'NYS-61 Fire','Fire Report','',
  'https://www.nyc.gov/assets/doh/downloads/pdf/camp/camp-fire-rptform.pdf',
  'Filed with the county within 24 hours.',false,'NYSDOH',false,true,true,true,'2026-08-31',330),
 ((select id from a),'NYS-61h','Multiple Victim Injury Report','',
  'https://www.nyc.gov/assets/doh/downloads/pdf/camp/camp-mvInjury-rptform.pdf',
  'Filed with the county within 24 hours.',false,'NYSDOH',false,true,true,true,'2026-08-31',340),
 ((select id from a),'NYS-61 Rabies','Potential Rabies Exposure Report','',
  'https://www.nyc.gov/assets/doh/downloads/pdf/camp/camp-pot-rabies-exp-rptform.pdf',
  'Report immediately.',false,'NYSDOH',false,true,true,true,'2026-08-31',350),
 ((select id from a),'DOH-61e','Epinephrine Administration Report','3/18',
  'https://www.nyc.gov/assets/doh/downloads/pdf/camp/camp-epine-admin-rptform.pdf',
  'Filed with the county within 24 hours.',false,'NYSDOH',false,true,true,true,'2026-08-31',360)
on conflict do nothing;

-- The county code URL carries its approval date and breaks every amendment.
update compliance_authority_forms set url_stable = false, source_checked_on = '2026-08-31'
 where bundled_path like '%westchester%';

commit;

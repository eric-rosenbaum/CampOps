-- The sources behind the requirements, and the fingerprints that tell us when they move.
--
-- Until now a requirement asserted an obligation and cited nothing. That is fine while one person
-- holds the whole regulation in their head and fatal the moment a camp asks "says who?" — which
-- is the first thing a director asks, and the only question that matters when a sanitarian
-- disagrees with the app. So every requirement now points at a source: the regulation, the county
-- packet, the state factsheet.
--
-- `url_stable` is the load-bearing column. regs.health.ny.gov and health.ny.gov have kept their
-- URLs for years. Westchester serves its code and its packet out of a CMS image directory with
-- the approval date in the filename ("CHAPTER 873 FINAL VERSION APPROVED 8-5-25.pdf"), so that
-- link is dead the day they approve the next revision. Those get archived_path instead and the UI
-- offers our copy rather than a link that will 404 in front of a customer.
--
-- compliance_source_versions is the other half: a sha256 of the document as we read it, plus what
-- changed and who it lands on. A changed fingerprint is what feeds the What's new tab. `affects`
-- carries either req_codes, an applies_when expression, or both -- a camp is told about the
-- August sanitary code amendment only if it has a pool or a beach.

begin;

alter table compliance_requirements drop constraint if exists compliance_requirements_evidence_type_check;
alter table compliance_requirements add constraint compliance_requirements_evidence_type_check
  check (evidence_type = any (array['document','certification','screening','training','inspection',
    'drill','temp_log','pool_log','water_sample','asset_expiry','plan_section','attestation',
    'roster','manual','insurance','permit','incident_reporting']));

-- ── Sources ──
insert into compliance_sources (source_key, title, issuer, kind, url, url_stable, archived_path, jurisdiction_code, sort_order) values
 ('ch873','Westchester County Sanitary Code, Chapter 873','Westchester County Board of Health','code',
  'https://health.westchestercountyny.gov/images/stories/Environmental%20Forms/CHAPTER%20873%20FINAL%20VERSION%20APPROVED%208-5-25.pdf',
  false,'docs/compliance/proofs/wc-chapter-873-2025.pdf','WESTCHESTER',10),
 ('wcdoh_camp_page','Westchester camp operator page','Westchester County DOH','guidance',
  'https://health.westchestercountyny.gov/forms-and-permits/camp-operator',true,
  'docs/compliance/sources/webpages/wcdoh-camp-operator-page.htm','WESTCHESTER',20),
 ('wcdoh_packet','Children''s Camp Original Permit Application Package','Westchester County DOH','packet',
  'https://health.westchestercountyny.gov/images/stories/Environmental%20Forms/Camp/Childrens_Camp_Original_Operation_Application_2025_.pdf',
  false,'public/forms/ny/westchester-camp-application.pdf','WESTCHESTER',30),
 ('subpart_7_2','10 NYCRR Subpart 7-2, Children''s Camps','NYSDOH','regulation',
  'https://regs.health.ny.gov/content/subpart-7-2-childrens-camps',true,
  'docs/compliance/sources/regulations/subpart-7-2/','NY',40),
 ('subpart_6_1','10 NYCRR Subpart 6-1, Swimming Pools','NYSDOH','regulation',
  'https://regs.health.ny.gov/content/subpart-6-1-swimming-pools',true,
  'docs/compliance/sources/regulations/subpart-6-1/','NY',50),
 ('subpart_6_2','10 NYCRR Subpart 6-2, Bathing Beaches','NYSDOH','regulation',
  'https://regs.health.ny.gov/content/subpart-6-2-bathing-beaches',true,
  'docs/compliance/sources/regulations/subpart-6-2/','NY',60),
 ('subpart_14_1','10 NYCRR Subpart 14-1, Food Service Establishments','NYSDOH','regulation',
  'https://regs.health.ny.gov/content/subpart-14-1-food-service-establishments',true,
  'docs/compliance/sources/regulations/subpart-14-1/','NY',70),
 ('subpart_5_1','10 NYCRR Subpart 5-1, Public Water Supplies','NYSDOH','regulation',
  'https://regs.health.ny.gov/content/subpart-5-1-public-water-supplies',true,
  'docs/compliance/sources/regulations/subpart-5-1/','NY',80),
 ('sor_factsheet','NYS Sex Offender Registry Search Procedures for Children''s Camps','NYSDOH','factsheet',
  'https://www.health.ny.gov/environmental/outdoors/camps/nys_child_safety_act.htm',true,
  'docs/compliance/sources/wcdoh/CampNYSChildSafetyAct.pdf','NY',90),
 ('amuse_factsheet','Amusement Devices and Similar Equipment at Children''s Camps','NYSDOH / NYSDOL','factsheet',
  'https://www.health.ny.gov/environmental/outdoors/camps/docs/amuse.pdf',true,
  'docs/compliance/sources/nysdoh/amuse.pdf','NY',100),
 ('pub_3603','Requirements for Children''s Camps in New York State','NYSDOH','guidance',
  'https://www.health.ny.gov/publications/3603/',true,
  'docs/compliance/sources/nysdoh/pub-3603-requirements.htm','NY',110),
 ('vpd_letter','Letter to camp operators, vaccine-preventable diseases','NYSDOH','guidance',
  'https://www.health.ny.gov/environmental/outdoors/camps/docs/vpd_camp_letter.pdf',true,
  'docs/compliance/sources/nysdoh/vpd_camp_letter.pdf','NY',120),
 ('safety_plan_template','Children''s Camp Safety Plan Template','NYSDOH','guidance',
  'https://www.health.ny.gov/environmental/outdoors/camps/docs/childrens_camp_safety_plan.docx',true,
  'docs/compliance/sources/nysdoh/childrens_camp_safety_plan.docx','NY',130),
 ('nysed_working_papers','Employment of Minors (Working Papers)','NYSED','guidance',
  'https://www.nysed.gov/student-support-services/employment-minors-working-papers',true,
  'docs/compliance/sources/webpages/nysed-working-papers.htm','NY',140)
on conflict (source_key) do nothing;

-- ── Versions ──
-- The two entries with a populated `affects` are the ones a 2026 camp has to act on. The other
-- two record that we read the document and it had not moved, which is the more common and more
-- reassuring answer.
insert into compliance_source_versions (source_id, sha256, retrieved_at, effective_date, revision_label, change_summary, affects)
select s.id, v.sha, '2026-08-31'::timestamptz, v.eff::date, v.rev, v.summary, v.affects::jsonb
from (values
 ('ch873','8b17c4f30e44a219','2025-08-05','Approved 5 Aug 2025',
  'Article XII rewritten: AED and collaborative agreement required at every pool and beach; new pool signage, 911 phone and supervision levels.',
  '{"req_codes":["WC-24","WC-25","WC-26"],"applies_when":{"any_of":{"has_pool":"true","has_waterfront":"true"}}}'),
 ('vpd_letter','3c91aa02be71d4f8','2026-03-30','30 March 2026',
  'Camps are required to immediately report any suspected or confirmed vaccine-preventable disease to the permit-issuing official and the county.',
  '{"req_codes":["NY-0809"],"applies_when":{}}'),
 ('subpart_7_2','5d2e7719ab30c611','2016-06-22','Effective 22 June 2016','No change since the text we encoded.','{}'),
 ('wcdoh_packet','a4471bd9c0e2f183','2025-03-01','2025 packet','Thirteen items, $200 fee, unchanged.','{}')
) as v(key, sha, eff, rev, summary, affects)
join compliance_sources s on s.source_key = v.key
on conflict do nothing;

commit;

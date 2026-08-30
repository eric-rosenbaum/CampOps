-- When a document is due, and where its guidance actually lives.
--
-- TWO FIXES.
--
-- 1. A document had no due date. The deadline was sitting on the requirement that asks for it
--    (WC-07 carries "60 days before opening"), but nothing connected the form to the
--    requirement, so the Reviewers page could show a camp a form with no sense of when it is
--    owed. The link is explicit rather than matched on the designation appearing in a label,
--    for the same reason the plan row keys are explicit: a fuzzy join between two curated data
--    sets drifts.
--
-- 2. The county's "published guidance" link was a 404. The host moved from
--    health.westchestergov.com to health.westchestercountyny.gov and the path changed. Checked
--    both: the old one 301s to a page that no longer exists, the new one is live. Keeping the
--    link matters -- it is how a camp checks our reading against the county's own words, which
--    is worth more than the small risk of it rotting again.
--
--    While confirming it, the county's own page states they inspect "at least twice yearly",
--    which is more specific than what the visit schedule said, so that is corrected too.

alter table compliance_authority_forms
  add column if not exists requirement_code text;

comment on column compliance_authority_forms.requirement_code is
  'The req_code whose deadline governs this document. Explicit, never derived from the title.';

update compliance_authority_forms set requirement_code = 'WC-07' where designation = 'DOH-367';
update compliance_authority_forms set requirement_code = 'WC-08' where designation = 'DOH-367a';
update compliance_authority_forms set requirement_code = 'WC-13' where designation = 'DOH-2040';
update compliance_authority_forms set requirement_code = 'WC-05' where designation = 'DOH-2271';

-- The county application packet and its sub-forms all ride the same 60-day application clock.
update compliance_authority_forms set requirement_code = 'WC-01'
 where requirement_code is null
   and title in (
     'Children''s Camp Original Permit Application Package',
     'Application for Original Children''s Camp Permit'
   );
update compliance_authority_forms set requirement_code = 'WC-02' where title = 'Certificate of Resolution for Authorization';
update compliance_authority_forms set requirement_code = 'WC-03' where title = 'Credit Card Payment Authorization';
update compliance_authority_forms set requirement_code = 'WC-09' where designation = 'HD-91';
update compliance_authority_forms set requirement_code = 'WC-10' where title like 'Safety Plan Attestations%';
update compliance_authority_forms set requirement_code = 'WC-12' where title = 'Children''s Camp Self-Inspection Form';
update compliance_authority_forms set requirement_code = 'WC-04' where title like 'Proof of Workers%';
update compliance_authority_forms set requirement_code = 'WC-06' where designation = 'LDSS-3370';
update compliance_authority_forms set requirement_code = 'WC-11' where title like '%O.E.M. Camp Contact Form';

update compliance_authorities
   set source_url = 'https://health.westchestercountyny.gov/forms-and-permits/camp-operator',
       visit_schedule = 'At least twice a year, which their own guidance states. One visit before you open, arranged when your permit application is processed, and at least one more while you are operating. Operational visits are unannounced.'
 where code = 'WESTCHESTER-DOH';

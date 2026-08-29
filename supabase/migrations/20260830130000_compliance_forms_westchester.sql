-- The rest of the official documents each party expects.
--
-- The finding that shaped this: Westchester publishes no standalone camp sub-forms. The
-- amusement device survey, the attestations, the OEM contact form and a blank LDSS-3370 exist
-- only as pages inside the county's application packet. So the honest way to hold them is to
-- bundle the packet once and point at the pages, rather than list six forms as "missing" when
-- a camp already has all of them in the file we ship.
--
-- Two copies hosted by other New York counties were found and deliberately rejected: one was
-- pre-filled with that county's own agency code, which a camp filing it would submit by
-- mistake, and the other was a superseded revision. A form that is nearly right is worse than
-- an honest gap on a document somebody signs.

alter table compliance_authority_forms
  add column if not exists page_ref text;
comment on column compliance_authority_forms.page_ref is
  'Which pages of bundled_path hold this form, when bundled_path is a multi-form packet.';

-- The two county packets, whole.
insert into compliance_authority_forms
  (authority_id, designation, title, revision, bundled_path, page_ref, issued_by, source_url, obtain_note, fillable, sort_order)
select a.id, v.designation, v.title, v.revision, v.bundled, v.pages, v.issued_by, v.url, v.obtain, v.fillable, v.ord
from (values
  ('WESTCHESTER-DOH', null,
   'Children''s Camp Original Permit Application Package', '2025 packet',
   '/forms/ny/westchester-camp-application.pdf', null,
   'Westchester County Department of Health',
   'https://health.westchestercountyny.gov/forms-and-permits/camp-operator',
   null, false, 1),

  ('WESTCHESTER-DOH', null,
   'Permit Renewal Application: Children''s Camp', '2025 packet',
   '/forms/ny/westchester-camp-renewal-application.pdf', null,
   'Westchester County Department of Health',
   'https://health.westchestercountyny.gov/forms-and-permits/camp-operator',
   'Use this instead of the original application once you hold a permit.', false, 2),

  -- Sub-forms that live inside the packet. Bundled, with the pages named.
  ('WESTCHESTER-DOH', null,
   'Application for Original Children''s Camp Permit', null,
   '/forms/ny/westchester-camp-application.pdf', 'pages 4 to 5',
   'Westchester County Department of Health', null, null, false, 60),

  ('WESTCHESTER-DOH', null,
   'Certificate of Resolution for Authorization', null,
   '/forms/ny/westchester-camp-application.pdf', 'page 6',
   'Westchester County Department of Health', null,
   'Only if the camp is run by a corporation, association or municipality.', false, 61),

  ('WESTCHESTER-DOH', null,
   'Credit Card Payment Authorization', null,
   '/forms/ny/westchester-camp-application.pdf', 'page 7',
   'Westchester County Department of Health', null,
   'For the $200 application fee, if you are not paying by cheque.', false, 62),

  ('WESTCHESTER-DOH', 'HD-91',
   'Children''s Camp Amusement Device Survey', '(3/18/2019)',
   '/forms/ny/westchester-camp-application.pdf', 'page 12',
   'Westchester County Department of Health', null, null, false, 63),

  ('WESTCHESTER-DOH', null,
   'Safety Plan Attestations: Camp Director, Health Director, Trip Leader', null,
   '/forms/ny/westchester-camp-application.pdf', 'pages 13 to 15',
   'Westchester County Department of Health', null,
   'Three separate signature pages, one per role.', false, 64),

  ('WESTCHESTER-DOH', null,
   'Children''s Camp Self-Inspection Form', null,
   null, null,
   'Westchester County Department of Health', null,
   'Not published anywhere. Item 12 of the county checklist asks for it, but it is in neither packet and NYS DOH has no equivalent. Request it from the Bureau of Public Health Protection, 11 Martine Ave, White Plains, (914) 864-7330.',
   false, 65),

  ('WESTCHESTER-DOH', null,
   'Proof of Workers'' Compensation and Disability insurance', null,
   null, null,
   'Your insurer, or the NYS Workers'' Compensation Board', 'http://www.wcb.ny.gov',
   'Issued by your insurer or the Workers'' Compensation Board, not a blank you fill in. Forms C-105.2, U-26.3, SI-12, GSI-105.2, CE-200, DB-120.1 or DB-155 depending on your cover.',
   false, 66),

  ('NY-SCR', 'LDSS-3370',
   'Statewide Central Register Database Check', '(Rev. 12/2019), DCCS version',
   '/forms/ny/westchester-camp-application.pdf', 'pages 17 to 20',
   'NYS Office of Children and Family Services',
   'https://ocfs.ny.gov/forms/ldss/OCFS-LDSS-3370-DCCS.pdf',
   'A blank of the current revision is in the county application packet. Copies posted by other counties are often pre-filled with their agency code or are an older revision, so use the packet copy or the OCFS original.',
   false, 10),

  ('WESTCHESTER-OEM', null,
   'Department of Emergency Services O.E.M. Camp Contact Form', null,
   '/forms/ny/westchester-camp-application.pdf', 'pages 21 to 22',
   'Westchester County Department of Emergency Services', null, null, false, 10)
) as v(auth_code, designation, title, revision, bundled, pages, issued_by, url, obtain, fillable, ord)
join compliance_authorities a on a.code = v.auth_code
where not exists (
  select 1 from compliance_authority_forms f
   where f.authority_id = a.id and f.title = v.title
);

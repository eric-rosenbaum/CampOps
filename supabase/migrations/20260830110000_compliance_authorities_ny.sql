-- The parties that review a New York children's camp in Westchester County.
--
-- The assignment principle throughout: an authority is WHO RECEIVES OR CHECKS THIS, not who
-- wrote the rule. Almost every one of the 78 state rules is enforced by the county health
-- department, because that is who holds the permit and who walks the property. The state
-- writes the code and publishes the forms; it does not normally visit.
--
-- Only a handful of requirements generate an obligation toward somebody else, and those are
-- exactly the ones worth surfacing, because they are the ones a camp forgets.

alter table compliance_authority_forms
  add column if not exists issued_by text;
comment on column compliance_authority_forms.issued_by is
  'Who publishes the form, when that differs from who you file it with. The DOH-* forms are the state''s but are filed with the county.';

-- ─── The authorities ────────────────────────────────────────────────────────
insert into compliance_authorities
  (profile_id, code, name, short_name, level, visits_site, visit_schedule, scope, contact_note, source_url, sort_order)
select p.id, v.code, v.name, v.short_name, v.level, v.visits, v.sched, v.scope, v.contact, v.url, v.ord
from (values
  ('NY-WESTCHESTER', 'WESTCHESTER-DOH',
   'Westchester County Department of Health',
   'County Health',
   'county', true,
   'Before you open, and at least once more while you are operating. The pre-opening visit is arranged when your permit application is processed; operational visits are unannounced.',
   'Holds your permit and enforces the state children''s camp code on site: the written safety plan, staff qualifications, water, sewage, food service, the pool and waterfront, fire safety and your records.',
   'Your permit application names your case contact at the district office.',
   'https://health.westchestergov.com/childrens-camps', 10),

  ('NY-STATE', 'NY-DOH-STATE',
   'New York State Department of Health',
   'State Health',
   'state', false,
   'Does not normally visit a camp. Acts on appeals, variances and enforcement referred by your county.',
   'Writes the children''s camp code (10 NYCRR Subpart 7-2) and publishes the DOH forms. Your county enforces it on their behalf, so in practice everything goes through the county.',
   null,
   'https://www.health.ny.gov/environmental/outdoors/camps/', 20),

  ('NY-STATE', 'FIRE-DEPT',
   'Your local fire department',
   'Fire Department',
   'municipal', true,
   'Varies by municipality. The code requires you to send them your fire safety plan; whether they inspect is a local decision, so ask.',
   'The fire safety portion of your written plan, your evacuation routes and assembly area, and anything your municipality inspects under the fire code.',
   'Contact your municipality''s fire department directly. Not held by the platform.',
   null, 30),

  ('NY-STATE', 'NY-SCR',
   'NYS Office of Children and Family Services, State Central Register',
   'State Central Register',
   'state', false,
   'Never visits. You submit clearance requests and wait for a result, so start early enough that a slow return does not hold up your permit.',
   'Child abuse and maltreatment register clearances for your camp director and staff.',
   null,
   'https://ocfs.ny.gov/programs/childcare/assets/docs/forms/ocfs-3370.pdf', 40),

  ('NY-WESTCHESTER', 'WESTCHESTER-OEM',
   'Westchester County Department of Emergency Services',
   'Emergency Services',
   'county', false,
   'Never visits. They want a current contact form on file before the season so they can reach you in an emergency.',
   'Who to call at your camp during an emergency, and how.',
   null, null, 50),

  ('NY-STATE', 'JUSTICE-CENTER',
   'NYS Justice Center for the Protection of People with Special Needs',
   'Justice Center',
   'state', false,
   'Never visits a camp in the ordinary course. They receive staff exclusion checks and reportable incidents, on the clock.',
   'Staff screening against the Staff Exclusion List, mandated reporter training, and immediate reporting of reportable incidents. Applies only to camps serving campers with disabilities.',
   null,
   'https://www.justicecenter.ny.gov/', 60)
) as v(profile_code, code, name, short_name, level, visits, sched, scope, contact, url, ord)
join compliance_profiles p on p.code = v.profile_code
on conflict (profile_id, code) do update set
  name = excluded.name, short_name = excluded.short_name, level = excluded.level,
  visits_site = excluded.visits_site, visit_schedule = excluded.visit_schedule,
  scope = excluded.scope, contact_note = excluded.contact_note,
  source_url = excluded.source_url, sort_order = excluded.sort_order;

-- ─── Which party receives or checks each requirement ────────────────────────
-- Default: the county. They hold the permit and they are the ones who walk the property, so
-- unless a rule creates an obligation toward somebody else, the county is who asks to see it.
update compliance_requirements r
   set authority_id = a.id
  from compliance_authorities a
       join compliance_profiles ap on ap.id = a.profile_id
 where a.code = 'WESTCHESTER-DOH'
   and r.authority_id is null;

-- The exceptions: rules whose whole point is that something goes to somebody else. These are
-- the ones a camp forgets, which is exactly why they deserve their own heading.

-- "…send it to the fire department…" is the distinguishing act in this rule.
update compliance_requirements r set authority_id = a.id
  from compliance_authorities a where a.code = 'FIRE-DEPT' and r.req_code = 'NY-0516';

-- Register clearances are submitted to OCFS and waited on; the county only sees the result.
update compliance_requirements r set authority_id = a.id
  from compliance_authorities a where a.code = 'NY-SCR'
   and r.req_code in ('NY-0502', 'WC-06');

-- A contact form filed with county Emergency Services, nothing to do with the health permit.
update compliance_requirements r set authority_id = a.id
  from compliance_authorities a where a.code = 'WESTCHESTER-OEM' and r.req_code = 'WC-11';

-- Staff exclusion checks and reportable incidents go to the Justice Center directly, on their
-- own clock. Only fires for camps serving campers with disabilities.
update compliance_requirements r set authority_id = a.id
  from compliance_authorities a where a.code = 'JUSTICE-CENTER'
   and r.req_code in ('NY-2508', 'NY-2509');

-- ─── The official documents, by who you file them with ──────────────────────
-- Bundled paths point at blank PDFs that ship with the app. A null bundled_path means the form
-- is real and required but we do not hold it, and the UI says where to get it rather than
-- quietly showing a shorter list than the county's.
insert into compliance_authority_forms
  (authority_id, designation, title, revision, bundled_path, issued_by, source_url, obtain_note, fillable, sort_order)
select a.id, v.designation, v.title, v.revision, v.bundled, v.issued_by, v.url, v.obtain, v.fillable, v.ord
from (values
  ('WESTCHESTER-DOH', 'DOH-367',  'Children''s Camp Facility and Staff Description', '(1/12)',
   '/forms/ny/doh-367.pdf',  'NYS Department of Health', null, null, true, 10),
  ('WESTCHESTER-DOH', 'DOH-367a', 'Children''s Camp Additional Staff Qualifications', '(5/07)',
   '/forms/ny/doh-367a.pdf', 'NYS Department of Health', null, null, true, 20),
  ('WESTCHESTER-DOH', 'DOH-2040', 'Children''s Camp Safety Plan Checklist', '(12/05)',
   '/forms/ny/doh-2040.pdf', 'NYS Department of Health', null, null, true, 30),
  ('WESTCHESTER-DOH', 'DOH-2271', 'Prospective Children''s Camp Director Certified Statement', '(3/06)',
   '/forms/ny/doh-2271.pdf', 'NYS Department of Health', null, null, true, 40),
  ('WESTCHESTER-DOH', 'DOH-2286', 'Swimming Pool and Bathing Beach Safety Plan Checklist', null,
   '/forms/ny/doh-2286.pdf', 'NYS Department of Health', null, null, true, 50)
) as v(auth_code, designation, title, revision, bundled, issued_by, url, obtain, fillable, ord)
join compliance_authorities a on a.code = v.auth_code
where not exists (
  select 1 from compliance_authority_forms f
   where f.authority_id = a.id and f.designation is not distinct from v.designation
);

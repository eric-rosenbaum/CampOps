-- Mark the requirements whose evidence is, by its nature, other people's personal records.
--
-- The problem this solves is one the module created. Several requirements are satisfied by
-- holding records that are highly sensitive: camper medical histories and individual care
-- plans, immunisation responses, and staff clearances against the child abuse register and the
-- sex offender registry. Their evidence hints accurately describe those records -- and they sit
-- next to an Upload button.
--
-- A director reading "a camper health file per enrolled camper" beside that button will upload
-- camper health files, and the camp will have created a second copy of its most sensitive data
-- inside a general-purpose document store, with a wider set of people able to reach it than the
-- health office intended. No inspector asks for that copy: they inspect the records where the
-- camp keeps them.
--
-- So these requirements now say so, and the product asks the camp to confirm it holds the
-- records rather than to hand them over.

alter table compliance_requirements
  add column if not exists holds_personal_records boolean not null default false;

comment on column compliance_requirements.holds_personal_records is
  'Evidence for this requirement is other people''s personal records (camper health, staff clearances). The UI warns against uploading them and asks for confirmation instead.';

update compliance_requirements set holds_personal_records = true
 where req_code in (
   -- Camper health and disability records.
   'NY-0805',  -- medical history, immunisations, emergency contacts, per camper
   'NY-0806',  -- meningococcal immunisation response form, per camper
   'NY-2502',  -- individual care plan, per camper with a disability
   'NY-2503',  -- expanded health history carrying restrictions and medication
   'NY-2504',  -- pre-arrival modified diet and special needs list
   -- Staff screening results. These name individuals and carry the outcome of a child abuse
   -- register or criminal history check on them.
   'NY-0502',  -- State Central Register clearance for the director
   'NY-0504',  -- Sex Offender Registry search results, per employee and volunteer
   'NY-2508',  -- Justice Center Staff Exclusion List results, per hire
   'WC-06'     -- LDSS-3370 State Central Register database check
 );

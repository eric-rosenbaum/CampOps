-- Park everything except DOH-367 and the county that receives it.
--
-- This is a working decision, not a product one. The module now covers four regulatory
-- packages, six reviewing parties and twenty-two documents, and that is too much surface to
-- see one flow through: form, what fills it, where that data is collected, finished download.
-- So everything else is switched off until that one path is right, then switched back on.
--
-- NOTHING IS DELETED. Every row is still here with its requirements, forms and history intact.
--
-- TO BRING IT ALL BACK, run these two statements:
--
--   update compliance_authorities     set is_active = true;
--   update compliance_authority_forms set is_active = true;
--
-- To bring back one party or one document, add a `where code = ...` or `where designation = ...`
-- to whichever line applies.
--
-- A requirement belonging to a parked authority is parked with it. That is why the Records
-- coverage audit only expects requirements whose authority is active: six requirements sit
-- under the fire department, the State Central Register, Emergency Services and the Justice
-- Center, and while those parties are off they are not gaps, they are out of scope.

alter table compliance_authority_forms
  add column if not exists is_active boolean not null default true;

comment on column compliance_authority_forms.is_active is
  'False parks the document without deleting it. Set every row true to restore the full set.';

-- Keep only the county health department.
update compliance_authorities
   set is_active = false
 where code <> 'WESTCHESTER-DOH';

-- Keep only DOH-367.
update compliance_authority_forms
   set is_active = false
 where designation is distinct from 'DOH-367';

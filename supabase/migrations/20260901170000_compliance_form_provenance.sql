-- Tag everything with the document it comes from, or say it is not on one.
--
-- The rule this enforces: nothing appears in this module without being traceable to an official
-- document we are showing. A camp reading a list of obligations needs to know which form each
-- one lands on, and if the answer is "none", that is a real answer that has to be said out loud
-- rather than left for them to wonder about.
--
-- IMPORTANT, AND THE REASON THIS IS NOT A SIMPLE FILTER: most of Subpart 7-2 is not on any form.
-- "Run a fire drill in the first 48 hours of every session" is a genuine legal duty that the
-- county checks by walking the property and reading your log, not by reading a box on DOH-367.
-- Hiding those because they lack a form would be hiding real obligations, so an empty tag means
-- "checked at inspection" and the UI says so, rather than the row silently disappearing.

alter table compliance_requirements
  add column if not exists form_codes text[] not null default '{}';
alter table compliance_plan_templates
  add column if not exists form_codes text[] not null default '{}';

comment on column compliance_requirements.form_codes is
  'The documents this rule appears on. Empty means it is not on a form and is verified at inspection.';
comment on column compliance_plan_templates.form_codes is
  'The checklist this plan component fills.';

-- Requirements that ARE a document are tagged from the document catalog, which already records
-- which requirement governs each form. One source of truth rather than two lists to drift apart.
update compliance_requirements r
   set form_codes = sub.codes
  from (
    select f.requirement_code, array_agg(distinct coalesce(f.designation, f.title)) as codes
      from compliance_authority_forms f
     where f.requirement_code is not null
     group by f.requirement_code
  ) sub
 where r.req_code = sub.requirement_code;

-- Plan components fill their own checklist: the camp safety plan is DOH-2040, the bathing
-- facility plan is DOH-2286.
update compliance_plan_templates
   set form_codes = array['DOH-2286']
 where category like 'BATHING_%';

update compliance_plan_templates
   set form_codes = array['DOH-2040']
 where category not like 'BATHING_%';

-- WC-13 is the plan itself rather than a checklist, so it carries both: the county receives the
-- written plan and the DOH-2040 checklist that indexes it.
update compliance_requirements
   set form_codes = array['DOH-2040']
 where req_code = 'WC-13';

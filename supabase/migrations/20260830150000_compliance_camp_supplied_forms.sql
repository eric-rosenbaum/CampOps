-- Some documents only the camp can obtain, and the product should say so and take the upload.
--
-- Three kinds show up in the New York packet:
--   * forms the county issues on request and does not publish (the self-inspection form)
--   * documents a third party issues to this camp specifically (workers compensation proof,
--     which comes from the insurer or the Workers Compensation Board)
--   * forms behind a service the platform cannot reach on the camp's behalf
--
-- Until now these showed a warning and nothing else, which leaves a camp reading "we do not
-- hold this" with no next step. They now carry a flag the UI reads to offer an upload, so the
-- camp's own copy becomes the copy the packet uses.

alter table compliance_authority_forms
  add column if not exists camp_supplied boolean not null default false;

comment on column compliance_authority_forms.camp_supplied is
  'The camp obtains this one itself. The UI prompts for an upload rather than only explaining the gap.';

update compliance_authority_forms
   set camp_supplied = true
 where bundled_path is null;

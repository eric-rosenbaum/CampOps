-- The plan the camp already has.
--
-- The plan builder assumes a camp with no written safety plan, and asks it to author ninety-six
-- sections. Almost no camp is in that position: a returning camp has a document that has been
-- edited for years, usually started from a county, ACA or insurer template, and DOH-367 asks
-- which of three situations they are in precisely because "already on file" is the normal case.
-- Asking that camp to retype its plan into a web form is asking for work nobody will do, and a
-- module whose largest job is one nobody will do reads as a module that does not know its user.
--
-- So the camp's own file becomes a first-class thing this module holds: it rides in the packet
-- in place of the plan we would have generated, and DOH-367's "attached with this application"
-- box is then true.
--
-- Marked on the document row rather than in a new table. `doc_type` has been on
-- compliance_documents since the module was created and has never carried a value, which is
-- exactly what it was for. Ordinary evidence keeps a null.
--
-- ONE LIVE PLAN, ENFORCED. Two rows both claiming to be the plan would make the packet pick one
-- by whatever the sort happened to be, and a camp would have no way to know which of their two
-- documents went to the county. A replacement supersedes its predecessor rather than deleting
-- it: last week's file went to a reviewer and has to stay recoverable.

comment on column compliance_documents.doc_type is
  'What kind of document this is. ''written_plan'' marks the camp''s own safety plan, which the '
  'packet carries in place of the plan we generate. Null is ordinary evidence.';

create unique index if not exists compliance_documents_one_live_plan
  on compliance_documents (camp_id, season_id)
  where doc_type = 'written_plan' and superseded_by is null;

-- Promoting a document to "this is our plan" is two writes that must not be separable: retire
-- the incumbent, then mark the newcomer. Split across two client round trips, a failure between
-- them leaves either two live plans (the index rejects the second write, and the camp is told
-- their upload failed when the file is sitting in storage) or none. One function, one
-- transaction, one outcome.
--
-- SECURITY INVOKER on purpose: this must obey the same row-level policies as any other write to
-- compliance_documents, so a person who cannot write their camp's documents cannot promote one
-- either. It is a convenience for atomicity, never an escalation.
create or replace function set_compliance_plan_document(
  p_camp_id uuid, p_season_id uuid, p_document_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update compliance_documents
     set superseded_by = p_document_id
   where camp_id = p_camp_id
     and season_id is not distinct from p_season_id
     and doc_type = 'written_plan'
     and superseded_by is null
     and id <> p_document_id;

  update compliance_documents
     set doc_type = 'written_plan'
   where id = p_document_id
     and camp_id = p_camp_id;
end;
$$;

comment on function set_compliance_plan_document(uuid, uuid, uuid) is
  'Make one uploaded document the camp''s written safety plan for a season, retiring any '
  'predecessor in the same transaction. Obeys the caller''s row-level policies.';

grant execute on function set_compliance_plan_document(uuid, uuid, uuid) to authenticated;

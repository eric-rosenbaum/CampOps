-- A retreat has one agreement. Two of them is never a real state: the second is somebody
-- re-uploading a corrected copy, and leaving both means the signature, the checklist and the
-- portal each pick whichever they happen to read first. Replacing means deleting the old one.
--
-- Enforced in the database rather than only in the modal, because the guest portal writes here
-- too and a client-side guard would not have covered it.
create unique index if not exists retreat_documents_one_agreement
  on retreat_documents (retreat_id)
  where doc_type = 'agreement';

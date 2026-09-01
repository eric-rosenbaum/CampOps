-- Unpark everything: all six reviewing parties and all twenty-two documents.
--
-- The narrowing (20260901140000) did its job — one form was taken end to end, and DOH-367a was
-- brought back beside it. This restores the rest, because the next decision is about the shape
-- of the whole packet rather than the shape of one form: what every document actually asks for,
-- where that data should live, and how a camp should get it in. That question cannot be answered
-- from four documents.
--
-- This is the restore already documented in `docs/compliance/scope-restore.md`, written down as
-- a migration so the state is reproducible rather than a hand-run statement somebody has to
-- remember.
--
-- KNOWN CONSEQUENCE, ACCEPTED DELIBERATELY: every question that prints only on a form that was
-- parked has been dormant, because `applicableQuestions` hides a question whose renders all
-- target inactive documents. Bringing DOH-367a back surfaced three real bugs in its dormant set
-- (a question in the wrong group, three mapped cells with no question at all, and applicability
-- that was never exercised). The same class of thing is now live for DOH-2040, DOH-2271 and
-- DOH-2286, and the sixteen documents with no coordinate map at all appear as documents a camp
-- obtains rather than ones we fill. That is the point: the survey comes before the redesign.

update compliance_authorities     set is_active = true where not is_active;
update compliance_authority_forms set is_active = true where not is_active;

-- The 92-question catalog moved into the app as a generated module. It is static reference data
-- -- the same for every camp, changing only when the state reissues the template -- so a table
-- bought us a join we never make and a seed we would have to keep in step with the docx by hand.
-- What genuinely belongs here is the camp's answers.
alter table camp_plan_answers drop constraint if exists camp_plan_answers_question_key_fkey;
drop table if exists compliance_plan_questions;

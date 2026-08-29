-- The pool safety plan is written, not ticked.
--
-- The form-question catalog seeded 24 tri-state questions for DOH-2286's checklist rows, on the
-- assumption the camp keeps its bathing-facility safety plan elsewhere and only tells the form
-- whether each topic is covered. The bathing seed then made those same 24 topics real plan
-- components the camp writes here, exactly as DOH-2040's rows became the camp safety plan.
--
-- Keeping both would ask the camp the same 24 things twice, and the two answers could disagree:
-- a component written in the plan but ticked N/A on the form, or the reverse. The plan is the
-- better half of that pair, because it produces a document the county can actually read rather
-- than an assertion that one exists. So the questions go.

delete from compliance_form_questions where question_key like 'ny.pool_plan.%';

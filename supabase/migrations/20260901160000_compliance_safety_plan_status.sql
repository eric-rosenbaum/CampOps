-- How the written safety plan reaches DOH-367.
--
-- Page 2 of the form asks one question with three answers: the plan is attached, the plan went
-- in a previous year and is still current, or an update to it is attached. All three boxes are
-- in the coordinate map. Only the middle one was wired, so a camp that writes its plan in the
-- builder and attaches it had no way to say so, and the box the county looks at stayed blank.
--
-- That is also the answer to "how does the safety plan apply to this form": it is not printed on
-- DOH-367, it travels with it, and DOH-367 carries the one line saying which of the three
-- situations the camp is in.

update compliance_form_questions
   set answer_kind = 'choice',
       label = 'What is happening with your written safety plan this year?',
       help_text = 'The form asks which of three situations you are in. If you write your plan in CampCommand, it is attached: you download it with the packet.',
       choices = '[
         {"value": "attached",   "label": "Attached with this application"},
         {"value": "previously", "label": "Sent in a previous year and still current"},
         {"value": "update",     "label": "An update to it is attached"}
       ]'::jsonb,
       renders = '[
         {"form": "DOH-367", "part": "check", "when": "attached",   "field": "safety_plan_attached"},
         {"form": "DOH-367", "part": "check", "when": "previously", "field": "safety_plan_previously_submitted"},
         {"form": "DOH-367", "part": "check", "when": "update",     "field": "safety_plan_update_attached"}
       ]'::jsonb
 where question_key = 'ny.safety_plan.previously_submitted';

-- The date only makes sense for the middle answer, so it is only asked then.
update compliance_form_questions
   set depends_on = 'ny.safety_plan.previously_submitted',
       depends_on_value = 'previously',
       help_text = 'The date the county received the plan you are relying on.'
 where question_key = 'ny.safety_plan.previously_submitted_on';

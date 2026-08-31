-- Ask about the activity, not about the line it prints on.
--
-- DOH-367 has six short rules beside its activity grid where a camp writes out whatever it
-- ticked against a starred row: High Adventure, Other Water Activities, Other. We modelled that
-- as six questions -- "Specification line 1 for a starred activity" through line 6 -- all
-- optional, all carrying the same help text, none of them connected to what the camp had
-- actually ticked. Six permanently empty boxes on the records page, for a camp that may have
-- ticked none of the three.
--
-- A camp director does not have a "specification line 3". They have "we run a zip line". So the
-- question is now one per starred activity, asked only when that activity is ticked, answered in
-- prose. Laying the prose across however many of the six rules it needs is the renderer's job,
-- which is where form geometry belongs.
--
-- The `flow` render part is new and carries the whole rule: the ordered cells to fill and how
-- wide each is in characters. See answerValues() in src/lib/compliance/formAnswers.ts.

begin;

delete from camp_form_answers where question_key like 'ny.activity.specify\_%';
delete from compliance_form_questions where question_key like 'ny.activity.specify\_%';

insert into compliance_form_questions
  (jurisdiction_code, question_key, form_code, group_key, group_label, label, help_text,
   answer_kind, choices, renders, depends_on, depends_on_value, derives_from, applies_when,
   required, sort_order)
values
  ('NY', 'ny.activity.specify.high_adventure', 'DOH-367', 'activities', 'Activities offered',
   'Which high adventure activities do you run?',
   'DOH-367 stars this row and asks you to name them. Six short rules print beside the grid, about 22 characters each, shared with your other starred activities.',
   'text', null,
   '[{"form": "DOH-367", "part": "flow", "fields": ["activity_specify_1", "activity_specify_2", "activity_specify_3", "activity_specify_4", "activity_specify_5", "activity_specify_6"], "chars": 22}]'::jsonb,
   'ny.activity.offered', 'high_adventure', null, '{}'::jsonb, true, 20),

  ('NY', 'ny.activity.specify.other_water_activities', 'DOH-367', 'activities', 'Activities offered',
   'Which other water activities do you run?',
   'DOH-367 stars this row and asks you to name them. Six short rules print beside the grid, about 22 characters each, shared with your other starred activities.',
   'text', null,
   '[{"form": "DOH-367", "part": "flow", "fields": ["activity_specify_1", "activity_specify_2", "activity_specify_3", "activity_specify_4", "activity_specify_5", "activity_specify_6"], "chars": 22}]'::jsonb,
   'ny.activity.offered', 'other_water_activities', null, '{}'::jsonb, true, 21),

  ('NY', 'ny.activity.specify.other', 'DOH-367', 'activities', 'Activities offered',
   'Which other activities do you run?',
   'DOH-367 stars this row and asks you to name them. Six short rules print beside the grid, about 22 characters each, shared with your other starred activities.',
   'text', null,
   '[{"form": "DOH-367", "part": "flow", "fields": ["activity_specify_1", "activity_specify_2", "activity_specify_3", "activity_specify_4", "activity_specify_5", "activity_specify_6"], "chars": 22}]'::jsonb,
   'ny.activity.offered', 'other', null, '{}'::jsonb, true, 22);

commit;

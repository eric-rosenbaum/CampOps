-- One question for the activity grid, not twenty-three.
--
-- DOH-367 prints thirty-six activity boxes, and the catalog modelled twenty-three of them as
-- separate yes/no prompts: "Do campers do Amusement Parks here?", then Bicycling, then Ice
-- Skating, one at a time down a list. That is the same fact asked twenty-three ways, and it is
-- the reason the form reads as a wall of checkboxes.
--
-- The form asks one question. So does this now: tick what you offer, in a grid laid out the way
-- the form lays it out. The other thirteen boxes are already answered by the setup interview
-- (archery, riflery, horseback riding, ropes course, camp trips, boating, on-site swimming) and
-- are filled from there, so nobody is asked about them twice.

alter table compliance_form_questions drop constraint if exists compliance_form_questions_answer_kind_check;
alter table compliance_form_questions add constraint compliance_form_questions_answer_kind_check
  check (answer_kind in ('bool','tristate','text','longtext','date','integer','choice','multi'));

insert into compliance_form_questions
  (jurisdiction_code, question_key, form_code, group_key, group_label, label, help_text,
   answer_kind, choices, renders, applies_when, required, sort_order)
values (
  'NY', 'ny.activity.offered', 'DOH-367', 'activities', 'Activities offered',
  'Which of these do campers do at your camp?',
  'Tick everything you offer. Archery, riflery, horseback riding, the ropes course, camp trips, boating and on-site swimming come from your setup answers and are filled in already.',
  'multi',
  '[{"value": "amusement_parks", "label": "Amusement Parks"}, {"value": "aquatic_theme_parks", "label": "Aquatic Theme Parks"}, {"value": "arts_and_crafts", "label": "Arts and Crafts"}, {"value": "bicycling", "label": "Bicycling"}, {"value": "classroom_instruction", "label": "Classroom Instruction"}, {"value": "cooking", "label": "Cooking"}, {"value": "dancing_acting", "label": "Dancing / Acting"}, {"value": "gymnastics", "label": "Gymnastics"}, {"value": "high_adventure", "label": "High Adventure"}, {"value": "hiking", "label": "Hiking"}, {"value": "ice_skating", "label": "Ice Skating"}, {"value": "martial_arts", "label": "Martial Arts"}, {"value": "mountain_boarding", "label": "Mountain Boarding"}, {"value": "nature_study", "label": "Nature Study"}, {"value": "organized_games_play", "label": "Organized Games (Play)"}, {"value": "petting_zoo", "label": "Petting Zoo"}, {"value": "roller_skating_blading", "label": "Roller Skating / Blading"}, {"value": "skate_boarding", "label": "Skate Boarding"}, {"value": "sports", "label": "Sports"}, {"value": "swimming_off_site", "label": "Swimming - Off-Site"}, {"value": "swimming_wilderness", "label": "Swimming - Wilderness"}, {"value": "other_water_activities", "label": "Other Water Activities"}, {"value": "other", "label": "Other"}]'::jsonb,
  '[{"form": "DOH-367", "part": "check", "when": "amusement_parks", "field": "activity_amusement_parks"}, {"form": "DOH-367", "part": "check", "when": "aquatic_theme_parks", "field": "activity_aquatic_theme_parks"}, {"form": "DOH-367", "part": "check", "when": "arts_and_crafts", "field": "activity_arts_and_crafts"}, {"form": "DOH-367", "part": "check", "when": "bicycling", "field": "activity_bicycling"}, {"form": "DOH-367", "part": "check", "when": "classroom_instruction", "field": "activity_classroom_instruction"}, {"form": "DOH-367", "part": "check", "when": "cooking", "field": "activity_cooking"}, {"form": "DOH-367", "part": "check", "when": "dancing_acting", "field": "activity_dancing_acting"}, {"form": "DOH-367", "part": "check", "when": "gymnastics", "field": "activity_gymnastics"}, {"form": "DOH-367", "part": "check", "when": "high_adventure", "field": "activity_high_adventure"}, {"form": "DOH-367", "part": "check", "when": "hiking", "field": "activity_hiking"}, {"form": "DOH-367", "part": "check", "when": "ice_skating", "field": "activity_ice_skating"}, {"form": "DOH-367", "part": "check", "when": "martial_arts", "field": "activity_martial_arts"}, {"form": "DOH-367", "part": "check", "when": "mountain_boarding", "field": "activity_mountain_boarding"}, {"form": "DOH-367", "part": "check", "when": "nature_study", "field": "activity_nature_study"}, {"form": "DOH-367", "part": "check", "when": "organized_games_play", "field": "activity_organized_games_play"}, {"form": "DOH-367", "part": "check", "when": "petting_zoo", "field": "activity_petting_zoo"}, {"form": "DOH-367", "part": "check", "when": "roller_skating_blading", "field": "activity_roller_skating_blading"}, {"form": "DOH-367", "part": "check", "when": "skate_boarding", "field": "activity_skate_boarding"}, {"form": "DOH-367", "part": "check", "when": "sports", "field": "activity_sports"}, {"form": "DOH-367", "part": "check", "when": "swimming_off_site", "field": "activity_swimming_off_site"}, {"form": "DOH-367", "part": "check", "when": "swimming_wilderness", "field": "activity_swimming_wilderness"}, {"form": "DOH-367", "part": "check", "when": "other_water_activities", "field": "activity_other_water_activities"}, {"form": "DOH-367", "part": "check", "when": "other", "field": "activity_other"}]'::jsonb,
  '{}'::jsonb, false, 20
)
on conflict (question_key) do update set
  choices = excluded.choices, renders = excluded.renders,
  label = excluded.label, help_text = excluded.help_text, answer_kind = excluded.answer_kind;

-- The six "specify" lines hang off the starred activities, which on this form are the ones the
-- footnote says to write out: High Adventure and Other. Repoint them at the grid before the
-- questions they referenced go away, so a camp that ticks a starred activity is still asked to
-- name it.
update compliance_form_questions
   set depends_on = 'ny.activity.offered', depends_on_value = null
 where question_key like 'ny.activity.specify_%';

-- The twenty-three they replace.
delete from compliance_form_questions
 where group_key = 'activities' and answer_kind = 'bool';

-- The facility code. Best reading of the form: the county assigns it when it issues a permit,
-- so a camp applying for its first one has nothing to write. Asked rather than assumed, and
-- explicitly optional, because a blank here is a correct answer for a new camp and a wrong
-- guess would print a number on a government form.
insert into compliance_form_questions
  (jurisdiction_code, question_key, form_code, group_key, group_label, label, help_text,
   answer_kind, renders, applies_when, required, sort_order)
values (
  'NY', 'ny.filing.facility_code', 'DOH-367', 'filing', 'This year''s filing',
  'Your facility code',
  'The number your county health department gave you when they issued your permit. Leave it blank if this is your first application; they assign it then.',
  'text',
  '[{"form": "DOH-367", "part": "text", "field": "facility_code"}]'::jsonb,
  '{}'::jsonb, false, 935
)
on conflict (question_key) do nothing;

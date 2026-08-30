-- Show the whole activity grid, including the boxes the setup interview already ticks.
--
-- The form prints thirty activity boxes. Seven of them are decided by the setup interview
-- (archery, riflery, horseback riding, ropes course, camp trips, boating, on-site swimming) and
-- twenty-three by the multi-select. The multi-select only rendered its own twenty-three, so a
-- camp saw a grid of empty boxes, downloaded the form, and found five of them ticked. A form
-- that disagrees with the screen is worse than a form that is blank: it is the moment a
-- director stops trusting anything else on the page.
--
-- The grid now lists all thirty. The seven from setup are shown ticked and locked, with the
-- setup question that decides each one named, so a camp can see why the box is ticked and where
-- to go to change it.
--
-- `derives_from` on those choices is what the UI reads. It is a note on the choice, not on the
-- question, so it lives in the choices jsonb rather than the column of the same name.

update compliance_form_questions
   set help_text = 'This is the activity grid exactly as DOH-367 prints it. Seven boxes are already decided by your setup answers and are shown locked, with the question that decides each one. Tick the rest.',
       choices = '[
     {"value": "amusement_parks",        "label": "Amusement Parks"},
     {"value": "aquatic_theme_parks",    "label": "Aquatic Theme Parks"},
     {"value": "archery",                "label": "Archery",                  "from": "has_archery",           "fromLabel": "Do you run archery?"},
     {"value": "arts_and_crafts",        "label": "Arts and Crafts"},
     {"value": "bicycling",              "label": "Bicycling"},
     {"value": "boating_canoeing_rafting","label": "Boating / Canoeing / Rafting", "from": "has_boating",      "fromLabel": "Do you run boating or paddling?"},
     {"value": "camp_trips",             "label": "Camp Trips",               "from": "offers_trips",          "fromLabel": "Do you take campers on out-of-camp trips?"},
     {"value": "classroom_instruction",  "label": "Classroom Instruction"},
     {"value": "cooking",                "label": "Cooking"},
     {"value": "dancing_acting",         "label": "Dancing / Acting"},
     {"value": "gymnastics",             "label": "Gymnastics"},
     {"value": "high_adventure",         "label": "High Adventure"},
     {"value": "hiking",                 "label": "Hiking"},
     {"value": "horseback_riding",       "label": "Horseback Riding",         "from": "has_equestrian",        "fromLabel": "Do you run horseback riding?"},
     {"value": "ice_skating",            "label": "Ice Skating"},
     {"value": "martial_arts",           "label": "Martial Arts"},
     {"value": "mountain_boarding",      "label": "Mountain Boarding"},
     {"value": "nature_study",           "label": "Nature Study"},
     {"value": "organized_games_play",   "label": "Organized Games (Play)"},
     {"value": "petting_zoo",            "label": "Petting Zoo"},
     {"value": "riflery",                "label": "Riflery",                  "from": "has_riflery",           "fromLabel": "Do you run riflery?"},
     {"value": "roller_skating_blading", "label": "Roller Skating / Blading"},
     {"value": "ropes_challenge_course", "label": "Ropes / Challenge Course",  "from": "has_challenge_course",  "fromLabel": "Do you have a ropes or challenge course?"},
     {"value": "skate_boarding",         "label": "Skate Boarding"},
     {"value": "sports",                 "label": "Sports"},
     {"value": "swimming_on_site",       "label": "Swimming - On-Site",       "from": "has_pool",              "fromLabel": "Do you have a swimming pool?"},
     {"value": "swimming_off_site",      "label": "Swimming - Off-Site"},
     {"value": "swimming_wilderness",    "label": "Swimming - Wilderness"},
     {"value": "other_water_activities", "label": "Other Water Activities"},
     {"value": "other",                  "label": "Other"}
   ]'::jsonb
 where question_key = 'ny.activity.offered';

-- Adding p_notes to portal_save_dietary changed its SIGNATURE, so `create or replace` created a
-- second function and left the 2-argument original in place. That one predates dietary_notes: it
-- never writes the column, and it sets dietary_none_confirmed purely from the counts -- so a group
-- that had typed "Ben has a severe tree-nut allergy" and then saved with no counts would be
-- recorded as having confirmed nobody has a need, over the top of their own words.
--
-- Fifth time this exact trap has appeared (portal_save_space_request was the first). The rule:
-- adding a parameter is a NEW function, and the old one has to be dropped by full signature.
drop function if exists public.portal_save_dietary(text, jsonb);

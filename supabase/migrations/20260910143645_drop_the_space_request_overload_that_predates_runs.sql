-- A space request became a run (a start date and an end date) in
-- 20260909230718_space_requests_span_a_run. That migration added p_end_date to
-- portal_save_space_request, which changes the SIGNATURE -- so `create or replace` did not
-- replace anything. It created a second function and left the 10-argument original in place,
-- still inserting without end_date, which is now NOT NULL.
--
-- The portal always sends p_end_date, so PostgREST routes every real call to the new function
-- and the old one has never been hit. That is exactly what makes it worth deleting: a dead
-- overload that raises a not-null violation is a trap for the next caller, and two functions of
-- the same name are an ambiguity waiting to be resolved the wrong way.
--
-- Dropping by full signature, so this cannot take the current function with it.
drop function if exists public.portal_save_space_request(
  text, uuid, date, text, text, text, integer, text, text, text
);

-- Merging trades into crews reunited the two lists that were the same idea. service_vendors.trade
-- is NOT one of them, and this is where that shows: the vendors on file are keyed septic, well and
-- hvac. A septic contractor is not a camp crew, and forcing the merge on vendors would make a camp
-- create a "Septic" crew containing nobody just to file the number of the company that pumps the
-- tanks -- three empty crews cluttering the assignment dropdown on every work order.
--
-- So vendors keep their own vocabulary. What a contractor does and which of your crews owns a job
-- were never the same question; they only looked alike because both columns were called `trade`.
comment on column public.service_vendors.trade is
  'What this contractor does (septic, well, hvac). Deliberately NOT the camp crew list in staff_groups -- an outside contractor is not a crew, and vendors are filed by specialty, not by who at camp owns the work.';

-- ── Two stale keys the merge exposed ────────────────────────────────────────
-- A checklist template filed under 'it' at a camp whose Tech crew is keyed 'tech'. Same concept,
-- two spellings, from before the lists were joined -- the template was unreachable from the crew
-- it belongs to.
update public.work_checklist_templates t
   set trade = 'tech'
 where t.trade = 'it'
   and exists (select 1 from public.staff_groups g
                where g.camp_id = t.camp_id and g.key = 'tech')
   and not exists (select 1 from public.staff_groups g
                    where g.camp_id = t.camp_id and g.key = 'it');

-- The other one is left alone on purpose: a work_routing rule keyed 'hr' at a camp with no HR
-- crew and no work order that has ever carried that trade. It is inert -- route_work() matches on
-- trade and nothing matches. Deleting a camp's own routing row on a hunch is worse than leaving a
-- dead one, so it stays, and it starts working again if they ever add that crew back.

-- The generated terms page is removed, everywhere.
--
-- The idea was a machine-filled cover sheet -- group, dates, headcount, money -- printed in front
-- of the camp's own agreement PDF, opt-in per camp. It was overtaken two days later by the
-- agreement TEMPLATE: the camp writes its agreement once with {{tokens}}, and each booking gets
-- that text with its own details already in it. That does the same job in the document itself
-- rather than as a page stapled to the front of one, so the camp now had two half-answers to the
-- same question and a settings toggle deciding which.
--
-- Nothing is lost: zero schedules were ever confirmed on staging and the table was never deployed
-- to production, so every `if exists` below is a no-op there.
drop function if exists public.confirm_retreat_terms(uuid, jsonb, text[], text);
drop function if exists public.confirmed_retreat_terms(uuid);
drop function if exists public.propose_retreat_terms(uuid);

drop table if exists public.retreat_terms_schedules;

alter table public.camps drop column if exists agreement_schedule_enabled;

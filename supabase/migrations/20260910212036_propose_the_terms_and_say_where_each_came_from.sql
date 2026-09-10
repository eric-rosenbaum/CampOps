-- SUPERSEDED, 40 minutes later, by
-- 20260910212119_propose_the_terms_against_the_real_columns.sql.
--
-- This version referenced retreats.agreed_total and retreats.quoted_total. Neither column exists;
-- I wrote the function against columns I assumed were there rather than the ones that are, and it
-- raised `record "v_r" has no field "agreed_total"` the first time it ran. Recorded rather than
-- rewritten, because the ledger already has this version and a migration history that quietly
-- edits itself is worse than one that shows a wrong turn.
--
-- The real shape: a retreat has pricing_model with rate_per_person_night or flat_rate, and the
-- total is either the accepted proposal's or worked out from those. The replacement spells that
-- calculation out in the `source` field, so a director sees the arithmetic and not just a number.
--
-- Deliberately a no-op. The next migration creates the function.
do $$ begin
  raise notice 'Superseded by 20260910212119 -- see the comment above.';
end $$;

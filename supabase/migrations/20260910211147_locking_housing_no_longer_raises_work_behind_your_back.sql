-- Locking housing raised four work orders and said nothing.
--
-- `housing_locked_turnover_trg` fired on lock, so a camp that finalised a rooming plan found
-- turnover work on the board with no idea what had created it. The work itself is right -- a
-- departing group does need every room turned over -- but a side effect nobody was told about is
-- how people stop trusting a board.
--
-- The dialog cannot be bolted on while a trigger still does this: the UI would ask, and Postgres
-- would have already decided. So the trigger goes, and locking now means only locking. The
-- generator stays exactly as it is, is still idempotent, and the app calls it when the camp says
-- yes -- which also means "not now" is recoverable, because saying yes later generates the same
-- work.
drop trigger if exists housing_locked_turnover_trg on public.retreat_housing;

-- The trigger function is left in place, unattached. It is three lines and dropping it buys
-- nothing, while keeping it means a rollback is one CREATE TRIGGER rather than an archaeology
-- expedition.
comment on function public.housing_locked_raises_turnover() is
  'ORPHANED on purpose -- no trigger calls this. Locking housing must not create work as a side effect; the app asks first and calls generate_turnover_work() when the camp agrees. Kept so a rollback is one statement.';

-- A crew and a trade really are one thing, including to the trigger that checks them.
--
-- The 2026-09-10 rework merged the two: `staff_groups` gained a `key`, the clients started
-- offering the camp's own crews as the trade on a work order, and `camp_trades` stopped being
-- the list anybody maintained. `assert_trade_belongs_to_camp` never moved. It still validates
-- `issues.trade` against `camp_trades`, so a crew the camp created after that date is offered in
-- the picker on both the web and the phone and then refused on save with
--
--     trade tech is not one of this camp's trades   (23514)
--
-- On staging that is 50 active crews across the camps: every one of them a chip somebody can tap
-- and nothing they can file. Prospect QA's own Tech crew is one.
--
-- Checked before changing it: no `issues` row and no `work_schedules` row anywhere carries a
-- trade without a matching active crew, so validating against `staff_groups` rejects nothing that
-- already exists. Five stale `camp_trades` rows have no crew behind them; they stop being
-- accepted, which is the point.
--
-- A camp with no active crews at all is left alone rather than locked out — there is nothing to
-- validate against, and a camp mid-setup must still be able to log that the boiler is out.

create or replace function public.assert_trade_belongs_to_camp()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.trade is null then return new; end if;

  if not exists (select 1 from staff_groups g
                 where g.camp_id = new.camp_id and g.key = new.trade and g.is_active) then
    -- Nothing to check against. A camp that has not set its crews up yet still gets to work.
    if not exists (select 1 from staff_groups g
                   where g.camp_id = new.camp_id and g.is_active) then
      return new;
    end if;
    raise exception 'trade % is not one of this camp''s crews', new.trade
      using errcode = '23514';
  end if;

  return new;
end $function$;

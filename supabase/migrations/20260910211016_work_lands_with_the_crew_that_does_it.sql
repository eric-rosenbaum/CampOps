-- Which crew gets the work a retreat generates.
--
-- Turnovers and space set-ups are filed with trade 'housekeeping' and then routed by
-- work_routing to a named person, or to nobody. Nobody was the common case, so a group departing
-- raised four work orders that belonged to the housekeeping crew and yet sat in the same
-- undifferentiated unassigned pile as everything else.
--
-- Now that a crew and a trade are one row, the answer needs no new concept and no retreats-specific
-- crew: work filed under a trade belongs to the crew of that name. So say so, once, for every
-- writer -- the retreat generators, the routine generator, the QR reporter and the capture sheet
-- all insert into `issues`, and none of them should have to remember this.
--
-- A crew OR a person, never both: `issues_one_assignee` enforces that, and it is the rule the
-- camp asked for. So this only ever fills the gap where nobody has been named -- work that is
-- already somebody's stays theirs. Assigning to a crew is not assigning it to a person: status
-- stays unassigned and the work stays pickup-able.
create or replace function public.issue_lands_with_its_crew()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.assignee_group_id is null and new.assignee_id is null and new.trade is not null then
    select g.id into new.assignee_group_id
      from public.staff_groups g
     where g.camp_id = new.camp_id
       and g.key = new.trade
       and g.is_active
     limit 1;
  end if;
  return new;
end;
$fn$;

drop trigger if exists issue_lands_with_its_crew_trg on public.issues;
create trigger issue_lands_with_its_crew_trg
  before insert on public.issues
  for each row execute function public.issue_lands_with_its_crew();

-- Existing open work that nobody owns gets the same treatment, so the board is not split between
-- work that knows its crew and work raised a week earlier that does not. Resolved work is left
-- alone: its trade is history and re-filing it would rewrite what the season review reports.
update public.issues i
   set assignee_group_id = g.id
  from public.staff_groups g
 where i.assignee_group_id is null
   and i.assignee_id is null
   and i.trade is not null
   and g.camp_id = i.camp_id
   and g.key = i.trade
   and g.is_active
   and i.status <> 'resolved';

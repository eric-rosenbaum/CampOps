-- Occupancy is named + unnamed, not named INSTEAD OF unnamed.
--
-- The second prose stub from the same family as 20260907160000. 20260825120000 adds the
-- `unnamed_count` column and describes the rule the sync function should follow — "occupancy is
-- always named + unnamed, and only roster-driven rows are ever recalculated. See the applied
-- migration for the full function body" — but the body it points at
-- (20260824224812_housing_unnamed_count) is not in this directory. It was applied to production
-- by hand and never written down, so every environment rebuilt from these migrations still runs
-- the older function, which is the exact bug the comment says was fixed:
--
--   a cabin holding "staff a, 5 people" that then receives 5 named guests is recorded as 5,
--   silently un-booking five beds.
--
-- Three places the older body drops the unnamed remainder, all restored here from production:
--   * the INSERT never sets unnamed_count (harmless at 0, but explicit is the point);
--   * the recalculating UPDATE assigns the named count instead of ADDING it to unnamed_count;
--   * the tidy-up DELETE removes a room at people_count = 0 without checking whether someone had
--     typed an unnamed headcount into it, which deletes a real booking.

create or replace function public.sync_retreat_housing_from_roster(p_retreat_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats;
begin
  select * into r from retreats where id = p_retreat_id;
  if not found then return; end if;

  -- Assigning a person to a room is also how that room gets held, so the housing row has to
  -- appear on assignment rather than being a separate step the coordinator must remember.
  insert into retreat_housing (camp_id, retreat_id, location_id, space_name,
                               people_count, unnamed_count, roster_driven)
  select r.camp_id, r.id, g.location_id,
         (select name from locations where id = g.location_id),
         count(*), 0, true
  from retreat_guests g
  where g.retreat_id = p_retreat_id
    and g.location_id is not null
    and not exists (
      select 1 from retreat_housing h
      where h.retreat_id = p_retreat_id and h.location_id = g.location_id)
  group by g.location_id;

  -- A hand-entered row becomes roster-driven once the roster reaches into it, but its typed
  -- headcount is kept as the unnamed remainder rather than thrown away. Before that it is left
  -- completely alone, so a group part-way through switching from counts to names never watches
  -- rooms they filled in by hand drop to zero.
  update retreat_housing h
     set roster_driven = true
   where h.retreat_id = p_retreat_id
     and not h.locked
     and not h.roster_driven
     and exists (select 1 from retreat_guests g
                 where g.retreat_id = p_retreat_id and g.location_id = h.location_id);

  -- Occupancy is always the named people plus the ones booked as a number.
  update retreat_housing h
     set people_count = h.unnamed_count + (
           select count(*) from retreat_guests g
           where g.retreat_id = p_retreat_id and g.location_id = h.location_id)
   where h.retreat_id = p_retreat_id
     and h.roster_driven
     and not h.locked;

  -- Nobody left in it, and nothing a human typed: the room is no longer held. A row with a
  -- subgroup label, a note, or an unnamed headcount survives at zero, for its author to clear
  -- deliberately.
  delete from retreat_housing h
   where h.retreat_id = p_retreat_id
     and h.roster_driven
     and not h.locked
     and h.people_count = 0
     and h.unnamed_count = 0
     and h.subgroup_name is null
     and h.notes is null;
end $function$;

-- Turnover work orders that know what is inside the building and how many beds were used.
--
-- Two problems. A building-scoped job said "Turn over Boys Village" and left the crew to
-- remember that the village has four cabins and a bathhouse -- the components were in the
-- location tree the whole time and nothing read them. And every turnover said the same thing
-- whether the group filled the room or put two people in it, so nobody could tell a strip-eight-
-- beds job from a strip-two.
--
-- A building job now carries a checklist step per child room. A room that has been given its
-- own checklist template contributes that template's steps, each prefixed with the room name,
-- so "Bathhouse · Scrub the showers" reads correctly on a list covering five rooms. A room
-- without one contributes a single step named after it, which is the honest minimum: somebody
-- has to tick that the bathhouse got done.

alter table locations add column if not exists checklist_template_id uuid
  references work_checklist_templates(id) on delete set null;

comment on column locations.checklist_template_id is
  'Steps this room contributes to a work order covering its building. Optional: without one the room still earns a single step of its own.';

-- Beds a group actually used in a room: named guests placed there, plus anyone booked by count.
create or replace function public.beds_used(p_retreat_id uuid, p_location_id uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce((select count(*)::int from retreat_guests g
                   where g.retreat_id = p_retreat_id and g.location_id = p_location_id), 0)
       + coalesce((select sum(h.unnamed_count)::int from retreat_housing h
                   where h.retreat_id = p_retreat_id and h.location_id = p_location_id), 0);
$fn$;

/**
 * Append one checklist entry per room inside a location, for a work order that covers the
 * whole building.
 */
create or replace function public.append_room_steps(p_issue_id uuid, p_location_id uuid)
returns int language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid; v_next int; v_n int := 0; rm record; it jsonb; v_ord int;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then return 0; end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  for rm in
    select l.id, l.name, l.checklist_template_id
    from locations l
    where l.parent_id = p_location_id and l.is_active
    order by l.sort_order, l.name
  loop
    if rm.checklist_template_id is not null then
      v_ord := 0;
      for it in
        select e from work_checklist_templates t,
                      jsonb_array_elements(t.items) e
        where t.id = rm.checklist_template_id
      loop
        if coalesce(it->>'text','') <> '' then
          insert into issue_checklist_items
            (camp_id, issue_id, position, text, note, requires_photo)
          values (v_camp, p_issue_id, v_next + v_n,
                  rm.name || ' · ' || (it->>'text'),
                  nullif(it->>'note',''),
                  coalesce((it->>'requires_photo')::boolean, (it->>'requiresPhoto')::boolean, false));
          v_n := v_n + 1;
        end if;
        v_ord := v_ord + 1;
      end loop;
    else
      insert into issue_checklist_items (camp_id, issue_id, position, text)
      values (v_camp, p_issue_id, v_next + v_n, rm.name);
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end;
$fn$;

grant execute on function public.beds_used(uuid, uuid) to authenticated;
grant execute on function public.append_room_steps(uuid, uuid) to authenticated;

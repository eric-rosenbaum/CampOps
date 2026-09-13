-- First attempt gave every room the space's whole checklist, which put "Reset AV and lights to
-- default" and "Stack or arrange seating" under the Barn's BATHROOM. Steps a crew can see are
-- nonsense are worse than no steps: they teach people to tick without reading.
--
-- What a camp actually means by "the Barn" is one room to set up and a bathroom not to forget.
-- So the space's own checklist applies once, to the space, and each room underneath earns a line
-- of its own -- its own checklist if the camp gave it one, otherwise a single step somebody has
-- to tick. That is the same rule the building-turnover path has always used, and it is the
-- honest minimum: nobody is told how to set up a room the camp has not described.
create or replace function public.append_space_steps(
  p_issue_id uuid, p_location_id uuid, p_fallback_template_id uuid
) returns int language plpgsql security definer set search_path = public as $fn$
declare
  v_camp uuid; v_next int; v_n int := 0; v_rooms int;
  rm record; it jsonb;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then return 0; end if;

  select count(*) into v_rooms from locations l
   where l.parent_id = p_location_id and l.is_active;

  -- The work itself, once. On a space with nothing inside it this is the whole checklist and it
  -- keeps its own name as the heading, exactly as before.
  if p_fallback_template_id is not null then
    v_n := public.apply_checklist_template_internal(p_issue_id, p_fallback_template_id);
  end if;

  if v_rooms = 0 then return v_n; end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  for rm in
    select l.id, l.name, l.checklist_template_id
    from locations l
    where l.parent_id = p_location_id and l.is_active
    order by l.sort_order, l.name
  loop
    if rm.checklist_template_id is null then
      -- Somebody still has to tick that this room got done.
      insert into issue_checklist_items (camp_id, issue_id, position, text, section)
      values (v_camp, p_issue_id, v_next, 'Set up ' || rm.name, rm.name);
      v_next := v_next + 1; v_n := v_n + 1;
    else
      for it in
        select e from work_checklist_templates t, jsonb_array_elements(t.items) e
        where t.id = rm.checklist_template_id and t.camp_id = v_camp
      loop
        if coalesce(it->>'text','') <> '' then
          insert into issue_checklist_items
            (camp_id, issue_id, position, text, note, requires_photo, section, template_id)
          values (v_camp, p_issue_id, v_next, it->>'text', nullif(it->>'note',''),
                  coalesce((it->>'requires_photo')::boolean, (it->>'requiresPhoto')::boolean, false),
                  rm.name, rm.checklist_template_id);
          v_next := v_next + 1; v_n := v_n + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_n;
end;
$fn$;

revoke execute on function public.append_space_steps(uuid, uuid, uuid) from public, anon, authenticated;

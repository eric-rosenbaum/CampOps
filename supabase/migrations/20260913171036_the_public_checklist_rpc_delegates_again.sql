-- Restores the split this function has had since triggers started raising work: the public RPC
-- carries the is_camp_member gate because it is reachable from the browser, and the insert lives
-- in the ungated *_internal so a trigger can reach it. A previous edit inlined the insert back
-- into the public one, which left two copies of it and dropped the tolerance for the
-- "requiresPhoto" spelling the internal one learned.
create or replace function public.apply_checklist_template(p_issue_id uuid, p_template_id uuid)
returns int language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then raise exception 'No such work order.'; end if;
  if not is_camp_member(v_camp) then raise exception 'Forbidden'; end if;
  return public.apply_checklist_template_internal(p_issue_id, p_template_id);
end;
$fn$;

-- append_space_steps is only ever called from inside a function that has already checked the
-- caller, and it must work from the turnover trigger too, so it takes the ungated path.
create or replace function public.append_space_steps(
  p_issue_id uuid, p_location_id uuid, p_fallback_template_id uuid
) returns int language plpgsql security definer set search_path = public as $fn$
declare
  v_camp uuid; v_next int; v_n int := 0; v_rooms int;
  rm record; it jsonb; v_tmpl uuid;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then return 0; end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  select count(*) into v_rooms from locations l
   where l.parent_id = p_location_id and l.is_active;

  -- A space with nothing inside it is one room, and its checklist keeps its own name as the
  -- heading. Sectioning a single room would add a heading that says what the title already says.
  if v_rooms = 0 then
    if p_fallback_template_id is null then return 0; end if;
    return public.apply_checklist_template_internal(p_issue_id, p_fallback_template_id);
  end if;

  for rm in
    select l.id, l.name, l.checklist_template_id
    from locations l
    where l.parent_id = p_location_id and l.is_active
    order by l.sort_order, l.name
  loop
    v_tmpl := coalesce(rm.checklist_template_id, p_fallback_template_id);

    if v_tmpl is null then
      -- No list anywhere, but somebody still has to tick that this room got done.
      insert into issue_checklist_items (camp_id, issue_id, position, text, section)
      values (v_camp, p_issue_id, v_next + v_n, 'Set up ' || rm.name, rm.name);
      v_n := v_n + 1;
    else
      for it in
        select e from work_checklist_templates t, jsonb_array_elements(t.items) e
        where t.id = v_tmpl and t.camp_id = v_camp
      loop
        if coalesce(it->>'text','') <> '' then
          insert into issue_checklist_items
            (camp_id, issue_id, position, text, note, requires_photo, section, template_id)
          values (v_camp, p_issue_id, v_next + v_n, it->>'text', nullif(it->>'note',''),
                  coalesce((it->>'requires_photo')::boolean, (it->>'requiresPhoto')::boolean, false),
                  rm.name, v_tmpl);
          v_n := v_n + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_n;
end;
$fn$;

revoke execute on function public.append_space_steps(uuid, uuid, uuid) from public, anon, authenticated;

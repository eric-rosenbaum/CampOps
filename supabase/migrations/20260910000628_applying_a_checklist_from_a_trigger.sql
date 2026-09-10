-- Same shape of problem one level down: apply_checklist_template refuses a caller who is not a
-- camp member, so a trigger that raises work and then gives it its steps died on the steps.
--
-- The insert moves into an ungated internal function. The public RPC keeps its check -- it is
-- reachable from the browser and must -- and delegates.

create or replace function public.apply_checklist_template_internal(
  p_issue_id uuid, p_template_id uuid
) returns int language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid; v_items jsonb; v_n int := 0; v_next int;
begin
  select camp_id into v_camp from issues where id = p_issue_id;
  if v_camp is null then return 0; end if;

  if exists (select 1 from issue_checklist_items
             where issue_id = p_issue_id and template_id = p_template_id) then
    return 0;
  end if;

  select items into v_items from work_checklist_templates
   where id = p_template_id and camp_id = v_camp;
  if v_items is null then return 0; end if;

  select coalesce(max(position) + 1, 0) into v_next
    from issue_checklist_items where issue_id = p_issue_id;

  insert into issue_checklist_items
    (camp_id, issue_id, position, text, note, requires_photo, template_id)
  select v_camp, p_issue_id, v_next + (ord - 1)::int,
         it->>'text', nullif(it->>'note',''),
         coalesce((it->>'requires_photo')::boolean, (it->>'requiresPhoto')::boolean, false),
         p_template_id
  from jsonb_array_elements(v_items) with ordinality as t(it, ord)
  where coalesce(it->>'text','') <> '';

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

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

revoke execute on function public.apply_checklist_template_internal(uuid, uuid) from public, anon, authenticated;

create or replace function public.generate_turnover_work_internal(
  p_retreat_id uuid, p_scope text default 'room'
) returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_retreat retreats; v_n int := 0; v_assignee uuid; v_tmpl uuid; v_issue uuid; h record;
  v_beds int; v_desc text;
begin
  select * into v_retreat from retreats where id = p_retreat_id;
  if v_retreat.id is null then return 0; end if;

  v_assignee := public.route_work(v_retreat.camp_id, 'housekeeping');
  select id into v_tmpl from work_checklist_templates
   where camp_id = v_retreat.camp_id and name = 'Cabin turnover' and is_active limit 1;

  for h in
    select distinct on (target_id) target_id, target_name
    from (
      select case when p_scope = 'building' then coalesce(l.parent_id, l.id) else l.id end as target_id,
             case when p_scope = 'building'
                  then coalesce((select p.name from locations p where p.id = l.parent_id), l.name)
                  else l.name end as target_name
      from retreat_housing rh
      join locations l on l.id = rh.location_id
      where rh.retreat_id = p_retreat_id and rh.location_id is not null
    ) t
  loop
    if exists (
      select 1 from issues
      where retreat_id = p_retreat_id and source = 'retreat' and trade = 'housekeeping'
        and h.target_id = any(location_ids) and title like 'Turn over%'
    ) then continue; end if;

    if p_scope = 'building' then
      select coalesce(sum(public.beds_used(p_retreat_id, l.id)), 0) into v_beds
        from locations l where l.id = h.target_id or l.parent_id = h.target_id;
    else
      v_beds := public.beds_used(p_retreat_id, h.target_id);
    end if;

    v_desc := 'Group departs ' || to_char(v_retreat.departure_date, 'FMDay FMDD FMMon') || '.'
      || case when v_beds > 0
              then E'\n' || v_beds || ' bed' || case when v_beds = 1 then '' else 's' end || ' were used.'
              else '' end;

    insert into issues (
      camp_id, title, description, locations, location_ids, priority, status,
      assignee_id, is_public_report, source, trade, retreat_id, due_date
    ) values (
      v_retreat.camp_id,
      'Turn over ' || h.target_name || ' — after ' || v_retreat.group_name,
      v_desc,
      array[h.target_name], array[h.target_id], 'normal',
      case when v_assignee is null then 'unassigned' else 'assigned' end,
      v_assignee, false, 'retreat', 'housekeeping', p_retreat_id, v_retreat.departure_date
    ) returning id into v_issue;

    if v_tmpl is not null then perform public.apply_checklist_template_internal(v_issue, v_tmpl); end if;
    if p_scope = 'building' then perform public.append_room_steps(v_issue, h.target_id); end if;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

-- "1 bed were used" -- the noun was pluralised and the verb was not.

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
      || case
           when v_beds = 1 then E'\n1 bed was used.'
           when v_beds > 1 then E'\n' || v_beds || ' beds were used.'
           else ''
         end;

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

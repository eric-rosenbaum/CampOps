-- The three callers, switched from matching a name to reading the camp's own answer.
--
-- The rooms inside a building still get a line each: that comes from the location tree, not from
-- a checklist, so a camp that has chosen no default still gets a job that names every room it
-- covers. Choosing nothing is a legitimate answer -- it means no steps are added -- and nothing
-- in here invents steps on a camp's behalf.

-- ── A meeting space is approved ─────────────────────────────────────────────
create or replace function public.approve_space_request(
  p_request_id uuid, p_camp_notes text default null, p_message text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  r            retreat_space_requests;
  v_retreat    retreats;
  v_loc        locations;
  v_setup      uuid;
  v_strike     uuid;
  v_assignee   uuid;
  v_body       text;
  v_strike_body text;
  v_title      text;
  v_last_day   date;
  v_actor      text;
  v_when       text;
  v_multi      boolean;
  v_detail     text;
  v_again      boolean;
begin
  select * into r from retreat_space_requests where id = p_request_id;
  if r.id is null then raise exception 'No such request.'; end if;
  if not is_camp_member(r.camp_id) or get_camp_role(r.camp_id) not in ('admin','staff') then
    raise exception 'Forbidden';
  end if;

  select * into v_retreat from retreats  where id = r.retreat_id;
  select * into v_loc     from locations where id = r.location_id;

  if v_loc.service_status = 'out_of_service' then
    raise exception 'This space is out of service (%). Clear it before approving.',
      coalesce(v_loc.out_of_service_reason, 'no reason recorded') using errcode = '22023';
  end if;

  select coalesce(p.full_name, '') into v_actor from profiles p where p.id = auth.uid();
  v_assignee := public.route_work(r.camp_id, 'housekeeping');

  v_multi := r.end_date > r.day_date;
  v_when := case when v_multi
    then to_char(r.day_date, 'FMDay FMDD FMMon') || ' to ' || to_char(r.end_date, 'FMDay FMDD FMMon')
    else to_char(r.day_date, 'FMDay FMDD FMMon') end;

  -- Only what the group was actually asked. A request filed under the old six-field form still
  -- prints its times and layout; one filed since carries the room, the run, and their sentence.
  v_detail := concat_ws(' · ',
    nullif(concat_ws(' to ', nullif(r.start_label,''), nullif(r.end_label,'')), ''),
    case when r.layout is not null then 'Layout: ' || coalesce(nullif(r.layout_other,''), r.layout) end,
    case when r.expected_count is not null then r.expected_count::text || ' people' end);

  -- The group's words travel intact to the person doing the work. That is the whole point: a
  -- coordinator who wrote "three benches along the back wall" should not have it paraphrased by
  -- two people before it reaches the person carrying benches.
  v_body :=
    'For ' || v_retreat.group_name || ' — ' || v_when || E'\n' ||
    coalesce(v_detail || E'\n', '') ||
    coalesce(E'\nWhat the group asked for:\n' || nullif(btrim(r.setup_notes), ''), '') ||
    coalesce(E'\n\nFrom the camp:\n' || nullif(btrim(coalesce(p_camp_notes, r.camp_notes)), ''), '');

  v_strike_body :=
    'Return the room to its default layout after the group is finished with it.' ||
    coalesce(E'\n\nWhat the group asked for when they booked it:\n' || nullif(btrim(r.setup_notes), ''), '');

  v_title := 'Set up ' || v_loc.name || ' — ' || v_retreat.group_name ||
    case when v_multi
      then ' (' || to_char(r.day_date, 'Dy') || '–' || to_char(r.end_date, 'Dy') || ')'
      else ' (' || to_char(r.day_date, 'Dy') || ')' end;

  -- The job this ask already has, if the crew has not finished it. A finished set-up is history
  -- and must not be rewritten under them; an unfinished one is the same job with new wording.
  select i.id into v_setup from issues i
   where i.id = r.work_order_id and i.status <> 'resolved';
  v_again := v_setup is not null;

  if v_setup is not null then
    update issues set title = v_title, description = v_body, due_date = r.day_date,
                      locations = array[v_loc.name], location_ids = array[v_loc.id],
                      updated_at = now()
     where id = v_setup;
  else
    insert into issues (
      camp_id, title, description, locations, location_ids, priority, status,
      assignee_id, is_public_report, source, trade, retreat_id, retreat_space_request_id, due_date
    ) values (
      r.camp_id, v_title, v_body, array[v_loc.name], array[v_loc.id], 'normal',
      case when v_assignee is null then 'unassigned' else 'assigned' end,
      v_assignee, false, 'retreat', 'housekeeping', r.retreat_id, r.id, r.day_date
    ) returning id into v_setup;

    -- The camp's own answer for "setting up a meeting space", plus a line per room inside it.
    perform public.append_space_steps(
      v_setup, r.location_id, public.work_default(r.camp_id, 'space_setup'));
  end if;

  -- One strike per space per retreat, after the last day the group has it. Two Fridays in the
  -- Lodge is two set-ups and one reset, not two resets -- and a four-day run is one of each.
  select max(end_date) into v_last_day from retreat_space_requests
   where retreat_id = r.retreat_id and location_id = r.location_id and status in ('approved','requested');

  select i.id into v_strike from issues i
    join retreat_space_requests o on o.strike_order_id = i.id
   where o.retreat_id = r.retreat_id and o.location_id = r.location_id and i.status <> 'resolved'
   limit 1;

  if v_strike is not null then
    -- The reset quotes the note so the crew knows what they are undoing. A note edited after
    -- approval has to reach it too, or the reset describes a room nobody set up that way.
    update issues set description = v_strike_body,
                      due_date = coalesce(v_last_day, r.end_date) + 1, updated_at = now()
     where id = v_strike;
  else
    insert into issues (
      camp_id, title, description, locations, location_ids, priority, status,
      assignee_id, is_public_report, source, trade, retreat_id, retreat_space_request_id, due_date
    ) values (
      r.camp_id,
      'Reset ' || v_loc.name || ' after ' || v_retreat.group_name,
      v_strike_body,
      array[v_loc.name], array[v_loc.id], 'normal',
      case when v_assignee is null then 'unassigned' else 'assigned' end,
      v_assignee, false, 'retreat', 'housekeeping', r.retreat_id, r.id,
      coalesce(v_last_day, r.end_date) + 1
    ) returning id into v_strike;

    perform public.append_space_steps(
      v_strike, r.location_id, public.work_default(r.camp_id, 'space_reset'));
  end if;

  update retreat_space_requests set
    status = 'approved',
    camp_notes = coalesce(p_camp_notes, camp_notes),
    response_message = coalesce(p_message, response_message),
    responded_by = nullif(v_actor,''), responded_at = now(),
    work_order_id = v_setup,
    strike_order_id = coalesce(v_strike, strike_order_id),
    updated_at = now()
  where id = p_request_id;

  -- Where the group reads it, and can answer.
  perform public.post_space_message_internal(
    r.camp_id, r.retreat_id, r.location_id, 'system', nullif(v_actor,''), 'status',
    case when v_again
      then 'Updated the set-up for ' || v_loc.name || ' — the crew has your latest note.'
      else 'Approved ' || v_loc.name || '. It is on the crew''s list.' end ||
      coalesce(E'\n\n' || nullif(btrim(p_message), ''), ''));

  return jsonb_build_object('setup_id', v_setup, 'strike_id', v_strike);
end;
$fn$;

-- ── A rental group departs ──────────────────────────────────────────────────
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
  v_tmpl := public.work_default(v_retreat.camp_id, 'room_turnover');

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

-- ── A camp session ends ─────────────────────────────────────────────────────
create or replace function public.generate_session_turnover(p_session_id uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  s camp_sessions; v_n int := 0; v_assignee uuid; v_tmpl uuid; v_issue uuid; l record;
begin
  select * into s from camp_sessions where id = p_session_id;
  if s.id is null or not is_camp_member(s.camp_id) then raise exception 'Forbidden'; end if;

  v_assignee := public.route_work(s.camp_id, 'housekeeping');
  v_tmpl := public.work_default(s.camp_id, 'room_turnover');

  for l in
    select id, name from locations
    where camp_id = s.camp_id and is_dorm and is_active and service_status <> 'out_of_service'
    order by sort_order, name
  loop
    if exists (select 1 from issues where camp_id = s.camp_id and source = 'session'
                 and l.id = any(location_ids) and due_date = s.end_date) then continue; end if;

    insert into issues (camp_id, title, description, locations, location_ids, priority, status,
                        assignee_id, is_public_report, source, trade, due_date)
    values (s.camp_id, 'Turn over ' || l.name || ' — end of ' || s.name,
            'Session ends ' || to_char(s.end_date, 'FMDay FMDD FMMon') || '.',
            array[l.name], array[l.id], 'normal',
            case when v_assignee is null then 'unassigned' else 'assigned' end,
            v_assignee, false, 'session', 'housekeeping', s.end_date)
    returning id into v_issue;

    if v_tmpl is not null then perform public.apply_checklist_template(v_issue, v_tmpl); end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

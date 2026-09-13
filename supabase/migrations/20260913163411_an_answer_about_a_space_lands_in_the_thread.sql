-- An approval or a decline was a dead end. The group read "Declined" and a sentence, and their
-- only way to say "could we have the Barn instead?" was to ring the camp -- which is the moment
-- the product stopped being where the booking happens.
--
-- Both answers now post into the meeting-spaces thread, so the group can reply where they read
-- it. And since the portal no longer asks for times, layouts or headcounts, the work order stops
-- printing "Layout: open" for a group that was never asked.

create or replace function public.approve_space_request(
  p_request_id uuid, p_camp_notes text default null, p_message text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  r          retreat_space_requests;
  v_retreat  retreats;
  v_loc      locations;
  v_setup    uuid;
  v_strike   uuid;
  v_assignee uuid;
  v_tmpl     uuid;
  v_body     text;
  v_last_day date;
  v_actor    text;
  v_when     text;
  v_multi    boolean;
  v_detail   text;
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
    case when v_multi then 'They have the room for the whole stay; set it up once.' || E'\n' else '' end ||
    coalesce(E'\nWhat the group asked for:\n' || nullif(btrim(r.setup_notes), ''), '') ||
    coalesce(E'\n\nFrom the camp:\n' || nullif(btrim(coalesce(p_camp_notes, r.camp_notes)), ''), '');

  select id into v_tmpl from work_checklist_templates
   where camp_id = r.camp_id and name = 'Program space reset' and is_active limit 1;

  insert into issues (
    camp_id, title, description, locations, location_ids, priority, status,
    assignee_id, is_public_report, source, trade, retreat_id, retreat_space_request_id, due_date
  ) values (
    r.camp_id,
    'Set up ' || v_loc.name || ' — ' || v_retreat.group_name ||
      case when v_multi
        then ' (' || to_char(r.day_date, 'Dy') || '–' || to_char(r.end_date, 'Dy') || ')'
        else ' (' || to_char(r.day_date, 'Dy') || ')' end,
    v_body, array[v_loc.name], array[v_loc.id], 'normal',
    case when v_assignee is null then 'unassigned' else 'assigned' end,
    v_assignee, false, 'retreat', 'housekeeping', r.retreat_id, r.id, r.day_date
  ) returning id into v_setup;

  if v_tmpl is not null then perform public.apply_checklist_template(v_setup, v_tmpl); end if;

  -- One strike per space per retreat, after the last day the group has it. Two Fridays in the
  -- Lodge is two set-ups and one reset, not two resets -- and a four-day run is one of each.
  select max(end_date) into v_last_day from retreat_space_requests
   where retreat_id = r.retreat_id and location_id = r.location_id and status in ('approved','requested');

  if not exists (
    select 1 from issues i
    join retreat_space_requests o on o.strike_order_id = i.id
    where o.retreat_id = r.retreat_id and o.location_id = r.location_id and i.status <> 'resolved'
  ) then
    insert into issues (
      camp_id, title, description, locations, location_ids, priority, status,
      assignee_id, is_public_report, source, trade, retreat_id, retreat_space_request_id, due_date
    ) values (
      r.camp_id,
      'Reset ' || v_loc.name || ' after ' || v_retreat.group_name,
      'Return the room to its default layout after the group is finished with it.' ||
        coalesce(E'\n\nWhat the group asked for when they booked it:\n' || nullif(btrim(r.setup_notes), ''), ''),
      array[v_loc.name], array[v_loc.id], 'normal',
      case when v_assignee is null then 'unassigned' else 'assigned' end,
      v_assignee, false, 'retreat', 'housekeeping', r.retreat_id, r.id,
      coalesce(v_last_day, r.end_date) + 1
    ) returning id into v_strike;

    if v_tmpl is not null then perform public.apply_checklist_template(v_strike, v_tmpl); end if;
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
    'Approved ' || v_loc.name || '. It is on the crew''s list.' ||
      coalesce(E'\n\n' || nullif(btrim(p_message), ''), ''));

  return jsonb_build_object('setup_id', v_setup, 'strike_id', v_strike);
end;
$fn$;

-- Declining used to be a bare UPDATE from the browser, so the group's only clue was a status
-- badge changing colour somewhere they were not looking.
create or replace function public.decline_space_request(
  p_request_id uuid, p_message text default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  r       retreat_space_requests;
  v_loc   locations;
  v_actor text;
begin
  select * into r from retreat_space_requests where id = p_request_id;
  if r.id is null then raise exception 'No such request.'; end if;
  if not is_camp_member(r.camp_id) or get_camp_role(r.camp_id) not in ('admin','staff') then
    raise exception 'Forbidden';
  end if;

  select * into v_loc from locations where id = r.location_id;
  select coalesce(p.full_name, '') into v_actor from profiles p where p.id = auth.uid();

  update retreat_space_requests set
    status = 'declined',
    response_message = coalesce(p_message, response_message),
    responded_by = nullif(v_actor,''), responded_at = now(),
    updated_at = now()
  where id = p_request_id;

  perform public.post_space_message_internal(
    r.camp_id, r.retreat_id, r.location_id, 'system', nullif(v_actor,''), 'status',
    'We cannot give you ' || coalesce(v_loc.name, 'that space') || ' for this stay.' ||
      coalesce(E'\n\n' || nullif(btrim(p_message), ''), ''));
end;
$fn$;

-- The camp's own read mark.
create or replace function public.mark_spaces_read(p_retreat_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid;
begin
  select camp_id into v_camp from retreats where id = p_retreat_id;
  if v_camp is null or not is_camp_member(v_camp) then return; end if;
  update retreats set spaces_camp_read_at = now() where id = p_retreat_id;
end;
$fn$;

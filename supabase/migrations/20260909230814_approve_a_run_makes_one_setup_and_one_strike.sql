-- Approving a run produces one set-up and one strike, and the crew reads the whole run.
--
-- Rewritten from the single-day version: the title carried a day-of-week suffix that is wrong
-- for a four-day booking, the body named one date, and the strike landed after max(day_date)
-- rather than after the run actually ends.
--
-- Parameter order is (request, camp_notes, message) and must stay that way: camp_notes is
-- internal and message goes to the guest, so transposing them leaks one into the other.

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

  -- The group's words travel intact to the person doing the work. That is the whole point: a
  -- coordinator who wrote "three benches along the back wall" should not have it paraphrased by
  -- two people before it reaches the person carrying benches.
  v_body :=
    'For ' || v_retreat.group_name || ' — ' || v_when ||
    coalesce(', ' || r.start_label, '') || coalesce(' to ' || r.end_label, '') || E'\n' ||
    'Layout: ' || coalesce(nullif(r.layout_other,''), r.layout) ||
    coalesce(' · ' || r.expected_count::text || ' people', '') ||
    case when v_multi then E'\nThey have the room for the whole run; set it up once.' else '' end ||
    coalesce(E'\n\nWhat the group asked for:\n' || nullif(btrim(r.setup_notes), ''), '') ||
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
      'Return the room to its default layout after the group is finished with it.',
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

  return jsonb_build_object('setup_id', v_setup, 'strike_id', v_strike);
end;
$fn$;

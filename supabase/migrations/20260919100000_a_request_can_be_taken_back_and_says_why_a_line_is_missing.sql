-- A request's loose ends, from a kitchen manager's second pass over the demo.
--
--   * "Not available" said nothing else. The kitchen now gives a short reason or an alternative per
--     line (food_request_lines.kitchen_reason); the status page and the decision email show it.
--   * The status page could not tell a counselor that a line the kitchen approved is not on its
--     shelf list, or that the text message they chose was sent as an email. It now carries
--     notify_by, has_phone (a yes/no, never the number), the camp's time zone and, per line,
--     on_kitchen_list.
--   * Marking a pickup Missed could not be taken back, and neither could Approve or Decline, so a
--     wrong tap meant a wrong email. undo_food_request_missed puts a missed pickup back where it
--     was; reopen_food_request returns a decision to the inbox while its email is still unsent
--     (the outbox drains every 15 minutes) and refuses once it has gone.
--   * A typed-in line ("rainbow sprinkles") could only be linked to an item that already existed.
--     add_kitchen_item_for_request adds it to the kitchen's list (or finds the one already there by
--     name) so the kitchen can link it before approving.
--
-- Missed never touched stock (mark_food_request_missed writes no adjustment); the "39 → 35 lb"
-- the reviewer saw was the Inventory screen adding today's pickups back onto the shelf and dropping
-- them again. That is fixed in the client (see shelfBreakdown) and pinned by a test here.
--
-- Every existing function body below was read from pg_get_functiondef on staging and edited.

alter table public.food_request_lines add column if not exists kitchen_reason text;
comment on column public.food_request_lines.kitchen_reason is
  'Why a line is not available, or what to use instead. Shown to the requester.';

CREATE OR REPLACE FUNCTION public.decide_food_request(p_request_id uuid, p_decision text, p_lines jsonb DEFAULT '[]'::jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_req public.food_requests; v_line public.food_request_lines; v_in jsonb; v_item public.inventory_items;
  v_qty numeric; v_unavailable boolean; v_state text; v_changed boolean := false; v_name text;
begin
  select * into v_req from public.food_requests where id = p_request_id;
  if v_req.id is null then raise exception 'That request does not exist.' using errcode = '22023'; end if;
  perform public.food_request_require_kitchen_internal(v_req.camp_id);
  if p_decision not in ('approve','decline') then
    raise exception 'Decide approve or decline.' using errcode = '22023';
  end if;
  v_req := public.food_request_lock_internal(p_request_id, case p_decision when 'approve' then 'approved' else 'declined' end);

  if p_decision = 'approve' then
    for v_line in select * from public.food_request_lines where request_id = p_request_id order by sort_order loop
      -- Reset per line: SELECT INTO with no match leaves the previous line's input in place.
      v_in := null;
      select e.value into v_in from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
       where e.value->>'id' = v_line.id::text limit 1;
      v_unavailable := coalesce((v_in->>'unavailable')::boolean, false);
      v_item := null;
      -- Linking: an item_id links (or re-links) the line; otherwise it keeps the item it had.
      if nullif(v_in->>'item_id', '') is not null then
        begin
          select * into v_item from public.inventory_items
           where id = (v_in->>'item_id')::uuid and camp_id = v_req.camp_id;
        exception when invalid_text_representation then v_item := null;
        end;
        if v_item.id is null then raise exception 'That item is not in this kitchen.' using errcode = '22023'; end if;
      elsif v_line.item_id is not null then
        select * into v_item from public.inventory_items where id = v_line.item_id;
      end if;

      if v_unavailable then
        -- The kitchen says why, or what to use instead ("out until Monday, try the oat flour"); the
        -- counselor used to see only "Not available".
        update public.food_request_lines
           set line_state = 'unavailable', qty_approved = 0, qty_approved_base = 0,
               kitchen_reason = left(nullif(btrim(v_in->>'reason'), ''), 300),
               item_id = coalesce(v_item.id, item_id),
               approved_unit_label = coalesce(v_item.stock_unit, unit_label)
         where id = v_line.id;
        v_changed := true;
        continue;
      end if;

      begin
        v_qty := coalesce((v_in->>'qty')::numeric, v_line.qty_requested);
      exception when others then
        raise exception 'Quantities must be numbers.' using errcode = '22023';
      end;
      if v_qty <= 0 then raise exception 'Mark a line not available instead of approving zero.' using errcode = '22023'; end if;
      -- A number never crosses units. Linking "2 bags" to an item counted in lb used to approve
      -- 2 lb without anyone typing it; the kitchen now has to say how much, in the item's unit.
      if v_item.id is not null and v_item.id is distinct from v_line.item_id and nullif(v_in->>'qty', '') is null
         and coalesce(v_item.stock_unit, '') <> coalesce(v_line.unit_label, '') then
        raise exception 'Enter how much % to approve, in %. They asked for % %.',
          v_line.label, v_item.stock_unit, public.food_request_qty(v_line.qty_requested), coalesce(v_line.unit_label, '')
          using errcode = '22023';
      end if;

      if v_item.id is not null then
        -- Changed means the requester will get something other than what they asked for: a
        -- different amount, or the same number in a different unit ("2 bags" became "2 lb").
        v_state := case when v_qty <> v_line.qty_requested
                          or coalesce(v_item.stock_unit, '') <> coalesce(v_line.unit_label, '') then 'changed' else 'ok' end;
        update public.food_request_lines
           set item_id = v_item.id,
               unit_in_base = case when item_id is distinct from v_item.id then v_item.stock_unit_in_base else unit_in_base end,
               qty_requested_base = case when coalesce(v_line.unit_label, '') = coalesce(v_item.stock_unit, '')
                                         then v_line.qty_requested * v_item.stock_unit_in_base else qty_requested_base end,
               qty_approved = v_qty, approved_unit_label = v_item.stock_unit,
               qty_approved_base = v_qty * v_item.stock_unit_in_base,
               line_state = v_state, kitchen_reason = null
         where id = v_line.id;
      else
        v_state := case when v_qty <> v_line.qty_requested then 'changed' else 'ok' end;
        update public.food_request_lines
           set qty_approved = v_qty, approved_unit_label = unit_label, qty_approved_base = null, line_state = v_state,
               kitchen_reason = null
         where id = v_line.id;
      end if;
      if v_state <> 'ok' then v_changed := true; end if;
    end loop;
  end if;

  v_name := coalesce((select nullif(display_name, '') from public.camp_members where camp_id = v_req.camp_id and user_id = auth.uid() limit 1),
                     (select full_name from public.profiles where id = auth.uid()));
  update public.food_requests
     set status = case p_decision when 'approve' then 'approved' else 'declined' end,
         kitchen_note = left(nullif(btrim(p_note), ''), 1000),
         changed_by_kitchen = v_changed,
         decided_by = auth.uid(), decided_by_name = v_name, decided_at = now()
   where id = p_request_id;

  perform public.food_request_message_internal(p_request_id, 'request_decided');
  perform public.food_request_plan_one_internal(p_request_id);
  return jsonb_build_object('status', case p_decision when 'approve' then 'approved' else 'declined' end, 'changed', v_changed);
end;
$fn$;

CREATE OR REPLACE FUNCTION public.food_request_message_internal(p_request_id uuid, p_rule text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  r record; v_n integer := 0; v_when text; v_program text; v_link text; v_app_link text;
  v_lines_html text; v_changes_html text; v_changes_text text; v_loc text; v_email text;
  v_pickup timestamptz; v_send timestamptz; v_subject text; v_title text; v_body text; v_text text;
  v_decision text; v_day_word text;
begin
  select q.*, c.name as camp_name, c.timezone, p.name as program_name, s.pickup_location
    into r
    from public.food_requests q
    join public.camps c on c.id = q.camp_id
    left join public.food_programs p on p.id = q.program_id
    left join public.food_request_settings s on s.camp_id = q.camp_id
   where q.id = p_request_id;
  if r.id is null then return 0; end if;

  v_when     := public.food_request_when(r.pickup_date, r.pickup_time);
  v_program  := coalesce(r.program_name, r.requester_name);
  v_link     := 'https://app.campcommand.app/food/status/' || r.status_token;
  v_app_link := 'https://app.campcommand.app/commissary?tab=requests&request=' || r.id;
  v_loc      := coalesce(nullif(btrim(r.pickup_location), ''), 'the kitchen');
  v_pickup   := public.food_request_local_ts(r.pickup_date, r.pickup_time, r.timezone);

  select string_agg('<li>' || public.food_request_html(l.label) || ' &mdash; '
                    || public.food_request_qty(l.qty_requested) || coalesce(' ' || public.food_request_html(l.unit_label), '')
                    || coalesce(' <em>(' || public.food_request_html(nullif(btrim(l.note), '')) || ')</em>', '')
                    || '</li>', '' order by l.sort_order)
    into v_lines_html
    from public.food_request_lines l where l.request_id = r.id;
  v_lines_html := '<ul style="padding-left:18px;margin:10px 0">' || coalesce(v_lines_html, '') || '</ul>';

  if p_rule = 'request_received' then
    v_subject := 'The kitchen has your request for ' || v_when;
    v_body := public.msg_wrap('Your food request is in',
      'Thanks, ' || public.food_request_html(r.requester_name) || '. The kitchen has your request for <strong>'
      || public.food_request_html(v_program) || '</strong>, pickup <strong>' || v_when || '</strong>:'
      || v_lines_html
      || case when r.is_late then '<p style="color:#8A5A0C">This is short notice (' || round(r.notice_hours)::text
              || ' hours; the kitchen asks for ' || public.food_request_notice_rule(r.cutoff_hours)
              || '), so they may not be able to fill all of it. You will hear either way.</p>' else '' end
      || '<p>We will email you when the kitchen approves it.</p>'
      || '<p><a href="' || v_link || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">See your request</a></p>',
      r.camp_name);
    v_text := v_program || ': the kitchen got your request for ' || v_when || '.'
      || case when r.is_late then ' Short notice, so they may not fill all of it.' else '' end
      || ' We''ll tell you when it''s approved. ' || v_link;
    perform public.queue_message(r.camp_id, 'food_request', r.id, 'request_received', 'requester',
      r.requester_email, r.requester_name, null, now(), v_subject, v_body, left(v_text, 320));
    return 1;
  end if;

  if p_rule = 'new_request' then
    v_subject := case when r.is_late then 'Short notice · ' else '' end
      || 'Food request: ' || v_program || ', ' || v_when;
    v_body := public.msg_wrap(
      case when r.is_late then 'Short-notice food request from ' else 'New food request from ' end || public.food_request_html(v_program),
      '<strong>' || public.food_request_html(r.requester_name) || '</strong> needs this for <strong>' || v_when || '</strong>'
      || coalesce(' (' || r.headcount::text || ' people)', '') || ':'
      || v_lines_html
      || coalesce('<p>For: ' || public.food_request_html(nullif(btrim(r.purpose), '')) || '</p>', '')
      || '<p>' || round(r.notice_hours)::text || ' hours’ notice'
      || case when r.is_late then ' &mdash; <strong style="color:#B4552F">short notice (you ask for ' || public.food_request_notice_rule(r.cutoff_hours) || ')</strong>' else '' end
      || '.</p><p>Contact: ' || public.food_request_html(coalesce(r.requester_email, '')) || coalesce(' · ' || public.food_request_html(r.requester_phone), '') || '</p>'
      || '<p><a href="' || v_app_link || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Approve or decline</a></p>',
      r.camp_name);
    v_text := case when r.is_late then 'Short notice · ' || round(r.notice_hours)::text || 'h: ' else 'New request: ' end
      || v_program || ' for ' || v_when || ', '
      || (select count(*) from public.food_request_lines l where l.request_id = r.id)::text || ' items. ' || v_app_link;
    foreach v_email in array public.food_request_kitchen_emails_internal(r.camp_id) loop
      perform public.queue_message(r.camp_id, 'food_request', r.id, 'new_request:' || v_email, 'kitchen',
        v_email, 'Kitchen', r.requester_email, now(), v_subject, v_body, left(v_text, 320));
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;

  if p_rule = 'request_decided' then
    v_decision := case when r.status = 'declined' then 'declined'
                       when r.changed_by_kitchen then 'approved with changes' else 'approved' end;
    select string_agg('<li>' || public.food_request_html(l.label) || ': '
             || case when l.line_state = 'unavailable' then 'not available'
                          || coalesce(' &mdash; ' || public.food_request_html(nullif(btrim(l.kitchen_reason), '')), '')
                     else 'asked ' || public.food_request_qty(l.qty_requested) || coalesce(' ' || public.food_request_html(l.unit_label), '')
                          || ', approved ' || public.food_request_qty(l.qty_approved) || coalesce(' ' || public.food_request_html(l.approved_unit_label), '') end
             || '</li>', '' order by l.sort_order),
           string_agg(l.label || ' ' || case when l.line_state = 'unavailable' then 'not available'
                          || coalesce(' (' || nullif(btrim(l.kitchen_reason), '') || ')', '')
                     else public.food_request_qty(l.qty_approved) || coalesce(' ' || l.approved_unit_label, '')
                          || ' (asked ' || public.food_request_qty(l.qty_requested) || ')' end, '; ' order by l.sort_order)
      into v_changes_html, v_changes_text
      from public.food_request_lines l where l.request_id = r.id and l.line_state <> 'ok';

    v_subject := case when r.status = 'declined' then 'Declined'
                      when r.changed_by_kitchen then 'Approved with changes' else 'Approved' end
      || ': your food for ' || v_when;
    v_body := public.msg_wrap('Your food request was ' || v_decision,
      case when r.status = 'declined'
           then 'The kitchen could not fill your request for <strong>' || public.food_request_html(v_program) || '</strong> on ' || v_when || '.'
           else 'The kitchen approved your request for <strong>' || public.food_request_html(v_program) || '</strong>. Pick it up at '
                || public.food_request_html(v_loc) || ' on <strong>' || v_when || '</strong>.'
                || case when v_changes_html is not null then '<p>What changed:</p><ul style="padding-left:18px;margin:10px 0">' || v_changes_html || '</ul>' else '' end
      end
      || coalesce('<p>From the kitchen: <em>' || public.food_request_html(nullif(btrim(r.kitchen_note), '')) || '</em></p>', '')
      || '<p><a href="' || v_link || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">See your request</a></p>',
      r.camp_name);
    v_text := v_program || ': the kitchen ' || v_decision || ' your request for ' || v_when || '.'
      || case when r.status <> 'declined' and v_changes_text is not null then ' Changes: ' || v_changes_text || '.' else '' end
      || case when r.status <> 'declined' then ' Pick up at ' || v_loc || '.' else '' end
      || coalesce(' Note: ' || nullif(btrim(r.kitchen_note), '') || '.', '')
      || ' ' || v_link;
    -- The URL is the part that must survive: trim the words, never the link.
    if length(v_text) > 320 then
      v_text := left(v_text, 320 - length(v_link) - 2) || '… ' || v_link;
    end if;
    perform public.queue_message(r.camp_id, 'food_request', r.id, 'request_decided', 'requester',
      r.requester_email, r.requester_name, null, now(), v_subject, v_body, v_text);
    return 1;
  end if;

  if p_rule = 'pickup_reminder' then
    -- Mail only goes out 08:00-19:59 camp time. A reminder for a 7am pickup sent at 8am that day
    -- is a reminder about something already missed, so an early pickup is reminded at 18:00 the
    -- evening before instead.
    if r.pickup_time < time '10:00' then
      v_send := public.food_request_local_ts(r.pickup_date - 1, time '18:00', r.timezone);
      v_day_word := 'tomorrow';
    else
      v_send := public.food_request_local_ts(r.pickup_date, time '08:00', r.timezone);
      v_day_word := 'today';
    end if;
    -- Approved after the reminder time: the decision email just said all of this.
    if v_send <= now() or v_pickup <= now() then return 0; end if;
    v_title := 'Pickup ' || v_day_word || ' at ' || split_part(v_when, ', ', 2);
    v_body := public.msg_wrap(v_title,
      'Your food for <strong>' || public.food_request_html(v_program) || '</strong> will be at '
      || public.food_request_html(v_loc) || ' ' || v_day_word || ', <strong>' || v_when || '</strong>.'
      || '<p><a href="' || v_link || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">See your request</a></p>',
      r.camp_name);
    v_text := 'Reminder: ' || v_program || ' food pickup ' || v_day_word || ' ' || split_part(v_when, ', ', 2)
      || ' at ' || v_loc || '. — Kitchen';
    perform public.queue_message(r.camp_id, 'food_request', r.id, 'pickup_reminder', 'requester',
      r.requester_email, r.requester_name, null, v_send, 'Reminder: ' || v_title, v_body, left(v_text, 320));
    return 1;
  end if;

  if p_rule = 'ready_now' then
    v_body := public.msg_wrap('Your food is ready',
      'Your food for <strong>' || public.food_request_html(v_program) || '</strong> (' || v_when || ') is ready at '
      || public.food_request_html(v_loc) || '.',
      r.camp_name);
    v_text := v_program || ': your food for ' || v_when || ' is ready at ' || v_loc || '. — Kitchen';
    perform public.queue_message(r.camp_id, 'food_request', r.id, 'ready_now', 'requester',
      r.requester_email, r.requester_name, null, now(), 'Ready: your food for ' || v_when, v_body, left(v_text, 320));
    return 1;
  end if;

  if p_rule = 'missed_pickup' then
    v_send := v_pickup + interval '2 hours';
    v_body := public.msg_wrap('Food not picked up',
      'The food for <strong>' || public.food_request_html(v_program) || '</strong> (' || v_when
      || ') has not been picked up from ' || public.food_request_html(v_loc) || '.',
      r.camp_name);
    v_text := v_program || ': the food for ' || v_when || ' has not been picked up from ' || v_loc || '.';
    perform public.queue_message(r.camp_id, 'food_request', r.id, 'missed_pickup', 'requester',
      r.requester_email, r.requester_name, null, v_send, 'Not picked up: food for ' || v_when, v_body, left(v_text, 320));
    v_n := 1;
    foreach v_email in array public.food_request_kitchen_emails_internal(r.camp_id) loop
      perform public.queue_message(r.camp_id, 'food_request', r.id, 'missed_pickup:' || v_email, 'kitchen',
        v_email, 'Kitchen', r.requester_email, v_send, 'Not picked up: ' || v_program || ', ' || v_when, v_body, left(v_text, 320));
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;

  if p_rule = 'request_cancelled' then
    v_body := public.msg_wrap('A food request was cancelled',
      '<strong>' || public.food_request_html(r.requester_name) || '</strong> cancelled the approved request for <strong>'
      || public.food_request_html(v_program) || '</strong>, ' || v_when || '. Anything set aside for it can go back on the shelf.',
      r.camp_name);
    v_text := 'Cancelled: ' || v_program || ' for ' || v_when || '. Anything set aside can go back on the shelf.';
    foreach v_email in array public.food_request_kitchen_emails_internal(r.camp_id) loop
      perform public.queue_message(r.camp_id, 'food_request', r.id, 'request_cancelled:' || v_email, 'kitchen',
        v_email, 'Kitchen', r.requester_email, now(), 'Cancelled: ' || v_program || ', ' || v_when, v_body, left(v_text, 320));
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;

  raise exception 'Unknown food request message rule %', p_rule;
end;
$fn$;

CREATE OR REPLACE FUNCTION public.get_food_request_status(p_status_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare r record;
begin
  select q.*, c.name as camp_name, c.logo_url, c.timezone, p.name as program_name, s.pickup_location
    into r
    from public.food_requests q
    join public.camps c on c.id = q.camp_id
    left join public.food_programs p on p.id = q.program_id
    left join public.food_request_settings s on s.camp_id = q.camp_id
   where q.status_token = p_status_token and c.deleted_at is null;
  if r.id is null then return null; end if;

  return jsonb_build_object(
    'camp', jsonb_build_object('name', r.camp_name, 'logo_url', r.logo_url),
    'program_name', r.program_name,
    'ref', r.id,
    'requester_name', r.requester_name,
    'purpose', r.purpose, 'headcount', r.headcount,
    'pickup_date', r.pickup_date, 'pickup_time', r.pickup_time,
    'pickup_location', r.pickup_location,
    -- How they asked to be told, and whether a phone was given (never the number itself): the page
    -- says plainly that texts are not switched on and email is used instead.
    'notify_by', r.notify_by, 'has_phone', nullif(btrim(coalesce(r.requester_phone, '')), '') is not null,
    'timezone', r.timezone,
    'status', r.status, 'is_late', r.is_late, 'notice_hours', r.notice_hours, 'cutoff_hours', r.cutoff_hours,
    'kitchen_note', r.kitchen_note, 'changed_by_kitchen', r.changed_by_kitchen,
    'created_at', r.created_at, 'decided_at', r.decided_at, 'ready_at', r.ready_at,
    'picked_up_at', r.picked_up_at, 'missed_at', r.missed_at, 'cancelled_at', r.cancelled_at,
    'can_cancel', r.status in ('submitted','approved'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                'label', l.label, 'qty_requested', l.qty_requested, 'unit_label', l.unit_label,
                'qty_approved', l.qty_approved, 'approved_unit_label', l.approved_unit_label,
                'line_state', l.line_state, 'note', l.note, 'item_name', i.name,
                'kitchen_reason', l.kitchen_reason,
                -- Approved but on nobody's shelf list: the kitchen sources it separately.
                'on_kitchen_list', l.item_id is not null) order by l.sort_order)
              from public.food_request_lines l
              left join public.inventory_items i on i.id = l.item_id
             where l.request_id = r.id), '[]'::jsonb)
  );
end;
$fn$;

-- A missed pickup goes back to the state it was missed from: ready if it had been made ready,
-- otherwise approved. Nothing is written to stock (Missed wrote nothing either).
create or replace function public.undo_food_request_missed(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_req public.food_requests; v_to text;
begin
  select * into v_req from public.food_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'That request does not exist.' using errcode = '22023'; end if;
  perform public.food_request_require_kitchen_internal(v_req.camp_id);
  if v_req.status <> 'missed' then
    raise exception 'Only a missed pickup can be put back (this one is %).', replace(v_req.status, '_', ' ') using errcode = '22023';
  end if;
  v_to := case when v_req.ready_at is not null then 'ready' else 'approved' end;
  update public.food_requests set status = v_to, missed_at = null where id = p_request_id;
  -- Missing it cancelled the reminders; cancelled rows would block re-queueing (queue_message does
  -- nothing on conflict), so they go, and the plan is made again.
  delete from public.scheduled_messages
   where subject_type = 'food_request' and subject_id = p_request_id and state = 'cancelled' and suppressed_reason = 'missed';
  perform public.food_request_plan_one_internal(p_request_id);
  return v_to;
end;
$fn$;

-- Approve or Decline, taken back while nobody has been told. The decision email is queued, not
-- sent (the outbox drains every 15 minutes); once it has gone the request stays decided.
create or replace function public.reopen_food_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_req public.food_requests;
begin
  select * into v_req from public.food_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'That request does not exist.' using errcode = '22023'; end if;
  perform public.food_request_require_kitchen_internal(v_req.camp_id);
  if v_req.status not in ('approved','declined') then
    raise exception 'A % request cannot go back to the inbox.', replace(v_req.status, '_', ' ') using errcode = '22023';
  end if;
  if exists (select 1 from public.scheduled_messages
              where subject_type = 'food_request' and subject_id = p_request_id and rule_key = 'request_decided'
                and state <> 'scheduled') then
    raise exception 'The email about this decision has already gone out, so it can’t be undone.' using errcode = '22023';
  end if;

  -- Unsent messages about the decision go entirely, so deciding again queues fresh ones
  -- (queue_message does nothing on conflict with an existing row, cancelled or not).
  delete from public.scheduled_messages
   where subject_type = 'food_request' and subject_id = p_request_id and state in ('scheduled','cancelled')
     and (rule_key = 'request_decided' or rule_key = 'pickup_reminder' or rule_key like 'missed_pickup%');

  update public.food_request_lines
     set qty_approved = null, approved_unit_label = null, qty_approved_base = null, line_state = 'ok', kitchen_reason = null
   where request_id = p_request_id;
  update public.food_requests
     set status = 'submitted', kitchen_note = null, changed_by_kitchen = false,
         decided_by = null, decided_by_name = null, decided_at = null
   where id = p_request_id;
end;
$fn$;

-- A typed-in line's words become an item on the kitchen's list, so it can be linked, set aside and
-- ordered. The same name already on the list (any case) is returned instead of a duplicate.
create or replace function public.add_kitchen_item_for_request(
  p_camp_id uuid, p_name text, p_dimension text, p_base_unit text, p_stock_unit text, p_stock_unit_in_base numeric,
  p_category text default 'other')
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_id uuid; v_name text := left(btrim(coalesce(p_name, '')), 120);
begin
  perform public.food_request_require_kitchen_internal(p_camp_id);
  if v_name = '' then raise exception 'Give the item a name.' using errcode = '22023'; end if;
  if p_dimension not in ('count','weight','volume') or coalesce(p_stock_unit_in_base, 0) <= 0
     or nullif(btrim(coalesce(p_stock_unit, '')), '') is null or nullif(btrim(coalesce(p_base_unit, '')), '') is null then
    raise exception 'Pick the unit the kitchen counts % in.', v_name using errcode = '22023';
  end if;
  select id into v_id from public.inventory_items where camp_id = p_camp_id and lower(btrim(name)) = lower(v_name) limit 1;
  if v_id is not null then return v_id; end if;
  -- Not counted and no minimum: it shows under "Needs setup" until the kitchen counts it.
  insert into public.inventory_items (camp_id, name, category, dimension, base_unit, stock_unit, stock_unit_in_base,
                                      purchase_unit, purchase_unit_in_base, on_hand_base)
  values (p_camp_id, v_name, coalesce(nullif(p_category, ''), 'other'), p_dimension, p_base_unit, p_stock_unit, p_stock_unit_in_base,
          p_stock_unit, p_stock_unit_in_base, 0)
  returning id into v_id;
  return v_id;
end;
$fn$;

revoke execute on function public.undo_food_request_missed(uuid) from public, anon, authenticated;
revoke execute on function public.reopen_food_request(uuid) from public, anon, authenticated;
revoke execute on function public.add_kitchen_item_for_request(uuid,text,text,text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.undo_food_request_missed(uuid) to authenticated;
grant execute on function public.reopen_food_request(uuid) to authenticated;
grant execute on function public.add_kitchen_item_for_request(uuid,text,text,text,text,numeric,text) to authenticated;

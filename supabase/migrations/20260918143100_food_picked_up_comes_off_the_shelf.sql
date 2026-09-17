-- Food that is picked up comes off the shelf, and a number never crosses units.
--
-- Found in a usability review of the demo:
--   * Marking a request picked up wrote nothing to stock, and the client kept subtracting picked-up
--     requests in the projection instead. The counted "on hand" never went down, so the Inventory
--     tiles (which read the count) said "Fully stocked" beside a row that ran out on Friday. A pickup
--     now writes a 'used' adjustment per linked item, in the same transaction as the status change,
--     and picked-up requests stop being projected demand.
--   * Linking the counselor's "2 bags of mini chocolate chips" to an item counted in lb silently
--     approved "2 lb". Approving a newly linked line whose unit differs now needs a quantity typed
--     in the item's unit.
--   * The kitchen said "LATE", "Under the 72-hour cutoff" and "72 hours notice" for the same thing;
--     it now says "Short notice" and "3 days’ notice (72 h)".
--   * A counselor's phone can find its own requests again: the form's upcoming list carries a
--     request ref and the asker's first name, and the status page carries purpose and headcount.
--
-- Every function body below was read from pg_get_functiondef on staging and edited, not retyped.

-- "3 days’ notice (72 h)" / "36 hours’ notice": the one way notice is written, in email and on screen
-- (src/lib/foodRequests.ts formatNoticeRule says the same).
create or replace function public.food_request_notice_rule(p numeric)
returns text language sql immutable set search_path to 'public' as $fn$
  select case
    when p is null then ''
    when p >= 24 and mod(p, 24) = 0 then (p / 24)::integer::text || case when p = 24 then ' day’s' else ' days’' end
         || ' notice (' || public.food_request_qty(p) || ' h)'
    else public.food_request_qty(p) || case when p = 1 then ' hour’s' else ' hours’' end || ' notice'
  end;
$fn$;

CREATE OR REPLACE FUNCTION public.mark_food_request_picked_up(p_request_id uuid, p_by_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare v_req public.food_requests; v_who text; v_by text; v_note text; l record;
begin
  select * into v_req from public.food_requests where id = p_request_id;
  perform public.food_request_require_kitchen_internal(v_req.camp_id);
  v_req := public.food_request_lock_internal(p_request_id, 'picked_up');
  update public.food_requests
     set status = 'picked_up', picked_up_at = now(), picked_up_by_name = left(nullif(btrim(p_by_name), ''), 120)
   where id = p_request_id;

  -- The food left the kitchen, so it leaves the book: one 'used' adjustment per linked item, in
  -- this transaction. Until now a pickup wrote nothing and the projection kept subtracting picked-up
  -- requests forever, so the shelf count never went down (the client stops counting picked_up as
  -- demand in the same change, so nothing is taken out twice). Unlinked lines have no item to
  -- take from; unavailable lines were never handed over.
  v_who := coalesce((select name from public.food_programs where id = v_req.program_id), v_req.requester_name);
  v_by := coalesce((select nullif(display_name, '') from public.camp_members where camp_id = v_req.camp_id and user_id = auth.uid() limit 1),
                   (select full_name from public.profiles where id = auth.uid()), 'Kitchen');
  v_note := left('Food request picked up: ' || v_who || ', pickup ' || public.food_request_when(v_req.pickup_date, v_req.pickup_time)
                 || ' (' || v_req.requester_name || ')', 300);
  for l in
    select fl.item_id, sum(coalesce(fl.qty_approved_base, fl.qty_requested_base)) as base
      from public.food_request_lines fl
      join public.inventory_items i on i.id = fl.item_id and i.camp_id = v_req.camp_id
     where fl.request_id = p_request_id and fl.line_state <> 'unavailable'
     group by fl.item_id
    having sum(coalesce(fl.qty_approved_base, fl.qty_requested_base)) > 0
  loop
    perform public.adjust_inventory_item(l.item_id, -l.base, 'used', v_note, v_by, null);
  end loop;

  perform public.food_request_plan_one_internal(p_request_id);
end;
$fn$;

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
        update public.food_request_lines
           set line_state = 'unavailable', qty_approved = 0, qty_approved_base = 0,
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
               line_state = v_state
         where id = v_line.id;
      else
        v_state := case when v_qty <> v_line.qty_requested then 'changed' else 'ok' end;
        update public.food_request_lines
           set qty_approved = v_qty, approved_unit_label = unit_label, qty_approved_base = null, line_state = v_state
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

-- Short notice is written one way everywhere.
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
                     else 'asked ' || public.food_request_qty(l.qty_requested) || coalesce(' ' || public.food_request_html(l.unit_label), '')
                          || ', approved ' || public.food_request_qty(l.qty_approved) || coalesce(' ' || public.food_request_html(l.approved_unit_label), '') end
             || '</li>', '' order by l.sort_order),
           string_agg(l.label || ' ' || case when l.line_state = 'unavailable' then 'not available'
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

CREATE OR REPLACE FUNCTION public.get_food_request_form(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare v_program public.food_programs; v_camp public.camps; v_settings public.food_request_settings;
begin
  select p.* into v_program from public.food_programs p
    join public.camps c on c.id = p.camp_id
   where p.request_token = p_token and p.active and c.deleted_at is null;
  if v_program.id is null then return null; end if;
  select * into v_camp from public.camps where id = v_program.camp_id;
  select * into v_settings from public.food_request_settings where camp_id = v_camp.id;

  return jsonb_build_object(
    'program', jsonb_build_object('name', v_program.name, 'color', v_program.color, 'lead_name', v_program.lead_name),
    'camp', jsonb_build_object('name', v_camp.name, 'logo_url', v_camp.logo_url, 'timezone', v_camp.timezone),
    'cutoff_hours', coalesce(v_settings.cutoff_hours, 72),
    'pickup_location', v_settings.pickup_location,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.stock_unit, 'category', i.category)
                                        order by i.name)
                         from public.inventory_items i where i.camp_id = v_camp.id), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('pickup_date', q.pickup_date, 'pickup_time', q.pickup_time, 'status', q.status,
                                                              -- A first name, so a counselor can tell their row from a colleague's; the
                                                              -- id lets this phone hide the rows it already lists as its own. Neither
                                                              -- opens anything: only the status token does.
                                                              'ref', q.id, 'asked_by', split_part(btrim(q.requester_name), ' ', 1))
                                           order by q.pickup_date, q.pickup_time)
                            from public.food_requests q
                           where q.program_id = v_program.id and q.pickup_date >= current_date - 1
                             and q.status not in ('cancelled','declined')), '[]'::jsonb)
  );
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
  select q.*, c.name as camp_name, c.logo_url, p.name as program_name, s.pickup_location
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
    'status', r.status, 'is_late', r.is_late, 'notice_hours', r.notice_hours, 'cutoff_hours', r.cutoff_hours,
    'kitchen_note', r.kitchen_note, 'changed_by_kitchen', r.changed_by_kitchen,
    'created_at', r.created_at, 'decided_at', r.decided_at, 'ready_at', r.ready_at,
    'picked_up_at', r.picked_up_at, 'missed_at', r.missed_at, 'cancelled_at', r.cancelled_at,
    'can_cancel', r.status in ('submitted','approved'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                'label', l.label, 'qty_requested', l.qty_requested, 'unit_label', l.unit_label,
                'qty_approved', l.qty_approved, 'approved_unit_label', l.approved_unit_label,
                'line_state', l.line_state, 'note', l.note) order by l.sort_order)
              from public.food_request_lines l where l.request_id = r.id), '[]'::jsonb)
  );
end;
$fn$;

do $$
declare f text;
begin
  -- Supabase grants EXECUTE to PUBLIC on a new function (CLAUDE.md trap 13); the replaced ones are
  -- re-stated too, so this file alone says who can call what.
  foreach f in array array['food_request_notice_rule(numeric)', 'food_request_message_internal(uuid,text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['get_food_request_form(text)', 'get_food_request_status(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['decide_food_request(uuid,text,jsonb,text)', 'mark_food_request_picked_up(uuid,text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

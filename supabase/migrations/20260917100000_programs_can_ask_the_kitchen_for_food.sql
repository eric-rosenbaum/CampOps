-- Programs can ask the kitchen for food.
--
-- Before this, the cooking club asked for flour by catching the cook at lunch, a counselor texted
-- the kitchen manager's personal phone, and the order that went to the vendor on Monday knew
-- about none of it. The kitchen found out on Thursday at 2pm, when somebody showed up at the back
-- door expecting five pounds of flour that had been used for pancakes.
--
-- A request is now a row with a state machine, and the state machine lives here, not in the
-- browser: every staff member can write every commissary table (there is no kitchen-only
-- permission), so the only way "picked up without being approved" can never happen is for no
-- client to be able to write these tables at all. Every change goes through one RPC below.
--
-- Approved requests are kitchen demand. They feed the same projection the menu does, and like the
-- menu they are never written into stock: a pickup does NOT write an inventory adjustment, and the
-- next count reconciles. Writing both would take the same flour out of the book twice.

-- ─── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.food_programs (
  id            uuid primary key default gen_random_uuid(),
  camp_id       uuid not null references public.camps(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 80),
  lead_name     text,
  lead_email    text,
  lead_phone    text,
  color         text,
  -- The no-login link. Not a secret in the password sense (it gets printed as a QR code on the
  -- arts-and-crafts cabin wall) and it authorises exactly one thing: asking this kitchen for food.
  request_token text not null default public.gen_qr_token(),
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists food_programs_request_token_key on public.food_programs(request_token);
create index if not exists food_programs_camp on public.food_programs(camp_id, sort_order);

comment on table public.food_programs is
  'A group that asks the kitchen for food (Cooking Club, Canoe trips). Each has a no-login request link.';

create table if not exists public.food_requests (
  id                 uuid primary key default gen_random_uuid(),
  camp_id            uuid not null references public.camps(id) on delete cascade,
  program_id         uuid references public.food_programs(id) on delete set null,
  requested_by       uuid references auth.users(id) on delete set null,
  requester_name     text not null,
  requester_email    text,
  requester_phone    text,
  notify_by          text not null default 'email' check (notify_by in ('email','text')),
  source             text not null check (source in ('app','link')),
  -- A camp-local calendar day and a wall-clock time, never an instant (see CLAUDE.md trap 3).
  pickup_date        date not null,
  pickup_time        time not null,
  purpose            text,
  headcount          integer check (headcount is null or headcount between 0 and 10000),
  status             text not null default 'submitted'
                     check (status in ('submitted','approved','declined','ready','picked_up','missed','cancelled')),
  -- Computed once, at submit, in the camp's time zone, and stored: the cutoff setting can change
  -- afterwards, and a request that was on time when it was sent must not turn late on Tuesday.
  notice_hours       numeric(10,2) not null,
  cutoff_hours       numeric(10,2) not null,
  is_late            boolean not null,
  kitchen_note       text,
  changed_by_kitchen boolean not null default false,
  decided_by         uuid references auth.users(id) on delete set null,
  decided_by_name    text,
  decided_at         timestamptz,
  ready_at           timestamptz,
  picked_up_at       timestamptz,
  picked_up_by_name  text,
  missed_at          timestamptz,
  cancelled_at       timestamptz,
  cancelled_by       text check (cancelled_by is null or cancelled_by in ('requester','kitchen')),
  -- The requester's status page. Separate from the program token so one request's page does not
  -- reveal the program's link, and vice versa.
  status_token       text not null default public.gen_qr_token(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists food_requests_status_token_key on public.food_requests(status_token);
create index if not exists food_requests_camp_pickup on public.food_requests(camp_id, pickup_date);
create index if not exists food_requests_program on public.food_requests(program_id, pickup_date);
create index if not exists food_requests_requested_by on public.food_requests(requested_by);

create table if not exists public.food_request_lines (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.food_requests(id) on delete cascade,
  camp_id             uuid not null references public.camps(id) on delete cascade,
  -- Null for a free-text line ("the big marshmallows"). The kitchen can link it to an item when
  -- deciding; until then it is visible to people but invisible to ordering.
  item_id             uuid references public.inventory_items(id) on delete set null,
  label               text not null,
  -- What the requester typed, in the unit they saw.
  qty_requested       numeric(12,3) not null check (qty_requested > 0),
  unit_label          text,
  -- Snapshot of the item's stock-unit factor when linked, so the line still reads correctly after
  -- somebody edits the item's units.
  unit_in_base        numeric,
  qty_requested_base  numeric,
  -- What the kitchen approved, in the unit it approved in (the item's stock unit once linked).
  qty_approved        numeric(12,3),
  approved_unit_label text,
  qty_approved_base   numeric,
  note                text,
  line_state          text not null default 'ok' check (line_state in ('ok','changed','unavailable')),
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists food_request_lines_request on public.food_request_lines(request_id, sort_order);
create index if not exists food_request_lines_item on public.food_request_lines(item_id);
create index if not exists food_request_lines_camp on public.food_request_lines(camp_id);

-- One row per camp. Its own table on purpose: adding a parameter to update_camp would create a
-- second overload that existing callers keep hitting (CLAUDE.md trap 5).
create table if not exists public.food_request_settings (
  camp_id         uuid primary key references public.camps(id) on delete cascade,
  cutoff_hours    numeric(10,2) not null default 72 check (cutoff_hours between 0 and 720),
  kitchen_emails  text[] not null default '{}',
  pickup_location text,
  late_policy     text not null default 'flag' check (late_policy in ('flag')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Per client IP, per camp, rolling hour. No camp_id column and no policies on purpose: nothing
-- outside submit_food_request_public reads or writes it, and a throttle is not camp data a demo
-- clone should copy.
create table if not exists public.food_request_throttle (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);
alter table public.food_request_throttle enable row level security;
revoke all on table public.food_request_throttle from anon, authenticated;

-- ─── Access: read for members, write through the RPCs only ──────────────────────

do $$
declare t text;
begin
  foreach t in array array['food_programs','food_requests','food_request_lines','food_request_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (public.is_camp_member(camp_id))', t || '_read', t);
    -- Supabase grants every table to anon and authenticated by default. RLS without a write
    -- policy already refuses writes, but TRUNCATE is not subject to RLS at all.
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('alter table public.%I replica identity full', t);
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.update_updated_at()', t || '_updated_at', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─── Small helpers (internal: no grants) ────────────────────────────────────────

-- A camp-local wall-clock pickup as an instant. `date + time` is a timestamp without zone;
-- `at time zone` reads it as the camp's local time, DST included.
create or replace function public.food_request_local_ts(p_date date, p_time time, p_tz text)
returns timestamptz language sql stable set search_path to 'public' as $fn$
  select (p_date + p_time) at time zone coalesce(nullif(p_tz, ''), 'America/New_York');
$fn$;

-- Hours of notice between an instant and a camp-local pickup. Real elapsed hours, so a request
-- spanning the November clock change is measured in hours that actually pass.
create or replace function public.food_request_notice_hours(p_camp_id uuid, p_date date, p_time time, p_at timestamptz)
returns numeric language sql stable set search_path to 'public' as $fn$
  select extract(epoch from (public.food_request_local_ts(p_date, p_time, c.timezone) - p_at)) / 3600.0
    from public.camps c where c.id = p_camp_id;
$fn$;

create or replace function public.food_request_html(p text)
returns text language sql immutable set search_path to 'public' as $fn$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$fn$;

-- "Thu Jul 18, 2pm" / "Thu Jul 18, 2:30pm"
create or replace function public.food_request_when(p_date date, p_time time)
returns text language sql immutable set search_path to 'public' as $fn$
  select to_char(p_date, 'Dy Mon FMDD') || ', '
      || case when extract(minute from p_time) = 0 then to_char(p_time, 'FMHH12am')
              else to_char(p_time, 'FMHH12:MIam') end;
$fn$;

create or replace function public.food_request_qty(p numeric)
returns text language sql immutable set search_path to 'public' as $fn$
  select case when p is null then '' else trim(trailing '.' from trim(trailing '0' from to_char(p, 'FM999999990.999'))) end;
$fn$;

-- Who hears about a new request. The camp's kitchen list; failing that the camp's admin, so a
-- camp that never opened Settings still has somebody told rather than nobody.
create or replace function public.food_request_kitchen_emails_internal(p_camp_id uuid)
returns text[] language plpgsql stable security definer set search_path to 'public' as $fn$
declare v text[];
begin
  select array(select distinct lower(btrim(e)) from unnest(s.kitchen_emails) e
                where btrim(e) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
    into v from public.food_request_settings s where s.camp_id = p_camp_id;
  if coalesce(array_length(v, 1), 0) = 0 then
    v := array_remove(array[public.camp_admin_email(p_camp_id)], null);
  end if;
  return coalesce(v, '{}');
end;
$fn$;

create or replace function public.food_request_require_kitchen_internal(p_camp_id uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $fn$
begin
  if p_camp_id is null or not public.is_camp_member(p_camp_id)
     or coalesce(public.get_camp_role(p_camp_id), '') not in ('admin','staff') then
    raise exception 'Only camp staff can do that.' using errcode = '42501';
  end if;
end;
$fn$;

create or replace function public.food_request_cancel_internal(p_request_id uuid, p_rule text, p_reason text)
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare v_n integer;
begin
  update public.scheduled_messages
     set state = 'cancelled', suppressed_reason = p_reason, updated_at = now()
   where subject_type = 'food_request' and subject_id = p_request_id
     and (rule_key = p_rule or rule_key like p_rule || ':%')
     and state = 'scheduled';
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

-- ─── Messages ──────────────────────────────────────────────────────────────────
-- One function writes every food-request message, so the transitions, the nightly planner and
-- the tests all produce the same copy. Every row carries body_text: the text message it would
-- have been, shown to the camp as the preview, ready for when texts are switched on.

create or replace function public.food_request_message_internal(p_request_id uuid, p_rule text)
returns integer language plpgsql security definer set search_path to 'public' as $fn$
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
              || ' hours; the kitchen asks for ' || round(r.cutoff_hours)::text
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
    v_subject := case when r.is_late then 'LATE ' else '' end
      || 'Food request: ' || v_program || ', ' || v_when;
    v_body := public.msg_wrap(
      case when r.is_late then 'Late food request from ' else 'New food request from ' end || public.food_request_html(v_program),
      '<strong>' || public.food_request_html(r.requester_name) || '</strong> needs this for <strong>' || v_when || '</strong>'
      || coalesce(' (' || r.headcount::text || ' people)', '') || ':'
      || v_lines_html
      || coalesce('<p>For: ' || public.food_request_html(nullif(btrim(r.purpose), '')) || '</p>', '')
      || '<p>' || round(r.notice_hours)::text || ' hours notice'
      || case when r.is_late then ' &mdash; <strong style="color:#B4552F">under your ' || round(r.cutoff_hours)::text || '-hour cutoff</strong>' else '' end
      || '.</p><p>Contact: ' || public.food_request_html(coalesce(r.requester_email, '')) || coalesce(' · ' || public.food_request_html(r.requester_phone), '') || '</p>'
      || '<p><a href="' || v_app_link || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Approve or decline</a></p>',
      r.camp_name);
    v_text := case when r.is_late then 'LATE (' || round(r.notice_hours)::text || 'h notice): ' else 'New request: ' end
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

-- The condition-based rules for one request: queue what should be pending, cancel what stopped
-- being true. Called by every transition and by the nightly planner, so both agree.
create or replace function public.food_request_plan_one_internal(p_request_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare v_status text; v_n integer := 0;
begin
  select status into v_status from public.food_requests where id = p_request_id;
  if v_status is null then return 0; end if;

  if v_status in ('approved','ready') then
    v_n := v_n + public.food_request_message_internal(p_request_id, 'pickup_reminder');
    v_n := v_n + public.food_request_message_internal(p_request_id, 'missed_pickup');
  else
    perform public.food_request_cancel_internal(p_request_id, 'pickup_reminder', v_status);
  end if;

  if v_status in ('picked_up','cancelled','declined','submitted') then
    perform public.food_request_cancel_internal(p_request_id, 'missed_pickup', v_status);
  end if;
  if v_status in ('picked_up','cancelled','missed') then
    perform public.food_request_cancel_internal(p_request_id, 'ready_now', v_status);
  end if;
  return v_n;
end;
$fn$;

-- ─── Submitting ────────────────────────────────────────────────────────────────

-- Shared by the signed-in and the no-login entry points. Validates and clamps everything, since
-- the public caller is anyone on the internet.
create or replace function public.food_request_insert_internal(
  p_camp_id uuid, p_program_id uuid, p_source text, p_requested_by uuid, p_payload jsonb)
returns public.food_requests
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_req public.food_requests; v_camp public.camps; v_cutoff numeric; v_notice numeric;
  v_date date; v_time time; v_name text; v_email text; v_line jsonb; v_item public.inventory_items;
  v_qty numeric; v_label text; v_i integer := 0; v_headcount integer; v_notify text;
begin
  select * into v_camp from public.camps where id = p_camp_id and deleted_at is null;
  if v_camp.id is null then raise exception 'This camp is not recognised.' using errcode = '22023'; end if;

  v_name  := left(nullif(btrim(p_payload->>'requester_name'), ''), 120);
  v_email := lower(left(nullif(btrim(p_payload->>'requester_email'), ''), 200));
  if v_name is null then raise exception 'Tell the kitchen who is asking.' using errcode = '22023'; end if;
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That email address does not look right.' using errcode = '22023';
  end if;

  begin
    v_date := (p_payload->>'pickup_date')::date;
    v_time := (p_payload->>'pickup_time')::time;
  exception when others then
    raise exception 'Pick a pickup day and time.' using errcode = '22023';
  end;
  if v_date is null or v_time is null then raise exception 'Pick a pickup day and time.' using errcode = '22023'; end if;

  v_notice := public.food_request_notice_hours(p_camp_id, v_date, v_time, now());
  if v_notice <= 0 then raise exception 'That pickup time has already passed.' using errcode = '22023'; end if;
  if v_notice > 24 * 366 then raise exception 'That pickup is more than a year away.' using errcode = '22023'; end if;

  begin
    v_headcount := nullif(p_payload->>'headcount', '')::integer;
  exception when others then v_headcount := null;
  end;
  if v_headcount is not null and (v_headcount < 0 or v_headcount > 10000) then v_headcount := null; end if;

  v_notify := case when p_payload->>'notify_by' = 'text' and nullif(btrim(p_payload->>'requester_phone'), '') is not null
                   then 'text' else 'email' end;

  if jsonb_typeof(p_payload->'lines') <> 'array' or jsonb_array_length(p_payload->'lines') = 0 then
    raise exception 'Add at least one thing you need.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'lines') > 40 then
    raise exception 'That is more than 40 lines. Split it into two requests.' using errcode = '22023';
  end if;

  select cutoff_hours into v_cutoff from public.food_request_settings where camp_id = p_camp_id;
  v_cutoff := coalesce(v_cutoff, 72);

  insert into public.food_requests (
    camp_id, program_id, requested_by, requester_name, requester_email, requester_phone, notify_by, source,
    pickup_date, pickup_time, purpose, headcount, status, notice_hours, cutoff_hours, is_late)
  values (
    p_camp_id, p_program_id, p_requested_by, v_name, v_email,
    left(nullif(btrim(p_payload->>'requester_phone'), ''), 40), v_notify, p_source,
    v_date, v_time, left(nullif(btrim(p_payload->>'purpose'), ''), 500), v_headcount, 'submitted',
    -- Stored rounded; judged unrounded, so exactly-at-the-cutoff is on time and one second
    -- under is late.
    round(v_notice, 2), v_cutoff, v_notice < v_cutoff)
  returning * into v_req;

  for v_line in select * from jsonb_array_elements(p_payload->'lines') loop
    begin
      v_qty := (v_line->>'qty')::numeric;
    exception when others then v_qty := null;
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then
      raise exception 'Every line needs a quantity above zero.' using errcode = '22023';
    end if;
    v_item := null;
    if nullif(v_line->>'item_id', '') is not null then
      begin
        select * into v_item from public.inventory_items
         where id = (v_line->>'item_id')::uuid and camp_id = p_camp_id;
      exception when invalid_text_representation then v_item := null;
      end;
      if v_item.id is null then
        raise exception 'One of those items is not on this kitchen''s list.' using errcode = '22023';
      end if;
      insert into public.food_request_lines (request_id, camp_id, item_id, label, qty_requested, unit_label,
        unit_in_base, qty_requested_base, note, sort_order)
      values (v_req.id, p_camp_id, v_item.id, v_item.name, v_qty, v_item.stock_unit,
        v_item.stock_unit_in_base, v_qty * v_item.stock_unit_in_base,
        left(nullif(btrim(v_line->>'note'), ''), 300), v_i);
    else
      v_label := left(nullif(btrim(v_line->>'label'), ''), 120);
      if v_label is null then raise exception 'Say what you need on every line.' using errcode = '22023'; end if;
      insert into public.food_request_lines (request_id, camp_id, item_id, label, qty_requested, unit_label, note, sort_order)
      values (v_req.id, p_camp_id, null, v_label, v_qty, left(nullif(btrim(v_line->>'unit_label'), ''), 30),
        left(nullif(btrim(v_line->>'note'), ''), 300), v_i);
    end if;
    v_i := v_i + 1;
  end loop;

  perform public.food_request_message_internal(v_req.id, 'request_received');
  perform public.food_request_message_internal(v_req.id, 'new_request');
  return v_req;
end;
$fn$;

create or replace function public.submit_food_request(p_camp_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_req public.food_requests; v_program uuid; v_payload jsonb := coalesce(p_payload, '{}');
begin
  -- Viewers are read-only everywhere else in the app; asking the kitchen for food is a write.
  perform public.food_request_require_kitchen_internal(p_camp_id);

  if nullif(v_payload->>'program_id', '') is not null then
    select id into v_program from public.food_programs
     where id = (v_payload->>'program_id')::uuid and camp_id = p_camp_id;
    if v_program is null then raise exception 'That program is not in this camp.' using errcode = '22023'; end if;
  end if;

  -- The signed-in person is the requester unless they typed someone else's details.
  if nullif(btrim(v_payload->>'requester_email'), '') is null then
    v_payload := v_payload || jsonb_build_object('requester_email', (select email from auth.users where id = auth.uid()));
  end if;
  if nullif(btrim(v_payload->>'requester_name'), '') is null then
    v_payload := v_payload || jsonb_build_object('requester_name',
      coalesce((select nullif(display_name, '') from public.camp_members where camp_id = p_camp_id and user_id = auth.uid() limit 1),
               (select full_name from public.profiles where id = auth.uid())));
  end if;

  v_req := public.food_request_insert_internal(p_camp_id, v_program, 'app', auth.uid(), v_payload);
  return jsonb_build_object('id', v_req.id, 'status_token', v_req.status_token,
                            'is_late', v_req.is_late, 'notice_hours', v_req.notice_hours);
end;
$fn$;

create or replace function public.submit_food_request_public(p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_program public.food_programs; v_ip text; v_count integer; v_req public.food_requests;
begin
  select p.* into v_program
    from public.food_programs p join public.camps c on c.id = p.camp_id
   where p.request_token = p_token and p.active and c.deleted_at is null;
  if v_program.id is null then
    raise exception 'This request link is not active. Ask the kitchen for a current one.' using errcode = '22023';
  end if;

  -- x-forwarded-for is set by the Supabase edge, not the caller. No header falls back to one
  -- shared bucket rather than to no limit.
  begin
    v_ip := btrim(split_part(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-forwarded-for', ',', 1));
  exception when others then v_ip := null;
  end;
  insert into public.food_request_throttle as t (bucket, window_start, count)
  values (v_program.camp_id::text || ':' || coalesce(nullif(v_ip, ''), 'unknown'), now(), 1)
  on conflict (bucket) do update
    set count        = case when t.window_start < now() - interval '1 hour' then 1 else t.count + 1 end,
        window_start = case when t.window_start < now() - interval '1 hour' then now() else t.window_start end
  returning t.count into v_count;
  if v_count > 10 then
    raise exception 'Too many requests from this device in the last hour. Please try again later, or talk to the kitchen.'
      using errcode = '54000';
  end if;
  if random() < 0.01 then
    delete from public.food_request_throttle where window_start < now() - interval '1 day';
  end if;

  v_req := public.food_request_insert_internal(v_program.camp_id, v_program.id, 'link', null, coalesce(p_payload, '{}'));
  return jsonb_build_object('status_token', v_req.status_token, 'is_late', v_req.is_late, 'notice_hours', v_req.notice_hours);
end;
$fn$;

-- Everything a no-login requester may learn from a program link. Item names and units only: no
-- quantities on hand, no prices, no other program's requests, no people.
create or replace function public.get_food_request_form(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
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
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('pickup_date', q.pickup_date, 'pickup_time', q.pickup_time, 'status', q.status)
                                           order by q.pickup_date, q.pickup_time)
                            from public.food_requests q
                           where q.program_id = v_program.id and q.pickup_date >= current_date - 1
                             and q.status not in ('cancelled','declined')), '[]'::jsonb)
  );
end;
$fn$;

create or replace function public.get_food_request_status(p_status_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
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
    'requester_name', r.requester_name,
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

-- ─── Transitions ───────────────────────────────────────────────────────────────
-- The whole state machine, and the only place it exists:
--   submitted → approved | declined | cancelled
--   approved  → ready | cancelled | missed
--   ready     → picked_up | missed
-- Anything else raises.

create or replace function public.food_request_lock_internal(p_request_id uuid, p_to text)
returns public.food_requests language plpgsql security definer set search_path to 'public' as $fn$
declare v_req public.food_requests; v_ok boolean;
begin
  select * into v_req from public.food_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'That request does not exist.' using errcode = '22023'; end if;
  v_ok := case v_req.status
    when 'submitted' then p_to in ('approved','declined','cancelled')
    when 'approved'  then p_to in ('ready','cancelled','missed')
    when 'ready'     then p_to in ('picked_up','missed')
    else false end;
  if not v_ok then
    raise exception 'A % request cannot be marked %.', replace(v_req.status, '_', ' '), replace(p_to, '_', ' ')
      using errcode = '22023';
  end if;
  return v_req;
end;
$fn$;

create or replace function public.decide_food_request(
  p_request_id uuid, p_decision text, p_lines jsonb default '[]'::jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
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

create or replace function public.mark_food_request_ready(p_request_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_camp uuid;
begin
  select camp_id into v_camp from public.food_requests where id = p_request_id;
  perform public.food_request_require_kitchen_internal(v_camp);
  perform public.food_request_lock_internal(p_request_id, 'ready');
  update public.food_requests set status = 'ready', ready_at = now() where id = p_request_id;
  perform public.food_request_message_internal(p_request_id, 'ready_now');
  perform public.food_request_plan_one_internal(p_request_id);
end;
$fn$;

create or replace function public.mark_food_request_picked_up(p_request_id uuid, p_by_name text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_camp uuid;
begin
  select camp_id into v_camp from public.food_requests where id = p_request_id;
  perform public.food_request_require_kitchen_internal(v_camp);
  perform public.food_request_lock_internal(p_request_id, 'picked_up');
  -- No inventory adjustment, on purpose: approved requests are already projected demand, and the
  -- next count reconciles the book. Writing one here would take the food out twice.
  update public.food_requests
     set status = 'picked_up', picked_up_at = now(), picked_up_by_name = left(nullif(btrim(p_by_name), ''), 120)
   where id = p_request_id;
  perform public.food_request_plan_one_internal(p_request_id);
end;
$fn$;

create or replace function public.mark_food_request_missed(p_request_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_camp uuid;
begin
  select camp_id into v_camp from public.food_requests where id = p_request_id;
  perform public.food_request_require_kitchen_internal(v_camp);
  perform public.food_request_lock_internal(p_request_id, 'missed');
  update public.food_requests set status = 'missed', missed_at = now() where id = p_request_id;
  perform public.food_request_plan_one_internal(p_request_id);
end;
$fn$;

-- Signed in: the person who asked, or the kitchen.
create or replace function public.cancel_food_request(p_request_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_req public.food_requests; v_mine boolean;
begin
  select * into v_req from public.food_requests where id = p_request_id;
  if v_req.id is null or not public.is_camp_member(v_req.camp_id) then
    raise exception 'That request does not exist.' using errcode = '22023';
  end if;
  v_mine := v_req.requested_by is not null and v_req.requested_by = auth.uid();
  if not v_mine and coalesce(public.get_camp_role(v_req.camp_id), '') not in ('admin','staff') then
    raise exception 'Only the person who asked, or the kitchen, can cancel this.' using errcode = '42501';
  end if;
  v_req := public.food_request_lock_internal(p_request_id, 'cancelled');
  update public.food_requests
     set status = 'cancelled', cancelled_at = now(), cancelled_by = case when v_mine then 'requester' else 'kitchen' end
   where id = p_request_id;
  if v_req.status = 'approved' and v_mine then
    perform public.food_request_message_internal(p_request_id, 'request_cancelled');
  end if;
  perform public.food_request_plan_one_internal(p_request_id);
end;
$fn$;

-- No login: whoever holds the status link is the requester.
create or replace function public.cancel_food_request_public(p_status_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_req public.food_requests;
begin
  select * into v_req from public.food_requests where status_token = p_status_token;
  if v_req.id is null then raise exception 'This request link is not recognised.' using errcode = '22023'; end if;
  v_req := public.food_request_lock_internal(v_req.id, 'cancelled');
  update public.food_requests set status = 'cancelled', cancelled_at = now(), cancelled_by = 'requester' where id = v_req.id;
  if v_req.status = 'approved' then
    perform public.food_request_message_internal(v_req.id, 'request_cancelled');
  end if;
  perform public.food_request_plan_one_internal(v_req.id);
  return jsonb_build_object('status', 'cancelled');
end;
$fn$;

-- ─── Programs and settings ─────────────────────────────────────────────────────

create or replace function public.save_food_program(
  p_camp_id uuid, p_id uuid, p_name text, p_lead_name text default null, p_lead_email text default null,
  p_lead_phone text default null, p_color text default null, p_active boolean default true, p_sort_order integer default null)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare v_id uuid;
begin
  perform public.food_request_require_kitchen_internal(p_camp_id);
  if coalesce(btrim(p_name), '') = '' then raise exception 'Give the program a name.' using errcode = '22023'; end if;
  if nullif(btrim(p_lead_email), '') is not null and btrim(p_lead_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'That email address does not look right.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.food_programs (camp_id, name, lead_name, lead_email, lead_phone, color, active, sort_order)
    values (p_camp_id, left(btrim(p_name), 80), left(nullif(btrim(p_lead_name), ''), 120),
            lower(left(nullif(btrim(p_lead_email), ''), 200)), left(nullif(btrim(p_lead_phone), ''), 40),
            left(nullif(btrim(p_color), ''), 20), coalesce(p_active, true),
            coalesce(p_sort_order, (select coalesce(max(sort_order), -1) + 1 from public.food_programs where camp_id = p_camp_id)))
    returning id into v_id;
  else
    update public.food_programs
       set name = left(btrim(p_name), 80), lead_name = left(nullif(btrim(p_lead_name), ''), 120),
           lead_email = lower(left(nullif(btrim(p_lead_email), ''), 200)), lead_phone = left(nullif(btrim(p_lead_phone), ''), 40),
           color = left(nullif(btrim(p_color), ''), 20), active = coalesce(p_active, active),
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id and camp_id = p_camp_id
    returning id into v_id;
    if v_id is null then raise exception 'That program is not in this camp.' using errcode = '22023'; end if;
  end if;
  return v_id;
end;
$fn$;

-- A link that leaked (posted somewhere public, a counselor who left) is replaced, not edited.
create or replace function public.rotate_food_program_link(p_program_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $fn$
declare v_camp uuid; v_token text;
begin
  select camp_id into v_camp from public.food_programs where id = p_program_id;
  perform public.food_request_require_kitchen_internal(v_camp);
  update public.food_programs set request_token = public.gen_qr_token() where id = p_program_id
  returning request_token into v_token;
  return v_token;
end;
$fn$;

create or replace function public.save_food_request_settings(
  p_camp_id uuid, p_cutoff_hours numeric, p_kitchen_emails text[], p_pickup_location text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_emails text[];
begin
  perform public.food_request_require_kitchen_internal(p_camp_id);
  if p_cutoff_hours is null or p_cutoff_hours < 0 or p_cutoff_hours > 720 then
    raise exception 'The notice period must be between 0 and 720 hours.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct lower(btrim(e))), '{}') into v_emails
    from unnest(coalesce(p_kitchen_emails, '{}')) e where nullif(btrim(e), '') is not null;
  if exists (select 1 from unnest(v_emails) e where e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then
    raise exception 'One of those kitchen email addresses does not look right.' using errcode = '22023';
  end if;
  insert into public.food_request_settings (camp_id, cutoff_hours, kitchen_emails, pickup_location)
  values (p_camp_id, p_cutoff_hours, v_emails, left(nullif(btrim(p_pickup_location), ''), 200))
  on conflict (camp_id) do update
    set cutoff_hours = excluded.cutoff_hours, kitchen_emails = excluded.kitchen_emails,
        pickup_location = excluded.pickup_location;
end;
$fn$;

-- The Danger zone wipe. delete_all_commissary_data runs as the caller, and these tables take no
-- client writes, so its DELETEs would silently remove nothing. This does the deleting with the
-- same gate.
create or replace function public.delete_food_request_data(p_camp_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  perform public.food_request_require_kitchen_internal(p_camp_id);
  delete from public.food_request_lines    where camp_id = p_camp_id;
  delete from public.food_requests         where camp_id = p_camp_id;
  delete from public.food_programs         where camp_id = p_camp_id;
  delete from public.food_request_settings where camp_id = p_camp_id;
end;
$fn$;

-- Read from pg_get_functiondef on staging and extended by one line; nothing else changed.
CREATE OR REPLACE FUNCTION public.delete_all_commissary_data(p_camp_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_camp_member(p_camp_id) AND get_camp_role(p_camp_id) IN ('admin','staff')) THEN
    RAISE EXCEPTION 'Not authorized to wipe commissary data for this camp';
  END IF;

  PERFORM delete_food_request_data(p_camp_id);
  DELETE FROM production_prep_tasks     WHERE camp_id = p_camp_id;
  DELETE FROM production_tasks          WHERE camp_id = p_camp_id;
  DELETE FROM production_plans          WHERE camp_id = p_camp_id;
  DELETE FROM purchase_order_lines      WHERE camp_id = p_camp_id;
  DELETE FROM purchase_orders           WHERE camp_id = p_camp_id;
  DELETE FROM commissary_expenses       WHERE camp_id = p_camp_id;
  DELETE FROM menu_entries              WHERE camp_id = p_camp_id;
  DELETE FROM menu_substitutions        WHERE camp_id = p_camp_id;
  DELETE FROM menu_template_entries     WHERE camp_id = p_camp_id;
  DELETE FROM menu_templates            WHERE camp_id = p_camp_id;
  DELETE FROM commissary_diet_counts    WHERE camp_id = p_camp_id;
  DELETE FROM commissary_meal_events    WHERE camp_id = p_camp_id;
  DELETE FROM commissary_menu_courses   WHERE camp_id = p_camp_id;
  DELETE FROM recipe_ingredients        WHERE camp_id = p_camp_id;
  DELETE FROM recipe_steps              WHERE camp_id = p_camp_id;
  DELETE FROM recipes                   WHERE camp_id = p_camp_id;
  DELETE FROM commissary_item_vendors   WHERE camp_id = p_camp_id;
  DELETE FROM inventory_adjustments     WHERE camp_id = p_camp_id;
  DELETE FROM commissary_count_sessions WHERE camp_id = p_camp_id;
  DELETE FROM commissary_storage_map    WHERE camp_id = p_camp_id;
  DELETE FROM camper_restrictions       WHERE camp_id = p_camp_id;
  DELETE FROM campers                   WHERE camp_id = p_camp_id;
  DELETE FROM commissary_files          WHERE camp_id = p_camp_id;
  DELETE FROM inventory_items           WHERE camp_id = p_camp_id;
  DELETE FROM commissary_vendors        WHERE camp_id = p_camp_id;
  DELETE FROM commissary_sessions       WHERE camp_id = p_camp_id;
END;
$function$;

-- ─── The nightly planner hook (replaces the Phase 0 stub; same name and signature) ──

create or replace function public.plan_food_request_messages_internal()
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare r record; v_n integer := 0;
begin
  -- Reached from cron through plan_all_messages, so no member gate (CLAUDE.md trap 4). Only
  -- requests whose pickup is near enough to matter; older ones have nothing left to send.
  for r in select id from public.food_requests where pickup_date >= current_date - 2 loop
    v_n := v_n + public.food_request_plan_one_internal(r.id);
  end loop;
  return v_n;
end;
$fn$;

-- ─── Grants ────────────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE to PUBLIC on every new function; revoking from anon alone leaves it
-- callable. Everything is revoked from all three, then granted back exactly.

do $$
declare f text;
begin
  foreach f in array array[
    'food_request_local_ts(date,time,text)',
    'food_request_notice_hours(uuid,date,time,timestamptz)',
    'food_request_html(text)',
    'food_request_when(date,time)',
    'food_request_qty(numeric)',
    'food_request_kitchen_emails_internal(uuid)',
    'food_request_require_kitchen_internal(uuid)',
    'food_request_cancel_internal(uuid,text,text)',
    'food_request_message_internal(uuid,text)',
    'food_request_plan_one_internal(uuid)',
    'food_request_insert_internal(uuid,uuid,text,uuid,jsonb)',
    'food_request_lock_internal(uuid,text)',
    'plan_food_request_messages_internal()',
    'submit_food_request(uuid,jsonb)',
    'submit_food_request_public(text,jsonb)',
    'get_food_request_form(text)',
    'get_food_request_status(text)',
    'cancel_food_request(uuid)',
    'cancel_food_request_public(text)',
    'decide_food_request(uuid,text,jsonb,text)',
    'mark_food_request_ready(uuid)',
    'mark_food_request_picked_up(uuid,text)',
    'mark_food_request_missed(uuid)',
    'save_food_program(uuid,uuid,text,text,text,text,text,boolean,integer)',
    'rotate_food_program_link(uuid)',
    'save_food_request_settings(uuid,numeric,text[],text)',
    'delete_food_request_data(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;

  -- The no-login front door: a program link and a status link.
  foreach f in array array[
    'submit_food_request_public(text,jsonb)', 'get_food_request_form(text)',
    'get_food_request_status(text)', 'cancel_food_request_public(text)'
  ] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;

  -- Signed in, each with its own gate inside.
  foreach f in array array[
    'submit_food_request(uuid,jsonb)', 'cancel_food_request(uuid)',
    'decide_food_request(uuid,text,jsonb,text)', 'mark_food_request_ready(uuid)',
    'mark_food_request_picked_up(uuid,text)', 'mark_food_request_missed(uuid)',
    'save_food_program(uuid,uuid,text,text,text,text,text,boolean,integer)', 'rotate_food_program_link(uuid)',
    'save_food_request_settings(uuid,numeric,text[],text)', 'delete_food_request_data(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

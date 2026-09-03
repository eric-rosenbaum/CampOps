-- The seam: a rental group's request becomes the property team's work.
--
-- Every other feature in this build is a good version of something a competitor also has. This
-- is the one neither a CMMS nor a retreat-center system can copy, because copying it means
-- owning both halves.
--
-- A coordinator asks for the Lodge with three benches; the camp approves; a set-up work order
-- lands on the housekeeping lead's phone that morning; they tap Done; the group walks into a set
-- room. The whole crossing costs two foreign keys and one function.
--
-- One row per space PER DAY rather than a date range, for two reasons: a room reset between a
-- Friday session and a Saturday session is two jobs, and conflicts are per-day. Times are text,
-- because camps run on "after dinner", not on ISO timestamps.

create table if not exists retreat_space_requests (
  id             uuid primary key default gen_random_uuid(),
  camp_id        uuid not null references camps(id) on delete cascade,
  retreat_id     uuid not null references retreats(id) on delete cascade,
  location_id    uuid not null references locations(id) on delete cascade,
  day_date       date not null,
  start_label    text,
  end_label      text,
  purpose        text,
  expected_count integer,
  layout         text not null default 'open',
  layout_other   text,
  -- The group's words, verbatim. The camp never edits this field; it adds its own note beside
  -- it, so the person moving the benches reads what the group actually asked for.
  setup_notes    text,
  camp_notes     text,
  status         text not null default 'requested',
  response_message text,
  responded_by   text,
  responded_at   timestamptz,
  work_order_id  uuid references issues(id) on delete set null,
  strike_order_id uuid references issues(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table retreat_space_requests drop constraint if exists retreat_space_requests_status_check;
alter table retreat_space_requests add constraint retreat_space_requests_status_check
  check (status in ('requested','approved','declined','countered'));

alter table retreat_space_requests drop constraint if exists retreat_space_requests_layout_check;
alter table retreat_space_requests add constraint retreat_space_requests_layout_check
  check (layout in ('theater','rounds','classroom','open','other'));

create index if not exists rsr_retreat_idx on retreat_space_requests (retreat_id, day_date);
create index if not exists rsr_camp_day_idx on retreat_space_requests (camp_id, day_date, status);
create unique index if not exists rsr_unique_ask
  on retreat_space_requests (retreat_id, location_id, day_date);

alter table issues drop constraint if exists issues_rsr_fkey;
alter table issues add constraint issues_rsr_fkey
  foreign key (retreat_space_request_id) references retreat_space_requests(id) on delete set null;

alter table retreat_space_requests enable row level security;
drop policy if exists rsr_rw on retreat_space_requests;
create policy rsr_rw on retreat_space_requests
  for all using (is_camp_member(camp_id))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'));

alter table retreat_space_requests replica identity full;

-- What the camp needs to see at the moment of approving ------------------------
-- Approval is a judgment call. The system's job is to surface the collision, not to refuse it --
-- some camps genuinely do run two groups through the Lodge on the same afternoon.
create or replace function public.space_request_conflicts(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  with req as (
    select r.*, l.name as location_name, l.is_dorm, l.service_status,
           l.out_of_service_reason, l.expected_back, l.parent_id, l.capacity_seated
    from retreat_space_requests r
    join locations l on l.id = r.location_id
    where r.id = p_request_id
  )
  select jsonb_build_object(
    'double_booked', coalesce((
      select jsonb_agg(jsonb_build_object('retreat', rt.group_name, 'purpose', o.purpose,
                                          'start', o.start_label))
      from retreat_space_requests o
      join retreats rt on rt.id = o.retreat_id
      where o.location_id = (select location_id from req)
        and o.day_date = (select day_date from req)
        and o.id <> p_request_id
        and o.status = 'approved'
    ), '[]'::jsonb),

    -- Some camps use a lodge both ways. Warn, do not block.
    'also_a_dorm', (select is_dorm from req),
    'housed_that_night', coalesce((
      select jsonb_agg(distinct rt.group_name)
      from retreat_housing h
      join retreats rt on rt.id = h.retreat_id
      where h.location_id = (select location_id from req)
        and (select day_date from req) between rt.arrival_date and rt.departure_date
        and rt.id <> (select retreat_id from req)
    ), '[]'::jsonb),

    -- A program space inside a building that is housing a different group: noise and access.
    'building_housing_others', coalesce((
      select jsonb_agg(distinct rt.group_name)
      from retreat_housing h
      join locations hl on hl.id = h.location_id
      join retreats rt on rt.id = h.retreat_id
      where hl.parent_id = (select parent_id from req)
        and (select parent_id from req) is not null
        and (select day_date from req) between rt.arrival_date and rt.departure_date
        and rt.id <> (select retreat_id from req)
    ), '[]'::jsonb),

    -- The one hard stop. Everything else above is a warning.
    'out_of_service', (select service_status from req) = 'out_of_service',
    'out_of_service_reason', (select out_of_service_reason from req),
    'expected_back', (select expected_back from req),
    'over_capacity', coalesce((select expected_count from req), 0)
                     > coalesce((select capacity_seated from req), 2147483647),
    'capacity_seated', (select capacity_seated from req)
  );
$fn$;

grant execute on function public.space_request_conflicts(uuid) to authenticated;

-- Approve, and generate the work -----------------------------------------------
-- TWO work orders, not one. Camps forget the strike, every time, and a rental turnover is
-- set-up plus tear-down without exception. Generating both is the campy part.
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

  -- The group's words travel intact to the person doing the work. That is the whole point: a
  -- coordinator who wrote "three benches along the back wall" should not have it paraphrased by
  -- two people before it reaches the person carrying benches.
  v_body :=
    'For ' || v_retreat.group_name || ' — ' || to_char(r.day_date, 'FMDay FMDD FMMon') ||
    coalesce(', ' || r.start_label, '') || coalesce(' to ' || r.end_label, '') || E'\n' ||
    'Layout: ' || coalesce(nullif(r.layout_other,''), r.layout) ||
    coalesce(' · ' || r.expected_count::text || ' people', '') ||
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
      ' (' || to_char(r.day_date, 'Dy') || ')',
    v_body, array[v_loc.name], array[v_loc.id], 'normal',
    case when v_assignee is null then 'unassigned' else 'assigned' end,
    v_assignee, false, 'retreat', 'housekeeping', r.retreat_id, r.id, r.day_date
  ) returning id into v_setup;

  if v_tmpl is not null then perform public.apply_checklist_template(v_setup, v_tmpl); end if;

  -- One strike per space per retreat, after the last day the group has it. Two Fridays in the
  -- Lodge is two set-ups and one reset, not two resets.
  select max(day_date) into v_last_day from retreat_space_requests
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
      coalesce(v_last_day, r.day_date) + 1
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

grant execute on function public.approve_space_request(uuid, text, text) to authenticated;

-- Editing an approved request must not silently mutate work somebody is standing in front of.
create or replace function public.space_request_reopened()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if old.status = 'approved' and (
       new.day_date is distinct from old.day_date
    or new.layout is distinct from old.layout
    or new.setup_notes is distinct from old.setup_notes
    or new.expected_count is distinct from old.expected_count)
  then
    new.status := 'countered';
    if old.work_order_id is not null then
      insert into issue_comments (camp_id, issue_id, author_id, author_name, body)
      values (old.camp_id, old.work_order_id, null, 'CampCommand',
              'The group changed this request. Re-approve it on the retreat to update this work order.');
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists space_request_reopened_trg on retreat_space_requests;
create trigger space_request_reopened_trg before update on retreat_space_requests
  for each row execute function public.space_request_reopened();

-- The bigger job: turnover on departure ----------------------------------------
-- Program set-ups are the visible half. The larger, more repetitive housekeeping job at any
-- rental camp is turning the beds over between groups, and the system already knows exactly
-- which rooms were assigned to whom and when they leave.
create or replace function public.generate_turnover_work(
  p_retreat_id uuid, p_scope text default 'room'
) returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_retreat retreats; v_n int := 0; v_assignee uuid; v_tmpl uuid; v_issue uuid; h record;
begin
  select * into v_retreat from retreats where id = p_retreat_id;
  if v_retreat.id is null then raise exception 'No such retreat.'; end if;
  if not is_camp_member(v_retreat.camp_id) then raise exception 'Forbidden'; end if;

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
    -- Idempotent: running this twice for one departure does not double the crew's list.
    if exists (
      select 1 from issues
      where retreat_id = p_retreat_id and source = 'retreat' and trade = 'housekeeping'
        and h.target_id = any(location_ids) and title like 'Turn over%'
    ) then continue; end if;

    insert into issues (
      camp_id, title, description, locations, location_ids, priority, status,
      assignee_id, is_public_report, source, trade, retreat_id, due_date
    ) values (
      v_retreat.camp_id,
      'Turn over ' || h.target_name || ' — after ' || v_retreat.group_name,
      'Group departs ' || to_char(v_retreat.departure_date, 'FMDay FMDD FMMon') || '.',
      array[h.target_name], array[h.target_id], 'normal',
      case when v_assignee is null then 'unassigned' else 'assigned' end,
      v_assignee, false, 'retreat', 'housekeeping', p_retreat_id, v_retreat.departure_date
    ) returning id into v_issue;

    if v_tmpl is not null then perform public.apply_checklist_template(v_issue, v_tmpl); end if;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

grant execute on function public.generate_turnover_work(uuid, text) to authenticated;

comment on function public.generate_turnover_work(uuid, text) is
  'One housekeeping work order per assigned room (or building) when a group departs, carrying the cabin-turnover checklist. The same generator aimed at a camp session end date handles session turnover.';

-- The guest portal side ---------------------------------------------------------
-- Only program_space locations, with seated capacity, and only for a retreat whose token this
-- is. A group must never be able to enumerate the camp's whole property from a portal link.
create or replace function public.portal_program_spaces(p_token text)
returns jsonb language sql security definer stable set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name,
           'building', (select p.name from locations p where p.id = l.parent_id),
           'capacity_seated', l.capacity_seated,
           'accessible', l.accessible,
           'notes', l.notes
         ) order by l.sort_order, l.name), '[]'::jsonb)
  from locations l
  where l.camp_id = (select camp_id from retreats where portal_token = p_token)
    and l.program_space and l.is_active and l.service_status <> 'out_of_service';
$fn$;

create or replace function public.portal_space_requests(p_token text)
returns jsonb language sql security definer stable set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'location_id', r.location_id,
           'location_name', l.name, 'day_date', r.day_date,
           'start_label', r.start_label, 'end_label', r.end_label,
           'purpose', r.purpose, 'expected_count', r.expected_count,
           'layout', r.layout, 'layout_other', r.layout_other,
           'setup_notes', r.setup_notes, 'status', r.status,
           'response_message', r.response_message
         ) order by r.day_date, l.name), '[]'::jsonb)
  from retreat_space_requests r
  join locations l on l.id = r.location_id
  where r.retreat_id = (select id from retreats where portal_token = p_token);
$fn$;

create or replace function public.portal_save_space_request(
  p_token text, p_location_id uuid, p_day_date date,
  p_start_label text default null, p_end_label text default null,
  p_purpose text default null, p_expected_count integer default null,
  p_layout text default 'open', p_layout_other text default null,
  p_setup_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; v_ok boolean; v_id uuid;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;
  if public.portal_link_expired(v_retreat.departure_date) then
    raise exception 'This link has expired.' using errcode='22023';
  end if;

  select l.program_space and l.is_active and l.service_status <> 'out_of_service'
    into v_ok from locations l where l.id = p_location_id and l.camp_id = v_retreat.camp_id;
  if not coalesce(v_ok, false) then
    raise exception 'That space is not available to book.' using errcode='22023';
  end if;

  insert into retreat_space_requests (
    camp_id, retreat_id, location_id, day_date, start_label, end_label, purpose,
    expected_count, layout, layout_other, setup_notes
  ) values (
    v_retreat.camp_id, v_retreat.id, p_location_id, p_day_date,
    nullif(btrim(coalesce(p_start_label,'')),''), nullif(btrim(coalesce(p_end_label,'')),''),
    left(nullif(btrim(coalesce(p_purpose,'')),''), 200), p_expected_count,
    coalesce(p_layout,'open'), nullif(btrim(coalesce(p_layout_other,'')),''),
    left(nullif(btrim(coalesce(p_setup_notes,'')),''), 2000)
  )
  on conflict (retreat_id, location_id, day_date) do update set
    start_label = excluded.start_label, end_label = excluded.end_label,
    purpose = excluded.purpose, expected_count = excluded.expected_count,
    layout = excluded.layout, layout_other = excluded.layout_other,
    setup_notes = excluded.setup_notes, updated_at = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

create or replace function public.portal_delete_space_request(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_retreat_id uuid;
begin
  select id into v_retreat_id from retreats where portal_token = p_token;
  if v_retreat_id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;
  -- A group may withdraw its own ask, but not one the camp has already turned into work.
  delete from retreat_space_requests
   where id = p_id and retreat_id = v_retreat_id and status in ('requested','countered');
end;
$fn$;

revoke execute on function public.portal_program_spaces(text) from public;
revoke execute on function public.portal_space_requests(text) from public;
grant execute on function public.portal_program_spaces(text) to anon, authenticated;
grant execute on function public.portal_space_requests(text) to anon, authenticated;
grant execute on function public.portal_save_space_request(text, uuid, date, text, text, text, integer, text, text, text) to anon, authenticated;
grant execute on function public.portal_delete_space_request(text, uuid) to anon, authenticated;

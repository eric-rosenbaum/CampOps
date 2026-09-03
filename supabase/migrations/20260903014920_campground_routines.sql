-- Routines: rebuilding recurrence so that it exists.
--
-- issues.is_recurring and recurring_interval were written by the log-issue modal and read by
-- nobody. No generator, no scheduler, no next-due. A camp ticked "recurring: monthly" on filter
-- changes and believed it was handled, which is worse than the feature being absent.
--
-- It never worked because it was modelled wrong. An issue is an EVENT; a recurrence is a
-- TEMPLATE. A boolean on the event cannot say "every third Tuesday, housekeeping, only between
-- June and August, with these eleven steps."
--
-- Occurrences are materialized as real issues rather than computed on the fly, because a virtual
-- occurrence cannot be assigned, photographed, commented on, checklisted or counted in the
-- season review -- and all five of those are things this build adds.

create table if not exists work_schedules (
  id            uuid primary key default gen_random_uuid(),
  camp_id       uuid not null references camps(id) on delete cascade,
  title         text not null,
  description   text,
  trade         text not null default 'maintenance',
  priority      text not null default 'normal',
  location_ids  uuid[] not null default '{}',
  locations     text[] not null default '{}',      -- denormalized names, same as issues
  asset_id      uuid references camp_assets(id) on delete set null,
  assignee_id   uuid,
  staff_group_id uuid references staff_groups(id) on delete set null,
  vendor_id     uuid references service_vendors(id) on delete set null,
  checklist_template_id uuid references work_checklist_templates(id) on delete set null,

  cadence       text not null,
  interval_count integer not null default 1,
  by_weekday    integer[],        -- 0=Sunday .. 6=Saturday
  by_monthday   integer,
  anchor_date   date,
  days_relative_to_opening integer,
  meter_interval integer,         -- engine hours or miles between services
  meter_last_at  integer,

  active_from   date,
  active_until  date,
  generate_ahead_days integer not null default 14,
  -- Fixed calendar by default: filters get changed monthly whether or not you were late, so
  -- closing occurrence N does not schedule N+1 from the close date.
  reschedule_from text not null default 'due_date',

  last_generated_on date,
  missed_count  integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table work_schedules drop constraint if exists work_schedules_cadence_check;
alter table work_schedules add constraint work_schedules_cadence_check
  check (cadence in ('daily','weekly','monthly','annually','season_relative','on_turnover','meter'));

alter table work_schedules drop constraint if exists work_schedules_reschedule_check;
alter table work_schedules add constraint work_schedules_reschedule_check
  check (reschedule_from in ('due_date','completed_at'));

alter table work_schedules drop constraint if exists work_schedules_trade_check;
alter table work_schedules add constraint work_schedules_trade_check
  check (trade in ('maintenance','housekeeping','grounds','kitchen','it'));

create index if not exists work_schedules_camp_idx on work_schedules (camp_id, is_active);

comment on table work_schedules is
  'Recurring work, shown to camps as "Routines". Generates real issues rows in a rolling window rather than a year of rows on day one.';
comment on column work_schedules.active_from is
  'Season window. Without it a daily routine runs in January, and a camp that finds January work in its list stops trusting the whole queue.';

alter table issues drop constraint if exists issues_schedule_id_fkey;
alter table issues add constraint issues_schedule_id_fkey
  foreign key (schedule_id) references work_schedules(id) on delete set null;

-- Idempotent generation. Re-running the nightly job, or a page load racing it, cannot duplicate
-- an occurrence.
create unique index if not exists issues_schedule_due_key
  on issues (schedule_id, due_date) where schedule_id is not null;

alter table work_schedules enable row level security;
drop policy if exists work_schedules_read on work_schedules;
create policy work_schedules_read on work_schedules for select using (is_camp_member(camp_id));
drop policy if exists work_schedules_write on work_schedules;
create policy work_schedules_write on work_schedules
  for all using (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'))
  with check (is_camp_member(camp_id) and get_camp_role(camp_id) in ('admin','staff'));

alter table work_schedules replica identity full;

-- The dates a schedule is due between two bounds ------------------------------
create or replace function public.schedule_due_dates(
  p_schedule work_schedules, p_from date, p_through date
) returns setof date language plpgsql stable set search_path = public as $fn$
declare
  v_anchor date := coalesce(p_schedule.anchor_date, p_schedule.active_from, p_from);
  v_n      int  := greatest(1, coalesce(p_schedule.interval_count, 1));
  d        date;
  v_open   date;
begin
  if p_through < p_from then return; end if;

  case p_schedule.cadence
    when 'daily' then
      d := p_from;
      while d <= p_through loop
        if (d - v_anchor) % v_n = 0 then return next d; end if;
        d := d + 1;
      end loop;

    when 'weekly' then
      d := p_from;
      while d <= p_through loop
        -- On-interval week, and either an explicitly listed weekday or the anchor's weekday.
        if (floor((d - v_anchor) / 7.0)::int) % v_n = 0
           and (
             (p_schedule.by_weekday is not null and array_length(p_schedule.by_weekday, 1) > 0
               and extract(dow from d)::int = any(p_schedule.by_weekday))
             or ((p_schedule.by_weekday is null or array_length(p_schedule.by_weekday, 1) is null)
               and extract(dow from d) = extract(dow from v_anchor))
           )
        then return next d; end if;
        d := d + 1;
      end loop;

    when 'monthly' then
      -- Walk months, not days, so "the 31st" lands on the last day of a short month rather than
      -- silently skipping February.
      d := date_trunc('month', p_from)::date;
      while d <= p_through loop
        if (((extract(year from d)::int * 12 + extract(month from d)::int)
            - (extract(year from v_anchor)::int * 12 + extract(month from v_anchor)::int)) % v_n) = 0
        then
          v_open := least(
            (d + (coalesce(p_schedule.by_monthday, extract(day from v_anchor)::int) - 1))::date,
            (date_trunc('month', d) + interval '1 month - 1 day')::date
          );
          if v_open between p_from and p_through then return next v_open; end if;
        end if;
        d := (d + interval '1 month')::date;
      end loop;

    when 'annually' then
      for i in 0..10 loop
        v_open := make_date(extract(year from p_from)::int + i,
                            extract(month from v_anchor)::int,
                            least(extract(day from v_anchor)::int, 28));
        if v_open > p_through then exit; end if;
        if v_open >= p_from
           and ((extract(year from v_open)::int - extract(year from v_anchor)::int) % v_n) = 0
        then return next v_open; end if;
      end loop;

    when 'season_relative' then
      -- One occurrence per season, measured from opening day, exactly like Pre/Post Camp.
      for v_open in
        select (s.opening_date + coalesce(p_schedule.days_relative_to_opening, 0))::date
        from seasons s where s.camp_id = p_schedule.camp_id
      loop
        if v_open between p_from and p_through then return next v_open; end if;
      end loop;

    else
      return;   -- on_turnover and meter are event-driven, not calendar-driven
  end case;
end;
$fn$;

-- Generate the window --------------------------------------------------------
create or replace function public.generate_scheduled_work(
  p_camp_id uuid default null, p_through date default null
) returns integer language plpgsql security definer set search_path = public as $fn$
declare
  s          work_schedules;
  v_due      date;
  v_from     date;
  v_through  date;
  v_created  int := 0;
  v_open_id  uuid;
  v_open_due date;
  v_issue_id uuid;
  v_assignee uuid;
begin
  for s in
    select * from work_schedules
    where is_active
      and (p_camp_id is null or camp_id = p_camp_id)
      and cadence not in ('on_turnover','meter')
  loop
    v_through := coalesce(p_through, current_date + s.generate_ahead_days);
    if s.active_until is not null then v_through := least(v_through, s.active_until); end if;

    -- Start from the day after we last generated, or from the window opening, whichever is
    -- later -- never from the far past, or activating an old routine backfills a year of work.
    v_from := greatest(
      coalesce(s.last_generated_on + 1, current_date),
      coalesce(s.active_from, current_date),
      current_date
    );

    for v_due in select * from public.schedule_due_dates(s, v_from, v_through) loop
      -- THE RULE THAT DECIDES WHETHER PEOPLE KEEP THIS.
      --
      -- If the last occurrence is still open when the next one comes due, do not create a second
      -- row. Bump the open one and count the miss, so the camp sees "3 cycles behind" instead of
      -- three identical rows shouting the same thing. Every recurring-task system that stacks
      -- duplicates gets muted inside a month, and a muted queue is a dead module.
      select id, due_date into v_open_id, v_open_due
      from issues
      where schedule_id = s.id and status <> 'resolved'
      order by due_date asc limit 1;

      if v_open_id is not null then
        if v_open_due is null or v_open_due < v_due then
          update issues set due_date = v_due, updated_at = now() where id = v_open_id;
          update work_schedules set missed_count = missed_count + 1 where id = s.id;
        end if;
        continue;
      end if;

      if exists (select 1 from issues where schedule_id = s.id and due_date = v_due) then
        continue;
      end if;

      v_assignee := coalesce(s.assignee_id, public.route_work(s.camp_id, s.trade));

      insert into issues (
        camp_id, title, description, locations, location_ids, priority, status,
        assignee_id, reported_by_id, is_public_report, source, trade, asset_id,
        vendor_id, schedule_id, due_date
      ) values (
        s.camp_id, s.title, coalesce(s.description, ''), s.locations, s.location_ids,
        s.priority, case when v_assignee is null then 'unassigned' else 'assigned' end,
        v_assignee, null, false, 'routine', s.trade, s.asset_id,
        s.vendor_id, s.id, v_due
      ) returning id into v_issue_id;

      if s.checklist_template_id is not null then
        perform public.apply_checklist_template(v_issue_id, s.checklist_template_id);
      end if;

      v_created := v_created + 1;
    end loop;

    update work_schedules set last_generated_on = v_through where id = s.id;
  end loop;

  return v_created;
end;
$fn$;

grant execute on function public.generate_scheduled_work(uuid, date) to authenticated;

comment on function public.generate_scheduled_work(uuid, date) is
  'Materializes routine occurrences into issues. Idempotent. Called nightly by pg_cron across all camps, and opportunistically on module load so staging and demo camps stay correct without waiting for a scheduled job.';

-- Meter-driven routines ------------------------------------------------------
-- "Service the mower every 250 hours" is the most camp-accurate PM rule there is. It is not a
-- calendar, so it fires when a reading is recorded rather than when a day arrives.
create or replace function public.record_asset_meter(
  p_asset_id uuid, p_reading integer
) returns integer language plpgsql security definer set search_path = public as $fn$
declare
  s work_schedules; v_camp uuid; v_created int := 0; v_assignee uuid; v_issue uuid;
begin
  select camp_id into v_camp from camp_assets where id = p_asset_id;
  if v_camp is null or not is_camp_member(v_camp) then raise exception 'Forbidden'; end if;

  update camp_assets set meter_reading = p_reading, meter_reading_at = now() where id = p_asset_id;

  for s in
    select * from work_schedules
    where camp_id = v_camp and asset_id = p_asset_id and cadence = 'meter' and is_active
  loop
    if s.meter_interval is null or s.meter_interval <= 0 then continue; end if;
    if p_reading < coalesce(s.meter_last_at, 0) + s.meter_interval then continue; end if;
    if exists (select 1 from issues where schedule_id = s.id and status <> 'resolved') then continue; end if;

    v_assignee := coalesce(s.assignee_id, public.route_work(v_camp, s.trade));
    insert into issues (
      camp_id, title, description, locations, location_ids, priority, status,
      assignee_id, is_public_report, source, trade, asset_id, schedule_id, due_date
    ) values (
      v_camp, s.title,
      coalesce(s.description,'') || case when s.description is null then '' else E'\n\n' end
        || 'Meter reading at generation: ' || p_reading,
      s.locations, s.location_ids, s.priority,
      case when v_assignee is null then 'unassigned' else 'assigned' end,
      v_assignee, false, 'routine', s.trade, p_asset_id, s.id, current_date
    ) returning id into v_issue;

    if s.checklist_template_id is not null then
      perform public.apply_checklist_template(v_issue, s.checklist_template_id);
    end if;

    update work_schedules set meter_last_at = p_reading where id = s.id;
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$fn$;

-- The reading itself had nowhere to live: odometer_at_service and hours_at_service exist only on
-- service records, so the fleet's current hours were a trail of past services and nothing else.
alter table camp_assets add column if not exists meter_reading    integer;
alter table camp_assets add column if not exists meter_reading_at timestamptz;
alter table camp_assets add column if not exists meter_unit       text;

comment on column camp_assets.meter_reading is
  'Current odometer or hour-meter reading, captured on return (which already asks for fuel and condition). Meter routines read this.';

grant execute on function public.record_asset_meter(uuid, integer) to authenticated;

-- Advance a routine when its occurrence closes --------------------------------
create or replace function public.schedule_advance_on_close()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.schedule_id is not null and new.status = 'resolved' and coalesce(old.status,'') <> 'resolved' then
    perform public.generate_scheduled_work(new.camp_id, null);
  end if;
  return new;
end;
$fn$;

drop trigger if exists schedule_advance_on_close_trg on issues;
create trigger schedule_advance_on_close_trg after update of status on issues
  for each row execute function public.schedule_advance_on_close();

-- Migrate the dead checkbox ---------------------------------------------------
-- Every issue that claimed to recur becomes a real schedule, with the issue itself as its first
-- occurrence. Nothing is lost and the camp's intent finally does something.
do $mig$
declare r record; v_sched uuid;
begin
  for r in select * from issues where is_recurring and recurring_interval is not null and schedule_id is null loop
    insert into work_schedules (
      camp_id, title, description, trade, priority, location_ids, locations,
      assignee_id, cadence, interval_count, anchor_date, active_from, is_active
    ) values (
      r.camp_id, r.title, r.description, coalesce(r.trade,'maintenance'), r.priority,
      r.location_ids, r.locations, r.assignee_id,
      case r.recurring_interval
        when 'daily' then 'daily' when 'weekly' then 'weekly'
        when 'monthly' then 'monthly' else 'annually' end,
      1, coalesce(r.due_date, r.created_at::date), coalesce(r.due_date, r.created_at::date), true
    ) returning id into v_sched;

    update issues set schedule_id = v_sched where id = r.id;
  end loop;
end;
$mig$;

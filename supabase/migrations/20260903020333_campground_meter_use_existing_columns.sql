-- Correcting a duplicate notion of one fact.
--
-- camp_assets already carried current_odometer, current_hours, tracks_odometer and tracks_hours.
-- The previous migration added meter_reading / meter_reading_at / meter_unit alongside them,
-- which is a second answer to the same question and precisely the mistake this whole build is
-- meant to avoid. The existing columns win; the new ones go.

alter table camp_assets drop column if exists meter_reading;
alter table camp_assets drop column if exists meter_reading_at;
alter table camp_assets drop column if exists meter_unit;

-- Which meter a routine counts against is a property of the ROUTINE, not of the asset: a mower
-- tracked in hours and a truck tracked in miles both take the same shape of rule.
alter table work_schedules add column if not exists meter_kind text not null default 'hours';
alter table work_schedules drop constraint if exists work_schedules_meter_kind_check;
alter table work_schedules add constraint work_schedules_meter_kind_check
  check (meter_kind in ('hours','odometer'));

create or replace function public.record_asset_meter(
  p_asset_id uuid, p_reading integer, p_kind text default 'hours'
) returns integer language plpgsql security definer set search_path = public as $fn$
declare
  s work_schedules; v_camp uuid; v_created int := 0; v_assignee uuid; v_issue uuid; v_current int;
begin
  select camp_id into v_camp from camp_assets where id = p_asset_id;
  if v_camp is null or not is_camp_member(v_camp) then raise exception 'Forbidden'; end if;

  -- A meter only ever goes up. A typo that moves it backwards would make every routine due at
  -- once, so it is refused rather than absorbed.
  select case when p_kind = 'odometer' then current_odometer else current_hours end
    into v_current from camp_assets where id = p_asset_id;
  if v_current is not null and p_reading < v_current then
    raise exception 'That reading (%) is lower than the last one recorded (%). Check the digits.',
      p_reading, v_current using errcode = '22023';
  end if;

  if p_kind = 'odometer' then
    update camp_assets set current_odometer = p_reading, updated_at = now() where id = p_asset_id;
  else
    update camp_assets set current_hours = p_reading, updated_at = now() where id = p_asset_id;
  end if;

  for s in
    select * from work_schedules
    where camp_id = v_camp and asset_id = p_asset_id and cadence = 'meter'
      and is_active and meter_kind = p_kind
  loop
    if s.meter_interval is null or s.meter_interval <= 0 then continue; end if;
    if p_reading < coalesce(s.meter_last_at, 0) + s.meter_interval then continue; end if;
    -- Same one-open-occurrence rule as the calendar cadences.
    if exists (select 1 from issues where schedule_id = s.id and status <> 'resolved') then continue; end if;

    v_assignee := coalesce(s.assignee_id, public.route_work(v_camp, s.trade));
    insert into issues (
      camp_id, title, description, locations, location_ids, priority, status,
      assignee_id, is_public_report, source, trade, asset_id, schedule_id, due_date
    ) values (
      v_camp, s.title,
      coalesce(s.description,'') || case when s.description is null then '' else E'\n\n' end
        || 'Due at ' || (coalesce(s.meter_last_at,0) + s.meter_interval)::text || ' ' || p_kind
        || '; reading when this was raised: ' || p_reading::text || '.',
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

grant execute on function public.record_asset_meter(uuid, integer, text) to authenticated;
drop function if exists public.record_asset_meter(uuid, integer);

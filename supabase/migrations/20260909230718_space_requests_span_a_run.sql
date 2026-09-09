-- One ask, however many days it covers.
--
-- A group that wanted the dining hall for all four days of their stay filed four requests, and
-- the camp approved four times and got four set-up work orders for a room nobody was going to
-- rearrange in between. The reason it was built per-day was real -- a Friday session and a
-- Saturday session ARE two resets -- but that is a different case from "we have this room all
-- week", and the per-day shape could not express the second one at all.
--
-- A request now carries a date range. Contiguous days are one ask, one approval, one set-up and
-- one strike; days that genuinely are separate sessions are still separate asks, because the
-- portal groups a selection into contiguous runs rather than one row per tick.

alter table retreat_space_requests add column if not exists end_date date;
update retreat_space_requests set end_date = day_date where end_date is null;
alter table retreat_space_requests alter column end_date set not null;

alter table retreat_space_requests drop constraint if exists space_request_range;
alter table retreat_space_requests add constraint space_request_range
  check (end_date >= day_date);

comment on column retreat_space_requests.day_date is
  'First day of the run. Kept as day_date rather than renamed to start_date: it is in the unique key, several RPCs and the iOS client.';
comment on column retreat_space_requests.end_date is
  'Last day of the run, inclusive. Equal to day_date for a single-day ask.';

create or replace function public.portal_save_space_request(
  p_token text, p_location_id uuid, p_day_date date, p_end_date date,
  p_start_label text default null, p_end_label text default null, p_purpose text default null,
  p_expected_count int default null, p_layout text default 'open',
  p_layout_other text default null, p_setup_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; v_ok boolean; v_id uuid; v_end date := coalesce(p_end_date, p_day_date);
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;
  if public.portal_link_expired(v_retreat.departure_date) then
    raise exception 'This link has expired.' using errcode='22023';
  end if;
  if v_end < p_day_date then
    raise exception 'That run ends before it starts.' using errcode='22023';
  end if;

  select l.program_space and l.is_active and l.service_status <> 'out_of_service'
    into v_ok from locations l where l.id = p_location_id and l.camp_id = v_retreat.camp_id;
  if not coalesce(v_ok, false) then
    raise exception 'That space is not available to book.' using errcode='22023';
  end if;

  -- Two overlapping runs for one room cannot both be true, and silently merging them would
  -- quietly rewrite an ask the camp may already have approved.
  if exists (
    select 1 from retreat_space_requests x
    where x.retreat_id = v_retreat.id
      and x.location_id = p_location_id
      and x.day_date <> p_day_date
      and x.status <> 'declined'
      and daterange(x.day_date, x.end_date, '[]') && daterange(p_day_date, v_end, '[]')
  ) then
    raise exception 'You already have that space on some of those days.' using errcode='22023';
  end if;

  insert into retreat_space_requests (
    camp_id, retreat_id, location_id, day_date, end_date, start_label, end_label, purpose,
    expected_count, layout, layout_other, setup_notes
  ) values (
    v_retreat.camp_id, v_retreat.id, p_location_id, p_day_date, v_end,
    nullif(btrim(coalesce(p_start_label,'')),''), nullif(btrim(coalesce(p_end_label,'')),''),
    left(nullif(btrim(coalesce(p_purpose,'')),''), 200), p_expected_count,
    coalesce(p_layout,'open'), nullif(btrim(coalesce(p_layout_other,'')),''),
    left(nullif(btrim(coalesce(p_setup_notes,'')),''), 2000)
  )
  on conflict (retreat_id, location_id, day_date) do update set
    end_date = excluded.end_date,
    start_label = excluded.start_label, end_label = excluded.end_label,
    purpose = excluded.purpose, expected_count = excluded.expected_count,
    layout = excluded.layout, layout_other = excluded.layout_other,
    setup_notes = excluded.setup_notes, updated_at = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.portal_save_space_request(text, uuid, date, date, text, text, text, int, text, text, text) to anon, authenticated;

-- Three things a review of the retreats module turned up.

-- ── 1 · A retreat arrives at a time, not on a day ───────────────────────────
-- "They get in at 7pm Wednesday" decides whether dinner is cooked that night and whether the
-- cabins have to be ready by lunchtime. Only the date was modelled, so it lived in somebody's
-- head. Separate `time` columns for the same reason due_time is one: these dates are camp-local
-- calendar days and must not become instants.
alter table public.retreats
  add column if not exists arrival_time   time,
  add column if not exists departure_time time;

comment on column public.retreats.arrival_time is
  'Camp-local clock time the group gets in, or null for "some time that day". Drives the calendar label and what the kitchen expects.';

-- ── 2 · Dietary needs the coordinator can actually enter ────────────────────
-- retreats.dietary_flags was read in two places and written in none: null on every retreat, with
-- no field anywhere that sets it. The camp saw "Dietary flags: None flagged" and had no way to
-- know whether that meant none or unasked. The group is the one who knows, so the group enters it.
create or replace function public.portal_save_dietary(p_token text, p_flags jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_r retreats; v_clean jsonb := '{}'::jsonb; k text; v int;
begin
  select * into v_r from retreats where portal_token = p_token;
  if v_r.id is null then raise exception 'This link is not recognised.'; end if;

  -- Counts only, and only positive ones. A zero is the same as not saying it, and storing zeros
  -- would make the camp's "4 vegetarian, 0 vegan" read as a considered answer about vegans.
  if jsonb_typeof(p_flags) = 'object' then
    for k, v in select key, (value #>> '{}')::int from jsonb_each(p_flags)
    loop
      if v is not null and v > 0 then
        v_clean := v_clean || jsonb_build_object(k, v);
      end if;
    end loop;
  end if;

  update retreats
     set dietary_flags = case when v_clean = '{}'::jsonb then null else v_clean end,
         updated_at = now()
   where id = v_r.id;

  return jsonb_build_object('ok', true, 'flags', v_clean);
end;
$fn$;

grant execute on function public.portal_save_dietary(text, jsonb) to anon, authenticated;

-- ── 3 · Turnover for camps that never lock housing ──────────────────────────
-- Turnover work is raised when the camp locks the rooming plan and says yes. A camp that never
-- locks -- because the group sorts its own rooms, or because nobody got to it -- gets none at all,
-- and the cabins a departing group slept in are nobody's job.
--
-- So the nightly run raises it on the departure date as a fallback. Idempotent, and it only fires
-- for groups that actually had rooms: generate_turnover_work_internal skips a retreat with no
-- housing rows, and skips any room that already has a turnover on the board.
create or replace function public.generate_departure_turnovers()
returns integer language plpgsql security definer set search_path = public as $fn$
declare r record; v_total int := 0;
begin
  for r in
    select rt.id
      from retreats rt
     where rt.departure_date = current_date
       and rt.status not in ('cancelled', 'inquiry')
       and exists (select 1 from retreat_housing h
                    where h.retreat_id = rt.id and h.location_id is not null)
  loop
    v_total := v_total + public.generate_turnover_work_internal(r.id, 'room');
  end loop;
  return v_total;
end;
$fn$;

comment on function public.generate_departure_turnovers() is
  'Nightly safety net: raises turnover work for groups leaving today that never had their housing locked. Idempotent -- a camp that DID lock already has the work and this adds nothing.';

-- Scheduled alongside the other nightly work.
select cron.schedule('campcommand-departure-turnovers', '30 6 * * *',
                     'select public.generate_departure_turnovers();')
where not exists (select 1 from cron.job where jobname = 'campcommand-departure-turnovers');

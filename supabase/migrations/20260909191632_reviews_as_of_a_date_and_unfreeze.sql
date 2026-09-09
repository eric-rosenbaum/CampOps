-- Freezing a review stored today's numbers and nothing could undo it, so a director who froze
-- mid-season was stuck with a half-finished year and no way back. And the only snapshot you
-- could take was "now", which is the one moment you do not need to record -- the useful one is
-- "the board as it stood the day we closed", taken in November.
--
-- What an as-of date can honestly rebuild: issues carry created_at, assigned_at and resolved_at,
-- so reported / closed / still-open / carry-over / medians are all reconstructable at any past
-- instant. What it cannot: actual_cost, trade, priority and assignee are current values with no
-- history, so those read as they are today. The payload says so rather than implying otherwise.

alter table review_snapshots
  add column if not exists as_of timestamptz not null default now();

-- One snapshot per period per as-of instant, so a camp can keep "as at closing day" beside
-- "as at the audit" without one overwriting the other.
drop index if exists review_snapshots_key;
create unique index if not exists review_snapshots_key
  on review_snapshots (camp_id, kind, period_from, period_to, as_of);

create or replace function public.season_review(
  p_camp_id uuid, p_from date, p_to date, p_as_of timestamptz
) returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb; v_as_of timestamptz := coalesce(p_as_of, now());
begin
  if not is_camp_member(p_camp_id) then raise exception 'Forbidden'; end if;

  with scoped as (
    select i.*,
           -- Closed *as at* the cut-off, not closed today.
           (i.resolved_at is not null and i.resolved_at <= v_as_of) as was_closed,
           case when i.assigned_at is not null and i.assigned_at <= v_as_of
                then i.assigned_at end as assigned_by_then,
           case when i.resolved_at is not null and i.resolved_at <= v_as_of
                then i.resolved_at end as resolved_by_then
    from issues i
    where i.camp_id = p_camp_id
      and i.created_at::date between p_from and p_to
      and i.created_at <= v_as_of
  ),
  timing as (
    select trade, priority,
      percentile_cont(0.5) within group (
        order by extract(epoch from (assigned_by_then - created_at))/3600.0)
        filter (where assigned_by_then is not null) as hrs_to_assign,
      percentile_cont(0.5) within group (
        order by extract(epoch from (resolved_by_then - created_at))/3600.0)
        filter (where resolved_by_then is not null) as hrs_to_close,
      count(*) filter (where resolved_by_then is not null) as n_timed
    from scoped group by trade, priority
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'as_of', v_as_of,
    -- True when the numbers are not simply "right now", so the interface can say so.
    'is_historical', v_as_of < now() - interval '1 minute',

    'volume', jsonb_build_object(
      'reported', (select count(*) from scoped),
      'closed',   (select count(*) from scoped where was_closed),
      'open',     (select count(*) from scoped where not was_closed),
      'by_trade', coalesce((select jsonb_object_agg(trade, n) from (
                    select trade, count(*) as n from scoped group by trade) t), '{}'::jsonb),
      'by_week',  coalesce((select jsonb_agg(jsonb_build_object(
                    'week', wk, 'reported', rep, 'closed', cl) order by wk) from (
                      select date_trunc('week', created_at)::date as wk,
                             count(*) as rep,
                             count(*) filter (where was_closed) as cl
                      from scoped group by 1) w), '[]'::jsonb)),

    'timing', coalesce((select jsonb_agg(jsonb_build_object(
                'trade', trade, 'priority', priority,
                'median_hours_to_assign', round(hrs_to_assign::numeric, 1),
                'median_hours_to_close',  round(hrs_to_close::numeric, 1),
                'sample', n_timed)) from timing), '[]'::jsonb),

    'locations', coalesce((select jsonb_agg(x order by (x->>'count')::int desc) from (
        select jsonb_build_object(
          'location', l.name, 'count', count(*),
          'open_days', round(sum(extract(epoch from (coalesce(s.resolved_by_then, v_as_of) - s.created_at))/86400.0)::numeric, 0),
          'cost', coalesce(sum(s.actual_cost), 0)) as x
        from scoped s
        join locations l on l.id = s.location_ids[1]
        group by l.name order by count(*) desc limit 12) t), '[]'::jsonb),

    'assets', coalesce((select jsonb_agg(x order by (x->>'cost')::numeric desc nulls last) from (
        select jsonb_build_object(
          'asset', a.name, 'count', count(*),
          'cost', coalesce(sum(s.actual_cost), 0),
          'days_out', round(sum(extract(epoch from (coalesce(s.resolved_by_then, v_as_of) - s.created_at))/86400.0)::numeric, 0)) as x
        from scoped s join camp_assets a on a.id = s.asset_id
        group by a.name order by coalesce(sum(s.actual_cost),0) desc limit 12) t), '[]'::jsonb),

    'workload', coalesce((select jsonb_agg(x order by (x->>'closed')::int desc) from (
        select jsonb_build_object(
          'name', coalesce(p.full_name, 'Unassigned'),
          'closed', count(*) filter (where s.was_closed),
          'still_open', count(*) filter (where not s.was_closed),
          'median_hours_to_close', round(percentile_cont(0.5) within group (
              order by extract(epoch from (s.resolved_by_then - s.created_at))/3600.0)
              filter (where s.resolved_by_then is not null)::numeric, 1),
          'minutes_logged', coalesce(sum(s.minutes_spent), 0)) as x
        from scoped s left join profiles p on p.id = s.assignee_id
        where s.assignee_id is not null
        group by p.full_name) t), '[]'::jsonb),

    'sources', coalesce((select jsonb_object_agg(coalesce(source,'unknown'), n) from (
        select source, count(*) as n from scoped group by source) t), '{}'::jsonb),

    'routines', jsonb_build_object(
      'active',  (select count(*) from work_schedules where camp_id = p_camp_id and is_active),
      'generated', (select count(*) from scoped where source = 'routine'),
      'behind',  coalesce((select jsonb_agg(jsonb_build_object('title', title, 'cycles', missed_count))
                   from (select title, missed_count from work_schedules
                          where camp_id = p_camp_id and missed_count > 0
                          order by missed_count desc limit 10) b), '[]'::jsonb)),

    'carry_over', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'trade', trade, 'priority', priority,
        'location', locations[1],
        'age_days', round(extract(epoch from (v_as_of - created_at))/86400.0),
        'status', case when was_closed then 'resolved' else status end) order by created_at)
      from scoped where not was_closed), '[]'::jsonb),

    -- No history on actual_cost, so this is what is recorded today whatever the cut-off says.
    'money', jsonb_build_object(
      'recorded_cost', coalesce((select sum(actual_cost) from scoped), 0),
      'with_cost',     (select count(*) from scoped where actual_cost is not null),
      'as_of_caveat',  v_as_of < now() - interval '1 minute'),

    'vendors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'trade', t.trade,
               'jobs', t.jobs, 'open', t.open, 'closed', t.closed,
               'cost', t.cost, 'with_cost', t.with_cost,
               'median_days', t.median_days)
             order by t.jobs desc, t.name)
      from (
        select sv.id, sv.name, sv.trade,
               count(*)                                          as jobs,
               count(*) filter (where not s.was_closed)           as open,
               count(*) filter (where s.was_closed)               as closed,
               coalesce(sum(s.actual_cost), 0)::numeric           as cost,
               count(*) filter (where s.actual_cost is not null)  as with_cost,
               round(percentile_cont(0.5) within group (
                 order by extract(epoch from (s.resolved_by_then - s.created_at)) / 86400.0
               ) filter (where s.resolved_by_then is not null)::numeric, 1) as median_days
        from scoped s
        join service_vendors sv on sv.id = s.vendor_id
        group by sv.id, sv.name, sv.trade
      ) t), '[]'::jsonb)
  ) into v;

  return v;
end $fn$;

-- The old arity stays, delegating, so nothing that calls it three-argument breaks.
create or replace function public.season_review(
  p_camp_id uuid, p_from date, p_to date
) returns jsonb language sql stable security definer set search_path = public as $fn$
  select public.season_review(p_camp_id, p_from, p_to, now());
$fn$;

grant execute on function public.season_review(uuid, date, date, timestamptz) to authenticated;
grant execute on function public.season_review(uuid, date, date) to authenticated;

-- What each contractor actually cost, and how long they took.
--
-- season_review() had no vendor dimension at all, which left "what did the septic guy cost us
-- this year" unanswerable — and that is the most useful thing a vendor record can tell a camp.
-- It is also what justifies vendors being a first-class thing rather than a phone list: a
-- contractor who is cheap per visit and takes three weeks is a different problem from one who
-- is dear and comes on Tuesday.
--
-- Cost is only what somebody typed into actual_cost, so it is a floor and not a total. with_cost
-- rides along so the interface can say how much of the picture is filled in rather than implying
-- the number is complete.
--
-- The rest of the function is unchanged from 20260903015720.

create or replace function public.season_review(
  p_camp_id uuid, p_from date, p_to date
) returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb;
begin
  if not is_camp_member(p_camp_id) then raise exception 'Forbidden'; end if;

  with scoped as (
    select i.* from issues i
    where i.camp_id = p_camp_id and i.created_at::date between p_from and p_to
  ),
  timing as (
    select trade, priority,
      percentile_cont(0.5) within group (
        order by extract(epoch from (assigned_at - created_at))/3600.0)
        filter (where assigned_at is not null) as hrs_to_assign,
      percentile_cont(0.5) within group (
        order by extract(epoch from (resolved_at - created_at))/3600.0)
        filter (where resolved_at is not null) as hrs_to_close,
      count(*) filter (where resolved_at is not null) as n_timed
    from scoped group by trade, priority
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,

    'volume', jsonb_build_object(
      'reported', (select count(*) from scoped),
      'closed',   (select count(*) from scoped where status = 'resolved'),
      'open',     (select count(*) from scoped where status <> 'resolved'),
      'by_trade', coalesce((select jsonb_object_agg(trade, n) from (
                    select trade, count(*) as n from scoped group by trade) t), '{}'::jsonb),
      'by_week',  coalesce((select jsonb_agg(jsonb_build_object(
                    'week', wk, 'reported', rep, 'closed', cl) order by wk) from (
                      select date_trunc('week', created_at)::date as wk,
                             count(*) as rep,
                             count(*) filter (where status = 'resolved') as cl
                      from scoped group by 1) w), '[]'::jsonb)),

    'timing', coalesce((select jsonb_agg(jsonb_build_object(
                'trade', trade, 'priority', priority,
                'median_hours_to_assign', round(hrs_to_assign::numeric, 1),
                'median_hours_to_close',  round(hrs_to_close::numeric, 1),
                'sample', n_timed)) from timing), '[]'::jsonb),

    'locations', coalesce((select jsonb_agg(x order by (x->>'count')::int desc) from (
        select jsonb_build_object(
          'location', l.name, 'count', count(*),
          'open_days', round(sum(extract(epoch from (coalesce(s.resolved_at, now()) - s.created_at))/86400.0)::numeric, 0),
          'cost', coalesce(sum(s.actual_cost), 0)) as x
        from scoped s
        join locations l on l.id = s.location_ids[1]
        group by l.name order by count(*) desc limit 12) t), '[]'::jsonb),

    'assets', coalesce((select jsonb_agg(x order by (x->>'cost')::numeric desc nulls last) from (
        select jsonb_build_object(
          'asset', a.name, 'count', count(*),
          'cost', coalesce(sum(s.actual_cost), 0),
          'days_out', round(sum(extract(epoch from (coalesce(s.resolved_at, now()) - s.created_at))/86400.0)::numeric, 0)) as x
        from scoped s join camp_assets a on a.id = s.asset_id
        group by a.name order by coalesce(sum(s.actual_cost),0) desc limit 12) t), '[]'::jsonb),

    'workload', coalesce((select jsonb_agg(x order by (x->>'closed')::int desc) from (
        select jsonb_build_object(
          'name', coalesce(p.full_name, 'Unassigned'),
          'closed', count(*) filter (where s.status = 'resolved'),
          'still_open', count(*) filter (where s.status <> 'resolved'),
          'median_hours_to_close', round(percentile_cont(0.5) within group (
              order by extract(epoch from (s.resolved_at - s.created_at))/3600.0)
              filter (where s.resolved_at is not null)::numeric, 1),
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
        'location', locations[1], 'age_days', round(extract(epoch from (now() - created_at))/86400.0),
        'status', status) order by created_at)
      from scoped where status <> 'resolved'), '[]'::jsonb),

    'money', jsonb_build_object(
      'recorded_cost', coalesce((select sum(actual_cost) from scoped), 0),
      'with_cost',     (select count(*) from scoped where actual_cost is not null)),

    -- What each contractor cost and how long they took. Medians, like everything else here:
    -- one job that sat over a winter would drag a mean far enough to make the row meaningless.
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
               count(*) filter (where s.status <> 'resolved')     as open,
               count(*) filter (where s.status =  'resolved')     as closed,
               coalesce(sum(s.actual_cost), 0)::numeric           as cost,
               count(*) filter (where s.actual_cost is not null)  as with_cost,
               round(percentile_cont(0.5) within group (
                 order by extract(epoch from (s.resolved_at - s.created_at)) / 86400.0
               ) filter (where s.resolved_at is not null)::numeric, 1) as median_days
        from scoped s
        join service_vendors sv on sv.id = s.vendor_id
        group by sv.id, sv.name, sv.trade
      ) t), '[]'::jsonb)
  ) into v;

  return v;
end;
$fn$;

grant execute on function public.season_review(uuid, date, date) to authenticated;

-- The two renewal artifacts, and the fact three modules were each keeping their own copy of.
--
-- Season Review: the page a director reads in September that answers "was this worth it".
-- Rentals Review: the same for the half that makes money.
--
-- Everything is computed in Postgres. The client hydrates fourteen stores asynchronously and a
-- number built from whatever happened to have loaded is not one to forward to a board -- the
-- same reasoning that put the compliance score in the database.

-- Sessions, promoted out of Commissary ---------------------------------------------
-- commissary_sessions was the only table holding session names, dates and headcounts, and
-- Compliance already needed them badly enough to build compliance_session_capacity separately.
-- Now the Season Review, the property calendar and session turnovers need them too. Rather than
-- make a fourth copy, this is one table with a one-way mirror from the module that owns the UI
-- today; the Commissary refactor can follow without breaking anything.
create table if not exists camp_sessions (
  id            uuid primary key default gen_random_uuid(),
  camp_id       uuid not null references camps(id) on delete cascade,
  source_id     uuid,
  name          text not null,
  start_date    date not null,
  end_date      date not null,
  camper_count  integer not null default 0,
  staff_count   integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists camp_sessions_camp_idx on camp_sessions (camp_id, start_date);
-- Not partial: Postgres treats NULLs as distinct in a unique index, so camp-created sessions
-- (source_id null) coexist freely, and ON CONFLICT can still infer this index.
create unique index if not exists camp_sessions_source_key on camp_sessions (source_id);

comment on table camp_sessions is
  'Camp-wide sessions: dates and headcounts. Mirrored from commissary_sessions until that module is refactored onto this table. Read by the season review, the property calendar and session turnover generation.';

alter table camp_sessions enable row level security;
drop policy if exists camp_sessions_read on camp_sessions;
create policy camp_sessions_read on camp_sessions for select using (is_camp_member(camp_id));
drop policy if exists camp_sessions_write on camp_sessions;
create policy camp_sessions_write on camp_sessions
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));
alter table camp_sessions replica identity full;

insert into camp_sessions (camp_id, source_id, name, start_date, end_date, camper_count, staff_count, is_active)
select s.camp_id, s.id, s.name, s.start_date, s.end_date,
       coalesce(s.camper_count,0), coalesce(s.staff_count,0), coalesce(s.is_active,true)
from commissary_sessions s
on conflict (source_id) do nothing;

create or replace function public.mirror_commissary_session()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'DELETE' then
    delete from camp_sessions where source_id = old.id;
    return old;
  end if;
  insert into camp_sessions (camp_id, source_id, name, start_date, end_date, camper_count, staff_count, is_active)
  values (new.camp_id, new.id, new.name, new.start_date, new.end_date,
          coalesce(new.camper_count,0), coalesce(new.staff_count,0), coalesce(new.is_active,true))
  on conflict (source_id) do update set
    name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
    camper_count = excluded.camper_count, staff_count = excluded.staff_count,
    is_active = excluded.is_active, updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists mirror_commissary_session_trg on commissary_sessions;
create trigger mirror_commissary_session_trg
  after insert or update or delete on commissary_sessions
  for each row execute function public.mirror_commissary_session();

-- Session turnover, the same generator aimed at a session end date -----------------
create or replace function public.generate_session_turnover(p_session_id uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  s camp_sessions; v_n int := 0; v_assignee uuid; v_tmpl uuid; v_issue uuid; l record;
begin
  select * into s from camp_sessions where id = p_session_id;
  if s.id is null or not is_camp_member(s.camp_id) then raise exception 'Forbidden'; end if;

  v_assignee := public.route_work(s.camp_id, 'housekeeping');
  select id into v_tmpl from work_checklist_templates
   where camp_id = s.camp_id and name = 'Cabin turnover' and is_active limit 1;

  for l in
    select id, name from locations
    where camp_id = s.camp_id and is_dorm and is_active and service_status <> 'out_of_service'
    order by sort_order, name
  loop
    if exists (select 1 from issues where camp_id = s.camp_id and source = 'session'
                 and l.id = any(location_ids) and due_date = s.end_date) then continue; end if;

    insert into issues (camp_id, title, description, locations, location_ids, priority, status,
                        assignee_id, is_public_report, source, trade, due_date)
    values (s.camp_id, 'Turn over ' || l.name || ' — end of ' || s.name,
            'Session ends ' || to_char(s.end_date, 'FMDay FMDD FMMon') || '.',
            array[l.name], array[l.id], 'normal',
            case when v_assignee is null then 'unassigned' else 'assigned' end,
            v_assignee, false, 'session', 'housekeeping', s.end_date)
    returning id into v_issue;

    if v_tmpl is not null then perform public.apply_checklist_template(v_issue, v_tmpl); end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
grant execute on function public.generate_session_turnover(uuid) to authenticated;

-- The season review -----------------------------------------------------------------
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
      'with_cost',     (select count(*) from scoped where actual_cost is not null))
  ) into v;

  return v;
end;
$fn$;
grant execute on function public.season_review(uuid, date, date) to authenticated;

-- The rentals review ------------------------------------------------------------------
create or replace function public.rentals_review(
  p_camp_id uuid, p_from date, p_to date
) returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb; v_beds int; v_nights int;
begin
  if not is_camp_member(p_camp_id) then raise exception 'Forbidden'; end if;

  select coalesce(sum(bed_capacity), 0) into v_beds
    from locations where camp_id = p_camp_id and is_dorm and retreat_available and is_active;
  v_nights := greatest((p_to - p_from), 1);

  with scoped as (
    select r.* from retreats r
    where r.camp_id = p_camp_id
      and r.arrival_date is not null
      and r.arrival_date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,

    'occupancy', jsonb_build_object(
      'beds_available', v_beds,
      'nights', v_nights,
      'bed_nights_available', v_beds * v_nights,
      'bed_nights_sold', coalesce((select sum(coalesce(final_headcount, headcount, 0)
                                              * greatest(departure_date - arrival_date, 1))
                                   from scoped where status not in ('cancelled','inquiry')), 0),
      'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'bed_nights', bn) order by m)
        from (select to_char(arrival_date, 'YYYY-MM') as m,
                     sum(coalesce(final_headcount, headcount, 0) * greatest(departure_date - arrival_date, 1)) as bn
              from scoped where status not in ('cancelled','inquiry') group by 1) t), '[]'::jsonb),
      'out_of_service_beds', coalesce((select sum(bed_capacity) from locations
         where camp_id = p_camp_id and is_dorm and service_status = 'out_of_service'), 0)),

    'revenue', jsonb_build_object(
      'invoiced', coalesce((select sum(i.amount) from retreat_invoices i
                            join scoped s on s.id = i.retreat_id), 0),
      'collected', coalesce((select sum(p.amount) from retreat_payments p
                             join scoped s on s.id = p.retreat_id), 0),
      'outstanding', coalesce((select sum(i.amount - coalesce(i.amount_paid,0))
                               from retreat_invoices i join scoped s on s.id = i.retreat_id
                               where i.status <> 'paid'), 0),
      'addons', coalesce((select jsonb_agg(x order by (x->>'revenue')::numeric desc) from (
                          select jsonb_build_object('name', c.description,
                            'times_sold', count(*), 'revenue', sum(c.amount)) as x
                          from retreat_charges c join scoped s on s.id = c.retreat_id
                          where c.addon_id is not null group by c.description) t), '[]'::jsonb),
      'by_group', coalesce((select jsonb_agg(jsonb_build_object(
                              'group', s.group_name, 'invoiced', coalesce(inv.total, 0),
                              'people', coalesce(s.final_headcount, s.headcount, 0))
                            order by coalesce(inv.total,0) desc)
                            from scoped s
                            left join lateral (select sum(amount) as total from retreat_invoices
                                               where retreat_id = s.id) inv on true), '[]'::jsonb)),

    'pipeline', jsonb_build_object(
      'inquiries', (select count(*) from retreats where camp_id = p_camp_id
                     and created_at::date between p_from and p_to),
      'proposals_sent', (select count(*) from retreat_proposals
                          where camp_id = p_camp_id and sent_at::date between p_from and p_to),
      'won',  (select count(*) from retreats where camp_id = p_camp_id and lead_stage = 'won'
                and created_at::date between p_from and p_to),
      'lost', (select count(*) from retreats where camp_id = p_camp_id and lead_stage = 'lost'
                and created_at::date between p_from and p_to),
      'median_days_to_win', (select round(percentile_cont(0.5) within group (
            order by extract(epoch from (p.accepted_at - r.created_at))/86400.0)::numeric, 1)
          from retreat_proposals p join retreats r on r.id = p.retreat_id
          where r.camp_id = p_camp_id and p.accepted_at is not null),
      'lost_reasons', coalesce((select jsonb_object_agg(coalesce(lost_reason,'not recorded'), n) from (
          select lost_reason, count(*) as n from retreats
          where camp_id = p_camp_id and lead_stage = 'lost' group by 1) t), '{}'::jsonb)),

    'where_groups_come_from', jsonb_build_object(
      'by_source', coalesce((select jsonb_object_agg(coalesce(lead_source,'not recorded'), n) from (
          select lead_source, count(*) as n from scoped group by 1) t), '{}'::jsonb),
      'returning', (select count(*) from scoped s
                     where exists (select 1 from retreats o where o.camp_id = p_camp_id
                                     and o.group_name = s.group_name and o.id <> s.id
                                     and o.arrival_date < s.arrival_date)),
      'total', (select count(*) from scoped)),

    'cost_to_host', coalesce((select jsonb_agg(jsonb_build_object(
        'group', s.group_name,
        'budgeted', coalesce(cst.budgeted, 0),
        'actual', coalesce(cst.actual, 0),
        'work_orders', coalesce(wo.n, 0),
        'work_minutes', coalesce(wo.mins, 0),
        'work_cost', coalesce(wo.cost, 0)) order by s.arrival_date)
      from scoped s
      left join lateral (select sum(budgeted) as budgeted, sum(actual) as actual
                         from retreat_costs where retreat_id = s.id) cst on true
      left join lateral (select count(*) as n, sum(minutes_spent) as mins, sum(actual_cost) as cost
                         from issues where retreat_id = s.id) wo on true), '[]'::jsonb),

    'feedback', jsonb_build_object(
      'average_overall', (select round(avg(overall)::numeric, 2) from retreat_feedback f
                           join scoped s on s.id = f.retreat_id),
      'responses', (select count(*) from retreat_feedback f join scoped s on s.id = f.retreat_id),
      'would_not_return', coalesce((select jsonb_agg(jsonb_build_object(
            'group', s.group_name, 'comment', f.comment, 'overall', f.overall))
          from retreat_feedback f join scoped s on s.id = f.retreat_id
          where f.returning_status is not null and f.returning_status ilike '%no%'), '[]'::jsonb))
  ) into v;

  return v;
end;
$fn$;
grant execute on function public.rentals_review(uuid, date, date) to authenticated;

-- Freeze at close ---------------------------------------------------------------------
create table if not exists review_snapshots (
  id         uuid primary key default gen_random_uuid(),
  camp_id    uuid not null references camps(id) on delete cascade,
  kind       text not null,
  period_from date not null,
  period_to   date not null,
  payload    jsonb not null,
  taken_at   timestamptz not null default now(),
  taken_by   text
);
create unique index if not exists review_snapshots_key
  on review_snapshots (camp_id, kind, period_from, period_to);

alter table review_snapshots enable row level security;
drop policy if exists review_snapshots_read on review_snapshots;
create policy review_snapshots_read on review_snapshots for select using (is_camp_member(camp_id));
drop policy if exists review_snapshots_write on review_snapshots;
create policy review_snapshots_write on review_snapshots
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

create or replace function public.snapshot_review(
  p_camp_id uuid, p_kind text, p_from date, p_to date
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_payload jsonb; v_id uuid; v_who text;
begin
  if not is_camp_admin(p_camp_id) then raise exception 'Forbidden'; end if;
  v_payload := case p_kind
    when 'season'  then public.season_review(p_camp_id, p_from, p_to)
    when 'rentals' then public.rentals_review(p_camp_id, p_from, p_to)
    else null end;
  if v_payload is null then raise exception 'Unknown review kind: %', p_kind; end if;

  select full_name into v_who from profiles where id = auth.uid();

  insert into review_snapshots (camp_id, kind, period_from, period_to, payload, taken_by)
  values (p_camp_id, p_kind, p_from, p_to, v_payload, v_who)
  on conflict (camp_id, kind, period_from, period_to)
    do update set payload = excluded.payload, taken_at = now(), taken_by = excluded.taken_by
  returning id into v_id;
  return v_id;
end;
$fn$;
grant execute on function public.snapshot_review(uuid, text, date, date) to authenticated;

-- The property calendar -----------------------------------------------------------------
create or replace function public.property_calendar(
  p_camp_id uuid, p_from date, p_to date
) returns jsonb language sql stable security definer set search_path = public as $fn$
  select case when not is_camp_member(p_camp_id) then null else jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'start', start_date, 'end', end_date,
        'people', camper_count + staff_count) order by start_date)
      from camp_sessions where camp_id = p_camp_id
        and start_date <= p_to and end_date >= p_from), '[]'::jsonb),

    'retreats', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'group', group_name, 'start', arrival_date, 'end', departure_date,
        'people', coalesce(final_headcount, headcount, 0), 'status', status,
        'lead_stage', lead_stage) order by arrival_date)
      from retreats where camp_id = p_camp_id and arrival_date is not null
        and arrival_date <= p_to and departure_date >= p_from), '[]'::jsonb),

    'space_bookings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'space', l.name, 'day', q.day_date, 'group', rt.group_name,
        'status', q.status, 'purpose', q.purpose) order by q.day_date)
      from retreat_space_requests q
      join locations l on l.id = q.location_id
      join retreats rt on rt.id = q.retreat_id
      where q.camp_id = p_camp_id and q.day_date between p_from and p_to), '[]'::jsonb),

    'out_of_service', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'reason', out_of_service_reason,
        'since', out_of_service_since, 'expected_back', expected_back, 'kind', 'location'))
      from locations where camp_id = p_camp_id and service_status = 'out_of_service'), '[]'::jsonb),

    -- A departure and an arrival on the same day with eleven cabins to turn is a staffing
    -- decision, and right now nobody sees it coming until the morning.
    'turnover_days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', d, 'departing', dep, 'arriving', arr, 'rooms_to_turn', rooms) order by d)
      from (
        select g.d::date as d,
          (select count(*) from retreats o where o.camp_id = p_camp_id and o.departure_date = g.d::date) as dep,
          (select count(*) from retreats o where o.camp_id = p_camp_id and o.arrival_date   = g.d::date) as arr,
          (select count(*) from retreat_housing h join retreats o on o.id = h.retreat_id
            where o.camp_id = p_camp_id and o.departure_date = g.d::date) as rooms
        from generate_series(p_from, p_to, interval '1 day') g(d)
      ) t where dep > 0 and arr > 0), '[]'::jsonb)
  ) end;
$fn$;
grant execute on function public.property_calendar(uuid, date, date) to authenticated;

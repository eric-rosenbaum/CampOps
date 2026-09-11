-- Two things, both in generate_scheduled_work.
--
-- 1 · "The dining hall needs mopping by 3pm every Friday."
--
-- A due DATE cannot say that, and at a camp the time is usually the point: a room has to be ready
-- before the group walks into it, and "Friday" is not an answer to when. Stored as a separate
-- `time` column rather than by widening due_date to timestamptz -- these dates are camp-local
-- calendar days throughout this codebase, and turning them into instants would reinterpret every
-- existing row against a timezone it was never written with.
--
-- 2 · The nightly run has been dying on its own checklists.
--
-- This function is SECURITY DEFINER and cron calls it as `generate_scheduled_work(null, null)`
-- with no JWT. It then called apply_checklist_template(), which gates on is_camp_member() and so
-- reads auth.uid() -- null under cron. Any routine carrying a checklist raised Forbidden, and
-- because that aborts the whole call, NO routine generated for ANY camp. Verified by running it
-- with the JWT cleared: `Forbidden`, zero work orders. With the fix, the same run raises the work
-- and attaches the steps.
--
-- The same trap has now appeared three times (generate_turnover_work, apply_checklist_template,
-- here). The rule: a trigger or a cron job must call the *_internal variant; the gate belongs on
-- the function the browser can reach, not on the one the database calls itself.
--
-- Everything else below is the existing definition, read back out of pg_get_functiondef and left
-- alone. Retyping it from memory is how the get_portal_data_v2 keys went missing.

alter table public.issues          add column if not exists due_time time;
alter table public.work_schedules  add column if not exists due_time time;

comment on column public.issues.due_time is
  'Camp-local clock time this is due, or null for "some time that day". Deliberately not folded into due_date: that column is a calendar day, not an instant.';
comment on column public.work_schedules.due_time is
  'Clock time occurrences of this routine are due. Copied onto each work order the generator raises.';

CREATE OR REPLACE FUNCTION public.generate_scheduled_work(p_camp_id uuid DEFAULT NULL::uuid, p_through date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          update issues set due_date = v_due, due_time = s.due_time, updated_at = now()
           where id = v_open_id;
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
        vendor_id, schedule_id, due_date, due_time
      ) values (
        s.camp_id, s.title, coalesce(s.description, ''), s.locations, s.location_ids,
        s.priority, case when v_assignee is null then 'unassigned' else 'assigned' end,
        v_assignee, null, false, 'routine', s.trade, s.asset_id,
        s.vendor_id, s.id, v_due, s.due_time
      ) returning id into v_issue_id;

      if s.checklist_template_id is not null then
        -- _internal, not the gated one. Cron has no auth.uid().
        perform public.apply_checklist_template_internal(v_issue_id, s.checklist_template_id);
      end if;

      v_created := v_created + 1;
    end loop;

    update work_schedules set last_generated_on = v_through where id = s.id;
  end loop;

  return v_created;
end;
$function$;

-- claim_outbox_batch worked from psql and failed from the edge function.
--
-- It staged its claim in a `create temporary table ... on commit drop`. That is fine on a
-- dedicated connection and unreliable through PostgREST, which runs each RPC in its own
-- transaction on a POOLED connection — so a drain that succeeded by hand returned
-- "Could not claim the outbox batch" every time the scheduler called it. Symptom: the secret was
-- correct, the function was reached, and the queue still never moved.
--
-- There was never a reason for the temp table. A CTE does the same job, and doing it as one
-- statement buys the thing the original could not: FOR UPDATE ... SKIP LOCKED, so two overlapping
-- ticks (a slow send plus the next quarter-hour) claim disjoint sets instead of double-sending.

create or replace function public.claim_outbox_batch(p_limit integer default 50)
returns table (
  batch_id uuid, to_email text, to_name text, reply_to text,
  subject text, body_html text, message_ids uuid[]
) language plpgsql security definer set search_path = public as $fn$
declare v_batch uuid := gen_random_uuid();
begin
  with due as (
    select m.id
    from scheduled_messages m
    join camps c on c.id = m.camp_id
    where m.state = 'scheduled'
      and m.send_after <= now()
      -- Camp-local quiet hours. A 6am email to a coordinator is a complaint.
      and extract(hour from (now() at time zone c.timezone)) between 8 and 19
    order by m.send_after
    limit greatest(1, coalesce(p_limit, 50))
    for update of m skip locked
  )
  update scheduled_messages s
     set state = 'sending', batch_id = v_batch, updated_at = now()
    from due
   where s.id = due.id;

  -- One email per recipient, not one per message: a group with three overdue items gets a single
  -- message listing three things.
  return query
  select v_batch,
         m.to_email,
         min(m.to_name),
         min(m.reply_to),
         case when count(*) = 1 then min(m.subject)
              else count(*)::text || ' things need your attention' end,
         string_agg(m.body_html, '<hr style="border:0;border-top:1px solid #DED3BB;margin:26px 0">'
                    order by m.send_after),
         array_agg(m.id)
  from scheduled_messages m
  where m.batch_id = v_batch and m.state = 'sending'
  group by m.to_email;
end;
$fn$;

comment on function public.claim_outbox_batch(integer) is
  'Claims due messages for one send pass and returns them merged one-per-recipient. Single statement with SKIP LOCKED so overlapping runs cannot claim the same row; deliberately no temp table, which is what made this fail under PostgREST connection pooling.';

-- Release anything a failed pass left mid-flight. `sending` is only ever a transient state; a row
-- stuck in it is invisible to the planner (which only cancels `scheduled`) and to the drain, so
-- without this it would sit there forever.
create or replace function public.requeue_stuck_outbox(p_older_than interval default '15 minutes')
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  update scheduled_messages
     set state = 'scheduled', batch_id = null, updated_at = now()
   where state = 'sending' and updated_at < now() - p_older_than;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

grant execute on function public.requeue_stuck_outbox(interval) to authenticated;

-- Sweep before each drain, so a crashed pass self-heals on the next tick rather than needing a
-- human to notice.
create or replace function public.drain_outbox()
returns bigint language plpgsql security definer set search_path = public as $fn$
declare
  v_secret text; v_url text; v_due int; v_req bigint;
begin
  perform public.requeue_stuck_outbox();

  select count(*) into v_due
    from scheduled_messages
   where state = 'scheduled' and send_after <= now();

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'functions_base_url' limit 1;

  if v_secret is null or v_url is null then
    if v_due = 0 then
      raise notice 'drain_outbox: not configured, but nothing is due';
      return null;
    end if;
    raise exception
      'drain_outbox: % message(s) are due but the drain is not configured — missing vault secret %.',
      v_due, case when v_secret is null then 'cron_secret' else 'functions_base_url' end
      using errcode = '55000';
  end if;

  select net.http_post(
    url     := rtrim(v_url, '/') || '/outbox-drain',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_req;

  return v_req;
end;
$fn$;

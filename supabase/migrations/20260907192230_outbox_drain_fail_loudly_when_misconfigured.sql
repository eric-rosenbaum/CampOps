-- A cron job that returns null and reports success is the silent failure this whole outbox
-- exists to prevent.
--
-- CRON_SECRET has to exist twice — once as an edge function secret, once in Vault — because
-- Postgres and the edge runtime share no store. On staging the function half was set and the
-- Vault half was not, so drain_outbox() hit its guard, returned null, and pg_cron recorded four
-- successful runs while four reminders sat undelivered. The guard was right to refuse to post;
-- it was wrong to look fine doing it.
--
-- New rule: silence is only acceptable when there is nothing to send. If mail is actually due
-- and the drain cannot authenticate, RAISE — so it lands in cron.job_run_details as a failure
-- somebody can see, rather than as a green tick.

create or replace function public.drain_outbox()
returns bigint language plpgsql security definer set search_path = public as $fn$
declare
  v_secret text;
  v_url    text;
  v_due    int;
  v_req    bigint;
begin
  select count(*) into v_due
    from scheduled_messages
   where state = 'scheduled' and send_after <= now();

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'functions_base_url' limit 1;

  if v_secret is null or v_url is null then
    -- Nothing waiting: an unconfigured drain is harmless, so do not cry wolf every 15 minutes.
    if v_due = 0 then
      raise notice 'drain_outbox: not configured (missing %), but nothing is due',
        case when v_secret is null then 'vault cron_secret' else 'vault functions_base_url' end;
      return null;
    end if;
    -- Mail is actually waiting. Fail visibly.
    raise exception
      'drain_outbox: % message(s) are due but the drain is not configured — missing vault secret %. Add it with vault.create_secret(''<the same value as the CRON_SECRET edge function secret>'', ''cron_secret'').',
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

comment on function public.drain_outbox() is
  'Asks the outbox-drain edge function to send whatever is due. Reads its shared secret and the functions base URL from Vault. Raises when mail is due and it cannot authenticate, so a misconfiguration shows up as a failed cron run rather than a silent queue.';

-- A queryable health answer, so the misconfiguration can also be surfaced in the product rather
-- than only in a log nobody reads.
create or replace function public.outbox_health(p_camp_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'configured', exists (select 1 from vault.secrets where name = 'cron_secret')
              and exists (select 1 from vault.secrets where name = 'functions_base_url'),
    'scheduled',  count(*) filter (where state = 'scheduled'),
    'due_now',    count(*) filter (where state = 'scheduled' and send_after <= now()),
    -- Anything more than an hour past its time is not "about to go", it is stuck.
    'overdue',    count(*) filter (where state = 'scheduled' and send_after < now() - interval '1 hour'),
    'sent_24h',   count(*) filter (where state = 'sent' and sent_at > now() - interval '24 hours'),
    'failed_24h', count(*) filter (where state = 'failed' and updated_at > now() - interval '24 hours')
  )
  from scheduled_messages
  where p_camp_id is null or camp_id = p_camp_id;
$fn$;

grant execute on function public.outbox_health(uuid) to authenticated;

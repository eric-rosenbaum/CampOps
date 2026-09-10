-- "Pending" was a lie whenever the sender was not reachable.
--
-- Stale rows are expired by claim_push_batch, which lives on the far side of the edge function.
-- So while APNs is unconfigured -- exactly the state a camp is in before the Apple key exists --
-- the function 503s before claiming anything and yesterday's notifications sit at 'pending'
-- forever, saying they are still going out. drain_push stops counting them after a day and goes
-- quiet, which makes the lie permanent and invisible.
--
-- Expiring them here settles them wherever the sender happens to be. It is the same rule stated
-- in the same place as the count that ignores them: a push older than a day is not news, and a
-- crew member who reads "assigned to you" about Tuesday on Thursday is worse served than one who
-- reads nothing.
create or replace function public.drain_push()
returns bigint language plpgsql security definer set search_path = public as $fn$
declare v_secret text; v_url text; v_pending int; v_req bigint;
begin
  update push_notifications p
     set state = 'failed', error = 'expired before it could be sent', updated_at = now()
   where p.state = 'pending' and p.created_at <= now() - interval '24 hours';

  select count(*) into v_pending
    from push_notifications
   where state = 'pending';
  if v_pending = 0 then return null; end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'functions_base_url' limit 1;

  -- drain_outbox raises here, because it runs every fifteen minutes and a raise lands in
  -- cron.job_run_details where somebody can find it. This one runs every minute, and 1,440
  -- identical exceptions a day is a log nobody reads rather than an alarm. So the queue is
  -- drained into visible failures instead: each notification is settled with the remedy written
  -- into its own error column, where push_health and the notification's owner can both see it.
  -- The count then returns to zero and the next minute is quiet until real work arrives.
  if v_secret is null or v_url is null then
    update push_notifications
       set state = 'failed',
           error = 'the push sender is not configured: no vault secret named '
                || case when v_secret is null then 'cron_secret' else 'functions_base_url' end,
           updated_at = now()
     where state = 'pending';
    raise warning 'drain_push: % notification(s) dropped -- missing vault secret %',
      v_pending, case when v_secret is null then 'cron_secret' else 'functions_base_url' end;
    return null;
  end if;

  select net.http_post(
    url     := rtrim(v_url, '/') || '/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_req;

  return v_req;
end;
$fn$;

revoke execute on function public.drain_push() from public, anon, authenticated;

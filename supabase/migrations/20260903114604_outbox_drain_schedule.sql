-- Nothing was actually sending.
--
-- plan_all_messages() runs nightly and fills scheduled_messages, but the outbox is drained by an
-- edge function over HTTP, and there was no job calling it. The queue would have filled up and
-- sat there — which is a worse failure than not building it, because the camp can SEE the queue
-- and would reasonably assume it goes out.
--
-- pg_net is what lets Postgres make that call. The shared secret lives in Supabase Vault rather
-- than in this file or in a table anyone can read: pg_cron runs as the table owner, and a cron
-- job whose body contains a bearer token is a token in every backup and every `\d+` of cron.job.

create extension if not exists pg_net with schema extensions;

create or replace function public.drain_outbox()
returns bigint language plpgsql security definer set search_path = public as $fn$
declare
  v_secret text;
  v_url    text;
  v_req    bigint;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'functions_base_url' limit 1;

  -- Fail loudly in the job's own log rather than silently posting to nowhere. A drain that looks
  -- scheduled but never fires is exactly the thing this migration exists to prevent.
  if v_secret is null then
    raise notice 'drain_outbox: no vault secret named cron_secret; nothing sent';
    return null;
  end if;
  if v_url is null then
    raise notice 'drain_outbox: no vault secret named functions_base_url; nothing sent';
    return null;
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
  'Asks the outbox-drain edge function to send whatever is due. Reads its shared secret and the functions base URL from Vault, so neither appears in this file, in cron.job, or in a backup.';

-- Every fifteen minutes. The claim function already enforces camp-local quiet hours and merges
-- multiple messages to one recipient into a single email, so a frequent tick costs nothing and
-- means a reminder queued this morning does not wait until tomorrow.
select cron.unschedule('campcommand-drain-outbox')
where exists (select 1 from cron.job where jobname = 'campcommand-drain-outbox');

select cron.schedule('campcommand-drain-outbox', '*/15 * * * *', $cron$select public.drain_outbox();$cron$);

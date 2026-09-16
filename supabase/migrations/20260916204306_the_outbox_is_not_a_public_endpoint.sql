-- Every outbox function was callable by a signed-out visitor.
--
-- Supabase grants EXECUTE on new functions to PUBLIC (the `=X/postgres` entry in proacl), and
-- to anon/authenticated explicitly. Revoking from `anon` alone -- which an earlier migration did
-- for four other functions -- leaves the PUBLIC grant standing, so anon could still call them.
--
-- What that exposed: `queue_message` takes any address, subject and HTML and the drain sends it
-- from our domain through Resend (an open relay on the public anon key); `claim_outbox_batch`
-- hands back other camps' queued mail; `user_email(uuid)` returns anyone's address.
--
-- None of these is called by a SECURITY INVOKER function, a policy or the browser (verified
-- against pg_proc, pg_policy and src/). The drain calls claim/mark with the service role; cron
-- runs as postgres; the planners call each other as their definer. The one browser caller is
-- `plan_retreat_messages` (the Reminders tab's "Re-plan now"), which keeps `authenticated`.
do $$
declare f text;
begin
  foreach f in array array[
    'queue_message(uuid,text,uuid,text,text,text,text,text,timestamp with time zone,text,text)',
    'cancel_message(text,uuid,text,text)',
    'claim_outbox_batch(integer)',
    'mark_outbox_sent(uuid[],boolean,text)',
    'drain_outbox()',
    'plan_all_messages()',
    'plan_work_messages(uuid)',
    'plan_deposit_chase(uuid)',
    'outbox_health(uuid)',
    'push_health(uuid)',
    'requeue_stuck_outbox(interval)',
    'user_email(uuid)',
    'camp_admin_email(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;

  revoke execute on function public.plan_retreat_messages(uuid) from public, anon;
  grant execute on function public.plan_retreat_messages(uuid) to authenticated, service_role;

  -- The previous fix revoked these from anon but not from PUBLIC.
  revoke execute on function public.guard_platform_modules() from public;
  revoke execute on function public.touch_request_thread() from public;
  revoke execute on function public.seed_request_thread() from public;
  revoke execute on function public.admin_set_camp_modules(uuid, jsonb, jsonb) from public;
  grant execute on function public.admin_set_camp_modules(uuid, jsonb, jsonb) to authenticated;
end $$;

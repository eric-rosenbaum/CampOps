-- Push for the two things a crew member cannot afford to find out about tomorrow: work landing
-- on them, and someone talking on a thread they are on the hook for.
--
-- Why this does not ride the outbox
-- ---------------------------------
-- scheduled_messages is a planner: it decides in advance, re-plans nightly, cancels what stopped
-- being true, drains every fifteen minutes, and holds everything outside camp-local 8am-7pm.
-- Every one of those properties is right for email and wrong for a push. "You have been assigned
-- the broken water heater in Cabin 4" that arrives up to fifteen minutes late, or is withheld
-- until 8am because it was raised at 7:40pm, is not a notification — it is an email with a badge
-- on it. So push gets its own queue and its own trigger-time delivery, and the row is written in
-- the same transaction as the assignment or the comment that caused it.
--
-- What it keeps from the outbox is the shape: a table you can look at, a state machine, and a
-- drain that reports. Nothing sends silently here either.
--
-- Quiet hours are deliberately absent. The outbox enforces them because an email client will
-- happily ping a phone at 3am and the recipient has no per-sender control over it. iOS does:
-- Focus, notification schedules, and per-app permission are all the recipient's, already, and
-- honouring quiet hours on top of them would only make the app late, never quieter.
--
-- Not double-notifying
-- --------------------
-- The existing `unread_message` email rule covers exactly one of these two events (a comment on
-- an assignee's work order), so that one rule is where the channels could collide. The choice:
-- push is the fast lane, email is the fallback for what push could not deliver. The next
-- migration teaches plan_work_messages to skip `unread_message` for an assignee whose device
-- already received that comment. It keys off DELIVERY, not registration — a rejected token or a
-- failed send leaves the push row in 'failed'/'skipped' and the email still goes out, which is
-- the direction you want that failure to fall. Assignment has no email rule at all, so there is
-- nothing to suppress there.

-- Device tokens -------------------------------------------------------------------
-- One row per app install. APNs hands the same token back to the same install, so the unique
-- index is on the token and not on (user, device): when a phone is handed over and someone else
-- signs in, the upsert moves the row rather than leaving the previous user subscribed to a
-- device they no longer hold.
create table if not exists device_tokens (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references camps(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null default 'ios',
  token       text not null,
  -- A token minted by a debug build only works against APNs sandbox and a TestFlight/App Store
  -- one only against production, and getting it wrong is silent on both sides. The client knows
  -- which build it is; the sender trusts it and falls back to APNS_ENV when it is null.
  environment text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table device_tokens drop constraint if exists device_tokens_platform_check;
alter table device_tokens add constraint device_tokens_platform_check
  check (platform in ('ios','android'));

alter table device_tokens drop constraint if exists device_tokens_environment_check;
alter table device_tokens add constraint device_tokens_environment_check
  check (environment is null or environment in ('sandbox','production'));

create unique index if not exists device_tokens_token on device_tokens (token);
create index if not exists device_tokens_user on device_tokens (user_id);

alter table device_tokens enable row level security;

-- Deliberately narrower than the usual is_camp_member read. A device token is a handle for
-- pushing to someone's phone; no camp-mate and no admin has any reason to read one.
drop policy if exists device_tokens_own on device_tokens;
create policy device_tokens_own on device_tokens
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_camp_member(camp_id));

comment on table device_tokens is
  'One APNs/FCM token per app install, owned by the signed-in user. Only the owner can read or write a row; the sender reads them with the service role.';

-- The push queue ------------------------------------------------------------------
create table if not exists push_notifications (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_type text not null,
  subject_id   uuid not null,
  rule_key     text not null,
  -- What makes a second push for the same thing a duplicate. The offline queue can replay a
  -- mutation, and two writes of the same assignment are one piece of news.
  dedupe_key   text not null,
  title        text not null,
  body         text not null,
  data         jsonb not null default '{}'::jsonb,
  state        text not null default 'pending',
  batch_id     uuid,
  devices      integer,
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table push_notifications drop constraint if exists push_notifications_state_check;
alter table push_notifications add constraint push_notifications_state_check
  check (state in ('pending','sending','sent','skipped','failed'));

-- 'skipped' means we had nothing to send to -- no registered device -- as opposed to 'failed',
-- which means APNs refused. The email planner reads that difference.
create unique index if not exists push_notifications_once
  on push_notifications (user_id, dedupe_key);
create index if not exists push_notifications_pending
  on push_notifications (created_at) where state = 'pending';
create index if not exists push_notifications_subject
  on push_notifications (subject_type, subject_id, user_id, rule_key);

alter table push_notifications enable row level security;

-- Your own notifications, or an admin looking at their camp's. Nobody writes through the API:
-- rows are made by the triggers below and settled by the sender's service role.
drop policy if exists push_notifications_read on push_notifications;
create policy push_notifications_read on push_notifications
  for select using (user_id = auth.uid() or is_camp_admin(camp_id));

comment on table push_notifications is
  'The push outbox: one row per recipient per event, written in the same transaction as the change that caused it. Mirrors scheduled_messages in shape, not in timing -- these go immediately.';

-- Queuing -------------------------------------------------------------------------
create or replace function public.queue_push(
  p_camp_id uuid, p_user_id uuid, p_subject_type text, p_subject_id uuid,
  p_rule_key text, p_dedupe_key text, p_title text, p_body text, p_data jsonb
) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if p_user_id is null then return; end if;

  -- Same rule the work router follows: somebody who has been deactivated keeps their rows and
  -- stops receiving anything. A former employee's phone is not a place to send camp business.
  if not exists (
    select 1 from camp_members m
     where m.camp_id = p_camp_id and m.user_id = p_user_id and m.is_active
  ) then
    return;
  end if;

  insert into push_notifications (
    camp_id, user_id, subject_type, subject_id, rule_key, dedupe_key, title, body, data)
  values (
    p_camp_id, p_user_id, p_subject_type, p_subject_id, p_rule_key, p_dedupe_key,
    -- A lock screen shows two lines. Anything past that is weight in the payload for nothing.
    left(p_title, 120), left(p_body, 300), coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
end;
$fn$;

-- Sending -------------------------------------------------------------------------
-- Same Vault arrangement as drain_outbox: the shared secret and the functions base URL live in
-- Vault, so neither appears in this file, in cron.job, or in a backup.
create extension if not exists pg_net with schema extensions;

create or replace function public.drain_push()
returns bigint language plpgsql security definer set search_path = public as $fn$
declare v_secret text; v_url text; v_pending int; v_req bigint;
begin
  -- Anything older than a day is not news any more; it is not worth waking a phone for and it
  -- is certainly not worth making this function post every minute forever.
  select count(*) into v_pending
    from push_notifications
   where state = 'pending' and created_at > now() - interval '24 hours';
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

comment on function public.drain_push() is
  'Asks the push-send edge function to deliver whatever is queued. Reads its shared secret and the functions base URL from Vault. When it cannot authenticate it settles the waiting rows as failures carrying the remedy, so a misconfiguration shows up in push_health rather than as a silent queue.';

-- What the triggers call. Failing to notify somebody must never fail the write that was worth
-- notifying them about -- an unreachable pg_net is not a reason to refuse an assignment -- so
-- this swallows everything drain_push can throw and leaves the row pending for the sweep.
create or replace function public.push_ping()
returns void language plpgsql security definer set search_path = public as $fn$
begin
  perform public.drain_push();
exception when others then
  raise notice 'push_ping: could not hand off to the sender (%); the sweep will retry', sqlerrm;
end;
$fn$;

-- Event 1 · assignment ------------------------------------------------------------
create or replace function public.push_on_assignment()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_actor uuid := auth.uid(); v_actor_name text; v_where text;
begin
  if new.assignee_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return new; end if;

  -- Picking a job up yourself is not news. Both apps have a "Take it" button and it writes this
  -- column, so without this guard the crew would get a push every time they tapped it.
  if v_actor is not null and v_actor = new.assignee_id then return new; end if;

  select full_name into v_actor_name from profiles where id = v_actor;
  v_where := nullif(btrim(coalesce(new.locations[1], '')), '');

  perform public.queue_push(
    new.camp_id, new.assignee_id, 'work_order', new.id, 'assigned',
    -- Five-minute bucket: collapses the same assignment arriving twice (a replayed offline
    -- mutation, a save that writes the row again) without silencing a genuine hand-off back to
    -- the same person later in the shift.
    'assign:' || new.id::text || ':' || new.assignee_id::text || ':'
      || (floor(extract(epoch from now()) / 300))::bigint::text,
    new.title,
    case when v_actor_name is null then 'Assigned to you' else 'Assigned to you by ' || v_actor_name end
      || coalesce(' · ' || v_where, ''),
    jsonb_build_object(
      'kind', 'work_order_assigned',
      'camp_id', new.camp_id,
      'issue_id', new.id));

  perform public.push_ping();
  return new;
end;
$fn$;

drop trigger if exists push_on_assignment_trg on issues;
create trigger push_on_assignment_trg
  after insert or update of assignee_id on issues
  for each row execute function public.push_on_assignment();

-- Event 2 · a comment on a thread that is yours ------------------------------------
create or replace function public.push_on_comment()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_issue record; v_uid uuid; v_n int := 0;
begin
  if new.deleted_at is not null then return new; end if;

  select i.id, i.camp_id, i.title, i.assignee_id, i.status
    into v_issue from issues i where i.id = new.issue_id;
  if v_issue.id is null then return new; end if;

  -- A resolved work order still takes comments -- that is how the record gets corrected after
  -- the fact -- but it is not live work, so it does not buzz.
  if v_issue.status = 'resolved' then return new; end if;

  for v_uid in
    -- The two ways a thread becomes yours: it is your job, or you have spoken on it.
    select v_issue.assignee_id where v_issue.assignee_id is not null
    union
    select distinct k.author_id
      from issue_comments k
     where k.issue_id = new.issue_id and k.author_id is not null and k.deleted_at is null
  loop
    continue when v_uid is null or v_uid = new.author_id;

    perform public.queue_push(
      v_issue.camp_id, v_uid, 'work_order', v_issue.id, 'comment',
      'comment:' || new.id::text,
      v_issue.title,
      new.author_name || ': ' || new.body,
      jsonb_build_object(
        'kind', 'work_order_comment',
        'camp_id', v_issue.camp_id,
        'issue_id', v_issue.id,
        'comment_id', new.id));
    v_n := v_n + 1;
  end loop;

  if v_n > 0 then perform public.push_ping(); end if;
  return new;
end;
$fn$;

drop trigger if exists push_on_comment_trg on issue_comments;
create trigger push_on_comment_trg
  after insert on issue_comments
  for each row execute function public.push_on_comment();

-- The sender's two calls -----------------------------------------------------------
create or replace function public.claim_push_batch(p_limit integer default 50)
returns table (id uuid, title text, body text, data jsonb, devices jsonb)
language plpgsql security definer set search_path = public as $fn$
declare v_batch uuid := gen_random_uuid();
begin
  -- A send that died mid-flight left its rows claimed. Ten minutes is far longer than the
  -- function can run, so anything still 'sending' after that is abandoned, not in progress.
  update push_notifications
     set state = 'pending', batch_id = null, updated_at = now()
   where state = 'sending' and updated_at < now() - interval '10 minutes';

  update push_notifications
     set state = 'failed', error = 'expired before it could be sent', updated_at = now()
   where state = 'pending' and created_at <= now() - interval '24 hours';

  update push_notifications
     set state = 'sending', batch_id = v_batch, updated_at = now()
   where id in (
     select q.id from push_notifications q
      where q.state = 'pending'
      order by q.created_at
      limit greatest(1, least(p_limit, 200))
   );

  -- Nobody has the app installed. Settle it here rather than sending the function an empty
  -- errand, and leave the state as 'skipped' so the email planner knows to cover it.
  update push_notifications p
     set state = 'skipped', devices = 0, updated_at = now()
   where p.batch_id = v_batch and p.state = 'sending'
     and not exists (select 1 from device_tokens d where d.user_id = p.user_id);

  return query
  select p.id, p.title, p.body, p.data,
         (select jsonb_agg(jsonb_build_object('token', d.token, 'environment', d.environment))
            from device_tokens d where d.user_id = p.user_id)
    from push_notifications p
   where p.batch_id = v_batch and p.state = 'sending';
end;
$fn$;

create or replace function public.mark_push_sent(
  p_id uuid, p_delivered integer, p_error text default null
) returns void language sql security definer set search_path = public as $fn$
  update push_notifications
     set state   = case when coalesce(p_delivered, 0) > 0 then 'sent'
                        when p_error is null then 'skipped'
                        else 'failed' end,
         devices = coalesce(p_delivered, 0),
         sent_at = case when coalesce(p_delivered, 0) > 0 then now() end,
         error   = p_error,
         updated_at = now()
   where id = p_id;
$fn$;

-- These read every camp's device tokens and move other people's mail. They are for the service
-- role and pg_cron only; the default grant to authenticated would hand any signed-in user the
-- ability to drain the queue and read tokens that are not theirs.
revoke execute on function public.queue_push(uuid, uuid, text, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke execute on function public.mark_push_sent(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.drain_push() from public, anon, authenticated;
revoke execute on function public.push_ping() from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.mark_push_sent(uuid, integer, text) to service_role;

-- A queryable health answer, the same one outbox_health gives, so a dead sender can be found in
-- the product rather than only in a log nobody reads.
create or replace function public.push_health(p_camp_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'configured', exists (select 1 from vault.secrets where name = 'cron_secret')
              and exists (select 1 from vault.secrets where name = 'functions_base_url'),
    'devices',    (select count(*) from device_tokens d
                    where p_camp_id is null or d.camp_id = p_camp_id),
    'pending',    count(*) filter (where state = 'pending'),
    'stuck',      count(*) filter (where state in ('pending','sending')
                                     and created_at < now() - interval '15 minutes'),
    'sent_24h',   count(*) filter (where state = 'sent' and sent_at > now() - interval '24 hours'),
    'skipped_24h',count(*) filter (where state = 'skipped' and updated_at > now() - interval '24 hours'),
    'failed_24h', count(*) filter (where state = 'failed' and updated_at > now() - interval '24 hours')
  )
  from push_notifications
  where p_camp_id is null or camp_id = p_camp_id;
$fn$;

grant execute on function public.push_health(uuid) to authenticated;

-- The safety net, not the delivery path. The triggers post the moment the row is written; this
-- exists so that a pg_net hiccup costs a minute instead of the whole notification.
select cron.unschedule('campcommand-drain-push')
where exists (select 1 from cron.job where jobname = 'campcommand-drain-push');

select cron.schedule('campcommand-drain-push', '* * * * *', $cron$select public.drain_push();$cron$);

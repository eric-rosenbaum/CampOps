-- Work typed in one language can be read in another.
--
-- A crew that is half Spanish-speaking was reading work orders the director typed in English,
-- and the director was reading comments typed in Spanish, through a phone's copy-and-translate.
-- The text itself stays exactly as its author typed it — an edit always edits the original —
-- and beside it sits a translation into each language the camp's people actually read.
--
-- The contract (docs/plans/multilingual.md, "Content translation — the contract"):
--   * one row per (source row, field, language), including the source language itself, where
--     `text = source_text`, so "it was already Spanish" is distinguishable from "not done yet";
--   * a row is CURRENT iff its source_text equals the field today. Clients compare strings, so a
--     translation of an edited original is never shown as though it were the new text;
--   * read by camp members, written only by the service role (the translate-content function).
--
-- How rows get made: a trigger on each source table puts the row on translation_queue in the
-- same transaction as the write, and pings translate-content over pg_net the way push does. A
-- sweep every two minutes is the safety net, not the delivery path. The ping swallows every
-- error, because a translation that cannot be requested is never a reason to refuse the write.

create extension if not exists pg_net with schema extensions;

-- The translations ------------------------------------------------------------------
create table if not exists public.content_translations (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references public.camps(id) on delete cascade,
  source_table text not null,
  -- Text, not uuid: the contract was written for a table whose ids might not all be uuids, and a
  -- client matching on a string never has to know which kind it is holding.
  source_id    text not null,
  field        text not null,
  lang         text not null,
  source_lang  text,
  source_text  text not null,
  text         text not null,
  model        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint content_translations_source_table_check
    check (source_table in ('issues','issue_comments','issue_checklist_items')),
  constraint content_translations_field_check
    check (field in ('title','description','body','text','note')),
  constraint content_translations_lang_check
    check (lang in ('en','es','he')),
  constraint content_translations_once unique (source_table, source_id, field, lang)
);

create index if not exists content_translations_camp on public.content_translations (camp_id);
-- The reuse lookup: a routine's checklist says "Check the smoke detector" on every work order it
-- generates, and translating the same sentence forty times a night was forty paid calls for one
-- answer. translate-content looks for the same source text already translated in this camp.
create index if not exists content_translations_reuse
  on public.content_translations (camp_id, md5(source_text), lang);

alter table public.content_translations enable row level security;

drop policy if exists content_translations_read on public.content_translations;
create policy content_translations_read on public.content_translations
  for select using (is_camp_member(camp_id));

-- No write policy, and no write grant either: RLS without a policy already refuses, but a grant
-- left in place is one careless policy away from letting a client rewrite what a colleague
-- "said" in another language.
-- Signed out, there is nothing here to read at all.
revoke all on public.content_translations from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.content_translations from authenticated;
grant select on public.content_translations to authenticated;

alter table public.content_translations replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'content_translations') then
    alter publication supabase_realtime add table public.content_translations;
  end if;
end $$;

comment on table public.content_translations is
  'Machine translations of user-typed work-order text, one row per source row, field and language (including the source language, where text = source_text). Current iff source_text equals the field today. Written only by the translate-content edge function.';

-- The queue -------------------------------------------------------------------------
create table if not exists public.translation_queue (
  id              bigint generated always as identity primary key,
  camp_id         uuid not null references public.camps(id) on delete cascade,
  source_table    text not null,
  source_id       text not null,
  enqueued_at     timestamptz not null default now(),
  -- Bumped on every re-enqueue. The worker deletes a finished job only if the generation it
  -- claimed is still the generation on the row: an edit that landed while the model was
  -- translating the previous text used to be deleted along with the job that preceded it.
  generation      integer not null default 1,
  attempts        integer not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  claimed_until   timestamptz,
  constraint translation_queue_source_table_check
    check (source_table in ('issues','issue_comments','issue_checklist_items')),
  constraint translation_queue_once unique (source_table, source_id)
);

create index if not exists translation_queue_due
  on public.translation_queue (next_attempt_at) where attempts < 5;

alter table public.translation_queue enable row level security;
-- No policies at all: the queue is the worker's business.
revoke all on public.translation_queue from public, anon, authenticated;

comment on table public.translation_queue is
  'Source rows waiting for translate-content. One row per source row; a failed job backs off and gives up after five attempts, leaving last_error behind for whoever looks.';

-- Enqueue ---------------------------------------------------------------------------
create or replace function public.enqueue_translation_internal(
  p_camp_id uuid, p_source_table text, p_source_id text
) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if p_camp_id is null or p_source_id is null then return; end if;
  insert into translation_queue (camp_id, source_table, source_id)
  values (p_camp_id, p_source_table, p_source_id)
  on conflict (source_table, source_id) do update
     set enqueued_at     = now(),
         generation      = translation_queue.generation + 1,
         -- A new edit is a new job. The five strikes a previous text used up are not this
         -- text's, and a job that had given up would otherwise never look at the new words.
         attempts        = 0,
         last_error      = null,
         next_attempt_at = now(),
         claimed_until   = null;
end;
$fn$;

-- Asks translate-content to drain the queue, if there is anything due. Same Vault arrangement as
-- drain_outbox and drain_push, so neither the secret nor the URL is in this file or cron.job.
create or replace function public.drain_translations()
returns bigint language plpgsql security definer set search_path = public as $fn$
declare v_secret text; v_url text; v_req bigint;
begin
  -- The sweep runs every two minutes whether or not anybody typed anything; posting to the
  -- function to find an empty queue would be 720 cold starts a day for nothing.
  if not exists (
    select 1 from translation_queue
     where attempts < 5 and next_attempt_at <= now()
       and (claimed_until is null or claimed_until < now())
  ) then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'functions_base_url' limit 1;
  if v_secret is null or v_url is null then
    raise notice 'drain_translations: no vault secret named %; nothing requested',
      case when v_secret is null then 'cron_secret' else 'functions_base_url' end;
    return null;
  end if;

  select net.http_post(
    url     := rtrim(v_url, '/') || '/translate-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_req;
  return v_req;
end;
$fn$;

-- What the triggers call. Two rules. It never fails the write that called it — an unreachable
-- pg_net is not a reason to refuse a work order. And it pings once per transaction: a routine
-- that generates a work order with thirty checklist items used to be thirty-one HTTP requests
-- to the same function to drain the same queue.
create or replace function public.translation_ping()
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if current_setting('campcommand.translation_pinged', true) = 'on' then return; end if;
  perform set_config('campcommand.translation_pinged', 'on', true);
  perform public.drain_translations();
exception when others then
  raise notice 'translation_ping: could not hand off to translate-content (%); the sweep will retry', sqlerrm;
end;
$fn$;

create or replace function public.translation_enqueue_trg()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- The WHEN clauses on the triggers below already confined UPDATEs to the translated columns;
  -- this function only has to say which row it was.
  perform public.enqueue_translation_internal(new.camp_id, tg_table_name, new.id::text);
  perform public.translation_ping();
  return new;
exception when others then
  -- Belt and braces for the same promise translation_ping makes: nothing about translation is
  -- allowed to roll back somebody's work order.
  raise notice 'translation_enqueue_trg: % on %.% not queued (%)', tg_op, tg_table_name, new.id, sqlerrm;
  return new;
end;
$fn$;

-- A deleted row takes its translations with it. Without this they would sit readable by the
-- whole camp — the text of a comment its author deleted, in three languages.
create or replace function public.translation_forget_trg()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  delete from content_translations where source_table = tg_table_name and source_id = old.id::text;
  delete from translation_queue    where source_table = tg_table_name and source_id = old.id::text;
  return old;
end;
$fn$;

drop trigger if exists translation_enqueue_ins on public.issues;
create trigger translation_enqueue_ins after insert on public.issues
  for each row execute function public.translation_enqueue_trg();
drop trigger if exists translation_enqueue_upd on public.issues;
create trigger translation_enqueue_upd after update of title, description on public.issues
  for each row when (old.title is distinct from new.title or old.description is distinct from new.description)
  execute function public.translation_enqueue_trg();
drop trigger if exists translation_forget on public.issues;
create trigger translation_forget after delete on public.issues
  for each row execute function public.translation_forget_trg();

drop trigger if exists translation_enqueue_ins on public.issue_comments;
create trigger translation_enqueue_ins after insert on public.issue_comments
  for each row execute function public.translation_enqueue_trg();
drop trigger if exists translation_enqueue_upd on public.issue_comments;
create trigger translation_enqueue_upd after update of body on public.issue_comments
  for each row when (old.body is distinct from new.body)
  execute function public.translation_enqueue_trg();
drop trigger if exists translation_forget on public.issue_comments;
create trigger translation_forget after delete on public.issue_comments
  for each row execute function public.translation_forget_trg();

drop trigger if exists translation_enqueue_ins on public.issue_checklist_items;
create trigger translation_enqueue_ins after insert on public.issue_checklist_items
  for each row execute function public.translation_enqueue_trg();
drop trigger if exists translation_enqueue_upd on public.issue_checklist_items;
create trigger translation_enqueue_upd after update of text, note on public.issue_checklist_items
  for each row when (old.text is distinct from new.text or old.note is distinct from new.note)
  execute function public.translation_enqueue_trg();
drop trigger if exists translation_forget on public.issue_checklist_items;
create trigger translation_forget after delete on public.issue_checklist_items
  for each row execute function public.translation_forget_trg();

-- The worker's two calls ------------------------------------------------------------
create or replace function public.claim_translation_batch(p_limit integer default 20)
returns table (id bigint, camp_id uuid, source_table text, source_id text, generation integer, attempts integer)
language plpgsql security definer set search_path = public as $fn$
begin
  -- Five minutes is far longer than one invocation can run, so a claim older than that belonged
  -- to a worker that died, and the row is simply due again.
  return query
  update translation_queue q
     set claimed_until = now() + interval '5 minutes'
   where q.id in (
     select t.id from translation_queue t
      where t.attempts < 5 and t.next_attempt_at <= now()
        and (t.claimed_until is null or t.claimed_until < now())
      order by t.next_attempt_at
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      for update skip locked
   )
  returning q.id, q.camp_id, q.source_table, q.source_id, q.generation, q.attempts;
end;
$fn$;

create or replace function public.settle_translation_job(
  p_id bigint, p_generation integer, p_error text default null
) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if p_error is null then
    -- Only the generation that was translated is finished. A newer one stays queued.
    delete from translation_queue where id = p_id and generation = p_generation;
    return;
  end if;

  update translation_queue
     set attempts        = attempts + 1,
         last_error      = left(p_error, 500),
         -- 2, 4, 8, 16 minutes; the fifth failure is the last.
         next_attempt_at = now() + make_interval(mins => power(2, attempts + 1)::int),
         claimed_until   = null
   where id = p_id and generation = p_generation;
end;
$fn$;

-- Trap 13: every new function is granted to PUBLIC as well as to anon and authenticated.
revoke execute on function public.enqueue_translation_internal(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.drain_translations() from public, anon, authenticated;
revoke execute on function public.translation_ping() from public, anon, authenticated;
revoke execute on function public.translation_enqueue_trg() from public, anon, authenticated;
revoke execute on function public.translation_forget_trg() from public, anon, authenticated;
revoke execute on function public.claim_translation_batch(integer) from public, anon, authenticated;
revoke execute on function public.settle_translation_job(bigint, integer, text) from public, anon, authenticated;
grant execute on function public.claim_translation_batch(integer) to service_role;
grant execute on function public.settle_translation_job(bigint, integer, text) to service_role;

-- A cloned demo gets its own translations. source_id is text, so the clone's id remapping (which
-- rewrites uuid columns) would copy these rows still pointing at the SOURCE camp's work orders,
-- and the queue rows would collide with the source camp's own. The clone's inserts fire the
-- enqueue triggers above, which is how its translations get made.
create or replace function public.clone_camp_excluded_tables()
 returns text[]
 language sql
 immutable
 set search_path to 'public'
as $function$
  select array[
    -- who belongs to the camp: a demo gets its own members
    'camp_members','camp_invitations','camp_join_codes','staff_group_members',
    -- credentials and per-device / per-person state
    'device_tokens','issue_comment_reads','issue_viewers','staff_intake_links','staff_intake_submissions',
    -- delivery queues and logs: cloning them would re-send or misreport
    'scheduled_messages','push_notifications','client_mutations','deleted_rows','audit_log','payment_events',
    'translation_queue',
    -- derived from other rows by id-as-text, which the clone cannot remap; regenerated instead
    'content_translations',
    -- files whose storage objects are not copied
    'implementation_files','compliance_exports',
    -- throttles
    'public_report_throttle'
  ]::text[];
$function$;

-- The sweep: the safety net for a ping pg_net dropped, and the retry path for backoff.
select cron.unschedule('campcommand-drain-translations')
where exists (select 1 from cron.job where jobname = 'campcommand-drain-translations');
select cron.schedule('campcommand-drain-translations', '*/2 * * * *',
  $cron$select public.drain_translations();$cron$);

-- Push in the reader's language -------------------------------------------------------
-- A push is a sentence the app says to one person, so it is said in theirs. Only an explicit
-- preference changes anything: somebody who has never chosen a language keeps receiving exactly
-- what they received before, because guessing "English" for them would translate a Spanish
-- title for a Spanish reader who simply never opened Settings.

create or replace function public.push_phrase(p_lang text, p_key text)
returns text language sql immutable set search_path = public as $fn$
  select case p_key
    when 'assigned_to_you' then case p_lang
      when 'es' then 'Asignado a ti'
      when 'he' then 'הוקצה לך'
      else 'Assigned to you' end
    when 'assigned_to_you_by' then case p_lang
      when 'es' then 'Asignado a ti por '
      when 'he' then 'הוקצה לך על ידי '
      else 'Assigned to you by ' end
  end;
$fn$;

-- The reader's-language version of one field, if a CURRENT one exists, else the original. The
-- same currency rule the clients use: a translation of text that has since been edited is not a
-- translation of this text.
create or replace function public.translated_or_original(
  p_source_table text, p_source_id text, p_field text, p_lang text, p_original text
) returns text language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (select t.text from content_translations t
      where p_lang is not null
        and t.source_table = p_source_table and t.source_id = p_source_id
        and t.field = p_field and t.lang = p_lang and t.source_text = p_original),
    p_original);
$fn$;

revoke execute on function public.push_phrase(text, text) from public, anon, authenticated;
revoke execute on function public.translated_or_original(text, text, text, text, text) from public, anon, authenticated;

create or replace function public.push_on_assignment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_actor uuid := auth.uid(); v_actor_name text; v_where text; v_lang text;
begin
  if new.assignee_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return new; end if;

  -- Picking a job up yourself is not news. Both apps have a "Take it" button and it writes this
  -- column, so without this guard the crew would get a push every time they tapped it.
  if v_actor is not null and v_actor = new.assignee_id then return new; end if;

  select full_name into v_actor_name from profiles where id = v_actor;
  select preferred_language into v_lang from profiles where id = new.assignee_id;
  v_where := nullif(btrim(coalesce(new.locations[1], '')), '');

  perform public.queue_push(
    new.camp_id, new.assignee_id, 'work_order', new.id, 'assigned',
    -- Five-minute bucket: collapses the same assignment arriving twice (a replayed offline
    -- mutation, a save that writes the row again) without silencing a genuine hand-off back to
    -- the same person later in the shift.
    'assign:' || new.id::text || ':' || new.assignee_id::text || ':'
      || (floor(extract(epoch from now()) / 300))::bigint::text,
    -- A brand-new work order has no translation yet; push-send looks again at send time.
    public.translated_or_original('issues', new.id::text, 'title', v_lang, new.title),
    case when v_actor_name is null then public.push_phrase(v_lang, 'assigned_to_you')
         else public.push_phrase(v_lang, 'assigned_to_you_by') || v_actor_name end
      || coalesce(' · ' || v_where, ''),
    jsonb_build_object(
      'kind', 'work_order_assigned',
      'camp_id', new.camp_id,
      'issue_id', new.id));

  perform public.push_ping();
  return new;
end;
$function$;

create or replace function public.push_on_comment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_issue record; v_uid uuid; v_n int := 0; v_lang text;
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

    select preferred_language into v_lang from profiles where id = v_uid;

    perform public.queue_push(
      v_issue.camp_id, v_uid, 'work_order', v_issue.id, 'comment',
      'comment:' || new.id::text,
      public.translated_or_original('issues', v_issue.id::text, 'title', v_lang, v_issue.title),
      -- The comment itself was typed a moment ago and has no translation yet; push-send swaps it
      -- in at send time when one has arrived.
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
$function$;

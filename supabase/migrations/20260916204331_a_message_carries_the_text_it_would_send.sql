-- Groundwork for food requests, town trips and receipts, done once so the three modules never
-- edit the same function.
--
-- 1. body_text: the SMS-length version of every message. Nothing sends texts yet; the camp sees
--    exactly what a text would have said, and turning on a text provider later is a delivery
--    change, not a copywriting project.
alter table scheduled_messages add column if not exists body_text text;
comment on column scheduled_messages.body_text is
  'Short plain-text copy of the message (SMS-length). Shown as the text preview; sent by nothing yet.';

-- 2. New recipient kinds for the new modules.
alter table scheduled_messages drop constraint if exists scheduled_messages_kind_check;
alter table scheduled_messages add constraint scheduled_messages_kind_check
  check (recipient_kind in ('guest','camp','assignee','admin','requester','kitchen','rider','card_holder'));

-- 3. queue_message learns body_text. Adding a parameter makes a NEW function, so the old
--    11-argument one is dropped here; existing positional callers resolve to the new one
--    through the default.
drop function if exists public.queue_message(uuid,text,uuid,text,text,text,text,text,timestamp with time zone,text,text);

create or replace function public.queue_message(
  p_camp_id uuid, p_subject_type text, p_subject_id uuid, p_rule_key text, p_recipient_kind text,
  p_to_email text, p_to_name text, p_reply_to text, p_send_after timestamp with time zone,
  p_subject text, p_body_html text, p_body_text text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(btrim(p_to_email),'') = '' or p_to_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return;   -- no address is not an error, it is a camp that has not filled one in
  end if;
  -- Never queue something already in the past: re-planning must not resurrect a missed nudge.
  if p_send_after < now() - interval '12 hours' then return; end if;

  insert into scheduled_messages (
    camp_id, subject_type, subject_id, rule_key, recipient_kind,
    to_email, to_name, reply_to, send_after, subject, body_html, body_text)
  values (p_camp_id, p_subject_type, p_subject_id, p_rule_key, p_recipient_kind,
          lower(btrim(p_to_email)), p_to_name, p_reply_to, p_send_after, p_subject, p_body_html,
          left(p_body_text, 320))
  on conflict (subject_type, subject_id, rule_key, recipient_kind) do nothing;
end;
$function$;

revoke execute on function public.queue_message(uuid,text,uuid,text,text,text,text,text,timestamp with time zone,text,text,text) from public, anon, authenticated;
grant execute on function public.queue_message(uuid,text,uuid,text,text,text,text,text,timestamp with time zone,text,text,text) to service_role;

-- 4. Demo people never get mail. Seeded demo data uses example.com / example.org addresses
--    (reserved by RFC 2606, so they can never be a real inbox); sending to them would bounce
--    and cost the sending domain its reputation. A visitor who types their own address still
--    gets the real email, which is the point of trying it.
create or replace function public.claim_outbox_batch(p_limit integer default 50)
returns table(batch_id uuid, to_email text, to_name text, reply_to text, subject text, body_html text, message_ids uuid[])
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_batch uuid := gen_random_uuid();
begin
  update scheduled_messages
     set state = 'cancelled', suppressed_reason = 'demo_address', updated_at = now()
   where state = 'scheduled'
     and send_after <= now()
     and (to_email like '%@example.com' or to_email like '%@example.org');

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
$function$;

revoke execute on function public.claim_outbox_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(integer) to service_role;

-- 5. One planner hook per new module. Each module replaces only its own stub, so the three
--    builds never rewrite plan_all_messages. The *_internal names carry no member gate: they are
--    reached from cron (trap: a gated function called from cron silently does nothing).
create or replace function public.plan_food_request_messages_internal() returns integer
language sql security definer set search_path to 'public' as $$ select 0 $$;
create or replace function public.plan_trip_messages_internal() returns integer
language sql security definer set search_path to 'public' as $$ select 0 $$;
create or replace function public.plan_receipt_messages_internal() returns integer
language sql security definer set search_path to 'public' as $$ select 0 $$;

create or replace function public.plan_all_messages()
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(public.plan_retreat_messages(null), 0)
       + coalesce(public.plan_work_messages(null), 0)
       + coalesce(public.plan_deposit_chase(null), 0)
       + coalesce(public.plan_food_request_messages_internal(), 0)
       + coalesce(public.plan_trip_messages_internal(), 0)
       + coalesce(public.plan_receipt_messages_internal(), 0);
$function$;

do $$
declare f text;
begin
  foreach f in array array['plan_all_messages()','plan_food_request_messages_internal()',
                           'plan_trip_messages_internal()','plan_receipt_messages_internal()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- The demo-address sweep added to claim_outbox_batch an hour earlier broke the drain.
--
-- claim_outbox_batch RETURNS TABLE(... to_email ...), which makes `to_email` a PL/pgSQL variable
-- inside the body; the unqualified `to_email like ...` in the new UPDATE was ambiguous and every
-- call raised 42702, so nothing could be sent. Found by platform_groundwork_test G3 before any
-- cron run delivered it. The fix qualifies every column in that statement.
create or replace function public.claim_outbox_batch(p_limit integer default 50)
returns table(batch_id uuid, to_email text, to_name text, reply_to text, subject text, body_html text, message_ids uuid[])
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_batch uuid := gen_random_uuid();
begin
  -- Demo people never get mail (example.com / example.org are reserved and never a real inbox).
  update scheduled_messages sm
     set state = 'cancelled', suppressed_reason = 'demo_address', updated_at = now()
   where sm.state = 'scheduled'
     and sm.send_after <= now()
     and (sm.to_email like '%@example.com' or sm.to_email like '%@example.org');

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

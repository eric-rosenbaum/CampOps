-- The one place the two channels can both land on the same person for the same thing.
--
-- `unread_message` emails an assignee thirty minutes after somebody comments on their work
-- order. Push now does the same job in a second. Both firing is not twice as helpful; it is the
-- product looking like it does not know what it already told you.
--
-- The rule: push is the fast lane, email is the fallback for what push could not deliver. So
-- this skips the email when a push about that thread was actually DELIVERED to that assignee at
-- or after the comment. Delivered, not queued and not "they have a phone registered" -- a
-- rejected token or a dead send leaves the row in 'failed' or 'skipped' and the email goes as it
-- always did, which is the direction you want the failure to fall. Somebody who has never opened
-- the iOS app is unaffected: nothing is ever 'sent' for them, so they keep getting email.
--
-- It reads "a push on this thread at or after the comment" rather than "a push for exactly this
-- comment" on purpose. If two comments land a minute apart and the second one buzzed the phone,
-- the assignee has been told about that conversation; an email about the first one is noise.
--
-- Everything else in this function is unchanged from what was live.
create or replace function public.plan_work_messages(p_camp_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare i record; v_n int := 0; v_admin text; v_to text; v_name text;
begin
  for i in
    select w.*, c.name as camp_name
    from issues w join camps c on c.id = w.camp_id
    where w.priority = 'urgent' and w.status = 'unassigned'
      and w.created_at > now() - interval '7 days'
      and (p_camp_id is null or w.camp_id = p_camp_id)
  loop
    v_admin := public.camp_admin_email(i.camp_id);
    perform public.queue_message(i.camp_id, 'work_order', i.id, 'urgent_unassigned', 'admin',
      v_admin, i.camp_name, null, i.created_at + interval '4 hours',
      'Urgent and unassigned: ' || i.title,
      public.msg_wrap('Nobody has picked this up',
        '<strong>' || i.title || '</strong>'
        || coalesce('<br>' || i.locations[1], '')
        || '<br>Reported ' || to_char(i.created_at, 'FMMon FMDD at FMHH12:MIam')
        || ' and still unassigned.', i.camp_name));
    v_n := v_n + 1;
  end loop;

  for i in
    select distinct on (w.id) w.id, w.camp_id, w.title, w.assignee_id, c.name as camp_name,
           k.created_at as msg_at, k.author_name, k.body
    from issue_comments k
    join issues w on w.id = k.issue_id
    join camps  c on c.id = w.camp_id
    left join issue_comment_reads rr on rr.issue_id = w.id and rr.user_id = w.assignee_id
    where w.assignee_id is not null and w.status <> 'resolved'
      and k.deleted_at is null and k.author_id is distinct from w.assignee_id
      and (rr.last_read_at is null or k.created_at > rr.last_read_at)
      and k.created_at > now() - interval '3 days'
      and (p_camp_id is null or w.camp_id = p_camp_id)
      -- Their phone already buzzed about this thread. Do not follow it with an email.
      and not exists (
        select 1 from push_notifications pn
         where pn.user_id = w.assignee_id
           and pn.subject_type = 'work_order'
           and pn.subject_id = w.id
           and pn.rule_key = 'comment'
           and pn.state = 'sent'
           and pn.created_at >= k.created_at)
    order by w.id, k.created_at desc
  loop
    v_to := public.user_email(i.assignee_id);
    select full_name into v_name from profiles where id = i.assignee_id;
    perform public.queue_message(i.camp_id, 'work_order', i.id, 'unread_message', 'assignee',
      v_to, v_name, null, i.msg_at + interval '30 minutes',
      'New message on ' || i.title,
      public.msg_wrap('Someone commented on your work order',
        '<strong>' || i.author_name || '</strong> on <em>' || i.title || '</em>:<br><br>'
        || left(i.body, 400), i.camp_name));
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

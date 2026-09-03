-- Automated email as an outbox, not a cron job that sends.
--
-- The distinction is the whole design. A nightly job that emails directly WILL send "please
-- submit your rooming" the morning after they submitted it, because it fires on a date and the
-- world changed after the date was chosen. An outbox plans ahead, re-plans nightly, and CANCELS
-- anything whose condition stopped being true before it goes out.
--
-- It also lets the camp see the queue -- what is going out, to whom, when, with cancel and edit.
-- Nothing sends silently. That is the trust requirement for putting our name in front of a
-- paying customer's guests.
--
-- subject_type is generic from the first migration because the campground half rides the same
-- rails immediately: escalation on unassigned urgent work, and unread-message nudges.

alter table camps add column if not exists timezone text not null default 'America/New_York';
comment on column camps.timezone is
  'Camp-local time. Quiet hours are meaningless without it, and a 6am email to a coordinator is a complaint.';

create table if not exists scheduled_messages (
  id             uuid primary key default gen_random_uuid(),
  camp_id        uuid not null references camps(id) on delete cascade,
  subject_type   text not null,
  subject_id     uuid not null,
  rule_key       text not null,
  recipient_kind text not null,
  to_email       text not null,
  to_name        text,
  reply_to       text,
  subject        text not null,
  body_html      text not null,
  send_after     timestamptz not null,
  state          text not null default 'scheduled',
  suppressed_reason text,
  batch_id       uuid,
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table scheduled_messages drop constraint if exists scheduled_messages_state_check;
alter table scheduled_messages add constraint scheduled_messages_state_check
  check (state in ('scheduled','sending','sent','cancelled','failed'));

alter table scheduled_messages drop constraint if exists scheduled_messages_kind_check;
alter table scheduled_messages add constraint scheduled_messages_kind_check
  check (recipient_kind in ('guest','camp','assignee','admin'));

-- One rule fires once per subject per recipient. This single index is what makes the planner
-- safe to re-run every night.
create unique index if not exists scheduled_messages_once
  on scheduled_messages (subject_type, subject_id, rule_key, recipient_kind);

create index if not exists scheduled_messages_due
  on scheduled_messages (state, send_after) where state = 'scheduled';
create index if not exists scheduled_messages_camp
  on scheduled_messages (camp_id, created_at desc);

alter table scheduled_messages enable row level security;
drop policy if exists scheduled_messages_read on scheduled_messages;
create policy scheduled_messages_read on scheduled_messages for select using (is_camp_member(camp_id));
drop policy if exists scheduled_messages_write on scheduled_messages;
create policy scheduled_messages_write on scheduled_messages
  for all using (is_camp_admin(camp_id)) with check (is_camp_admin(camp_id));

alter table scheduled_messages replica identity full;

-- Helpers ------------------------------------------------------------------------
create or replace function public.queue_message(
  p_camp_id uuid, p_subject_type text, p_subject_id uuid, p_rule_key text,
  p_recipient_kind text, p_to_email text, p_to_name text, p_reply_to text,
  p_send_after timestamptz, p_subject text, p_body_html text
) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if coalesce(btrim(p_to_email),'') = '' or p_to_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return;   -- no address is not an error, it is a camp that has not filled one in
  end if;
  -- Never queue something already in the past: re-planning must not resurrect a missed nudge.
  if p_send_after < now() - interval '12 hours' then return; end if;

  insert into scheduled_messages (
    camp_id, subject_type, subject_id, rule_key, recipient_kind,
    to_email, to_name, reply_to, send_after, subject, body_html)
  values (p_camp_id, p_subject_type, p_subject_id, p_rule_key, p_recipient_kind,
          lower(btrim(p_to_email)), p_to_name, p_reply_to, p_send_after, p_subject, p_body_html)
  on conflict (subject_type, subject_id, rule_key, recipient_kind) do nothing;
end;
$fn$;

create or replace function public.cancel_message(
  p_subject_type text, p_subject_id uuid, p_rule_key text, p_reason text
) returns void language sql security definer set search_path = public as $fn$
  update scheduled_messages
     set state = 'cancelled', suppressed_reason = p_reason, updated_at = now()
   where subject_type = p_subject_type and subject_id = p_subject_id
     and rule_key = p_rule_key and state = 'scheduled';
$fn$;

create or replace function public.msg_wrap(p_title text, p_body text, p_camp text)
returns text language sql immutable as $fn$
  select '<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#23201B">'
      || '<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5E7A61;margin-bottom:14px">'
      || p_camp || '</div>'
      || '<div style="font-family:Georgia,serif;font-size:20px;color:#1D3A2E;margin-bottom:14px">' || p_title || '</div>'
      || '<div style="font-size:15px;line-height:1.6">' || p_body || '</div>'
      || '<div style="font-size:12px;color:#8B8271;border-top:1px solid #DED3BB;margin-top:22px;padding-top:12px">'
      || 'Sent by ' || p_camp || ' through CampCommand.</div></div>';
$fn$;

-- The planner ---------------------------------------------------------------------
create or replace function public.plan_retreat_messages(p_camp_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  r record; v_n int := 0; v_url text; v_days int;
  v_agreement record; v_coord text; v_campmail text; v_signed boolean;
  v_owed numeric;
begin
  for r in
    select rt.*, c.name as camp_name, c.timezone, c.slug
    from retreats rt join camps c on c.id = rt.camp_id
    where rt.status not in ('cancelled','complete')
      and (p_camp_id is null or rt.camp_id = p_camp_id)
      and rt.arrival_date is not null
  loop
    v_coord    := r.coordinator_email;
    v_campmail := (select p.email from camp_members m join profiles p on p.id = m.user_id
                    where m.camp_id = r.camp_id and m.role = 'admin' order by m.created_at limit 1);
    v_url := 'https://app.campcommand.app/portal/' || r.portal_token;

    -- 1 · Agreement unsigned -------------------------------------------------
    select * into v_agreement from retreat_documents
     where retreat_id = r.id and doc_type = 'agreement' order by created_at limit 1;
    v_signed := coalesce(v_agreement.status in ('signed','approved'), false);

    if v_agreement.id is not null and v_agreement.due_date is not null then
      if v_signed then
        perform public.cancel_message('retreat', r.id, 'agreement_14d', 'signed');
        perform public.cancel_message('retreat', r.id, 'agreement_7d',  'signed');
        perform public.cancel_message('retreat', r.id, 'agreement_2d',  'signed');
      else
        foreach v_days in array array[14,7,2] loop
          perform public.queue_message(r.camp_id, 'retreat', r.id, 'agreement_' || v_days || 'd', 'guest',
            v_coord, r.coordinator_name, v_campmail,
            (v_agreement.due_date - v_days)::timestamp at time zone r.timezone,
            'Your agreement for ' || r.camp_name || ' is still unsigned',
            public.msg_wrap('The agreement is waiting for a signature',
              'Your booking for <strong>' || r.group_name || '</strong> is not confirmed until the agreement is signed. '
              || 'It takes a minute in your browser — no printing.<p><a href="' || v_url
              || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Open your portal</a></p>',
              r.camp_name));
          v_n := v_n + 1;
        end loop;
      end if;
    end if;

    -- 2 · Deposit unpaid -----------------------------------------------------
    if r.deposit_due is not null and coalesce(r.deposit_required,0) > 0 then
      if coalesce(r.deposit_received,0) >= r.deposit_required then
        perform public.cancel_message('retreat', r.id, 'deposit_7d', 'paid');
        perform public.cancel_message('retreat', r.id, 'deposit_1d', 'paid');
      else
        foreach v_days in array array[7,1] loop
          perform public.queue_message(r.camp_id, 'retreat', r.id, 'deposit_' || v_days || 'd', 'guest',
            v_coord, r.coordinator_name, v_campmail,
            (r.deposit_due - v_days)::timestamp at time zone r.timezone,
            'Deposit due ' || to_char(r.deposit_due, 'FMMon FMDD') || ' — ' || r.camp_name,
            public.msg_wrap('Your deposit is due soon',
              'The deposit for <strong>' || r.group_name || '</strong> is due on '
              || to_char(r.deposit_due, 'FMDay, FMMon FMDD') || '.<p><a href="' || v_url
              || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">View and pay</a></p>',
              r.camp_name));
          v_n := v_n + 1;
        end loop;
      end if;
    end if;

    -- 3 · Rooming not submitted ----------------------------------------------
    if r.housing_deadline is not null then
      if r.housing_submitted_at is not null then
        perform public.cancel_message('retreat', r.id, 'housing_14d', 'submitted');
        perform public.cancel_message('retreat', r.id, 'housing_7d',  'submitted');
        perform public.cancel_message('retreat', r.id, 'housing_2d',  'submitted');
      else
        foreach v_days in array array[14,7,2] loop
          perform public.queue_message(r.camp_id, 'retreat', r.id, 'housing_' || v_days || 'd', 'guest',
            v_coord, r.coordinator_name, v_campmail,
            (r.housing_deadline - v_days)::timestamp at time zone r.timezone,
            'Room assignments for ' || r.group_name,
            public.msg_wrap('Your rooming is not finished yet',
              'We need your room assignments by <strong>' || to_char(r.housing_deadline, 'FMDay, FMMon FMDD')
              || '</strong> so we can get the cabins ready.<p><a href="' || v_url
              || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Finish rooming</a></p>',
              r.camp_name));
          v_n := v_n + 1;
        end loop;
      end if;
    end if;

    -- 4 · Headcount unconfirmed ----------------------------------------------
    if r.headcount_cutoff is not null then
      if r.final_headcount is not null then
        perform public.cancel_message('retreat', r.id, 'headcount_7d', 'confirmed');
        perform public.cancel_message('retreat', r.id, 'headcount_2d', 'confirmed');
      else
        foreach v_days in array array[7,2] loop
          perform public.queue_message(r.camp_id, 'retreat', r.id, 'headcount_' || v_days || 'd', 'guest',
            v_coord, r.coordinator_name, v_campmail,
            (r.headcount_cutoff - v_days)::timestamp at time zone r.timezone,
            'Final numbers for ' || r.group_name,
            public.msg_wrap('We need your final headcount',
              'The kitchen orders against this number, so it is the one figure we cannot guess. '
              || 'Due <strong>' || to_char(r.headcount_cutoff, 'FMDay, FMMon FMDD') || '</strong>.<p><a href="' || v_url
              || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Confirm your numbers</a></p>',
              r.camp_name));
          v_n := v_n + 1;
        end loop;
      end if;
    end if;

    -- 5 · COI missing --------------------------------------------------------
    if exists (select 1 from retreat_documents d where d.retreat_id = r.id and d.doc_type = 'coi'
                 and d.status in ('received','approved')) then
      perform public.cancel_message('retreat', r.id, 'coi_21d', 'received');
      perform public.cancel_message('retreat', r.id, 'coi_7d',  'received');
    else
      foreach v_days in array array[21,7] loop
        perform public.queue_message(r.camp_id, 'retreat', r.id, 'coi_' || v_days || 'd', 'guest',
          v_coord, r.coordinator_name, v_campmail,
          (r.arrival_date - v_days)::timestamp at time zone r.timezone,
          'Certificate of insurance for ' || r.group_name,
          public.msg_wrap('We still need your certificate of insurance',
            'Your group cannot check in without it, so it is worth chasing your broker now rather than the week of.<p><a href="'
            || v_url || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Upload your COI</a></p>',
            r.camp_name));
        v_n := v_n + 1;
      end loop;
    end if;

    -- 6 · Program spaces not chosen ------------------------------------------
    if exists (select 1 from retreat_space_requests q where q.retreat_id = r.id) then
      perform public.cancel_message('retreat', r.id, 'spaces_14d', 'chosen');
      perform public.cancel_message('retreat', r.id, 'spaces_7d',  'chosen');
    elsif exists (select 1 from locations l where l.camp_id = r.camp_id and l.program_space and l.is_active) then
      foreach v_days in array array[14,7] loop
        perform public.queue_message(r.camp_id, 'retreat', r.id, 'spaces_' || v_days || 'd', 'guest',
          v_coord, r.coordinator_name, v_campmail,
          (r.arrival_date - v_days)::timestamp at time zone r.timezone,
          'Where would you like to meet at ' || r.camp_name || '?',
          public.msg_wrap('Tell us which spaces you need',
            'Pick your meeting and activity spaces and tell us how you want them set up — tables, chairs, anything you need moved. '
            || 'We will have the room ready when you walk in.<p><a href="' || v_url
            || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Choose your spaces</a></p>',
            r.camp_name));
        v_n := v_n + 1;
      end loop;
    end if;

    -- 7 · Balance unpaid -----------------------------------------------------
    select sum(i.amount - coalesce(i.amount_paid,0)) into v_owed
      from retreat_invoices i where i.retreat_id = r.id and i.status <> 'paid';
    if coalesce(v_owed,0) <= 0 then
      perform public.cancel_message('retreat', r.id, 'balance_due', 'paid');
    else
      perform public.queue_message(r.camp_id, 'retreat', r.id, 'balance_due', 'guest',
        v_coord, r.coordinator_name, v_campmail,
        (r.departure_date + 7)::timestamp at time zone r.timezone,
        'Balance for ' || r.group_name,
        public.msg_wrap('Your balance is outstanding',
          'Thank you for staying with us. There is $' || to_char(v_owed, 'FM999999.00') || ' outstanding.<p><a href="'
          || v_url || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">View your invoice</a></p>',
          r.camp_name));
      v_n := v_n + 1;
    end if;

    -- 8 · Proposal sent but not opened ---------------------------------------
    perform public.queue_message(r.camp_id, 'retreat', r.id, 'proposal_unopened', 'camp',
      v_campmail, r.camp_name, null,
      (p.sent_at + interval '3 days'),
      r.group_name || ' has not opened your proposal',
      public.msg_wrap('Proposal still unopened',
        'You sent a proposal to <strong>' || r.group_name || '</strong> three days ago and it has not been opened. '
        || 'A phone call converts better than a second email.', r.camp_name))
    from retreat_proposals p
    where p.retreat_id = r.id and p.status = 'sent' and p.sent_at is not null;

    -- 9 · Arrival brief, to the camp -----------------------------------------
    -- The one nobody asks for and everybody loves.
    perform public.queue_message(r.camp_id, 'retreat', r.id, 'arrival_brief', 'camp',
      v_campmail, r.camp_name, null,
      (r.arrival_date - 3)::timestamp at time zone r.timezone,
      r.group_name || ' arrives ' || to_char(r.arrival_date, 'FMDay'),
      public.msg_wrap(r.group_name || ' arrives in three days',
        '<strong>' || coalesce(r.final_headcount, r.headcount, 0)::text || ' people</strong>, '
        || to_char(r.arrival_date, 'FMMon FMDD') || ' to ' || to_char(r.departure_date, 'FMMon FMDD') || '.<br>'
        || 'Rooms assigned: ' || (select count(*) from retreat_housing h where h.retreat_id = r.id)::text || '<br>'
        || 'Meals planned: '  || (select count(*) from retreat_meals m where m.retreat_id = r.id)::text || '<br>'
        || 'Set-ups due: '    || (select count(*) from retreat_space_requests q
                                   where q.retreat_id = r.id and q.status = 'approved')::text || '<br>'
        || 'Set-up work still open: '
        || (select count(*) from issues i where i.retreat_id = r.id and i.status <> 'resolved')::text,
        r.camp_name));
    v_n := v_n + 1;

    -- 10 · Set-up work not finished the night before --------------------------
    if exists (select 1 from issues i where i.retreat_id = r.id and i.source = 'retreat'
                 and i.status <> 'resolved' and i.due_date <= r.arrival_date) then
      perform public.queue_message(r.camp_id, 'retreat', r.id, 'setup_incomplete', 'camp',
        v_campmail, r.camp_name, null,
        (r.arrival_date - 1)::timestamp at time zone r.timezone + interval '17 hours',
        'Set-up for ' || r.group_name || ' is not finished',
        public.msg_wrap('Set-up work is still open',
          r.group_name || ' arrives tomorrow and there is still open set-up work on the board.', r.camp_name));
      v_n := v_n + 1;
    else
      perform public.cancel_message('retreat', r.id, 'setup_incomplete', 'set-up finished');
    end if;

    -- 11 · Feedback ----------------------------------------------------------
    if r.departure_date is not null then
      if exists (select 1 from retreat_feedback f where f.retreat_id = r.id) then
        perform public.cancel_message('retreat', r.id, 'feedback', 'already given');
      else
        perform public.queue_message(r.camp_id, 'retreat', r.id, 'feedback', 'guest',
          v_coord, r.coordinator_name, v_campmail,
          (r.departure_date + 2)::timestamp at time zone r.timezone,
          'How was your stay at ' || r.camp_name || '?',
          public.msg_wrap('Two minutes on how it went',
            'Thank you for bringing <strong>' || r.group_name || '</strong> to us. '
            || 'If anything was not right we would rather hear it than not.<p><a href="' || v_url
            || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Leave feedback</a></p>',
            r.camp_name));
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  return v_n;
end;
$fn$;

-- The campground half rides the same rails ---------------------------------------
create or replace function public.plan_work_messages(p_camp_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare i record; v_n int := 0; v_admin text; v_name text;
begin
  -- Urgent and nobody has picked it up.
  for i in
    select w.*, c.name as camp_name, c.timezone
    from issues w join camps c on c.id = w.camp_id
    where w.priority = 'urgent' and w.status = 'unassigned'
      and w.created_at > now() - interval '7 days'
      and (p_camp_id is null or w.camp_id = p_camp_id)
  loop
    v_admin := (select p.email from camp_members m join profiles p on p.id = m.user_id
                 where m.camp_id = i.camp_id and m.role = 'admin' order by m.created_at limit 1);
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

  -- Assigned, someone said something, and it has not been read.
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
    order by w.id, k.created_at desc
  loop
    select p.email, p.full_name into v_admin, v_name from profiles p where p.id = i.assignee_id;
    perform public.queue_message(i.camp_id, 'work_order', i.id, 'unread_message', 'assignee',
      v_admin, v_name, null, i.msg_at + interval '30 minutes',
      'New message on ' || i.title,
      public.msg_wrap('Someone commented on your work order',
        '<strong>' || i.author_name || '</strong> on <em>' || i.title || '</em>:<br><br>'
        || left(i.body, 400), i.camp_name));
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

-- Draining -------------------------------------------------------------------------
-- Quiet hours and a one-per-recipient-per-day cap: a group with three overdue items gets ONE
-- email listing three things, not three emails. Merging happens here rather than in the planner
-- so each rule stays independently cancellable right up to the moment of sending.
create or replace function public.claim_outbox_batch(p_limit integer default 50)
returns table (
  batch_id uuid, to_email text, to_name text, reply_to text,
  subject text, body_html text, message_ids uuid[]
) language plpgsql security definer set search_path = public as $fn$
declare v_batch uuid := gen_random_uuid();
begin
  create temporary table if not exists _claim (id uuid) on commit drop;
  delete from _claim;

  insert into _claim (id)
  select m.id from scheduled_messages m
  join camps c on c.id = m.camp_id
  where m.state = 'scheduled' and m.send_after <= now()
    -- Camp-local quiet hours. A 6am email to a coordinator is a complaint.
    and extract(hour from (now() at time zone c.timezone)) between 8 and 19
  order by m.send_after
  limit p_limit;

  update scheduled_messages set state = 'sending', batch_id = v_batch, updated_at = now()
   where id in (select id from _claim);

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
  where m.batch_id = v_batch
  group by m.to_email;
end;
$fn$;

create or replace function public.mark_outbox_sent(
  p_ids uuid[], p_ok boolean, p_error text default null
) returns void language sql security definer set search_path = public as $fn$
  update scheduled_messages
     set state   = case when p_ok then 'sent' else 'failed' end,
         sent_at = case when p_ok then now() else null end,
         error   = case when p_ok then null else p_error end,
         updated_at = now()
   where id = any(p_ids);
$fn$;

-- Nightly ---------------------------------------------------------------------------
create or replace function public.plan_all_messages()
returns integer language sql security definer set search_path = public as $fn$
  select coalesce(public.plan_retreat_messages(null), 0) + coalesce(public.plan_work_messages(null), 0);
$fn$;

select cron.schedule('campcommand-plan-messages', '30 6 * * *', $cron$select public.plan_all_messages();$cron$)
where not exists (select 1 from cron.job where jobname = 'campcommand-plan-messages');

select cron.schedule('campcommand-generate-work', '15 6 * * *', $cron$select public.generate_scheduled_work(null, null);$cron$)
where not exists (select 1 from cron.job where jobname = 'campcommand-generate-work');

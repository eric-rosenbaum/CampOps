-- Both outbox planners looked for an email address on `profiles`. It is not there.
--
-- public.profiles is (id, full_name, avatar_url, created_at, updated_at) — the address lives on
-- auth.users, which is exactly why these functions are SECURITY DEFINER. Every call to
-- plan_retreat_messages() and plan_work_messages() was raising 42703, which means the nightly
-- pg_cron job was failing silently and NOTHING was ever queued.
--
-- One helper, so there is a single answer to "where does mail for this camp go" rather than the
-- same join copied into two functions and drifting.

create or replace function public.camp_admin_email(p_camp_id uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select u.email::text
  from camp_members m
  join auth.users u on u.id = m.user_id
  where m.camp_id = p_camp_id and m.role = 'admin' and coalesce(m.is_active, true)
    and u.email is not null
  order by m.created_at
  limit 1;
$fn$;

create or replace function public.user_email(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select u.email::text from auth.users u where u.id = p_user_id;
$fn$;

comment on function public.camp_admin_email(uuid) is
  'Where camp-facing automated mail goes: the longest-standing active admin. Reads auth.users because profiles has no address column.';

-- Repoint the two planners --------------------------------------------------------
create or replace function public.plan_retreat_messages(p_camp_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  r record; v_n int := 0; v_url text; v_days int;
  v_agreement record; v_coord text; v_campmail text; v_signed boolean; v_owed numeric;
begin
  for r in
    select rt.*, c.name as camp_name, c.timezone, c.slug
    from retreats rt join camps c on c.id = rt.camp_id
    where rt.status not in ('cancelled','complete')
      and (p_camp_id is null or rt.camp_id = p_camp_id)
      and rt.arrival_date is not null
  loop
    v_coord    := r.coordinator_email;
    v_campmail := public.camp_admin_email(r.camp_id);
    v_url := 'https://app.campcommand.app/portal/' || r.portal_token;

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

    select sum(i.amount - coalesce(i.amount_paid,0)) into v_owed
      from retreat_invoices i where i.retreat_id = r.id and i.status <> 'paid';
    if coalesce(v_owed,0) <= 0 then
      perform public.cancel_message('retreat', r.id, 'balance_due', 'paid');
    elsif r.departure_date is not null then
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

    perform public.queue_message(r.camp_id, 'retreat', r.id, 'proposal_unopened', 'camp',
      v_campmail, r.camp_name, null, (p.sent_at + interval '3 days'),
      r.group_name || ' has not opened your proposal',
      public.msg_wrap('Proposal still unopened',
        'You sent a proposal to <strong>' || r.group_name || '</strong> three days ago and it has not been opened. '
        || 'A phone call converts better than a second email.', r.camp_name))
    from retreat_proposals p
    where p.retreat_id = r.id and p.status = 'sent' and p.sent_at is not null;

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
        || 'Work still open: '
        || (select count(*) from issues i where i.retreat_id = r.id and i.status <> 'resolved')::text,
        r.camp_name));
    v_n := v_n + 1;

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

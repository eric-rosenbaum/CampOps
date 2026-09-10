-- A nudge to the camp, not the group: did that deposit ever arrive?
--
-- deposit_7d and deposit_1d chase the guest, which is right, and then nothing happens. A cheque
-- that never came does not announce itself -- the retreat simply moves on with the dates held
-- and no money against them, and somebody notices in the week of arrival. The camp asked for a
-- reminder it could time itself: so many days after the deposit invoice was sent, ask whether it
-- landed. Cancels the moment it is paid, like every other rule here.

alter table camps add column if not exists deposit_chase_days int;

comment on column camps.deposit_chase_days is
  'Days after a deposit invoice is sent before the CAMP is asked whether it arrived. Null means do not ask.';

create or replace function public.plan_deposit_chase(p_camp_id uuid default null)
returns int language plpgsql security definer set search_path = public as $fn$
declare r record; v_n int := 0; v_when timestamptz; v_url text;
begin
  for r in
    select rt.id, rt.camp_id, rt.group_name, rt.deposit_required, rt.deposit_received,
           c.name as camp_name, c.timezone, c.deposit_chase_days,
           (select min(i.issued_at) from retreat_invoices i
            where i.retreat_id = rt.id and i.kind = 'deposit' and i.status <> 'void'
              and i.status <> 'draft') as sent_at
    from retreats rt
    join camps c on c.id = rt.camp_id
    where rt.status <> 'cancelled'
      and coalesce(c.deposit_chase_days, 0) > 0
      and coalesce(rt.deposit_required, 0) > 0
      and (p_camp_id is null or rt.camp_id = p_camp_id)
  loop
    if r.sent_at is null then continue; end if;

    -- Paid: nothing to ask about.
    if coalesce(r.deposit_received, 0) >= r.deposit_required then
      perform public.cancel_message('retreat', r.id, 'deposit_chase', 'paid');
      continue;
    end if;

    v_when := r.sent_at + make_interval(days => r.deposit_chase_days);
    v_url := 'https://app.campcommand.app/retreats';

    perform public.queue_message(
      r.camp_id, 'retreat', r.id, 'deposit_chase', 'camp',
      public.camp_admin_email(r.camp_id), r.camp_name, null,
      v_when,
      'Did ' || r.group_name || '''s deposit arrive?',
      public.msg_wrap(
        'Deposit still showing unpaid',
        'The deposit invoice for <strong>' || r.group_name || '</strong> went out '
        || r.deposit_chase_days || ' days ago and nothing has been recorded against it. '
        || 'If it came in by cheque or transfer, log it so the booking stops chasing them.'
        || '<p><a href="' || v_url
        || '" style="background:#1D3A2E;color:#FCF9F1;text-decoration:none;padding:11px 20px;border-radius:5px;display:inline-block">Open the booking</a></p>',
        r.camp_name));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

grant execute on function public.plan_deposit_chase(uuid) to authenticated;

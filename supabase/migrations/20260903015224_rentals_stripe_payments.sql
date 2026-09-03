-- Taking a deposit online, without becoming a payments company.
--
-- The biggest conversion gap against the category: coordinators pay a link and stall on a mailed
-- check. But this is a camp collecting from ITS OWN customers -- the money is not ours and must
-- never touch our balance -- so this is Stripe Connect (Standard), where the camp connects its
-- own Stripe account and funds settle directly to it. We hold an account id, never a key, never
-- a card number, never a balance.
--
-- Deliberately not built: stored cards, subscriptions, refunds, payouts, disputes. A Pay button
-- and a webhook that records what cleared. Everything else is Stripe's dashboard, which the camp
-- already has.

alter table camps add column if not exists stripe_account_id       text;
alter table camps add column if not exists stripe_charges_enabled  boolean not null default false;
alter table camps add column if not exists stripe_connected_at     timestamptz;

comment on column camps.stripe_account_id is
  'Stripe Connect (Standard) account belonging to the CAMP. Funds settle to them directly. We never hold a secret key for it -- only this id, which is useless without our platform credentials.';

-- Invoices can be paid ----------------------------------------------------------
alter table retreat_invoices add column if not exists stripe_session_id  text;
alter table retreat_invoices add column if not exists payment_link_url   text;
alter table retreat_invoices add column if not exists payment_link_expires_at timestamptz;
alter table retreat_invoices add column if not exists paid_at            timestamptz;
alter table retreat_invoices add column if not exists amount_paid        numeric not null default 0;

create index if not exists retreat_invoices_session_idx
  on retreat_invoices (stripe_session_id) where stripe_session_id is not null;

-- Webhook landing pad + idempotency ----------------------------------------------
-- Stripe retries. Recording the event id and refusing to process one twice is the difference
-- between a payment recorded once and a group's balance going negative on a redelivery.
create table if not exists payment_events (
  id           text primary key,             -- Stripe's event id
  camp_id      uuid references camps(id) on delete cascade,
  invoice_id   uuid references retreat_invoices(id) on delete set null,
  kind         text not null,
  amount       numeric,
  currency     text,
  raw          jsonb,
  processed_at timestamptz not null default now()
);
create index if not exists payment_events_camp_idx on payment_events (camp_id, processed_at desc);

alter table payment_events enable row level security;
-- No policies on purpose: only the service-role webhook writes here, and nothing in the app
-- needs to read it. The camp sees payments, not Stripe events.

-- Record a cleared payment. Called by the webhook with the service role, so it validates its own
-- inputs rather than trusting a policy to have done it.
create or replace function public.record_stripe_payment(
  p_event_id text, p_session_id text, p_amount numeric, p_currency text default 'usd',
  p_raw jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare inv retreat_invoices; v_paid numeric;
begin
  if exists (select 1 from payment_events where id = p_event_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select * into inv from retreat_invoices where stripe_session_id = p_session_id;
  if inv.id is null then
    insert into payment_events (id, kind, amount, currency, raw)
    values (p_event_id, 'unmatched', p_amount, p_currency, p_raw);
    return jsonb_build_object('ok', false, 'reason', 'no invoice for that checkout session');
  end if;

  v_paid := coalesce(inv.amount_paid, 0) + p_amount;

  update retreat_invoices
     set amount_paid = v_paid,
         paid_at     = case when v_paid >= inv.amount then now() else paid_at end,
         status      = case when v_paid >= inv.amount then 'paid' else status end,
         updated_at  = now()
   where id = inv.id;

  -- The camp's own payment ledger is what the retreat screen reads. A Stripe payment is a
  -- payment like any other; it just did not arrive as a check.
  insert into retreat_payments (id, camp_id, retreat_id, paid_on, amount, method, kind, note, created_at)
  values (gen_random_uuid(), inv.camp_id, inv.retreat_id, current_date, p_amount, 'card',
          case when inv.kind = 'deposit' then 'deposit' else 'payment' end,
          'Paid online · ' || inv.number, now());

  if inv.kind = 'deposit' then
    update retreats set deposit_received = coalesce(deposit_received, 0) + p_amount, updated_at = now()
     where id = inv.retreat_id;
  end if;

  insert into payment_events (id, camp_id, invoice_id, kind, amount, currency, raw)
  values (p_event_id, inv.camp_id, inv.id, 'payment', p_amount, p_currency, p_raw);

  return jsonb_build_object('ok', true, 'invoice_id', inv.id, 'amount_paid', v_paid);
end;
$fn$;

-- What the portal needs to render a Pay button. Returns null when the camp has not connected an
-- account, which the portal renders as the camp's existing "how to pay" note rather than a
-- broken button.
create or replace function public.portal_payable_invoices(p_token text)
returns jsonb language sql security definer stable set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'number', i.number, 'kind', i.kind, 'amount', i.amount,
           'amount_paid', i.amount_paid, 'due_date', i.due_date, 'status', i.status,
           'payment_link_url', i.payment_link_url,
           'payable', c.stripe_charges_enabled and i.status <> 'paid'
                      and (i.amount - coalesce(i.amount_paid,0)) > 0
         ) order by i.issued_at desc), '[]'::jsonb)
  from retreat_invoices i
  join retreats r on r.id = i.retreat_id
  join camps    c on c.id = i.camp_id
  where r.portal_token = p_token;
$fn$;

grant execute on function public.portal_payable_invoices(text) to anon, authenticated;

-- The camp's own view of whether payments are switched on.
create or replace function public.camp_payments_status(p_camp_id uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'connected', stripe_account_id is not null,
    'charges_enabled', stripe_charges_enabled,
    'connected_at', stripe_connected_at
  ) from camps where id = p_camp_id and is_camp_member(p_camp_id);
$fn$;

grant execute on function public.camp_payments_status(uuid) to authenticated;

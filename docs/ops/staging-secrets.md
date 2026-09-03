# Edge function secrets — staging

Six secrets. Three you already have, three you have to go and get.

Everything below is for **staging** (`mvxnpofopbmljzpgnycg`). Production is a separate project
with its own secrets and its own Stripe account; nothing here touches it.

---

## Where they go

**Dashboard →** https://supabase.com/dashboard/project/mvxnpofopbmljzpgnycg/settings/functions

That page is *Project Settings → Edge Functions → Edge Function Secrets*. Add each as a
name/value pair. They apply to every function in the project immediately — **no redeploy needed**.

**Or the CLI**, which is faster for six of them and does not put values in a browser:

```bash
npx supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  RESEND_API_KEY=re_... \
  RETREAT_FROM_EMAIL=retreats@campcommand.app \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  CRON_SECRET=... \
  --project-ref mvxnpofopbmljzpgnycg
```

> The linked project on this machine is **production**. Always pass `--project-ref` explicitly.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.
Do not set them.

### What each one is for

| Secret | Used by | If missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | `draft-work-order`, `retreat-intake`, `analyze-test-strip` | 503, named |
| `RESEND_API_KEY` | `send-email`, `outbox-drain` | 503, named |
| `RETREAT_FROM_EMAIL` | `send-email`, `outbox-drain` | falls back to `retreats@campcommand.app` |
| `STRIPE_SECRET_KEY` | `stripe-connect`, `stripe-webhook` | 503, named |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | 503, named |
| `CRON_SECRET` | `outbox-drain` | 503, named |

Every one of them fails with a specific message rather than quietly doing nothing — that was
deliberate, so a half-configured environment is obvious rather than mysterious.

---

## Getting `STRIPE_SECRET_KEY`

1. https://dashboard.stripe.com/test/apikeys — make sure the **Test mode** toggle is on.
2. Under *Standard keys*, **Secret key** → **Reveal test key**.
3. It starts `sk_test_`. That is the value.

Use the **test** key on staging. A live key here would let a staging click move real money.

### Before that key is any use: turn Connect on

CampCommand takes payment **on the camp's own Stripe account**, not ours — so the platform
account needs Connect enabled or `stripe-connect` cannot create an account for a camp.

1. https://dashboard.stripe.com/test/connect/accounts/overview
2. If you have never used Connect, there is a **Get started** flow. Choose **Platform or
   marketplace**, and when it asks what your platform does, the honest answer is that camps
   collect rental payments from their own customers and you never hold the funds.
3. Complete the **platform profile** it asks for. Until that is done, `accounts.create` returns an
   error about the platform profile and onboarding will not start.

You do **not** need to complete your own business verification to test in test mode.

---

## Getting `STRIPE_WEBHOOK_SECRET`

This is the one with a trap in it.

1. https://dashboard.stripe.com/test/webhooks → **Add endpoint**.
2. **Endpoint URL:**

   ```
   https://mvxnpofopbmljzpgnycg.supabase.co/functions/v1/stripe-webhook
   ```

3. **⚠ Choose "Events on Connected accounts", not "Events on your account".**

   Charges are *direct charges created on the connected account* (`stripeAccount` header), so
   `checkout.session.completed` fires on the **camp's** account, not on the platform's. A normal
   account webhook will be registered, look correct, and never fire once. This is the single
   most likely thing to get wrong here.

4. **Events to send** — select exactly these two:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`

   The second is not optional. For a card, the first event *is* the payment; for ACH or a bank
   debit the session comes back `payment_status: "unpaid"` and settles days later as the second.
   The function checks `payment_status` so the first event cannot book money that has not cleared.

5. Create it, then open the endpoint and **Reveal** the **Signing secret**. It starts `whsec_`.

The function has no auth check, and that is correct: the signature *is* the auth. It is deployed
with `--no-verify-jwt` because Stripe cannot send a Supabase JWT.

---

## Getting `CRON_SECRET`

You invent this one. It guards `outbox-drain`, which also takes no JWT — without it, anyone who
knew the URL could make your camps' reminder queue fire.

```bash
openssl rand -hex 32
```

**It has to go in two places, and they must match**, because Postgres and the edge function have
no shared store:

1. As the `CRON_SECRET` edge function secret (above).
2. In Supabase Vault, where the `drain_outbox()` cron job reads it. Run this once in the SQL
   editor, pasting the same value:

```sql
select vault.create_secret(
  'PASTE_THE_SAME_VALUE_HERE',
  'cron_secret',
  'Shared secret for the outbox-drain edge function.'
);
```

It lives in Vault rather than in the cron job body because `cron.job` is readable and ends up in
every backup.

To rotate it later, update both:

```sql
update vault.secrets set secret = 'NEW_VALUE' where name = 'cron_secret';
```

`functions_base_url` is already in Vault and points at staging. On production it must be set to
that project's own functions URL.

---

## Check it worked

```sql
-- Should list cron_secret and functions_base_url (names only; values stay encrypted).
select name, description from vault.secrets order by name;

-- Four jobs, all active.
select jobname, schedule, active from cron.job where jobname like 'campcommand-%';

-- Force one drain now rather than waiting for the quarter hour.
select public.drain_outbox();

-- Then look at what it did. A 401 here means the two copies of CRON_SECRET disagree.
select id, status_code, content::text
from net._http_response order by created desc limit 3;
```

For Stripe, the honest end-to-end test is: connect a camp in **Camp Info → Payments**, issue a
deposit invoice on a retreat, open the guest portal and pay with `4242 4242 4242 4242`, then
confirm the payment landed:

```sql
select number, status, amount, amount_paid, paid_at from retreat_invoices
where stripe_session_id is not null order by updated_at desc limit 5;

select * from payment_events order by processed_at desc limit 5;
```

`payment_events` is keyed on the Stripe event id, so a redelivery is recorded as a duplicate and
cannot take the money twice.

---

## What is already done

- All five new functions are **deployed** to staging, with `verify_jwt` off on `stripe-webhook`
  and `outbox-drain` and on everywhere else.
- Four cron jobs are scheduled and active: generate routine work (06:15), plan messages (06:30),
  drain the outbox (every 15 min), sweep tombstones (Sundays 04:00).
- `pg_net` is enabled and `functions_base_url` is in Vault.

Nothing sends, drafts or charges until the six secrets above exist.

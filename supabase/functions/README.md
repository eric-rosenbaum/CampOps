# Edge Functions

Deno functions running on Supabase. Each directory is one function; `index.ts` is its entry point.

Three things are true of all of them and worth stating once: they answer `OPTIONS` with CORS
headers, they return JSON with a human-readable `error` string rather than a status code alone,
and they never put a secret, a Stripe key, an internal id the caller did not already have, or a
raw provider error into a response body — those go to `console.error` and stay in the logs.

## The functions

| Function | What it does | Secrets it needs | Who may call it |
|---|---|---|---|
| `analyze-test-strip` | Reads a photo of a pool/lake chemical test strip and returns per-pad values with a confidence score. | `ANTHROPIC_API_KEY` | Authenticated (platform JWT gate) |
| `draft-work-order` | Turns a photo, a voice transcript, or both into a **draft** work order — title, description, trade, priority, matched location/assignee ids, and open questions. Files nothing. | `ANTHROPIC_API_KEY` | Authenticated — checked in-function |
| `retreat-intake` | Turns pasted phone notes or an email thread into a structured retreat inquiry, with the verbatim source sentence behind every field, the questions the notes do not answer, and a reply draft. Writes nothing. | `ANTHROPIC_API_KEY` | Authenticated — checked in-function |
| `send-email` | Sends one transactional email (retreat reminders, invoices) via Resend. | `RESEND_API_KEY`, `RETREAT_FROM_EMAIL` | Authenticated — checked in-function |
| `outbox-drain` | Claims a batch from the notification outbox, sends each merged email via Resend, and reports each result back. Runs on a schedule. | `RESEND_API_KEY`, `RETREAT_FROM_EMAIL`, `CRON_SECRET` | Service role + `x-cron-secret` header |
| `push-send` | Claims the push queue and delivers each notification to APNs over HTTP/2, signing a provider token with the team's .p8 key. Retires tokens Apple rejects. Pinged by a trigger the moment work is assigned or a comment lands, and swept every minute. | `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_ENV`, `CRON_SECRET` | Service role + `x-cron-secret` header |
| `stripe-connect` | Stripe Connect (Standard) for a camp: `onboard` (create account + Account Link), `status` (refresh cached flags), `payment_link` (Checkout Session on the connected account for an invoice's outstanding balance). | `STRIPE_SECRET_KEY` | Authenticated **camp admin** — verified against `is_camp_admin` |
| `stripe-webhook` | Verifies Stripe's signature and records `checkout.session.completed` / `async_payment_succeeded` via `record_stripe_payment`. | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **No auth** — the signature is the auth |
| `portal-access-code` | Emails a one-time code that unlocks the private half of a guest portal (roster, housing, invoices, agreement). | `RESEND_API_KEY`, `RETREAT_FROM_EMAIL` | Anonymous — gated by the retreat's portal token |
| `portal-signing-code` | Emails a one-time code that authorises signing a retreat agreement. A forwarded link may read a contract; it may not bind the group to one. | `RESEND_API_KEY`, `RETREAT_FROM_EMAIL` | Anonymous — gated by the retreat's portal token |
| `portal-document` | Returns a short-lived signed URL for one document belonging to a retreat, plus a SHA-256 of the bytes as served. | — (service role) | Anonymous — gated by the retreat's portal token |
| `portal-upload-coi` | Accepts a certificate-of-insurance upload from the guest portal into the private bucket and records the document row. | — (service role) | Anonymous — gated by the retreat's portal token |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.
They are **not** set by hand.

### "Authenticated — checked in-function"

The platform's JWT gate is on by default, but the functions that spend money (Anthropic credit,
Resend sends) also call `auth.getUser()` themselves. Two gates, because the expensive ones should
not depend on a deploy flag staying right.

### "Anonymous"

The `portal-*` functions and `stripe-webhook`, `outbox-drain` and `push-send` take no user JWT
and must be deployed with `--no-verify-jwt`. Each carries its own credential instead: a portal token, a Stripe
signature, a shared cron secret.

## Secrets to configure

Set these in the Supabase dashboard (Project Settings → Edge Functions → Secrets), or with
`supabase secrets set NAME=value`:

| Secret | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `analyze-test-strip`, `draft-work-order`, `retreat-intake` | |
| `RESEND_API_KEY` | `send-email`, `outbox-drain`, `portal-access-code`, `portal-signing-code` | |
| `RETREAT_FROM_EMAIL` | the same four | Must be within the verified sending domain `campcommand.app`; anything else falls back to `retreats@campcommand.app`. |
| `STRIPE_SECRET_KEY` | `stripe-connect`, `stripe-webhook` | **Our platform** key. A connected camp's key is never held. |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | The `whsec_…` from the endpoint you registered. Register it as a **Connect** endpoint: charges are direct charges on connected accounts. |
| `CRON_SECRET` | `outbox-drain`, `push-send` | Any long random string. Sent by the scheduler as the `x-cron-secret` header. Postgres reads its own copy out of Vault (`cron_secret`), so the two must match. |
| `APNS_KEY_ID` | `push-send` | The 10-character id of the APNs auth key (Apple Developer → Keys). |
| `APNS_TEAM_ID` | `push-send` | The 10-character Apple Developer team id. |
| `APNS_PRIVATE_KEY` | `push-send` | The contents of the `.p8` file, PEM and all. Escaped newlines (`\n`) and a bare base64 body are both accepted. |
| `APNS_BUNDLE_ID` | `push-send` | The app's bundle id, sent as `apns-topic`. `com.ericrosenbaum.CampOps`. |
| `APNS_ENV` | `push-send` | `production` or `sandbox`. Only the fallback: a device row that names its own environment wins, because a debug build's token is valid against sandbox alone. |

A function whose secret is missing returns **503** with a sentence naming what is missing, rather
than failing somewhere less obvious.

## Schema these depend on

The AI functions are stateless. The rest expect the database to provide:

- `camps.stripe_account_id`, `camps.stripe_charges_enabled`, `camps.stripe_connected_at`
- `retreat_invoices.stripe_session_id`, `retreat_invoices.payment_link_url`, and an
  `amount_paid` column if partial payments are in play (absent, the whole `amount` is treated as
  outstanding)
- `record_stripe_payment(p_event_id, p_session_id, p_amount, p_currency, p_raw)` — idempotent on
  the Stripe **event id**, because Stripe retries a failed delivery for up to three days with the
  same id
- `claim_outbox_batch(p_limit)` → `{ batch_id, to_email, to_name, reply_to, subject, body_html, message_ids }`,
  merging a recipient's pending messages and honouring camp-local quiet hours
- `mark_outbox_sent(p_ids, p_ok, p_error)`
- `claim_push_batch(p_limit)` → `{ id, title, body, data, devices }`, where `devices` is the
  recipient's registered tokens; a recipient with none is settled as `skipped` before it returns
- `mark_push_sent(p_id, p_delivered, p_error)`
- `device_tokens` — deleted directly by `push-send` when Apple answers `410` or `BadDeviceToken`
- `is_camp_admin(p_camp_id)` (already present)

## Deploying

```sh
# One function
supabase functions deploy draft-work-order

# The ones that must not require a JWT
supabase functions deploy stripe-webhook     --no-verify-jwt
supabase functions deploy outbox-drain       --no-verify-jwt
supabase functions deploy push-send          --no-verify-jwt
supabase functions deploy portal-access-code --no-verify-jwt
supabase functions deploy portal-signing-code --no-verify-jwt
supabase functions deploy portal-document    --no-verify-jwt
supabase functions deploy portal-upload-coi  --no-verify-jwt
```

There is no `config.toml` in this project, so `--no-verify-jwt` is per-deploy and easy to forget.
A portal function deployed without it returns 401 to every guest.

Stripe's webhook endpoint URL is
`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`.

`outbox-drain` is scheduled (pg_cron / an external scheduler) as a POST carrying the
`x-cron-secret` header; an empty body is fine, `{"limit": 50}` overrides the batch size.

`push-send` is called the same way, by `drain_push()` — from the triggers on `issues` and
`issue_comments` the moment a notification is queued, and from the `campcommand-drain-push`
cron job every minute as a safety net. It answers **503** naming every APNs variable it is
missing, and it checks them **before** claiming, so an unconfigured project leaves the queue
intact rather than stranding it.

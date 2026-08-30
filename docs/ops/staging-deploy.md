# Staging environment

Staging is the Supabase project `campcommand-staging` (`mvxnpofopbmljzpgnycg`), separate from
production (`fbfxeupqguzxrbyqojyg`). Local work points at it with:

```
npm run dev -- --mode staging
```

A plain `npm run dev` reads `.env.local`, which points at **production**. The env badge in the
bottom-left of the running app shows which project is live — check it before trusting a test.

## Accounts

Staging data is seeded/synthetic: two Pine Ridge camps, no real campers, no health records. Keep
it that way. Cloning production data into staging changes the risk calculus of everything below
(see "Search indexing" and "Deployment protection").

Platform admins (founder super-admins) as of 2026-08-30: `ericrosenbaum77@gmail.com`,
`eric@campcommand.app`, `prakash@campcommand.app`.

### Adding a founder admin

The "Add super-admin" field in `/admin` does **not** send an invite email and cannot create an
account. `add_platform_admin()` looks the person up in `auth.users` and fails with *"They must
sign in once first"* if they're absent. So the order is: the account must exist, then you promote
it.

The seed in migration `20260729100000` grants platform-admin to a hardcoded email list, but it
only matches accounts that already exist **when the migration runs**. In a fresh environment it
matches nothing, which is how staging ended up with an empty `platform_admins` and an unreachable
`/admin`. Check `select * from platform_admins` after standing up any new environment.

Until the email config below is fixed, the reliable way to add someone to staging is to create
the `auth.users` row directly (with a matching `auth.identities` row, provider `email`) and insert
into `platform_admins`. Do not do this in production — there, use the invite flow.

### Passwords

Self-service only: everyone changes their own, nobody can change anyone else's. The card is in
Security & privacy for camp users, and on `/admin` for founders (who often hold no camp
membership, making `/settings/security` unreachable — it lives inside `ProtectedRoute`, which
requires a `currentCamp`).

Whether an account has a password is `has_usable_password()`, not a null check: OTP/magic-link
signups carry `''` and seeded fixtures carry junk (staging's `*.test.local` rows hold a 1-char
string). Only a bcrypt hash (`^\$2`) counts.

## Supabase Auth configuration (dashboard-only)

These are **not** in this repo and must be set per project in the Supabase dashboard. Staging was
still on defaults as of 2026-08-30, which is why sign-in codes emailed links pointing at
localhost.

1. **Authentication → URL Configuration → Site URL** — the staging domain, not localhost.
   Supabase builds email links from this whenever a call doesn't pass its own redirect.
2. **Authentication → URL Configuration → Redirect URLs** — add the staging origin, plus
   `/reset-password`, `/invite/*`, and `http://localhost:5177/**` for local dev.
3. **Authentication → Email Templates → Magic Link** — must contain `{{ .Token }}`. The login UI
   asks for a 6-digit code (`verifyOtp({ type: 'email' })`); the stock template only has
   `{{ .ConfirmationURL }}`, so a user gets a link when the UI wants a code.

Compare staging against production for all three — production may have the same gaps, unnoticed
because essentially every real user signs in with a password.

## Transactional email

Invites and retreat/invoice mail go through the `send-email` edge function (Resend), which needs
the `RESEND_API_KEY` secret. It's deployed on both projects; if the secret is missing it returns
`503 "Email is not configured yet"` rather than failing quietly. Note that only the camp-invite
paths send mail — `Team.tsx`, `BulkInviteForm.tsx`, and `adminStore.provisionCustomer`. Promoting
a platform admin never does.

## Vercel

Staging deploys from the `staging` branch. Because the Production Branch is `main`, those are
*Preview* deployments, and Vercel Authentication (Settings → Deployment Protection) gates them
behind Vercel SSO — only team members get in, which reads as "the app won't let anyone log in".

Two options: disable Vercel Authentication for previews (quick, but unprotects every preview on
the project), or give staging its own Vercel project with `staging` as its Production Branch
(recommended — unprotected by default, stable domain, its own env vars).

Either way check **Settings → Environment Variables**: a Preview deployment reads Vercel's
*Preview* scope, not `.env.staging`, so `VITE_SUPABASE_URL` must be set there or staging will talk
to the production database.

Turning the wall off does not change database exposure — `*.supabase.co` is a separate host that
is already public, and the anon key ships in the JS bundle. What it does change is that staging
becomes crawlable, which is handled by the build emitting a disallow-all `robots.txt` for every
non-production mode (`vite.config.ts`).

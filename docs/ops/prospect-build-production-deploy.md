# Deploying the prospect build to production

Food requests, Town Trips, Receipts, the Demo Guide, and the fixes that came with them (the open
outbox, clone_camp, the phone sidebar, the false "changes didn't save" banner). Everything here
has run on staging (`mvxnpofopbmljzpgnycg`); production (`fbfxeupqguzxrbyqojyg`) has none of it.

**Nothing in this document has been run against production.** Do it in order, and stop at the
first thing that doesn't match.

## 0. Before you start

- [ ] The branch is merged to `staging` and every gate is green on it:
  `npx tsc -b`, `npm run lint` (≤ 30/15), `npm run build`, `npm run test:unit`,
  `bash scripts/run-sql-tests.sh` (compliance is a known pre-existing failure),
  `npm run test:e2e`.
- [ ] Production's ledger ends at `20260916202131` (check below). If anything newer is there,
  someone deployed in between: stop and diff.
- [ ] **Anthropic credit.** Staging's key ran out during this build and receipt reading returned
  503. Confirm the production project's `ANTHROPIC_API_KEY` belongs to an account with credit, or
  the demo's headline receipts step fails in front of the prospect.
- [ ] **Anonymous sign-ins are ON in production** (Auth → Providers). `/try/` links depend on it.
  (Pinecrest's link working suggests it is, but check.)

```bash
# From the MAIN checkout, which is linked to production:
cat supabase/.temp/project-ref            # must print fbfxeupqguzxrbyqojyg
supabase db query --linked --agent=no \
  "select version, name from supabase_migrations.schema_migrations order by version desc limit 3"
```

## 1. Migrations, in file order

```bash
git diff --name-only 6061949..staging -- supabase/migrations | sort
```

Apply each, one at a time, with the guarded script (it refuses unless the checkout is linked to
production, `CONFIRM_PRODUCTION` equals the version, and the version isn't already recorded):

```bash
CONFIRM_PRODUCTION=20260916204306 scripts/apply-production-migration.sh \
  supabase/migrations/20260916204306_the_outbox_is_not_a_public_endpoint.sql
# …repeat for every file, in order
```

Do **not** use `supabase db push` or the MCP `apply_migration` (it stamps its own version).

After the last one:

- [ ] Nothing mail-related is callable by a signed-out visitor:
  ```sql
  select proname from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('queue_message','claim_outbox_batch','cancel_message','mark_outbox_sent',
                     'drain_outbox','plan_all_messages','user_email','camp_admin_email')
     and has_function_privilege('anon', oid, 'execute');   -- expect 0 rows
  ```
- [ ] `select count(*) from clone_camp_coverage_gaps();` → 0
- [ ] `select plan_all_messages();` inside `begin … rollback` returns a number, no error.
- [ ] Function bodies match the files. `scripts/check-function-drift.py` reads staging; run the
  same comparison against production by temporarily pointing `staging-sql.sh`'s ref check at
  production **in a scratch copy**, or compare `md5(prosrc)` for the new functions between the
  two projects with the query in CLAUDE.md trap 7.

## 2. Edge function

```bash
supabase functions deploy read-receipt --project-ref fbfxeupqguzxrbyqojyg   # JWT verification stays ON
```

- [ ] An unauthenticated call returns 401; a signed-in call with a sample receipt returns fields.

## 3. Frontend

- [ ] Merge `staging` → `main` (PR). The deploy picks up the new routes, `public/demo/receipts/`
  and the sidebar fix.
- [ ] On `app.campcommand.app`, a phone-width window shows the dashboard full-width (the sidebar
  bug), and a staff login shows no "changes didn't save" banner.

## 4. The prospect's demo

In `/admin` → **Spin up demo**:

- Name: the camp's name + "(demo)". Source: the curated seed (Camp Pinecrest or the marked seed).
- Who it's for: the prospect's first name.
- Spotlights: Food requests, Town trips, Company-card receipts. Sample data on. "Show only the
  modules these spotlights use" on.

Then **Guide** on that row: write the intro and each "What you told us" in their own words, your
name and email. Save.

## 5. Walk it on production before sending

- [ ] Incognito laptop: open the `/try/` link → lands on the guide, headline and intro correct.
- [ ] Every spotlight's Open buttons land on a screen with the sample week in it.
- [ ] **Your phone:** scan the Cooking Club QR from the guide, send a request with your real
  email. It appears in the kitchen inbox on the laptop without a refresh, the guide step ticks,
  and the confirmation email arrives (real address, not example.com).
- [ ] Snap a real receipt on the phone: fields come back read (this is where credit matters).
- [ ] "Reset the sample data" on the guide, then check the reconciliation shows one missing
  receipt and one duplicate again.
- [ ] Only then send the link.

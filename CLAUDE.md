# CampCommand — orientation for agents

Multi-tenant SaaS for summer camps. A React web app (~90k lines of TS/TSX), a SwiftUI iOS app,
and a Supabase backend (Postgres + RLS + SECURITY DEFINER RPCs + Edge Functions + pg_cron).
Sales-led: accounts are provisioned by the founder, there is no self-serve signup.

Read this before touching anything. The traps section below is not general advice — every item
in it has already cost real debugging time in this repo.

---

## 1. Commands

```bash
npm run dev              # vite, localhost:5173
npx tsc -b               # THE typecheck. See trap #1.
npm run lint             # eslint. Baseline: 30 problems / 15 errors. Any increase is yours.
npm run build            # tsc -b && vite build
npm run test:campground  # SQL suite: campground + rentals (36 assertions)
npm run test:compliance  # SQL suite: the compliance engine
npm run test:unit        # Vitest: pure logic in src/**/__tests__ (node, TZ America/Vancouver)
npm run test:sql         # every supabase/tests/*_test.sql against STAGING, no password needed
npm run test:e2e         # Playwright journeys against staging, laptop + phone widths
```

**Staging without a database password.** A checkout linked to staging (`supabase link
--project-ref mvxnpofopbmljzpgnycg`) can run SQL through the Management API:

```bash
scripts/staging-sql.sh -c "select …"          # or a .sql file; refuses unless linked to staging
scripts/apply-staging-migration.sh supabase/migrations/<version>_<name>.sql
                                               # one transaction, ledger version = file version
python3 scripts/check-function-drift.py <migration files>   # trap 7, automated
bash scripts/run-sql-tests.sh food_requests    # one suite by name
```

`supabase/.temp/` is tracked in git and the main checkout is linked to **production**; in a
worktree, `git update-index --skip-worktree supabase/.temp/*` before relinking, and never commit
it. SQL suites should `set local role authenticated` with JWT claims so table RLS is exercised —
setting claims alone runs as postgres and tests only function gates.

**Playwright** uses the staging camp "Prospect QA" and `@example.com` logins created by
`e2e/setup-qa-camp.sh` (password in the gitignored `.env.e2e`). Journey screenshots land in
`e2e-screens/` (Playwright wipes `test-results/` every run) — read them, don't just generate them.
`E2E_PORT` lets parallel worktrees each run their own dev server.

The older runner still works with a database URL:

```bash
STAGING_DB_URL='postgresql://postgres.<ref>:<pw>@aws-0-us-east-1.pooler.supabase.com:5432/postgres' \
  npm run test:campground
```

Use the **pooler** host, not `db.<ref>.supabase.co` — the direct host is IPv6-only and hangs
until TCP timeout rather than failing fast, which reads like a broken test run.

## 2. Environments

| | Supabase project | |
|---|---|---|
| staging | `campcommand-staging` — `mvxnpofopbmljzpgnycg` | where development and testing happen |
| production | `fbfxeupqguzxrbyqojyg` | |

`npm run dev -- --mode staging` points at staging; a plain `npm run dev` reads `.env.local`.
**The env badge in the bottom-left of the running app names the live project — read it before
trusting any test.** `docs/ops/staging-deploy.md` has the rest.

The iOS app ships pointed at **production** (`ios/CampOps/CampOps/Info.plist`). A debug build can
be pointed at staging instead — launch it with the `-staging` argument (or `CAMPOPS_ENV=staging`)
and `SupabaseService` swaps the host. Compiled out of release entirely, so a shipped build cannot
be talked into it. Test iOS changes there, not in a customer's camp.

Hosts are resolved in `src/lib/env.ts`, and every default there is the production value, so a
missing env var behaves as production rather than as something subtly wrong. `localhost` and
preview deploys are treated as a single domain.

Branches: work on `staging`, PR to `main`.

## 3. Shape of the code

```
src/
  App.tsx            routes + CampDataLoader (loads/subscribes every module, gates on hydration)
  pages/             one file per module page; portal/ + report/ + qr/ are PUBLIC (no auth)
  components/<mod>/  the module's UI. retreats/ is the biggest (48 files), then campground/
  components/rooming/  shared by the ops housing board AND the guest portal — see §5
  store/             zustand slices, one per module
  lib/*Db.ts         all Supabase access for a module (campgroundDb, retreatsDb, locationsDb…)
  lib/supabase.ts    the client + the fetch wrapper every write is counted through
  lib/syncGuard.ts   read its header comment before touching realtime or reload logic
  lib/auth.ts        role + staff-group permission gates
supabase/
  migrations/        253 files. Naming is a sentence, not a ticket number.
  functions/         12 edge functions (email, portal access, stripe, push, AI vision)
  tests/             pgTAP-ish suites driven by scripts/runsql.js
ios/CampOps/         SwiftUI. Campground rebuilt to match the web, 2026-09-17
  Views/Scan/        what a scanned sticker opens: one place, its open work, log something here
  Services/Offline/  MutationQueue + SyncEngine + PhotoQueue. Reads cache-first, writes queue
  ViewModels/CampgroundStore.swift   crews, vendors, routines, templates, routing, read state
docs/                start at docs/README.md
```

**Adding a Swift file needs `scripts/ios-add-files.py <path…>`.** Only `ios/CampOps/CampOps/`
is a synchronized folder and it holds no code, so every source file is registered by hand in four
places in `project.pbxproj`. A file that is not registered compiles nowhere and fails at runtime.

### Modules

Campground (work orders/issues/routines), Compliance, Assets & Vehicles, Building Systems,
Commissary (kitchen), Pool, Safety, Retreats (group rentals). Each is gated per camp by
`camps.modules` and rendered behind `<Gate of={[...domains]}>`, which waits for that module's
data to hydrate.

### The two products and the seam

The product is really two things joined at one seam: **Campground** (the crew's work) and
**Retreats** (external group rentals). The seam is that *a group's request becomes the crew's
work order* — locking housing generates work orders, a retreat's tasks land with a named crew.
Don't sever it, and don't duplicate one side's data into the other.

### Locations are one tree

There is ONE nestable, categorized `locations` tree per camp. It replaced three separate lists
(camp locations, buildings/rooms, retreat spaces) and now feeds every module. `is_dorm`,
`retreat_available`, `program_space`, `service_status`, `cabin_type_id` and `notes` all live on
it. `locations.notes` is **guest-facing** — the retreat portal shows it to groups. Camp Info ›
Locations is the only editor; anything else that looks like a location editor should be
read-only.

## 4. Auth model

- Roles: `admin` / `staff` / `viewer`, in `camp_members`.
- `staff_groups` are named crews. A person can be in **many**. Module access and task
  visibility are gated per crew, and gates fold across every crew a person is in — **most
  permissive wins**:
  ```ts
  role !== 'staff' || myStaffGroups.length === 0 || myStaffGroups.some((g) => g.issuesSeeUnassigned)
  ```
- "Trade" and "Crew" are the same thing. The UI always says **Crew**.
- Platform admins (founders) get `/admin` and can open any camp. A camp opened that way is
  remembered in `sessionStorage.campcommand_admin_camp_id`.
- Password changes are **self-service only**, everywhere, deliberately. Do not add an
  admin-resets-someone-else's-password flow.

## 5. The guest portal

`/portal/:token` is public and unauthenticated. It reads everything through one anon RPC,
`get_portal_data_v2`, which wraps `get_portal_data_v2_inner`, which wraps `get_portal_data`.
The private half (roster, rooming, invoices, the agreement) additionally needs a session:
a code is emailed to the coordinator, and the session lives in `sessionStorage`, not
`localStorage` — a borrowed device must not stay unlocked after the tab closes.

When you add a field the portal shows, it must be added **inside** the payload object the
client reads (`data.retreat`, `data.spaces`, …), not at the payload root. That mistake has
shipped before.

`src/components/rooming/BuildingAccordion.tsx` is presentational and shared between the ops
housing tab and the guest portal; each side maps its own data into the same view models.

## 6. Traps

These are all real. Each one has bitten.

**1. `tsc --noEmit` checks nothing here.** It is a solution-style tsconfig, so `--noEmit`
validates zero files and exits 0 on code that crashes at runtime. Always `npx tsc -b`.

**2. Zustand v5 + React 19: a selector returning a fresh array or object every render
infinite-loops** and white-screens the app. Subscribe to the raw slice, derive with `useMemo`.

**3. `YYYY-MM-DD` is a camp-local calendar day, never an instant.** Use `toDateStr` /
`todayStr` / `parseDateStr` from `lib/utils`. Never `toISOString().slice(0,10)`. This is why
times live in separate `time` columns rather than in a `timestamptz`.

**4. A gated function called from a trigger or cron will silently do nothing.** Functions
reachable from the browser carry an `is_camp_member()` gate; the cron/trigger path must call
the `*_internal` variant, which has no gate. Getting this backwards produces a job that runs
every night and writes nothing.

**5. Adding a parameter to a Postgres function creates a NEW function.** The old overload
stays, and callers keep hitting it. Drop the old one by its full signature in the same
migration.

**6. Never retype a function body from memory.** Read `pg_get_functiondef(oid)` and edit
*that*. Retyping has repeatedly dropped clauses (`returning id into v_id`, whole payload keys,
parameter defaults) in ways that typecheck and deploy fine.

**7. Verify a migration actually matches its file.** The MCP `apply_migration` tool assigns its
own timestamp version, so the file in `supabase/migrations/` must be renamed to match
`supabase_migrations.schema_migrations`. Then confirm the bodies are identical:
```sql
select md5(regexp_replace(prosrc, '\s+', ' ', 'g')) from pg_proc … ;
```
compared against the same normalisation of the `$fn$ … $fn$` body in the file.

**8. Some old migrations DESCRIBE hand-applied SQL instead of containing it.** The ledger looks
clean while environments diverge. Diff `pg_proc` signatures, not the ledger.

**9. An "empty" list for a staff member is usually the staff-group filter, not RLS.** Simulate
their JWT in SQL before you go debugging data loading.

**10. Tailwind width utilities collide by stylesheet order, not attribute order.** A `w-full`
inside a shared class string beats an appended `flex-1` or `w-28`. Split the shared string into
a width-less `fieldClass` and a `w-full` `inputClass`.

**11. React ignores synthetic `.blur()` / `focusout`.** To drive a controlled input from a
script, use the native value setter plus an `input` event.

**12. `text-decoration` is inherited and a child cannot remove it.** Strike the word, not the
line.

**13. Revoking EXECUTE from `anon` does not close a function.** Supabase grants every new
function to PUBLIC (`=X/postgres` in `proacl`) as well as to anon/authenticated. Write
`revoke execute on function … from public, anon, authenticated` and then grant exactly what is
needed. The outbox was an open email relay for this reason until 2026-09-16.

**14. Module switches read absent as ON.** A module added for particular camps must declare
`defaultOn: false` in `src/lib/modules.ts`, or it appears in every camp's sidebar on deploy.

**15. `insert … on conflict do update` is not an upsert for a PARTIAL payload.** Postgres builds
the proposed insert row and checks its NOT NULL constraints *before* it looks for the conflict, so
a payload carrying only the columns that changed is rejected on `title` and never reaches the
`do update`. This is what `sync_push` did, which meant every status change, assignment and
resolution queued by the phone failed with "null value in column title" while the activity row
beside it (a complete payload) succeeded — a timeline that said Resolved on work orders that were
still open. A change to a row that exists is an `update`.

**16. A routing default outlives the person in it.** `work_routing.default_assignee_id` can name
somebody who has left; `route_work()` only honours it while they are an active member, and any
client prefilling from that table must apply the same test. Prospect QA's housekeeping route still
names a departed staff member.

**17. A universal link is matched against the host that was scanned, and redirects are never
followed.** Printed stickers carry the marketing host; associating only `app.campcommand.app`
meant every sticker ever printed opened Safari. Apple also will not fetch
`/.well-known/apple-app-site-association` through a redirect, which the apex still answers with —
so `STICKER_HOST` (src/lib/env.ts) prints the `www` host, which serves the file directly.

**18. A translated label must never reach a stored sentence.** `STATUS_LABELS`, `TRADE_LABELS`,
`CADENCE_LABELS` and friends are localized getters now (`src/i18n/index.ts`), so interpolating one
into `issue_activity.action`, a comment or any other row writes Spanish into data that SQL reads
with `ilike '%resolved%'` and that nobody else can translate. Stored sentences use English words
(`activityStatusWord`) and people's own names; translation happens at display
(`translateActivity`, `TranslatedText`). Also: don't import `src/i18n` from a `src/lib` file on
Playwright's import chain (e2e → foodRequests → … → utils) — Node refuses the JSON; use the
`i18next` singleton there. Multilingual plan and contracts: `docs/plans/multilingual.md`.

## 7. Working habits this project expects

- **Verify the fix, not the diff.** Check where a block actually sits in the rendered DOM, not
  only that its own numbers changed. Render positional/visual output (PDFs especially) to PNG
  and *look* — text being present is not text being placed.
- **Migration names are sentences** describing what changed for the user
  (`the_agreement_is_a_template_the_camp_writes_once`), and commit messages explain the
  behaviour that was wrong. Match the surrounding voice.
- **Comments explain why, in the past tense of the bug they prevent.** The codebase is full of
  these; keep writing them.
- **Don't write demo or marketing data into a camp that isn't the designated demo camp.**
  Writing to the wrong camp has destroyed real rows here before.
- Do not touch the Compliance or Commissary modules unless asked — they are specced separately
  and have their own test suites.

## 8. Where to read more

| | |
|---|---|
| `docs/README.md` | index of everything below |
| `docs/PRODUCT_OVERVIEW.md` | what the product is, module by module |
| `docs/production-restructure-spec.md` | account types, demo links, invite-only signup |
| `docs/founder-runbook.md` | provisioning and day-to-day ops |
| `docs/ops/` | migration ledger repair, deploy notes |
| `docs/compliance/` | the NY compliance engine, its obligation map and sources |
| `docs/ops/staging-deploy.md` | which project you are actually pointed at |

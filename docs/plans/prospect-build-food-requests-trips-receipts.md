# Build plan — Food Requests, Town Trips, Receipts, and the Demo Guide

Written 2026-09-16. Not started. This is the document to build against; update the status
column as phases land.

## Context

We have no customers yet. The consistent objection has been weak pain and heavy implementation.
An operations lead at a Canadian camp (Teddy) liked the Kitchen Manager and described three
pains in his own words. The goal is a no-login demo he opens and thinks *"they built what I
said, and it works"* — then forwards to his directors.

What gets built:

| | Scope | Who gets it |
|---|---|---|
| **A. Food requests** | Programs ask the kitchen for food; the kitchen approves, sets it aside, orders for it, and reminds people to pick it up | Every camp — part of Kitchen Manager |
| **B. Town Trips** | A week board of trips into town: seats, return rides, and a shared errand list | New opt-in module `trips` |
| **C. Receipts** | Company-card receipts: photo → AI read → coded → matched to the card statement → GST/HST summary → QuickBooks CSV | New opt-in module `receipts` |
| **D. Demo Guide** | A per-prospect landing page for demo camps: what you told us, what we built, try it in two minutes. Plus seed data with relative dates | Demo (`trial`) camps |

Decisions already made with Eric:

- Food requests come from **both** signed-in staff (in the app) and a **no-login link per program**.
- **Email now, text-ready.** Real emails go through the outbox. Every message also stores its
  SMS copy, and the demo shows it as "what the text would say". No Twilio in this build.
- Receipts reconcile against a **statement CSV** and export a **QuickBooks-ready CSV**. No bank
  feed and no QuickBooks API.
- The Demo Guide is **editable per demo in `/admin`**, with default copy for every spotlight.
- It should be real and usable, seeded with dummy data. Test the user experience properly.

Honest size: this is **about 7–9 focused days in sequence, or 4–5 with parallel worktrees**
after Phase 0. It is not a couple of hours. Phase 2 (food requests working end to end) is a
milestone that can be shown on its own if timing gets tight.

---

## Facts found during research that shape the plan

1. **Another agent has ~40 uncommitted files** on `staging`: the new two-switch module gating
   (`src/lib/modules.ts`, migration `20260916194052_…`), `App.tsx`, `Sidebar.tsx`,
   `AdminConsole.tsx`, all three home pages, and retreat request threads. This build touches
   most of those files. **Phase 0 waits for that work to be committed.**
2. **In module gating, a missing key means ON** (`readSwitch` in `src/lib/modules.ts`). Adding
   `trips` and `receipts` naively would switch them on for every camp. They need opt-in
   semantics (Phase 0).
3. **The outbox functions are executable by `anon` in production** (verified with
   `has_function_privilege`): `queue_message`, `claim_outbox_batch`, `cancel_message`,
   `mark_outbox_sent`, `drain_outbox`, `plan_all_messages`, all `SECURITY DEFINER`. That is an
   open email relay using our domain, and it leaks other camps' queued mail. This build adds
   reminders on top of the outbox, so the fix comes first. (Check first whether the other
   agent's uncommitted `…_the_new_functions_are_not_a_public_endpoint.sql` already covers it.)
4. **`clone_camp()` has a hardcoded table list** (the columns are dynamic). On staging,
   `clone_camp_coverage_gaps()` reports **44 camp tables not cloned**, including
   `staff_group_members`, `camp_sessions`, every `work_*` table, `retreat_contacts`,
   `retreat_guests` and `issue_comments`. It also doesn't copy `platform_modules`. A cloned demo
   today is missing crews, work orders and newer retreat data.
5. **Where the demo camps are:** staging has no seed, trial or demo camp; production has Camp
   Pinecrest, Camp Green Lane (Demo), and seeds `Demo Camp` / `Ramah Canada Demo`. So we build
   and test on staging, then provision the prospect's demo on **production**.
6. **Commissary demand has one seam:** `consumptionByItemDate()`
   (`src/store/commissaryStore.ts:1282`) feeds the Inventory projection, `reconciledDraftOrders`
   and `orderMath`. Its retreats branch returns early (`:1305`), so a new demand source must be
   added **before the mode branch** or it disappears in retreats mode.
7. **Double-counting rule already in force:** the projection subtracts menu consumption from
   the last count forward, and nothing writes menu consumption into stock. Food requests follow
   the same rule: a pickup does **not** write an `inventory_adjustment`, and the next count
   reconciles.
8. **No kitchen-versus-other-staff permission exists.** `manageCommissary` is admin or staff, and
   crew module permissions were removed. Every staff member can write every commissary table. We
   separate these in the **UI** (a Food Requests page for requesters, a Requests tab for the
   kitchen) and enforce the state machine in RPCs. A real kitchen-only permission is out of
   scope; the plan flags it.
9. **Outbox quiet hours are 08:00–19:59 camp-local** (`claim_outbox_batch`), and the drain runs
   every 15 minutes. A "your food is ready" email can arrive up to 15 minutes late, and a 7am
   pickup reminder cannot go out that morning (see the rules in A).
10. **Tests:** only two SQL suites exist, with no frontend tests and no browser tests. The
    existing suite sets JWT claims but never `set local role authenticated`, so **table RLS is
    never exercised**. The new suites must do that.
11. **Other things found, not fixed in this plan:** `analyze-test-strip` doesn't check the user
    (anyone with the anon key can spend Anthropic credit); asset-sticker public reports always
    fail (`submit_public_report_v2` passes a null slug). Tracked separately.

---

## Phase 0 — Groundwork (≈0.5 day)

**0.1 Branch.** After the other agent's work is committed: create worktree
`../CampOps-prospect` on branch `feature/prospect-build` from `staging`, copy `.env.local` and
`.env.staging`, then `npm install`. Commit after every phase; an uncommitted build has been lost
here before.

**0.2 Opt-in modules.** In `src/lib/modules.ts`:
- Add `defaultOn: boolean` to `ModuleDef`. The existing 7 are `true`; `trips` and `receipts` are
  `false`.
- `readSwitch(obj, key)`: a missing key returns `def.defaultOn` for **`platform_modules`**. For
  `camps.modules` a missing key stays on, so once a module is sold the camp sees it.
- Add `{ key: 'trips', label: 'Town Trips', paths: ['/trips'] }` and
  `{ key: 'receipts', label: 'Receipts', paths: ['/receipts'] }`. Add aliases entries.
- Migration: check `admin_set_camp_modules` and the `guard_platform_modules` trigger accept the
  new keys (read `pg_get_functiondef`, per trap 6), and update the column comments.
- The `CampModulesPanel` in `AdminConsole.tsx` lists all keys, so opt-in modules appear as
  unticked.
- Vitest: a missing key is on for old modules and off for new ones, including aliases.

**0.3 Close the outbox hole.** Migration
`the_outbox_is_not_a_public_endpoint.sql`: `revoke execute … from public, anon` on every outbox
and planner function. Grant `authenticated` only where the UI calls them (re-plan, cancel), and
check the rest are only reached from cron or the service role. Assert with
`has_function_privilege` in SQL tests. Apply to staging, then production (Phase 6).

**0.4 Outbox extension points** (done once so modules A–C don't conflict):
- `scheduled_messages.body_text text`: the SMS-length copy (≤ 320 characters), shown as the
  text preview.
- `recipient_kind` check gains `'requester'`, `'rider'`, `'card_holder'`, `'kitchen'`.
- **Demo-address suppression:** `claim_outbox_batch` cancels rows whose address ends in
  `@example.com` / `@example.org` (`suppressed_reason = 'demo_address'`). Seed data only uses
  those domains, so dummy people never cost sender reputation, and a visitor who types their own
  email gets real mail.
- `plan_all_messages()` calls three new no-op stubs: `plan_food_request_messages_internal()`,
  `plan_trip_messages_internal()`, `plan_receipt_messages_internal()`. Each module replaces only
  its own stub. The internal variants have no member gate (trap 4).
- `queue_message` stays the only writer and gains `p_body_text` with a default. **Drop the old
  signature in the same migration** (trap 5).

**0.5 Test harness.**
- Vitest for pure logic (`npm run test:unit`). Business logic goes in pure `src/lib/*` files so
  it can be tested.
- Playwright (`npm run test:e2e`), run against `npm run dev -- --mode staging`, at two viewports
  (1280×800 and 390×844), taking a screenshot at every journey step into
  `test-results/journeys/`.
- `scripts/runsql.js` suites for each module (below). Add `npm run test:sql` to run them all.
- A staging QA camp: create **"Prospect QA"** (`account_type='trial'`, `trial_ends_at=null`) on
  staging with `clone_camp` from Pine Ridge. All e2e tests and seeds run there, never in Pine
  Ridge Camp.

**0.6 Clone coverage.** Add every table this build creates to **both** lists in `clone_camp` and
`clone_camp_coverage_gaps`, and copy `platform_modules`. **Recommended in the same migration:**
also add the Campground and crew tables (`staff_group_members`, `camp_sessions`,
`service_vendors`, `work_routing`, `work_schedules`, `work_checklist_templates`,
`issue_comments`, `issue_checklist_items`, `retreat_contacts`, `retreat_guests`,
`retreat_proposals`, `retreat_space_requests`) so the prospect's demo shows crews and work
orders. Leave out on purpose: `scheduled_messages`, `push_*`, `device_tokens`,
`client_mutations`, `deleted_rows`, compliance tables (separate scope). Test: clone the QA camp,
and `clone_camp_coverage_gaps()` returns only the tables left out on purpose.

**Gate:** `npx tsc -b` clean, lint ≤ 30/15, build passes, the existing two SQL suites still pass.

---

## A. Food requests (Kitchen Manager, all camps)

### A.1 Data model — migration `programs_can_ask_the_kitchen_for_food`

**`food_programs`** — camp_id, name ("Cooking Club"), lead_name, lead_email, lead_phone, color,
`request_token` (`gen_qr_token()`, unique), active, sort_order.

**`food_requests`**
- camp_id, program_id (nullable, so a one-off requester works), requested_by (uuid nullable),
  requester_name, requester_email, requester_phone, notify_by (`'email'|'text'`), source
  (`'app'|'link'`).
- Pickup: pickup_date `date`, pickup_time `time`. Separate columns (trap 3).
- purpose, headcount.
- `status`: `submitted | approved | declined | ready | picked_up | missed | cancelled`.
- `notice_hours numeric` and `is_late bool`, computed once at submit in camp time zone: pickup
  camp-local time minus submit time, compared against the cutoff. Stored because the cutoff
  setting can change afterwards.
- `kitchen_note`, `changed_by_kitchen bool` (approved with edits), decided_by/at, ready_at,
  picked_up_at, `status_token` (the requester's status page), created/updated.

**`food_request_lines`** — request_id, camp_id, `item_id` nullable (a free-text line is allowed),
`label`, `qty_requested_base`, `qty_approved_base` nullable, `unit_label` snapshot, note,
`line_state` (`ok | changed | unavailable`).

**`food_request_settings`** (one row per camp) — `cutoff_hours` default 72, `kitchen_emails
text[]`, `pickup_location` text, `late_policy` (`'flag'` for now). A separate table **on
purpose**: adding a parameter to `update_camp` creates an overload (trap 5).

For every table: RLS select `is_camp_member`; **no direct writes from the client** (writes go
through RPCs); replica identity full; realtime publication; `updated_at` trigger; a delete line
in `delete_all_commissary_data`; added to the clone lists.

### A.2 RPCs — every state change goes through one

| RPC | Who | Does |
|---|---|---|
| `submit_food_request(camp, payload)` | any member | inserts request + lines, computes late, queues `request_received` + `kitchen_new_request` |
| `submit_food_request_public(token, payload)` | anon | token → program → camp; throttle 10/hour/IP (`food_request_throttle`, RLS on, no policies); clamps lengths; validates `item_id` belongs to the camp; returns `status_token` |
| `get_food_request_form(token)` | anon | program name, camp name/logo, cutoff hours, pickup location, **names and units of active inventory items only** (no quantities or prices), plus this program's upcoming requests (date, status only) |
| `get_food_request_status(status_token)` | anon | a thin timeline for one request |
| `cancel_food_request(id or status_token)` | requester / anon token | only from `submitted`/`approved` |
| `decide_food_request(id, decision, lines[], note)` | admin/staff | approve (with per-line quantity/link/unavailable) or decline; sets `changed_by_kitchen`; queues `request_decided`; plans `pickup_reminder` |
| `mark_food_request_ready(id)` / `mark_food_request_picked_up(id, by_name)` / `mark_food_request_missed(id)` | admin/staff | move status forward; queue/cancel messages |

State machine (anything else raises an error):
`submitted → approved | declined | cancelled`, `approved → ready | cancelled | missed`,
`ready → picked_up | missed`.

Every function: `revoke all from public`, then grant exactly `anon` or `authenticated`.

### A.3 Reminders — `plan_food_request_messages_internal()` + immediate queueing

| rule_key | To | When | Cancelled if |
|---|---|---|---|
| `request_received` | requester | now | — |
| `new_request:<email>` | each kitchen email | now (subject says **LATE** when late) | — |
| `request_decided` | requester | now; lists changed lines ("asked 5 lb, approved 3 lb") | — |
| `pickup_reminder` | requester | pickup day 08:00 camp-local; **the evening before at 18:00 if pickup is before 10:00** (quiet hours) | not approved/ready anymore |
| `ready_now` | requester | now (≤15 min drain lag, documented in the UI copy) | picked up / cancelled |
| `missed_pickup` | requester + kitchen | pickup time + 2h | picked up / cancelled |

Every row writes `body_text`, e.g. "Cooking Club: your food for Thu 2pm is ready at the kitchen
back door. — Kitchen". The nightly planner re-checks conditions and cancels (outbox pattern).
Immediate rows are queued inside the transition RPCs.

### A.4 Kitchen integration (the "wow" moment)

- **Demand:** in `consumptionByItemDate()`, **before the mode branch**, add requests with status
  `approved | ready` that have a linked `item_id`: `qty_approved_base ?? qty_requested_base` on
  `pickup_date`. `submitted` requests do **not** count toward demand; they show as "pending" in
  `orderMath` instead. `picked_up` counts (the food left the kitchen and nothing wrote it to
  stock, fact 7). `missed`, `declined` and `cancelled` don't count.
- Put the logic in pure `src/lib/foodRequests.ts`: `requestDemandByItemDate(requests, lines)`,
  `setAsideByItem(requests, lines, today)`, `noticeHours(...)`, `isLate(...)`. The store only
  calls it.
- **Inventory tab:** a "Set aside" indicator on each item with approved/ready lines from today
  on ("3 lb · Cooking Club Thu"). A tooltip lists the requests.
- **Ordering, "Show the math":** a new "Program requests" column and a plain-English line
  ("…including 6 lb for Cooking Club on Jul 18").
- **Data domain:** join the **`commissary-menu`** domain (it already feeds the demand map).
  Loader select + interface field + table names in the subscribe array + store setter + App.tsx
  apply. No new Gate or refetch wiring.

### A.5 Screens

1. **Kitchen Manager › Requests tab** (new, after Ordering; visible in both modes; badge = count
   of `submitted`).
   - **Inbox:** submitted requests, late ones on top, each a card with program, pickup, notice
     ("26h notice — late") and lines. Approve / Edit and approve / Decline, one decision modal
     with per-line quantity, an item picker to link free text, and a kitchen note.
   - **Pickups:** grouped by day (Today first). Approved → Ready → Picked up, one tap each; a
     "missed" action on past-due cards. A printable pull list per day.
   - **History:** filter by program.
   - **Programs** (inside Settings): list programs, copy the no-login link, show a QR code
     (add the `qrcode` npm package, or reuse however stickers render theirs), cutoff hours,
     kitchen notification emails, pickup location.
2. **`/food-requests`** (sidebar item "Food requests" in the Kitchen section, for every member
   when `commissary` is enabled): **My requests** with live status, plus **New request** (the
   same form component as the public link, signed-in flavor).
3. **`/food/:token`** (public, mobile-first): program header, a cutoff notice before the form
   ("Requests need 72 hours' notice — Thursday 2pm pickup is 26 hours away, so the kitchen may
   not be able to fill it"), item picker with typeahead plus free-text lines, pickup date/time,
   name/email/phone, notify-by. On submit → redirect to status.
4. **`/food/status/:token`** (public): a timeline (Submitted → Approved/changed → Ready → Picked
   up) with kitchen notes and a Cancel button. Refreshes on focus.

A shared form component: `src/components/foodRequests/RequestForm.tsx`.

**UX acceptance criteria**
- A requester who has never seen the app submits a 3-item request on a phone in **under 90
  seconds** with no instructions.
- A request submitted on the link appears in the kitchen Inbox **without a refresh** (realtime)
  within 3 seconds.
- A late request is visibly different before submit (requester) and after (kitchen), but never
  blocked.
- After approval, the Inventory tab and the order math change **on screen** with no other
  action.
- No state lets a request be picked up without first being approved.

### A.6 Tests

- **SQL `food_requests_test.sql`**, run as `set local role authenticated` plus claims (real RLS):
  - the whole state machine including illegal transitions;
  - late boundary at exactly 72h, with the camp in `America/Vancouver` against a UTC server;
  - public submit: valid token, wrong token, deactivated program, `item_id` from another camp,
    throttle on the 11th call;
  - anon can't read `food_requests` directly;
  - every rule queued and cancelled correctly on each transition, including the 07:00 pickup
    → previous 18:00 case;
  - `@example.com` rows suppressed at claim;
  - `has_function_privilege` for every new function.
- **Vitest:** `requestDemandByItemDate` (statuses, unlinked lines, approved vs requested
  quantity), `setAsideByItem`, `isLate` across DST, and `consumptionByItemDate` including
  requests in **both** session and retreats mode.
- **Playwright journeys J1–J2** (below).

---

## B. Town Trips (module `trips`, opt-in)

### B.1 Data model — migration `people_can_share_a_ride_into_town`

**`trips`**
- camp_id, `kind` (`town_run | day_off | supply_run | other`), title, destination.
- depart_date, depart_time, return_date, return_time.
- driver_member_id (nullable) / driver_name, `vehicle_asset_id` nullable → `camp_assets` (the
  picker only shows when Assets is enabled).
- `passenger_seats int`, `errands_close_time time` nullable, notes, `status` (`planned | out |
  back | cancelled`), created_by.

**`trip_seats`** — trip_id, camp_id, rider_user_id nullable, rider_name, rider_email, `leg`
(`both | there | back`), `status` (`confirmed | waitlist | cancelled`), created_at.

**`trip_errands`** — camp_id, trip_id **nullable** (null = on the shared list, no trip yet),
requested_by / requester_name, item, quantity text, store, est_cost, needed_by date,
for_activity text, `status` (`open | bought | unavailable | cancelled`), driver_note.

**`ride_requests`** — camp_id, requester, wanted_date, time window (earliest/latest `time`),
destination, `leg`, note, `status` (`open | matched | cancelled`), matched_trip_id.

RLS: select `is_camp_member`. Writes through RPCs (seat capacity has to be atomic).

### B.2 RPCs

- `create_trip` / `update_trip` / `cancel_trip`: creator, driver or admin.
- `claim_trip_seat(trip, leg)`: locks the trip row; `confirmed` if a seat is free on that leg,
  otherwise `waitlist`.
- `release_trip_seat`: promotes the earliest waitlisted rider.
- `add_errand(trip or null)`, `attach_errands(trip, ids[])`, `set_errand_status`.
- `request_ride`, `match_ride_request(request, trip)`: matching claims a seat.
- **Seat math per leg:** a `there`-only rider and a `back`-only rider don't double-book a seat.
  "One-way riders with no way back" = confirmed `there` seats on trips with no matching `back`
  seat on any trip that day or the next. This is the stranding warning.

### B.3 Reminders — `plan_trip_messages_internal()`

| rule_key | To | When |
|---|---|---|
| `seat_confirmed` / `waitlist_promoted` | rider | now |
| `leaving_soon` | riders + driver | 60 min before departure (quiet hours apply; noted in UI) |
| `trip_cancelled` | riders + errand requesters | now |
| `errand_done` | errand requester | when the driver marks bought/unavailable |

### B.4 Screens (`/trips`)

1. **Week board** (default)
   - **Leaving next strip:** the next 2 trips with a countdown, seats left and an errand-list
     cutoff ("List closes 1:30").
   - **7-day grid** (the column pattern from `MenuTab` — reference only, a new component in
     `src/components/trips/`):
     - trip cards sorted by departure, each showing kind colour, destination,
       depart→return, driver and vehicle, **seat dots** (filled/empty/waitlist) and an errand
       count;
     - per-day **demand chips** ("3 want a ride Sat") from `ride_requests`;
     - a red **"2 with no ride back"** chip when the stranding rule fires.
   - Previous/next week; "This week" jumps back. On phone: days stack vertically, today first.
2. **Trip drawer:** riders by leg, Grab a seat / Leave, errands checklist (a big-tap checklist
   for the driver on a phone: bought / unavailable + note), "Attach open errands (5)" for the
   driver, Cancel trip.
3. **Shopping list tab:** every open errand grouped by store, split into on a trip / needs a
   trip, with a needed-by date. "Add errand" works with no trip, which fixes the "calls
   everyone who's going into town" problem.
4. **Ride requests tab:** "I need a ride" form and open requests. A driver can match them to a
   trip.
5. `+ Plan a trip` modal: kind presets (Town run: 2h, 4 seats, list closes 30 minutes before).

Store `tripsStore.ts`, data layer `tripsDb.ts` (the `campgroundDb.ts` pattern: one channel, one
binding per table, debounced), pure logic `src/lib/trips.ts` (seat math per leg, stranding rule,
week layout). Gate `['trips']`, a Sidebar item in a new "Logistics" section. **Loading is skipped
when the module is disabled.** Check whether `CampDataLoader` can skip opt-in modules, since it
loads everything today; the new modules skip loading when not enabled.

**UX acceptance criteria**
- A staff member with a day off finds a ride on Saturday and claims a seat in **3 taps** from
  the board.
- Somebody who needs one item adds an errand in **under 30 seconds** without knowing who is
  driving.
- The driver's phone checklist is usable with one thumb (tap targets ≥ 44px).
- A full trip can never show more confirmed riders than seats, even with simultaneous claims.

### B.5 Tests

- **SQL `trips_test.sql`** as `authenticated`:
  - capacity race: two sessions claim the last seat and exactly one is confirmed (use two
    `dblink` connections, or a `for update` sequencing assertion);
  - per-leg seat accounting;
  - waitlist promotion order;
  - permissions: a non-creator can't edit or cancel someone else's trip, admin can;
  - errand attach/detach;
  - reminders queue and cancel;
  - module off: the RPCs still work (the module is a UI gate), but loaders skip it. Documented.
- **Vitest:** seat math, stranding rule, week layout across DST and month ends.
- **Playwright J3.**

---

## C. Receipts (module `receipts`, opt-in)

### C.1 Data model — migration `company_card_receipts_are_matched_to_the_statement`

- **`expense_cards`** — camp_id, label ("Visa ··4821"), holder_member_id, holder_name,
  holder_email, last4, default_budget_code_id, active.
- **`expense_budget_codes`** — camp_id, code, name ("Programs — Arts"), `qb_account` (QuickBooks
  account name), active, sort_order.
- **`expense_tax_settings`** (one row per camp) — currency (`CAD`), province, `tax_rules jsonb`,
  e.g. `[{"type":"GST","recoverable_pct":50},{"type":"PST","recoverable_pct":0}]`.
  **Editable, with no rates pre-filled as fact.** The UI says "Confirm these with your finance
  director." The recoverable share depends on their charity/non-profit status and province.
- **`receipts`**
  - camp_id, card_id, submitted_by, submitter_name, `file_path` (private bucket `receipts`, path
    `<camp>/<receipt>.<ext>`).
  - vendor, purchase_date `date`, subtotal, `taxes jsonb` `[{type, rate_pct, amount}]`, tip,
    total, currency, budget_code_id, purpose.
  - `status` (`processing | needs_review | ready | exported`), `ai_result jsonb`,
    `ai_min_confidence`, reviewed_by/at, `statement_line_id` (unique), `possible_duplicate_of`,
    `export_id`.
  - Money is `numeric(12,2)`.
- **`card_statements`** — camp_id, card_id, `period_month date` (first of month),
  statement_total, file_path, uploaded_by. Unique per (card, month).
- **`statement_lines`** — statement_id, camp_id, posted_date, description, amount,
  `match_state` (`unmatched | matched | no_receipt_ok | personal`), receipt_id, note.
- **`expense_exports`** — camp_id, period_from/to, card_ids, created_by, row_count, total,
  `format`.
- **`ai_usage`** — camp_id, function, created_at. Used for quota.

RLS, **the only module here with private-per-person data:**
- **admin:** all rows.
- **staff:** receipts where `submitted_by = auth.uid()` OR the card's `holder_member_id` is theirs.
- **viewer:** none.
- Statements, lines and exports: admin only.
- Storage policies on `receipts` mirror this, keyed on the folder camp id plus a receipts lookup.

### C.2 Edge function `read-receipt`

Pattern: `draft-work-order/index.ts`.
- `auth.getUser()` required.
- 503 when `ANTHROPIC_API_KEY` is missing.
- Detects the file type from magic bytes. **JPEG/PNG/WebP/HEIC-converted and PDF** (PDF as a
  document block).
- Max ~6.5M base64.
- **Quota:** 60/day per camp, 25/day for `trial` camps. Counted in `ai_usage`.

**Model:** decide at build time with the `claude-api` skill (the existing functions use
`claude-sonnet-4-6`).

The prompt returns strict JSON:
- `readable`, vendor, date (ISO), subtotal, taxes `[{type: GST|HST|PST|QST|other, rate_pct, amount}]`,
  tip, total, currency, and a `confidence` for each field.
- The receipt text is **data, never instructions** (prompt-injection line, as in
  `draft-work-order`).
- No guessing: a field it cannot read is `null`.

**Server-side checks** (never trust the model):
- types from the allow-list;
- `subtotal + Σtaxes + tip = total ±0.02`, else `math_mismatch: true`;
- date not in the future and not more than 400 days old;
- currency `CAD|USD`.

The client sets `needs_review` and **never saves the AI's values as final without a person
confirming** (the "never silently auto-fill" rule). Fields below 0.65 confidence are amber (the
pool strip threshold).

### C.3 Pure logic `src/lib/receipts.ts`

- `parseStatementCsv(text, mapping)` — reuse `parseCsv` from `commissaryUnits.ts` (it's generic;
  move it to `src/lib/csv.ts` and re-export, to avoid a module-to-module import). Handles
  debit/credit columns or a signed amount, `MM/DD/YYYY` and `YYYY-MM-DD`, and thousands
  separators.
- `autoMatch(lines, receipts)`:
  1. exact amount and date within ±3 days, one candidate → matched;
  2. several candidates → the closest date, then vendor-token similarity;
  3. never matches one receipt twice.
  
  It returns suggestions; the person confirms in bulk.
- `findDuplicates(receipts)`: same card, same total, date ±1 day, vendor similarity ≥ 0.6.
- `monthSummary(...)`: statement total vs Σlines (does the statement add up?), matched/unmatched
  counts, spend by budget code, taxes by type, **estimated recoverable** per settings (labelled
  as an estimate).
- `toQuickBooksCsv(receipts, codes, format)`: **verify the exact QuickBooks Online import
  columns at build time** (bank-transaction 3-column/4-column and the expense spreadsheet
  import). Ship two presets plus a generic detailed CSV (Date, Vendor, Account, Card, Subtotal,
  GST, HST, PST, Total, Memo, Receipt link). Ask Teddy whether they're on QuickBooks Online or
  Desktop.

### C.4 Screens (`/receipts`)

1. **Snap** (primary action, mobile-first): `<input type="file" accept="image/*,application/pdf"
   capture="environment">` → upload → "Reading receipt…" → **review form** prefilled (card
   defaults to the holder's own card, budget code defaults to the card default) → Save. Batch
   upload on desktop: drop 20 files, they process into the queue.
2. **Receipts:** a table filtered by card × month × status, with bulk "set budget code", a
   duplicate flag with side-by-side compare, and a thumbnail preview (signed URL).
3. **Reconcile (card × month)** — the core of Teddy's pain.
   - **Header:** statement total · Σ charges · Σ matched receipts, with a ✓ when "This month
     agrees".
   - **Three lists:**
     - matched pairs (accept all);
     - **charges with no receipt**: attach an existing receipt, "Remind holder" (queues
       `receipt_missing` to the card holder), mark `no receipt ok` / `personal`;
     - **receipts with no charge**: wrong card/month?
   - Upload statement CSV → column mapper (auto-guessed like the Commissary CSV import) →
     preview → import.
4. **Summary:** months as rows; spend by budget code; GST/HST/PST paid; estimated recoverable;
   export status.
5. **Export:** pick period + cards → preview rows → download CSV → marks rows `exported`
   (re-exporting needs an explicit "include already exported").
6. **Settings:** cards and holders, budget codes with QuickBooks account names, tax rules.

**UX acceptance criteria**
- A card holder goes from photo to saved receipt on a phone in **under 45 seconds**, confirming
  AI values rather than typing them.
- Teddy reconciles a 40-charge month (CSV) in **under 10 minutes**, and the screen clearly says
  when the month agrees with the Visa bill.
- The export opens cleanly in a spreadsheet and matches the Summary totals to the cent.
- A staff card holder can never see another holder's receipts.

### C.5 Tests

- **SQL `receipts_test.sql`** as `authenticated`:
  - RLS: holder A sees only their own, a staff non-holder sees none, admin all, viewer none;
  - storage policy checks;
  - unique statement per card/month;
  - one receipt can't match two lines;
  - export marks rows and blocks silent double export;
  - quota counting;
  - privileges.
- **Vitest:** CSV parsing (5 bank formats: RBC, TD, Scotiabank, BMO, CIBC style fixtures),
  `autoMatch` (ties, duplicates, ±3-day edge), `findDuplicates`, `monthSummary` rounding to the
  cent, QuickBooks CSV golden files.
- **AI eval `scripts/eval-receipts.mjs`:** 12 fixture receipts in `test-fixtures/receipts/`,
  **fictional vendors, rendered by us**:
  - thermal-faded; ON HST; BC GST+PST; QC GST+QST; AB GST only; restaurant with tip; a
    multi-page PDF invoice; rotated photo; crumpled; USD receipt; non-receipt photo (must be
    `readable:false`).
  - Report field accuracy.
  - **Acceptance:** total exactly right on ≥ 11/12; any wrong total must come with
    `math_mismatch` or confidence < 0.65 (**never confidently wrong**); the non-receipt is
    rejected.
- **Edge function:** unauthenticated → 401, over quota → 429, oversize → 413.
- **Playwright J4.**

---

## D. Demo Guide and seed data

### D.1 Data — migration `a_demo_opens_on_what_the_prospect_asked_for`

**`demo_briefs`** (one row per camp)
- `prospect_name` ("Teddy"), `headline`, `intro`.
- `spotlights jsonb`: an ordered list of `{key, enabled, you_told_us, what_we_built}`.
- `founder_contact` (name, email), updated_by/at.
- Select for camp members; **writes only via `admin_set_demo_brief`** (platform admins).

Spotlight templates live in code (`src/lib/demoSpotlights.ts`), each with a default title, "try
it" steps (text + deep link + completion check), and required modules:
`food_requests`, `town_trips`, `receipts`, plus existing ones (`campground`, `retreats`,
`kitchen_ordering`) for later prospects.

**Seed functions** (platform admin only, **refuse unless `account_type in ('trial','demo')`**;
idempotent via `uuid_generate_v5(camp_id, key)` upserts; **dates relative to `current_date`** so
a board seeded today is still full next week):
- `seed_demo_food_requests(camp)`:
  - 4 programs (Cooking Club, Outdoor Ed campfire, Baking, Canoe trips) with ~20 linked kitchen
    items;
  - 12 requests spread over −7…+10 days in every status, including 1 late request in the inbox
    and 1 approved-with-changes;
  - lead emails `@example.com`.
- `seed_demo_trips(camp)`:
  - this week and next: 7 trips (town runs, day-off shuttles, a supply run with a camp van if
    assets exist), some full with a waitlist;
  - 9 errands (some on trips, some open);
  - 3 ride requests;
  - **1 stranding case** to show the warning.
- `seed_demo_receipts(camp)`:
  - 3 cards (holders from `@example.com`), 8 budget codes with QuickBooks accounts, tax rules
    marked "sample";
  - last month: 24 receipts (images from the fixture set copied into the camp's folder),
    reviewed and matched against an imported statement, **with 2 missing receipts and 1
    duplicate left for the visitor to resolve**;
  - this month: 6 receipts in `needs_review`.
  - Plus a downloadable **sample statement CSV** in the guide so they can try the upload.

Receipt images: storage copies can't be done in SQL, so an admin-side step (`adminStore.seedDemo`
→ edge function `seed-demo-files`, platform-admin check, service role) copies fixture images
from a private `demo-assets` bucket.

### D.2 Screens

1. **`/welcome` — Demo Guide** (only for `trial`/`demo` camps with a brief; `TryDemo.tsx`
   navigates here instead of `/home` when one exists; a pinned "Demo guide" sidebar item and a
   link in the `StatusBanners` demo banner).
   - **Hero:** "Built for {prospect} after our conversation", the intro, and "This is a working
     copy — click anything, nothing you do here affects a real camp."
   - **One card per enabled spotlight:**
     - **What you told us** (quoted), **What we built** (2 sentences);
     - **Try it** — 3–5 numbered steps, each with an **Open** button deep-linking to the exact
       screen and state (`/commissary?tab=requests`, `/trips?week=current&trip=<id>`,
       `/receipts/reconcile?card=…&month=…`);
     - a check mark that **fills from real data** where cheap (e.g. "submit a request from the
       link" = a `source='link'` request created after the visitor joined), otherwise a manual
       tick in `localStorage`.
   - **"Be the counselor" panel:** QR code plus link to the Cooking Club's `/food/:token`. "Scan
     it with your phone, send a request, and watch it land in the kitchen inbox on this screen."
     Also "Use your real email to get the reminder."
   - Footer: founder contact with "Reply to Eric" (mailto) and "Share this demo with your
     director" (copies the `/try/` link).
   - Deep links need the pages to read `?tab=` and ids. Add that to Commissary, Trips and
     Receipts.
2. **`/admin` › camp row › Demo guide** panel:
   - prospect name, headline, intro;
   - spotlight checklist with editable "You told us / What we built";
   - "Seed demo data" buttons per module (with a confirm naming the camp);
   - "Open guide" preview.
   
   `SpinUpTrialModal` gains: modules to sell (writes `platform_modules`), spotlights, and
   "seed selected modules". **One flow: clone → set modules → seed → brief → copy link.**

**UX acceptance criteria**
- A cold visitor on `/try/<token>` in a fresh browser lands on the guide and completes each
  spotlight's first step **without help**.
- Every Open button lands on a screen where the step's action is visible without scrolling at
  1280×800.
- No console errors and no empty states anywhere the guide links.
- The demo still looks alive when opened 10 days after seeding.

### D.3 Tests

- **SQL `demo_seed_test.sql`:**
  - the seeds refuse `customer` camps;
  - re-running doesn't duplicate;
  - all dates fall inside the expected window relative to `current_date`;
  - `admin_set_demo_brief` rejects non-platform-admins;
  - anon `/try/` members can read the brief but not write it;
  - clone coverage gaps are only the tables left out on purpose.
- **Playwright J5–J6.**

---

## Journeys (Playwright, staging "Prospect QA", both viewports, screenshots at every step)

| # | Journey | Asserts |
|---|---|---|
| J1 | Counselor on a phone opens `/food/:token` → sees the cutoff notice → requests 3 items (1 free text) for a pickup in 2 days → status page | late warning shown; status "Submitted"; queue has `request_received` + `new_request` rows with `body_text` |
| J2 | Kitchen (a second browser context) sees it in the Inbox **without a reload** → edits a quantity, links the free-text line → approves → Inventory shows set aside → Ordering "Show the math" includes it → Ready → Picked up | realtime arrival < 3s; demand appears in order math; requester status page reflects each step; `pickup_reminder` cancelled after pickup |
| J3 | Staff A plans a town run (3 seats) → B and C grab seats → D is waitlisted → B leaves → D promoted; E adds an errand with no trip; the driver attaches it and checks it off on a phone | seat dots correct at every step; the stranding chip appears for a `there`-only rider and clears when a return is added |
| J4 | Holder snaps a fixture receipt → AI prefill → corrects one amber field → saves. Admin uploads the statement CSV → maps columns → auto-match → resolves 1 missing and 1 duplicate → month agrees ✓ → exports | exported file content equals a golden CSV; holder B cannot open holder A's receipt URL |
| J5 | Admin spins up a demo from `/admin` with modules + brief + seeds → `/try/` in a fresh anonymous context → guide → every Open button → the steps' checks fill after doing them | zero console errors; every deep link resolves; the QR link is correct |
| J6 | A customer camp without `trips`/`receipts` sold: no nav items, `/trips` redirects to `/home`; Food requests present in Kitchen Manager | module gating holds for opt-in modules |

**Fresh-eyes UX pass (after J1–J6 are green):** a subagent **given no context** except the
`/try/` link and a persona goal (e.g. "You're Teddy, the ops lead. The cooking club needs
supplies Thursday. Figure out how.") drives the browser and reports every hesitation, dead end
and confusing word. Do this once per spotlight, fix everything it finds, then run a second pass
with a new agent. Then Eric walks it himself on his phone.

---

## Phases, order and gates

| Phase | Content | Depends on | Est. | Status |
|---|---|---|---|---|
| 0 | Branch, opt-in modules, outbox security fix + extension points, clone coverage, test harness, staging QA camp | other agent's work committed | 0.5d | ☐ |
| 1 | Food requests: migration, RPCs, reminder rules, SQL suite | 0 | 0.75d | ☐ |
| 2 | Food requests: kitchen tab, `/food-requests`, public form + status, inventory/ordering integration, Vitest, J1–J2 | 1 | 1–1.25d | ☐ **first demoable milestone** |
| 3 | Town Trips: backend + board + drawer + lists + tests + J3 | 0 | 1–1.5d | ☐ |
| 4 | Receipts: backend, `read-receipt` + eval, snap/review, reconcile, summary, export, tests + J4 | 0 | 2–2.5d | ☐ |
| 5 | Demo Guide, admin panel + spin-up flow, seed functions + fixture assets, deep links, J5–J6 | 2, 3, 4 | 1d | ☐ |
| 6 | Fresh-eyes UX passes and fixes; production deploy; provision the prospect's demo on prod; walk it on prod in incognito and on a phone | 5 | 1d | ☐ |

Phases 1–2, 3 and 4 can run **in parallel worktrees** once Phase 0 is merged. The shared touch
points (`modules.ts`, `plan_all_messages`, the outbox check constraint, clone lists) are all
settled in Phase 0. Each module owns its own tables and planner stub. `App.tsx`, `Sidebar.tsx`
and `types.ts` get small, mergeable additions. **Migrations on the shared staging database
are applied by one agent at a time.**

**Gate at the end of every phase (all must pass before commit):**
1. `npx tsc -b` (never `--noEmit`), `npm run lint` ≤ 30 problems / 15 errors, `npm run build`.
2. `npm run test:sql` (all suites, including the existing two), `npm run test:unit`.
3. Journeys for the phase, with screenshots **looked at**, at both viewports.
4. Migration hygiene: rename files to the ledger version (trap 7), md5 of `prosrc` matches the
   file for every new or changed function, `pg_proc` signature diff shows no stray overloads
   (trap 5).
5. Every new table is in `supabase_realtime` with replica identity full (query `pg_publication_tables`).
6. `has_function_privilege('anon', …)` is false for everything not meant to be public.
7. Supabase security advisors: no new ERROR.
8. The env badge says **staging** in every screenshot.
9. Commit with a behaviour-describing message.

**Phase 6 production deploy checklist**
- Migrations to production using the verified process from the 2026-09-15 deploy (schema probe,
  not ledger trust).
- Deploy `read-receipt` and `seed-demo-files`.
- Confirm `ANTHROPIC_API_KEY`, `RESEND_API_KEY` and `CRON_SECRET` are set on production.
- Anonymous sign-ins on.
- Provision the demo via `/admin`: clone from the chosen seed → sell `commissary`, `trips`,
  `receipts` (plus whatever else he should see) → seed → write the brief in his words.
- Walk every spotlight on production: incognito desktop plus a real phone. Submit a food request
  from the phone with a real email and confirm the email arrives.
- Only then send the link.

---

## Out of scope (write down, don't build)

- Real SMS (Twilio). The data and copy are ready: `body_text`, `notify_by`, phones stored.
- A kitchen-only permission (crew-level module access was removed; needs a product decision).
- QuickBooks API sync, bank feeds, per-line receipt item extraction.
- iOS screens for any of the three (the web is mobile-first; the iOS app points at production and
  lags).
- A no-login Town Trips board for staff without accounts.
- Fixing `analyze-test-strip` auth and the asset-sticker report bug (tracked separately, but
  should be done soon).

## Open questions for Teddy (put in the follow-up email, don't block on them)

1. Who at Lakeside should get new-request emails, and does their staff use a computer or a
   phone in the kitchen?
2. Which province, and does the camp claim public service body rebates as a charity/non-profit?
   (sets the tax rules)
3. QuickBooks Online or Desktop? Which bank issues the cards (sets the CSV preset)?
4. Are the town-trip vehicles camp vans, staff cars, or both?

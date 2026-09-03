# Campground & Rentals

Two products instead of eight modules: the work that keeps the property running, and the groups
you rent it to. They are one product because **a rental group's request becomes the property
team's work order.**

Built 2026-09-02 on `staging`. Not applied to production.

---

## Naming: the one thing to get right first

The module is called **Campground** in the product. The table is still `issues`, the
staff-group module key is still `issues_repairs`, and `/issues` still routes.

That is deliberate, not an oversight. Renaming a table that thirteen surfaces and an iOS app
read from is pure risk for zero user-visible gain. **The word on the screen is the product; the
word in Postgres is plumbing.** Don't "finish the rename."

---

## The work half

### One queue, five ways in

| Source | `issues.source` | Raised by |
|---|---|---|
| A sticker on a door | `qr` | Anyone, signed in or not |
| A routine coming due | `routine` | `generate_scheduled_work()`, nightly + on module load |
| A rental group's approved request | `retreat` | `approve_space_request()` / `generate_turnover_work()` |
| A session ending | `session` | `generate_session_turnover()` |
| A person | `web` \| `ios` | Typed, photographed, or spoken |
| Another module | `module` | Asset returned damaged, building component flagged |

Everything lands in the same table with different columns set. There is no second work table and
there should never be one.

### Trade is a column, never a permission

`issues.trade` ∈ `maintenance | housekeeping | grounds | kitchen | it`.

Housekeeping is "the same as maintenance just coloured differently", which is an enum. A separate
table would double the activity trail, assignment, photos, realtime, iOS list and analytics to
gain nothing.

**It is a filter default and a colour. It must never gate visibility.** Gating work by trade
would rebuild the staff-visibility trap that once hid a staff member's own report from them and
looked exactly like a data-loading bug (see `project_staff_visibility_trap` in memory).

Colour rule: trade is carried by a **left border stripe plus a small pill**, never a fill.
Priority already owns red and amber; two colour systems on one card make a board unreadable.

### Routing is the highest-value row in the schema

`work_routing (camp_id, trade, default_staff_group_id, default_assignee_id)`.

An untriaged queue is why maintenance-system rollouts die. A housekeeping report that sits
unassigned until an admin notices is a report nobody acts on.

### Two honest waiting states

`waiting_on_vendor` and `waiting_on_part` are open but explicitly not being worked. Before them,
"waiting on the septic guy since June" rendered as `in_progress`, which is how a queue stops
meaning anything.

### Routines: THE rule

`work_schedules` replaced `issues.is_recurring`, which was a checkbox that generated nothing for
its entire life. An issue is an *event*; a recurrence is a *template*.

> **Only one open occurrence exists per schedule at a time.**
>
> If last week's "check the extinguishers" is still open when this week's comes due, the open one
> is bumped and `missed_count` goes up — the camp sees *"3 cycles behind"* rather than three
> identical rows.

Every recurring-task system that stacks duplicates gets muted inside a month, and a muted queue
is a dead module. Do not "fix" this to create the missing occurrences.

Other invariants:
- Occurrences are **materialized** as real `issues`, not computed. A virtual occurrence cannot be
  assigned, photographed, commented on, checklisted, or counted in the season review.
- A unique index on `(schedule_id, due_date)` makes generation idempotent.
- Generation runs over a **rolling window** (`generate_ahead_days`), never a year at once.
- `active_from` / `active_until` matter: without them a "daily" routine runs in January, and a
  camp that finds January work in its list stops trusting the whole queue.
- Fixed calendar by default (`reschedule_from = 'due_date'`). Filters get changed monthly whether
  or not you were late.
- **Meter cadence reads `camp_assets.current_hours` / `current_odometer`**, which already existed.
  A first pass added duplicate `meter_reading` columns; they were dropped. Don't re-add them.
  A reading lower than the last is refused, not absorbed — absorbing a typo would make every
  meter routine come due at once.

### Recurrence exists three other ways already

Safety has real date recurrence (`frequency`/`frequency_days`/`next_due`); Pool and Assets have
phase-based seasonal tasks; Pre/Post has `days_relative_to_opening`. **Do not migrate them.**
`work_schedules` is the engine a *fourth* module should adopt rather than inventing a fourth
mechanism.

### Checklists make housekeeping real

"Turn over Cabin 7" is not a task, it is eleven steps, and the value is knowing which seven got
done. Six templates ship seeded per camp.

Ticking the last step closes the work order and unticking one reopens it — both by database
trigger, so the rule holds however the row changed (web, iOS, or an offline queue draining hours
later). Don't also close it client-side; you will fight the trigger.

### One timeline, not two tabs

`issue_comments` renders **interleaved with** `issue_activity`: system events quiet, human
messages loud. A History tab beside a Comments tab is exactly the interface where messages go to
be missed.

### Closing is one tap plus an undo

Never require a field to close. The moment you do, people stop closing things in the field and
close them from a laptop three days later, which turns response-time data into fiction.

---

## The seam

```
Group asks for the Lodge  →  Camp approves  ─┐
                                             ├→  Set up Lodge   (housekeeping, due that morning)
                                             └→  Reset Lodge    (the strike camps always forget)
                                                     ↓
                                              Crew taps Done → status back in the group's portal
```

`approve_space_request()` creates **two** work orders, not one. A rental turnover is set-up plus
tear-down without exception, and camps forget the strike every time.

The group's `setup_notes` travel **verbatim** into the work-order description. A coordinator who
wrote "three benches along the back wall" should not have it paraphrased by two people before it
reaches the person carrying benches. The camp's own note sits *beside* it, never replacing it.

The same generator, pointed at `retreat_housing`, produces cabin turnovers on departure — the
larger and more repetitive housekeeping job at any rental camp. Pointed at `camp_sessions`, it
does session turnover.

**One hard stop, everything else a warning.** `space_request_conflicts()` surfaces double
bookings, dorm/program overlap, a building housing another group, and over-capacity as warnings —
approval is a judgement call and some camps genuinely run two groups through the Lodge on the
same afternoon. Only `service_status = 'out_of_service'` blocks.

Editing an approved request reopens it as `countered` and drops a comment on the linked work
order. Never silently mutate work somebody is standing in front of.

### The second seam: out of service

`locations.service_status` is **read by rental availability and the rooming board**, not merely
displayed. Assets already had a status; locations did not — which meant a coordinator could put
twelve guests in a cabin that had been out of service since June.

---

## The sticker

Database work predates this build (`20260831022109`); the UI did not exist and
`src/lib/qr.ts` — a complete, dependency-free QR encoder — was imported by nobody.

**One URL, two audiences:** `/l/:token` renders the location hub for a signed-in member of that
camp and the public report form for everyone else. A camp cannot manage two sticker types per
door; anyone printing separate staff and guest codes has already lost.

- Tokens are 12 characters / 72 bits, on `locations.qr_token` and `camp_assets.qr_token`.
- `get_qr_target()` resolves either kind, anon-callable, display fields only.
- `open_reports_at()` shows what is already reported here **before** the reporter types. The
  number-one failure of open reporting is the same broken door reported eleven times, and this is
  a location query, not an AI problem.
- `submit_public_report_v2()` returns a **receipt token** so the person who reported it can find
  out what happened. A counselor who files and never hears anything is the loudest complaint
  about every open-reporting system.
- Print sheet targets **Avery 5163** (2×4", 10/sheet) and always includes human-readable fallback
  text. QR fails in rain, in low light, and on a phone whose camera app does not scan.
- `rotate_qr_token()` reissues a code; every printed copy of the old one stops resolving.

---

## The rentals half

- **Pipeline** is eight columns on `retreats` plus `retreat_contacts` and `retreat_touchpoints` —
  deliberately not a CRM. A camp has fifteen to forty groups a year, not four thousand leads.
- `arrival_date` / `departure_date` are **nullable while `status = 'inquiry'`** and required the
  moment it is not, enforced by the `retreats_dates_when_confirmed` check. A lead says "some
  weekend in October" before it says October 10th. All the retreat date helpers in
  `retreatUi.tsx` tolerate null; use them rather than asserting.
- **Proposals** are the front half of the funnel that did not exist. `viewed_at` alone justifies
  the table — knowing they opened it on Tuesday changes the follow-up call.
- **Add-ons** are the only upsell surface in the product.

### Payments: Stripe Connect, and the money is not ours

`camps.stripe_account_id` is a **Connect (Standard)** account belonging to the camp. Funds settle
directly to them. We hold an account id — never a key, never a card number, never a balance.

`record_stripe_payment()` is idempotent on the Stripe **event id**, because Stripe retries and a
redelivery must not take the money twice. Payment state is written only by the webhook with the
service role: a camp editing an invoice must not be able to declare it paid.

### The outbox, not a cron job that emails

`scheduled_messages` is **planned** nightly and **drained** separately.

> The planner re-runs every night and **cancels** anything whose condition stopped being true.
> The worst email this product could send is "please submit your rooming" the morning after they
> submitted it — and a cron job that emails directly *will* send it.

The camp can see the queue, edit it, and cancel it. Nothing sends silently. `subject_type` is
generic from the first migration because the campground half rides the same rails (urgent-and-
unassigned escalation, unread-message nudges).

Quiet hours are camp-local via `camps.timezone`, and multiple messages to one recipient on one
day are merged into one email by `claim_outbox_batch()`.

---

## Offline (iOS)

Three server-side pieces, all in `20260902…_offline_sync_engine`:

1. **Tombstones** (`deleted_rows`) — a delta pull is a query on a timestamp, so a row deleted
   while a device was away matches nothing. Swept after 90 days; past that a device is told
   `full_resync_required` rather than left showing deleted work forever.
2. **Idempotency** (`client_mutations`) — the **device** picks the mutation id, so retrying after
   a lost connection is safe and returns `duplicate: true`.
3. **`sync_pull` / `sync_push`, both `SECURITY INVOKER`** — every write is subject to exactly the
   RLS the app is. A sync endpoint that bypassed row-level security would be the largest hole in
   the product.

`sync_push` applies mutations **one at a time**: a phone with eleven queued changes lands the ten
that are fine rather than losing all eleven to one that is not.

> **Trap, already hit once:** `sync_pull` originally assumed every table had `updated_at`. Seven
> do not (`issue_comments`, `issue_checklist_items`, `asset_checkouts`, `asset_service_records`,
> `pool_chemical_readings`, `pool_inspection_log`, `pool_service_log`), and a column reference
> resolves at *parse* time — so `$2 is null` did not rescue the full-sync case either. Every call
> raised 42703. It now asks the catalogue which timestamp columns a table has. **Adding a table
> to the pull list requires no change; adding one with neither timestamp does.**

---

## Reviews

`season_review()` and `rentals_review()` compute in Postgres, never in the browser — the client
hydrates fourteen stores asynchronously and a number built from whatever happened to have loaded
is not one to forward to a board.

- **Medians, never means.** One work order somebody forgot for four months destroys a mean.
- **Workload, never a leaderboard.** Counts alone rank a seventeen-year-old summer hire against a
  career carpenter and reward whoever closes easy tickets fastest. Admin-only.
- `snapshot_review()` freezes a period so last year's numbers cannot change when someone
  back-dates a closure in November.
- `rentals_review().cost_to_host` exists **only because of the seam**: no competitor on either
  side can tell a camp what a rental group actually cost to host, because one cannot see the work
  and the other cannot see the group.

---

## Sessions were trapped in Commissary

`commissary_sessions` was the only table holding session names, dates and headcounts, and
Compliance had already built `compliance_session_capacity` separately rather than reach for it.

`camp_sessions` is now the camp-level table, **mirrored** from `commissary_sessions` by trigger
until that module is refactored onto it. It is one fact with one home plus a mirror, rather than
a fourth copy.

---

## Testing

```
STAGING_DB_URL='postgresql://…' npm run test:campground
```

`supabase/tests/campground_rentals_test.sql` — hermetic, wrapped in a transaction that rolls
back. It concentrates on the rules that are easy to regress and expensive to get wrong: the
one-open-occurrence rule, the seam generating both work orders, the outbox cancelling a nudge
whose condition went false, and `sync_push` being safe to retry.

The suite sets `request.jwt.claims` so `auth.uid()` resolves — every function under test gates on
`is_camp_member`/`is_camp_admin`, and without that setup everything raises `Forbidden` and the
suite tests nothing.

Demo data lives on **staging Pine Ridge** (`33333333-3333-4333-8333-333333333333`), seeded with a
booked group whose approved space request has already generated a set-up, a strike and two cabin
turnovers.

---

## Deliberately not built

| | Instead |
|---|---|
| Parts inventory, stock levels, reorder points | A `waiting_on_part` status and a shopping list |
| Labor time tracking | Optional `minutes_spent` on close, off by default |
| Maintenance purchase orders | Nothing. Maintenance buys at the hardware store |
| A request-approval workflow | Assignment *is* the triage |
| A cancellation-policy engine | A policy field on the agreement |
| Accounting integration | CSV export |
| Cloud speech-to-text | Device STT (`SpeechRecognition` / `SFSpeechRecognizer`) + Claude for structuring |
| Cost **estimates** | Removed. `actual_cost` stays, admin-only |

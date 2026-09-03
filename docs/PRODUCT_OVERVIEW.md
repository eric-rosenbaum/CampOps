# CampCommand · Product Overview

A single reference for what this product is and does. Written to be handed to someone (or
something) with no prior context, so it states scope plainly and is explicit about what the
product does **not** do.

Verified against the codebase on 2026-08-26.

---

> **Updated 2026-09-02.** The product has been reshaped into **two products, not eight modules**:
> **Campground** (the work that keeps the property running) and **Rentals** (the groups you rent
> it to), joined at the work order. The other six modules are unchanged and stay switchable; they
> are the property's other systems, sold when they match a pain point rather than led with.
> The module-by-module detail below still describes them accurately — see
> [`campground/README.md`](campground/README.md) for the two that changed.

## What it is

**CampCommand** (repo `CampOps`, package `campcommand`) is a multi-tenant operations platform
for summer camps. It is the software a Director of Operations, Facilities Manager or Camp
Director uses to run the physical plant and the operational calendar.

It is **not** a camper registration system, a CRM, an accounting package or an HR system. It
sits alongside those.

**The problem it addresses:** camps run on institutional knowledge that walks out the door with
seasonal staff, and on records scattered across email, spreadsheets, binders and one person's
memory. The product captures issues, seasonal rituals, compliance evidence and infrastructure
knowledge ("which breaker controls what") in one place, with an append-only activity trail.

**Core loop:** something breaks → someone logs it from a phone → it is assigned → tracked →
resolved, with a record that survives the season.

**Scale it targets:** camps of roughly 40 to 400 campers, with an operations team of 5–40.

---

## The eight modules

Each is independently switchable per camp: a camp may buy two or all eight. Routes are web.

### 1 · Campground — `/campground` (was Issues & Repairs, `/issues`)
The spine of the product; almost everything else can create one. Renamed in the UI only — the
table is still `issues` and `/issues` still redirects.

Two crews in one queue: `trade` marks a work order as maintenance, housekeeping, grounds, kitchen
or tech. It is a filter default and a colour, never a permission. `work_routing` sends each
trade's work to a default owner so nothing waits on an admin to triage it.

Work arrives five ways: a QR sticker on a door, a routine coming due, a rental group's approved
request, a person (typed, photographed or spoken), or another module flagging something.

- **Routines** (`work_schedules`) replaced a recurring checkbox that generated nothing.
  Occurrences are real work orders, and only one is open per routine at a time — a routine that
  falls behind is bumped and counted, not duplicated.
- **Checklists** turn "turn over Cabin 7" into eleven checkable steps; six templates ship seeded.
- **Comments with photos** render in one timeline with the activity events, never a second tab.
- **Vendors** (`service_vendors`): the septic pumper, the well contractor, the elevator inspector.
  A work order can be dispatched to one, and `waiting_on_vendor` is a real status.
- **Assets**: a work order can name the thing it is about, which is what makes cost and days-out
  per vehicle possible.
- **Season Review**: the September page a director forwards to a board.
- Cost *estimates* were removed. `actual_cost` stays, admin-only.

States: unassigned → assigned → in progress → resolved, plus two honest waiting states —
`waiting_on_vendor` and `waiting_on_part` — which are open but explicitly not being worked.

Public intake at `/report/:camp-slug` and, per location or asset, at `/l/:token`. That second URL
is one sticker serving two audiences: the location hub for a signed-in member, the public report
form for everyone else. Camps print the codes on Avery 5163 labels for cabin doors, bathhouses and
the fleet. A public reporter gets a receipt link and can see what happened.

### 2 · Pre/Post Camp — `/pre-post`
Opening and closing checklists, scheduled relative to opening day rather than to fixed dates.

- Tasks carry `days_relative_to_opening`; starting a new season resets them to pending and
  recomputes every due date.
- Surfaces pool and asset seasonal tasks alongside its own, so one list covers the shutdown.

### 3 · Safety & Compliance — `/safety`
Tabs: overview · fire · kitchen · drills · staff.

- Fire extinguishers, smoke/CO alarms and hood systems on inspection frequencies, with overdue
  surfaced before it lapses.
- Drills (fire evacuation, missing swimmer, lockdown, severe weather) logged with who ran them
  and response time.
- Kitchen temperature logs (walk-in, freezer, dish machine), am/pm.
- Staff certifications with expiry dates (lifeguard, CPR/AED, WSI, ServSafe).
- Licenses and permits with renewal dates.
- Exports a printable compliance report — the artifact handed to an inspector.

### 4 · Assets & Vehicles — `/assets`
Tabs: fleet · checked out · maintenance due · log.

- Vehicles, golf carts, utility vehicles, watercraft, trailers, equipment, technology.
- Checkout and return with fuel level and condition; odometer or engine-hours tracking.
- Service records and recurring maintenance schedules.
- Watercraft carry USCG registration and expiry, hull ID, capacity and lifejacket count.
- Registration and inspection expiry warnings.

### 5 · Building Systems — `/building`
Tabs: buildings · electrical · plumbing.

- Buildings → rooms → components, for electrical and plumbing.
- Panel schedules with breaker circuits mapped to what they actually control.
- Main water, gas and electrical shutoff locations per building — the thing somebody needs at
  2am with water coming through a ceiling.
- Winterization tasks per building.
- Buildings come from the camp's locations tree; this module does not create them.

### 6 · Kitchen Manager (Commissary) — `/commissary`
The largest module. Tabs: inventory · recipe guide · menu builder · allergy program ·
ordering · settings.

- Menu builder drives the order list: plan the week, and required quantities are derived from
  recipes and real session headcount, netted against what is on the shelf.
- Base-unit + pack-factor inventory model (buy in cases, count in pounds, cook in portions).
- Multi-vendor item pricing, order cutoffs, delivery days, minimums; CSV order-guide import.
- Purchase orders with snapshots, delivery received in packs.
- Camper and staff allergy program — the most sensitive data in the product, gated by its own
  RLS policy so it is visible only to admins and named health/kitchen staff.
- **Retreats mode:** a toggle that treats all concurrent rental groups as one combined kitchen,
  ordering off a shared pantry against structured retreat menus.

### 7 · Pool Manager — `/pool`
Tabs: chemical · equipment · inspections · seasonal.

- Chemical log (free chlorine, pH, alkalinity, cyanuric acid, calcium hardness, temperature)
  with in-range validation against built-in safe ranges.
- **AI test-strip scan:** photograph a strip with a phone and the reading is extracted by a
  vision model, checked and filed. Confidence threshold 0.65; below that a human confirms.
- Equipment with service history, recurring inspections, opening/closing checklists.
- Waterfront locations get a variant with no chemistry.

### 8 · Retreat Manager — `/retreats`
External group rentals — the only revenue-generating module. Now covers the whole funnel, not
just the stay:

- **Pipeline** — leads with a stage, a source, an owner and a next action. An enquiry may have no
  dates yet ("any weekend in October"); they become required the moment it is confirmed.
- **Proposals** — the document that wins the booking, accepted in the guest portal. `viewed_at`
  is the point: knowing they opened it on Tuesday changes the follow-up call.
- **Add-ons** — linens, boat rental, AV, campfire wood. Offered in the portal.
- **Program spaces** — the group picks meeting rooms per day and says how they want them set up.
  Approving one generates housekeeping work: a set-up *and* a strike.
- **Turnovers** — one work order per assigned room when a group departs.
- **Online payment** — Stripe Connect, so the money settles to the camp's own account.
- **Automated reminders** — an outbox that plans nightly and cancels anything whose condition
  stopped being true.
- **Rentals Review** — bed-nights sold against available, revenue, conversion, and what each group
  cost to host. Tabs: overview and costs are
season-wide; the rest require entering a specific retreat.

- Booking lifecycle across seven tracked phases: contract, deposit, headcount, housing, menu,
  COI, final invoice.
- Rate card with three pricing models (per person per night, per cabin per night, flat fee).
- Invoices with line items, discounts, and payment tracking; deposits and balances.
- **Guest portal** — see below.
- Rooming board: named guest roster placed into rooms, by the camp or by the group.
- Two-way requests between camp and group, on the booking rather than in an inbox.
- Post-stay feedback.

---

## The guest portal (public surface)

`/portal/:token` — the product's only customer-facing surface, used by the rental group's
coordinator. No account, no password: a private tokenised link.

- Checklist of everything the camp needs from them, in order.
- Sign the retreat agreement in-browser (ESIGN/UETA-shaped: intent, consent, attribution,
  association, retention).
- Confirm final headcount; the confirmed number then drives every financial figure.
- Build a named guest roster and sort those guests into rooms; mark rooming complete.
- View invoices and balance.
- Answer questions the camp raises, and raise their own.
- Leave feedback after departure.

**Security model:** the link alone opens dates, menu, checklist and headcount confirmation. The
private half — named roster, room assignments, invoices, the agreement — requires a one-time
code emailed to the coordinator address already on the retreat record. The session lasts 12
hours in sessionStorage. Links expire 14 days after departure.

---

## The seam

The two halves are one product because **a rental group's request becomes the property team's
work order.** A coordinator asks for the Lodge with three benches; the camp approves; a set-up
work order lands on the housekeeping lead's phone that morning, carrying the group's words
verbatim; they tap Done; the group walks into a set room, and the status travels back to their
portal without anyone retyping anything.

The same crossing runs the other way: a location taken out of service by a work order becomes
unbookable by a rental group, and a guest scanning the QR on their own door sign files into the
queue the crew is already working.

## Cross-cutting concepts

**Locations.** One nestable, categorised tree per camp — buildings, the rooms inside them, and
outdoor places. Every module points at it: an issue has a location, an asset has a home, a
retreat guest has a bed. Camp Info owns it; no module creates locations of its own.

**Team and permissions.** Two tiers.
- **Roles** `admin | staff | viewer`, enforced in the database.
- **Staff groups** (Maintenance, Kitchen, Aquatics…) layer per-module access on top, and also
  scope which tasks a person sees. Client-side gating; RLS knows roles, not modules.
- Joining is by email invitation bound to the invited address, or a 6-character join code.
  **Join codes cannot grant admin** — admin is email-invite only.

**Seasons and sessions.** A season has opening and closing dates that every countdown measures
against. Sessions carry camper and staff counts, which is what the kitchen orders against.

**Activity trails.** Records carry an append-only history of who changed what and when.

---

## Platforms

| | Coverage |
|---|---|
| **Web** (React/TS/Vite) | All eight modules, settings, admin console, guest portal, marketing site |
| **iOS** (SwiftUI) | Issues, Pre/Post checklists, Pool, Assets, Building, Home, Profile. **No Safety, Commissary or Retreats.** |

Both talk to the same Supabase backend. iOS is a field companion, not a full client: it exists
so a maintenance lead can log and close work while walking the property.

---

## Architecture

**Stack.** React 19 · TypeScript · Vite · Tailwind v3 · Zustand (13 stores, one per domain) ·
React Router v7. Supabase (Postgres, Auth, Realtime, Storage, Edge Functions). Deployed on
Vercel. SwiftUI for iOS.

**Size.** ~57k lines TS/TSX, ~15.5k lines Swift, 90 Postgres tables, 112 migrations, 6 edge
functions.

**Data layer.** `src/lib/db.ts` and its siblings are a hand-written typed access layer, not
generated: row↔camelCase mappers, `load*FromSupabase(campId)` bulk loaders, granular
non-throwing `dbAdd*/dbUpdate*/dbDelete*` writers, and `subscribeTo*` realtime subscriptions.
Writes are optimistic; a sync guard prevents a refetch from overwriting an in-flight save.

**Tenancy.** Tenant = camp. Every operational row carries `camp_id`, enforced by RLS through
`SECURITY DEFINER` helpers (`is_camp_member()`, `get_camp_role()`, `is_camp_admin()`).

**Edge functions.** `analyze-test-strip` (vision), `send-email`, and four serving the guest
portal (`portal-access-code`, `portal-signing-code`, `portal-document`, `portal-upload-coi`).

**Storage buckets.** `issue-photos`, `public-report-photos`, `strip-photos` (public);
`retreat-documents`, `commissary-files`, `implementation-files`, `location-imports` (private).

---

## Go-to-market

Sales-led, not self-serve. Self-serve signup is deliberately disabled.

- Account types: customer, trial, demo, internal.
- Founder platform-admin console at `/admin`, with seed-cloned demo camps.
- No-login demo links at `/try/:token`.
- Onboarding is white-glove: the camp sends their existing files and the CampCommand team loads
  the data. The client-facing checklist of what to send is at `/setup-guide`
  (`public/setup-guide.html`); files arrive through Camp Info → Setup Files.

---

## What it deliberately does not do

Worth stating plainly, because these are the assumptions people bring:

- **No camper registration or parent-facing anything.** Camper data arrives as an import for the
  allergy program only.
- **No billing or subscription management** for camps themselves. Retreat invoicing bills the
  camp's *rental customers*; it is not how CampCommand charges the camp.
- **No payments processing.** Invoices are generated and payments are recorded; money moves
  outside the product.
- **No payroll, scheduling or HR** beyond staff certifications.
- **No accounting integration.**
- **Offline mode is now partial on iOS.** A persisted mutation queue and a cached snapshot cover
  the actions a crew does while walking — closing a work order, commenting, ticking a checklist
  step. Pools, assets and building writes are still online-only.
- **Pool chemical target ranges are fixed in code**, not configurable per camp.

---

## Where things live

| | |
|---|---|
| Web app | `src/` — `pages/`, `components/<module>/`, `store/`, `lib/` |
| Data layer | `src/lib/db.ts`, `retreatsDb.ts`, `locationsDb.ts`, `commissaryDb.ts` |
| iOS | `ios/CampOps/` |
| Database | `supabase/migrations/` (chronological, never edited after apply) |
| Edge functions | `supabase/functions/` |
| Security & legal | `docs/SECURITY.md`, `docs/legal/` |
| Ops runbook | `docs/founder-runbook.md` |
| Go-to-market spec | `docs/production-restructure-spec.md` |
| Client setup checklist | `public/setup-guide.html` |
| Landing page design | `docs/design/landing-mockup.html` (design of record) |

Older specs at the repo root (`CampOps_MVP_Spec.md`, `CampOps_iOS_Spec.md`,
`CampOps_Commissary_Improvements_Spec.md`) predate the current product and describe a
single-tenant version. Treat them as history, not as a description of what ships.

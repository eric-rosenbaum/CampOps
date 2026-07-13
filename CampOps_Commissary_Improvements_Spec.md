# CampOps Commissary — Real-Camp Improvements Spec

*Status: proposal, no code written. Written 2026-07-12 after a domain pass on how camp food service actually operates. Companion to the shipped Commissary module (six tabs: Inventory, Menu, Recipes, Production, Allergy, Ordering).*

---

## 1. Framing: who uses this and what they actually need

The user of the Commissary module is **not the camp director** — it's the **food service director / head cook**, frequently seasonal, working off a tablet or a printout in a hot kitchen. Design decisions should favor that person: paper-friendly, fast, tolerant of incomplete data.

Three realities the current module doesn't fully honor:

1. **Per-diem is the north-star metric.** Camp food is usually the second-largest expense after payroll, and the number a director defends to the board is **cost per camper per day** against a budget (e.g. "$8.40 actual vs. $8.50 budgeted"). We have every input — prices, portions, session head counts, order history — and surface none of it. The original mock even had a "Finance → Cost tracker / Benchmarks" section we scoped out.

2. **Camps run on a repeating cycle menu, not weekly planning.** A director builds a 1–3 week rotation once (usually last year's, lightly edited) and repeats it all summer. Our builder makes them construct each week from scratch, which is backwards.

3. **The elegant demand math is aspirational; the reorder-and-count loop is the backbone.** Recipe → menu → scaled ingredient → order quantity only works if every recipe is fully entered, which most camps won't do. The daily reality is: walk the walk-in Sunday night, count key items, reorder what's low. The module should make *that* loop the hero and treat menu-demand as a bonus for organized camps.

### Guiding principles for everything below
- **Paper-first.** Anything a cook uses standing up should print cleanly.
- **Reorder + physical count is the default workflow;** menu-demand is secondary.
- **The health office owns allergy data;** the kitchen consumes a report. (Our health-access permission split already respects this.)
- **Support camp-level and population-level facts,** not only per-camper entry (a kosher camp is 100% kosher, not 220 checkboxes).
- **Never book fiction into inventory.** What you received ≠ what you ordered.

---

## 2. Change catalog

Each change: **Why → What changes (data / RPC / UI) → How it functions → Interactions → Effort (S/M/L).**

---

### 2.1 Per-diem food cost tracking — a new **Cost** tab  ★ highest value

**Why.** Per-diem is the metric camps adopt food software *for*. We can compute it from data we already hold. It's also the single most persuasive thing to show a director evaluating the module.

**What changes.**
- `commissary_sessions` gains:
  - `budget_per_person_per_day numeric` — the budgeted per-diem target.
  - `meals_per_day int default 3` — some camps count 3 meals, some 3 + 2 snacks; used for display, not math.
- New table `commissary_expenses` — costs that don't flow through a purchase order (cash produce runs, Costco trips, standing contracts):
  `id, camp_id, session_id (nullable), date, category (matches inventory categories), description, amount, created_by, created_at`.
- No change to POs beyond §2.2 (receiving actuals), which makes "actual spend" truthful.

**How it functions.** The Cost tab, for the active session (or a date range), shows two numbers that matter and their gap:
- **Actual per-diem** = (received-PO invoice totals in window + manual expenses) ÷ **people-days**, where people-days is the sum over each day of that day's head count (precise once §2.5 meal-level overrides exist; falls back to `camper_count + staff_count × days`). Shown against `budget_per_person_per_day` with a green/amber/red variance.
- **Forecast per-diem** = theoretical cost of the *planned menu* ÷ people-days, computed from recipe ingredient costs (item `unit_price` ÷ purchase pack → cost per base unit → scaled by portions). This lets a director catch an over-budget week *before cooking it*.
- A **where-the-money-goes** breakdown by category (protein/dairy/produce…) from PO line items.
- A trend line of weekly per-diem across the season.

**Interactions.** Depends on §2.2 (accurate actual spend) and §2.5 (accurate people-days). Recipe costs enable the forecast; camps without full recipes still get actual per-diem from POs.

**Effort: M.** One new table, two session columns, mostly read-side aggregation.

---

### 2.2 Receiving actuals — received ≠ ordered  ★ correctness

**Why.** "Mark received" currently books the full *ordered* quantity into stock. Real deliveries come short, substituted, or backordered, and the invoice price differs from the quote. Booking ordered-not-received silently drifts inventory from reality — the one thing inventory exists to track — and makes per-diem actuals wrong.

**What changes.**
- `purchase_order_lines` gains: `received_qty numeric` (null until received), `received_unit_price numeric` (actual invoice price), `received_note text` (substitution/backorder note).
- `purchase_orders` gains: `invoice_total numeric`, `invoice_number text`.
- `receive_purchase_order` RPC changes: book `COALESCE(received_qty, order_qty) × purchase_unit_in_base` per line into stock (via the existing `adjust_inventory_item`), and store the invoice total on the order. Same single-transaction guarantee as today.

**How it functions.** "Mark received" opens a **receiving screen** instead of firing immediately:
- Each line lists the ordered quantity, pre-filled as the received quantity. The receiver corrects any that came short/over/substituted, optionally enters the invoiced unit price, adds a per-line note ("subbed 80/20 for 85/15"), and enters the PO invoice number and total.
- On confirm: each line books its *received* quantity into stock; the PO records `invoice_total`; a discrepancy summary is shown ("3 lines short, 1 substituted, invoice $42 over quote") — useful for the vendor credit conversation.
- Per-diem's actual spend uses `invoice_total` when present, else the order total.

**Interactions.** Keeps inventory truthful; feeds accurate per-diem actuals.

**Effort: M.** RPC change, four columns, a receiving modal.

---

### 2.3 Cycle-menu templates — build the rotation once  ★ planning fit

**Why.** Camps repeat a fixed cycle menu; we force weekly re-entry with a "copy last week" crutch.

**What changes.**
- New tables:
  - `menu_templates` — `id, camp_id, name, length_weeks, notes, created_at, updated_at`.
  - `menu_template_entries` — `id, camp_id, template_id, week_number (1..length_weeks), day_index, meal_period, recipe_id (nullable), label (nullable), sort_order`. A session-free mirror of `menu_entries`.
- `menu_entries` optionally gains `source_template_id` for provenance. Otherwise unchanged — it remains the concrete per-session menu that drives demand, allergens, and production.

**How it functions.**
- A **Templates** view (a toggle within Menu builder) reuses the existing week grid to author a reusable cycle with no dates — just Week 1 / Week 2 / Day / Meal.
- On a session's Menu tab, **"Apply template"** picks a template and a starting week and fills the session's weeks by repeating the cycle (a 2-week cycle over a 4-week session → weeks 1, 2, 1, 2). It writes concrete `menu_entries` you then tweak per-session.
- **"Save week as / into template"** captures a good week back into a template.
- Editing a template does **not** retroactively rewrite already-applied sessions — they're independent copies, which is correct: you never want a running session's menu to change under the kitchen.

**Interactions.** Purely an authoring accelerator; everything downstream (demand, allergen conflicts, production) still reads `menu_entries` and is unchanged.

**Effort: M–L.** Two tables and an apply routine; the grid editor already exists, so mostly plumbing.

---

### 2.4 Camp-level & population dietary + substitution worklists

**Why.** Dietary is modeled only per-camper. But (a) many camps are **fully kosher/halal as a camp-level fact**, not 220 individual flags — the mock's own menu has Shabbat dinner and challah; and (b) vegetarian/vegan are **standing daily counts** that drive a parallel production line. And the artifact a line cook actually needs is a **plating worklist**, not a per-camper matrix.

**What changes.**
- Camp-level defaults: `camps` gains `dietary_defaults jsonb` (e.g. `{"kosher": true}`), meaning "the whole kitchen serves kosher" — no per-item flag needed.
- Population counts for camps that know the number but not the names: `commissary_diet_counts` — `id, camp_id, session_id, restriction, count`. Complements per-camper data; `camper_restrictions` stays authoritative when present, population count is the fallback input.
- Substitution worklist is **derived** (not stored), but snapshotted into production tasks at plan generation.

**How it functions.**
- Camp Settings / session: a "This kitchen serves fully kosher" toggle and standing dietary counts ("42 vegetarian, 8 vegan"). Kosher-as-default means the Allergy tab reads "whole camp: kosher" rather than flagging each meal.
- **Substitution worklist per meal** (in Production): for every meal with conflicts, the modifications to *plate* — "6 gluten-free grilled cheese · 42 vegetarian portions (no meat sauce) · 1 nut-free plate for Sarah M. (anaphylactic)." Names appear only for users with health access; counts appear for everyone. This is what ties the allergy program to actual cooking output.
- Optional: warn when a meal has a standing vegetarian count but no vegetarian component on the menu.

**Interactions.** Reads `camper_restrictions` + the new population counts; feeds Production; respects the existing health-access names-vs-counts split.

**Effort: M.** Settings additions, a counts table, worklist computation in Production.

---

### 2.5 Meal-level head-count overrides + trip / bag lunches

**Why.** One static count per session doesn't match reality: visiting day brings 300 for one lunch; 40 kids are off-site on a trip and need **bag lunches** instead of dinner; the first week is staff-only at a lower count. These swing quantities and per-diem.

**What changes.**
- New table `commissary_meal_events` — `id, camp_id, session_id, date, meal_period (nullable = whole day), kind ('override' | 'bag_lunch' | 'event'), count_mode ('absolute' | 'delta'), count, label, notes`. Absolute for "300 at visiting-day lunch"; delta for "−40 dinner (off-site)".

**How it functions.**
- A day/meal on the menu and production can carry an **event chip**. Scaling for that meal uses the override count instead of the session default.
- A **bag-lunch event** generates its own production task ("40 bag lunches: sandwich, chips, fruit, water"), optionally with a tiny dedicated menu.
- A per-session **events list** so the director sees at a glance: "Visiting day (+250 lunch) · Tue trip (−40 dinner, +40 bag lunch)."
- Per-diem people-days uses actual per-meal counts, so an off-site day correctly lowers the denominator.

**Interactions.** Feeds Production scaling and Cost (people-days). Touches the `portions()` path and plan generation.

**Effort: M.** One table plus scaling-override plumbing.

---

### 2.6 Physical-count workflow + printable count sheets  ★ high return, low cost

**Why.** Camps count weekly by walking storage; they don't decrement per meal. The realistic loop is count → reorder. The physical artifact is a clipboard sheet grouped by storage location.

**What changes.**
- No required schema change — reuses `inventory_items` and the existing `count_correction` adjustment reason.
- Optional `commissary_count_sessions` (`id, camp_id, date, counted_by`) to group a full count's adjustments for history.

**How it functions.**
- **"Do a count"** mode: a streamlined screen grouped by `storage_location` (Walk-in refrigerator, Freezer, Dry storage…), each item showing last-known on-hand and one input for the counted amount. Enter down the list; on submit, each changed item posts a `count_correction` adjustment to reconcile.
- **Printable count sheet**: a clipboard-friendly page grouped by storage location — columns *item · unit · reorder level · [blank to write count]*. Walk the walk-in with paper, then key it in. This is the daily/weekly ritual artifact.
- After a count, "below reorder level" is fresh and reorder-based ordering (already built) is the natural next click.

**Interactions.** Makes reorder-based ordering the backbone; the printout bridges the physical count.

**Effort: S–M.** Reuses adjust logic plus a print template.

---

### 2.7 Printable production sheet, menu, and thaw/pull list

**Why.** The kitchen runs on paper taped to the wall; we only print orders today.

**What changes.**
- No schema change. `production_tasks` already snapshot scaled quantities. The thaw list derives from tomorrow's linked recipes whose ingredients are stored in the freezer (`item.storage_location = 'walk_in_freezer'`).

**How it functions.**
- **Print production plan** for a day: meal-by-meal task sheet with scaled quantities and the §2.4 substitution worklist — the cook's sheet. Reuses the existing `orderToPrintHtml` pattern.
- **Print menu**: the weekly grid as a posted menu for the dining hall / parents. Camps post menus publicly; near-free given the grid exists.
- **Thaw / pull list**: "tonight, pull for tomorrow" — a checkbox list of freezer items and quantities needed for tomorrow's production, derived from the plan × freezer-stored ingredients.

**Interactions.** Reads Production plans + inventory `storage_location`.

**Effort: S–M.** Print templates plus one derived list.

---

### 2.8 Health-department compliance strip (Safety integration)

**Why.** Food-service compliance is a legal requirement and camps get inspected. The relevant data already lives in the **Safety** module — health permit (`safety_licenses`), food-handler certs (`safety_staff` + `staff_certifications`), and walk-in/freezer temperatures (`safety_temp_logs`, already logged am/pm with `in_range`). The kitchen shouldn't have to leave Commissary to see it, and the walk-in it logs temps for is *physically the same box* the inventory sits in.

**What changes.**
- No new core tables. Optional `commissary_storage_map` (`camp_id, storage_location, safety_item_id`) to tie a storage location to the Safety temp-logged unit.
- Read-only aggregation across modules.

**How it functions.**
- A **compliance strip** on a Commissary overview: health permit status + expiry, count of kitchen staff with current food-handler certs (expiring-soon flagged), and current walk-in/freezer temp status from Safety's latest log.
- **At-risk linkage**: if a walk-in logged out-of-range overnight (from Safety), flag the inventory in that storage location — "Walk-in was 47°F for 6h; review dairy/protein held there." This is the genuinely camp-specific cross-module value nobody else would build.
- No duplicate entry — Commissary reads Safety; logging still happens in Safety (optionally with quick-log shortcuts).

**Interactions.** Reads `safety_licenses`, `staff_certifications`, `safety_temp_logs`; optional storage→temp-item map.

**Effort: M.** Cross-module reads plus the at-risk rule.

---

## 3. Two cross-cutting reframes (small, do alongside)

- **Ordering defaults to reorder-level, not menu-demand.** Flip the default `orderSource` to `'par'` and present menu-demand as the secondary option. Matches how camps actually decide what to buy. Effort: **S.**
- **Health-data provenance.** Extend the camper CSV importer with **column presets for common camp-health-system exports** (CampMinder, CampDoc field names) and position the roster as nurse-maintained rather than hand-entered. Reinforces "the health office owns this." Effort: **S.**

---

## 4. Suggested phasing

**Phase A — make it real and correct (backbone).**
Receiving actuals (§2.2) · Per-diem Cost tab (§2.1) · Physical-count sheet (§2.6) · ordering-default flip (§3). These four turn the module from a well-built demo into something a food director would run the season on.

**Phase B — fit their planning.**
Cycle-menu templates (§2.3) · meal-level overrides & bag lunches (§2.5).

**Phase C — kitchen execution & compliance.**
Production/menu/thaw printing (§2.7) · substitution worklists + camp-level/population dietary (§2.4) · Safety compliance strip (§2.8) · health-system CSV presets (§3).

---

## 5. Deliberately NOT doing

- **Full recipe-costing accounting or GL/QuickBooks integration** — per-diem is the useful abstraction; accounting is a different product.
- **Real EDI / vendor-portal ordering** — keep CSV / print / email. Camps key orders into the distributor's own portal or email a PO.
- **Per-meal live inventory decrement** — camps count, they don't decrement. The count workflow (§2.6) is the correct model.
- **Nutritional / calorie analysis** — out of scope unless a camp specifically asks.

---

## 6. Data-model delta summary

New tables: `commissary_expenses`, `menu_templates`, `menu_template_entries`, `commissary_diet_counts`, `commissary_meal_events`, `commissary_count_sessions` (optional), `commissary_storage_map` (optional).
Altered tables: `commissary_sessions` (+`budget_per_person_per_day`, +`meals_per_day`), `purchase_orders` (+`invoice_total`, +`invoice_number`), `purchase_order_lines` (+`received_qty`, +`received_unit_price`, +`received_note`), `camps` (+`dietary_defaults`), `menu_entries` (+`source_template_id`, optional).
Altered RPC: `receive_purchase_order` (book received, not ordered).

All new tables follow the established pattern: `camp_id` + `is_camp_member` SELECT / staff-manage RLS + `REPLICA IDENTITY FULL` + realtime, and split into the existing subscription-domain structure in `db.ts`. Camper-adjacent data (none here) would use the health-access policy; everything above is standard staff-managed.

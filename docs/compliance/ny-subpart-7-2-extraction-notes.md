# Extraction notes — 10 NYCRR Subpart 7-2 (Children's Camps)

Source: Cornell LII, fetched 2026-08-29 with a browser User-Agent. All 25 sections
(`10-NYCRR-7-2.1` … `10-NYCRR-7-2.25`) were downloaded and converted to plain text.
Every section shows the same amendment stamp: NY State Register June 22, 2016 / Vol.
XXXVIII Issue 25, effective 6/22/2016. Cornell notes "no prior version found" for the
comparison view, so this is the current quarterly text as published there.

Output: 78 rows in `ny_state_requirements.json`.

---

## Sections read in full vs. skimmed

**Read in full (every subdivision, used as the basis for rows):**

| Section | Title | Rows |
|---|---|---|
| 7-2.4 | Permit | 4 |
| 7-2.5 | Personnel, supervision and camp safety plan | 19 |
| 7-2.6 | Potable water | 7 |
| 7-2.7 | Sewage | 2 |
| 7-2.8 | Medical requirements | 8 |
| 7-2.10 | Transportation | 4 |
| 7-2.11 | Recreational safety | 13 |
| 7-2.18 | Fire safety | 6 |
| 7-2.19 | Food service | 1 |
| 7-2.25 | Campers with disabilities | 10 |

**Read in full but used only for context (no rows, or rows folded elsewhere):**

- **7-2.1 Enforcement / public health hazards.** Excluded per instruction (enforcement
  procedure). It is still the single most useful cross-check in the Subpart: subdivision
  (b)(2) lists 28 conditions that are automatic public health hazards, and every one of
  them maps back to an obligation captured here. If the product ever wants a severity
  score, that list is the natural source.
- **7-2.2 Definitions** and **7-2.3 Applicability.** Excluded (definitions). Note 7-2.3
  matters commercially: the Subpart only applies to camps of 10+ children and carves out
  stays of 72 consecutive hours or less, day camps running fewer than 5 days in any
  two-week period, OCFS-licensed child care, single-purpose athletic programs, accredited
  college programs, school-district instruction, and classroom programs whose recreation
  is a recess period of an hour or less. That is an eligibility gate, not a requirement.
- **7-2.24 Variance and waiver.** Excluded per instruction.

**Skimmed (short sections; included only where a record results):**

- **7-2.9 Toilets, privies, lavatories, showers** → 1 row (NY-0901). Fixture ratios and
  shower temperature are things an inspector counts and measures.
- **7-2.12 Construction** → no rows. One-time build requirements (Uniform Code compliance,
  summer camp cabin exemptions, architect certification before occupancy). The 60-day
  pre-construction notice is a record but is a construction filing, so excluded per brief.
- **7-2.13 Location; grounds** → no rows. Siting standard, no recurring record.
- **7-2.14 Housing maintenance** → no rows. Absorbed into general facility condition.
- **7-2.15 Heat, light, ventilation** → no rows; the "no unvented fossil fuel heaters"
  prohibition was folded into NY-1806 (fire).
- **7-2.16 Sleeping quarters** → 1 row (NY-1601, weekly linens + bunk safety). Floor-area
  and clear-height rules in (c)–(e) are construction standards and were dropped.
  Subdivision (f) (adult counselor on every sleeping level) duplicates 7-2.5(c)(1)(ii) and
  was folded into NY-0508.
- **7-2.17 Electrical safety** → no rows. One sentence, no record; the plan's electrical
  safety topic is covered by NY-0516.
- **7-2.20 Hazardous materials** → 1 row (NY-2001).
- **7-2.21 / 7-2.22 / 7-2.23 Vermin, weeds, refuse** → merged into 1 row (NY-2101).

---

## Every `needs_verification` row and why

| req_code | Why |
|---|---|
| **NY-0502** — director register clearance + conviction statement | The regulation states these as qualifications for appointment but never says how often they must be repeated. I set `on_event`; in practice permit-issuing officials commonly want them refreshed for each season and for each new director. Confirm local practice before showing a renewal date. |
| **NY-0603** — total coliform sampling cadence | 7-2.6(f)(1) is garbled in the published text: "at least one additional sample collected from each water source during the operating season. For those children's camps operating more than 30 days in a calendar year. Total coliform samples shall be collected for each month the camp is in operation." The sentence fragment leaves it ambiguous whether the monthly rule replaces or supplements the pre-season and in-season samples. I encoded the stricter reading (`monthly`) with both baseline samples described in the summary. Needs a read against the official NYSDOH text. |
| **NY-1110** — program equipment inspection | 7-2.11(f)(2) says "inspected by the camp operator at frequent intervals." No interval is defined, so `ongoing` is my inference. A camp will want to pick a defensible cadence (weekly is common) rather than rely on the text. |
| **NY-1804** — fire equipment inspection + extinguisher tagging | Two obligations with different cadences merged into one row. Extinguisher tagging is unambiguously pre-season (`annual`). "Regular inspection of all fire protection facilities and equipment" in 7-2.18(b)(5) has no stated interval. The row's frequency reflects the extinguisher half only. |
| **NY-1901** — food service | 7-2.19 is two sentences and delegates entirely to Part 14, which I did not fetch. The obligation to comply is certain; the specific evidence (cooking/holding/cooler temperature logs, food protection certificate, inspection report) is inferred from what Part 14 food service establishments normally keep. The nutritional-adequacy clause in (b) has no defined standard or record at all. |
| **NY-2508 / NY-2509 / NY-2510** — Justice Center regime | These come from 7-2.25 **subdivision (b)**, which applies only to *camps for children with developmental disabilities* as defined in 7-2.2 — a narrower class than "camps that enrol a camper with a disability" (subdivision (a)). The `applies_when` schema has no key for that narrower class, so all three are flagged `enrolls_campers_with_disabilities: true`, which **over-fires**. See the schema-gap section below. The underlying obligations themselves are unambiguous in the text. |

Everything else is marked `verified`: I read the subdivision, and the duty and its cadence
are stated plainly.

---

## Things in the regulation that did not fit the schema

**1. `applies_when` cannot express OR, and has no key for "camp has any swimming".**
Aquatics obligations (7-2.5(e)–(g), 7-2.11(a)) apply if the camp runs *either* a pool *or*
a bathing beach. I tagged them `{"has_pool": true}`, which under-fires for a lakefront-only
camp. Rows affected: **NY-0510, NY-0511, NY-1101, NY-1102, NY-1103, NY-1104**. These should
be evaluated as `has_pool OR has_waterfront`. Rows that are genuinely beach/open-water only
(NY-1106 wilderness swimming, NY-1112 boats) are tagged `has_waterfront`.

**2. No key for "camp for children with developmental disabilities".** As above, NY-2508
through NY-2510 need a narrower flag than the one available. Consider adding
`is_developmental_disability_camp`.

**3. `water_source` enum is `"well" | "public"`, but 7-2.6 recognises three cases:**
on-site groundwater, on-site *surface* water (or groundwater under surface influence, which
requires filtration plus 99.9% giardia / 99.99% virus removal), and off-site public supply.
Surface-water treatment is described inside NY-0601 but the row is tagged `"well"`. Also
note 7-2.6(b): a camp on an off-site public supply must still do the annual start-up
disinfection (NY-0602) **when the permit-issuing official requires it**, and must comply
with subdivisions (i)–(n) regardless — my `water_source: "well"` tags on NY-0602 and NY-0606
under-fire in that case.

**4. `frequency` enum has no "every two weeks".** NY-2506 (in-service seizure/aspiration
training for aquatic staff at camps serving campers with developmental disabilities) is
explicitly a two-week cycle in 7-2.25(a)(3)(iv). Encoded as `ongoing` with the interval
spelled out in the summary and evidence hint.

**5. Obligations the state places on *itself*, not the camp** — captured nowhere, but worth
knowing for product copy: the camp must be **inspected twice yearly** (stated in 7-2.5(p)(2),
which the camp has to disclose to families — that is NY-0519), and the permit-issuing
official may substitute a certified camp self-inspection for one site visit under
7-2.4(d)(2)(ii). I dropped the self-inspection as a row because it only exists when the
official elects it; if the product wants it, it is `permit` / `inspection` / `annual` /
`needs_verification`.

**6. Deliberate consolidations.** A strictly one-row-per-sentence reading of this Subpart
yields roughly 110 distinct duties; the brief asked for 45–75. I merged where a single
record proves several sentences at once and split wherever the evidence differs. The most
aggressive merges, in case you want them broken back out:

- **NY-0515** bundles the safety plan's personnel section, facility section and
  general/activity-safety section (7-2.5(n)(1), (2), (5)) with the staff-qualification
  records duty (7-2.5(l)).
- **NY-0518** bundles staff training (n)(6) and camper orientation (n)(7) — two separate
  attendance records.
- **NY-1102** bundles swimmer/non-swimmer zoning with all waterfront physical condition
  items (fencing, guard station, rescue gear, decking, depth markings, diving boards).
- **NY-1105** bundles trip-swim permission slips, venue permitting/pre-arrangement, and
  trip aquatic staffing ratios — three different documents.
- **NY-1107 / NY-1108 / NY-1109** each collapse a whole activity subdivision (riflery,
  archery, horseback) into one row covering range setup, supervision ratio and equipment
  storage.
- **NY-2101** collapses three separate sections (7-2.21, 7-2.22, 7-2.23).

**7. `has_challenge_course` is never used.** Ropes and challenge courses appear in the
regulation only once, in the list of activities that the safety plan's general/activity
safety section must address (7-2.5(n)(5)). There is no standalone challenge-course
standard in Subpart 7-2, so it is covered by NY-0515 rather than its own row. If the
product wants a challenge-course-specific item, it would be a plan-section row, not a
regulatory standard.

**8. Reporting deadlines worth surfacing as a group.** The Subpart has four separate
24-hour clocks (fires — NY-0516; serious injury/illness/abuse — NY-0808; positive water
samples and water supply incidents — NY-0605; victim notification at DD camps — NY-2509),
plus 48 hours for witness notification, 45 days for corrective action plans, 90 days for
implementing them, and 10 days after month-end for water reports.

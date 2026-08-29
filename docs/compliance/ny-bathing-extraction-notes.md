# Extraction notes: 10 NYCRR Subpart 6-1 (Swimming Pools) and Subpart 6-2 (Bathing Beaches)

Source: Cornell LII, fetched 2026-08-29 with a browser User-Agent. All 31 sections of
Subpart 6-1 (`10-NYCRR-6-1.1` … `10-NYCRR-6-1.31`) and all 20 of Subpart 6-2
(`10-NYCRR-6-2.1` … `10-NYCRR-6-2.20`) were downloaded and converted to plain text
from the `statereg-text` block of each page, so what was read is the rule body and not
the surrounding navigation. `regs.health.ny.gov` returns 403 to automated requests and
was not used.

Output: 64 rows in `supabase/migrations/20260831100000_compliance_seed_ny_bathing.sql`
across two new profiles, plus 24 `compliance_plan_templates` rows and 6
`compliance_authority_forms` rows.

| Profile | Requirements | Source |
|---|---|---|
| NY-POOL | 36 | 10 NYCRR Subpart 6-1, swimming pools |
| NY-BEACH | 28 | 10 NYCRR Subpart 6-2, bathing beaches |

---

## The finding that changed the shape of this seed

**A children's camp does not file a separate bathing facility permit.** 6-1.3(b) and
6-2.3(b) both say the permit section (6-1.5, 6-2.5) does *not* apply to a pool or beach
maintained and operated in connection with a temporary residence or a children's camp
subject to Subpart 7-1 or 7-2. The Westchester paperwork matches: the children's camp
application checks off "Children's Camp Swimming Pool" / "Children's Camp Bathing Beach"
and the bathing facility rides along with the camp permit, while the separate WCDOH
Bathing Facility Original Application exists for facilities permitted on their own.

So there is no `POOL-` or `BEACH-` permit row, and the 30-day filing clocks in 6-1.5(b)
and 6-2.5(b) are not seeded as deadlines. Everything else in both Subparts still binds a
camp with water. Getting this wrong in either direction would have been expensive: seeding
the permit invents a filing the camp does not owe, and dropping the rest would repeat the
gap this work exists to close.

---

## Sections read in full vs. skimmed

### Subpart 6-1

**Read in full and used as the basis for rows:**

| Section | Title | Rows |
|---|---|---|
| 6-1.7 | Injury and illness incident reporting | 1 |
| 6-1.8 | Approval of plans | 1 |
| 6-1.9 | Construction compliance certificate | 1 |
| 6-1.10 | Pool operation | 4 |
| 6-1.11 | Treatment | 5 |
| 6-1.13 | Sewage system | 1 |
| 6-1.15 | Bathhouse and toilet facilities | 1 |
| 6-1.16 | Fencing | 1 |
| 6-1.17 | Lighting and electrical requirements | 2 |
| 6-1.19 | Water quality | 3 |
| 6-1.20 | Maximum permissible bather use | 1 |
| 6-1.21 | Operator and operating records | 2 |
| 6-1.22 | Inspections | 1 |
| 6-1.23 | Supervision | 9 |
| 6-1.24 | General requirements | 1 |
| 6-1.25 | Spa pools | 1 |
| 6-1.31 | Aquatic supervisory skill requirements | folded into POOL-2302 |

**Read in full, no rows:**

- **6-1.1 Purpose**, **6-1.2 Definitions**, **6-1.3 Application**. Definitions 6-1.2(l)
  (qualified pool water treatment operator) and 6-1.2(n) (supervising lifeguard) are
  quoted inside POOL-2101 and POOL-2304 rather than given rows of their own. 6-1.3 is the
  eligibility gate described above.
- **6-1.4 Enforcement.** Excluded as enforcement procedure, matching how 7-2.1 was handled.
  It is still the best cross-check in the Subpart: 6-1.4(b) lists 17 conditions that are
  automatic public health hazards, and all but one map back to a row seeded here. The
  exception is (b)(4), an unapproved or contaminated potable water source, which is covered
  by the camp's own water rows NY-0601 through NY-0607. Those mappings are named in the
  evidence hints, because a camp reading "this one closes the pool" treats it differently.
- **6-1.6 Variance and waivers.** Excluded, matching 7-2.24.
- **6-1.29 Swimming pool design standards** and **6-1.30 Saturation index.** Roughly 400
  lines of construction geometry and a water-balance formula. They are the standard the
  county reviews plans against, not a recurring duty, so they are cited from POOL-0801,
  POOL-1004, POOL-1902, POOL-2001 and POOL-2308 rather than seeded.

**Skimmed, no rows, with the reason:**

- **6-1.12 Water supply** ("meets Part 5"). The camp's drinking water is already covered by
  NY-0601 through NY-0607. Seeding it again would show a camp two rows for one duty and
  count it twice in the denominator.
- **6-1.14 Garbage; refuse.** One sentence, already covered by NY-2101.
- **6-1.18 Ventilation.** One sentence, "adequately ventilated, either by natural or
  mechanical means", indoor pools only. No record results. Same treatment as 7-2.15.
- **6-1.26 Special-purpose pools** and **6-1.27 Movable-bottom pools.** Both are one
  sentence pointing at 6-1.29 design items. Construction standards for pool types a
  children's camp does not have.
- **6-1.28 White-water slides.** A white-water slide under 6-1.2(d) is a starting platform,
  flumes and a plunge pool, a waterpark structure rather than a camp waterslide. There is
  no setup answer that identifies one, and seeding it against `has_pool` would fire on
  every camp with a pool. Deck slides, which camps do have, are covered by POOL-2401.
- **6-1.24(a) Care of suits and towels.** Only bites where the operator furnishes or rents
  suits and towels. Left out of the pool rows for want of an answer key; it is folded into
  BEACH-1301 where the equivalent 6-2.13(f) sits inside a section that was being seeded
  anyway.

### Subpart 6-2

**Read in full and used as the basis for rows:**

| Section | Title | Rows |
|---|---|---|
| 6-2.7 | Injury and illness incident reporting | 1 |
| 6-2.8 | Approval of plans | 1 |
| 6-2.9 | Construction compliance certificate | 1 |
| 6-2.10 | Approved bathing waters | 2 |
| 6-2.13 | Bathhouse and toilet facilities | 1 |
| 6-2.14 | Operator responsibility | folded into BEACH-1401 |
| 6-2.15 | Water quality monitoring | 3 |
| 6-2.16 | Control of beach and water use | 5 |
| 6-2.17 | Supervision, personnel and equipment | 12 |
| 6-2.18 | Operator and operating records | 2 |
| 6-2.20 | Aquatic supervisory skill requirements | folded into BEACH-1702 |

**Read in full, no rows:** 6-2.1 Purpose, 6-2.2 Definitions (6-2.2(b) sanitary survey,
6-2.2(h) supervising lifeguard and 6-2.2(i) PAD programme are quoted inside BEACH-1001,
BEACH-1706 and BEACH-1712), 6-2.3 Application, 6-2.4 Enforcement, 6-2.6 Variance and
waivers, 6-2.19 Bathing beach design standards.

**Skimmed, no rows:** 6-2.11 Water supply and 6-2.12 Garbage; refuse, for the same
double-counting reason as their 6-1 twins.

---

## Every `needs_verification` row and why

Six of the 64. In every case the duty itself is plain in the text and what is uncertain is
the cadence, which is the field a camp plans a season on.

| req_code | Why |
|---|---|
| **POOL-1701**: certificate of electrical compliance | 6-1.17(g) says "operators of *existing* pools shall possess a certificate of electrical compliance with the Uniform Code issued by the New York Board of Fire Underwriters or equivalent certifying agency." Two things are unstated: what "existing" means now that the Subpart is nearly forty years old, and whether the certificate ever has to be renewed. Encoded as `once`. A county that wants it re-issued after electrical work will say so. |
| **POOL-1902**: alkalinity and saturation index | 6-1.19(c)(2) states the 80 to 120 mg/l alkalinity band as a continuous duty. 6-1.19(c)(3) makes the saturation index conditional: the permit-issuing official *may* require it "monthly or at any other frequency required to maintain pool clarity, proper disinfection, alkalinity, and pH levels." `monthly` is the stricter reading of a conditional rule, not a stated cadence. Confirm with the county before showing a camp a monthly due date. |
| **POOL-2101**: pool operator and qualified treatment operator | 6-1.21(b) required the qualified operator "within one year of the effective date of this section [March 30, 1988]" and says nothing about renewal, and 6-1.2(l) accepts either a NYSDOH Type A or B course or "an adequate course of instruction" with no expiry. `annual` reflects that a camp changes staff every season, not the regulation. |
| **POOL-2201**: most recent inspection report available at the pool | 6-1.22 requires the report to be on hand but names no interval, because the interval belongs to the county's inspection schedule and not to the camp. `annual` is our inference. |
| **BEACH-1001**: sanitary survey | 6-2.10(a)(1) states the survey as a condition of an approved bathing water and 6-2.2(b) defines what it covers, but neither names an interval. `annual` is our inference. In practice counties treat the survey as a pre-season item and re-run it after a watershed change; confirm locally before showing a renewal date. |
| **BEACH-1501**: bathing water sampling | 6-2.15(b) explicitly delegates the cadence: sampling follows "the frequency, locations and procedures specified by the permit-issuing official." The duty is certain, the schedule is unknowable from the text. Encoded `ongoing` with no deadline. A camp has to get its sampling schedule from its county, and the product should say that rather than invent a number. |

Everything else is marked `verified`: the subdivision was read and the duty and its cadence
are stated plainly.

---

## What the engine actually reads, and what it deliberately does not

`evidence_rule` was assigned only where the filter genuinely identifies this requirement's
own evidence, following the three tests in `20260829190000_compliance_inspection_rules.sql`.
Four rows out of 64 carry a filter.

**`pool_log`, POOL-1102 only.** `pool_chemical_readings` records free chlorine, pH and
alkalinity, which is exactly the log 6-1.11(c)(5) demands ("tests shall be conducted and
recorded for pH and free and total chlorine or bromine residual at the beginning, during,
and at the end of each swimming period"). No second row claims `pool_log`, so two
requirements never report the same number. NY-1103 used to read this table and was retyped
to `document` in 20260829190000, so the branch was free.

POOL-1902 (alkalinity between 80 and 120) is the row that could have been a second
`pool_log` and deliberately is not. The readings do carry alkalinity, but the engine's
`pool_log` branch counts rows without looking at values, so a second row would report the
identical "N readings this season" and claim that having a log proves the numbers were in
range. It takes the document path instead.

**`certification`, POOL-2302 and BEACH-1702**, both `{"cert_types": ["lifeguard"]}`.
This is the same filter NY-0511 already owns, and that is correct rather than a collision:
one lifeguard certificate is genuine evidence for the camp code duty in 7-2.5(g) and for
the Part 6 duty in 6-1.23(a)(3) and 6-2.17(a)(3), because they are one fact stated by two
regulators. The no-collision test in the inspection-rules migration allows exactly this
("unless they truly read the same evidence").

There is no `cert_type` for a pool water treatment operator, so POOL-2101 takes the
document path rather than being mapped onto `other`, following the NY-0513 riflery
precedent. Same for the ocean surf beach AED training in BEACH-1712, which is role-scoped
to one Level I guard and would be falsely satisfied by any two counsellors' CPR cards.

**`inspection`, BEACH-1708 only**, `{"categories": ["water"], "types":
["waterfront_check"]}`. `waterfront_check` is a type the app already offers, defaults to
daily, and files under the `water` category, and it is literally the daily beachfront check
that 6-2.17(a)(10)(ii) describes. Nothing else claims it. Two things to know about this
choice:

- Assigning a filter **removes the document path**. A camp that keeps a paper beachfront
  log and no register item will read as missing until it adds one. That is the same
  trade-off NY-1802 accepted for smoke alarms, and it is acceptable here because the type
  is specific rather than a grab-bag; it was the reason NY-1110 was left unfiltered.
- Staging currently holds `safety_items.type = 'rescue_equipment'` and
  `'fire_extinguisher'`, neither of which is in the `SafetyItemType` union in
  `src/lib/types.ts`. That is the same seed drift already recorded for `cert_type` ('cpr')
  and `drill_type` ('fire'). It does not affect this filter, since no staging row uses any
  waterfront type, but it is worth normalising.

**The other 16 `inspection` rows carry no filter on purpose** and take the document path.
The two that were closest, and the reasons they were rejected:

- **POOL-2308 and BEACH-1710, the lifesaving equipment rows.** Both would resolve to the
  `water` category's rescue gear, and the register cannot say whether a rescue tube belongs
  to the pool or the lake. At a camp with both, one set of gear would satisfy both rows.
  Worse, the engine reports satisfied on a count above zero, so a single rescue tube on
  file would read as proof of a first aid kit, a pocket mask, a 15-foot reaching pole, a
  spine board and an elevated lifeguard chair, none of which the register holds.
- **POOL-1002, POOL-1601, POOL-1702, BEACH-1605.** Depth markings, fence height and latch
  height, GFCI protection and overhead wire clearance, dock depth signage. All are
  physical-plant standards an inspector measures once a season, not a register of items
  with recurring due dates. They fail the shape test.

**`plan_section`, four rows**, each scoped to `BATHING_*` categories so a DOH-2040 camp
plan section can never be counted as a bathing plan section, and vice versa. POOL-2310 and
BEACH-1703 take organisation and injury prevention; POOL-2311 and BEACH-1704 take the
emergency plan. The split follows the regulation's own sentence: the plan must consist of
"procedures for daily bather supervision, injury prevention; reacting to emergencies,
injuries, and other incidents, providing first aid and summoning help."

POOL-2310 and BEACH-1703 share a filter, as do POOL-2311 and BEACH-1704. DOH-2286 is one
checklist covering both kinds of facility, so a camp with a pool and a lake writes one plan
and both rows read it. That is the same evidence for the same document, not two rows
claiming each other's work.

---

## The deadlines that are real

Nothing in either Subpart is measured from a camp's opening day, so no row uses
`relative_to_opening` or `fixed`. All eleven deadlines are `{"note": …}`, which produces no
due date and changes no behaviour, because forcing any of them into a date would be wrong.

| Rows | Deadline |
|---|---|
| POOL-0701, BEACH-0701 | 24 hours from the incident to report it to the county. Two separate clocks, 6-1.7 and 6-2.7, both started by an event rather than by the season. |
| POOL-0801, BEACH-0801 | Plan approval in hand before installation, construction, addition or modification starts. |
| POOL-0901, BEACH-0901 | Construction compliance certificate filed before the public uses new facilities or equipment. |
| POOL-2102, BEACH-1801 | Each completed daily record kept at the facility for 12 months. The retention clock runs per sheet, so there is no single date. |
| POOL-1103 | DPD reagents no more than one year old, measured from each bottle's own date. |
| POOL-1104 | The self-contained breathing apparatus checked monthly, measured from the previous check. |
| POOL-2501 | Spa superchlorinated to 10 mg/l at least weekly while out of use, and drained and cleaned at least every two weeks. |

Deadlines found and deliberately **not** seeded:

- **30 days before opening or before permit expiry** to apply for a bathing facility permit
  (6-1.5(b), 6-2.5(b)). Does not apply to a camp; see the top of this file.
- **15 days** to be heard after a facility is placarded, and **two working days** for the
  county to re-inspect once the hazard is cleared (6-1.4(a)(3), (4) and 6-2.4(a)(3), (4)).
  Enforcement procedure, and both clocks are the county's, not the camp's.
- **15 days' written notice before changing supervision level** (6-1.23(a)(1)(i),
  6-2.17(a)(1)(i)). This one is easy to seed by mistake. It applies to a pool or beach that
  is part of a *temporary residence or campground* as defined in Part 7. A children's camp
  is Subpart 7-2, which is neither, so paragraph (a)(1) does not reach it and the camp's
  level is set by (a)(2) instead. Not a camp duty.

---

## Things in the regulation that did not fit the schema

**1. There is no answer key for gas chlorination, for a spa, or for an ocean beach.**
Four rows over-fire as a result and rely on the camp marking them not applicable, which the
engine honours ahead of every evaluator:

- **POOL-1104** chlorine gas handling fires for every camp with a pool, including the
  majority that dose with tablets or liquid.
- **POOL-2501** spa pools fires for every camp with a pool, including those with no spa.
- **BEACH-1711** the 500-bather emergency care building fires for every waterfront.
- **BEACH-1712** the ocean surf beach PAD programme fires for every waterfront, including
  a lake in the Catskills.

Each label opens with the condition ("If you disinfect with chlorine gas…", "If your beach
is an ocean surf beach…") and each hint ends by telling the camp to mark it not applicable.
That is honest but it is a worse experience than a question would be. Candidate keys:
`pool_disinfectant` (gas / hypochlorite / bromine), `has_spa`, `waterfront_type`
(lake / river / ocean).

**2. The supervision level is not asked, and four rows turn on it.** POOL-2306, POOL-2307,
BEACH-1708 and BEACH-1709 are all Supervision Level IV rules, which only apply at an
unguarded shallow facility. The level itself is determined by measurable facts the camp
knows (depth, surface area, distance from shore, presence of diving boards), so this could
be derived rather than asked. A `supervision_level` answer would also let POOL-2303,
POOL-2304, BEACH-1705, BEACH-1706 and BEACH-1710 state the right staffing numbers instead
of listing all of them.

**3. `frequency` has no fortnightly option.** 6-1.25(d) requires a spa to be drained and
cleaned at least once every two weeks. POOL-2501 carries `weekly` for the superchlorination
duty and records the fortnightly one in `deadline_rule.note`. This is the second time this
gap has come up; NY-2506 hit it in the camp code.

**4. The two `CATEGORY_LABEL` maps do not know the new plan categories.**
`src/components/compliance/PlanBuilder.tsx` and `src/lib/compliance/exportPacket.ts` each
hold a hard-coded map of the eight DOH-2040 category codes, falling back to the raw code
when a category is unknown. The three new ones will render as `BATHING_ORGANIZATION`,
`BATHING_INJURY_PREVENTION` and `BATHING_EMERGENCY_PLAN` on screen and in the export until
those maps gain entries. They were left alone deliberately: this change is data, and
touching them was out of scope. **Both maps need three lines each before this ships to a
camp.** Suggested wording: "Bathing facility: organisation", "Bathing facility: injury
prevention", "Bathing facility: emergency plan".

**5. Deliberate consolidations.** A strictly one-duty-per-sentence reading of the two
Subparts yields well over 120 rows. Merges were made where one record proves several
sentences at once. The most aggressive, in case you want them split back out:

- **POOL-1105** bundles chemical approval, the cyanuric acid prohibition, calcium
  hypochlorite storage, container labelling and the plan-approved addition method.
- **POOL-1702** bundles the whole of 6-1.17 apart from the compliance certificate: GFCI,
  defect repair, portable devices, glare, underwater and surface lighting, emergency
  lighting and overhead wire clearance.
- **POOL-2308 and BEACH-1710** each bundle the full lifesaving equipment list for every
  supervision level with the lifeguard chair requirement, and BEACH-1710 adds patrol boats
  and offshore stations.
- **BEACH-1603** collapses five separate prohibitions from 6-2.16 (motor vehicles, boating
  and fishing in the bathing area, night and thunderstorm bathing, plug-in electrics within
  20 feet, glass containers) into one posted-rules row.
- **BEACH-1401** merges 6-2.14's five operator responsibilities with 6-2.18(a)'s competent
  operator requirement, because both are proved by naming the person.

**6. `holds_personal_records` is set on two rows**, POOL-0701 and BEACH-0701. The incident
logbook names the bather who was hurt or fell ill and what happened to them, which is
somebody else's health record, and it belongs where the camp keeps its medical records
rather than in a general document store beside an Upload button. The county inspects the
logbook where it lives.

POOL-2305 and BEACH-1707, the on-site file of lifeguard certificates, are deliberately
**not** flagged even though they name individuals. Those the camp should hold in the
platform, in the staff register, which is exactly where qualification records belong.
Flagging them would tell a camp not to do the thing the product is for, and it would break
the `cert_types` filter on POOL-2302 and BEACH-1702 that reads the same register.

---

## Forms

Six added under WESTCHESTER-DOH, because the county is who receives them even though NYSDOH
publishes four of them. All six were downloaded and opened before being recorded; the
`health.ny.gov` files need a `Referer` header or the host returns 403.

| Designation | Title | Revision | Bundled | Verified by |
|---|---|---|---|---|
| DOH-1323 | Report on Operation of Swimming Pool | (10/04) | `/forms/ny/doh-1323.pdf` | Text extraction, 2 pp, footer reads "DOH-1323 (10/04)". |
| DOH-2287 | Daily Report on Beach Operation | (5/04) | `/forms/ny/doh-2287.pdf` | Text extraction, 2 pp, footer reads "DOH-2287 (5/04)". |
| DOH-1309 | Engineering Report for Swimming Pool Plans | (1/93) | `/forms/ny/doh-1309.pdf` | Scanned, no text layer. Rendered page 1 to PNG and read it: title "Engineering Report for Swimming Pool Plans", "Design Compliance with Subpart 6-1", footer "DOH-1309 (1/93) Page 1 of 4". |
| DOH-2436 | Engineering Report for Bathing Beaches | (1/16) | `/forms/ny/doh-2436.pdf` | Text extraction, 2 pp, footer reads "DOH-2436 (1/16)". |
| (none) | Original Permit to Operate a Bathing Facility, application package | 2025 | `/forms/ny/wcdoh-bathing-facility-application.pdf` | Text extraction, 7 pp. Confirmed as the WCDOH bathing facility packet, not the camp one. |
| (none) | Certification that Bathing Facility Safety Plans Are Up-To-Date | 2025 | `/forms/ny/wcdoh-bathing-plan-certification.pdf` | Text extraction, 2 pp. Carries separate signature blocks citing 6-1.23(c) and 6-2.17(c). |

Nothing was left unbundled: all six retrieved cleanly. Two carry an `obtain_note` anyway,
because being able to download a form is not the same as owing it:

- The **bathing facility application** is for a facility permitted separately from the
  camp. A camp pool or beach normally rides on the children's camp permit, so a camp that
  files this one has probably misread the packet. The note says so.
- The **safety plan certification** is a substitute for resubmitting the plan when nothing
  about the facility, its personnel or its procedures has changed since last season. It is
  useful, and it is not a form a camp files by default.

DOH-2286, the Pool and Beach Safety Plan Checklist, was already bundled and already
recorded under this authority. This seed does not touch that row; it uses the 24 components
off its field map as the plan templates.

The two engineering reports (DOH-1309, DOH-2436) are marked `fillable = false` and carry a
note saying the camp's engineer or architect prepares them, because they are not documents
a camp fills in itself and the product should not offer to.

`public/forms/ny/SOURCES.md` has an appended section recording provenance for the six new
PDFs, in the same shape as the rows already there. That file's opening claim is that every
file in the directory is an unmodified official download with its source recorded, and
adding six files without adding six rows would have made it untrue.

# Compliance home base — build spec

What it takes to turn `compliance-home-base.html` into the real module. Written 2026-08-31.

Reference material this depends on:
`westchester-obligation-map.md` (every obligation, §12 = what the platform stores today) ·
`packet-contents-survey.md` (all 70 packet pages) · `product-strategy.md` (why) ·
`sources/` (409 source files, hashed).

**Scope note.** The module already exists and does a great deal: 155 requirements, a working
evidence engine, DOH-367 and DOH-367a filled from live data, packet export, a plan builder. This
spec is the delta — what is missing, wrong, or needs reshaping to become the home base.

---

## 0 · Principles that constrain every decision below

Carry these into code review; they are the module's existing posture and they are why it can be
trusted.

1. **Never claim compliance.** Report what is recorded and what is not. The permit-issuing
   official's reading is the only one that counts.
2. **Evidence must be evidence for *that* requirement.** A branch that cannot identify its own
   evidence counts none of it. Fail closed.
3. **Applicability is three-valued.** yes / no / **unknown**. "We never asked" is never rendered
   as "does not apply".
4. **One scoped set.** Every count on screen derives from `scopedRequirements()` and
   `applicableQuestions(..., activeFormCodes())`, or the page contradicts itself.
5. **Never store personal screening data.** Record *that a check was run and when*. Never the
   result, the household, the address history, the criminal record or a card number.
6. **Every claim carries a source.** No requirement, form or deadline ships without a resolvable
   citation URL and a retrieval date.

---

## 1 · Data model

### 1.1 New tables

**`compliance_incidents`** — the largest gap. There is no incident table anywhere in the platform,
against a 24-hour statutory clock and eight forms.

```
id, camp_id, season_id,
occurred_at timestamptz, discovered_at timestamptz,
kind text,                       -- injury | illness_outbreak | abuse_allegation | fire |
                                 -- multiple_victim | rabies_exposure | epinephrine |
                                 -- vaccine_preventable | water_contamination | other
subject text,                    -- camper | staff | volunteer | visitor  (NO name)
form_code text,                  -- DOH-61a, DOH-61b, NYS-61, NYS-61h, DOH-61e …
reportable boolean,              -- computed against 7-2.8(d)
report_due_at timestamptz,       -- discovered_at + 24h, or 'immediate'
reported_at timestamptz, reported_to text, reported_by text, report_method text,
narrative text,                  -- what happened, no identifying detail
location_id uuid, follow_up text, closed_at timestamptz,
created_by, created_at, updated_at
```

- **No camper or staff name.** The medical log with names stays in the health office; this table
  proves *that a reportable incident was reported on time*, which is what an inspector asks.
- `reportable` is computed, not typed: death · resuscitation · hospital admission (not ER) ·
  epinephrine · eye/head/neck/spine referral · fracture or dislocation · sutures, staples or glue ·
  2nd/3rd degree burns ≥5% · rabies exposure · abuse allegation · suspected water-, food- or
  air-borne illness. Staff injuries only at death/resuscitation/admission.
- Justice Center camps (`is_dd_camp`) additionally need `investigation_started_at` (≤5 business
  days), `written_report_at` (≤45 days), `corrective_plan_at` (≤45 days),
  `corrective_implemented_at` (≤90 days).

**`compliance_screenings`** — the dates, never the results.

```
id, camp_id, season_id, staff_id (→ safety_staff),
kind text,          -- dcjs_sor | nsopw | scr_ldss3370 | justice_center_sel | reference_check
performed_on date, method text,     -- fax | mail | email | telephone | portal
reference_id text,                  -- DCJS screener ID for phone screenings
cleared boolean,                    -- the operator's own attestation, not a stored result
expires_on date,                    -- performed_on + 1 year for annual checks
recorded_by, created_at
```

> `cleared` is deliberately a boolean attestation, not a stored registry response. The response
> letter stays in the camp's files. RLS mirrors `safety_staff`: column-level revoke plus an
> admin-only RPC.

**`compliance_trainings`** — attendance, which DOH-2040 requires twice as a plan component.

```
id, camp_id, season_id, staff_id, kind text,   -- orientation | mandated_reporter |
                                               -- code_of_conduct | activity_specific | camper_orientation
title text, delivered_on date, delivered_by text, minutes int,
acknowledged_on date,     -- Justice Center code of conduct, annually, documented
created_by, created_at
```

**`compliance_permits`** — or extend `safety_licenses`, which already has the right shape and is
simply unwired. **Preference: extend it**, and connect it to the engine.

```
alter table safety_licenses add column
  authority_id uuid references compliance_authorities(id),
  requirement_code text,
  posted_location text,          -- 7-2.4: "posted in a conspicuous place"
  renewal_due_on date,           -- county: 60 days before expiry, a different clock
  fee_cents int, fee_paid_on date;
```
Existing `license_type` already includes `health_permit`, `food_service`, `boating`,
`aca_accreditation`. Add `bathing_facility`, `water_system`, `animal_facility`,
`amusement_device`.

**`compliance_insurance`**

```
id, camp_id, season_id, kind text,     -- workers_comp | disability | amusement_device_liability |
                                       -- general_liability
carrier text, policy_number text, form_code text,   -- C-105.2, U-26.3, DB-120.1, CE-200 …
per_occurrence_cents bigint, aggregate_cents bigint,
effective_on date, expires_on date, document_id uuid, created_at
```
Amusement devices need **≥$1,000,000 per occurrence** proved to the LHD annually before use.

**`compliance_source_versions`** — makes "What's new" computable rather than remembered.

```
id, source_key text,          -- 'wcdoh.camp_packet', 'ch873', 'subpart_7_2', 'doh-367' …
url text, kind text,          -- regulation | form | packet | guidance
sha256 text, retrieved_at timestamptz, effective_date date,
archived_path text,           -- our copy in the compliance-forms bucket
supersedes uuid, change_summary text, affects jsonb,   -- which req_codes / applies_when
created_at
```

### 1.2 Columns on existing tables

```
-- provenance, so no claim ships unsourced (principle 6)
alter table compliance_requirements
  add column source_url text,           -- already has citation_url; add:
  add column source_checked_on date,
  add column source_version_id uuid references compliance_source_versions(id);

alter table compliance_authority_forms
  add column source_url_stable boolean default true,   -- false = URL carries a date, use our copy
  add column source_checked_on date;

-- the certificate copy an inspector asks for
alter table staff_certifications
  add column document_id uuid references compliance_documents(id),
  add column verified_on date, add column verified_by text;   -- ACA "skills verification"

-- link the two notions of staff (§12.2)
alter table camp_members add column safety_staff_id uuid references safety_staff(id);

-- working papers, for anyone 14–17
alter table safety_staff
  add column employment_certificate_on_file boolean,
  add column employment_certificate_type text,   -- blue (14–15) | green (16–17)
  add column hired_on date, add column first_day_on date;
```

### 1.3 Catalog content to add

| Work | Detail |
|---|---|
| **Article XVIII requirements** | Six county duties: workshop attendance, two references, nonswimmer identification, off-site ratios ×2, and the repealed §1803 recorded as repealed |
| **Article XII requirements** | AED + collaborative agreement, qualified pool treatment operator, §1203 signage and 911 phone, spray features |
| **County SOR extension** | NSOPW search, and "persons who frequent the camp" |
| **Amusement device cycle** | Annual third-party inspection, PE plans filed, $1M insurance, DOL permit for motorized devices, immediate serious-injury report to DOL |
| **County permits** | Food service (21 days ahead, displayed to consumer), water system (operator, daily records, monthly filing), animal facility, public function |
| **7-2.12 construction chain** | 60-day notice, plan approval before start, PE certificate before occupancy |
| **7-2.4 annual affirmation** | The written affirmation owed in any year the plan is not updated |
| **Three state forms** | DOH-3915, DOH-2135, DOH-2249 added to `compliance_authority_forms` |
| **Eight incident forms** | Added as a new `is_incident_form` class, not part of the packet |
| **Source URLs + hashes** | For all 155 requirements and 22+ documents, from `sources/` |

---

## 2 · Engine

1. **Implement the missing evidence branches.** Today seven of fourteen `evidence_type` values
   compute: `certification, inspection, drill, temp_log, pool_log, asset_expiry, plan_section`.
   Add **`screening`** (from `compliance_screenings`, with expiry), **`training`** (from
   `compliance_trainings`), **`water_sample`**, and **`attestation`** (an explicit dated
   attestation rather than silence).
2. **Shrink the `document` bucket.** 67 of 155 requirements resolve to "upload a file". Every one
   moved to a computed branch is a form field a camp never fills. Target the people-shaped ones
   first — they are the highest volume.
3. **Per-person requirements.** The engine is per-camp-per-season. Screenings, references, working
   papers and training are **per person**. Either add a `subject_scope` (`camp` | `staff`) to
   requirements with roll-up status, or compute an aggregate (`35 of 47`) into `detail`. The
   aggregate is cheaper and matches the mockup; the per-person view then reads
   `compliance_screenings` directly.
4. **Deadline rules for the new cadences.** `deadline_rule` must express: *N days before opening*
   (exists), *N days before permit expiry*, *before first day of employment*, *annually before
   arrival*, *within 24 hours of discovery*, *before first use each season*, *monthly, 10 days
   after month end*.
5. **Recompute triggers.** Any write to the new tables recomputes, as the safety dialogs already do.

---

## 3 · UI — six tabs inside the existing Compliance page

The page already has the horizontal tab bar. Replace the current tabs with:

**Overview** — counts (apply / missing / needs an answer / checked on site), permit-gate cards,
four tiles, the deadline list, the "who is asking" grid. Reuses `activeAuthorities()`.

**Requirements** — replaces "Your records". Grouped by authority, filter chips, one row per
requirement: code, title, status chip, due date, **source link**. Keeps the existing
`RequirementList` behaviour and adds the citation link.

**Forms** — new. Four groups: forms we fill (Filled / Blank), forms the camp obtains, incident
forms, monthly reports. Blank PDFs come from the `compliance-forms` bucket, which already exists
and is public. "Download packet" is the existing `exportCompliancePacket`.

**Staff clearance** — new. Per-person table: registry check date, references count, working
papers, certifications with expiry, day-one verdict. `Import roster` (CSV, and later an
integration) and `Export DOH-367a`. Personal columns via the existing
`get_camp_staff_personal()` RPC — admin only.

**Inspection** — new. Four groups in the order an inspector asks, each row present/missing with a
date. Print stylesheet for the paper fallback. Later: a findings → owner → evidence → cleared
workflow, which is where the county's self-inspection form belongs once we obtain it.

**What's new** — new. Reads `compliance_source_versions`, filtered to the camp's own
`applies_when`. Each entry: date, what changed, which requirements it touches, source link.

**Safety plan** stays where it is, but rebuilt — see §4.

---

## 4 · The safety plan rebuild

The state publishes a **92-question fill-in-the-blank template** in six sections, ten
activity-specific plans and an appendix checklist, and offers it as an **alternative to DOH-2040**.
Our builder mirrors DOH-2040's 76-row grid, which is a checklist for a plan that already exists.

- Re-seed `compliance_plan_templates` from the template's 92 questions, keeping `form_row_key` so
  DOH-2040 still prints page numbers for camps that file it that way.
- Question types: short text, choice, multi-choice, and the guidance text inline — most answers
  are ticks, not essays.
- Activity plans gated on setup answers: a camp with no horses never sees the riding plan.
- Appendix checklist, including the **PAD collaborative agreement** now that the county requires an
  AED.
- One-click **annual affirmation** for a year with no changes (7-2.4(c)(1)).

---

## 5 · Non-functional

**Permissions.** Compliance is already gated by `staff_groups.modules`. Screenings and the staff
tab are **admin-only**, matching `get_camp_staff_personal()`. Incidents should be writable by the
health director role.

**Audit.** `audit_log` already records `view_camper_health` and `export_data`. Add
`view_staff_personal`, `record_screening`, `file_incident_report`.

**Retention.** `compliance_exports.purge_after` is +90 days. Incidents and screenings are
compliance records — keep for the statutory period, not 90 days.

**Liability.** `ScopeNote` stays on every screen that shows a count. No screen may render a
percentage of compliance.

**Public buckets.** `issue-photos`, `public-report-photos`, `strip-photos` are world-readable.
Unrelated to the permit, but a compliance product should fix it.

---

## 6 · Sequencing

**Phase 1 — the map is the product.** Catalog content (Article XVIII + XII, county SOR, permits,
amusement devices), source URLs on all 155, Overview + Requirements + Forms tabs. *A camp can see
everything it owes and download every form.* This alone is sellable.

**Phase 2 — people.** `compliance_screenings`, `compliance_trainings`, staff columns, the
`screening`/`training` engine branches, Staff clearance tab, roster import. *The highest-volume
surface, and the one an inspector opens first.*

**Phase 3 — the day itself.** `compliance_incidents` with the 24-hour clock and the eight forms;
Inspection tab with the print pack.

**Phase 4 — the year.** `compliance_source_versions`, the watcher, What's new, permits and
insurance wired to renewal dates.

**Phase 5 — the plan.** Rebuild on the 92-question template. **Built.**

The builder wrote against DOH-2040, which is the *reviewer's* checklist — what a sanitarian ticks
off while reading a plan. The document a camp fills in is the Children's Camp Safety Plan
template: 92 numbered questions in six sections, mostly checkboxes, with skip logic.

- `src/lib/compliance/planTemplate.ts` carries the 92 questions and the 11 activity addenda.
  It is **generated** from the state's own `.docx` by `scripts/build-plan-template.py`; do not
  hand-edit it. It lives in code rather than Postgres because it is identical for every camp and
  changes only when NYSDOH reissues the template.
- The state's numbering is preserved verbatim, and it is what verified the extraction: the
  template cross-references itself ("Complete questions 14-15", "the standards listed above in
  numbers 75–77") and those references land on exactly the right questions.
- Skip logic is derived from the document's own "Complete questions A-B" phrasing, not hand-coded.
  Seven questions are gated; a camp is asked 85 until it answers a gate.
- Answers live in `camp_plan_answers`, one row per answered question. An answer emptied back out
  is deleted, so `planIsWritten` cannot be tripped by clicking into a box and back off.
- `planIsWritten` / `planSourceOf` / the packet / DOH-367 readiness all now count a template answer
  as a written plan, so the rule that the plan only ships when the camp actually wrote or uploaded
  one still holds.
- DOH-2040 stays, collapsed, as the reviewer view: requirements still cite its section codes as
  evidence (WC-22 → ACT-07).

Still open here: the rendered plan PDF is still generated from the DOH-2040 sections, not from the
92 answers. A camp that answers the template gets its answers stored and counted but the generated
document has not been rebuilt on them yet.

---

## 7 · Decisions still open

1. **Do we hold the roster at all?** If a camp runs CampMinder, importing beats duplicating.
   Certification tracking is table stakes and overlapped; the regulator layer on top is not. This
   changes whether Staff clearance is a system of record or a view over an import.
2. **Per-person requirements in the engine, or aggregate-only?** Affects the shape of
   `camp_requirement_status`.
3. **Extend `safety_licenses` or create `compliance_permits`?** Extending keeps one permit register
   but couples compliance to the safety module.
4. **Who can file an incident?** Health directors are often not app users today — `camp_members`
   and `safety_staff` are unlinked.
5. **How is the source watcher run?** A cron in Supabase, or a job in CI that opens a PR when a
   hash moves. The second gives a human review step, which this data deserves.
6. **County questions blocking full coverage** (from the obligation map §8): does Westchester want
   DOH-3915 alongside its own application; where does a camp get the self-inspection form; is there
   a camp fee determination schedule; does the county permit camp stables and petting zoos.


---

## 8 · Review pass, 2026-09-01

Four page-level reworks and four bug fixes, from a walkthrough of the built module.

**Requirements — organised by when, not by whether we can track it.** 159 rules, only 17 of them
printed on a form; the rest is the regulation. A flat list treated a reference corpus as a to-do
list. Now banded by *when a director deals with it* — Before you open / While you run / If it
happens / Checked on site — with search, category chips, and "Outstanding only" on by default.
The on-site band is never filtered by status: there is no artifact to put on record, so hiding
them by status would quietly delete the half of the regulation a sanitarian actually walks.

**Inspection — a rehearsal, not another list.** Excludes the permit package (12 Westchester rules
posted to the county in spring; a sanitarian asks for none of them) and `on_event` rules
(construction approvals). The 12 identical "Submit with the permit package" hints were a *filing*
instruction, so that fact moved to a new `compliance_requirements.in_permit_package` flag and each
hint now names the artifact. Cards lay out as masonry so a short group leaves no hole. Print
builds a standalone clipboard sheet with tick boxes rather than `window.print()` on the app, which
was printing the sidebar and nav.

**Hand-off — packet assembly.** New `EnvelopePanel`: Westchester's application checklist in their
order, each item marked *we fill DOH-xxx* or *you obtain*, with a ready count. The per-form list
and the zip downloads stay below it.

**Staff — three ways in, because no camp hand-types sixty people.**
- `src/lib/staffImport.ts` + `StaffImportModal`: paste or upload a CSV from CampMinder, CampBrain
  or a spreadsheet. RFC4180 parsing (quoted commas, embedded newlines, tabs from Excel), header
  auto-detection shown back as editable dropdowns, and a preview naming every skipped row. Columns
  that look like background-check results or SSNs are refused outright and cannot be mapped. A row
  with no name is the only hard failure — an unreadable date warns and imports blank rather than
  costing the camp the person, and is never guessed at.
- `staff_intake_links` + `/staff-intake/:token`: one link the camp sends to everyone, so each
  person fills in the fields no roster export carries (date of birth, education, experience).
  Two SECURITY DEFINER RPCs are the only public surface; the accepted fields are fixed in the RPC,
  not chosen by the caller. Submissions queue for an admin — a public link that wrote straight to
  the roster would be an unauthenticated door into camp data.
- Manual add, which was broken: `AddStaffModal` opens off a store flag and the staff page raised
  the flag without rendering the modal.

**Staff moved into Camp Info as a tab.** It is reference data every module reads; its own sidebar
entry made one consumer look like the owner. `/settings/staff` redirects.

**Also fixed:** raw `head_neck_spine` codes rendering in the incident log instead of 7-2.8(d)'s
wording; Hand-off offering a "Filled" download beside a 16% coverage bar (forms with no readiness
model fell through to the `Filled` branch); four dead references to a "Your records" tab that no
longer exists.

**Note on verification:** `tsc --noEmit` checks nothing in this repo — `tsconfig.json` is
solution-style (`"files": []` plus references). Use `tsc -b`. A `can('manageCompliance')` typo, a
permission key that does not exist, passed `--noEmit` and white-screened the app at runtime.

# New York permit packet — form field inventory

What the platform fills today, what it could fill from data it already holds, and what it must
start collecting so the packet comes out of the machine finished rather than half-typed.

Scope: the five coordinate maps in `src/lib/compliance/forms/ny/*.map.json` — **1,228 mapped
fields** across DOH-367, DOH-367a, DOH-2040, DOH-2271 and DOH-2286. Counts below were produced
by classifying every key in every map, not by sampling. Schema claims were checked against the
staging database (project `mvxnpofopbmljzpgnycg`), not against `types.ts`.

Written 2026-08-29.

---

## 1 · Per-form summary

| Form | Total fields | Filled today | Reviewer-owned | Structurally unfillable | Derivable | **Must collect** |
|---|---:|---:|---:|---:|---:|---:|
| DOH-367  Facility & Camp Description   | 280 | 20 | 0 | 0 | 74 | **186** |
| DOH-367a Additional Staff Qualifications | 262 | 8 | 0 | 0 | 188 | **66** |
| DOH-2040 Written Plan Checklist        | 474 | 169 | 236 | 45 | 18 | **6** |
| DOH-2271 Director Certified Statement  | 44 | 1 | 0 | 0 | 4 | **39** |
| DOH-2286 Pool & Beach Safety Checklist | 168 | 6 | 87 | 0 | 1 | **74** |
| **Total** | **1,228** | **204** | **323** | **45** | **285** | **371** |

A fifth bucket appears above that the brief did not ask for, and it exists because
`isReviewerOwned()` conflates two different things — see §2.2. "Structurally unfillable" is
DOH-2040's pre-shaded N/A column: those cells belong to the camp, but the form's own
instructions forbid answering N/A on those rows, so nobody may draw in them, ever.

**Camp-owned denominator** (what a finished packet actually needs): 1,228 − 323 reviewer − 45
unfillable = **860 fields**. Of those, 204 are filled today (24%), 285 more are derivable
without asking anyone a question (33%), and **371 must be collected (43%)**.

The 371 raw cells are *not* 371 questions. The maps split every date into three cells and every
checklist row into two or three tick-boxes, so a human answering the whole packet answers about
**105 questions plus one table** — see §6.

---

## 2 · Bucket (b): reviewer-owned — does `campOwnedOnly()` catch everything?

### 2.1 The rule is complete for these five maps

`isReviewerOwned()` fires on `disabled === true`, `_lhd_` in the key, a `_remarks` suffix, or
membership of `REVIEWER_ONLY_KEYS`. Every genuinely health-department-owned field in all five
maps is caught. Verified by scanning the non-disabled fields of every map for a label or note
mentioning "office use", "Local Health Department", "reviewer" — the only two hits are
`plan_review_by` and `plan_review_date` on DOH-2286, which are exactly the two keys
`REVIEWER_ONLY_KEYS` names. **No misses.**

Two things are worth recording because they make the rule look narrower than it is:

* DOH-2040's footer keys are `lhd_reviewed_by_1`, `lhd_approved_2_yes` and so on. They **start**
  with `lhd_` and so do *not* contain `_lhd_`. They are caught only because the map also marks
  them `disabled`. If a future map author forgets `disabled` on a similar key, the rule silently
  lets it through. Recommend widening to `key.startsWith('lhd_') || key.includes('_lhd_')`.
* DOH-2286's `office_signature`, `office_title`, `office_date_reviewed`, `plan_acceptable`,
  `plan_unacceptable`, `modification_line_1..4` and `unacceptable_reason_line_1..4` are likewise
  caught only by `disabled`.

### 2.2 The rule over-fires on 45 DOH-2040 cells, and this is a real bug in `coverage()`

45 `row_*_na` cells on DOH-2040 are `disabled` because the form pre-shades them grey — the item
must be addressed and cannot be answered N/A. They belong to the **camp's** column, not the
reviewer's. `isReviewerOwned()` returns true for them, which is the right *outcome* (they can
never be drawn) reached by the wrong *reason*. Two consequences:

1. The name lies. A reader of `coverage()` believes 236+45 = 281 DOH-2040 cells belong to the
   health department. Only 236 do.
2. The denominator happens to be right by luck. If someone ever "fixes" `isReviewerOwned()` to
   check ownership properly, DOH-2040's coverage will drop by 45 fields with no code change to
   the filler.

Recommend splitting the predicate into `isReviewerOwned()` and `isUnfillable()`, subtracting
both from the denominator, and saying so in the comment.

---

## 3 · Bucket (c): DERIVABLE — 285 fields the platform already holds

Ordered by size of the win. Every table.column below was confirmed against the live schema.

### 3.1 DOH-367a certification tables — 162 fields (the single biggest win in the document)

`staff_certifications` holds `provider`, `cert_name`, `issued_date`, `cert_type` and joins
`safety_staff` for `name`. That is exactly the shape of all three DOH-367a tables. Confirmed
present on the pilot camp: 5 certification rows carrying `provider = 'American Red Cross'` and
real `issued_date`s.

| Form fields | Rows × cols | Source |
|---|---|---|
| `lifeguard_row{1..11}_staff_name` | 11 | `safety_staff.name` via `staff_certifications.cert_type='lifeguard'` |
| `lifeguard_row{N}_lifeguarding_provider_course_title` | 11 | `staff_certifications.provider` + `.cert_name` |
| `lifeguard_row{N}_lifeguarding_issue_date_{month,day,year}` | 33 | `staff_certifications.issued_date` |
| `lifeguard_row{N}_cpr_provider_course_title` | 11 | same row's `cert_type='cpr_aed'` sibling |
| `lifeguard_row{N}_cpr_issue_date_{month,day,year}` | 33 | `staff_certifications.issued_date` |
| `first_aid_cpr_staff_row{1..7}_*` (name, both providers, both dates) | 56 | same three columns, `cert_type='first_aid'` / `'cpr_aed'` |
| `psi_row{1..3}_{staff_name,provider,course_title,issue_date_*}` | 18 | `cert_type='wsi'` |

Only the **dates of birth** in those tables are missing (57 cells) — see §4.

### 3.2 DOH-367 certification blocks — 40 fields

| Form fields | Source |
|---|---|
| `cert_cpr_{course_provider,course_title,issue_date_*}` (5) | `staff_certifications` where `staff_id` = the health director and `cert_type='cpr_aed'`: `.provider`, `.cert_name`, `.issued_date` |
| `cert_first_aid_{course_provider,course_title,issue_date_*}` (5) | same, `cert_type='first_aid'` |
| `cert_cpr_staff_health_director`, `cert_first_aid_staff_health_director` (2) | existence of the above row, joined `safety_staff.title ~ /health director/i` |
| `aq_cert_lifeguarding_*` (5) | aquatics director's `cert_type='lifeguard'` row |
| `aq_cert_cpr_*` (5) | aquatics director's `cert_type='cpr_aed'` row |
| `aq_cert_first_aid_*` (5) | aquatics director's `cert_type='first_aid'` row |
| `aq_cert_progressive_swimming_instructor_*` (5) | aquatics director's `cert_type='wsi'` row |
| `aq_cert_lifeguard_supervision_management_*` (5) | aquatics director's `cert_type='other'` row, matched on `cert_name` |
| `riflery_instructor_{name,certification,date_issued_*}` (5, DOH-367a) | `safety_staff` title match + that person's `cert_type='other'` row |

Caveat on the last two: `CertType` has no `psi`/`lifeguard_supervision` member, so both fall
into `'other'` and must be disambiguated on `cert_name`. Worth adding the two enum values.

### 3.3 DOH-367 session table — 30 fields

| Form fields | Source |
|---|---|
| `session_{1..10}_number_of_days` (10) | `commissary_sessions.start_date` / `.end_date` |
| `session_{N}_type_day`, `session_{N}_type_overnight` (20) | `camp_compliance_answers.value where key='camp_type'` — camp-wide, so only correct for a camp that does not mix |

Health warning: `commissary_sessions` has **no `season_id`** (only `camp_id`), and the pilot camp
has **zero rows**. Treat this as a prefill hint, not a source of truth. See §5.3.

### 3.4 DOH-2040 — 18 fields blocked by an ampersand

`planChecklistValues()` matches map rows by normalising `category` + `title` through
`s.toLowerCase().replace(/[^a-z0-9]+/g,'_')`. Seven of the 76 plan templates contain `&` or a
comma, which normalises to a *single* underscore; the map author spelled the same conjunction
out as `and`. The keys never meet, and the rows print blank on a camp that has completed those
sections.

| Plan template | Normalises to | Map key wants |
|---|---|---|
| FIRE_SAFETY / Alarm System **&** Smoke Detectors | `alarm_system_smoke_detectors` | `alarm_system_and_smoke_detectors` |
| FIRE_SAFETY / Exits **&** Exit Signs | `exits_exit_signs` | `exits_and_exit_signs` |
| MEDICAL_PLAN / Illness, Injury **&** Abuse Reporting | `illness_injury_abuse_reporting` | `illness_injury_and_abuse_reporting` |
| ACTIVITIES_SUPERVISION / Off-Site **&** Wilderness Swimming | `off_site_wilderness_swimming` | `off_site_and_wilderness_swimming` |
| STAFF_TRAINING / Child Abuse Recognition **&** Reporting | `child_abuse_recognition_reporting` | `child_abuse_recognition_and_reporting` |
| CAMPER_ORIENTATION / Reporting of Illness **&** Injury Incidents | `reporting_of_illness_injury_incidents` | `reporting_of_illness_and_injury_incidents` |
| CAMPER_ORIENTATION / Fire Drills **&** Evacuation | `fire_drills_evacuation` | `fire_drills_and_evacuation` |

17 cells (7 rows × yes/na/page as each row provides them) plus `completed_by_date`. **Fix:
normalise `&` to `and` on both sides before slugifying**, or seed a `form_row_key` column on
`compliance_plan_templates` so the join is explicit rather than fuzzy. The second is better: a
fuzzy join between curated data and a curated coordinate map is a bug waiting to recur every
time a title is edited.

Arithmetic, for the record: the form has 76 camp-owned rows and `compliance_plan_templates`
has 76 rows. 68 currently match. Seven fail on the ampersand. One template,
`ACTIVITIES_SUPERVISION / Waterfront Swimming Supervision`, has no DOH-2040 row at all — that
is correct, it is a section the platform adds rather than one the state's checklist lists — and
one form row, `row_blank_write_in`, is the state's blank write-in line with no template. 68 + 7
+ 1 = 76.

### 3.5 Filing facts and dates — 35 fields

| Form fields | Source |
|---|---|
| `operator_signature_date_*` (367, 367a), `signature_date_*` (2271), `facility_operator_date` (2286), `completed_by_date` (2040) — 11 | generation date, exactly as `headerValues()` already does for `date_month/day/year` |
| `certification_print_name` (2271) — 1 | `safety_staff.name` where `title ~ /director/i` — the same `byTitle()` lookup `FormsPanel` already performs for `director_name` |
| `safety_plan_attached`, `safety_plan_update_attached`, `facility_mods_list_attached`, `camp_trips_list_attached` (367) — 4 | the export manifest. `exportPacket.ts` builds the envelope and therefore knows what is in it; asking the camp is asking them to describe our own output |

### 3.6 Two header fields that are wired but never populated

Not a classification bucket, but it changes what a camp actually sees:

* **`facility_code`** — `headerValues()` reads `camp.facilityCode`, and `FormsPanel.tsx:60-70`
  never sets it. The NYS facility code prints blank on both DOH-367 and DOH-367a on every
  packet. There is no column for it anywhere in the schema. This is a MUST COLLECT masquerading
  as a filled field.
* **`county`** — hardcoded to the string `'Westchester'` in `FormsPanel.tsx:62`, while the setup
  interview already stores the real answer in `camp_compliance_answers` under `key='county'`.

---

## 4 · Bucket (d): MUST COLLECT — the full list, grouped

371 fields. Groups are ordered as a human would work through them.

### A · Sessions and last season's attendance — 121 fields (DOH-367)

`session_{1..10}_age_{1_to_5,6_and_7,8_to_12,13_to_15,16_and_17,cits}_{male,female}` (120)
and `capacity_estimates_used` (1).

Nothing in the platform holds this. `campers` has `name`, `cabin`, `notes` and no date of birth
and no sex; `camper_sessions` is a join table with no attributes. `commissary_sessions` holds a
single `camper_count` with no age or sex split. And the form asks for **last season's actual
attendance**, not this season's plan — `capacity_estimates_used` exists precisely so a camp that
did not operate last year can flag its numbers as estimates.

### B · Activities offered — 29 fields (DOH-367)

`activity_amusement_parks`, `activity_aquatic_theme_parks`, `activity_arts_and_crafts`,
`activity_bicycling`, `activity_classroom_instruction`, `activity_cooking`,
`activity_dancing_acting`, `activity_gymnastics`, `activity_high_adventure`, `activity_hiking`,
`activity_ice_skating`, `activity_martial_arts`, `activity_mountain_boarding`,
`activity_nature_study`, `activity_organized_games_play`, `activity_petting_zoo`,
`activity_roller_skating_blading`, `activity_skate_boarding`, `activity_sports`,
`activity_swimming_off_site`, `activity_swimming_wilderness`, `activity_other_water_activities`,
`activity_other` (23), plus `activity_specify_1..6` (6).

The setup interview covers 7 of the 30 rows. `activity_swimming_off_site` and
`activity_swimming_wilderness` are two rows that `offers_offsite_swim` answers as one, so
neither can be ticked from it — the collection UI should split that one question in two and
backfill the interview. The three starred rows (`high_adventure`, `other_water_activities`,
`other`) each demand a written specification on one of the six `activity_specify_*` rules.

### C · Key staff details — 27 fields (DOH-367, DOH-367a)

`camp_director_dob_{month,day,year}`, `camp_director_education`,
`camp_director_qualifying_experience`,
`health_director_qual_{doctor,nurse_practitioner,physician_assistant,rn,lpn,emt,other}`,
`health_director_qual_other_text`, `health_director_nys_license_number`,
`health_director_on_site`, `health_director_off_site`,
`cert_cpr_staff_assistant`, `cert_first_aid_staff_assistant`,
`aquatics_director_dob_{month,day,year}`,
`aquatic_exp_one_season_director`, `aquatic_exp_two_seasons_12_weeks`,
`aquatic_exp_18_weeks_lifeguard`,
`riflery_instructor_dob_{month,day,year}` (DOH-367a).

`safety_staff` is `(id, camp_id, name, title, is_active)` and nothing else — no birth date, no
education, no experience, no professional licence. `safety_licenses` is close but wrong: it is
camp-scoped, with no `staff_id`, so it cannot carry a health director's NYS licence number.

### D · Certified staff roster: dates of birth and counselor counts — 60 fields (DOH-367a)

`lifeguard_row{1..11}_date_of_birth_{month,day,year}` (33),
`first_aid_cpr_staff_row{1..7}_date_of_birth_{month,day,year}` (21),
`counselors_age_{16,17,18_and_over}_{male,female}` (6).

Everything else in those two tables is derivable (§3.1). The DOB column is the one thing
missing, and it is missing from a person record, not from a form.

### E · Director's certified statement — 38 fields (DOH-2271)

`date_of_birth_{month,day,year}`, `address_{street,city,state,zip}`,
`convicted_yes`, `convicted_no`,
`item1_incident_date_{month,day,year}`, `item2_conviction_date_{month,day,year}`,
`item3_crime`, `item4_nature`, `item5_{city,county,state}`, `item6_court`, `item7_penalties`,
`item8_row{1,2}_fine_date_{month,day,year}`,
`item8_row{1,2}_restitution_paid_{yes,no}`,
`item8_row{1,2}_jail_term_completed_{month,day,year}`.

Note the address is the **director's home address**, not the camp's, so `camps.address_line1`
does not apply. 29 of the 38 appear only when `convicted_yes` is ticked.

### F · Pool and beach safety plan checklist — 72 fields (DOH-2286)

24 rows × `{yes,no,na}`: `chain_of_command_outlined`, `job_duties_and_descriptions`,
`daily_inspection`, `rules_and_regulations`, `diving_safety`, `deck_slides`,
`weather_water_quality`, `bather_capacity`, `supervision`, `chemical_storage_and_handling`,
`chain_of_command_flow_chart`, `emergency_phone_numbers`, `rescue_squad_consulted`,
`emergency_access`, `evacuation_route`, `first_aid_equipment`, `first_aid_room_area`,
`clearing_water_emergency`, `communication_systems`, `search_procedures`, `epileptic_seizures`,
`chlorine_gas_leaks`, `practice_drills`, `incident_log` — each `row_<name>_{yes,no,na}`.

`poolSafetyChecklistValues()`'s comment is right and should not be second-guessed: these are
components of the **pool and beach safety plan** required by 6-1.23, a different document from
the camp's written safety plan that `compliance_plan_sections` models. The clean answer is to
give the pool plan its own section list in `compliance_plan_templates` (a second `category`
family), at which point 72 of these 74 fields become derivable exactly as DOH-2040's do — see
§5.5. Until then they must be collected.

### G · Filing facts — 12 fields (DOH-367, DOH-2040)

`developmentally_disabled_yes`, `safety_plan_previously_submitted`,
`safety_plan_previously_submitted_date_{month,day,year}`, `facility_mods_none`,
`facility_mods_not_applicable`, `brochure_camp_statement_approved`, `brochure_doh_3601`,
`row_blank_write_in_{yes,na,page}` (DOH-2040).

`developmentally_disabled_yes` is the 20%-threshold box. The interview asks whether the camp
enrols *any* campers with disabilities, which cannot establish the threshold, so only the No box
is fillable today. Ask the threshold question directly.

### H · Camp operator identity and signatures — 12 fields (all five forms)

`operator_signature`, `operator_print_name`, `operator_title` (DOH-367 and DOH-367a — 6),
`completed_by_camp_operator`, `revisions_added_by_camp_operator`, `revisions_added_by_date`
(DOH-2040 — 3), `director_signature` (DOH-2271 — 1),
`facility_operator_name`, `facility_operator_signature` (DOH-2286 — 2).

The **camp operator** is the legal permit holder — the individual or the corporation's officer —
and is frequently not the camp director. Nothing in the platform models it. `organizations` has
a `name` and no officer. Collect once; it renders onto four of the five forms.

The four signature fields are a separate problem: the maps note they are "normally left blank
for a wet signature". Decide deliberately whether the packet prints a typed e-signature or a
blank rule; do not let a null decide it.

---

## 5 · Data design

### 5.1 What I would build

Three storage decisions, not one:

| Cluster | Where it goes | Why |
|---|---|---|
| Staff DOB, education, qualifying experience, sex, professional licence | **Extend `safety_staff`** | facts about a person, not answers to a form |
| Last season's attendance by session × age band × sex | **New real table `compliance_session_capacity`** | 120 typed integers with cross-row arithmetic; compliance-owned, not operational |
| Everything else (≈105 questions) | **Generic catalog + values, as proposed** | heterogeneous one-off scalars; a jurisdiction stays a seed |

The prior in the brief is right about the catalog and wrong to extend it to the repeating
tables. Below is why, plainly.

### 5.2 The catalog, refined: a question is not a field

The one change I would insist on. The maps are **cells**; a person answers **questions**, and
the ratio is not 1:1:

* every date is 3 cells (`_month`, `_day`, `_year`)
* every DOH-2286 row is 3 cells (`_yes`, `_no`, `_na`) and one answer
* `health_director_qual_*` is 7 mutually exclusive cells and one answer
* `operator_print_name` is 4 cells on 4 different forms and one answer

A catalog keyed on `(form_code, field_key)` would ask a director for the month, the day and the
year of their birth as three separate rows in the collection UI, three times over on three
forms. 371 fields collapse to **≈105 questions plus one table** once the answer is modelled
rather than the cell. That is the difference between a 50-minute setup and an abandoned one.

So the catalog row is a *question*, and it carries a `renders` projection describing which cells
it draws into and which part of the answer goes where:

```
compliance_form_questions
  question_key      'ny.director.dob'          -- stable, jurisdiction-prefixed
  jurisdiction_code 'NY'
  form_code         'DOH-2271' | null          -- null = shared across forms
  group_key/label   'director_statement'
  label, help_text
  answer_kind       bool | tristate | text | longtext | date | integer | choice
  choices           jsonb [{value,label}]
  renders           jsonb [{form,field,part,when}]
                    part: text|check|month|day|year   when: only draw if value matches
  derives_from      text  -- names the platform source when derivable rather than asked
  applies_when      jsonb -- reused verbatim from compliance_requirements
  required, sort_order

camp_form_answers
  camp_id, season_id, question_key, row_index, value, answered_by, answered_at
  primary key (camp_id, season_id, question_key, row_index)
```

`applies_when` is the second reason this earns its keep: a day camp with no water never sees the
24 DOH-2286 questions or the aquatics director block, and `compliance_applies()` — which already
exists and is already used for plan templates — decides that with no new code.

`renders` is the analogue of `evidence_rule` and `applies_when`: this module has already decided
that behaviour lives in curated jsonb rather than in a switch statement, and this follows it.
`nyPacket` then gains one generic function that walks the catalog and projects answers onto
`FormValues`, and the per-form builders shrink instead of growing.

### 5.3 Why the repeating tables should NOT be EAV rows

**The camper capacity table → its own table.** `compliance_session_capacity(camp_id, season_id,
session_index, session_name, camp_type, number_of_days, age_1_5_m … age_cit_f smallint,
is_estimate, source_session_id)`.

* As EAV it is 120 text rows per camp per season, and the obvious question — "do the age bands
  sum to the camper count you told the kitchen?" — becomes a pivot over `text`. As columns it is
  a `check` constraint.
* `smallint` rejects `"twelve"`. `text` does not, and the value lands on a signed government
  form.
* The tradeoff, stated plainly: **adding New Jersey's capacity table needs a migration, not a
  seed.** I accept that. The band boundaries differ between states but the shape (session × age
  band × sex) does not, so the worst case is added columns on one table, once — against which a
  generic store would still need per-state pivot code in the renderer, so the "adding a
  jurisdiction is a seed" property was never really available here.

**Should it extend `commissary_sessions` instead? No.** Three reasons, and the third is decisive:

1. `commissary_sessions` has `camp_id` and **no `season_id`** (confirmed in the schema). DOH-367
   is filed per season. Bolting a season onto the kitchen's table to serve a permit is the tail
   wagging the dog.
2. The pilot camp has **zero** `commissary_sessions` rows. Compliance would inherit an empty
   dependency on a module a camp may not have bought.
3. **DOH-367 asks for last season's *actual* attendance.** `commissary_sessions.camper_count` is
   this season's *forecast*, and it is edited by a food-service manager to make ordering come out
   right. If those were the same number, someone adjusting next week's portions would silently
   amend a filed permit application. They are different numbers with different owners and they
   need different rows.

The right relationship is a nullable `source_session_id` FK so the collection UI can offer "copy
the names and dates from your kitchen sessions", while the numbers stay compliance-owned.

**The DOH-367a staff tables → extend `safety_staff`, collect nothing.** A date of birth stored
as `('DOH-367a','lifeguard_row3_date_of_birth_year', row_index 3)` is wrong in three ways: it
binds a person's birthday to a row position on one New York form; it must be duplicated for
every other jurisdiction that asks; and when a lifeguard leaves, the rows shift and every DOB
below follows the wrong person. Put it on the person:

```sql
alter table safety_staff
  add column date_of_birth date,
  add column sex text check (sex in ('male','female')),
  add column education text,
  add column qualifying_experience text,
  add column professional_license_number text;
```

That one column makes all 57 DOB cells derivable, and it makes them derivable for the next
state too. **It is also PII and must be treated as such** — DOB belongs behind `is_camp_admin`,
not `is_camp_member`, and the module already has the vocabulary for this in
`compliance_requirements.holds_personal_records`.

The counselor age/sex counts (6 fields) stay in the compliance layer despite looking like staff
data, because `safety_staff` is a certification roster, not the payroll. A camp with 60
counselors will not enter 60 rows to produce 6 numbers; the form asks for a headcount and a
headcount is what we should ask for.

### 5.4 Answers to "extend or store in compliance", per cluster

| Cluster | Verdict | Reason |
|---|---|---|
| Staff DOB / sex | `safety_staff` columns | a person's attribute, needed by every jurisdiction |
| Staff education, qualifying experience | `safety_staff` columns | ditto; DOH-367 asks for the director's, DOH-367a's successors will ask for others' |
| Health director NYS licence number | `safety_staff.professional_license_number` | belongs to the person; `safety_licenses` is camp-scoped and has no `staff_id` |
| Health director qualification (MD/NP/PA/RN/LPN/EMT) | compliance catalog, `choice` | a form-specific taxonomy; do not import NY's enum into the roster |
| Session names, dates, camp type | `compliance_session_capacity`, prefilled from `commissary_sessions` | permit-scoped snapshot |
| Last season's attendance by age × sex | `compliance_session_capacity` | reporting number, not operational |
| Counselor headcount by age × sex | compliance catalog, `integer` | a stated total, not a roster |
| Activities offered | compliance catalog, `bool` — **and backfill the 7 overlapping answers into `camp_compliance_answers`** | the interview already owns 7 of them; do not create a second truth |
| Camp operator name / title | compliance catalog, shared across 4 forms | no platform concept exists; too thin to justify a table today |
| Director's conviction disclosure (DOH-2271 items 1–8) | compliance catalog, `applies_when: {convicted:'true'}` | sensitive, rarely populated, never operational |
| Pool plan checklist rows | `compliance_plan_templates` with a new category family (see §5.5) | they are plan sections, and we already model plan sections |
| Facility code | `camps.facility_code` column | an identity of the camp, printed on two forms, one value forever |

### 5.5 The one design move that would delete 72 MUST COLLECT fields

DOH-2286's 24 rows are the checklist for a plan document. DOH-2040's 76 rows are the checklist
for a different plan document, and the platform fills 169 of those from
`compliance_plan_sections`. Seed the 24 pool-plan components as `compliance_plan_templates` rows
under a `POOL_PLAN_*` category family gated on `applies_when: {has_pool:true}` /
`{has_waterfront:true}`, add the explicit `form_row_key` column from §3.4, and DOH-2286 fills
itself from the same machinery — with the camp *writing the plan* rather than ticking a box that
says they wrote it. That is a bigger win than anything in the collection UI, and it is the same
work already done once.

I have left those 72 in MUST COLLECT because they are not derivable today, but they should be
the first thing built after the roster columns.

---

## 6 · Collection plan

Nine sittings. Field counts are raw map cells; question counts are what a person actually
answers. Times assume the camp has the paperwork to hand — the long pole is always finding last
year's enrolment numbers, never typing them.

| # | Sitting | Questions | Unlocks | Time | Gate |
|---|---|---:|---:|---|---|
| 1 | **Your sessions and last season's attendance** — one row per session: name, dates, day/overnight, and campers by age band and sex | 1 table, ~5 rows × 14 | 121 + 30 derivable | 15–25 min | always |
| 2 | **What campers do here** — the DOH-367 activity grid, 7 boxes pre-ticked from your setup answers | 24 checks + up to 6 specifications | 29 | 3–5 min | always |
| 3 | **Your directors** — DOB, education and qualifying experience for the camp director; qualification, licence number and on/off-site for the health director; DOB and aquatic experience route for the aquatics director | 13 | 27 + unblocks 40 derivable cert cells | 5–8 min | always (aquatics block gated on water) |
| 4 | **Dates of birth on your safety roster** — one date per certified staff member, entered on the roster, not here | 1 per staff member | 57 | 5 min / 15 staff | camp has certified staff |
| 5 | **Counselor headcount** — counselors by age 16 / 17 / 18+ and sex | 6 | 6 | 2 min | always |
| 6 | **The director's certified statement** — home address, DOB, and the criminal-history question | 6, or 21 if disclosed | 38 | 3 min clean / 15 min disclosed | always |
| 7 | **Your pool and beach safety plan** — the 24 components of the 6-1.23 plan | 24 tristate | 72 | 10–15 min | `has_pool` or `has_waterfront` |
| 8 | **Who signs the permit** — the camp operator's name and title, the signature policy | 3 | 12 across 4 forms | 1–2 min | always |
| 9 | **This year's filing** — plan attached vs previously submitted, facility modifications, brochure, the 20% question | ~8 | 12 | 3 min | always |

**Totals.** A day camp with no water: sittings 1–6 and 8–9, ~62 questions, ~35 minutes, and the
packet comes out finished. An overnight camp with a pool and a riflery range: all nine, ~105
questions plus the table, ~50–60 minutes.

Ordering matters more than the counts. Sitting 1 is first because it is the only one that
requires records from outside the app, so a camp discovers the homework early rather than at
minute 40. Sitting 4 is deliberately *not* in the compliance UI at all — it is a column on the
safety roster with a "needed for your permit" hint, because a date of birth entered inside a
form wizard will not be there next season when a different form asks for it.

---

## 7 · Fields I could not classify cleanly

| Field(s) | Problem |
|---|---|
| `operator_signature` ×2, `director_signature`, `facility_operator_signature` | The maps say "normally left blank for a wet signature". Whether we type a name, draw a captured signature image, or print a rule is a product decision with legal weight, not a data-availability question. Listed as MUST COLLECT so the decision is forced; a decision to print blank is a fine outcome. |
| `row_blank_write_in_{yes,na,page}` (DOH-2040) | A blank write-in row for a plan component the state's list does not name. Only meaningful once the camp has an extra section; belongs in the plan tab as "add your own component", not in a form questionnaire. |
| `aq_cert_lifeguard_supervision_management_*`, `aq_cert_progressive_swimming_instructor_*`, `psi_row*`, `riflery_instructor_certification` | Classified DERIVABLE, but only conditionally: `CertType` has no member for PSI, Lifeguard Supervision & Management, or riflery, so all three land in `'other'` and can be told apart only by fuzzy-matching `cert_name`. Recommend adding the enum values before relying on the derivation. |
| `session_{N}_type_day` / `type_overnight` | Classified DERIVABLE from the camp-wide `camp_type` answer. Wrong for a camp that runs both a day programme and an overnight programme in different sessions, which is common. Should become a per-row column on `compliance_session_capacity` and be treated as prefill only. |
| `activity_cooking` | `has_kitchen` is true for nearly every camp but means food service, not a camper activity period. Left as MUST COLLECT deliberately — the two questions look identical and are not. |
| `capacity_estimates_used` | Sits between filing fact and data: it is true exactly when the camp did not operate last season, which `facility_mods_not_applicable` also asks. One question should drive both cells. |

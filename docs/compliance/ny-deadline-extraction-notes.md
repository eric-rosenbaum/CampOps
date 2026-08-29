# Deadline extraction notes — NY children's camp requirements

Companion to `ny-subpart-7-2-extraction-notes.md`. Records how
`compliance_requirements.deadline_rule` was populated by
`supabase/migrations/20260830120000_compliance_deadlines.sql`.

Scope: all 91 rows (78 `NY-STATE`, 13 `NY-WESTCHESTER`). Extracted 2026-08-29.

## State of the column before this migration

All 91 rows had `deadline_rule` **NULL**, not `{}`. The engine's guard is
`if r.deadline_rule ? 'type'`, and `NULL ? 'text'` is NULL, which is not true, so
NULL was harmless — but the brief described the column as `{}`, so the
difference is worth knowing before anything is written that assumes non-null.

## Sources read

| Source | URL | Used for |
|---|---|---|
| Cornell LII, 10 NYCRR 7-2.4 Permit | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.4 | NY-0402, NY-0403, NY-0404 |
| Cornell LII, 10 NYCRR 7-2.5 Personnel, supervision and camp safety plan | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.5 | NY-0504, NY-0516, NY-0519 |
| Cornell LII, 10 NYCRR 7-2.6 Potable water | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.6 | NY-0602, NY-0603, NY-0605, NY-0606 |
| Cornell LII, 10 NYCRR 7-2.7 Sewage | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.7 | NY-0702 |
| Cornell LII, 10 NYCRR 7-2.8 Medical requirements | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.8 | NY-0808 |
| Cornell LII, 10 NYCRR 7-2.10 Transportation | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.10 | confirmed no deadlines |
| Cornell LII, 10 NYCRR 7-2.11 Recreational safety | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.11 | NY-1113 |
| Cornell LII, 10 NYCRR 7-2.18 Fire safety | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.18 | NY-1803, NY-1804 |
| Cornell LII, 10 NYCRR 7-2.25 Campers with disabilities | https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.25 | NY-2504, NY-2506, NY-2508, NY-2509 |
| Cornell LII, 10 NYCRR 7-2.9, 7-2.16, 7-2.19 – 7-2.23 | `.../10-NYCRR-7-2.{9,16,19,20,21,22,23}` | read in full; confirmed **no** stated deadlines |
| NYSDOH, Children's Camp Operators page | https://www.health.ny.gov/environmental/outdoors/camps/operators.htm | independent confirmation of the 15-day water start-up |
| Westchester County DOH, Permit Renewal Application (rev. 3/2025) | https://health.westchestercountyny.gov/images/stories/Environmental%20Forms/Camp/Camp_Renewal_Application_2025.pdf | all WC-* rows |
| Westchester County DOH, Original Operation Application (2025) | https://health.westchestercountyny.gov/images/stories/Environmental%20Forms/Camp/Childrens_Camp_Original_Operation_Application_2025_.pdf | cross-check; same DOH-367 60-day instruction |
| Westchester County DOH, Camp Operator forms index | https://health.westchestercountyny.gov/forms-and-permits/camp-operator | locating the packets |

`https://regs.health.ny.gov/content/section-7-2*` (the official NYSDOH regulation
viewer) returned **HTTP 403** to every automated request, so the primary text is
Cornell LII's June 22 2016 version, which is the same version the original
extraction used. Where a number mattered it was cross-checked against a second,
independent source (see NY-0402 and NY-0602 below).

## Deadlines assigned — 19 rows

### Relative to opening, negative lead time

| req_code | Rule | Citation and sentence |
|---|---|---|
| NY-0402 | `-60` | 7-2.4(c): "Application for a permit to operate a children's camp shall be made by the operator to the permit-issuing official **at least 60 days before the first day of operation**." Independently confirmed by the Westchester DOH-367 instruction sheet, which says the same thing in county words. |
| NY-0403 | `-60` | 7-2.4(c)(1): the application "shall … include a written camp safety plan … Plans that are updated must be submitted to the permit-issuing official. In any year in which an update is not required, the camp operator must submit written affirmation …" The plan or affirmation is a *component of the application*, so it inherits the 60-day filing date. **Inference flagged:** 7-2.4(c)(1) does not restate the 60 days itself; the annual *review* has no separate date. |
| NY-0602 | `-15` | 7-2.6(d): "The children's camp operator must ensure that the following actions have been taken **15 days prior to the property's occupancy** for which the water supply is utilized each year." Confirmed by NYSDOH operators page: "Start-up procedures, including required sampling, must be completed at least 15 days prior to opening for the season." |
| WC-01 … WC-11, WC-13 | `-60` | Westchester packet, DOH-367 instructions: "Submit the completed form and other required application materials to the local health department (LHD) **at least 60 days prior to camp operation**." Each of these twelve items is described in the packet as one that "must be submitted with the camp application" / "returned with the application package". The county is the permit-issuing official under 7-2.4(b), so 7-2.4(c) governs the package as well. |

### Relative to opening, day 0

`days: 0` means **due by opening day** — the outside edge of a rule that says
"prior to opening" without naming a number. It is not a claim that the duty may
be discharged *on* opening day; it is the latest date the regulation tolerates,
chosen over inventing a lead time the text does not contain.

| req_code | Rule | Citation and sentence |
|---|---|---|
| NY-0603 | `0` | 7-2.6(f)(1): "At least one sample collected for total coliform analysis from each water source **prior to opening for the operating season** …" Only the pre-opening sample is modelled; see the unmodellable list. |
| NY-1804 | `0` | 7-2.18(e)(3): "Fire extinguishers and other firefighting equipment … shall be provided, inspected and tagged by the camp operator **prior to the camp season**." |
| NY-2506 | `0` | 7-2.25(a)(3)(iv): "All bathing beach and swimming pool staff shall be trained to implement the procedure **prior to the date the camp begins operation**." |
| WC-12 | `0` | Westchester packet item 12: "Use this form to certify that a **pre-operation** self-inspection was conducted …" plus the packet's closing instruction, "SUBMIT ALL REQUIRED DOCUMENTS PRIOR TO OPERATION TO: Westchester County Health Department". Deliberately **not** `-60`: the packet hedges the co-filing with "When possible, completed forms must be submitted with the camp application". |

### No `fixed` rules

Neither Subpart 7-2 nor the Westchester packet names a single calendar date.
Every deadline in this body of law is stated relative to the camp's own opening
day, to an incident, or to a construction or hiring event. The `fixed` shape is
unused.

## Timing that could NOT be modelled — 13 rows

Each of these carries a real, quotable deadline that neither supported shape can
express. They were written as `{"note": "…"}` with **no** `type` key, so the
engine produces no due date and behaves exactly as before.

| req_code | The stated deadline | Why neither shape fits |
|---|---|---|
| NY-0404 | New application when name, ownership or operator changes; 7-2.4(c)'s 60 days would apply to the resulting application | Triggered by an ownership change that can occur at any point in the year, including mid-season. Not season-relative. |
| NY-0504 | Sex Offender Registry check "prior to the day such employee or volunteer commences work at camp and annually thereafter prior to their arrival at camp" (7-2.5(l)) | Measured from each individual's own start/arrival date. A mid-season hire has a different deadline from the pre-season cohort. Needs a per-person shape. |
| NY-0516 | Fires reported to the permit-issuing official **within 24 hours** (7-2.5(n)(3)) | Incident-relative. Also note: no deadline at all is stated for sending the fire-safety segment of the plan to the local fire district. |
| NY-0519 | Camper rights statement provided "with any enrollment application forms and/or enrollment contract forms mailed or delivered" (7-2.5(p)) | Tied to each enrollment mailing, continuous through the sales cycle. |
| NY-0605 | Positive coliform/E. coli results reported **within 24 hours** of laboratory notification (7-2.6(f)(4)); any water quantity/quality incident **within 24 hours** of occurrence (7-2.6(m)) | Incident-relative. |
| NY-0606 | Reports submitted "**within 10 days of the end of each month** of operation" (7-2.6(g), (f)(4)) | A recurring window anchored to month-end, repeating N times per season. Also: pre-operational water analysis reports are due "prior to permit issuance", which is keyed to a permit date the engine does not hold. |
| NY-0702 | Sewage facility plan or sketch "**at least 30 days prior to construction**" (7-2.7(b)) | The 30 days run from a construction start date, not from opening. Named in the brief as a known deadline, but it is *not* relative to opening. The water-system analogue, 7-2.6(i)(1), is 60 days prior to beginning construction and has no requirement row at all. |
| NY-0808 | Serious injuries, illnesses, rabies exposures and camper abuse allegations reported **within 24 hours** (7-2.8(d)) | Incident-relative. |
| NY-1113 | Trip staff review the safety plan "**within 24 hours prior to departure**", with a one-week carve-out (7-2.11(i)) | Trip-relative, and repeats per trip. |
| NY-1803 | Fire drill "**within the first 48 hours of each camping session**", then periodically per the plan (7-2.18(b)(4)) | The clock restarts every session. The engine emits one due date per requirement per season from `seasons.opening_date`, so `relative_to_opening / days: 2` would be right for session 1 and wrong for every later session. Named in the brief as a known deadline; it needs a `relative_to_session` shape. |
| NY-2504 | Modified diets identified "**prior to arrival at camp**" for each camper (7-2.25(a)(2)(iii)) | Camper-relative and per session. |
| NY-2508 | Justice Center SEL check "**prior to hiring**"; code of conduct "at the time of initial employment, and at least annually thereafter" (7-2.25(b)(6)) | Employment-relative, per person. |
| NY-2509 | Five clocks in 7-2.25(b): victim notified **within 24 hours** and witness **within 48 hours** of Justice Center acceptance; investigation commenced no later than **5 business days** after notification; investigation and written report **within 45 days** of first report; corrective action plan reported **within 45 days** of the conclusion of an investigation; corrective actions implemented **within 90 days** of completion | All incident- and investigation-relative, and there are five of them on one row. |

### If the engine is extended

Two shapes would clear most of this list:
`{"type": "relative_to_session", "days": N}` (would model NY-1803 exactly, and
NY-2504 approximately), and `{"type": "after_event", "hours": N}` used purely as
a display/SLA label rather than a due date (NY-0516, NY-0605, NY-0808, NY-1113,
NY-2509). A `{"type": "monthly_after_month_end", "days": 10}` would cover NY-0606.

## Judgment calls, and rows deliberately left blank

- **NY-0603 (coliform).** The brief listed "coliform sampling before opening and
  monthly during operation". Only the before-opening half is modelled (`days: 0`).
  The in-season half — "at least one additional sample … during the operating
  season" plus "Total coliform samples shall be collected for each month the camp
  is in operation" for camps operating more than 30 days — is a recurring cadence
  and is recorded in the row's `note`. The original extraction flagged this
  sentence as garbled in the published text; that ambiguity is about *how many*
  in-season samples, and does not touch the pre-opening clause, which is
  unambiguous in every reading. **Worth knowing:** 7-2.6(d)(3) folds the (f)(1)
  sample into the annual start-up, and NYSDOH says start-up "including required
  sampling" must be complete 15 days before opening — so for a camp with a
  seasonal on-site supply the practical deadline is `-15`, not `0`. It was left
  at `0` because that is what the cited subdivision actually says, and because
  NY-0602 already carries the `-15` clock.
- **NY-0801 (submit the health director's name).** 7-2.8(a) states the duty with
  no timing. The name is in fact collected on DOH-367, which is part of the
  60-day package, so a `-60` is arguable. Left blank: the cited subdivision does
  not say it, and WC-07 already carries the DOH-367 deadline.
- **NY-0515, NY-0517 (safety plan content rows).** The plan they describe is
  filed with the application, but 7-2.5(n)(1)–(5) states no filing date of its
  own; NY-0403 is the row that carries the filing deadline. Left blank to avoid
  three rows all firing the same `-60`.
- **NY-0510 (aquatics director).** 7-2.5(e)(5) requires the director to "have
  annually reviewed and documented the review of the camp's safety plan for
  swimming" — annual, but with no date. 7-2.5(f) requires the progressive
  swimming instructor to assess each camper "prior to allowing the child to
  participate in aquatic activities", which is camper-relative. Left blank.
- **NY-0805, NY-0806 (camper medical history, meningitis response form).**
  "updated annually" / "must be submitted annually" (7-2.8(c)(1), (c)(2)(ii)) —
  annual, but the regulation names no date and does not say "before arrival".
  Left blank rather than guessing at opening day.
- **NY-1002 (vehicle registration and inspection).** Annual in practice, but the
  cadence comes from DMV, not from 7-2.10(c), which only requires the stickers to
  be current. Left blank.
- **NY-1601 (linens weekly), NY-1110 (equipment inspection "at frequent
  intervals"), NY-1103 (buddy checks every 15 minutes), NY-0601 (daily chlorine
  residual).** These are operating cadences already captured by the `frequency`
  column, not deadlines against a date. Left blank with no note.
- **All other rows** — the regulation states the duty and is silent on timing.
  That silence is the finding, and `deadline_rule` is left untouched.

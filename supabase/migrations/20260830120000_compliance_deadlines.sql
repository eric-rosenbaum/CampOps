-- ---------------------------------------------------------------------------
-- Populate compliance_requirements.deadline_rule for New York children's camps.
--
-- Idempotent: every statement is an unconditional UPDATE keyed on req_code, so
-- re-running the file is a no-op beyond rewriting the same value.
--
-- THE TWO SHAPES THE ENGINE UNDERSTANDS
--   (evaluate_camp_compliance, 20260829200000_compliance_evidence_precision.sql)
--
--   {"type": "relative_to_opening", "days": N}
--       due date := seasons.opening_date + N
--       SIGN CONVENTION: a duty owed BEFORE opening day is a NEGATIVE number.
--       "at least 60 days before the first day of operation" -> days: -60.
--       Getting the sign backwards puts the deadline two months INTO the season.
--
--   {"type": "fixed", "month": M, "day": D}
--       due date := that calendar date in the season's opening year.
--       No requirement in this data set uses it: neither 10 NYCRR Subpart 7-2
--       nor the Westchester packet names a fixed calendar date. Everything is
--       stated relative to the camp's own opening day.
--
-- days: 0 IS DELIBERATE AND MEANS "DUE BY OPENING DAY".
--   Several rules read "prior to opening for the operating season" / "prior to
--   the camp season" / "prior to the date the camp begins operation" without
--   naming a number of days. Opening day is the last moment those duties can be
--   discharged, so day 0 is the true outside edge, not an invented lead time.
--   Treat a day-0 due date as "must already be done when the gate opens".
--
-- {"note": "..."} WITH NO "type" KEY
--   The engine tests `deadline_rule ? 'type'`, so a note-only object produces no
--   due date and changes no behaviour. These rows carry a real, quotable
--   deadline in the regulation that NEITHER shape can express - 24-hour incident
--   clocks, per-session and per-camper triggers, month-end filing windows, and
--   deadlines measured from construction or from an investigation rather than
--   from opening day. They are recorded rather than forced into a wrong date.
--   A note also rides alongside a type where the row carries a second cadence
--   the engine cannot model. See docs/compliance/ny-deadline-extraction-notes.md.
--
-- Sources actually read for every value below:
--   Cornell LII, 10 NYCRR 7-2.4 / 7-2.5 / 7-2.6 / 7-2.7 / 7-2.8 / 7-2.11 /
--     7-2.18 / 7-2.25 (June 22 2016 text, the current version)
--   NYSDOH, health.ny.gov/environmental/outdoors/camps/operators.htm
--   Westchester County DOH Children's Camp Permit Renewal Application, 3/2025
--
-- Rows not listed here are left as they are: the regulation imposes the duty
-- but states no timing for it. That is the correct outcome for most of the 91.
-- ---------------------------------------------------------------------------

-- ── 10 NYCRR Subpart 7-2 (profile NY-STATE) ────────────────────────────────

-- 7-2.4(c): "Application for a permit to operate a children's camp shall be
-- made by the operator to the permit-issuing official at least 60 days before
-- the first day of operation."
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'NY-0402';

-- 7-2.4(c)(1): the application "shall ... include a written camp safety plan ...
-- The plan must be reviewed annually by the camp operator and updated as
-- required ... Plans that are updated must be submitted to the permit-issuing
-- official. In any year in which an update is not required, the camp operator
-- must submit written affirmation to the permit-issuing official that the
-- approved plan remains up-to-date and complete."
-- The plan (or the affirmation in its place) is a component of the application,
-- so it inherits the 60-day filing deadline of 7-2.4(c). The annual review
-- itself has no separately stated date.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'NY-0403';

-- 7-2.4(c), (h): a new application is required when the name, ownership or
-- operator changes. The 60-day clock in 7-2.4(c) is measured from the first day
-- of operation, but this filing is triggered by a change that can happen at any
-- point in the year, including mid-season. Not modellable.
update compliance_requirements
   set deadline_rule = '{"note": "7-2.4(c)(2) and (h) require a new application when the camp name, ownership or operator changes. The filing is triggered by the change, not by the season, so the 60-day clock in 7-2.4(c) only bites when the change happens before a season starts."}'::jsonb
 where req_code = 'NY-0404';

-- 7-2.5(l): "The camp operator shall ascertain whether an employee or volunteer
-- is listed on the ... DCJS Sex Offender Registry prior to the day such
-- employee or volunteer commences work at camp and annually thereafter prior to
-- their arrival at camp." Measured from each person's own start date, not from
-- opening day, so a mid-season hire has a different deadline. Not modellable.
update compliance_requirements
   set deadline_rule = '{"note": "7-2.5(l): the check is due before the day each individual employee or volunteer commences work, and annually thereafter before that person arrives at camp. Per-person, not per-season."}'::jsonb
 where req_code = 'NY-0504';

-- 7-2.5(n)(3): the fire safety section of the plan must cover "reporting to the
-- permit-issuing official within 24 hours fires which destroy or damage any
-- camp building, or which result in notification of the fire department, or are
-- life or health threatening." A 24-hour clock from an incident. The same
-- subdivision requires a copy of the fire segment to go to the local fire
-- district but states no date for that.
update compliance_requirements
   set deadline_rule = '{"note": "7-2.5(n)(3): fires must be reported to the permit-issuing official within 24 hours of the fire. Incident-relative, not season-relative. No deadline is stated for sending the fire-safety segment of the plan to the local fire district."}'::jsonb
 where req_code = 'NY-0516';

-- 7-2.5(p): the statement must be provided "with any enrollment application
-- forms and/or enrollment contract forms mailed or delivered to a person for
-- purposes of enrollment". Tied to each enrollment mailing, not to opening day.
update compliance_requirements
   set deadline_rule = '{"note": "7-2.5(p): due whenever enrollment application or contract forms are mailed or delivered to a family. Enrollment-relative and continuous through the sales cycle, not a single season date."}'::jsonb
 where req_code = 'NY-0519';

-- 7-2.6(d): "The children's camp operator must ensure that the following
-- actions have been taken 15 days prior to the property's occupancy for which
-- the water supply is utilized each year."
-- Confirmed independently by NYSDOH: "Start-up procedures, including required
-- sampling, must be completed at least 15 days prior to opening for the season."
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -15}'::jsonb
 where req_code = 'NY-0602';

-- 7-2.6(f)(1): "At least one sample collected for total coliform analysis from
-- each water source prior to opening for the operating season and at least one
-- additional sample collected from each water source during the operating
-- season. For those children's camps operating more than 30 days in a calendar
-- year. Total coliform samples shall be collected for each month the camp is in
-- operation."
-- Only the pre-opening sample has a season-relative deadline; day 0 is its
-- outside edge. The in-season monthly cadence cannot be expressed as one date.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": 0, "note": "Day 0 encodes only the pre-opening sample required by 7-2.6(f)(1). The in-season sampling - one additional sample during the season, and monthly samples for camps operating more than 30 days in a calendar year - is a recurring cadence the engine cannot express. Camps running the 7-2.6(d) annual start-up will in practice collect this sample inside the 15-day start-up window, because 7-2.6(d)(3) folds the (f)(1) sample into the start-up procedure."}'::jsonb
 where req_code = 'NY-0603';

-- 7-2.6(f)(4) and 7-2.6(m): "The camp operator must report sample results that
-- are positive for total coliform or Escherichia coli to the permit-issuing
-- official as soon as possible but no later than 24 hours of being notified by
-- the laboratory." / "Any incident or condition which affects the quantity or
-- quality of the on-site potable water supply shall be reported to the
-- permit-issuing official within 24 hours of occurrence."
update compliance_requirements
   set deadline_rule = '{"note": "7-2.6(f)(4): positive total coliform or E. coli results must be reported within 24 hours of laboratory notification. 7-2.6(m): any incident affecting water quantity or quality must be reported within 24 hours of occurrence. Both are incident-relative."}'::jsonb
 where req_code = 'NY-0605';

-- 7-2.6(g) and 7-2.6(f)(4): "water treatment operation reports shall be
-- maintained daily and submitted to the permit-issuing official within 10 days
-- of the end of each month of operation" / "All other water analysis reports ...
-- shall be submitted to the permit-issuing official within 10 days of the end
-- of each month in which samples were collected." A recurring month-end window.
update compliance_requirements
   set deadline_rule = '{"note": "7-2.6(g) and 7-2.6(f)(4): reports are due within 10 days of the end of each month of operation. A recurring month-end window, not a single season date. 7-2.6(f)(4) also requires pre-operational water analysis reports to be submitted before the permit is issued, which is keyed to permit issuance rather than to opening day."}'::jsonb
 where req_code = 'NY-0606';

-- 7-2.7(b): "A plan or sketch of the proposed or modified facility shall be
-- submitted to the permit-issuing official at least 30 days prior to
-- construction; no work is to start until the plan or sketch is approved."
-- The 30 days run from the start of construction, which has no relationship to
-- the season opening date. Not modellable.
update compliance_requirements
   set deadline_rule = '{"note": "7-2.7(b): the sewage facility plan or sketch is due at least 30 days prior to CONSTRUCTION, not prior to opening. The clock runs from a construction start date the engine does not hold. The parallel rule for water systems, 7-2.6(i)(1), is 60 days prior to beginning construction."}'::jsonb
 where req_code = 'NY-0702';

-- 7-2.8(d): the listed serious injuries, illnesses, rabies exposures and camper
-- physical or sexual abuse allegations "shall be reported within 24 hours to
-- the permit-issuing official."
update compliance_requirements
   set deadline_rule = '{"note": "7-2.8(d): serious injuries and illnesses, rabies exposures and camper abuse allegations must be reported to the permit-issuing official within 24 hours. Incident-relative."}'::jsonb
 where req_code = 'NY-0808';

-- 7-2.11(i): "Staff supervising a camp trip must review the camp safety plan
-- for each trip within 24 hours prior to departure except when the staff
-- participated in an identical trip or in the pre-camp training within one week
-- prior to the intended trip."
update compliance_requirements
   set deadline_rule = '{"note": "7-2.11(i): the safety plan review is due within 24 hours prior to each trip departure, with a carve-out where staff did an identical trip or pre-camp training within one week prior. Trip-relative."}'::jsonb
 where req_code = 'NY-1113';

-- 7-2.18(b)(4): "Fire drills shall be held within the first 48 hours of each
-- camping session and periodically thereafter in accordance with the camp
-- safety plan."
-- The clock restarts at every session. The engine produces one due date per
-- requirement per season from seasons.opening_date, so relative_to_opening
-- with days: 2 would be correct for the first session and wrong for all the
-- others. Left unmodelled deliberately.
update compliance_requirements
   set deadline_rule = '{"note": "7-2.18(b)(4): a fire drill is due within the first 48 hours of EACH camping session, then periodically per the safety plan. relative_to_opening days 2 would only be right for the first session of a multi-session camp, so this needs a per-session deadline shape the engine does not have."}'::jsonb
 where req_code = 'NY-1803';

-- 7-2.18(e)(3): "Fire extinguishers and other firefighting equipment acceptable
-- to the permit-issuing official shall be provided, inspected and tagged by the
-- camp operator prior to the camp season."
-- Day 0 = the outside edge of "prior to the camp season". The other half of
-- this merged row, "regular inspection of all fire protection facilities and
-- equipment" in 7-2.18(b)(5), states no interval at all.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": 0, "note": "Day 0 encodes the extinguisher tagging deadline in 7-2.18(e)(3), prior to the camp season. The regular fire-equipment inspection duty in 7-2.18(b)(5) that shares this row has no stated interval."}'::jsonb
 where req_code = 'NY-1804';

-- 7-2.25(a)(2)(iii): "Modified diets and other special needs related to a
-- camper's disability shall be identified for each camper prior to arrival at
-- camp, planned for, provided for in accordance with supplied directions, and
-- reviewed by the designated camp health director."
update compliance_requirements
   set deadline_rule = '{"note": "7-2.25(a)(2)(iii): due prior to each individual camper arrival, which varies by session and by camper. Camper-relative, not season-relative."}'::jsonb
 where req_code = 'NY-2504';

-- 7-2.25(a)(3)(iv): "All bathing beach and swimming pool staff shall be trained
-- to implement the procedure prior to the date the camp begins operation.
-- In-service training using this procedure shall be conducted and documented
-- every two weeks after the commencement of the camp's operation or as
-- otherwise approved by the permit-issuing official in the camp's safety plan."
-- The initial training is squarely season-relative; day 0 is its outside edge.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": 0, "note": "Day 0 encodes the initial training required prior to the date the camp begins operation. The every-two-weeks in-service refresher that runs after operations commence is a recurring cadence the engine cannot express."}'::jsonb
 where req_code = 'NY-2506';

-- 7-2.25(b)(6): "Prior to hiring anyone who will or may have direct contact
-- with campers, or approving credentials for any camp staff, the operator shall
-- follow the procedures established by the Justice Center ... to verify that
-- such person is not on the Justice Center's staff exclusion list (SEL)". The
-- code of conduct "shall be provided at the time of initial employment, and at
-- least annually thereafter during the term of employment."
update compliance_requirements
   set deadline_rule = '{"note": "7-2.25(b)(6): the Justice Center staff exclusion list check is due prior to hiring each individual, and the code of conduct at initial employment and at least annually thereafter. Both are per-person employment-relative deadlines."}'::jsonb
 where req_code = 'NY-2508';

-- 7-2.25(b)(4), (b)(5), (b)(8): "Alleged victims shall be notified within 24
-- hours and potential witnesses shall be notified within 48 hours of the
-- permit-issuing official reporting ... that an incident of abuse or neglect
-- has been accepted by the Justice Center for investigation." / "The
-- investigation and written report shall be completed and provided to the
-- department within 45 days of when the incident was first reported to the
-- Justice Center." / "report corrective actions plans to the permit-issuing
-- official within 45 days of the conclusion of an investigation" / "Corrective
-- action plans shall be implemented as soon as possible but within 90 days of
-- the completion of an investigation unless the camp has closed for the season."
update compliance_requirements
   set deadline_rule = '{"note": "7-2.25(b): five separate incident-relative clocks - alleged victim notified within 24 hours and potential witness within 48 hours of the Justice Center accepting the incident; investigation commenced no later than 5 business days after notification; investigation and written report within 45 days of first report to the Justice Center; corrective action plan reported within 45 days of the conclusion of an investigation; corrective actions implemented within 90 days of completion of the investigation, or on reopening if the camp has closed for the season."}'::jsonb
 where req_code = 'NY-2509';

-- ── Westchester County permit packet (profile NY-WESTCHESTER) ──────────────
--
-- Westchester County DOH is the permit-issuing official under 10 NYCRR 7-2.4(b)
-- for camps in the county, so 7-2.4(c) ("at least 60 days before the first day
-- of operation") governs the whole package. The county packet states the same
-- number in its own words on the DOH-367 instruction sheet:
--   "Submit the completed form and other required application materials to the
--    local health department (LHD) at least 60 days prior to camp operation."
-- and each numbered item below is described in the packet as one that "must be
-- submitted with the camp application".
-- Source: Camp_Renewal_Application_2025.pdf (rev. 3/2025), Westchester County
-- Department of Health, Bureau of Public Health Protection.

-- Packet item 1: "Renewal Application for a Permit to Operate a Children's Camp"
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-01';

-- Packet item 2: Certificate of Resolution, "Must be completed if the camp is
-- owned by a corporation and must be notarized" - filed with the application.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-02';

-- Packet item 3: "Non-refundable Application Fee of $200.00, if not fee exempt"
-- - tendered with the application package.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-03';

-- Packet item 4: "Provide Workers' Compensation & Disability Insurance ...
-- businesses requesting permits must provide the following forms to the
-- government entity issuing the permit".
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-04';

-- Packet item 5: DOH-2271 director certified statement, "Complete, sign and
-- return with the application package."
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-05';

-- Packet item 6: LDSS-3370 register check, "The form must be complete, signed,
-- and returned with the camp application."
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-06';

-- Packet item 7: DOH-367, "Submit the completed form and other required
-- application materials to the local health department (LHD) at least 60 days
-- prior to camp operation." This is the sentence that fixes the 60 days for the
-- whole Westchester package.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-07';

-- Packet item 8: DOH-367a, "submit this form with the camp application for
-- review and approval."
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-08';

-- Packet item 9: HD 91 amusement device survey - part of the numbered list that
-- makes up "A Complete Children's Camp Renewal Application".
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-09';

-- Packet item 10: "These forms must be submitted with the camp application and
-- maintained on-site and on all camp trips".
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-10';

-- Packet item 11: O.E.M. camp contact form, "Submit this form with the camp
-- application for review and approval."
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-11';

-- Packet item 12: "Use this form to certify that a pre-operation self-inspection
-- was conducted ... When possible, completed forms must be submitted with the
-- camp application for review and approval to ensure adequate time for
-- processing and permit issuance."
-- The county hedges the co-filing with "when possible", so this row does NOT
-- get the -60 the other twelve items get. What is unhedged is that the
-- inspection is pre-operation, and the packet closes with "SUBMIT ALL REQUIRED
-- DOCUMENTS PRIOR TO OPERATION TO: Westchester County Health Department".
-- Day 0 is that outside edge.
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": 0, "note": "The packet asks for this with the application when possible but only firmly requires it pre-operation, so day 0 rather than -60. A camp that wants the permit processed on time should file it with the rest of the package at -60."}'::jsonb
 where req_code = 'WC-12';

-- Packet item 13: "This plan must be submitted with the camp application for
-- review and approval." Consistent with 10 NYCRR 7-2.4(c)(1).
update compliance_requirements
   set deadline_rule = '{"type": "relative_to_opening", "days": -60}'::jsonb
 where req_code = 'WC-13';

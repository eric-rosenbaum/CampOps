-- Evidence filters for compliance_requirements: stop claiming progress a camp has not made.
--
-- THE DEFECT
-- Every engine branch that filters evidence by a rule key treated an ABSENT key as
-- "matches everything". So a requirement with an empty evidence_rule swept up the camp's
-- entire register:
--   * inspection  (18 rows, all `{}`) counted EVERY row in safety_items, so "Set up the
--     archery range" reported the same "5 items, 1 overdue" as the smoke-alarm rule.
--   * certification (7 rows, no cert_types) counted EVERY staff certification, so all five
--     of the pilot camp's certification rows reported the identical {"held": 4} and
--     "Qualify the aquatics director" was satisfied by the health director's First Aid card.
--   * drill (NY-1803) counted ANY drill of any type as the required fire drill.
--   * asset_expiry (3 rows) counted EVERY active asset, so a boat registration rule would
--     be satisfied by a van, and vice versa.
-- Fabricated progress is the worst failure mode a compliance product has. The engine now
-- falls through to the honest "attach a document" path when a filter key is absent
-- (plan_section excepted -- see below), so this file only has to supply the filters that
-- are genuinely true.
--
-- THE RULE APPLIED HERE
-- A filter is assigned ONLY when a camp satisfying that filter genuinely constitutes
-- evidence for the requirement. Three tests had to pass:
--   1. SHAPE. The requirement must really be "the camp maintains N things of kind X on a
--      recurring/current basis". Physical-plant standards, written procedures, one-time or
--      third-party inspections, supervision ratios and role qualifications all fail this
--      test -- no equipment checklist or cert count proves them -- and take the document path.
--   2. VOCABULARY. The filter values must already exist in the product. Nothing is invented.
--      safety_items.category  -> fire | water | kitchen | other  (CHECK constraint)
--      staff_certifications.cert_type -> cpr_aed | mandatory_reporter | lifeguard |
--                                        first_aid | wsi | other  (src/lib/types.ts CertType)
--                                        + legacy 'cpr' present in seeded data (see note)
--      safety_drills.drill_type -> fire_evacuation | nighttime_cabin | missing_swimmer |
--                                  severe_weather | medical_emergency | active_shooter |
--                                  missing_camper | other  (src/lib/types.ts DrillType)
--                                  + legacy 'fire' present in seeded data (see note)
--      camp_assets.category -> vehicle | golf_cart | watercraft | large_equipment |
--                              trailer | other  (CHECK constraint)
--      compliance_plan_sections.category / .section_code -> the DOH-2040 component list.
--   3. NO COLLISION. Two requirements must not resolve to the same filter unless they truly
--      read the same evidence. Identical filters reproduce the identical-numbers symptom one
--      level down. This is why only ONE requirement owns safety_items.category = 'fire':
--      the engine filters by category only, so it cannot tell a smoke alarm from an
--      extinguisher, and mapping the alarm rule and the extinguisher rule both to 'fire'
--      would let two extinguishers "prove" a camp has smoke alarms.
-- When any test was close, the requirement was left unfiltered. Under-claiming is safe.
--
-- DATA NOTES FOR THE OWNER (not fixed here -- they are camp data, not requirement data):
--   * staff_certifications on staging holds cert_type = 'cpr', but the app writes 'cpr_aed'.
--     The rules below accept both so the pilot camp is scored on the data it actually has.
--   * safety_drills on staging holds drill_type = 'fire', but the app writes 'fire_evacuation'.
--     Same treatment. Both look like seed drift worth normalising.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. INSPECTION (18 rows) -- safety_items.category
-- ══════════════════════════════════════════════════════════════════════════════
-- NONE of the 18 rows currently typed `inspection` earn a categories filter. Each is listed
-- with the reason it takes the document path instead; no statement is emitted for them
-- because they are already `{}` and the engine now reads that as "ask for a document".
--
--   NY-0607  potable water / backflow / 20 psi -- a plumbing standard, not a scheduled
--            equipment check; safety_items 'water' means rescue gear, not pipework.
--   NY-0701  sewage treatment -- third-party septic service and pump-out records.
--   NY-0804  infirmary / holding area provision -- a physical-plant standard, one-time.
--   NY-1003  vehicle emergency kits -- per-vehicle kit check; the camp fire register would
--            falsely prove it, and vehicles are camp_assets, not safety_items.
--   NY-1102  waterfront zoning -- float lines, fencing, decking, depth markings; layout and
--            supervision, only incidentally equipment.
--   NY-1106  wilderness swimming -- site assessment plus staffing ratios.
--   NY-1107  rifle range setup, supervision and locked storage.
--   NY-1108  archery range setup, locked storage and 1:10 firing line.
--   NY-1109  rider assessment, trail-ride staffing, ASTM helmets.
--   NY-1110  "inspect program equipment at frequent intervals" -- the closest call in the
--            set. Rejected because 'other' is an undefined grab-bag (one AED filed there
--            would pass the whole rule) and because assigning categories REMOVES the
--            document path, so a camp with a real paper equipment log could never satisfy it.
--   NY-1601  bedding, bunk guardrails and spacing -- physical-plant plus linen records.
--   NY-1801  fire alarm and detection systems -- vendor test and maintenance reports, and
--            'fire' is owned by NY-1804 (see the no-collision test above).
--   NY-1802  smoke alarm per sleeping unit -- genuinely register-shaped, but the engine
--            filters by category only and cannot separate smoke_alarm from
--            fire_extinguisher, so 'fire' would let extinguishers prove alarms.
--            RECOMMENDATION: add an optional `types` key (safety_items.type) to the
--            inspection branch and this becomes {"categories":["fire"],"types":["smoke_alarm"]}.
--   NY-1805  exits, egress, signage, emergency lighting -- a building standard.
--   NY-1806  flammable storage building and heating hazards -- storage practice.
--   NY-2001  pesticide and chemical storage in original containers.
--   NY-2101  vermin, bats, noxious weeds, refuse -- pest-control service records.
--   NY-2507  accessibility adaptations -- fixtures, ramps, sleeping assignments.

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CERTIFICATION (7 rows) -- staff_certifications.cert_type
-- ══════════════════════════════════════════════════════════════════════════════

-- Every lifeguard on duty must hold a current lifeguard certificate; this is literally
-- "the camp holds current certifications of kind lifeguard", so it reads the register.
update compliance_requirements
   set evidence_rule = jsonb '{"cert_types": ["lifeguard"], "min_count": 1}'
 where req_code = 'NY-0511';

-- A headcount rule ("one first aid and one CPR certified staff member per 200 campers"),
-- so counting current first-aid and CPR cards is the right evidence; min_count 2 is the
-- floor for holding at least one of each.
update compliance_requirements
   set evidence_rule = jsonb '{"cert_types": ["first_aid", "cpr_aed"], "min_count": 2}'
 where req_code = 'NY-0803';

-- Left unfiltered (document path), with reasons:
--   NY-0510  aquatics director + swim instructor -- role qualifications for two named
--            people plus an annual plan review and a camper swim-classification list; the
--            cert table has no role linkage, so a WSI card on file would not prove it.
--   NY-0512  trip and activity leaders -- prior trip history and competence, first aid/CPR
--            only where help is far off; conditional and role-scoped.
--   NY-0513  certified riflery instructor -- the product has no riflery cert_type at all;
--            'other' would prove nothing. Needs a document (or a new cert_type).
--   NY-0802  health director and named designees certified -- role-scoped; two counselors'
--            first-aid cards would falsely satisfy it.
--   NY-2510  extra director/clinician/vehicle rules -- professional licence, degrees, a
--            written training program and vehicle manifests; not a cert count.

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. DRILL (1 row) -- safety_drills.drill_type
-- ══════════════════════════════════════════════════════════════════════════════

-- A missing-swimmer or severe-weather drill is not a fire drill; restrict to the two fire
-- drill types the app writes ('nighttime_cabin' is labelled "Cabin fire drill - nighttime")
-- plus the legacy 'fire' value present in seeded data.
update compliance_requirements
   set evidence_rule = jsonb '{"drill_types": ["fire_evacuation", "nighttime_cabin"], "min_count": 1}'
 where req_code = 'NY-1803';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. ASSET_EXPIRY (3 rows) -- camp_assets.category
-- ══════════════════════════════════════════════════════════════════════════════

-- Registration and NYS inspection currency for road vehicles carrying campers; a boat or a
-- golf cart is not evidence for it.
update compliance_requirements
   set evidence_rule = jsonb '{"categories": ["vehicle"]}'
 where req_code = 'NY-1002';

-- Boat registration and inspection, so only watercraft count; a van must not satisfy it.
-- NOTE for the owner: the engine reads camp_assets.registration_expiry, but watercraft
-- carry uscg_registration_expiry, so a boat with a null registration_expiry currently reads
-- as satisfied. Worth teaching the asset_expiry branch to coalesce the two columns.
update compliance_requirements
   set evidence_rule = jsonb '{"categories": ["watercraft"]}'
 where req_code = 'NY-1112';

-- MISMATCH FIX: fire extinguisher tagging and fire-equipment inspection is a recurring
-- safety-register check, not vehicle paperwork -- as asset_expiry it was counting vans and
-- boats, and camp_assets holds no extinguishers at all. Retyped to inspection, and this is
-- the one requirement whose scope is the whole 'fire' category of the safety register.
update compliance_requirements
   set evidence_type = 'inspection',
       evidence_rule = jsonb '{"categories": ["fire"]}'
 where req_code = 'NY-1804';

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. PLAN_SECTION (7 rows) -- compliance_plan_sections.category / .section_code
-- ══════════════════════════════════════════════════════════════════════════════

-- Passive activities must be listed in the plan and held to 1:25, which is exactly the
-- ACT-02 "Passive Activity Supervision" component.
update compliance_requirements
   set evidence_rule = jsonb '{"section_codes": ["ACT-02"]}'
 where req_code = 'NY-0507';

-- Night supervision approved in the plan maps to ACT-03 "Supervision During Rest/Sleep Time".
update compliance_requirements
   set evidence_rule = jsonb '{"section_codes": ["ACT-03"]}'
 where req_code = 'NY-0508';

-- The fire safety requirement spans evacuation, prevention, alarms, extinguishers, exits,
-- the drill log and FIRE-08 "Submitted To Local Fire Department", so the whole FIRE_SAFETY
-- category is the right scope -- but only that category.
update compliance_requirements
   set evidence_rule = jsonb '{"categories": ["FIRE_SAFETY"]}'
 where req_code = 'NY-0516';

-- "Cover medical operations in the safety plan" is the MEDICAL_PLAN component group, MED-01
-- through MED-11, and nothing outside it.
update compliance_requirements
   set evidence_rule = jsonb '{"categories": ["MEDICAL_PLAN"]}'
 where req_code = 'NY-0517';

-- Plan-approved swim locations under the aquatics director are the two swimming components,
-- ACT-07 "Swimming" and ACT-18 "Waterfront Swimming Supervision".
update compliance_requirements
   set evidence_rule = jsonb '{"section_codes": ["ACT-07", "ACT-18"]}'
 where req_code = 'NY-1101';

-- Left unfiltered ON PURPOSE -- for these two, "the entire written safety plan" IS the
-- correct reading, so counting all sections is right, not over-claiming:
--   NY-0403  annual review of the safety plan and filing the update or affirmation -- the
--            subject of the review is the whole plan.
--   WC-13    "Complete Children's Camp Safety Plan and appropriate appendix" -- the
--            Westchester packet item is the completed plan in full.

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. OTHER EVIDENCE_TYPE MISMATCHES FOUND WHILE AUDITING ALL 91 ROWS
-- ══════════════════════════════════════════════════════════════════════════════

-- MISMATCH FIX: this is a fixture-count and shower-temperature rule, but temp_log reads
-- safety_temp_logs, which is the kitchen food-temperature log joined to safety_items. A
-- walk-in cooler reading was being counted as proof the camp has enough toilets. There is
-- no fixture register in the product, so it becomes a document.
update compliance_requirements
   set evidence_type = 'document'
 where req_code = 'NY-0901';

-- MISMATCH FIX: the buddy board and 15-minute check rule was typed pool_log, which reads
-- pool_chemical_readings -- chlorine and pH readings say nothing about whether swimmers
-- were counted. The evidence is the completed buddy board sheets, so: a document.
update compliance_requirements
   set evidence_type = 'document'
 where req_code = 'NY-1103';

-- (NY-1804 above is the third evidence_type correction; it is kept with the asset_expiry
--  section because that is the branch it was wrongly using.)


-- ─── Now that the inspection branch can narrow within a category ─────────────
-- `fire` holds extinguishers and alarms alike, so these two only became safe to map once the
-- engine learned to read safety_items.type (20260829200000). Without it, a camp's two
-- extinguishers would have read as proof that every cabin has a smoke alarm.

-- Detection systems are the alarm panels and heat/smoke detection gear, not extinguishers.
update compliance_requirements
   set evidence_rule = jsonb '{"categories": ["fire"], "types": ["fire_alarm", "smoke_alarm", "heat_detector"]}'
 where req_code = 'NY-1801';

-- A smoke alarm in every sleeping unit is proved by smoke alarms, and by nothing else.
update compliance_requirements
   set evidence_rule = jsonb '{"categories": ["fire"], "types": ["smoke_alarm"]}'
 where req_code = 'NY-1802';

-- Extinguisher tagging and fire-protection equipment: the whole fire category is the scope
-- here, which is why this one needs no `types` narrowing.

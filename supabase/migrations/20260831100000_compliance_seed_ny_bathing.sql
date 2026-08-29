-- New York bathing facilities: 10 NYCRR Subpart 6-1 (swimming pools) and Subpart 6-2
-- (bathing beaches). Two new profiles, 64 requirements, the DOH-2286 plan components, and
-- the pool and beach forms.
--
-- WHY THIS IS SEPARATE FROM THE CAMP CODE
-- A camp with water is two regulated things at once. Subpart 7-2 governs the camp; Part 6
-- governs the pool and the waterfront as bathing facilities in their own right. Same State
-- Sanitary Code, same county health department, different rule sets. Until now the module
-- covered none of Part 6 and said so in the scope note. This closes that.
--
-- THE ONE THING THAT SURPRISED US, AND THAT WE DELIBERATELY DID NOT SEED
-- 6-1.3(b) and 6-2.3(b) both say the permit section (6-1.5 / 6-2.5) does NOT apply to a pool
-- or beach operated in connection with a children's camp subject to Subpart 7-1 or 7-2. So a
-- camp does not file a separate bathing facility permit application, and the 30-day filing
-- clock in 6-1.5(b) is not a camp deadline. Westchester reflects this: the camp application
-- checks off "Children's Camp Swimming Pool" / "Children's Camp Bathing Beach", and the
-- separate bathing facility application is for facilities permitted on their own. Seeding a
-- pool permit row would have invented a filing the camp does not owe. Everything else in
-- both Subparts still binds.
--
-- APPLICABILITY
-- Pool rows are gated {"has_pool": true}, beach rows {"has_waterfront": true}. `any_of` is
-- not used here: unlike the camp code's aquatics rules, which apply to a camp with either,
-- these two Subparts are genuinely about two different physical things. The only rows shared
-- between them are the DOH-2286 plan components, which are one checklist for both.
--
-- WHAT THE ENGINE ACTUALLY READS
--   pool_log      POOL-1102 only. `pool_chemical_readings` is the free chlorine / pH /
--                 alkalinity log, which is exactly the record 6-1.11(c)(5) demands. No second
--                 row claims it, so two requirements never report the same number.
--   certification POOL-2302 and BEACH-1702, cert_types ["lifeguard"]. This is the same filter
--                 NY-0511 already owns, and that is correct: one lifeguard certificate is
--                 genuine evidence for the camp code duty and for the Part 6 duty, because
--                 they are the same fact stated by two regulators.
--   inspection    BEACH-1708 only, scoped to safety_items category `water`, type
--                 `waterfront_check`, which is literally the daily beachfront check the rule
--                 describes. Every other inspection row is left unscoped on purpose and takes
--                 the document path. Reasons are in docs/compliance/ny-bathing-extraction-notes.md.
--                 In particular the two lifesaving-equipment rows (POOL-2308, BEACH-1710) are
--                 unscoped because both would resolve to the same rescue gear in the register,
--                 and because a single rescue tube on file would otherwise read as proof of a
--                 first aid kit, pocket mask, reaching pole, spine board and lifeguard chair.
--   plan_section  The four rows below, scoped to the new BATHING_* categories so they never
--                 count a DOH-2040 camp plan section as a bathing plan section.
--
-- VERIFICATION
-- Source: Cornell LII, all 31 sections of Subpart 6-1 and all 20 of Subpart 6-2, fetched
-- 2026-08-29. 58 rows are marked verified: we read the subdivision and the duty is stated
-- plainly. 6 are needs_verification and every one is listed with its reason in the notes.

-- ─── Profiles ────────────────────────────────────────────────────────────────
insert into compliance_profiles (code, name, jurisdiction_level, jurisdiction_code, reader, description, source_url, sort_order)
values
 ('NY-POOL', 'New York State swimming pools (Subpart 6-1)', 'state', 'NY', 'lhd',
  'The State Sanitary Code rules for a swimming pool. Separate from the camp code, enforced by the same county health department, and they apply to your pool on top of everything Subpart 7-2 asks of the camp.',
  'https://www.law.cornell.edu/regulations/new-york/title-10/chapter-I/part-6/subpart-6-1', 30),
 ('NY-BEACH', 'New York State bathing beaches (Subpart 6-2)', 'state', 'NY', 'lhd',
  'The State Sanitary Code rules for a lake, river or ocean waterfront used for swimming. Separate from the camp code, enforced by the same county health department.',
  'https://www.law.cornell.edu/regulations/new-york/title-10/chapter-I/part-6/subpart-6-2', 40)
on conflict (code) do update
  set name = excluded.name, description = excluded.description,
      source_url = excluded.source_url, sort_order = excluded.sort_order;

-- ─── The DOH-2286 written plan components ───────────────────────────────────
-- Transcribed from DOH-2286 (3/06), the state's own Pool and Beach Safety Plan Checklist, the
-- same way the camp plan's 76 components came off DOH-2040. The form has one row set for both
-- kinds of facility, so nearly every component is gated on either a pool or a waterfront. Two
-- are pool-only because the underlying rule lives in Subpart 6-1 alone: deck slides
-- (6-1.24(d)) and chlorine gas leaks (6-1.11(c)(1)(i)).
--
-- Codes are BF-* and categories are BATHING_* so nothing collides with the camp plan.
-- The asterisked rows on the printed form are the components 6-1.23(c) and 6-2.17(a)(4)
-- treat as mandatory; that distinction is carried on the form map, not here, because the
-- template table has no column for it and inventing one would change existing schema.
insert into compliance_plan_templates (code, category, title, applies_when, sort_order) values
  ('BF-ORG-01', 'BATHING_ORGANIZATION', 'Chain of Command Outlined', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1000),
  ('BF-ORG-02', 'BATHING_ORGANIZATION', 'Job Duties and Descriptions', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1010),
  ('BF-INJ-01', 'BATHING_INJURY_PREVENTION', 'Daily Inspection', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1020),
  ('BF-INJ-02', 'BATHING_INJURY_PREVENTION', 'Rules and Regulations', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1030),
  ('BF-INJ-03', 'BATHING_INJURY_PREVENTION', 'Diving Safety', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1040),
  ('BF-INJ-04', 'BATHING_INJURY_PREVENTION', 'Deck Slides', '{"has_pool": "true"}'::jsonb, 1050),
  ('BF-INJ-05', 'BATHING_INJURY_PREVENTION', 'Weather and Water Quality', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1060),
  ('BF-INJ-06', 'BATHING_INJURY_PREVENTION', 'Bather Capacity', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1070),
  ('BF-INJ-07', 'BATHING_INJURY_PREVENTION', 'Supervision', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1080),
  ('BF-INJ-08', 'BATHING_INJURY_PREVENTION', 'Chemical Storage and Handling', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1090),
  ('BF-EMG-01', 'BATHING_EMERGENCY_PLAN', 'Chain of Command Flow Chart', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1100),
  ('BF-EMG-02', 'BATHING_EMERGENCY_PLAN', 'Emergency Phone Numbers', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1110),
  ('BF-EMG-03', 'BATHING_EMERGENCY_PLAN', 'Rescue Squad Consulted', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1120),
  ('BF-EMG-04', 'BATHING_EMERGENCY_PLAN', 'Emergency Access', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1130),
  ('BF-EMG-05', 'BATHING_EMERGENCY_PLAN', 'Evacuation Route', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1140),
  ('BF-EMG-06', 'BATHING_EMERGENCY_PLAN', 'First Aid Equipment', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1150),
  ('BF-EMG-07', 'BATHING_EMERGENCY_PLAN', 'First Aid Room or Area', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1160),
  ('BF-EMG-08', 'BATHING_EMERGENCY_PLAN', 'Clearing the Water in an Emergency', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1170),
  ('BF-EMG-09', 'BATHING_EMERGENCY_PLAN', 'Communication Systems', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1180),
  ('BF-EMG-10', 'BATHING_EMERGENCY_PLAN', 'Search Procedures', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1190),
  ('BF-EMG-11', 'BATHING_EMERGENCY_PLAN', 'Epileptic Seizures', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1200),
  ('BF-EMG-12', 'BATHING_EMERGENCY_PLAN', 'Chlorine Gas Leaks', '{"has_pool": "true"}'::jsonb, 1210),
  ('BF-EMG-13', 'BATHING_EMERGENCY_PLAN', 'Practice Drills', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1220),
  ('BF-EMG-14', 'BATHING_EMERGENCY_PLAN', 'Incident Log', '{"any_of": {"has_pool": "true", "has_waterfront": "true"}}'::jsonb, 1230)
on conflict (code) do update
  set category = excluded.category, title = excluded.title,
      applies_when = excluded.applies_when, sort_order = excluded.sort_order;

-- ─── Subpart 6-1, swimming pools ─────────────────────────────────────────────
with p as (select id from compliance_profiles where code = 'NY-POOL')
insert into compliance_requirements
  (profile_id, req_code, label, summary, category, evidence_type, evidence_rule,
   evidence_hint, frequency, applies_when, citation, citation_url, verify_status, sort_order)
values
  ((select id from p), 'POOL-0701', 'Report any pool injury or illness incident within 24 hours and log it', 'A full report of any injury or illness incident at the pool goes to the permit-issuing official within 24 hours and is written up in a log book. This covers anything that results in death, requires resuscitation, requires referral to a hospital or other facility for medical attention, or is a bather illness associated with the water quality.', 'records', 'document', '{}'::jsonb, 'The incident log book, plus a copy of each report sent to the county and the date it went.', 'on_event', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.7', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.7', 'verified', 10),

  ((select id from p), 'POOL-0801', 'Get plans approved before you build or modify the pool', 'Nothing may be installed, constructed, added to or modified at a swimming pool until the plans and specifications have been approved by the permit-issuing official. The plans have to be prepared by an engineer or architect licensed in New York, and are reviewed against the design standards in 6-1.29. Plans for any on-site water or sewage treatment need approval before construction too.', 'facility', 'document', '{}'::jsonb, 'The county''s written plan approval and the stamped drawings. DOH-1309 is the engineering report that goes with them.', 'on_event', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.8', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.8', 'verified', 20),

  ((select id from p), 'POOL-0901', 'File a construction compliance certificate before anyone uses new work', 'Before the public uses new facilities or equipment, the operator files a construction compliance certificate with the permit-issuing official, prepared and signed by a New York licensed professional engineer or architect, stating that the pool and its appurtenances were built to the approved plans.', 'facility', 'document', '{}'::jsonb, 'The signed and sealed certificate, and proof it was filed with the county.', 'on_event', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.9', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.9', 'verified', 30),

  ((select id from p), 'POOL-1001', 'Run the recirculation and disinfection equipment continuously', 'The pool is maintained and operated in a clean, safe and sanitary way at all times, and the recirculation and disinfection equipment runs continuously. Equipment and appurtenances are operated and maintained per the approved plans. Inlets are adjusted for uniform circulation and residual, the overflow system continuously removes floating matter and surface water, and skimmer weirs, throttle valves and covers are kept working.', 'facility', 'inspection', '{}'::jsonb, 'Your daily pool operation record showing run hours, plus equipment service records. Shutting the filtration or disinfection off while the pool is in use is a listed public health hazard.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.10(a), (b), (f), (g), (h)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.10', 'verified', 40),

  ((select id from p), 'POOL-1002', 'Keep the depth markings, slope-break stripe, floating line and drain grates in place', 'A four-inch contrasting stripe at the slope breakpoint or five-foot depth point and at submerged step edges and ledges, plainly visible depth markings, and a floating line at the breakpoint. Main drain grates stay secured at all times and a broken or missing grate is repaired or replaced before the pool is used. Cracks in walls, floors, overflow systems and decks are repaired once they become a leak or trip hazard, and ladders, handrails, diving equipment, chairs and slides stay firmly secured and in good repair, with at least one ladder or set of steps in any pool over two feet deep.', 'facility', 'inspection', '{}'::jsonb, 'Your pre-season and in-season pool walk-through records. Missing depth markings and a broken main drain grate are both listed public health hazards.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.10(c), (d), (e), (k)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.10', 'verified', 50),

  ((select id from p), 'POOL-1003', 'Clean the pool and deck every day and keep glass out', 'Skimmer baskets are cleaned at least daily. Walls and bottom are vacuumed or brushed daily or as needed to remove visible settleable material. The deck stays unobstructed for at least five feet all the way round, clean and free of puddles. Glass containers are prohibited in the pool and everywhere on the deck. The water level is kept high enough to skim the whole surface and to hold the required depth in diving areas.', 'facility', 'inspection', '{}'::jsonb, 'The daily cleaning entries on your pool operation record. Glass or sharp objects in the pool or on the deck is a listed public health hazard.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.10(h), (i), (j), (k)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.10', 'verified', 60),

  ((select id from p), 'POOL-1004', 'Meet the diving depth rules and stop head-first diving in shallow water', 'A pool with diving boards has to meet the minimum water depth and board dimensions in the table at 6-1.10(l)(1), or in Table 1 of 6-1.29 for boards installed after 30 March 1988. Boards are prohibited at older pools that do not meet the table, except one-metre boards used only for competition, training or school physical education. Head-first diving from the deck is prohibited in water less than eight feet deep, except during competitive swimming or swimmer training.', 'recreation', 'document', '{}'::jsonb, 'Your measured board height, overhang and water depths against the table, plus the posted pool rules covering head-first diving.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.10(l)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.10', 'verified', 70),

  ((select id from p), 'POOL-1101', 'Turn the pool over and run the filters at the right rate', 'The whole volume of pool water is recirculated and treated within six hours, or eight for a pool built before 31 March 1973, or the design rate where that is faster. Filters run within their rated loading: three gallons per minute per square foot for gravity and pressure sand, up to 15 for high-rate sand, two or 1.5 for diatomaceous earth with and without body feed, and the design rate or 0.375 for cartridge. Sand filter air release valves are opened daily, backwash runs at 12 to 15 gpm per square foot or the manufacturer''s rate, and a cartridge pool keeps one complete spare set on hand.', 'facility', 'inspection', '{}'::jsonb, 'Filter type, area and design flow against your flow meter readings, plus the daily air release and backwash entries on your operation record.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.11(a), (b)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.11', 'verified', 80),

  ((select id from p), 'POOL-1102', 'Hold the disinfectant residual and pH, and test and record them every swimming period', 'With chlorine, at least 0.6 mg/l free chlorine when pH is 7.8 or below, or at least 1.5 mg/l when pH is between 7.8 and 8.2. Never above 5.0 mg/l free chlorine or above pH 8.2 while the pool is in use. With bromine, fed continuously, pH held between 7.2 and 7.8, at least 1.5 and no more than 6 mg/l residual. Tests for pH and free and total chlorine or bromine are conducted and recorded at the beginning, during and at the end of each swimming period.', 'water', 'pool_log', '{}'::jsonb, 'Your chemical log. The engine reads the readings you enter in the Pool module and counts them for this season. Failing to hold the minimum residual is a listed public health hazard.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.11(c)(1), (2), (5)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.11', 'verified', 90),

  ((select id from p), 'POOL-1103', 'Keep a DPD test kit at the pool with reagents less than a year old', 'A DPD test kit capable of measuring pH and chlorine or bromine residuals, with reagents no more than one year old, has to be available at each pool. Where the county requires them, reagents for alkalinity and hardness tests as well. A pool with ozone generating equipment also tests for ozone under 6-1.29 item 11.5.1.', 'water', 'document', '{}'::jsonb, 'The kit itself with the reagent purchase or expiry dates visible, or your reagent replacement receipts for this season.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.11(c)(5)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.11', 'verified', 100),

  ((select id from p), 'POOL-1104', 'If you disinfect with chlorine gas, meet the gas handling rules and check the breathing apparatus monthly', 'Chlorinators and gas cylinders are housed in an enclosure separated from every other room by a tight partition, with an inspection window, a separate vent to the outside, and a motor-driven fan drawing from near floor level whose switch works from outside the room. Cylinders are secured from falling and the cylinder in use sits on a platform scale. A self-contained breathing apparatus is kept in a closed cabinet outside the chlorinator room, maintained in working order and checked monthly, and anyone operating the equipment has to be familiar with using it.', 'facility', 'inspection', '{}'::jsonb, 'The monthly breathing apparatus check log, plus photographs or a description of the chlorine room, scale, vent and fan switch. Mark this not applicable if you do not use gas chlorine.', 'monthly', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.11(c)(1)(i)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.11', 'verified', 110),

  ((select id from p), 'POOL-1105', 'Use, store and handle only approved pool chemicals, in labelled containers', 'Only chemicals approved for water supply use by the EPA, as food additives by the FDA, or by the State Commissioner of Health. Cyanuric acid based chlorine and any other chlorine stabiliser are prohibited outright, and a pool found using or containing a cyanuric compound has to be closed, drained and refilled before further use. Calcium hypochlorite needs a dry, aboveground, locked store, clean inert mixing materials, and the chemical poured into water and never water into the chemical. Every chemical container, including feeder containers, is clearly labelled. The method of adding chemicals has to be specified and approved in the safety plan, keep bathers away from concentrated chemicals, and be verified by water testing before bathers go in.', 'facility', 'document', '{}'::jsonb, 'Your chemical inventory with labels and safety data sheets, photographs of the store, and the chemical addition procedure in your pool safety plan. Unapproved chemicals or unapproved methods of application are a listed public health hazard.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.11(c)(1)(ii), (c)(4), (d)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.11', 'verified', 120),

  ((select id from p), 'POOL-1301', 'Keep pool waste water away from the pool and out of the drinking water', 'All waste water from the pool discharges so that it cannot be siphoned, flooded or otherwise pushed back into the pool, and the sanitary sewer serving the pool discharges to a public sewer or another approved disposal system.', 'sewage', 'inspection', '{}'::jsonb, 'Your backwash and waste line layout, and any air gap or backflow device on it. A cross-connection between the drinking water supply and pool water, or between the sewer and the backwash line, is a listed public health hazard.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.13', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.13', 'verified', 130),

  ((select id from p), 'POOL-1501', 'Provide and maintain toilets, lavatories and showers for the pool', 'Toilet facilities and lavatories are provided at the pool unless they are already available within 300 feet of it, or one floor level above or below the pool area. Bathhouse walls and floors are kept clean and free of cracks and open joints, with well drained floors. Fixtures stay clean and sanitary, toilets and dressing rooms are ventilated and maintained. Showers, where provided, deliver water between 90 and 110 degrees Fahrenheit at at least 1.5 gallons per minute per head, with working anti-scald valves, clean curtains and soap. Lavatories get soap, paper towels or hand dryers, covered waste receptacles, and sanitary napkin receptacles in the female toilets.', 'facility', 'inspection', '{}'::jsonb, 'A fixture count and the distance from the pool, plus measured shower temperatures and your bathhouse cleaning schedule.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.15', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.15', 'verified', 140),

  ((select id from p), 'POOL-1601', 'Fence the pool and lock it whenever it is not supervised', 'The pool is enclosed by a fence or other barrier at least four feet high, entered only through self-closing and positive self-latching doors or gates, with the latch knob or handle at least 40 inches above grade. The gate is locked and access prevented whenever the pool is not supervised. Fences built after 30 March 1988 meet the Uniform Code; on older fences no opening may exceed four inches.', 'facility', 'inspection', '{}'::jsonb, 'Measured fence height, latch height and gap width, plus your record of who locks the gate and when. Failing to provide and maintain an enclosure that prevents access outside opening hours is a listed public health hazard.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.16', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.16', 'verified', 150),

  ((select id from p), 'POOL-1701', 'Hold a certificate of electrical compliance for the pool', 'The operator of an existing pool has to possess a certificate of electrical compliance with the Uniform Code, issued by the New York Board of Fire Underwriters or an equivalent certifying agency.', 'facility', 'document', '{}'::jsonb, 'The certificate itself, from the Board of Fire Underwriters or your municipality''s equivalent inspector.', 'once', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.17(g)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.17', 'needs_verification', 160),

  ((select id from p), 'POOL-1702', 'Keep the pool electrics and lighting safe and the bottom visible', 'Lighting and other circuits in the pool area are protected by ground-fault circuit interrupters under the Uniform Code. Defects in the electrical system, including underwater and overhead lights and their lenses, are repaired immediately. Portable electrical devices such as announcing systems and radios are prohibited within reach of bathers, and no overhead wiring passes within 20 feet horizontally of the pool. Windows and lighting are adjusted to stop glare, and underwater lighting, or surface lighting where there is none, lets an observer on the deck clearly see every part of the pool including the bottom. Adequate emergency lighting is provided where night swimming is allowed and at indoor pools with no natural light; for an outdoor pool a maintained portable battery light is acceptable.', 'facility', 'inspection', '{}'::jsonb, 'Your GFCI test records, a note of the overhead wiring clearance, and the emergency light check. Overhead wires within 20 feet, unprotected circuits within 10 feet, and a failed emergency light are all listed public health hazards.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.17(a) to (f), (h), (i)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.17', 'verified', 170),

  ((select id from p), 'POOL-1901', 'Keep the water clear enough to see a four-inch disc on the bottom', 'The bottom and sidewalls stay free of sediment and visible soil and the surface free of visible floating matter. The water has to be clear enough that a four-inch black and white disc placed anywhere on the bottom is clearly visible from the sides of the pool at all times.', 'water', 'inspection', '{}'::jsonb, 'Your daily clarity check entry on the pool operation record. A pool bottom that is not visible is a listed public health hazard and closes the pool.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.19(d)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.19', 'verified', 180),

  ((select id from p), 'POOL-1902', 'Hold total alkalinity between 80 and 120 and keep the water chemically balanced', 'The chemical quality of the water may not irritate bathers'' eyes or skin or have other objectionable physiological effects. Total alkalinity is maintained between 80 and 120 mg/l and the water is chemically balanced. The permit-issuing official may require the operator to work out the saturation index under 6-1.30 monthly, or at whatever frequency is needed to keep clarity, disinfection, alkalinity and pH right.', 'water', 'document', '{}'::jsonb, 'Your chemical log showing alkalinity in the 80 to 120 range, and a saturation index calculation for each month your county asks for one.', 'monthly', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.19(c)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.19', 'needs_verification', 190),

  ((select id from p), 'POOL-1903', 'Collect microbiological samples when the county asks, at an approved laboratory', 'Microbiological samples are collected from the pool when the permit-issuing official determines it is necessary to evaluate water quality, and are examined in laboratories approved by the New York State Department of Health. Coliform bacteria should not exceed 4 per 100 millilitres in more than one sample a month, coliform should not be present in more than 10 percent of portions analysed in any month, and total bacteria should not exceed 200 per millilitre.', 'water', 'water_sample', '{}'::jsonb, 'The laboratory reports, with the lab''s NYSDOH approval number on them.', 'on_event', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.19(a), (b)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.19', 'verified', 200),

  ((select id from p), 'POOL-2001', 'Post the bather capacity and the hours, and keep to the capacity', 'The number of bathers in the pool at one time may not exceed the design bather capacity calculated under 6-1.29 item 3.0, and the operator is responsible for controlling the number so it is not exceeded. A sign is posted conspicuously in the pool area stating the maximum number of bathers, the hours the pool is open, and that use at any other time is prohibited.', 'facility', 'document', '{}'::jsonb, 'A photograph of the posted sign, the capacity calculation behind the number, and however you count bathers in and out. Overcrowding that results in poor supervision is a listed public health hazard.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.20', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.20', 'verified', 210),

  ((select id from p), 'POOL-2101', 'Name a pool operator, and a qualified treatment operator where the pool needs one', 'Each pool is maintained by a pool operator familiar with its equipment who complies with this Subpart and the conditions of the permit. A pool larger than 3,000 square feet of surface area, or any pool disinfected with gas chlorine, has to be maintained by a qualified swimming pool water treatment operator, meaning somebody who has completed a NYSDOH Water Treatment Plant Operator Certification Course Type A or B, or an adequate course in the safe operation and maintenance of pool treatment equipment.', 'personnel', 'document', '{}'::jsonb, 'The named operator and their training certificate. Certification tracking in the app has no pool operator category yet, so attach the certificate here.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.21(a), (b); 6-1.2(l)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.21', 'needs_verification', 220),

  ((select id from p), 'POOL-2102', 'Keep complete daily operation records at the pool for 12 months', 'Complete daily operation records are kept for each pool on forms approved or furnished by the State Commissioner of Health, and a copy is kept at the facility for 12 months after it is completed. The county may require reports to be submitted at intervals.', 'records', 'document', '{}'::jsonb, 'Your completed DOH-1323 sheets, or the county-approved equivalent, for every operating day of the season.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.21(c)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.21', 'verified', 230),

  ((select id from p), 'POOL-2201', 'Keep the most recent inspection report available at the pool', 'The permit-issuing official and their representatives have the right of entry and inspection, and the most recent report of inspection has to be available at every pool.', 'records', 'document', '{}'::jsonb, 'The county''s latest pool inspection report, held where staff can produce it.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.22', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.22', 'needs_verification', 240),

  ((select id from p), 'POOL-2301', 'Provide the supervision level your pool actually requires', 'Level IIa or IIb is required at white water slides, wave pools and aquatic amusements, and whenever the water is five feet or deeper, there are diving boards, there are flotation devices other than USCG Type I to III, there are deck slides, or the surface area exceeds 2,000 square feet. Level III is required at spa and wading pools. Level IV is only allowed where the water is under five feet and the surface area is 2,000 square feet or less. If you voluntarily staff above the required level, every supervision rule in the Subpart still applies to that staff.', 'supervision', 'document', '{}'::jsonb, 'Your pool dimensions, maximum depth and feature list set against the table, and the level you have written into your safety plan.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(a)(2), (a)(3)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 250),

  ((select id from p), 'POOL-2302', 'Staff the pool with lifeguards qualified under 6-1.31', 'Aquatic supervisory staff have to meet the qualifications in 6-1.31. A Level IIa pool lifeguard is at least 16, holds a current professional rescuer CPR certification lasting no more than a year, can swim 300 yards nonstop, surface dive to nine feet and bring up a 10 pound object, and tread water for a minute, and holds a current certificate from a recognised agency or 15 hours of accepted training within three years. Level IIb adds beach skills and 20 hours. Level III is 18 or over with current community CPR. Level IV is 18 or over with current community CPR.', 'personnel', 'certification', '{"cert_types": ["lifeguard"], "min_count": 1}'::jsonb, 'Current lifeguard certifications in the staff register. The engine counts unexpired certificates of type lifeguard.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(a)(3); 6-1.31', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.31', 'verified', 260),

  ((select id from p), 'POOL-2303', 'Cover the pool at one guard per 3,400 square feet, more when it fills up', 'At pools using Level II or III staff, at least one aquatic supervisory staff member of the required level per 3,400 square feet of pool surface area or fraction of it. Above 3,400 square feet, one more once bathers exceed or are likely to exceed half the bather capacity calculated at 25 square feet per bather. Enough staff for visual surveillance of every part of the pool that is open. Staff are at poolside providing direct supervision, except at Level IV pools and spa pools, and are engaged only in activities that involve direct supervision. When the required staff are also giving instruction, one more staff member at Level III or above is needed for each one instructing, and the plan has to describe how those two work together.', 'supervision', 'roster', '{}'::jsonb, 'Your guard schedule against the pool area and the day''s bather counts. Failing to provide adequate supervision is a listed public health hazard.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(a)(4), (5), (6)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 270),

  ((select id from p), 'POOL-2304', 'Put a supervising lifeguard on when three or more aquatic staff are required', 'A pool required to have Level II staff has to provide a supervising lifeguard whenever the facility is required to provide three or more aquatic staff. A supervising lifeguard is at least 18, holds Level IIb as a minimum, and has at least two seasons of adequate lifeguarding experience.', 'supervision', 'document', '{}'::jsonb, 'Who holds the role, their Level IIb certificate, and a note of their two prior seasons.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(a)(8); 6-1.2(n)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 280),

  ((select id from p), 'POOL-2305', 'Verify every lifeguard''s qualifications and keep the certificates at the pool', 'The facility operator is responsible for verifying the qualifications of aquatic supervisory staff, and copies of the certificates or other documents showing those qualifications are kept on file at the site and produced to the permit-issuing official on request.', 'personnel', 'document', '{}'::jsonb, 'The on-site file of guard certificates, and however you record that you checked each one is genuine and current.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(a)(9)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 290),

  ((select id from p), 'POOL-2306', 'If your pool runs at Supervision Level IV, do and log the daily visual check', 'Level IV facility personnel are on the premises at all times the pool is in use and carry out at least one visual check each day before the pool is used, confirming the pool complies with this Subpart including safety equipment and water quality. They then sign the log and record the time of inspection and the number of people using the pool. The operator provides and maintains that log.', 'supervision', 'document', '{}'::jsonb, 'The signed daily check log with times and headcounts. Mark this not applicable if your pool is guarded at Level II or III.', 'daily', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(a)(10)(ii)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 300),

  ((select id from p), 'POOL-2307', 'If your pool runs at Supervision Level IV, post the signs and hand out the swimmer statement', 'Two or more adults 18 or over have to be present whenever the pool is in use, with at least one on the deck. Children under 16 are accompanied at all times by a parent, guardian or similar responsible adult. A free telephone is conveniently located with the nearest police, fire, ambulance and hospital numbers posted. Required safety equipment is at poolside unless the safety plan says otherwise. A warning sign of at least 36 by 24 inches carries the two-adult rule, the under-16 rule, "Shallow Water, No Diving" where depth is under eight feet, how to summon CPR trained staff, and where the telephone is. Every patron is given a written statement or brochure with the same content before using the pool.', 'supervision', 'document', '{}'::jsonb, 'Photographs of the posted sign and telephone, and a copy of the patron statement you hand out. Mark this not applicable if your pool is guarded at Level II or III.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(a)(10)(i), (iii) to (vii)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 310),

  ((select id from p), 'POOL-2308', 'Keep the required lifesaving equipment and lifeguard chairs at the pool', 'Required lifesaving equipment is readily accessible near the deck at all pools and kept in good repair. The minimum is a first aid kit, either a commercial 24-unit kit or a supply of plasters, bandage compresses and self-adhering gauze, plus a pocket face mask or shield with a one-way valve. At Level IIa and IIb pools, add one rescue tube with attached line for each required lifeguard, a reaching pole at least 15 feet long, and a full size spine board with straps and hand holds. At Level IV pools, two USCG approved ring buoys at least 18 inches across with a quarter-inch line 1.5 times the pool width or 50 feet, whichever is less, plus a 15 foot reaching pole. Elevated lifeguard chairs are provided at all pools over 2,000 square feet using Level IIa or IIb staff, one per 3,400 square feet, sited for a clear unobstructed view of the bottom.', 'supervision', 'inspection', '{}'::jsonb, 'Your poolside equipment inventory and condition check. The register cannot tell pool rescue gear from beach rescue gear, so attach the check here rather than relying on the safety register.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(b)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 320),

  ((select id from p), 'POOL-2310', 'Write the pool safety plan sections on organisation and injury prevention', 'The written pool safety plan has to set out procedures for daily bather supervision and injury prevention. On DOH-2286 that is the chain of command, job duties and descriptions, daily inspection, rules and regulations, diving safety, deck slides, weather and water quality, bather capacity, supervision, and chemical storage and handling. Supervision is one of the components the checklist marks mandatory.', 'plan', 'plan_section', '{"categories": ["BATHING_ORGANIZATION", "BATHING_INJURY_PREVENTION"]}'::jsonb, 'Written in the Plan builder under the bathing facility sections. The county has to approve the plan and it is kept on file at the pool.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(c)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 330),

  ((select id from p), 'POOL-2311', 'Write the pool safety plan''s emergency section', 'The written pool safety plan has to set out procedures for reacting to emergencies, injuries and other incidents, providing first aid and summoning help. On DOH-2286 that is the chain of command flow chart, emergency phone numbers, consulting the rescue squad, emergency access, the evacuation route, first aid equipment, a first aid room or area, clearing the water in an emergency, communication systems, search procedures, epileptic seizures, chlorine gas leaks, practice drills and the incident log.', 'plan', 'plan_section', '{"categories": ["BATHING_EMERGENCY_PLAN"]}'::jsonb, 'Written in the Plan builder under the bathing facility emergency sections. Most of these components are marked mandatory on DOH-2286.', 'annual', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.23(c)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.23', 'verified', 340),

  ((select id from p), 'POOL-2401', 'Post the conduct placards and enforce the deck slide and starting block rules', 'Placards reciting the pollution prohibition, and the deck slide and starting block rules where those apply, are posted conspicuously at the pool or its enclosure and in the dressing rooms and offices. Urinating, discharging faecal matter, spitting and blowing the nose in the pool are prohibited. Sliding may not happen in water less than four feet deep and only feet forward. Starting blocks are prohibited except during competitive swimming or swimmer training.', 'facility', 'document', '{}'::jsonb, 'Photographs of the posted placards, and the same rules written into your pool rules sheet.', 'seasonal', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.24(b) to (e)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.24', 'verified', 350),

  ((select id from p), 'POOL-2501', 'If you operate a spa or hot tub, meet the extra spa rules', 'Spa water may not exceed 104 degrees Fahrenheit, with a thermostatic control and a maintained audible alarm warning of anything above that. pH is held between 7.2 and 7.8 with at least 1.5 mg/l free residual chlorine and never more than 5.0 during use, and the spa is chlorinated to 10 mg/l at least once a week while it is not in use. With bromine, 3 to 6 mg/l residual and the same pH range. The spa is drained and cleaned when needed and at least once every two weeks. A warning sign of at least three square feet carrying the six caution statements from 6-1.29 item 14.13 is posted next to it.', 'facility', 'document', '{}'::jsonb, 'Your spa log showing weekly superchlorination and the fortnightly drain and clean, the alarm test, and a photograph of the caution sign. Mark this not applicable if you have no spa or hot tub.', 'weekly', '{"has_pool": true}'::jsonb, '10 NYCRR 6-1.25', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-1.25', 'verified', 360)
on conflict (profile_id, req_code) do update
  set label = excluded.label, summary = excluded.summary, category = excluded.category,
      evidence_type = excluded.evidence_type, evidence_rule = excluded.evidence_rule,
      evidence_hint = excluded.evidence_hint, frequency = excluded.frequency,
      applies_when = excluded.applies_when, citation = excluded.citation,
      citation_url = excluded.citation_url, verify_status = excluded.verify_status,
      sort_order = excluded.sort_order;

-- ─── Subpart 6-2, bathing beaches ────────────────────────────────────────────
with p as (select id from compliance_profiles where code = 'NY-BEACH')
insert into compliance_requirements
  (profile_id, req_code, label, summary, category, evidence_type, evidence_rule,
   evidence_hint, frequency, applies_when, citation, citation_url, verify_status, sort_order)
values
  ((select id from p), 'BEACH-0701', 'Report any beach injury or illness incident within 24 hours and log it', 'A full report of any injury or illness incident at the bathing beach goes to the permit-issuing official within 24 hours and is recorded in a logbook. This covers anything that results in death, requires resuscitation, requires referral to a hospital or other facility for medical attention, or is a bather illness associated with the bathing water quality.', 'records', 'document', '{}'::jsonb, 'The beach logbook, plus a copy of each report sent to the county and the date it went.', 'on_event', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.7', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.7', 'verified', 10),

  ((select id from p), 'BEACH-0801', 'Get plans approved before you establish, build or modify the beach', 'A bathing beach may not be established, constructed or physically modified until plans and specifications have been submitted to and approved by the permit-issuing official. The plans have to be prepared by an engineer or architect licensed in New York, and are reviewed against the beach design standards in 6-2.19. Plans for any on-site water or sewage treatment need approval before construction too.', 'facility', 'document', '{}'::jsonb, 'The county''s written plan approval and the stamped drawings. DOH-2436 is the engineering report that goes with them.', 'on_event', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.8', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.8', 'verified', 20),

  ((select id from p), 'BEACH-0901', 'File a construction compliance certificate before opening new work', 'Before new facilities or equipment open, the operator files a construction compliance certificate with the permit-issuing official, prepared and signed by a New York licensed professional engineer or architect, stating that the beach, buildings and appurtenances were built to the approved plans.', 'facility', 'document', '{}'::jsonb, 'The signed and sealed certificate, and proof it was filed with the county.', 'on_event', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.9', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.9', 'verified', 30),

  ((select id from p), 'BEACH-1001', 'Hold a sanitary survey showing the watershed is fit to swim in', 'A bathing area is only approved where a sanitary survey verifies the watershed is free of sewage and untreated sewage discharges, or that known waste water discharges or other contamination do not adversely affect water quality or beach use on a historical rainfall and bacteriological model. A sanitary survey means an evaluation of the contributory watershed and the bathing area for sources of pollution and safety hazards, including soil conditions, underwater topography, water movement, submerged and other hazardous objects, water depth in the diving area, seasonal water level variation and water quality. A beach on the watershed of a public water supply also has to comply with the watershed rules. An impoundment under four acres may not be used for bathing unless the survey holds up or at least 100 gallons per person per day of dilution water meeting the beach standards flows through.', 'water', 'document', '{}'::jsonb, 'The sanitary survey report for your waterfront, with the date it was carried out and who did it.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.10(a)(1), (2); (b); 6-2.2(b)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.10', 'needs_verification', 40),

  ((select id from p), 'BEACH-1002', 'Mark the swimming, wading and diving areas with float lines', 'The swimming and bathing areas are provided with float lines that clearly show the perimeter, the separation of shallow and deep water, the wading area, the diving area, and dropoffs, radical changes in slope or underwater obstructions. Swimming outside the marked area is prohibited. This does not apply on the shores of Lake Erie, Lake Ontario, Long Island Sound or the Atlantic Ocean unless the county requires it.', 'recreation', 'inspection', '{}'::jsonb, 'Your waterfront layout showing the lines and buoys as set, plus the pre-season check that they are in place and sound. Failing to delineate the swimming area is a listed public health hazard.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.10(a)(4); 6-2.17(b)(5)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.10', 'verified', 50),

  ((select id from p), 'BEACH-1301', 'Provide and maintain toilets, handwashing and showers at the beach', 'Adequate toilet and handwashing facilities are provided at every bathing beach. Bathhouse walls and floors are free from cracks and open joints and the floors should drain well. Toilet facilities and dressing rooms are adequately lit, ventilated and maintained. Showers, where provided, deliver water between 90 and 110 degrees Fahrenheit at at least 1.5 gallons per minute per head with working anti-scald valves. Toilet facilities get soap, paper towels or hand dryers, covered waste receptacles, and sanitary napkin receptacles in the female toilets. Any bathing suits and towels you furnish or rent are washed in hot water with detergent, rinsed and dried after each use.', 'facility', 'inspection', '{}'::jsonb, 'A fixture count for the beach, measured shower temperatures, and your bathhouse cleaning schedule.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.13', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.13', 'verified', 60),

  ((select id from p), 'BEACH-1401', 'Put the beach under a competent named operator', 'Each bathing beach is under the supervision of a competent operator who requires careful observance of the sanitary rules in this Part and the conditions of the permit. That operator is responsible for sample collection and analysis when the county requires it and for assuring safe water quality, for controlling decorum and activities at the site, for supplying adequate supervisory personnel, for reporting injuries, deaths and communicable disease, and for maintaining the physical facilities.', 'personnel', 'document', '{}'::jsonb, 'Who holds the role this season, in writing, and the duties they have been given.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.14; 6-2.18(a)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.14', 'verified', 70),

  ((select id from p), 'BEACH-1501', 'Sample the bathing water at the frequency and locations the county sets', 'Sample collection and analysis, when required for surveillance or design, follows the frequency, locations and procedures specified by the permit-issuing official. Every sample taken from a bathing beach is examined in a laboratory holding State Department of Health certification for water supplies.', 'water', 'water_sample', '{}'::jsonb, 'Every laboratory report for this season, with the lab''s NYSDOH certification and the sampling points marked.', 'ongoing', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.15(b)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.15', 'needs_verification', 80),

  ((select id from p), 'BEACH-1502', 'Close the beach when the water quality fails', 'A beach may not be operated on any body of water when the county determines the water quality is a potential hazard to health. That determination weighs the sanitary survey, the historical rainfall water quality model, any verified spill or discharge affecting the bathing area, and the bacteriological indicator levels. A single sample may not exceed 1,000 fecal coliform, 61 enterococci in fresh water, 104 enterococci in marine water, or 235 E. coli in fresh water, all per 100 ml. The log mean over 30 days may not exceed 2,400 total coliform, 200 fecal coliform, 33 enterococci in fresh water, 35 enterococci in marine water, or 126 E. coli in fresh water. When those levels are exceeded the county investigates the source and decides whether the beach closes.', 'water', 'document', '{}'::jsonb, 'Your closure procedure written into the beach safety plan, and the record of any closure and reopening this season.', 'ongoing', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.15(a), (c)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.15', 'verified', 90),

  ((select id from p), 'BEACH-1503', 'Keep the water free of hazards and control algae and weed', 'The water has to be free of chemical substances capable of creating toxic reactions or skin or membrane irritation. Physical inspection has to verify the water is free of deposits, growths, oils, greases or other substances capable of creating a health or safety hazard. Algae and aquatic vegetation are controlled so no hazard results, and any chemical used to control them may not create toxic reactions or irritation while the beach is operating.', 'water', 'inspection', '{}'::jsonb, 'Your daily waterfront condition check, plus product labels and application dates for any algaecide or weed treatment you use.', 'daily', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.15(d), (e), (f)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.15', 'verified', 100),

  ((select id from p), 'BEACH-1601', 'Supervise or patrol every part of your shoreline where people can get in', 'All areas of the operator''s property that are next to the designated public beach area and are accessible to the public for entry into the water for bathing are supervised or patrolled during hours of operation. Bathing is prohibited wherever the required supervision is not provided.', 'supervision', 'document', '{}'::jsonb, 'A map of your shoreline showing which stretches are supervised or patrolled and which are signed closed, plus the patrol schedule.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.16(a)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.16', 'verified', 110),

  ((select id from p), 'BEACH-1602', 'Post the bathing hours and the maximum number of bathers', 'The operator maintains signs stating the hours during which public bathing is allowed and that bathing at other times is prohibited. A sign stating the maximum number of people who may use the beach at one time is posted in a conspicuous place. Where the beach is closed or unsupervised, signs indicating that swimming is prohibited are required.', 'facility', 'document', '{}'::jsonb, 'Photographs of the posted signs. Missing signs prohibiting swimming when the beach is closed or unsupervised is a listed public health hazard.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.16(b), (i)(3); 6-2.4(b)(8)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.16', 'verified', 120),

  ((select id from p), 'BEACH-1603', 'Keep boats, vehicles, glass and electrics out of the bathing area', 'No motorised vehicles except emergency and maintenance vehicles on the beach. No boating, water skiing, fishing or surfboarding in the bathing area during the hours bathing is allowed, though separate areas for them may be marked with floating lines and buoys. Bathing at night or during electrical thunderstorms is prohibited. No plug-in electrical devices, such as portable announcing systems and radios, within 20 feet of the water. No glass containers on the beach.', 'recreation', 'document', '{}'::jsonb, 'Your posted waterfront rules and the marked separation of the boating area from the swimming area, plus the thunderstorm procedure in your beach safety plan.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.16(c), (d), (e), (h), (j)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.16', 'verified', 130),

  ((select id from p), 'BEACH-1605', 'Mark the depths and post No Diving where the water is under eight feet', 'Clearly visible depth markings are provided at all diving boards, platforms, piers, floats and similar facilities. Warning signs stating "No Diving" are provided wherever the water is less than eight feet deep. Diving is not permitted unless the minimum depths in 6-2.19 item 4.8.2 are there.', 'recreation', 'inspection', '{}'::jsonb, 'Measured depths at every dock, platform and float, and photographs of the depth markings and No Diving signs.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.16(f), (g)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.16', 'verified', 140),

  ((select id from p), 'BEACH-1606', 'Hold the beach to one bather per 25 square feet of water', 'The number of bathers in the water may not exceed one per 25 square feet of water surface, and in water deeper than four feet at least 75 square feet per bather. The operator is responsible for restricting usage so the maximum capacity is not exceeded.', 'supervision', 'roster', '{}'::jsonb, 'Your calculated capacity from the marked area, and however you count bathers in and out at each swim period.', 'daily', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.16(i)(1), (2)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.16', 'verified', 150),

  ((select id from p), 'BEACH-1701', 'Provide the supervision level your beach actually requires', 'Level I is required at ocean surf beaches. Level IIb is required when any of these are present: water five feet or deeper within the designated bathing area, diving boards, flotation devices other than USCG Type I to III, bottom conditions hazardous to bathers, aquatic amusements, a bathing area perimeter 50 feet or more from shore, a beach bottom slope steeper than 1 in 8, or slides discharging into the water. Level IV is only allowed where the water is under five feet and the perimeter is less than 50 feet from shore. If you voluntarily staff above the required level, every supervision rule in the Subpart still applies to that staff.', 'supervision', 'document', '{}'::jsonb, 'Your measured depths, slope, perimeter distance and feature list set against the table, and the level written into your beach safety plan.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(2), (a)(3)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 160),

  ((select id from p), 'BEACH-1702', 'Staff the beach with lifeguards qualified under 6-2.20', 'Aquatic supervisory staff have to meet the qualifications in 6-2.20. A Level I surf lifeguard is at least 16, holds current professional rescuer CPR lasting no more than a year, and has at least 20 hours of accepted training plus an ocean skills test completed before assignment, valid no more than three years. A Level IIb pool and beach lifeguard is at least 16, holds current professional rescuer CPR, can swim 300 yards nonstop, surface dive to nine feet and bring up a 10 pound object and tread water for a minute, and holds a current certificate or 20 hours of accepted training within three years.', 'personnel', 'certification', '{"cert_types": ["lifeguard"], "min_count": 1}'::jsonb, 'Current lifeguard certifications in the staff register. The engine counts unexpired certificates of type lifeguard.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(3); 6-2.20', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.20', 'verified', 170),

  ((select id from p), 'BEACH-1703', 'Write the beach safety plan sections on organisation and injury prevention', 'The written beach safety plan has to set out procedures for daily bather supervision and injury prevention. On DOH-2286 that is the chain of command, job duties and descriptions, daily inspection, rules and regulations, diving safety, weather and water quality, bather capacity, supervision, and chemical storage and handling. At an ocean surf beach the plan has to be developed in consultation with somebody who has adequate ocean surf lifeguarding experience.', 'plan', 'plan_section', '{"categories": ["BATHING_ORGANIZATION", "BATHING_INJURY_PREVENTION"]}'::jsonb, 'Written in the Plan builder under the bathing facility sections. The county has to approve the plan and it is kept on file at the beach.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(c)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 180),

  ((select id from p), 'BEACH-1704', 'Write the beach safety plan''s emergency section', 'The written beach safety plan has to set out procedures for reacting to emergencies, injuries and other incidents, providing first aid and summoning help. On DOH-2286 that is the chain of command flow chart, emergency phone numbers, consulting the rescue squad, emergency access, the evacuation route, first aid equipment, a first aid room or area, clearing the water in an emergency, communication systems, search procedures, epileptic seizures, practice drills and the incident log.', 'plan', 'plan_section', '{"categories": ["BATHING_EMERGENCY_PLAN"]}'::jsonb, 'Written in the Plan builder under the bathing facility emergency sections. Most of these components are marked mandatory on DOH-2286.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(c)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 190),

  ((select id from p), 'BEACH-1705', 'Cover the beach at one guard per 50 yards of beach front', 'At beaches required to use Level I or II staff, at least one aquatic supervisory staff member of the required level per 50 yards of beach front or fraction of it, and enough staff for visual surveillance of the whole bathing area that is open. Staff at Level I to III beaches are at the beachfront giving direct supervision, and are engaged only in activities that involve direct supervision. When instruction is happening and the required staff are also instructing, additional staff at Level III or above are needed wherever the instruction may reasonably be expected to distract them from supervising all bathers. The county may require more staff for beach shape, diving board use, patron decorum, alcohol, or where the facility is used mainly by people with developmental disabilities.', 'supervision', 'roster', '{}'::jsonb, 'Your guard schedule against the measured beach front and the day''s bather counts. Failing to provide adequate supervision is a listed public health hazard.', 'daily', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(4), (5), (6), (7)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 200),

  ((select id from p), 'BEACH-1706', 'Put a supervising lifeguard on when three or more aquatic staff are required', 'A beach required to use Level I or II staff has to provide a supervising lifeguard whenever the facility is required to provide three or more aquatic supervisory staff. A supervising lifeguard is at least 18, holds Level IIb as a minimum, and has at least two seasons of adequate lifeguarding experience.', 'supervision', 'document', '{}'::jsonb, 'Who holds the role, their Level IIb certificate, and a note of their two prior seasons.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(8); 6-2.2(h)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 210),

  ((select id from p), 'BEACH-1707', 'Verify every lifeguard''s qualifications and keep the certificates at the beach', 'The facility operator is responsible for verifying the qualifications of aquatic supervisory staff, and copies of the certifications or other documents showing those qualifications are kept on file at the site and made available to the department on request.', 'personnel', 'document', '{}'::jsonb, 'The on-site file of guard certificates, and however you record that you checked each one is genuine and current.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(9)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 220),

  ((select id from p), 'BEACH-1708', 'If your beach runs at Supervision Level IV, do and log the daily beachfront check', 'Level IV beach personnel are on the premises at all times the beach is in use and carry out at least one visual beachfront check before it is used, confirming the beach complies with this Subpart including safety equipment and water conditions. They then sign or initial the log and record the time of inspection and the number of people using the facility. The operator provides and maintains that log.', 'supervision', 'inspection', '{"categories": ["water"], "types": ["waterfront_check"]}'::jsonb, 'Waterfront check items in the safety register, with their due dates kept current. Mark this not applicable if your beach is guarded at Level I or II.', 'daily', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(10)(ii)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 230),

  ((select id from p), 'BEACH-1709', 'If your beach runs at Supervision Level IV, post the signs and hand out the swimmer statement', 'Two or more adults 18 or over have to be present whenever the beach is in use, with at least one on the beachfront. Children under 16 are accompanied at all times by a parent, guardian or similar responsible adult. A free, conveniently located telephone is provided with the nearest police, fire, ambulance and hospital numbers posted. Required safety equipment is on site. A warning sign of at least 36 by 24 inches carries the two-adult rule, the under-16 rule, "Swim only within the designated bathing area", how to summon CPR trained staff, and where the telephone is. Every patron is given a written statement or brochure with the same content before using the facility.', 'supervision', 'document', '{}'::jsonb, 'Photographs of the posted sign and telephone, and a copy of the patron statement you hand out. Mark this not applicable if your beach is guarded at Level I or II.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(10)(i), (iii) to (vii)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 240),

  ((select id from p), 'BEACH-1710', 'Keep the required lifesaving equipment, chairs and patrol craft at the beach', 'Lifesaving equipment is readily accessible at all bathing beaches. The minimum is a first aid kit, either a commercial 24-unit kit or a supply of plasters, bandage compresses and self-adhering gauze, plus a pocket face mask or shield with a one-way valve. At Level I and IIb beaches, add one rescue tube or torpedo buoy with attached line for each required lifeguard, a rescue board or lifeboat meeting 6-2.19 item 6.2.1, and a full size spine board with straps and hand holds. At Level IV beaches, one USCG approved ring buoy at least 18 inches across with a quarter-inch 50 foot line and a 15 foot reaching pole. Each lifeguard stand carries a whistle or megaphone and an umbrella or sunshade. Elevated chairs are provided at all Level I and IIb beaches, at least one per 50 yards of supervised beach front or at the locations in the approved safety plan, sited for a clear unobstructed view. Where swimming or diving is permitted more than 150 feet from shore, lifesaving patrol boats or offshore lifesaving stations are required. All safety equipment has its function plainly marked and is kept ready.', 'supervision', 'inspection', '{}'::jsonb, 'Your waterfront equipment inventory and condition check. The register cannot tell beach rescue gear from pool rescue gear, so attach the check here rather than relying on the safety register. Missing lifesaving equipment is a listed public health hazard.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(b)(1) to (5)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 250),

  ((select id from p), 'BEACH-1711', 'If you consistently draw 500 or more bathers, provide an emergency care building', 'A bathing beach with consistent actual bather use of 500 or more has to have and maintain a readily accessible building for emergency care, equipped with an advanced first aid kit and a resuscitator.', 'medical', 'document', '{}'::jsonb, 'Where the building is, and its kit and resuscitator inventory. Mark this not applicable if your beach never carries 500 bathers.', 'seasonal', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(b)(6)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 260),

  ((select id from p), 'BEACH-1712', 'If your beach is an ocean surf beach, run a PAD programme and keep an AED on site', 'At an ocean surf beach at least one Level I aquatic supervisory staff member holding a current AED training certificate approved by a nationally recognised organisation or the State emergency medical services council has to be present at all hours of operation, and records of that training are kept available for inspection. At least one automated external defibrillator is provided by the operator and maintained on site, and the operator runs a Public Access Defibrillation programme under section 3000-b of the Public Health Law. Three records are kept on site for inspection: the collaborative agreement with an emergency health care provider, the notification to the regional emergency medical services council of the existence, location and type of the AED, and the AED maintenance and testing records the manufacturer specifies.', 'medical', 'document', '{}'::jsonb, 'The collaborative agreement, the EMS council notification, the AED maintenance log, and the surf guard''s AED training certificate. Mark this not applicable if your waterfront is a lake or river.', 'annual', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.17(a)(4)(i), (b)(1)(ii)(a); 6-2.2(i)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.17', 'verified', 270),

  ((select id from p), 'BEACH-1801', 'Keep daily beach operating records at the facility for 12 months', 'The beach operator maintains daily records showing the daily number of bathers using the beach, the number of lifeguards on duty, weather conditions, water clarity, the results of any water quality laboratory reports, and reported rescues, injuries and illnesses. Once completed the records are kept at the facility for 12 months. The county may require reports to be submitted at intervals.', 'records', 'document', '{}'::jsonb, 'Your completed DOH-2287 sheets, or the county-approved equivalent, for every operating day of the season.', 'daily', '{"has_waterfront": true}'::jsonb, '10 NYCRR 6-2.18(b)', 'https://www.law.cornell.edu/regulations/new-york/10-NYCRR-6-2.18', 'verified', 280)
on conflict (profile_id, req_code) do update
  set label = excluded.label, summary = excluded.summary, category = excluded.category,
      evidence_type = excluded.evidence_type, evidence_rule = excluded.evidence_rule,
      evidence_hint = excluded.evidence_hint, frequency = excluded.frequency,
      applies_when = excluded.applies_when, citation = excluded.citation,
      citation_url = excluded.citation_url, verify_status = excluded.verify_status,
      sort_order = excluded.sort_order;

-- ─── Personal records ────────────────────────────────────────────────────────
-- The incident log names the bather who was hurt or fell ill and what happened to them. That
-- is somebody else's health record and it belongs where the camp keeps its medical records,
-- not in a general document store next to an Upload button. The county inspects the logbook
-- where it lives.
--
-- Deliberately NOT flagged: POOL-2305 and BEACH-1707, the on-site file of lifeguard
-- certificates. Those the camp should hold in the platform, in the staff register, which is
-- exactly where the qualification records belong. Flagging them would tell a camp not to do
-- the thing the product is for.
update compliance_requirements set holds_personal_records = true
 where req_code in ('POOL-0701', 'BEACH-0701');

-- ─── Who reviews these ───────────────────────────────────────────────────────
-- The county health department holds the bathing facility permit and walks the pool and the
-- waterfront on the same visit it inspects the camp. The state writes Part 6 and publishes
-- the DOH forms; it does not visit. So all 64 go to the county, with no exceptions: unlike
-- the camp code there is no rule here that creates an obligation toward anybody else.
update compliance_requirements r
   set authority_id = a.id
  from compliance_authorities a,
       compliance_profiles pr
 where a.code = 'WESTCHESTER-DOH'
   and pr.id = r.profile_id
   and pr.code in ('NY-POOL', 'NY-BEACH')
   and r.authority_id is null;

-- ─── Deadlines ───────────────────────────────────────────────────────────────
-- Shapes and the sign convention are documented at the top of
-- 20260830120000_compliance_deadlines.sql. Nothing in Subpart 6-1 or 6-2 is measured from a
-- camp's opening day, so nothing here uses relative_to_opening or fixed. Every real deadline
-- in these two Subparts is either an incident clock, a retention period or a construction
-- trigger, and all three are recorded as notes rather than forced into a wrong date.
--
-- The 30-day permit application clocks in 6-1.5(b) and 6-2.5(b) are deliberately absent:
-- 6-1.3(b) and 6-2.3(b) exempt a children's camp pool or beach from those sections entirely.

update compliance_requirements
   set deadline_rule = '{"note": "6-1.7: within 24 hours of the incident. The clock starts at the incident, not at the season, so it cannot be shown as a date."}'::jsonb
 where req_code = 'POOL-0701';

update compliance_requirements
   set deadline_rule = '{"note": "6-2.7: within 24 hours of the incident. The clock starts at the incident, not at the season, so it cannot be shown as a date."}'::jsonb
 where req_code = 'BEACH-0701';

update compliance_requirements
   set deadline_rule = '{"note": "6-1.8: approval has to be in hand before installation, construction, addition or modification starts. Triggered by the work, not by the season."}'::jsonb
 where req_code = 'POOL-0801';

update compliance_requirements
   set deadline_rule = '{"note": "6-2.8: approval has to be in hand before the beach is established, constructed or physically modified. Triggered by the work, not by the season."}'::jsonb
 where req_code = 'BEACH-0801';

update compliance_requirements
   set deadline_rule = '{"note": "6-1.9: filed before the public uses the new facilities or equipment. Triggered by the work, not by the season."}'::jsonb
 where req_code = 'POOL-0901';

update compliance_requirements
   set deadline_rule = '{"note": "6-2.9: filed before the new facilities or equipment open. Triggered by the work, not by the season."}'::jsonb
 where req_code = 'BEACH-0901';

update compliance_requirements
   set deadline_rule = '{"note": "6-1.21(c): each completed daily record is kept at the facility for 12 months from its own completion date, so the retention clock runs per sheet."}'::jsonb
 where req_code = 'POOL-2102';

update compliance_requirements
   set deadline_rule = '{"note": "6-2.18(b): each completed daily record is kept at the facility for 12 months from its own completion date, so the retention clock runs per sheet."}'::jsonb
 where req_code = 'BEACH-1801';

update compliance_requirements
   set deadline_rule = '{"note": "6-1.11(c)(5): reagents may be no more than one year old. Measured from each reagent bottle''s own date, not from opening day."}'::jsonb
 where req_code = 'POOL-1103';

update compliance_requirements
   set deadline_rule = '{"note": "6-1.25(c)(1) and (d): superchlorinate to 10 mg/l at least weekly while the spa is out of use, and drain and clean at least once every two weeks. The frequency field has no fortnightly option, so it carries the weekly duty and this note carries the other."}'::jsonb
 where req_code = 'POOL-2501';

update compliance_requirements
   set deadline_rule = '{"note": "6-1.11(c)(1)(i): the self-contained breathing apparatus is checked monthly. Measured from the previous check, not from opening day."}'::jsonb
 where req_code = 'POOL-1104';

-- ─── The pool and beach forms ────────────────────────────────────────────────
-- Filed with the county along with everything else, so they hang off WESTCHESTER-DOH. The
-- DOH ones are the state's, which `issued_by` records. Four are bundled; the two Westchester
-- bathing facility packets are bundled too, but they are the forms a camp uses only when the
-- county permits the bathing facility separately from the camp, and the obtain_note says so.
--
-- Guard matches 20260830130000: dedupe on title, because several of these carry no
-- designation and `designation is not distinct from null` would collapse them into one.
insert into compliance_authority_forms
  (authority_id, designation, title, revision, bundled_path, page_ref, issued_by, source_url, obtain_note, fillable, sort_order)
select a.id, v.designation, v.title, v.revision, v.bundled, v.pages, v.issued_by, v.url, v.obtain, v.fillable, v.ord
from (values
  ('WESTCHESTER-DOH', 'DOH-1323',
   'Report on Operation of Swimming Pool', '(10/04)',
   '/forms/ny/doh-1323.pdf', null,
   'NYS Department of Health',
   'https://www.health.ny.gov/forms/doh-1323.pdf',
   null, false, 70),

  ('WESTCHESTER-DOH', 'DOH-2287',
   'Daily Report on Beach Operation', '(5/04)',
   '/forms/ny/doh-2287.pdf', null,
   'NYS Department of Health',
   'https://www.health.ny.gov/forms/doh-2287.pdf',
   null, false, 71),

  ('WESTCHESTER-DOH', 'DOH-1309',
   'Engineering Report for Swimming Pool Plans', '(1/93)',
   '/forms/ny/doh-1309.pdf', null,
   'NYS Department of Health',
   'https://www.health.ny.gov/forms/doh-1309.pdf',
   'Only needed when you build a new pool or change an existing one. Prepared by your engineer or architect, not by the camp.', false, 72),

  ('WESTCHESTER-DOH', 'DOH-2436',
   'Engineering Report for Bathing Beaches', '(1/16)',
   '/forms/ny/doh-2436.pdf', null,
   'NYS Department of Health',
   'https://www.health.ny.gov/forms/doh-2436.pdf',
   'Only needed when you establish a new beach or change an existing one. Prepared by your engineer or architect, not by the camp.', false, 73),

  ('WESTCHESTER-DOH', null,
   'Original Permit to Operate a Bathing Facility, application package', '2025 packet',
   '/forms/ny/wcdoh-bathing-facility-application.pdf', null,
   'Westchester County Department of Health',
   'https://health.westchestercountyny.gov/images/stories/Environmental%20Forms/Pool%20Beach/WCDOH%20BATHING%20FACILITY%20ORIGINAL%20APPLICATION%202025.pdf',
   'For a bathing facility permitted separately from the camp. A camp pool or beach is normally permitted with the camp instead, on the children''s camp application. Filed no later than 30 days before operation, with a complete safety plan.', false, 74),

  ('WESTCHESTER-DOH', null,
   'Certification that Bathing Facility Safety Plans Are Up-To-Date', '2025',
   '/forms/ny/wcdoh-bathing-plan-certification.pdf', null,
   'Westchester County Department of Health',
   'https://health.westchestercountyny.gov/images/stories/Environmental%20Forms/Pool%20Beach/WCDOH%20CERTIFICATION%20THAT%20BATHING%20FACILITY%20SAFETY%20PLANS%20ARE%20UP%20TO%20DATE%202025.pdf',
   'Use in place of resubmitting the pool or beach safety plan when nothing about the facility, its personnel or its procedures has changed since last season. Separate signature blocks for the 6-1.23(c) pool plan and the 6-2.17(c) beach plan.', false, 75)
) as v(auth_code, designation, title, revision, bundled, pages, issued_by, url, obtain, fillable, ord)
join compliance_authorities a on a.code = v.auth_code
where not exists (
  select 1 from compliance_authority_forms f
   where f.authority_id = a.id and f.title = v.title
);

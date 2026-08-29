-- Guidance for the written safety plan builder.
--
-- compliance_plan_templates held the DOH-2040 component list and nothing else: a code, a
-- category, a title and a sort order. In the product that renders as a heading and an empty
-- textbox. A director who opens "Lightning Risk Assessment" or "Passive Activity Supervision"
-- has no way to know what New York expects under it, and the page does not get finished.
--
-- Two columns fix that:
--
--   prompt     one or two sentences saying what the section has to cover, in the director's
--              language, not the regulation's.
--   checklist  two to five concrete things the section should mention, as bare phrases the
--              director can tick off while writing.
--
-- THE ACCURACY RULE. These columns never state a requirement 10 NYCRR Subpart 7-2 does not
-- contain. Where the regulation gives a number, a ratio, a frequency or a named element, it is
-- said out loud, because that is the part camps get wrong; every such number was read in the
-- section text and is logged with its subsection in docs/compliance/plan-guidance-notes.md.
-- Where the regulation only names a topic and leaves the content open (lightning, discipline,
-- lost camper, ropes courses), the guidance describes what a reviewer is looking for and does
-- not invent a rule.
--
-- These are prompts, not answers. Nothing here is a sentence the camp can paste into its plan.
-- A safety plan that is our words with their name on it is worthless to them and a liability
-- to us, and the permit-issuing official is the one who decides whether a section is adequate.
--
-- Source for every citation: 10 NYCRR Subpart 7-2, read at Cornell LII (10-NYCRR-7-2.2 through
-- 7-2.23), plus the DOH-2040 checklist itself. Sections cited: 7-2.2, 7-2.4, 7-2.5, 7-2.6,
-- 7-2.7, 7-2.8, 7-2.9, 7-2.10, 7-2.11, 7-2.15, 7-2.16, 7-2.17, 7-2.18, 7-2.19, 7-2.20, 7-2.21,
-- 7-2.22, 7-2.23.

alter table compliance_plan_templates add column if not exists prompt text;
alter table compliance_plan_templates add column if not exists checklist jsonb;

comment on column compliance_plan_templates.prompt is
  'What this plan section must cover, in plain language. Grounded in 10 NYCRR Subpart 7-2 where the regulation is specific. Never states a rule the regulation does not contain.';
comment on column compliance_plan_templates.checklist is
  'JSON array of short phrases the section should mention. Prompts, not model answers.';

-- ─── Table of contents ───────────────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$List every component of your plan in the order DOH-2040 lists them, with the page each one starts on. Subpart 7-2.5(n) requires a table of contents as part of the plan, and the page numbers you record here are what the county marks against on their checklist.$p$,
  checklist = $c$["every DOH-2040 component in order","the page each section starts on","which components you marked not applicable","the date of this version of the plan"]$c$::jsonb
where code = 'TOC';

-- ─── Personnel ───────────────────────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$Say who reports to whom, from the operator down to the newest counselor, and who is in charge when the camp director is off site. Name positions rather than people so the section survives a staffing change mid-season.$p$,
  checklist = $c$["who the camp director reports to","who reports directly to the director","who covers when the director is off site","where the chain of command is posted","when staff are walked through it"]$c$::jsonb
where code = 'PERS-01';

update compliance_plan_templates set
  prompt = $p$Give a written description of every position at your camp: the duties, who the person reports to, and the age and certification the job requires. The code sets minimum ages for several of these, so make sure your descriptions do not fall below them.$p$,
  checklist = $c$["duties for each position","reporting line for each position","minimum age per position (counselors 18 at overnight camps, 16 at day camps)","required certifications per position","how counselor-in-training duties differ from counselor duties"]$c$::jsonb
where code = 'PERS-02';

update compliance_plan_templates set
  prompt = $p$Describe how you verify a hire before they start: reference checks, proof of every certification the job requires, and the Sex Offender Registry check. Subpart 7-2.5(l) requires that registry check before the employee or volunteer starts work and again annually before they arrive, and requires you to keep a written record of the names you submitted and the results you got back.$p$,
  checklist = $c$["how references are contacted and documented","who collects and files certification copies","Sex Offender Registry check before the first day of work and annually after","the written record of names submitted and results returned","where qualification records are kept for inspection"]$c$::jsonb
where code = 'PERS-03';

-- ─── Facility operation ──────────────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$Describe your drinking water: the source, the treatment, and the sampling. Subpart 7-2.6(f)(1) requires a total coliform sample from each source before the season opens and at least one more during the season, and for a camp operating more than 30 days in a calendar year, a sample for each month the camp is in operation. A positive total coliform or E. coli result goes to the permit-issuing official within 24 hours.$p$,
  checklist = $c$["the source and who tests it","pre-season sample, in-season sample, and monthly sampling if you operate more than 30 days","annual start-up disinfection 15 days before occupancy","the 24-hour report of a positive sample","how non-potable outlets are labelled"]$c$::jsonb
where code = 'FAC-01';

update compliance_plan_templates set
  prompt = $p$Describe the septic system or systems, what they serve, and how they are maintained and pumped. Subpart 7-2.7(c) prohibits sewage on the ground surface or accessible to children, so say who checks for it and who you call when it happens.$p$,
  checklist = $c$["what each system serves","inspection and pumping schedule","who reports a backup or surfacing, and to whom","that a plan goes to the permit-issuing official at least 30 days before any new or modified system is built"]$c$::jsonb
where code = 'FAC-02';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(2) requires a lightning risk assessment but does not set a detection method or a wait time. A reviewer is looking for a decision that does not depend on judgement in the moment: how a storm is detected, who has authority to stop activities, where people shelter, and how long you wait before resuming.$p$,
  checklist = $c$["how approaching weather is detected and who is watching","who calls the suspension and how it is broadcast","the shelter for each part of camp, including the waterfront and any remote areas","how long it takes to move the furthest group to shelter","the wait before activities resume"]$c$::jsonb
where code = 'FAC-03';

update compliance_plan_templates set
  prompt = $p$Describe the vehicles you use to move campers and how they are kept road-legal and equipped. Subpart 7-2.10 requires a driver at least 18 with a current licence, at least one counselor in any vehicle carrying children (who may be the driver), and a first aid kit, tools, a fire extinguisher and flares or reflective triangles in every vehicle. Passengers may not ride in a truck bed or trailer, seat belts are used where fitted, and occupancy is capped at the vehicle's rated capacity.$p$,
  checklist = $c$["the vehicles and who owns them","driver licensing and the minimum age of 18","registration and inspection records","required kit in each vehicle","that occupancy never exceeds rated capacity"]$c$::jsonb
where code = 'FAC-04';

update compliance_plan_templates set
  prompt = $p$Describe your sleeping quarters and how they are kept safe and clean. Subpart 7-2.16 requires clean sheets and pillowcases weekly, at least 27 inches of clear space above a sleeping surface and six feet between the heads of sleepers, guardrails on upper bunks, and no triple-decker beds. An undivided sleeping room may hold no more than 36 occupants.$p$,
  checklist = $c$["what housing you have and who sleeps where","weekly linen change, or laundry for campers who bring their own","bunk condition, guardrails, and spacing between beds","aisles and access to exits kept clear","how bedding and mattresses are checked before issue"]$c$::jsonb
where code = 'FAC-05';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.19 puts your kitchen, dining areas and food service under Part 14 of Title 10 and requires food you provide to be sufficient in quantity and quality for each child's nutritional needs. Describe how the kitchen is run and who is responsible, rather than restating Part 14.$p$,
  checklist = $c$["who runs food service and their food protection training","how you meet Part 14 (own permit, or the camp permit covering it)","cooking, holding and cooler temperature monitoring","how allergies and special diets are handled","cleaning and dishwashing"]$c$::jsonb
where code = 'FAC-06';

update compliance_plan_templates set
  prompt = $p$Describe how the grounds, buildings, fixtures and program equipment are kept in safe condition, and who does it. Subpart 7-2.11(f)(2) requires program equipment to be inspected by the camp operator at frequent intervals, and Subpart 7-2.9 sets the fixture counts an inspector will count: one toilet or privy seat per 15 males plus one urinal per 30 males, one toilet or privy seat per 15 females, one lavatory per 20 occupants, all within 200 feet of sleeping quarters, and one shower head per 20 occupants with water heated to between 110 and 120 degrees Fahrenheit.$p$,
  checklist = $c$["who inspects buildings, grounds and equipment, and how often","toilet, lavatory and shower counts against occupancy","shower water temperature between 110 and 120 degrees","pesticides and toxic chemicals stored in original containers in a designated area","refuse storage, and control of insects, rodents, bats and noxious weeds"]$c$::jsonb
where code = 'FAC-07';

update compliance_plan_templates set
  prompt = $p$Describe the physical waterfront and how it is maintained: docks, floats, decking, markings, barriers and rescue equipment. Subpart 7-2.11(a)(3) requires piers, floats, platforms and decking in good repair, visible depth markings, supervised entrances and exits, a lifeguard station with an unobstructed view of the swimming area, and pool fencing with gates locked except when a lifeguard is on duty.$p$,
  checklist = $c$["what the waterfront consists of and its zones","who inspects it and how often","float lines, depth markings and barriers","lifeguard station sightlines and rescue equipment","diving areas cleared of obstructions, or diving prohibited"]$c$::jsonb
where code = 'FAC-08';

-- ─── Fire safety ─────────────────────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$Say how buildings and the property are evacuated, where everyone assembles, and how you account for every camper and staff member once there. Subpart 7-2.5(n)(3) requires evacuation, assembly, supervision and accounting for campers and staff to all be covered.$p$,
  checklist = $c$["the route out of each building and where it leads","the assembly area, and an alternate","who takes the headcount and against what roster","who is told the count and who authorises re-entry","what happens when someone is missing"]$c$::jsonb
where code = 'FIRE-01';

update compliance_plan_templates set
  prompt = $p$Describe the rules and housekeeping that keep a fire from starting. Subpart 7-2.18(e) requires gasoline, kerosene and other flammable materials to be labelled and stored in a separate locked, unoccupied building, oil-base paints and thinners in approved paint lockers or a separate building, and all tents to be flame retardant. Subpart 7-2.18(d) bars water heaters from sleeping quarters, and 7-2.15(b) prohibits unvented fossil fuel heaters.$p$,
  checklist = $c$["smoking rules and where they apply","where open flames and campfires are allowed and who supervises","flammable liquid storage in a separate locked building","heaters and stoves installed and used per the manufacturer","flame-retardant tents"]$c$::jsonb
where code = 'FIRE-02';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.17 requires all existing electrical service, wiring and fixtures to be in good repair and safe condition, and sets no inspection interval. Say who checks, how often, and how a fault gets reported and taken out of service until it is fixed.$p$,
  checklist = $c$["who inspects wiring, fixtures and cords, and how often","how a fault is reported and who fixes it","rules on extension cords, space heaters and camper appliances","generators and any temporary power"]$c$::jsonb
where code = 'FIRE-03';

update compliance_plan_templates set
  prompt = $p$Describe your detection and alarm coverage, and how it is tested and maintained. Subpart 7-2.18(b) requires at least one single-station smoke alarm on or near the ceiling in each sleeping unit (battery devices are acceptable, tents and lean-tos are exempt), an alarm audible throughout the camp in any building used for sleeping by 50 or more people or any sleeping building two stories or more, an automatic detection system in sleeping buildings three stories or more, and portable audible or visual detectors in sleeping quarters used by visually or audibly impaired campers.$p$,
  checklist = $c$["a smoke alarm in every sleeping unit","which buildings need a camp-wide alarm system","how the alarm sounds and where it can be heard","testing and battery replacement schedule, and who records it","detectors for campers who are visually or audibly impaired"]$c$::jsonb
where code = 'FIRE-04';

update compliance_plan_templates set
  prompt = $p$Say what extinguishers you have, where they are, and how they are kept serviceable. Subpart 7-2.18(e)(3) requires extinguishers and other firefighting equipment to be provided, inspected and tagged by the camp operator before the camp season and maintained in operating condition at all times, and 7-2.18(b)(5) makes the operator responsible for regular inspection of all fire protection equipment.$p$,
  checklist = $c$["type and location of each extinguisher","pre-season inspection and tagging by the operator","the interval for routine checks and who does them","who is trained to use one","how a discharged or failed unit is replaced"]$c$::jsonb
where code = 'FIRE-05';

update compliance_plan_templates set
  prompt = $p$Describe how exits are kept usable and marked. Subpart 7-2.18(c) requires sleeping quarters with 15 or more occupants to have at least two separate means of egress located as far apart as practical, two means of egress from each floor of a multi-storey building, exit doors at least 28 inches wide that are non-locking against egress and open with a single motion, and lighted exit signs for rooms occupied by 15 or more people or where exits are not readily visible.$p$,
  checklist = $c$["exit count for each sleeping and assembly building","doors that swing in the direction of egress and never lock against it","exit signs and any emergency lighting","who checks that exits and paths stay clear, and how often","hooks, bolts and bars kept off egress doors"]$c$::jsonb
where code = 'FIRE-06';

update compliance_plan_templates set
  prompt = $p$Say when drills happen and how they are recorded. Subpart 7-2.18(b)(4) requires a fire drill within the first 48 hours of each camping session and periodically after that in line with your safety plan, and requires a log of drill dates and times, verified by the camp director and available for inspection at all times.$p$,
  checklist = $c$["the drill within the first 48 hours of each session","how often drills run after that","what the log records and where it is kept","that the camp director verifies the log","how a slow or failed drill is followed up"]$c$::jsonb
where code = 'FIRE-07';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(3) requires a copy of the fire safety segment of your plan to be given to the local fire district or department, and requires coordination with local fire officials. Record who you sent it to and when, and say who calls the fire department in an emergency. Fires that destroy or damage a camp building, result in the fire department being notified, or are life or health threatening go to the permit-issuing official within 24 hours.$p$,
  checklist = $c$["the fire district or department that received the segment, and the date","the contact there and how you coordinate","who dials 911 and who meets the apparatus","the 24-hour fire report to the permit-issuing official","access routes and any water supply the department relies on"]$c$::jsonb
where code = 'FIRE-08';

-- ─── Medical plan ────────────────────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$Name your health director, state their qualification, and outline their duties and coverage. Subpart 7-2.8(a) requires the health director to be on site at an overnight camp; at a day camp they must be available as your plan specifies, and if they are not on site they must designate an assistant. The health director or designee holds current first aid and CPR certificates, and beyond them you need one staff member with current first aid and one with current CPR for each 200 campers.$p$,
  checklist = $c$["who the health director is and their qualification","on-site coverage, or the named designee and how they are reached","duties: health centre, medications, log, notifications","one first aid certified and one CPR certified staff member per 200 campers","that first aid certificates run no more than three years and CPR no more than one year"]$c$::jsonb
where code = 'MED-01';

update compliance_plan_templates set
  prompt = $p$Describe the space where sick or injured campers are cared for. Subpart 7-2.8(b) requires an overnight camp to have an infirmary with hot and cold running water, an examining room, isolation and convalescent space, a bathroom with flush toilets and showers, and medical supplies, or alternate provisions written into this plan. A day camp needs a holding area for ill or injured children acceptable to the permit-issuing official.$p$,
  checklist = $c$["where it is and how it is reached, including by vehicle","examining area, beds and isolation space","bathroom with flush toilets and showers","where medication and supplies are kept","telephone and posted emergency numbers"]$c$::jsonb
where code = 'MED-02';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(4) requires the plan to cover storage and administration of medicines but does not prescribe a method. Say who may give a medication, on what authority, where medications are held, and how each dose is recorded.$p$,
  checklist = $c$["how medication is collected and stored, including anything refrigerated","who may administer, and against what written order","what is written in the medication record for each dose","campers who carry their own emergency medication","what happens to leftover medication at the end of a session"]$c$::jsonb
where code = 'MED-03';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(4) requires a description of universal precautions for bloodborne pathogens. Say what protective supplies are available, where they are, and what a staff member does after contact with blood or body fluid.$p$,
  checklist = $c$["gloves and barrier supplies, and where they are kept","how spills and contaminated material are cleaned up and disposed of","handwashing after contact","what a staff member reports after an exposure, and to whom","who trains staff on this and when"]$c$::jsonb
where code = 'MED-04';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(4) requires both an initial health screening of campers and daily health surveillance. Say who does each, when, and what they look for.$p$,
  checklist = $c$["who screens campers on arrival and what they check","how daily health surveillance is carried out and by whom","what gets sent to the health centre","how routine complaints are recorded","when a parent is called"]$c$::jsonb
where code = 'MED-05';

update compliance_plan_templates set
  prompt = $p$Describe what happens in a medical emergency and in a suspected outbreak, and who provides the medical, nursing and emergency medical services you rely on. Subpart 7-2.8(d) requires anyone suspected of a communicable disease to be suitably isolated, and 7-2.5(n)(4) requires this section to cover the response to an allegation of child abuse as well.$p$,
  checklist = $c$["who takes charge and who calls for outside help","the hospital or medical provider you use, and the travel time","how a camper is isolated and who decides","what triggers an outbreak response and who you notify","how an abuse allegation is handled and reported"]$c$::jsonb
where code = 'MED-06';

update compliance_plan_templates set
  prompt = $p$Say how you collect and review each camper's confidential medical history. Subpart 7-2.8(c)(1) requires a current history on file for every camper, updated annually, including immunisation dates for diphtheria, haemophilus influenzae type b, hepatitis B, measles, mumps, poliomyelitis, rubella, tetanus and varicella, plus an emergency contact for every camper and staff member. An overnight camp must also give parents of campers staying seven or more consecutive nights written meningococcal meningitis information and the state-approved immunisation response form, returned annually and kept on file.$p$,
  checklist = $c$["what the health history form collects and when it is due","the immunisation record and its annual update","emergency contact details for campers and staff","the meningococcal information and response form for stays of seven or more nights","where the records are kept and who can see them"]$c$::jsonb
where code = 'MED-07';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(4) requires the plan to cover review of camper medical histories to address restrictions and special needs. Say how a known condition turns into something the counselor actually does differently.$p$,
  checklist = $c$["who reviews conditions and flags them before the session","how a restriction reaches the counselor and activity leader without disclosing more than needed","how allergies and dietary needs get to the kitchen","care plans for conditions that need one","what is reviewed again mid-session"]$c$::jsonb
where code = 'MED-08';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.8(d) requires every camper and staff injury, illness and reportable disease to be reported to the health director and recorded in the medical log. Say what each entry contains, who writes it, and where the log lives.$p$,
  checklist = $c$["what a log entry records","who makes the entry and when","that staff injuries and illnesses go in it too","where the log is kept and who can read it","how the log is retained after the season"]$c$::jsonb
where code = 'MED-09';

update compliance_plan_templates set
  prompt = $p$Say who makes a report to the permit-issuing official and how fast. Subpart 7-2.8(d) sets a 24-hour deadline for any camper or staff death, resuscitation, hospital admission or administration of epinephrine, rabies exposure, camper eye, head, neck or spine injury referred for treatment, second or third degree burns to five percent or more of the body, bone fracture or dislocation, laceration requiring sutures, a physical or sexual abuse allegation, and any illness suspected of being water-borne, food-borne, air-borne or spread by contact.$p$,
  checklist = $c$["the list of reportable events","who makes the report and who is the backup","the 24-hour deadline and how you evidence it","the contact details for your permit-issuing official","when parents and the operator are told"]$c$::jsonb
where code = 'MED-10';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(4) requires the plan to include provisions to supervise sanitation at the camp. Say who has that job day to day and what they check.$p$,
  checklist = $c$["who supervises sanitation and who they report to","cleaning schedule for toilets, showers and washrooms","handwashing supplies and where campers wash before meals","that no common drinking utensil is provided","what a failed check triggers"]$c$::jsonb
where code = 'MED-11';

-- ─── Activities and supervision ──────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$State the supervision ratios you run and how staff account for campers. Subpart 7-2.5(c) sets 1:10 for children eight and over and 1:8 for children under eight at an overnight camp, with no more than 20 percent of the required counselors aged 17; 7-2.5(d) sets 1:12 at a summer day or traveling day camp. Subpart 7-2.5(o) defines adequate supervision as visual or verbal communication between camper and counselor during activities plus a method of accounting for a camper's whereabouts at all times.$p$,
  checklist = $c$["the ratio you hold, by camper age and camp type","how a counselor keeps visual or verbal contact","the method of accounting for camper whereabouts","behaviour expectations and what is prohibited","who handles a discipline problem and when parents are told"]$c$::jsonb
where code = 'ACT-01';

update compliance_plan_templates set
  prompt = $p$List the passive activities you run, because Subpart 7-2.5(b)(1) requires them to be described in the approved plan before you may use the reduced ratio. That ratio is no greater than 1:25, and it applies only to an activity in a defined area where campers are spectators or have limited mobility and use no tools or equipment other than computers. Normal ratios come back the moment the passive activity ends.$p$,
  checklist = $c$["which of your activities are passive, named individually","the defined area each one happens in","the 1:25 ratio and who counts","that code ratios resume when the activity ends","which activities you deliberately do not treat as passive"]$c$::jsonb
where code = 'ACT-02';

update compliance_plan_templates set
  prompt = $p$Say how campers are supervised while resting or sleeping. Subpart 7-2.5(c)(1) lets you modify the ratio during those hours only at a level the permit-issuing official accepts and only if it is described in this plan, and requires in all cases that at least one counselor is present on every level of a multi-storey building used for resting or sleeping. Normal ratios resume when the rest period ends.$p$,
  checklist = $c$["the ratio you propose for rest and sleeping hours","how the sleeping areas are arranged and what staff can see or hear","a counselor on every sleeping level","night rounds and how staff are reached","that code ratios resume afterwards"]$c$::jsonb
where code = 'ACT-03';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(5) requires supervision between activities to be described, and 7-2.5(o)(2) requires a method of accounting for a camper's whereabouts at all times. Say how a group gets from one activity to the next without anyone being left behind or unsupervised.$p$,
  checklist = $c$["who moves with the group and who stays at the activity","the count taken before leaving and on arrival","handover between two activity leaders","free time and bathroom trips","what happens the moment a camper is unaccounted for"]$c$::jsonb
where code = 'ACT-04';

update compliance_plan_templates set
  prompt = $p$Say how campers are supervised in vehicles. Subpart 7-2.10(b) requires at least one counselor in any vehicle transporting children, who may also be the driver, and 7-2.11(i) requires a minimum ratio of 1:12 when campers are transported by motor vehicle to an activity site. Seat belts are used where fitted and occupancy never exceeds the rated capacity.$p$,
  checklist = $c$["the 1:12 ratio for transport to an activity site","who counts campers on and off the vehicle","seating, seat belts and rated capacity","behaviour rules in the vehicle","what the driver does after a breakdown or a crash"]$c$::jsonb
where code = 'ACT-05';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(5) requires supervision in emergencies to be described. Say what a counselor does with their group when something goes wrong somewhere else in camp, so that responding to one incident does not leave other campers unsupervised.$p$,
  checklist = $c$["who takes charge of the incident","what every other staff member does with their group","how campers are counted and where they wait","how staff are reached (radio, phone, whistle, bell)","who calls outside help and who calls parents"]$c$::jsonb
where code = 'ACT-06';

update compliance_plan_templates set
  prompt = $p$Describe how swimming at your own pool or beach is staffed and zoned. Subpart 7-2.11(a)(3) requires one qualified lifeguard for every 25 bathers, with no lifeguard covering more than 3,400 square feet of pool surface or 50 yards of shoreline; a counselor-to-camper ratio in the water of 1:10, 1:8 for children under eight and 1:6 for children under six; the aquatics director directly supervising; and non-swimmers restricted to water less than chest deep, marked so they are distinguishable from swimmers.$p$,
  checklist = $c$["the swim areas you use, approved as part of this plan","one lifeguard per 25 bathers and the area each one covers","in-water counselor ratios by camper age","how swimming ability is assessed, by a progressive swimming instructor, before a camper swims","how non-swimmers are identified and confined"]$c$::jsonb
where code = 'ACT-07';

update compliance_plan_templates set
  prompt = $p$Describe your buddy and board system in enough detail that a substitute could run it. Subpart 7-2.11(a)(3)(iv) requires an accounting system naming each bather with their swimming ability and assigned area, a record of entry to and exit from the water, buddies paired at the same ability level with one threesome allowed per swim area, and checks of all bathers at least every 15 minutes referenced against that accounting system.$p$,
  checklist = $c$["the board system, showing each bather by name with their ability, assigned area, and entry and exit","pairing by matched ability, and the one permitted threesome per area","buddy checks at least every 15 minutes","what buddies are told to do when a partner is missing or in distress","any substitute method for campers who cannot use the buddy system"]$c$::jsonb
where code = 'ACT-08';

update compliance_plan_templates set
  prompt = $p$Say where you swim away from camp and how each site is staffed. Subpart 7-2.11(a)(4) requires a signed parent or guardian permission for each camper, use only of permitted New York pools and beaches or state-operated ones, no residential pools, and pre-arrangement with the facility. Where the facility supplies its own lifeguards you provide one qualified lifeguard or trained camp staff member for every 75 campers; where it does not, you provide one qualified lifeguard for every 25 bathers. The counselor ratio is 1:8, or 1:6 for campers under six.$p$,
  checklist = $c$["the sites you use and their permit status","the signed permission slip for every camper","the pre-arrangement with the facility, and whose lifeguards are on duty","camp-supplied lifeguards, 1 per 75 campers where the facility guards, 1 per 25 bathers where it does not, with counselor ratios of 1:8 or 1:6 under six","for wilderness sites: marked area, no water deeper than five feet, no swimming between sunset and sunrise"]$c$::jsonb
where code = 'ACT-09';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.11(j) requires written procedures, approved by the permit-issuing official, before campers enter water deeper than the mid-calf of the shortest camper on a hike or similar activity. It prohibits immersion when the depth cannot be determined or when the depth or current does not allow a safe crossing, and requires staff to test the entire area before campers enter.$p$,
  checklist = $c$["where crossings happen and who decides they are safe","the mid-calf depth line that triggers these procedures","staff testing the whole area first","when a crossing is called off","how the group is spaced and counted across"]$c$::jsonb
where code = 'ACT-10';

update compliance_plan_templates set
  prompt = $p$Describe your boats, who may use them, and how you supervise. Subpart 7-2.11(h) requires every boat occupant to wear a Coast Guard approved life jacket or vest, motorised boats to be registered with the DMV with the number displayed on the bow and current registration and inspection certificates available, and a lifeguard aboard any watercraft with a capacity of eight or more carrying non-swimmers. Boats may be used only with the permission of the aquatics director or camp director, are never towed while carrying passengers, and stay out of the swimming area except for rescue.$p$,
  checklist = $c$["the craft you have, who may take them out, and DMV registration and inspection for motorised boats","life jackets worn by every occupant","the 1:8 ratio for boating, or 1:6 for campers under six","who leads each specialty (canoeing, sailing, waterskiing) and their training","the boundaries campers may boat within, and recall"]$c$::jsonb
where code = 'ACT-11';

update compliance_plan_templates set
  prompt = $p$Describe how riding is run. Subpart 7-2.11(d) requires a competent riding instructor to assess each camper's experience and skill before assigning a horse and deciding ring or trail, one experienced instructor for every 10 riders on a trail excursion with a minimum of two staff accompanying it, protective headgear permanently labelled as meeting or exceeding ASTM F1163 worn at all times, and either shoes with heels or closed stirrups.$p$,
  checklist = $c$["who assesses riding ability and how horses are assigned","one instructor per 10 riders on the trail, and at least two staff on the excursion","ASTM F1163 labelled helmets worn at all times","footwear with heels or closed stirrups","tack inspection and how the barn area is supervised"]$c$::jsonb
where code = 'ACT-12';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(5) names rope and challenge courses as an activity the plan must address, but Subpart 7-2 sets no course standard. A reviewer is looking for who is qualified to run it, how the structure and gear are inspected, and what happens when a participant has to be brought down.$p$,
  checklist = $c$["the elements you operate, who runs the course, and what training or certification they hold","inspection of structure, ropes, harnesses and hardware, and how often","the ratio you hold and the spotting or belay rules","the participant briefing and how a camper opts out","the rescue procedure and who performs it"]$c$::jsonb
where code = 'ACT-13';

update compliance_plan_templates set
  prompt = $p$Describe the range and how shooting is supervised. Subpart 7-2.11(c) requires the range to be sited so it endangers no one and to be clearly marked to warn passing campers, at least 50 yards of clearance or an archery net behind each target, a common firing line with a ready line marked behind it, bows and arrows stored in a locked cabinet, and a staff-to-camper ratio of one for every 10 campers on the firing line.$p$,
  checklist = $c$["where the range is, how the danger area is marked, and 50 yards of clearance or a net behind each target","the firing line and the ready line","one staff member per 10 campers on the firing line","bows and arrows locked away when not in use","who runs the range and their archery training"]$c$::jsonb
where code = 'ACT-14';

update compliance_plan_templates set
  prompt = $p$Describe the range, the instructor, and how firearms are controlled. Subpart 7-2.11(b) requires backstops that contain bullets, large "keep out" signs atop the backstop facing away from the firing line, a red flag flown when the range is in use, a firing line and a ready line, single-shot rifles, one staff person for a maximum of 10 campers on the firing line, and guns and ammunition stored separately in locked cabinets under a check-out system. State the minimum age you allow, which 7-2.11(b)(3) requires to follow article 265 of the Penal Law and to be specified here.$p$,
  checklist = $c$["range layout, backstop, warning signs and the red firing flag","the instructor's NRA or equivalent certificate, and the assisting counselor","one staff person per 10 campers on the firing line","the minimum age you allow, its Penal Law basis, and camper instruction before any live firing","guns and ammunition stored separately in locked cabinets, with a check-out system"]$c$::jsonb
where code = 'ACT-15';

update compliance_plan_templates set
  prompt = $p$Describe how a trip is planned, staffed and supervised. Subpart 7-2.11(i) requires a trip leader and at least one counselor on every camp trip, a minimum ratio of 1:8 for swimming, wilderness, equestrian, boating and similar specialised trips (1:6 for campers under six), 1:12 while campers are being transported by motor vehicle, and a review of the safety plan by the supervising staff within 24 hours before departure unless they ran an identical trip or attended pre-camp training within the previous week.$p$,
  checklist = $c$["the trip leader's qualification, the staff who go, and first aid and CPR where medical care is not readily available","ratios of 1:8, 1:6 under six, and 1:12 in vehicles","the plan review within 24 hours before departure","the itinerary left at camp and how the group is reached","headcounts en route and what happens if a camper is separated"]$c$::jsonb
where code = 'ACT-16';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(5) lists specific activities but says "including but not limited to", so cover every remaining activity that carries risk. Subpart 7-2.11(g) requires an activity leader competent in the activity to supervise each on-site activity, and a minimum of one activity leader plus one staff member wherever additional camp staff are not readily available.$p$,
  checklist = $c$["each remaining activity, named","the hazard in each one and the rule that controls it","who leads it and what makes them competent","the ratio you hold for it","equipment checks and storage"]$c$::jsonb
where code = 'ACT-17';

update compliance_plan_templates set
  prompt = $p$Cover the beach specifically, separately from pool swimming: how the shoreline is zoned, where guards sit, and how far out campers may go. Subpart 7-2.11(a)(3) limits each lifeguard to 50 yards of shoreline, requires lifesaving patrol boats or offshore lifesaving stations where swimming or diving is permitted more than 150 feet from shore, and requires the camp aquatics director to directly supervise the bathing beach.$p$,
  checklist = $c$["the swimmer and non-swimmer areas and how they are bounded","50 yards of shoreline per lifeguard, where each guard sits, and the rescue equipment there","patrol boat or offshore station if swimming goes beyond 150 feet from shore","the aquatics director on duty and what they oversee","conditions that close the beach"]$c$::jsonb
where code = 'ACT-18';

-- ─── Staff training ──────────────────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(6) requires a training curriculum outline. Set out the topics, who teaches each one, and when it happens relative to campers arriving. Subpart 7-2 does not set a number of training hours, so say what yours are.$p$,
  checklist = $c$["the topics, in the order you teach them","who delivers each topic","when training runs and how long it lasts","how a staff member hired mid-season is trained before working","refreshers during the season"]$c$::jsonb
where code = 'TRN-01';

update compliance_plan_templates set
  prompt = $p$Say how new staff are physically walked around camp, and what they are shown. This is the training-side counterpart to the camper tour, so cover the places staff need that campers do not.$p$,
  checklist = $c$["who leads the tour and when","boundaries and out-of-bounds areas","health centre, assembly area, alarm points and extinguishers","waterfront, activity areas and the maintenance area","how the tour is recorded"]$c$::jsonb
where code = 'TRN-02';

update compliance_plan_templates set
  prompt = $p$List the hazards particular to your property and say how staff are taught to manage each one. A reviewer is looking for hazards specific to this camp, not generic ones.$p$,
  checklist = $c$["the hazards on your site, named and located","the rule or barrier that controls each","which areas are off limits and to whom","seasonal or weather-driven hazards","how a new hazard gets communicated mid-season"]$c$::jsonb
where code = 'TRN-03';

update compliance_plan_templates set
  prompt = $p$Say how staff are taught the chain of command and how they use it in practice. This is the training record; the structure itself belongs in the personnel section.$p$,
  checklist = $c$["when the chain of command is covered in training","who a counselor goes to first","how staff escalate outside normal hours","where staff can see it posted","how attendance at this topic is recorded"]$c$::jsonb
where code = 'TRN-04';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained to hold the supervision ratios and to handle camper behaviour. Cover the ratios they must maintain: 1:10 for campers eight and over and 1:8 under eight at an overnight camp, 1:12 at a day camp, and no greater than 1:25 during a described passive activity.$p$,
  checklist = $c$["the ratios staff must hold and when they change","how staff account for campers throughout the day","what behaviour management is permitted and what is prohibited","when a counselor escalates rather than handling it","supervision expectations for one-to-one contact with campers"]$c$::jsonb
where code = 'TRN-05';

update compliance_plan_templates set
  prompt = $p$Say how staff are taught to recognise signs of abuse or maltreatment, who they tell, and how fast. Subpart 7-2.8(d) requires a camper physical or sexual abuse allegation to reach the permit-issuing official within 24 hours, so make clear that a staff member reports internally immediately rather than investigating.$p$,
  checklist = $c$["signs and behaviours staff are taught to notice","who a staff member tells, immediately, and who is the backup","that staff do not investigate on their own","the 24-hour report to the permit-issuing official","supervision practices that reduce the opportunity for abuse"]$c$::jsonb
where code = 'TRN-06';

update compliance_plan_templates set
  prompt = $p$Say what first aid and emergency medical response training staff receive, and who holds current certificates. Subpart 7-2.8(a)(2) requires one staff member with a current first aid certificate and one with a current CPR certificate for each 200 campers, in addition to the health director or designee.$p$,
  checklist = $c$["who holds current first aid and CPR certificates","the per-200-camper coverage","what an uncertified counselor is expected to do first","where first aid supplies are and who restocks them","how staff summon the health director"]$c$::jsonb
where code = 'TRN-07';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained to report an injury or illness. Subpart 7-2.8(d) requires every camper and staff injury, illness and reportable disease to reach the health director and be recorded in the medical log, so staff need to know that nothing is too minor to pass on.$p$,
  checklist = $c$["what a staff member reports and to whom","that all injuries and illnesses go to the health director","what the staff member writes down and when","the serious events that trigger a 24-hour report","how staff illness is reported"]$c$::jsonb
where code = 'TRN-08';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained to run the buddy and board system, not only to know it exists. Subpart 7-2.11(a)(3)(iv) requires bather checks at least every 15 minutes referenced against the accounting system, so staff should practise a check before campers arrive.$p$,
  checklist = $c$["who is trained to run the board and call checks","the 15-minute check interval and how it is timed","how staff pair campers by matched ability","what a staff member does when a buddy pair does not answer","practice runs during pre-camp training"]$c$::jsonb
where code = 'TRN-09';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained on the lost swimmer plan. Subpart 7-2.11(a)(3)(iv) requires the plan to detail clearing the water, searching, and supervising the campers who are present, and requires it to be implemented whenever a buddy check fails to account for all bathers or a bather is reported missing.$p$,
  checklist = $c$["the signal that clears the water and who gives it","who searches the water and who searches the shore","who supervises and counts the campers out of the water","when the plan is triggered","how often staff rehearse it"]$c$::jsonb
where code = 'TRN-10';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained on the lost camper plan. Subpart 7-2 requires the topic but does not set a procedure, so a reviewer is looking for a sequence with times and named roles rather than a general intention to search.$p$,
  checklist = $c$["what a counselor does in the first minutes","who is told and how the alarm is raised","how the rest of the camp is gathered and counted","the search areas and who covers each","when police and parents are called"]$c$::jsonb
where code = 'TRN-11';

update compliance_plan_templates set
  prompt = $p$Say what trip staff are trained on before they lead one. Subpart 7-2.11(i) requires staff supervising a camp trip to review the safety plan within 24 hours before departure, unless they ran an identical trip or attended pre-camp training within the previous week.$p$,
  checklist = $c$["the plan review within 24 hours before departure and who records it","ratios and headcount procedure on the road","what the trip carries: first aid kit, communications, itinerary","what staff do if the group is separated or the trip is cut short","activity-specific training for what the trip will do"]$c$::jsonb
where code = 'TRN-12';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained on your lightning procedure, so that the person furthest from the office knows what to do without being told.$p$,
  checklist = $c$["how staff learn a suspension has been called","the shelter each activity area moves to","who clears the waterfront and how long it takes","counting campers at the shelter","who tells staff activities may resume"]$c$::jsonb
where code = 'TRN-13';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained on fire safety and on running a drill. Subpart 7-2.18(b)(4) requires a drill within the first 48 hours of each camping session, so staff need to know their role before campers arrive.$p$,
  checklist = $c$["each staff role during an alarm","how the alarm is raised and who may raise it","use of extinguishers and who is trained","the drill within the first 48 hours of a session","who records the drill and verifies the log"]$c$::jsonb
where code = 'TRN-14';

update compliance_plan_templates set
  prompt = $p$Say how staff are trained to evacuate the whole camp, not only a single building. Cover what happens when campers cannot return to their housing.$p$,
  checklist = $c$["what triggers a full camp evacuation and who calls it","routes off the property and the assembly point beyond it","transport and who drives","accounting for campers and staff at the destination","how parents are contacted"]$c$::jsonb
where code = 'TRN-15';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(6) requires activity specific training for the activities staff are assigned to. Say what each activity leader is trained or certified in before they run it, and how you record that. The code names several of these qualifications directly, including the aquatics director's lifeguard supervision and management course and the riflery instructor's NRA or equivalent certificate.$p$,
  checklist = $c$["each activity and the training its staff receive","certifications the code requires, by activity","who signs off that a staff member is ready to run an activity","refresher or in-service training during the season","where the records are filed"]$c$::jsonb
where code = 'TRN-16';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(6) requires a process to document training attendance. Say what the record looks like, who keeps it, and how you catch someone who missed a topic.$p$,
  checklist = $c$["what the attendance record captures: topic, date, trainer, signatures","who keeps it and where","how a late hire is caught up and recorded","what happens when a staff member misses a required topic","how long records are kept and who can inspect them"]$c$::jsonb
where code = 'TRN-17';

-- ─── Camper orientation ──────────────────────────────────────────────────────

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(7) requires an orientation curriculum outline for campers. Say what campers are told, by whom, and when, and how a camper arriving mid-session gets it.$p$,
  checklist = $c$["the topics covered, in order","who delivers it and when in the session","how it is pitched to your youngest campers","how a late arrival is oriented","what campers are asked to repeat back"]$c$::jsonb
where code = 'ORI-01';

update compliance_plan_templates set
  prompt = $p$Say how campers are walked around camp at the start of a session and what they are shown, including where the boundaries are.$p$,
  checklist = $c$["who leads the tour and when","the boundaries and what is out of bounds","the health centre and the assembly area","where to find a staff member at any hour","how the tour is recorded"]$c$::jsonb
where code = 'ORI-02';

update compliance_plan_templates set
  prompt = $p$Say how campers are told about the hazards on your property, in terms they will act on. Name the specific hazards on your site rather than general camp risks.$p$,
  checklist = $c$["the hazards campers are told about, named","the rule attached to each","areas campers may never enter alone","water, traffic and wildlife hazards on your site","how campers report a hazard they find"]$c$::jsonb
where code = 'ORI-03';

update compliance_plan_templates set
  prompt = $p$Say how campers are taught to report feeling ill or being hurt, and that they must report it rather than wait. Subpart 7-2.8(d) requires every camper injury and illness to reach the health director, which depends on campers speaking up.$p$,
  checklist = $c$["who a camper tells and how","that campers report even minor injuries","how to report something that happened to another camper","how a camper reaches the health centre","how a camper raises a concern about a staff member"]$c$::jsonb
where code = 'ORI-04';

update compliance_plan_templates set
  prompt = $p$Say how campers are taught the buddy system before they get in the water: how buddies are paired, what a check sounds like, and what to do when their partner is missing or struggling. Checks happen at least every 15 minutes under 7-2.11(a)(3)(iv).$p$,
  checklist = $c$["how buddies are assigned and by whom","what a camper does when the check is called","that buddies stay within sight and reach","telling the lifeguard immediately if a partner is missing or in distress","the area each ability level may use"]$c$::jsonb
where code = 'ORI-05';

update compliance_plan_templates set
  prompt = $p$Say what campers are told to do if they are lost or separated from their group, and what they are told to do when someone else goes missing.$p$,
  checklist = $c$["what a lost camper should do: stay put, or go to a named place","how a camper signals for help","who to tell when a friend is missing","the meeting point campers are taught","how this is reinforced before trips and off-site activities"]$c$::jsonb
where code = 'ORI-06';

update compliance_plan_templates set
  prompt = $p$Say what campers are told about the alarm, the evacuation route and the assembly area. A drill happens within the first 48 hours of each session under 7-2.18(b)(4), so orientation has to come before it.$p$,
  checklist = $c$["what the alarm sounds like","the route out of each building campers use","where campers assemble and how they line up","staying with the group until counted","that a drill happens in the first 48 hours"]$c$::jsonb
where code = 'ORI-07';

update compliance_plan_templates set
  prompt = $p$Say what campers are told before an out-of-camp trip: the rules on the vehicle and at the destination, who their staff are, and what to do if they get separated.$p$,
  checklist = $c$["the trip briefing and who gives it","rules in the vehicle and at the site","how campers are counted and when","what to do if separated from the group","what campers must carry or wear"]$c$::jsonb
where code = 'ORI-08';

update compliance_plan_templates set
  prompt = $p$Say what campers are told about lightning: how they will hear that activities have stopped, where they go, and that they stay there until told otherwise.$p$,
  checklist = $c$["the signal campers listen for","where each group shelters","leaving the water immediately when called","staying under shelter until staff say otherwise","what campers do if they are away from their group"]$c$::jsonb
where code = 'ORI-09';

update compliance_plan_templates set
  prompt = $p$Subpart 7-2.5(n)(7) requires a process to document orientation attendance. Say what the record is, who keeps it, and how a camper who missed orientation is caught up.$p$,
  checklist = $c$["what the record captures: session, date, topics, who delivered it","who keeps it and where","how a mid-session arrival is oriented and recorded","how counselors-in-training are covered, since they receive camper orientation too","how long the records are kept"]$c$::jsonb
where code = 'ORI-10';

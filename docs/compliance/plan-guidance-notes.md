# Plan guidance notes

Where the `prompt` and `checklist` text on `compliance_plan_templates` comes from, and every
place it states a specific number, ratio, frequency or named element, with the subsection it
was read in. Written alongside `supabase/migrations/20260831120000_compliance_plan_guidance.sql`.

## What the columns are

`compliance_plan_templates` held the DOH-2040 component list and nothing else, so the plan
builder rendered a heading and an empty box. `prompt` says what the section has to cover.
`checklist` lists two to five concrete things it should mention. Neither writes the section for
the camp.

## The accuracy rule

The guidance never states a requirement Subpart 7-2 does not contain. Where the regulation gives
a number, the number is said out loud because that is the part camps get wrong. Where the
regulation names a topic and leaves the content open, the guidance says what a reviewer is
looking for and stops there. Every number below was read in the section text, not recalled.

## Sources

| Source | Fetched | Note |
|---|---|---|
| 10 NYCRR Subpart 7-2, sections 7-2.2 and 7-2.4 through 7-2.23, Cornell LII (`https://www.law.cornell.edu/regulations/new-york/10-NYCRR-7-2.N`) | 2026-08-29 | Requires a browser User-Agent. Every section carries the same stamp: NY State Register June 22, 2016 / Vol. XXXVIII Issue 25, eff. 6/22/2016. Same text and same fetch method as `ny-subpart-7-2-extraction-notes.md`. |
| DOH-2040, Children's Camp Written Plan Checklist, `https://www.health.ny.gov/forms/doh-2040.pdf` | 2026-08-29 | Used only to confirm the component list and its order. The form is a bare checklist: it names each component and gives no expansion of any of them, which is exactly the gap these columns fill. |
| `https://regs.health.ny.gov` | not used | Returns 403 to automated requests. |

The NYSDOH publishes a fill-in safety plan template (`childrens_camp_safety_plan.docx`). It was
deliberately not used as a source. Copying a template's answers into our prompts would produce
plans that are the template's words with the camp's name on them.

## Numbers asserted, with the subsection each came from

### Personnel

| Component | Assertion | Subsection |
|---|---|---|
| PERS-02 | Counselors at least 18 at an overnight camp, 16 at a summer day or traveling day camp | 7-2.5(b) |
| PERS-03 | Sex Offender Registry check before the employee or volunteer starts work and annually before arrival; written record of names submitted and DCJS results kept on file; qualification records kept at camp for inspection | 7-2.5(l) |

### Facility operation

| Component | Assertion | Subsection |
|---|---|---|
| FAC-01 | One total coliform sample from each source before the operating season plus at least one more during the season; for a camp operating more than 30 days in a calendar year, a sample for each month in operation | 7-2.6(f)(1) |
| FAC-01 | Positive total coliform or E. coli result reported to the permit-issuing official within 24 hours | 7-2.6(f)(4) |
| FAC-01 | Annual start-up actions taken 15 days before occupancy | 7-2.6(d) |
| FAC-01 | Non-potable supply conspicuously labelled | 7-2.6(j) |
| FAC-02 | Sewage on the ground surface or accessible to children prohibited | 7-2.7(c) |
| FAC-02 | Plan or sketch to the permit-issuing official at least 30 days before construction | 7-2.7(b) |
| FAC-04 | Driver at least 18 with a current licence | 7-2.10(d) |
| FAC-04 | At least one counselor in any vehicle transporting children, who may also be the driver | 7-2.10(b) |
| FAC-04 | First aid kit, tools, fire extinguisher, flares or reflective triangles in every vehicle; registration and inspection stickers | 7-2.10(c) |
| FAC-04 | No transport in a truck bed or trailer; seat belts used where fitted; occupancy limited to rated capacity | 7-2.10(a), (e), (f) |
| FAC-05 | Clean sheets and pillowcases provided weekly | 7-2.16(a) |
| FAC-05 | 27 inches clear above the sleeping surface; six feet between heads of sleepers; triple-decker beds prohibited; guardrails on upper bunks | 7-2.16(b) |
| FAC-05 | An undivided room holds no more than 36 occupants | 7-2.16(d) |
| FAC-06 | Kitchens, dining areas and food service comply with Part 14 of Title 10; camp-provided food sufficient in quantity and quality for each child's nutritional needs | 7-2.19(a), (b) |
| FAC-07 | Equipment inspected by the camp operator at frequent intervals | 7-2.11(f)(2) |
| FAC-07 | One toilet or privy seat per 15 males plus one urinal per 30 males; one toilet or privy seat per 15 females; one lavatory per 20 occupants; all within 200 feet of sleeping quarters | 7-2.9(b) |
| FAC-07 | One shower head per 20 occupants, water heated to between 110 and 120 degrees Fahrenheit | 7-2.9(c) |
| FAC-07 | Pesticides and toxic chemicals stored in original containers in designated areas | 7-2.20 |
| FAC-08 | Piers, floats, platforms and decking in good repair; visible depth markings | 7-2.11(a)(3)(v) |
| FAC-08 | Supervised entrances and exits; lifeguard station with unobstructed view; pool fences with gates locked except when a lifeguard is on duty | 7-2.11(a)(3)(iii) |

### Fire safety

| Component | Assertion | Subsection |
|---|---|---|
| FIRE-01 | Evacuation, assembly, supervision and accounting for campers and staff are all required plan content | 7-2.5(n)(3) |
| FIRE-02 | Flammable materials labelled and stored in a separate locked, unoccupied building; oil-base paints and thinners in approved paint lockers or a separate building; tents flame retardant | 7-2.18(e)(1), (e)(2) |
| FIRE-02 | Water heaters not installed in sleeping quarters | 7-2.18(d) |
| FIRE-02 | Unvented fossil fuel heaters prohibited | 7-2.15(b) |
| FIRE-03 | All existing electrical service, wiring and fixtures in good repair and safe condition. No inspection interval is stated, and the guidance says so. | 7-2.17 |
| FIRE-04 | At least one single-station smoke alarm on or near the ceiling in each sleeping unit; battery devices acceptable; tents and lean-tos exempt | 7-2.18(b)(2) |
| FIRE-04 | Camp-audible alarm system for buildings used for sleeping by 50 or more persons or sleeping buildings two stories or more; automatic detection system for sleeping buildings three stories or more | 7-2.18(b)(1) |
| FIRE-04 | Portable audible/visual smoke detectors in sleeping quarters occupied by visually or audibly impaired campers | 7-2.18(b)(3) |
| FIRE-05 | Extinguishers and firefighting equipment provided, inspected and tagged by the camp operator prior to the camp season, maintained in operating condition at all times | 7-2.18(e)(3) |
| FIRE-05 | Operator responsible for regular inspection of all fire protection facilities and equipment | 7-2.18(b)(5) |
| FIRE-06 | Sleeping quarters with 15 or more occupants: at least two separate means of egress as far apart as practical | 7-2.18(c)(2) |
| FIRE-06 | Two means of egress from each floor of a multi-story building | 7-2.18(c)(3) |
| FIRE-06 | Exit doors at least 28 inches wide, non-locking against egress, operable with a single motion | 7-2.18(c)(4) |
| FIRE-06 | Lighted exit signs for rooms occupied by 15 or more persons or where exits are not readily visible | 7-2.18(c)(6) |
| FIRE-07 | Fire drill within the first 48 hours of each camping session and periodically thereafter per the safety plan; log of dates and times verified by the camp director and available for inspection at all times | 7-2.18(b)(4) |
| FIRE-08 | A copy of the fire safety segment must be submitted to the local fire district or department; coordination with local fire officials required; fires reported to the permit-issuing official within 24 hours | 7-2.5(n)(3) |

### Medical plan

| Component | Assertion | Subsection |
|---|---|---|
| MED-01 | Health director on site at an overnight camp; at a day camp available as the plan specifies, with a designated assistant if not on site | 7-2.8(a) |
| MED-01 | Health director or designee holds current first aid and CPR certificates | 7-2.8(a)(1) |
| MED-01 | One staff member per 200 campers with a current first aid certificate and one per 200 with a current CPR certificate, in addition to the health director or designee | 7-2.8(a)(2) |
| MED-01 | First aid certificates valid no more than three years; CPR certificates no more than one year | 7-2.2(m), 7-2.2(n) |
| MED-02 | Overnight camp infirmary: hot and cold flowing water, examining room, isolation and convalescent space, bathroom with flush toilets and showers, medical supplies, or alternate provisions in the plan. Day camps: a holding area acceptable to the permit-issuing official. | 7-2.8(b) |
| MED-03, MED-04, MED-05, MED-06, MED-08, MED-11 | These topics are required plan content. No method, interval or standard is prescribed for any of them. | 7-2.5(n)(4) |
| MED-06 | Anyone suspected of a communicable disease suitably isolated | 7-2.8(d) |
| MED-07 | Current confidential medical history on file for every camper, updated annually, with immunisation dates for diphtheria, haemophilus influenzae type b, hepatitis B, measles, mumps, poliomyelitis, rubella, tetanus and varicella; emergency contact for campers and staff | 7-2.8(c)(1) |
| MED-07 | Overnight camps: parents of campers attending seven or more consecutive nights get written meningococcal meningitis information and a Commissioner-approved immunisation response form, submitted annually and kept on file; the form certifies immunisation within the past 10 years or a decision to decline | 7-2.8(c)(2) |
| MED-09 | All camper and staff injuries, illnesses and reportable diseases reported to the health director and recorded in the medical log | 7-2.8(d) |
| MED-10 | The 24-hour list, including second or third degree burns to five percent or more of the body | 7-2.8(d) |
| MED-11 | No common drinking utensil provided | 7-2.6(n) |

### Activities and supervision

| Component | Assertion | Subsection |
|---|---|---|
| ACT-01, TRN-05 | Overnight camp: 1:10 for children eight and over, 1:8 for children under eight; a maximum of 20 percent of required counselors may be 17 | 7-2.5(c) |
| ACT-01, TRN-05 | Summer day or traveling summer day camp: 1:12 | 7-2.5(d) |
| ACT-01 | Adequate supervision means visual or verbal communication between camper and counselor during activities plus a method of accounting for a camper's whereabouts at all times | 7-2.5(o) |
| ACT-02, TRN-05 | Passive activities: ratio no greater than 1:25; the definition (defined area, spectators or limited mobility, no tools or equipment other than computers); the camp's passive activities must be described in the approved plan; ratios reinstated at the conclusion | 7-2.5(b)(1) |
| ACT-03 | Rest and sleeping ratio may be modified only to a level the permit-issuing official accepts and only as described in the plan; at least one counselor on every level used for resting or sleeping in a multi-story building; ratios reinstated afterwards | 7-2.5(c)(1) |
| ACT-03 | At least one adult counselor present during sleeping hours on every level of a sleeping building | 7-2.16(f) |
| ACT-05 | 1:12 when transporting campers by motor vehicle to a specific activity site | 7-2.11(i) |
| ACT-07 | One qualified lifeguard for every 25 bathers; no lifeguard covering more than 3,400 square feet of pool surface or 50 yards of shoreline | 7-2.11(a)(3)(vii) |
| ACT-07 | Counselor-to-camper ratio in the water 1:10, 1:8 under eight, 1:6 under six | 7-2.11(a)(3)(viii) |
| ACT-07, ACT-18 | The swimming pool or bathing beach is directly supervised by the camp aquatics director | 7-2.11(a)(3)(i) |
| ACT-07 | Non-swimmers confined to the area matching their assessed ability, conspicuously identified, restricted to water less than chest deep | 7-2.11(a)(3)(ii) |
| ACT-07 | Only locations approved by the permit-issuing official as part of the plan may be used for swimming | 7-2.11(a)(1) |
| ACT-07 | Swimming ability assessed by a progressive swimming instructor before a camper takes part in aquatic activities | 7-2.5(f) |
| ACT-08, TRN-09, ORI-05 | Accounting system naming each bather with ability and assigned area; record of entry and exit; buddies of matched ability with one threesome per swim area; checks of bathers at least every 15 minutes referenced against the accounting system | 7-2.11(a)(3)(iv) |
| TRN-10 | Lost swimmer plan details clearing the water, searching and supervising campers present; implemented whenever a buddy check fails to account for all bathers or a bather is reported missing | 7-2.11(a)(3)(iv) |
| ACT-09 | Signed parent/guardian permission for each camper on trip swimming; only permitted New York pools and beaches or state-operated ones; residential pools prohibited; pre-arrangement with the facility | 7-2.11(a)(4), (a)(4)(i), (a)(4)(ii), (a)(4)(v) |
| ACT-09 | One camp-supplied qualified lifeguard or trained staff member per 75 campers where the facility supplies Level I/IIa/IIb staff | 7-2.11(a)(4)(iv) |
| ACT-09 | Counselor ratio 1:8 for campers six and older, 1:6 under six, on trip swimming | 7-2.11(a)(4)(vi) |
| ACT-09 | One qualified lifeguard per 25 bathers where the facility does not supply aquatic supervisory staff | 7-2.11(a)(4)(vii) |
| ACT-09 | Wilderness swimming: marked perimeter, water not exceeding five feet in depth | 7-2.11(a)(5)(iii) |
| ACT-09 | Swimming prohibited between sunset and sunrise at wilderness swimming sites | 7-2.11(a)(2) |
| ACT-10 | Procedures required for immersion deeper than mid-calf of the shortest camper, approved by the permit-issuing official; prohibited where depth cannot be determined or depth or current does not ensure a safe crossing; staff test the entire area first | 7-2.11(j) |
| ACT-11 | All boat occupants wear a USCG-approved life jacket or vest; motorized boats registered with DMV with the number on the bow and current registration and inspection certificates available; a lifeguard present in any watercraft of capacity eight or more carrying non-swimmers | 7-2.11(h)(2) |
| ACT-11 | Boats used only with the permission of the aquatics director or camp director; boats carrying passengers never towed; boats prohibited in the swimming area except for rescue | 7-2.11(h)(3) |
| ACT-11 | Specialized aquatic activities led by a counselor trained in the specialty | 7-2.11(h)(4) |
| ACT-11, ACT-16, ACT-17 | 1:8 for wilderness, equestrian, boating and similar specialized activities, 1:6 for children under six | 7-2.11(g) |
| ACT-12 | Competent riding instructor determines each camper's experience and skill before assigning horses and deciding ring or trail; one experienced instructor per 10 riders on each trail excursion with a minimum of two staff accompanying | 7-2.11(d)(1) |
| ACT-12 | Protective headgear permanently labelled as meeting or exceeding ASTM F1163 worn at all times | 7-2.11(d)(2) |
| ACT-12 | Shoes with heels, or closed stirrups | 7-2.11(d)(3) |
| ACT-14 | Archery range must not endanger others and must be clearly marked; at least 50 yards of clearance or an archery net behind each target; common firing line with a ready line behind it | 7-2.11(c)(1) |
| ACT-14 | Bows and arrows stored in a locked cabinet | 7-2.11(c)(2) |
| ACT-14 | Archery staff-camper ratio of one for every 10 campers on the firing line | 7-2.11(c)(3) |
| ACT-15 | Backstops containing bullets; large "keep out" signs atop the backstop facing away from the firing line; red firing flag when the range is in use | 7-2.11(b)(1) |
| ACT-15 | Firing line and ready line | 7-2.11(b)(2) |
| ACT-15 | Minimum age per article 265 of the NYS Penal Law and specified in the camp safety plan; campers instructed in safe range procedures before firing | 7-2.11(b)(3) |
| ACT-15 | Single-shot rifles | 7-2.11(b)(4) |
| ACT-15 | Instructor on the range at all times during firing sessions, assisted by another counselor; one staff person supervises a maximum of 10 campers on the firing line | 7-2.11(b)(5) |
| ACT-15 | Guns and ammunition stored separately in locked cabinets, use controlled by a check-out system | 7-2.11(b)(6) |
| ACT-15, TRN-16 | Riflery instructors hold a current NRA instructor certificate or equivalent | 7-2.5(j) |
| ACT-16, TRN-12 | A trip leader and at least one counselor on every camp trip; 1:8 for swimming, wilderness, equestrian, boating and similar specialized trips, 1:6 under six; 1:12 when transporting campers by motor vehicle; supervising staff review the safety plan within 24 hours before departure, except after an identical trip or pre-camp training within the previous week | 7-2.11(i) |
| ACT-16 | Trip leader at least 18 with at least three prior camp trips in a similar activity or equivalent; first aid and CPR carried where emergency medical care is not readily available | 7-2.5(h) |
| ACT-17 | An activity leader competent in the activity supervises each on-site activity; a minimum of one activity leader and one staff member where additional camp staff assistance is not readily available | 7-2.11(g) |
| ACT-18 | Each lifeguard covers no more than 50 yards of shoreline; lifesaving patrol boats or offshore stations where swimming or diving is permitted more than 150 feet from shore | 7-2.11(a)(3)(vii) |

### Staff training and camper orientation

| Component | Assertion | Subsection |
|---|---|---|
| TRN-01 | A training curriculum outline is required. **No number of training hours appears anywhere in Subpart 7-2**, and the prompt says so rather than implying one. | 7-2.5(n)(6) |
| TRN-06 | Camper physical or sexual abuse allegations reported to the permit-issuing official within 24 hours | 7-2.8(d) |
| TRN-07 | One first aid certified and one CPR certified staff member per 200 campers | 7-2.8(a)(2) |
| TRN-08, ORI-04 | Every camper and staff injury, illness and reportable disease reaches the health director and is recorded in the medical log | 7-2.8(d) |
| TRN-14, ORI-07 | Fire drill within the first 48 hours of each camping session | 7-2.18(b)(4) |
| TRN-16 | Aquatics director must have completed a training course in lifeguard supervision and management | 7-2.5(e)(4) |
| TRN-17, ORI-10 | A process to document training attendance, and one to document orientation attendance | 7-2.5(n)(6), 7-2.5(n)(7) |
| ORI-10 | CITs receive training specific to their duties and camper orientation | 7-2.5(k) |
| TOC | The plan consists of, at a minimum, a table of contents and the listed components | 7-2.5(n) |
| TOC | The plan is reviewed annually and updated as required; updated plans are submitted; in a year with no update the operator submits written affirmation that the approved plan remains up to date. The application goes in at least 60 days before the first day of operation. | 7-2.4(c), 7-2.4(c)(1) |

## Components where the regulation names the topic and nothing else

For these, Subpart 7-2 requires the section but sets no method, interval, standard or number.
The guidance describes what a reviewer is looking for and asserts no rule.

| Component | What the regulation gives us |
|---|---|
| FAC-03 Lightning Risk Assessment | Named in the required list of facility components. No detection method, no wait time, no shelter standard. The prompt deliberately does not mention any interval rule. |
| FIRE-03 Electrical Safety | 7-2.17 is one sentence: existing service, wiring and fixtures in good repair and safe condition. No interval, no inspector qualification. |
| MED-03 Medication Storage/Administration | Named in 7-2.5(n)(4). No storage standard, no administration protocol, no record format. |
| MED-04 Universal Precautions | Named in 7-2.5(n)(4). No content specified beyond bloodborne pathogens. |
| ACT-04 Between Activity Supervision | Named in 7-2.5(n)(5). The general ratio and the accounting duty in 7-2.5(o) still apply, and that is all the prompt leans on. |
| ACT-06 Supervision In Emergencies | Named in 7-2.5(n)(5). No procedure specified. |
| ACT-13 Rope/Challenge Course | Named once in 7-2.5(n)(5) as an activity the plan must address. **There is no challenge course standard anywhere in Subpart 7-2** — no inspection interval, no ratio, no certification. Same finding as `ny-subpart-7-2-extraction-notes.md` note 7. |
| TRN-11 Lost Camper Plan | Required topic. No procedure, no timings, no notification list. |
| TRN-13, ORI-09 Lightning Plan | Required topic, tied to FAC-03. Same silence. |
| ORI-02, ORI-03, TRN-02, TRN-03 Tour and hazards | Required topics. No content specified. |

## Two things worth checking before this ships

**1. FAC-01 rests on a sentence that is broken in the published text.** 7-2.6(f)(1) reads: "At
least one sample collected for total coliform analysis from each water source prior to opening
for the operating season and at least one additional sample collected from each water source
during the operating season. For those children's camps operating more than 30 days in a
calendar year. Total coliform samples shall be collected for each month the camp is in
operation." The second sentence has no verb. It is ambiguous whether the monthly rule replaces
or supplements the two baseline samples. The prompt states all three the way the text states
them, in the same order, and does not resolve the ambiguity. This is the same defect flagged
against requirement NY-0603 in `ny-subpart-7-2-extraction-notes.md`.

**2. ACT-18 "Waterfront Swimming Supervision" is not a DOH-2040 component.** The checklist's
activities section runs General Supervision through Other Activity Plans and has no waterfront
swimming row; ours was added on top. Its guidance is therefore written as the beach-specific
counterpart to ACT-07 Swimming, covering shoreline coverage and offshore limits rather than
repeating the pool content. If a camp fills in both, a reviewer marking DOH-2040 will find the
waterfront content under a heading their form does not have.



/**
 * New York's Children's Camp Safety Plan template: ninety-two numbered questions, six sections.
 *
 * GENERATED from the state's own .docx — do not hand-edit. Regenerate with
 * `python3 scripts/build-plan-template.py` when NYSDOH reissues
 * docs/compliance/sources/nysdoh/childrens_camp_safety_plan.docx.
 *
 * This is the document a camp actually fills in. We used to write against DOH-2040 instead, which
 * is the reviewer's checklist — the thing a sanitarian ticks off while *reading* a plan. Asking a
 * camp to compose prose under ninety-six checklist headings, and then hand-label a table of
 * contents, was asking them to write the wrong document.
 *
 * `n` is the state's own question number, and it is load-bearing: the template cross-references
 * itself ("Skip to question 16", "Complete questions 14-15", "the standards listed above in
 * numbers 75–77"). Those self-references are what verified the extraction — 13 is the sewage
 * question whose follow-ups are 14 and 15, and 75 through 77 are exactly the three
 * supervision-ratio questions. Renumbering would break the document against itself.
 *
 * Living in code rather than Postgres is deliberate: it is identical for every camp and changes
 * only when the state reissues the template, so a table bought a join we never make and a seed to
 * keep in step with the .docx by hand. The camp's *answers* live in `camp_plan_answers`.
 */
export type PlanAnswerKind =
  | 'yes_no' | 'select' | 'multi_select' | 'long_text' | 'table' | 'attest';

export interface PlanQuestion {
  key: string;
  /** The state's own question number, 1–92. Printed on the rendered plan. */
  n: number;
  category: string;
  kind: PlanAnswerKind;
  prompt: string;
  choices: string[];
  /** Column headers, for the ten questions the template asks as a table. */
  columns: string[];
  /** The template's own skip logic: only ask this when its gate is answered Yes. */
  dependsOn?: string;
  /** The template offers an "Enter text here" box alongside the boxes. */
  freeText: boolean;
}

/** An activity-specific plan the state publishes separately, required only if you run it. */
export interface PlanAddendum {
  code: string;
  title: string;
  appliesWhen: Record<string, unknown>;
  sourceUrl: string;
  archivedPath: string;
}

export const PLAN_SECTIONS: { category: string; title: string }[] = [
  { category: 'PERSONNEL',              title: 'I. Personnel' },
  { category: 'FACILITY_OPERATION',     title: 'II. Facility operation and maintenance' },
  { category: 'FIRE_SAFETY',            title: 'III. Fire safety' },
  { category: 'MEDICAL_PLAN',           title: 'IV. Medical requirements' },
  { category: 'ACTIVITIES_SUPERVISION', title: 'V. Supervision and activity safety' },
  { category: 'STAFF_TRAINING',         title: 'VI. Orientation and training' },
];

export const PLAN_QUESTIONS: PlanQuestion[] = [
  {
    "key": "ny.plan.personnel.01",
    "n": 1,
    "category": "PERSONNEL",
    "kind": "select",
    "prompt": "Describe the camp's “Chain of Command.” A chain of command depicts an order of succession of responsibility/authority, which becomes particularly important when key staff are unavailable or unable to perform their assigned duties/responsibilities (if supervisory/evaluation responsibilities differ from the order below, show this information separately). An outline, similar to the diagram below, is an effective way to share this information during staff orientation.",
    "choices": [
      "The above schematic accurately represents the camp’s chain of command",
      "A chain of command schematic is attached separately",
      "A chain of command schematic is described below"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.personnel.02",
    "n": 2,
    "category": "PERSONNEL",
    "kind": "multi_select",
    "prompt": "List the duties and responsibilities of each staff member. Staff titles listed below contain job duties and responsibilities critical to the operation of a children’s camp, which frequently relate to procedures in this plan. If a job duty or responsibility provided is not the responsibility of the identified staff title, list that duty or responsibility with the appropriate staff title.",
    "choices": [
      "Ensure that camp maintains compliance with Subpart 7-2 (Children’s Camp Code)",
      "Oversee the implementation of the camp’s written safety plan",
      "Other (list any additional duties/responsibilities)",
      "Oversee the implementation of the written safety plan’s medical components",
      "Supervise the health and sanitation at the camp",
      "Review and maintain campers’ confidential medical histories",
      "Oversee initial health screening of campers and daily surveillance of the camp occupants",
      "Handle health emergencies and injuries, including emergency preparedness and follow-up for professional health care",
      "Maintain the camp medical log",
      "Maintain visual or verbal communications capabilities with campers during activities and account for assigned camper's whereabouts at all times",
      "N/A (No on-site swimming)",
      "Oversee the implementation of the written safety plan’s swimming procedures",
      "Establish and oversee all swimming activities at the camp, including off-site swimming",
      "Supervise all staff and campers participating in swimming activities",
      "Respond to waterfront emergencies",
      "Implement/oversee buddy system",
      "If certified as a lifeguard, may serve as a lifeguard",
      "If qualified as a Progressive Swimming Instructor, may assess camper’s swimming ability",
      "N/A (No swimming activities)",
      "Assess the swimming ability of each camper prior to allowing the child to participate in swimming activities",
      "N/A (No lifeguards required)",
      "Actively supervise participants in the camp's swimming activities as detailed in the camp's approved safety plan",
      "Shall not be engaged in duties or activities that distract them from the direct supervision of the waterfront",
      "N/A (CIT not used)",
      "Assist assigned staff member in performing the following duties (describe)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.personnel.03",
    "n": 3,
    "category": "PERSONNEL",
    "kind": "table",
    "prompt": "In the table below, provide a job description for other staff titles, not listed above, that are utilized by the camp.",
    "choices": [],
    "columns": [
      "Job Title",
      "Duties and Responsibilities"
    ],
    "freeText": false
  },
  {
    "key": "ny.plan.personnel.04",
    "n": 4,
    "category": "PERSONNEL",
    "kind": "multi_select",
    "prompt": "Indicate how staff qualifications and references are verified in addition to the mandatory checks above.",
    "choices": [
      "Prior employment with camp",
      "Written applications",
      "Submittal of written references (specify number required)",
      "References checked by telephone",
      "Written references",
      "Past employer interviews",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.05",
    "n": 5,
    "category": "FACILITY_OPERATION",
    "kind": "long_text",
    "prompt": "How many water systems serve the camp? Enter text here.",
    "choices": [],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.06",
    "n": 6,
    "category": "FACILITY_OPERATION",
    "kind": "table",
    "prompt": "Complete the following table for each water source:",
    "choices": [],
    "columns": [
      "Water Source Name and/or Number",
      "Source Type",
      "On-Site Treatment",
      "Start-up Procedure*"
    ],
    "freeText": false
  },
  {
    "key": "ny.plan.facility.07",
    "n": 7,
    "category": "FACILITY_OPERATION",
    "kind": "select",
    "prompt": "Who will be responsible for performing the annual start-up procedures for the water system?",
    "choices": [
      "N/A (year-round water supply)",
      "Camp Director",
      "Head of Maintenance",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.08",
    "n": 8,
    "category": "FACILITY_OPERATION",
    "kind": "select",
    "prompt": "Who will be responsible for immediately notifying the local health department of pressure loss in the distribution system to determine the need to issue a Boil Water Order?",
    "choices": [
      "Camp Director",
      "Head of Maintenance",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.09",
    "n": 9,
    "category": "FACILITY_OPERATION",
    "kind": "multi_select",
    "prompt": "What will be done if water service is interrupted or unavailable for more than a few hours? Address this issue regardless of the camp's source of water. Check each box that applies:",
    "choices": [
      "Notify the local health department",
      "Close camp - Send campers home",
      "Obtain bottled water",
      "Go to an alternate location (specify)",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.10",
    "n": 10,
    "category": "FACILITY_OPERATION",
    "kind": "multi_select",
    "prompt": "Who will be responsible for the system(s) and maintaining the records of the monitoring?",
    "choices": [
      "N/A (Off-site/Public Water)",
      "Camp Director",
      "Head of Maintenance",
      "Other (specify)",
      "Off-site/public water. Skip to question 13"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.11",
    "n": 11,
    "category": "FACILITY_OPERATION",
    "kind": "table",
    "prompt": "Who will be responsible for collecting water samples?",
    "choices": [
      "Camp Director",
      "Head of Maintenance",
      "Other (specify)"
    ],
    "columns": [
      "Sample Type",
      "Sample Frequency*"
    ],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.12",
    "n": 12,
    "category": "FACILITY_OPERATION",
    "kind": "select",
    "prompt": "Indicate agreement with the above schedule or state an alternative.",
    "choices": [
      "Agreement",
      "Alternate schedule (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.13",
    "n": 13,
    "category": "FACILITY_OPERATION",
    "kind": "yes_no",
    "prompt": "Does the camp have an on-site sewage treatment system?",
    "choices": [],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.facility.14",
    "n": 14,
    "category": "FACILITY_OPERATION",
    "kind": "select",
    "prompt": "Do any of the camp’s sewage disposal systems require daily treatment and/or monitoring?",
    "choices": [
      "Yes – Specify the job title of the person responsible for performing",
      "No"
    ],
    "columns": [],
    "freeText": true,
    "dependsOn": "ny.plan.facility.13"
  },
  {
    "key": "ny.plan.facility.15",
    "n": 15,
    "category": "FACILITY_OPERATION",
    "kind": "select",
    "prompt": "What is the frequency of periodic inspection for system failure or leakage?",
    "choices": [
      "Daily",
      "Weekly",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true,
    "dependsOn": "ny.plan.facility.13"
  },
  {
    "key": "ny.plan.facility.16",
    "n": 16,
    "category": "FACILITY_OPERATION",
    "kind": "yes_no",
    "prompt": "Does the camp provide or obtain transportation services for campers, including to or from camp or camp trips?",
    "choices": [],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.facility.17",
    "n": 17,
    "category": "FACILITY_OPERATION",
    "kind": "multi_select",
    "prompt": "What type of vehicles will be used to transport campers? (Check all that apply)",
    "choices": [
      "Bus - owned by camp",
      "Chartered Bus",
      "15 Passenger Van",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true,
    "dependsOn": "ny.plan.facility.16"
  },
  {
    "key": "ny.plan.facility.18",
    "n": 18,
    "category": "FACILITY_OPERATION",
    "kind": "long_text",
    "prompt": "The following transportation requirements will be implemented:",
    "choices": [],
    "columns": [],
    "freeText": true,
    "dependsOn": "ny.plan.facility.16"
  },
  {
    "key": "ny.plan.facility.19",
    "n": 19,
    "category": "FACILITY_OPERATION",
    "kind": "long_text",
    "prompt": "Building and grounds maintenance. Measures taken to maintain the buildings and grounds in a safe and clean matter so as to not present hazards to campers will include but are not limited to:",
    "choices": [],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.facility.20",
    "n": 20,
    "category": "FACILITY_OPERATION",
    "kind": "yes_no",
    "prompt": "Does the camp provide or prepare food?",
    "choices": [],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.facility.21",
    "n": 21,
    "category": "FACILITY_OPERATION",
    "kind": "long_text",
    "prompt": "Steps taken to prevent foodborne illness will include but are not limited to:",
    "choices": [],
    "columns": [],
    "freeText": true,
    "dependsOn": "ny.plan.facility.20"
  },
  {
    "key": "ny.plan.facility.22",
    "n": 22,
    "category": "FACILITY_OPERATION",
    "kind": "select",
    "prompt": "Who is responsible for ensuring that the above steps to prevent foodborne illnesses are followed?",
    "choices": [
      "Camp Director",
      "Foodservice Manager",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true,
    "dependsOn": "ny.plan.facility.20"
  },
  {
    "key": "ny.plan.facility.23",
    "n": 23,
    "category": "FACILITY_OPERATION",
    "kind": "multi_select",
    "prompt": "The camp’s procedures to ensure that food brought by campers or provided by an approved outside source are protected until consumed include (check all that apply):",
    "choices": [
      "Refrigeration is provided to hold food at 45˚F or less",
      "Gloves or similar utensils are provided to prevent bare hand contact with ready-to-eat foods",
      "Service and storage areas are properly maintained in a sanitary condition",
      "Leftover food that has been served will be discarded",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true,
    "dependsOn": "ny.plan.facility.20"
  },
  {
    "key": "ny.plan.fire.24",
    "n": 24,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Who will be responsible for coordinating and implementing the evacuation plan?",
    "choices": [
      "Camp Director",
      "Program Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.25",
    "n": 25,
    "category": "FIRE_SAFETY",
    "kind": "long_text",
    "prompt": "What signal(s) will be used to alert the camp and initiate a fire drill/evacuation sequence?",
    "choices": [],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.26",
    "n": 26,
    "category": "FIRE_SAFETY",
    "kind": "long_text",
    "prompt": "List emergency assemble area(s): Enter text here.",
    "choices": [],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.27",
    "n": 27,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Describe or attach a facility sketch identifying the camp evacuation route: Enter text here.",
    "choices": [
      "Yes",
      "No",
      "Check to indicate evacuation routes are indicated on an attached facility sketch"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.28",
    "n": 28,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Fire drill/evacuation procedures and method of accounting for and supervising campers and staff during emergencies:",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.29",
    "n": 29,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Who is responsible for overseeing fire drills?",
    "choices": [
      "Camp Director",
      "Head of Maintenance",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.30",
    "n": 30,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "When will fire drills be held?",
    "choices": [
      "Every week thereafter",
      "Every two weeks thereafter",
      "Alternate schedule (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.31",
    "n": 31,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "During the first fire drill of each session, campers will be instructed on the camp’s evacuation procedures, including building exiting, assembly area(s), and whom to notify if they see a fire. Campers who arrive late to camp or for whatever reason miss the first fire drill of the session will receive training and instructions on fire drill procedures.",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.32",
    "n": 32,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Who will be responsible for the removal of combustibles?",
    "choices": [
      "Head of Maintenance",
      "Camp Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.33",
    "n": 33,
    "category": "FIRE_SAFETY",
    "kind": "yes_no",
    "prompt": "Are containers of gasoline, kerosene and other flammable materials stored on camp property?",
    "choices": [],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.fire.34",
    "n": 34,
    "category": "FIRE_SAFETY",
    "kind": "multi_select",
    "prompt": "Are oil-based paints and thinners stored on camp property?",
    "choices": [
      "No",
      "Approved-type paint lockers",
      "Separate locked and unoccupied building",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.35",
    "n": 35,
    "category": "FIRE_SAFETY",
    "kind": "multi_select",
    "prompt": "Are fuel-fired heaters used in any of the buildings utilized by the camp?",
    "choices": [
      "Yes",
      "No",
      "Head of Maintenance",
      "Camp Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.36",
    "n": 36,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "The fire department will be notified of a fire by dialing:",
    "choices": [
      "911",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.37",
    "n": 37,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Upon calling the fire department, the camp director will assign a staff member to wait at the entrance of the camp and direct responding emergency personnel where to go.",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.38",
    "n": 38,
    "category": "FIRE_SAFETY",
    "kind": "table",
    "prompt": "Complete the table below with the types of fire detection/alarms that are used in camp buildings and the frequency of testing.",
    "choices": [],
    "columns": [
      "Fire Detection/Alarm System Type (Full building alarm system, battery operated smoke detectors, 110-volt single station detectors, etc.)",
      "Building(s) or Location(s)",
      "Frequency of Testing"
    ],
    "freeText": false
  },
  {
    "key": "ny.plan.fire.39",
    "n": 39,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Who is responsible for ensuring that detection and alarm systems are tested at the frequency indicated above and maintained in proper working order at all times?",
    "choices": [
      "Head of Maintenance",
      "Camp Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.40",
    "n": 40,
    "category": "FIRE_SAFETY",
    "kind": "table",
    "prompt": "Complete the table below with the types (standpipe, sprinkler, 4-A:80-B:C fire extinguisher, etc.) and locations (kitchen, infirmary, building 1, etc.) of firefighting equipment provided. One location may have multiple types of firefighting equipment, such as a building equipped with a sprinkler system that also has fire extinguishers.",
    "choices": [],
    "columns": [
      "Equipment Type",
      "Locations",
      "Equipment Type",
      "Locations"
    ],
    "freeText": false
  },
  {
    "key": "ny.plan.fire.41",
    "n": 41,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "All firefighting equipment will be inspected by a qualified individual prior to the start of camp and appropriately tagged. What will be the inspection frequency of firefighting equipment to ensure it is in proper working order?",
    "choices": [
      "Daily",
      "Weekly",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.42",
    "n": 42,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Who is responsible for maintaining and testing the firefighting equipment?",
    "choices": [
      "Head of Maintenance",
      "Camp Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.43",
    "n": 43,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "What measures will be taken to inspect and maintain exits?",
    "choices": [
      "Doors will not be able to lock against egress by dead bolts, hooks and eyes, etc. All doorknobs will allow single motion opening",
      "Where required, lighted exit signs will be in place and in good repair",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.44",
    "n": 44,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Does the camp have campfires?",
    "choices": [
      "Yes",
      "No (If no, skip to question 45)",
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.45",
    "n": 45,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Who is responsible for the frequency with which inspections are conducted?",
    "choices": [
      "Camp Director",
      "Head of Maintenance",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.46",
    "n": 46,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "How often are inspections conducted?",
    "choices": [
      "Daily",
      "Weekly",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.fire.47",
    "n": 47,
    "category": "FIRE_SAFETY",
    "kind": "select",
    "prompt": "Who is responsible for reporting to your local health department within 24 hours, fires that destroy or damage any camp building, or that result in notification of the fire department, or are life or health threatening, or necessitate evacuations?",
    "choices": [
      "Camp Director",
      "Camp Operator",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.48",
    "n": 48,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "What type of health center is provided at the camp?",
    "choices": [
      "Holding area",
      "Infirmary",
      "Alternative provisions (describe)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.49",
    "n": 49,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "Check the Health Director’s credential(s):",
    "choices": [
      "Physician",
      "Physician Assistant",
      "Nurse Practitioner",
      "Registered Nurse",
      "Licensed Practical Nurse",
      "Emergency Medical technician (EMT)",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.50",
    "n": 50,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "For day camps only – Will the health director be on-site, or off-site and represented by an on-site designee?",
    "choices": [
      "On-site",
      "Off-site (answer question a – b below)",
      "N/A (Overnight Camp)",
      "Certified in CPR and First Aid",
      "Trained by the health director in the camp’s health procedures and responsibilities",
      "Other (specify)",
      "Reportable Injuries",
      "Camper Illness",
      "Medication Error"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.51",
    "n": 51,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "Specify the camp staff that will possess first aid and CPR certifications:",
    "choices": [
      "Health Director",
      "Assistant to the Health Director",
      "Trip Leader",
      "Activity Leader",
      "Lifeguard",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.52",
    "n": 52,
    "category": "MEDICAL_PLAN",
    "kind": "attest",
    "prompt": "The camp’s health history form (attach a copy of the camp’s health form to this document) will be completed for each camper prior to his or her arrival at camp. The form will be reviewed by the health director and kept on file in the camp’s infirmary.",
    "choices": [
      "Check this box to indicate agreement with the above and that the camp’s health form is attached"
    ],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.medical.53",
    "n": 53,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Items reviewed will include, but are not limited to:",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.54",
    "n": 54,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "How will campers with treatment, care, or behavioral plan be identified?",
    "choices": [
      "With question on enrolment forms",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.55",
    "n": 55,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "Do campers attend the camp for seven or more consecutive nights?",
    "choices": [
      "Yes",
      "No",
      "Camp Director",
      "Health Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.56",
    "n": 56,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "An initial health screening for camp participants (staff and campers) will be conducted by the health director shortly after arrival at camp and will include, but not limited to (check all that apply):",
    "choices": [
      "A review, verification and update as needed of individual’s health needs/restrictions",
      "A review/verification of individual’s medications and instructions for use",
      "Asking the individuals about any potential exposure to communicable disease and recent travel in the two weeks prior to their arrival at camp",
      "Observing general health and referring to a health care provider when necessary",
      "Asking individuals to share and discuss any health or other concerns they may have",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.medical.57",
    "n": 57,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Who is responsible for completing camper’s daily health surveillance?",
    "choices": [
      "Health Director",
      "Counselors",
      "Camp Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.58",
    "n": 58,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "What are the procedures for providing first aid and handling medical emergencies?",
    "choices": [
      "Two-way radio",
      "Loud speaker",
      "Runner",
      "Phone",
      "Other (specify)",
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.59",
    "n": 59,
    "category": "MEDICAL_PLAN",
    "kind": "table",
    "prompt": "Indicate in the table below where available first aid supplies are stored (Check all that apply):",
    "choices": [
      "No",
      "Yes and the collaborative agreement with an emergency health care provider is attached"
    ],
    "columns": [
      "Supplies",
      "Not Available",
      "Infirmary Area",
      "Main Office",
      "Dining Hall",
      "Pool Area",
      "Other (specify):"
    ],
    "freeText": false
  },
  {
    "key": "ny.plan.medical.60",
    "n": 60,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "What are the procedures for responding to allegations of abuse?",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.61",
    "n": 61,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Describe how medication will be collected upon arrival to camp:",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.62",
    "n": 62,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Describe medication storage:",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.63",
    "n": 63,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "How will medication be administered? (select all that apply)",
    "choices": [
      "No medication will be administered at the camp",
      "By camper’s parent",
      "Self-administration (complete corresponding section below)",
      "Administration by a licensed health care practitioner (select all that apply)",
      "Physician",
      "Nurse Practitioner",
      "Physician Assistant",
      "Registered Nurse",
      "Licensed Practical Nurse",
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.64",
    "n": 64,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Medication administration including the camper’s name, medication, dosage, and date will be documented in the following location.",
    "choices": [
      "Medical log",
      "Camper’s medical record",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.65",
    "n": 65,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "What actions will be taken in the event of a medication error?",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.66",
    "n": 66,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Who is responsible for the camps injury control program?",
    "choices": [
      "Camp Director",
      "Health Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.67",
    "n": 67,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "What are the procedures for identifying and responding to an illness outbreak?",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.68",
    "n": 68,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "Will campers carry and use repellents during activities where ticks and insects may be present?",
    "choices": [
      "Yes",
      "No",
      "Camp Director",
      "Health Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.69",
    "n": 69,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Who will be responsible for capturing a bat or contacting a nuisance wildlife agent if a suspect animal is found at the camp?",
    "choices": [
      "Camp Director",
      "Health Director",
      "Maintenance staff",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.70",
    "n": 70,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "Are bat capture kits maintained at the camp?",
    "choices": [
      "Yes",
      "No",
      "Each bunk",
      "Bunk number(s)",
      "Maintenance area",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.71",
    "n": 71,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "The health director or designee will document all health-related incidents involving campers and staff, including medical complaints and injuries, and camper allegations of child and/or sexual abuse in a logbook. The medical log will be maintained at the health center and readily accessible for review by the health department representative. The health director or designee will review the medical log daily for any commonly occurring injuries or illness to identify potential hazards or illness outbreaks at the camp.",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.72",
    "n": 72,
    "category": "MEDICAL_PLAN",
    "kind": "multi_select",
    "prompt": "Universal Precautions will be employed during treatment and in the handling of blood and other body fluids including, but not be limited to, vomitus, diarrhea and any bodily discharge (e.g. from cuts, boils). Universal Precautions implemented at the camp include (check all that apply):",
    "choices": [
      "Every first aid trained staff member will be trained in Universal Precaution techniques",
      "Hand washing facilities, which are readily accessible, are available throughout the camp",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.73",
    "n": 73,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Who will be responsible for establishing reporting policies for the incidents above?",
    "choices": [
      "Camp Director",
      "Health director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.medical.74",
    "n": 74,
    "category": "MEDICAL_PLAN",
    "kind": "select",
    "prompt": "Specify the camp’s procedures for supervising sanitation at the camp:",
    "choices": [
      "Daily",
      "Weekly",
      "Other"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.75",
    "n": 75,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "select",
    "prompt": "How will campers be accounted for and supervised?",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.76",
    "n": 76,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "select",
    "prompt": "What minimum counselor to camper ratio will be maintained for general activities (e.g. arts and crafts, sports, organized games):",
    "choices": [
      "1:8 for campers younger than 8-years-old",
      "1:10 for campers 8-years and older",
      "1:12 (day camps)",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.77",
    "n": 77,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "yes_no",
    "prompt": "Will CITs or Junior Counselors be used to meet minimum supervision ratios?",
    "choices": [],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.supervision.78",
    "n": 78,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "multi_select",
    "prompt": "How will campers be supervised during the following the following time periods?",
    "choices": [
      "Alternative procedures to account for campers between activities",
      "A counselor to camper ratio of 1:25. (Select all passive activities at the camp)",
      "Religious instruction",
      "Storytelling",
      "Viewing movies",
      "Board games",
      "Drama",
      "Singing",
      "Other (specify)",
      "Alternative procedures for supervising campers",
      "No free time periods during camp",
      "No sleeping or rest periods during camp (day camps only)",
      "Transportation is not provided by the camp",
      "At least one counselor will be in a vehicle transporting campers",
      "There will be at least one counselor in addition to the driver in any vehicle transporting developmentally disabled campers"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.79",
    "n": 79,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "select",
    "prompt": "Describe the camp’s discipline policy.",
    "choices": [
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.80",
    "n": 80,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "multi_select",
    "prompt": "What is the camp’s lost camper plan?",
    "choices": [
      "10 minutes",
      "20 minutes",
      "30 minutes",
      "Other (specify)",
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.81",
    "n": 81,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "multi_select",
    "prompt": "Check all activities available to campers in sections a and b and complete the specified Activity-Specific Plan or Generic Activity Plan Template for that activity.",
    "choices": [
      "Archery",
      "Swimming (on-site)",
      "Boating, canoeing or kayaking",
      "Camp trips",
      "Off-site swimming",
      "Horseback riding",
      "Wilderness trips",
      "Riflery",
      "Sports",
      "Aquatic theme parks",
      "Ropes or challenge course"
    ],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.supervision.82",
    "n": 82,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "select",
    "prompt": "Who monitors and assesses weather conditions to cancel or curtail activities (on-site and during camp trips) due to weather, such as thunderstorms, high heat and/or humidity and elevated ozone levels, and notifies activity staff leaders of activity restrictions?",
    "choices": [
      "Camp Director",
      "Program Director",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.83",
    "n": 83,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "multi_select",
    "prompt": "Means of staff notification will include but not be limited to:",
    "choices": [
      "Direct verbal contact",
      "Cell phone",
      "Portable radios",
      "Public address systems",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.84",
    "n": 84,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "multi_select",
    "prompt": "Which activities will be suspended or minimized in anticipation and response to thunderstorm and lightning activity? (check all that apply)",
    "choices": [
      "Hikes and other activities that would prevent staff and campers from access to immediate cover in a shelter, car or bus",
      "Swimming (outdoors and indoors), boating or other activities in or on the water",
      "All outdoor activity will be ceased if thunderstorm and lightning activity occurs",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.85",
    "n": 85,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "long_text",
    "prompt": "Specify the locations/buildings designated as shelters for storms:",
    "choices": [],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.supervision.86",
    "n": 86,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "multi_select",
    "prompt": "What instructions will be provided for those caught away from shelter/camp by a storm?",
    "choices": [
      "Do not use telephone except in an emergency (cell phones or cordless phones are acceptable for use)",
      "If no shelter of any type is available, then",
      "Stay away from utility poles and tall, isolated or lone trees",
      "Stay off of or leave hill tops",
      "Avoid wire fences, pipes, and metal poles",
      "If in a group, stay several yards apart",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.supervision.87",
    "n": 87,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "long_text",
    "prompt": "Camp will not resume outdoor activities until thunder has not been heard for at least a full thirty minutes.",
    "choices": [],
    "columns": [],
    "freeText": false
  },
  {
    "key": "ny.plan.supervision.88",
    "n": 88,
    "category": "ACTIVITIES_SUPERVISION",
    "kind": "multi_select",
    "prompt": "Does incidental water immersion occur during any camp activities (on-site or off-site)?",
    "choices": [
      "Yes",
      "No",
      "Incidental water immersion is not permitted in water deeper than mid-calf of the shortest camper",
      "The following procedures(s) will be used for incidental water immersion in water deeper than mid-calf of the shortest camper (specify below)",
      "Check to indicate agreement with the above procedure. Specify additional procedures in the space provided below",
      "Alternative procedures (when the above procedure is not utilized, a comprehensive alternative must be provided)"
    ],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.training.89",
    "n": 89,
    "category": "STAFF_TRAINING",
    "kind": "table",
    "prompt": "Staff training and orientation is as important as the selection of good staff. Training programs should occur prior to the arrival of the first campers. Provide an estimated time spent during staff training for each of the following subject areas:",
    "choices": [],
    "columns": [
      "Subject",
      "Estimated time(hours/minutes)"
    ],
    "freeText": false
  },
  {
    "key": "ny.plan.training.90",
    "n": 90,
    "category": "STAFF_TRAINING",
    "kind": "long_text",
    "prompt": "What are the procedures for conducting staff training?",
    "choices": [],
    "columns": [],
    "freeText": true
  },
  {
    "key": "ny.plan.training.91",
    "n": 91,
    "category": "STAFF_TRAINING",
    "kind": "table",
    "prompt": "Every camper must receive, on arrival at the camp, an orientation to the camp and the camp’s policies and procedures. Provide an estimated time spent during camper orientation for each of the following subject areas:",
    "choices": [],
    "columns": [
      "Subject",
      "Estimated time (hours/minutes)"
    ],
    "freeText": false
  },
  {
    "key": "ny.plan.training.92",
    "n": 92,
    "category": "STAFF_TRAINING",
    "kind": "select",
    "prompt": "How will camper orientation be documented?",
    "choices": [
      "Camper sign-in sheet",
      "Camp Director documentation of participating campers and date of orientation",
      "Other (specify)"
    ],
    "columns": [],
    "freeText": true
  }
];

export const PLAN_ADDENDA: PlanAddendum[] = [
  {
    "code": "archery",
    "title": "Archery Plan",
    "appliesWhen": {
      "has_archery": "true"
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_archery.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_archery.docx"
  },
  {
    "code": "swimming",
    "title": "Swimming Plan",
    "appliesWhen": {
      "any_of": {
        "has_pool": "true",
        "has_waterfront": "true"
      }
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_swimming.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_swimming.docx"
  },
  {
    "code": "boating",
    "title": "Boating, Canoeing and Kayaking Plan",
    "appliesWhen": {
      "has_boating": "true"
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_boating.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_boating.docx"
  },
  {
    "code": "camp_trips",
    "title": "Camp Trips Plan",
    "appliesWhen": {
      "offers_trips": "true"
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_camp_trips.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_camp_trips.docx"
  },
  {
    "code": "camp_trip_swimming",
    "title": "Camp Trip Swimming Plan",
    "appliesWhen": {
      "offers_offsite_swim": "true"
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_camp_trip_swimming.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_camp_trip_swimming.docx"
  },
  {
    "code": "horseback_riding",
    "title": "Horseback Riding Plan",
    "appliesWhen": {
      "has_equestrian": "true"
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_horseback_riding.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_horseback_riding.docx"
  },
  {
    "code": "riflery",
    "title": "Riflery Plan",
    "appliesWhen": {
      "has_riflery": "true"
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_riflery.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_riflery.docx"
  },
  {
    "code": "challenge_course",
    "title": "Challenge Course Plan",
    "appliesWhen": {
      "has_challenge_course": "true"
    },
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_challenge_course.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_challenge_course.docx"
  },
  {
    "code": "sports",
    "title": "Sports Plan",
    "appliesWhen": {},
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_sports.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_sports.docx"
  },
  {
    "code": "spray_grounds",
    "title": "Spray Grounds Plan",
    "appliesWhen": {},
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_spray_grounds.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_spray_grounds.docx"
  },
  {
    "code": "generic_activity",
    "title": "Generic Activity Plan",
    "appliesWhen": {},
    "sourceUrl": "https://www.health.ny.gov/environmental/outdoors/camps/docs/cc_safety_plan_generic_activity.docx",
    "archivedPath": "docs/compliance/sources/nysdoh/cc_safety_plan_generic_activity.docx"
  }
];

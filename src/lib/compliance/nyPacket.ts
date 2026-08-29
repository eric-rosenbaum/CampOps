import { fillForm, loadBlankForm, type FormMap, type FormValues } from './formFiller';
import doh367 from './forms/ny/doh-367.map.json';
import doh367a from './forms/ny/doh-367a.map.json';
import doh2040 from './forms/ny/doh-2040.map.json';
import doh2271 from './forms/ny/doh-2271.map.json';
import doh2286 from './forms/ny/doh-2286.map.json';
import type { ComplianceAnswers, CompliancePlanSection } from '@/lib/types';

/**
 * Assembles the New York permit packet.
 *
 * The packet is not a document we design — it is the state's own forms, filled from platform
 * data, in the order the county's checklist lists them. That ordering matters: a reviewer works
 * down their list, and a packet in a different order reads as incomplete even when it is not.
 */

export interface PacketCamp {
  campName: string;
  county: string;
  address: string;
  /** Town, village or city. DOH-2286 asks for it in its own cell, separate from the county. */
  town?: string;
  facilityCode?: string;
  directorName?: string;
  healthDirectorName?: string;
  aquaticsDirectorName?: string;
  openDate?: string;   // YYYY-MM-DD
  closeDate?: string;
}

export interface PacketForm {
  code: string;         // 'DOH-2040'
  file: string;         // 'doh-2040'
  title: string;
  map: FormMap;
  /** Some forms are attach-only: no text layer, or one-time engineering. */
  attachOnly?: boolean;
}

export const NY_FORMS: PacketForm[] = [
  { code: 'DOH-367',  file: 'doh-367',  title: 'Facility and Camp Description',        map: doh367 as unknown as FormMap },
  { code: 'DOH-367a', file: 'doh-367a', title: 'Additional Staff Qualifications',      map: doh367a as unknown as FormMap },
  { code: 'DOH-2040', file: 'doh-2040', title: 'Written Plan Checklist',               map: doh2040 as unknown as FormMap },
  { code: 'DOH-2271', file: 'doh-2271', title: 'Director Certified Statement',         map: doh2271 as unknown as FormMap },
  { code: 'DOH-2286', file: 'doh-2286', title: 'Pool and Beach Safety Plan Checklist', map: doh2286 as unknown as FormMap },
];

function splitDate(iso?: string): { m: string; d: string; y2: string; y4: string } {
  if (!iso) return { m: '', d: '', y2: '', y4: '' };
  const [y, m, d] = iso.split('-');
  return { m, d, y2: (y ?? '').slice(2), y4: y ?? '' };
}

/** Header values every NY form wants, keyed the way the maps name them. */
function headerValues(camp: PacketCamp): FormValues {
  const today = new Date().toISOString().slice(0, 10);
  const t = splitDate(today);
  const open = splitDate(camp.openDate);
  const close = splitDate(camp.closeDate);
  return {
    camp_name: camp.campName, facility_name: camp.campName,
    county: camp.county, address: camp.address,
    facility_code: camp.facilityCode ?? '',
    // Year blanks on these forms are ~12pt; a four-digit year does not fit at a legible size.
    date_month: t.m, date_day: t.d, date_year: t.y2,
    date_open_month: open.m, date_open_day: open.d, date_open_year: open.y2,
    date_close_month: close.m, date_close_day: close.d, date_close_year: close.y2,
    camp_director_name: camp.directorName ?? '',
    camp_health_director_name: camp.healthDirectorName ?? '',
    aquatics_director_name: camp.aquaticsDirectorName ?? '',
    director_name: camp.directorName ?? '',
    attestation_print_name: camp.directorName ?? '',
  };
}

// ─── Reading the setup interview ──────────────────────────────────────────────

/**
 * Setup answers are stored as text — a bare `true`, `false`, `overnight`, `well`. Normalising
 * here, once, keeps every comparison below to a plain equality, and tolerates a value that some
 * other writer JSON-encoded before storing it rather than silently reading `"true"` as no.
 */
function answerOf(answers: ComplianceAnswers, key: string): string | undefined {
  const raw = answers[key];
  if (raw === undefined || raw === null) return undefined;
  const v = String(raw).trim().replace(/^"|"$/g, '').trim().toLowerCase();
  return v === '' ? undefined : v;
}

/**
 * Yes, no, or *we never asked*. The third case is the one that matters: an unanswered question
 * must stay `undefined` all the way to the page, because collapsing it to `false` would let a
 * blank interview print a signed statement that the camp does none of these things.
 */
function askedYes(answers: ComplianceAnswers, key: string): boolean | undefined {
  const v = answerOf(answers, key);
  if (v === 'true' || v === 'yes') return true;
  if (v === 'false' || v === 'no') return false;
  return undefined;
}

/** Ticks the box only on a definite yes. A no, or a question never asked, leaves it alone. */
function tick(values: FormValues, key: string, established: boolean | undefined): void {
  if (established === true) values[key] = true;
}

// ─── Whose field is it ────────────────────────────────────────────────────────

/**
 * Every checklist row on these forms has two halves. The camp answers the left-hand columns; the
 * local health department fills the right-hand ones in on their own copy when they review the
 * packet. Answering a question on the reviewer's behalf would be far worse than leaving our own
 * number low, so reviewer-owned fields are dropped from what we draw *and* from the coverage
 * denominator — counting them makes a nearly finished form read as barely started.
 */
const REVIEWER_ONLY_KEYS = new Set([
  // DOH-2286's sign-off block runs operator-then-reviewer down the page. The operator's three
  // fields are the camp's; these two are the health department's, and the map neither disables
  // them nor names them in a way the rules below would catch.
  'plan_review_by',
  'plan_review_date',
]);

function isReviewerOwned(key: string, disabled?: boolean): boolean {
  return disabled === true                 // office-use cells the maps already flag
    || key.includes('_lhd_')               // DOH-2040 / DOH-2286 health-department columns
    || key.endsWith('_remarks')            // the reviewer's notes column beside them
    || REVIEWER_ONLY_KEYS.has(key);
}

/** Last gate before the page: nothing reviewer-owned can reach the renderer, whatever built it. */
function campOwnedOnly(map: FormMap, values: FormValues): FormValues {
  const disabledByKey = new Map(map.fields.map((f) => [f.key, f.disabled]));
  const out: FormValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (isReviewerOwned(key, disabledByKey.get(key))) continue;
    out[key] = value;
  }
  return out;
}

/**
 * DOH-367 asks the camp to describe itself, and the setup interview has already asked most of
 * the same questions — so the activity grid and the disability question fill themselves.
 *
 * The rule throughout: tick only where one interview answer means exactly one printed row. The
 * grid has no "no" column, so a false answer and an unasked question look identical on paper,
 * and both are correct. A blank row costs a director thirty seconds with a pen; a wrong tick is
 * a false statement on a form they sign.
 */
export function facilityValues(camp: PacketCamp, answers: ComplianceAnswers): FormValues {
  const values: FormValues = headerValues(camp);

  // The shared header calls this `camp_health_director_name`; DOH-367's map calls the same blank
  // `health_director_name`, so the header's copy of it never lands. Set the name the map uses.
  values.health_director_name = camp.healthDirectorName ?? '';

  // ── Activities available to campers ──
  // One question, one row, same meaning on both sides.
  tick(values, 'activity_archery', askedYes(answers, 'has_archery'));
  tick(values, 'activity_riflery', askedYes(answers, 'has_riflery'));
  tick(values, 'activity_horseback_riding', askedYes(answers, 'has_equestrian'));
  tick(values, 'activity_ropes_challenge_course', askedYes(answers, 'has_challenge_course'));
  tick(values, 'activity_camp_trips', askedYes(answers, 'offers_trips'));
  // "Boating/Canoeing/Rafting" is the whole of what we asked about, and no more: the form has no
  // separate sailing or waterskiing row, so nothing here is being inferred.
  tick(values, 'activity_boating_canoeing_rafting', askedYes(answers, 'has_boating'));
  // A swimming pool at the camp is swimming on-site. A waterfront is deliberately not counted
  // here — "do you have a lake, river or beach" is also true of a boating-only waterfront, and a
  // sanitarian reads this row as a statement that campers swim.
  tick(values, 'activity_swimming_on_site', askedYes(answers, 'has_pool'));

  // Left blank on purpose:
  //  · Swimming Off-Site and Swimming Wilderness are two rows, and `offers_offsite_swim` asks
  //    about both in one breath. A yes says one of them is true without saying which.
  //  · Cooking — `has_kitchen` is about running a kitchen, which is food service, not a camper
  //    activity period.
  //  · High Adventure and Other both carry an asterisk demanding a written specification, so
  //    `has_climbing` cannot tick either on its own.
  //  · Hiking, Sports, Nature Study and the rest are simply never asked.

  // ── Camper population ──
  // The form asks whether 20% or more of campers are developmentally disabled; the interview
  // asks whether the camp enrols any at all. A camp that enrols none is certainly under 20%, so
  // a no answers the form's No box. A yes does not answer it — enrolling some says nothing about
  // the threshold — so it ticks nothing and the director decides.
  if (askedYes(answers, 'enrolls_campers_with_disabilities') === false) {
    values.developmentally_disabled_no = true;
  }

  // The camper-capacity table wants each session's length and its campers split by age band and
  // sex. We hold a season, a camp-wide camper count and nothing per session, so the whole table
  // stays blank rather than being guessed at from the season dates.

  // ── Attachments ──
  // "No trips" is one of the few explicit no boxes on this form, so a no is fillable here even
  // though the activity grid above it is not. Its sibling, "List attached", is not ours: whether
  // an itinerary is in the envelope is a fact about the filing, not about the camp.
  if (askedYes(answers, 'offers_trips') === false) values.camp_trips_none = true;

  return values;
}

/**
 * DOH-2286 does not fill from plan sections, and this is the check the shape of the form invites.
 *
 * Its rows read like DOH-2040's and the row keys are named the same way, so the obvious move is
 * to run them through the same matcher. They do not match, and they should not: DOH-2286 is a
 * checklist for the pool and beach safety plan, a separate document required by 6-1.23, while
 * every plan section the platform holds belongs to the camp's written safety plan. "Chain of
 * Command Outlined" here means the pool plan's chain of command, not the one on p. 3 of the camp
 * plan. Nor does an aquatics answer help: `has_pool` says a pool exists, not that its plan covers
 * diving safety or bather capacity.
 *
 * So the twenty-four rows stay blank until the platform holds pool-plan sections of its own, and
 * this form fills only its header.
 */
export function poolSafetyChecklistValues(camp: PacketCamp): FormValues {
  const values: FormValues = headerValues(camp);
  values.name_of_facility = camp.campName;
  values.town_village_or_city = camp.town ?? '';
  return values;
}

/**
 * DOH-2040 is the one form we can fill almost completely from platform data: the camp has told
 * us which plan sections exist and which page each is on, and that is exactly what the checklist
 * asks for.
 */
export function planChecklistValues(
  camp: PacketCamp, sections: CompliancePlanSection[], map: FormMap,
): FormValues {
  const values: FormValues = headerValues(camp);
  const keys = new Set(map.fields.map((f) => f.key));

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  for (const sec of sections) {
    // Map keys are section-prefixed because component names repeat across categories
    // ("Chain of Command" appears under both Personnel and Staff Training).
    const candidates = [
      `row_${norm(sec.category)}_${norm(sec.title)}`,
      `row_${norm(sec.title)}`,
    ];
    const base = candidates.find((c) => keys.has(`${c}_yes`) || keys.has(`${c}_na`));
    if (!base) continue;

    if (sec.status === 'not_applicable') {
      if (keys.has(`${base}_na`)) values[`${base}_na`] = true;
    } else if (sec.status === 'complete') {
      if (keys.has(`${base}_yes`)) values[`${base}_yes`] = true;
      if (sec.pageRef && keys.has(`${base}_page`)) values[`${base}_page`] = sec.pageRef;
    }
  }
  return values;
}

/** Which builder a form uses. One place, so the download and the percentage cannot disagree. */
function valuesFor(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[], answers: ComplianceAnswers,
): FormValues {
  switch (form.code) {
    case 'DOH-367':  return facilityValues(camp, answers);
    case 'DOH-2040': return planChecklistValues(camp, sections, form.map);
    case 'DOH-2286': return poolSafetyChecklistValues(camp);
    default:         return headerValues(camp);
  }
}

export async function generateForm(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[],
  answers: ComplianceAnswers = {},
): Promise<Uint8Array> {
  const blank = await loadBlankForm(form.file);
  const values = campOwnedOnly(form.map, valuesFor(form, camp, sections, answers));
  return fillForm(blank, form.map, values);
}

/**
 * How much of the camp's own share of a form we can populate today. Honest, and shown in the UI.
 *
 * The denominator is the fields the camp is responsible for: the map's fillable fields less
 * everything the local health department fills in on review. Measuring against the whole map
 * would report a form we have all but finished as barely started, because on the checklist forms
 * half of every row belongs to the reviewer.
 */
export function coverage(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[],
  answers: ComplianceAnswers = {},
): number {
  const values = campOwnedOnly(form.map, valuesFor(form, camp, sections, answers));
  const ours = form.map.fields.filter((f) => !isReviewerOwned(f.key, f.disabled));
  const filled = ours.filter((f) => {
    const v = values[f.key];
    return v !== undefined && v !== null && v !== '' && v !== false;
  });
  return ours.length === 0 ? 0 : Math.round((filled.length / ours.length) * 100);
}

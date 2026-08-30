import { fillForm, loadBlankForm, type FormMap, type FormValues } from './formFiller';
import doh367 from './forms/ny/doh-367.map.json';
import doh367a from './forms/ny/doh-367a.map.json';
import doh2040 from './forms/ny/doh-2040.map.json';
import doh2271 from './forms/ny/doh-2271.map.json';
import doh2286 from './forms/ny/doh-2286.map.json';
import type {
  ComplianceAnswers, CompliancePlanSection, ComplianceFormQuestion, FormAnswers,
  CertType, SafetyStaff, StaffCertification, SessionCapacity,
} from '@/lib/types';
import { answerValues } from './formAnswers';

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
  /**
   * The safety roster, already joined to its certifications and sorted. Carried on the camp
   * rather than threaded as a ninth positional argument through every builder, and built by
   * `packetRoster` so the sort that decides which staff member prints on which row lives in
   * exactly one place.
   */
  staff?: PacketStaffMember[];
}

/** One certification, flattened to what the forms actually print. */
export interface PacketStaffCert {
  id: string;
  certType: CertType;
  certName: string;
  provider: string | null;
  issuedDate: string | null;
}

/** One person on the roster, with everything the New York forms ask about them. */
export interface PacketStaffMember {
  id: string;
  name: string;
  title: string;
  isActive: boolean;
  dateOfBirth: string | null;
  education: string | null;
  qualifyingExperience: string | null;
  professionalLicenseNumber: string | null;
  certs: PacketStaffCert[];
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

/**
 * Split a stored date into the pieces these forms print.
 *
 * Takes the first ten characters rather than splitting the whole string, because a value that
 * arrives as a full timestamp would otherwise put "14T04:00:00.000Z" in a day box eighteen
 * points wide, where it renders as "14..." and looks like a truncated but plausible date. The
 * leading ten characters of an ISO date are the camp-local calendar day either way, which is
 * what the form is asking for; see the project's rule about never treating YYYY-MM-DD as an
 * instant.
 */
function splitDate(iso?: string): { m: string; d: string; y2: string; y4: string } {
  if (!iso) return { m: '', d: '', y2: '', y4: '' };
  const [y, m, d] = iso.slice(0, 10).split('-');
  return { m: m ?? '', d: d ?? '', y2: (y ?? '').slice(2), y4: y ?? '' };
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
    // DOH-2040 / DOH-2286 health-department columns. Both forms of the prefix: the column keys
    // read `row_x_lhd_yes`, but the footer sign-off keys read `lhd_reviewed_by_1`, which the
    // infix test misses. Those are currently caught only because the map also disables them,
    // so a map author who forgets that flag would have us signing the reviewer's block.
    || key.startsWith('lhd_') || key.includes('_lhd_')
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

// ─── The roster on the page ───────────────────────────────────────────────────

/**
 * Turns the safety roster into the shape the form builders read.
 *
 * The sort is the whole reason this is a function rather than a `.map()` at the call site.
 * DOH-367a is a fixed grid of pre-printed rows, and a camp downloads it more than once — before
 * the permit, again after a correction, again when the county asks for a copy. If row 4 is
 * whichever record the database handed back first, the same lifeguard moves between rows on two
 * consecutive downloads and a reviewer comparing them sees a roster that changed. So staff are
 * ordered by name, case-folded, with the row id breaking a tie between two people with the same
 * name. Nothing about that ordering depends on when a record was written or read.
 */
export function packetRoster(
  staff: SafetyStaff[], certifications: StaffCertification[],
): PacketStaffMember[] {
  const certsByStaff = new Map<string, PacketStaffCert[]>();
  for (const c of certifications) {
    const list = certsByStaff.get(c.staffId) ?? [];
    list.push({
      id: c.id, certType: c.certType, certName: c.certName,
      provider: c.provider, issuedDate: c.issuedDate,
    });
    certsByStaff.set(c.staffId, list);
  }
  return staff
    .map((m) => ({
      id: m.id,
      name: m.name,
      title: m.title,
      isActive: m.isActive,
      dateOfBirth: m.dateOfBirth,
      education: m.education,
      qualifyingExperience: m.qualifyingExperience,
      professionalLicenseNumber: m.professionalLicenseNumber,
      certs: certsByStaff.get(m.id) ?? [],
    }))
    .sort(byNameThenId);
}

function byNameThenId(a: PacketStaffMember, b: PacketStaffMember): number {
  const an = a.name.trim().toLowerCase();
  const bn = b.name.trim().toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The one certification of a type that gets printed.
 *
 * A staff member can hold several: last year's card and this year's renewal both sit in the
 * table. The form has one line, and the newest issue date is the one a sanitarian is checking,
 * so that wins. Two cards issued the same day fall back to the record id, which keeps the
 * choice stable across downloads rather than leaving it to array order.
 */
function certOf(m: PacketStaffMember, type: CertType): PacketStaffCert | undefined {
  const found = m.certs.filter((c) => c.certType === type);
  if (found.length <= 1) return found[0];
  return [...found].sort((a, b) => {
    const ad = a.issuedDate ?? '';
    const bd = b.issuedDate ?? '';
    if (ad !== bd) return ad < bd ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

/**
 * Several columns are headed "Provider / Course Title" and are a single cell on the page. Both
 * halves are printed when we hold both, and whichever half exists when we do not — never a
 * dangling separator that reads as a missing value.
 */
function providerAndTitle(c: PacketStaffCert): string {
  return [c.provider?.trim(), c.certName?.trim()].filter(Boolean).join(' / ');
}

/** Writes a date into the month/day/year cells the maps split every date into. */
function writeDate(values: FormValues, base: string, iso: string | null | undefined): void {
  if (!iso) return;
  const d = splitDate(iso);
  if (!d.m || !d.d || !d.y2) return;
  values[`${base}_month`] = d.m;
  values[`${base}_day`] = d.d;
  // These gaps are 17pt between pre-printed slashes; a four-digit year does not fit.
  values[`${base}_year`] = d.y2;
}

/** Provider, course title and issue date for one of DOH-367's aquatics certification rows. */
function writeCertRow(values: FormValues, base: string, c: PacketStaffCert | undefined): void {
  if (!c) return;
  if (c.provider?.trim()) values[`${base}_course_provider`] = c.provider.trim();
  if (c.certName?.trim()) values[`${base}_course_title`] = c.certName.trim();
  writeDate(values, `${base}_issue_date`, c.issuedDate);
}

/**
 * Finds the person a form names, by name.
 *
 * Exact after case-folding and whitespace collapsing, and nothing looser. A near-match would be
 * this code deciding that "Sam Whitfield" and "Samuel Whitfield" are the same employee and then
 * printing one of their birthdays under the other's name on a signed form. No match fills
 * nothing, which prints a blank line for a person to complete.
 */
function memberNamed(
  roster: PacketStaffMember[], name: string | undefined,
): PacketStaffMember | undefined {
  const want = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!want) return undefined;
  return roster.find((m) => m.name.trim().toLowerCase().replace(/\s+/g, ' ') === want);
}

/** Active staff only, in the stable order, ready to be laid into a table. */
function rosterOf(camp: PacketCamp): PacketStaffMember[] {
  return (camp.staff ?? []).filter((m) => m.isActive).sort(byNameThenId);
}

/**
 * Lays people into a fixed grid of pre-printed rows.
 *
 * Row counts come from the form, not from the roster: eleven lifeguards, seven first-aid staff,
 * three swimming instructors. A camp with more than that puts the rest on an attached sheet,
 * which is what the form's own note says to do, so the overflow is dropped here rather than
 * drawn over the table's bottom rule.
 */
function fillRows(
  values: FormValues, prefix: string, rowCount: number, people: PacketStaffMember[],
  write: (values: FormValues, base: string, m: PacketStaffMember) => void,
): void {
  people.slice(0, rowCount).forEach((m, i) => write(values, `${prefix}_row${i + 1}`, m));
}

/**
 * DOH-367a is three tables of certified staff, and every cell in them is something the safety
 * module already holds: who is on the roster, what they are certified in, who issued it and
 * when. The one thing it was missing was a date of birth, which the roster now carries.
 *
 * A person is printed only where their own records put them. Nobody is listed as a lifeguard
 * because their title says lifeguard; they are listed because a lifeguard certification is on
 * file for them. A row with a name and no birthday is correct and useful — it is the reviewer's
 * copy of a real certification with one blank on it — whereas a row invented to look complete
 * is a false statement on a form the operator signs.
 */
export function staffQualificationValues(camp: PacketCamp): FormValues {
  const values: FormValues = headerValues(camp);
  const roster = rosterOf(camp);

  // ── Progressive Swimming Instructor, 3 rows ──
  // WSI is the certification this section is asking about; the module already names it that.
  fillRows(values, 'psi', 3, roster.filter((m) => certOf(m, 'wsi')), (v, base, m) => {
    const c = certOf(m, 'wsi');
    if (!c) return;
    v[`${base}_staff_name`] = m.name;
    if (c.provider?.trim()) v[`${base}_provider`] = c.provider.trim();
    if (c.certName?.trim()) v[`${base}_course_title`] = c.certName.trim();
    writeDate(v, `${base}_issue_date`, c.issuedDate);
  });

  // ── Lifeguard Certification, 11 rows ──
  // The CPR column beside it is the same person's CPR card, which the form requires each
  // lifeguard to hold separately. Blank when they have none on file, which is the honest
  // answer and the one that tells the camp what to go and fix.
  const guards = roster.filter((m) => certOf(m, 'lifeguard'));
  fillRows(values, 'lifeguard', 11, guards, (v, base, m) => {
    const lg = certOf(m, 'lifeguard');
    if (!lg) return;
    v[`${base}_staff_name`] = m.name;
    writeDate(v, `${base}_date_of_birth`, m.dateOfBirth);
    const lgText = providerAndTitle(lg);
    if (lgText) v[`${base}_lifeguarding_provider_course_title`] = lgText;
    writeDate(v, `${base}_lifeguarding_issue_date`, lg.issuedDate);
    const cpr = certOf(m, 'cpr_aed');
    if (cpr) {
      const cprText = providerAndTitle(cpr);
      if (cprText) v[`${base}_cpr_provider_course_title`] = cprText;
      writeDate(v, `${base}_cpr_issue_date`, cpr.issuedDate);
    }
  });

  // ── Additional First Aid and CPR Staff, 7 rows ──
  // "Additional" is relative to the table above it, so a lifeguard already listed there is not
  // repeated here. Anyone holding either card qualifies for a row; the column they do not hold
  // stays empty rather than borrowing the other one's provider.
  const guardIds = new Set(guards.map((m) => m.id));
  const firstAiders = roster.filter(
    (m) => !guardIds.has(m.id) && (certOf(m, 'first_aid') || certOf(m, 'cpr_aed')),
  );
  fillRows(values, 'first_aid_cpr_staff', 7, firstAiders, (v, base, m) => {
    v[`${base}_staff_name`] = m.name;
    writeDate(v, `${base}_date_of_birth`, m.dateOfBirth);
    const fa = certOf(m, 'first_aid');
    if (fa) {
      const faText = providerAndTitle(fa);
      if (faText) v[`${base}_first_aid_provider_course_title`] = faText;
      writeDate(v, `${base}_first_aid_issue_date`, fa.issuedDate);
    }
    const cpr = certOf(m, 'cpr_aed');
    if (cpr) {
      const cprText = providerAndTitle(cpr);
      if (cprText) v[`${base}_cpr_provider_course_title`] = cprText;
      writeDate(v, `${base}_cpr_issue_date`, cpr.issuedDate);
    }
  });

  // Left blank on purpose:
  //  · Counselor Data wants staff aged 16, 17 and 18-and-over counted by sex. Ages we can now
  //    work out, but who counts as a counselor we cannot: the roster holds a free-text title,
  //    and reading "counselor" out of it would silently miss a unit head and silently count a
  //    counselor-in-training. A wrong headcount on a staffing-ratio form is worse than a blank.
  //  · Riflery Instructor asks for one named person and their certification. Nothing on the
  //    roster says which staff member runs the range.

  return values;
}

/**
 * The three named directors on DOH-367, and what the form asks about each of them.
 *
 * Every value here belongs to a specific person the camp has already named, matched to their
 * own roster record. A director with nothing filled in fills nothing.
 */
function directorValues(camp: PacketCamp): FormValues {
  const values: FormValues = {};
  const roster = rosterOf(camp);

  const director = memberNamed(roster, camp.directorName);
  if (director) {
    writeDate(values, 'camp_director_dob', director.dateOfBirth);
    if (director.education?.trim()) values.camp_director_education = director.education.trim();
    if (director.qualifyingExperience?.trim()) {
      values.camp_director_qualifying_experience = director.qualifyingExperience.trim();
    }
  }

  const health = memberNamed(roster, camp.healthDirectorName);
  if (health) {
    if (health.professionalLicenseNumber?.trim()) {
      values.health_director_nys_license_number = health.professionalLicenseNumber.trim();
    }
    // The CPR and First Aid blocks on this page ask which of two people holds the card, the
    // health director or their assistant. Ticking the health director is a statement of fact we
    // hold: it is drawn from their own certification record, not from anyone else's.
    const cpr = certOf(health, 'cpr_aed');
    if (cpr) {
      values.cert_cpr_staff_health_director = true;
      writeCertRow(values, 'cert_cpr', cpr);
    }
    const firstAid = certOf(health, 'first_aid');
    if (firstAid) {
      values.cert_first_aid_staff_health_director = true;
      writeCertRow(values, 'cert_first_aid', firstAid);
    }
    // The qualification tick boxes beside it — Doctor, NP, PA, RN, LPN, EMT — are deliberately
    // not derived from the licence number or the title. "NYS RN 123456" happening to contain
    // "RN" is not the camp telling us their health director is a registered nurse.
  }

  const aquatics = memberNamed(roster, camp.aquaticsDirectorName);
  if (aquatics) {
    writeDate(values, 'aquatics_director_dob', aquatics.dateOfBirth);
    writeCertRow(values, 'aq_cert_lifeguarding', certOf(aquatics, 'lifeguard'));
    writeCertRow(values, 'aq_cert_progressive_swimming_instructor', certOf(aquatics, 'wsi'));
    writeCertRow(values, 'aq_cert_cpr', certOf(aquatics, 'cpr_aed'));
    writeCertRow(values, 'aq_cert_first_aid', certOf(aquatics, 'first_aid'));
    // Lifeguard Supervision and Management has no counterpart in the module's certification
    // types, so its row stays blank rather than being filled from the plain lifeguard card.
    // The three previous-experience boxes below it are not on the roster either.
  }

  return values;
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

  // The camper-capacity table is filled by sessionCapacityValues below, from what the camp
  // entered under Your records. Nothing about it is inferred from the season or from the
  // camp-wide camper count.

  // ── Attachments ──
  // "No trips" is one of the few explicit no boxes on this form, so a no is fillable here even
  // though the activity grid above it is not. Its sibling, "List attached", is not ours: whether
  // an itinerary is in the envelope is a fact about the filing, not about the camp.
  if (askedYes(answers, 'offers_trips') === false) values.camp_trips_none = true;

  // ── The three named directors ──
  // Their date of birth, background and licence number, read off their own roster record.
  return { ...values, ...directorValues(camp) };
}

// ─── The camper capacity table ────────────────────────────────────────────────

/**
 * The twelve count cells of one session row, as [stored property, the suffix DOH-367's map uses].
 *
 * Three spellings of the same six bands exist — the form prints "6 & 7", the map keys it
 * `age_6_and_7`, the database column is `age_6_7` — so the translation is written out in full
 * rather than derived. A rule that turned one into another would be one regex away from putting
 * the eight-to-twelves in the thirteen-to-fifteen column, which is a number the camp signs for.
 */
const CAPACITY_FIELDS: [keyof SessionCapacity, string][] = [
  ['age1To5Male', 'age_1_to_5_male'],
  ['age1To5Female', 'age_1_to_5_female'],
  ['age6And7Male', 'age_6_and_7_male'],
  ['age6And7Female', 'age_6_and_7_female'],
  ['age8To12Male', 'age_8_to_12_male'],
  ['age8To12Female', 'age_8_to_12_female'],
  ['age13To15Male', 'age_13_to_15_male'],
  ['age13To15Female', 'age_13_to_15_female'],
  ['age16And17Male', 'age_16_and_17_male'],
  ['age16And17Female', 'age_16_and_17_female'],
  ['citsMale', 'age_cits_male'],
  ['citsFemale', 'age_cits_female'],
];

/** Every count in one row. Also what decides whether the row is worth printing at all. */
function camperTotal(session: SessionCapacity): number {
  let total = 0;
  for (const [prop] of CAPACITY_FIELDS) total += Number(session[prop] ?? 0);
  return total;
}

/**
 * DOH-367's camper capacity table, one row per session the camp has entered.
 *
 * A row with no campers in it fills nothing — not its day count, not its Day or Overnight tick.
 * Printing a session's length with no attendance beside it reads as a session that ran and took
 * nobody, which is a different statement from a row the camp has not filled in yet.
 *
 * A band holding zero also prints nothing. The counts are stored NOT NULL, so an untouched cell
 * and a deliberate zero are the same value by the time they reach here, and a blank cell on a
 * filed form is the safer of the two to print.
 */
export function sessionCapacityValues(sessions: SessionCapacity[]): FormValues {
  const values: FormValues = {};
  for (const session of sessions) {
    // The form has ten rows. An eleventh has nowhere to go, and is dropped here as well as
    // refused by the editor, so no path can print a session over the top of another.
    if (session.sessionIndex < 1 || session.sessionIndex > 10) continue;
    if (camperTotal(session) === 0) continue;

    const row = `session_${session.sessionIndex}`;
    if (session.campType === 'day') values[`${row}_type_day`] = true;
    if (session.campType === 'overnight') values[`${row}_type_overnight`] = true;
    if (session.numberOfDays !== null && session.numberOfDays > 0) {
      values[`${row}_number_of_days`] = String(session.numberOfDays);
    }
    for (const [prop, suffix] of CAPACITY_FIELDS) {
      const n = Number(session[prop] ?? 0);
      if (n > 0) values[`${row}_${suffix}`] = String(n);
    }
  }
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
export function poolSafetyChecklistValues(
  camp: PacketCamp, sections: CompliancePlanSection[], rowKeyBySectionCode: Record<string, string>,
): FormValues {
  const values: FormValues = headerValues(camp);
  values.name_of_facility = camp.campName;
  values.town_village_or_city = camp.town ?? '';
  return { ...values, ...checklistRows(sections, rowKeyBySectionCode) };
}

/**
 * Tick the Yes or N/A cell for each written section, and write its page.
 *
 * The row a component fills is looked up, never derived. Slugifying the title used to be how
 * this worked, and it silently lost seven components whose titles contain an ampersand: a camp
 * that had WRITTEN those sections printed blank rows on the form it files. Two curated data sets
 * joined by a guess will drift again, so the link is data now. A component with no row key fills
 * nothing rather than guessing at one.
 */
function checklistRows(
  sections: CompliancePlanSection[],
  rowKeyBySectionCode: Record<string, string>,
  pageBySectionCode: Record<string, string> = {},
): FormValues {
  const values: FormValues = {};
  for (const sec of sections) {
    const base = rowKeyBySectionCode[sec.sectionCode];
    if (!base) continue;
    if (sec.status === 'not_applicable') {
      values[`${base}_na`] = true;
    } else if (sec.status === 'complete') {
      values[`${base}_yes`] = true;
      // Ours if we rendered the plan, theirs if they keep their own document.
      const page = pageBySectionCode[sec.sectionCode] ?? sec.pageRef;
      if (page) values[`${base}_page`] = page;
    }
  }
  return values;
}

/**
 * DOH-2040 is the one form we can fill almost completely from platform data: the camp has told
 * us which plan sections exist and which page each is on, and that is exactly what the checklist
 * asks for.
 */
export function planChecklistValues(
  camp: PacketCamp, sections: CompliancePlanSection[],
  rowKeyBySectionCode: Record<string, string>,
  /**
   * Where each section landed in the plan we rendered, keyed by section code.
   *
   * The checklist asks for a page number against every component. When we generate the plan we
   * know the answer, so the camp is not asked to count pages across seventy-three rows. A camp
   * keeping its own plan document has none of this, and its typed page reference is used
   * instead.
   */
  pageBySectionCode: Record<string, string> = {},
): FormValues {
  return {
    ...headerValues(camp),
    ...checklistRows(sections, rowKeyBySectionCode, pageBySectionCode),
  };
}

/** Which builder a form uses. One place, so the download and the percentage cannot disagree. */
function valuesFor(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[], answers: ComplianceAnswers,
  rowKeyBySectionCode: Record<string, string> = {},
  pageBySectionCode: Record<string, string> = {},
  /** What the camp answered to the questions the forms ask directly. */
  formQuestions: ComplianceFormQuestion[] = [],
  formAnswers: FormAnswers = {},
  /** The camper capacity table, which fills DOH-367's ten session rows. */
  sessions: SessionCapacity[] = [],
): FormValues {
  // Everything derivable, then everything answered. Answers win a collision, because a camp
  // correcting a value by hand should not be overruled by a guess we made from a neighbouring
  // record.
  const asked = answerValues(form.code, formQuestions, formAnswers);
  const derived = derivedValuesFor(
    form, camp, sections, answers, rowKeyBySectionCode, pageBySectionCode, sessions,
  );
  return { ...derived, ...asked };
}

function derivedValuesFor(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[], answers: ComplianceAnswers,
  rowKeyBySectionCode: Record<string, string> = {},
  pageBySectionCode: Record<string, string> = {},
  sessions: SessionCapacity[] = [],
): FormValues {
  switch (form.code) {
    case 'DOH-367':  return { ...facilityValues(camp, answers), ...sessionCapacityValues(sessions) };
    case 'DOH-367a': return staffQualificationValues(camp);
    case 'DOH-2040': return planChecklistValues(camp, sections, rowKeyBySectionCode, pageBySectionCode);
    // The bathing-facility plan fills its own checklist exactly the way the camp plan does, now
    // that its twenty-four components are real sections the camp writes rather than boxes it
    // ticks to say it wrote them somewhere else.
    case 'DOH-2286': return poolSafetyChecklistValues(camp, sections, rowKeyBySectionCode);
    default:         return headerValues(camp);
  }
}

export async function generateForm(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[],
  answers: ComplianceAnswers = {},
  rowKeyBySectionCode: Record<string, string> = {},
  pageBySectionCode: Record<string, string> = {},
  formQuestions: ComplianceFormQuestion[] = [],
  formAnswers: FormAnswers = {},
  sessions: SessionCapacity[] = [],
): Promise<Uint8Array> {
  const blank = await loadBlankForm(form.file);
  const values = campOwnedOnly(form.map, valuesFor(
    form, camp, sections, answers, rowKeyBySectionCode, pageBySectionCode,
    formQuestions, formAnswers, sessions,
  ));
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
/**
 * How many cells on this form are the camp's to fill.
 *
 * Exported because the form detail page states it out loud. "This form has 280 cells, 240 of
 * them are the health department's" is the sentence that stops a director reading a low
 * percentage as the product failing them.
 */
export function campOwnedCount(form: PacketForm): number {
  return form.map.fields.filter((f) => !isReviewerOwned(f.key, f.disabled)).length;
}

export function coverage(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[],
  answers: ComplianceAnswers = {},
  rowKeyBySectionCode: Record<string, string> = {},
  formQuestions: ComplianceFormQuestion[] = [],
  formAnswers: FormAnswers = {},
  sessions: SessionCapacity[] = [],
): number {
  const values = campOwnedOnly(form.map, valuesFor(
    form, camp, sections, answers, rowKeyBySectionCode, {}, formQuestions, formAnswers, sessions,
  ));
  const ours = form.map.fields.filter((f) => !isReviewerOwned(f.key, f.disabled));
  const filled = ours.filter((f) => {
    const v = values[f.key];
    return v !== undefined && v !== null && v !== '' && v !== false;
  });
  return ours.length === 0 ? 0 : Math.round((filled.length / ours.length) * 100);
}

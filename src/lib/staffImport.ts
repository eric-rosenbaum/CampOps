import { parseDateStr, toDateStr } from './utils';

/**
 * Getting a staff roster into the platform without typing it.
 *
 * No camp is going to hand-enter sixty seasonal staff, and the roster already exists somewhere:
 * CampMinder, CampBrain, CampSite, or — for most small camps — a spreadsheet. None of those agree
 * on column names and none of them can be integrated with generically, so the thing that actually
 * works for every camp is the lowest common denominator: export a CSV, paste it in, confirm the
 * columns.
 *
 * Auto-detection is a convenience, never an assumption. Every mapping this module guesses is shown
 * back for confirmation before a single row is written, because a silent mis-map puts one person's
 * date of birth against another person's name, on a form the camp signs.
 *
 * What it deliberately will not import: screening results. A "background check: PASS" column in
 * someone's spreadsheet is exactly the data we have decided never to hold. Dates of checks are
 * recorded through the clearance screen, one action at a time, by a person who knows what they
 * are attesting to.
 */

export type StaffField =
  | 'name' | 'firstName' | 'lastName' | 'title' | 'dateOfBirth' | 'sex'
  | 'education' | 'qualifyingExperience' | 'hiredOn' | 'firstDayOn' | 'isVolunteer';

/** Header text we have actually seen, lowercased. Order matters: earlier patterns win. */
const HEADER_HINTS: { field: StaffField; patterns: string[] }[] = [
  { field: 'firstName', patterns: ['first name', 'firstname', 'first_name', 'given name'] },
  { field: 'lastName', patterns: ['last name', 'lastname', 'last_name', 'surname', 'family name'] },
  { field: 'name', patterns: ['full name', 'staff name', 'name', 'employee', 'person'] },
  { field: 'title', patterns: ['title', 'position', 'job title', 'role', 'job'] },
  { field: 'dateOfBirth', patterns: ['date of birth', 'dob', 'birth date', 'birthdate', 'born'] },
  { field: 'sex', patterns: ['sex', 'gender'] },
  { field: 'education', patterns: ['education', 'school', 'degree', 'highest grade'] },
  { field: 'qualifyingExperience', patterns: ['experience', 'qualifying experience', 'prior camp'] },
  { field: 'hiredOn', patterns: ['hire date', 'hired', 'date hired', 'hired on'] },
  { field: 'firstDayOn', patterns: ['start date', 'first day', 'arrival', 'starts'] },
  { field: 'isVolunteer', patterns: ['volunteer', 'unpaid'] },
];

/**
 * Columns we refuse to map, however they are labelled.
 *
 * These carry the result of a background check. 10 NYCRR 7-2.5(l) and the county both require the
 * check to be *run*; neither requires a camp to hand its result to a software vendor, and holding
 * it turns an operations database into a file of criminal-history data on named people.
 */
const REFUSED = [
  'ssn', 'social security', 'background check', 'criminal', 'conviction', 'dcjs result',
  'registry result', 'clearance result', 'sor result', 'password',
];

export function isRefusedHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return REFUSED.some((r) => h.includes(r));
}

/**
 * Split CSV text into rows.
 *
 * Handles quoted fields containing commas, newlines and doubled quotes, which is what every real
 * export produces the moment somebody's job title contains a comma. Accepts tabs too, since half
 * the "CSV" a camp will paste is actually copied straight out of Excel.
 */
export function parseDelimited(text: string): string[][] {
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const delimiter = pickDelimiter(body);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delimiter) { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  return rows
    .map((r) => r.map((f) => f.trim()))
    .filter((r) => r.some((f) => f.length > 0));
}

/** Whichever of tab or comma appears more on the header line. */
function pickDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));
  return (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';
}

/** Best guess at what each column holds. `null` means "do not import this column". */
export function detectColumns(headers: string[]): (StaffField | null)[] {
  const taken = new Set<StaffField>();
  return headers.map((raw) => {
    const h = raw.trim().toLowerCase();
    if (!h || isRefusedHeader(raw)) return null;
    for (const { field, patterns } of HEADER_HINTS) {
      if (taken.has(field)) continue;
      if (patterns.some((p) => h === p || h.includes(p))) { taken.add(field); return field; }
    }
    return null;
  });
}

export interface ImportedStaffRow {
  name: string;
  title: string;
  dateOfBirth: string | null;
  sex: string | null;
  education: string | null;
  qualifyingExperience: string | null;
  hiredOn: string | null;
  firstDayOn: string | null;
  isVolunteer: boolean;
  /** Why this row cannot be imported at all. Only ever a missing name. */
  problem: string | null;
  /** Imported, but something in it was dropped. Shown so the camp knows to fill it in. */
  warning: string | null;
  /** Matches somebody already on the roster, by name. */
  duplicate: boolean;
}

/**
 * Turn mapped rows into staff, with every row's problems named.
 *
 * A row with no usable name is the only hard failure — everything else on a staff record is
 * optional by design, because most of it is only ever asked about a handful of people. So an
 * unreadable date does not cost the camp the person: the row imports, the date is dropped rather
 * than guessed at, and the warning says so. Guessing would be worse than dropping — a date of
 * birth that silently becomes the wrong year prints on DOH-367a — but throwing away a counselor
 * because their spreadsheet said "ask mum" would be worse than both.
 */
export function buildRows(
  rows: string[][], mapping: (StaffField | null)[], existingNames: string[],
): ImportedStaffRow[] {
  const known = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const valueOf = (row: string[], field: StaffField): string => {
    const i = mapping.indexOf(field);
    return i === -1 ? '' : (row[i] ?? '').trim();
  };

  return rows.map((row) => {
    const whole = valueOf(row, 'name');
    const first = valueOf(row, 'firstName');
    const last = valueOf(row, 'lastName');
    const name = whole || [first, last].filter(Boolean).join(' ').trim();

    const warnings: string[] = [];
    const dob = readDate(valueOf(row, 'dateOfBirth'));
    if (valueOf(row, 'dateOfBirth') && !dob) warnings.push('date of birth not understood, left blank');
    const hired = readDate(valueOf(row, 'hiredOn'));
    const firstDay = readDate(valueOf(row, 'firstDayOn'));

    const rawSex = valueOf(row, 'sex').toLowerCase();
    const sex = rawSex.startsWith('m') ? 'male' : rawSex.startsWith('f') ? 'female' : null;

    const volunteerCell = valueOf(row, 'isVolunteer').toLowerCase();

    return {
      name,
      title: valueOf(row, 'title'),
      dateOfBirth: dob,
      sex,
      education: valueOf(row, 'education') || null,
      qualifyingExperience: valueOf(row, 'qualifyingExperience') || null,
      hiredOn: hired,
      firstDayOn: firstDay,
      isVolunteer: ['yes', 'y', 'true', '1', 'volunteer'].includes(volunteerCell),
      problem: !name ? 'no name in this row' : null,
      warning: warnings.join(', ') || null,
      duplicate: Boolean(name) && known.has(name.toLowerCase()),
    };
  });
}

/**
 * Read a date out of a spreadsheet cell.
 *
 * Accepts ISO, and US M/D/YYYY, which is what a New York camp's spreadsheet holds. Deliberately
 * does NOT accept an ambiguous two-digit year or a bare D/M/YYYY: guessing between 03/04/2009 as
 * March and April is how a fourteen-year-old becomes fifteen on a form somebody signs. Returns a
 * camp-local calendar day, never an instant.
 */
export function readDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return safeDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const us = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (us) return safeDay(Number(us[3]), Number(us[1]), Number(us[2]));

  // "12 March 2009" / "March 12, 2009"
  const parsed = Date.parse(v);
  if (!Number.isNaN(parsed) && /[a-z]{3}/i.test(v)) {
    return toDateStr(new Date(parsed));
  }
  return null;
}

function safeDay(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const back = parseDateStr(iso);
  return Number.isNaN(back.getTime()) || back.getDate() !== d ? null : iso;
}

export const FIELD_LABEL: Record<StaffField, string> = {
  name: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  title: 'Title or position',
  dateOfBirth: 'Date of birth',
  sex: 'Sex',
  education: 'Education',
  qualifyingExperience: 'Qualifying experience',
  hiredOn: 'Hired on',
  firstDayOn: 'First day',
  isVolunteer: 'Volunteer',
};

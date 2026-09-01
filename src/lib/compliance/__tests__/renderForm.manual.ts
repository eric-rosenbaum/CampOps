/**
 * Fill a form through the real production path and write it out, so it can be rasterised and
 * looked at.
 *
 * The rule this exists for: a map that parses is not a map that is correct, and a builder that
 * returns values is not a builder that put them in the right cells. Unlike `fillForm.manual.mjs`,
 * which mirrors the renderer by hand, this imports `generateForm` itself — so what you look at is
 * what a camp downloads, and the harness cannot drift away from the code it is checking.
 *
 * Run it (from the repo root):
 *
 *   node_modules/.bin/rolldown src/lib/compliance/__tests__/renderForm.manual.ts \
 *     --format esm --platform node -o /tmp/render.mjs
 *   node /tmp/render.mjs /tmp/doh-367a-filled.pdf
 *   pdftoppm -png -r 110 /tmp/doh-367a-filled.pdf /tmp/367a
 *
 * Then OPEN THE PNGs. Values inside their cells, ticks on the right rows, nothing over a printed
 * label, nothing off the page. Two bugs got through everything else and were caught only by
 * looking; see this directory's README.
 *
 * The fixture below is DOH-367a's, and is built to exercise the branches that only show up with
 * awkward data: a table filled exactly to its row count, a table overflowing it, and a lifeguard
 * with no CPR card. Add a fixture per form as each one is brought back.
 *
 * `loadBlankForm` fetches the blank over HTTP in the browser; here fetch reads from public/, so
 * run this from the repo root.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { NY_FORMS, generateForm, type PacketCamp } from '../nyPacket';

const realFetch = globalThis.fetch;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = async (url: string) => {
  if (typeof url === 'string' && url.startsWith('/forms/')) {
    const b = readFileSync(`public${url}`);
    return {
      ok: true, status: 200,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    };
  }
  return realFetch(url as string);
};

const cert = (id: string, certType: string, certName: string, provider: string, issuedDate: string) =>
  ({ id, certType, certName, provider, issuedDate }) as never;

/** A roster that exercises every branch: all three tables, an overflow, and a missing CPR card. */
const staff: PacketCamp['staff'] = [];
const push = (name: string, title: string, dob: string | null, certs: unknown[]) =>
  staff!.push({
    id: `s${staff!.length + 1}`, name, title, isActive: true, dateOfBirth: dob,
    education: null, qualifyingExperience: null, professionalLicenseNumber: null,
    certs: certs as never,
  });

// 3 WSI holders exactly fills the swimming-instructor table.
push('Alice Warren', 'Swim Instructor', '1994-03-02', [cert('c1', 'wsi', 'Water Safety Instructor', 'American Red Cross', '2026-04-01')]);
push('Bruno Cortez', 'Swim Instructor', '1991-11-20', [cert('c2', 'wsi', 'Water Safety Instructor', 'American Red Cross', '2026-03-15')]);
push('Cleo Nakamura', 'Aquatics Director', '1988-07-09', [cert('c3', 'wsi', 'Water Safety Instructor', 'YMCA', '2025-05-30')]);

// 12 lifeguards against 11 printed rows, so the overflow path is on the page. The last two hold
// no CPR card, which the form asks each lifeguard for.
for (let i = 1; i <= 12; i++) {
  const certs: unknown[] = [cert(`lg${i}`, 'lifeguard', 'Lifeguarding', 'American Red Cross', '2026-05-0' + ((i % 9) + 1))];
  if (i <= 10) certs.push(cert(`cpr${i}`, 'cpr_aed', 'CPR/AED for Professional Rescuers', 'American Red Cross', '2026-05-01'));
  push(`Guard ${String(i).padStart(2, '0')} Lastname`, 'Lifeguard', `199${i % 10}-06-1${i % 9}`, certs);
}

// First-aid staff who are not lifeguards.
push('Dana Ellsworth', 'Health Director', '1980-01-15', [cert('fa1', 'first_aid', 'Adult First Aid', 'American Red Cross', '2026-02-11'), cert('cprA', 'cpr_aed', 'CPR/AED', 'American Red Cross', '2026-02-11')]);
push('Eli Vasquez', 'Unit Head', '1997-09-30', [cert('fa2', 'first_aid', 'Adult First Aid', 'American Heart Association', '2026-01-08')]);

const camp: PacketCamp = {
  campName: 'Pine Ridge Camp',
  county: 'Westchester',
  address: '142 Pine Ridge Rd, Katonah, NY 10536',
  town: 'Katonah',
  facilityCode: '60-12-3456',
  directorName: 'Dana Ellsworth',
  openDate: '2027-06-28',
  closeDate: '2027-08-20',
  staff,
};

/** Only the props answerValues reads. */
const q = (questionKey: string, sortOrder: number, renders: unknown) =>
  ({ questionKey, sortOrder, renders, answerKind: 'text' }) as never;

const questions = [
  q('ny.counselors.16_male', 430, [{ form: 'DOH-367a', field: 'counselors_age_16_male', part: 'text' }]),
  q('ny.counselors.16_female', 440, [{ form: 'DOH-367a', field: 'counselors_age_16_female', part: 'text' }]),
  q('ny.counselors.17_male', 450, [{ form: 'DOH-367a', field: 'counselors_age_17_male', part: 'text' }]),
  q('ny.counselors.17_female', 460, [{ form: 'DOH-367a', field: 'counselors_age_17_female', part: 'text' }]),
  q('ny.counselors.18_and_over_male', 470, [{ form: 'DOH-367a', field: 'counselors_age_18_and_over_male', part: 'text' }]),
  q('ny.counselors.18_and_over_female', 480, [{ form: 'DOH-367a', field: 'counselors_age_18_and_over_female', part: 'text' }]),
  q('ny.riflery_instructor.name', 415, [{ form: 'DOH-367a', field: 'riflery_instructor_name', part: 'text' }]),
  q('ny.riflery_instructor.dob', 420, [
    { form: 'DOH-367a', field: 'riflery_instructor_dob_month', part: 'month' },
    { form: 'DOH-367a', field: 'riflery_instructor_dob_day', part: 'day' },
    { form: 'DOH-367a', field: 'riflery_instructor_dob_year', part: 'year' },
  ]),
  q('ny.riflery_instructor.certification', 422, [{ form: 'DOH-367a', field: 'riflery_instructor_certification', part: 'text' }]),
  q('ny.riflery_instructor.certification_issued_on', 424, [
    { form: 'DOH-367a', field: 'riflery_instructor_date_issued_month', part: 'month' },
    { form: 'DOH-367a', field: 'riflery_instructor_date_issued_day', part: 'day' },
    { form: 'DOH-367a', field: 'riflery_instructor_date_issued_year', part: 'year' },
  ]),
  q('ny.operator.print_name', 1010, [{ form: 'DOH-367a', field: 'operator_print_name', part: 'text' }]),
  q('ny.operator.title', 1020, [{ form: 'DOH-367a', field: 'operator_title', part: 'text' }]),
  q('ny.operator.signature_text', 1050, [{ form: 'DOH-367a', field: 'operator_signature', part: 'text' }]),
];

const formAnswers = {
  'ny.counselors.16_male': '4',
  'ny.counselors.16_female': '6',
  'ny.counselors.17_male': '9',
  'ny.counselors.17_female': '11',
  'ny.counselors.18_and_over_male': '23',
  'ny.counselors.18_and_over_female': '27',
  'ny.riflery_instructor.name': 'Frank Oyelaran',
  'ny.riflery_instructor.dob': '1979-02-14',
  'ny.riflery_instructor.certification': 'NRA Rifle Instructor',
  'ny.riflery_instructor.certification_issued_on': '2025-10-06',
  'ny.operator.print_name': 'Pine Ridge Camp Association Inc.',
  'ny.operator.title': 'Executive Director',
  'ny.operator.signature_text': 'Dana Ellsworth',
};

const form = NY_FORMS.find((f) => f.code === 'DOH-367a')!;
const bytes = await generateForm(form, camp, [], {}, {}, {}, questions, formAnswers, []);
const out = process.argv[2] ?? '/tmp/doh-367a-filled.pdf';
writeFileSync(out, bytes);
console.log(`wrote ${out} · map fields ${form.map.fields.length} · rotation ${form.map.page_rotation ?? 0}`);

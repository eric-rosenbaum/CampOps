import { fillForm, loadBlankForm, type FormMap, type FormValues } from './formFiller';
import doh367 from './forms/ny/doh-367.map.json';
import doh367a from './forms/ny/doh-367a.map.json';
import doh2040 from './forms/ny/doh-2040.map.json';
import doh2271 from './forms/ny/doh-2271.map.json';
import doh2286 from './forms/ny/doh-2286.map.json';
import type { CompliancePlanSection } from '@/lib/types';

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

export async function generateForm(
  form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[],
): Promise<Uint8Array> {
  const blank = await loadBlankForm(form.file);
  const values = form.code === 'DOH-2040'
    ? planChecklistValues(camp, sections, form.map)
    : headerValues(camp);
  return fillForm(blank, form.map, values);
}

/** How many of a form's fields we can actually populate today. Honest, and shown in the UI. */
export function coverage(form: PacketForm, camp: PacketCamp, sections: CompliancePlanSection[]): number {
  const values = form.code === 'DOH-2040'
    ? planChecklistValues(camp, sections, form.map)
    : headerValues(camp);
  const fillable = form.map.fields.filter((f) => !f.disabled);
  const filled = fillable.filter((f) => {
    const v = values[f.key];
    return v !== undefined && v !== null && v !== '' && v !== false;
  });
  return fillable.length === 0 ? 0 : Math.round((filled.length / fillable.length) * 100);
}

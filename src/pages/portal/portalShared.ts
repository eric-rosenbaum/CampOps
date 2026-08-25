// Shared between the portal page and the rooming board.
//
// These live outside RetreatPortal.tsx purely so the rooming board can use them without an
// import cycle. The portal renders the board, so the board cannot import from the portal.

import { createClient } from '@supabase/supabase-js';

// The portal renders OUTSIDE the authenticated app shell. It talks to Supabase only through
// token-validated RPCs using its own anonymous client, never the ops store.
export const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** The portal calls edge functions directly; both authenticate with the anon key, not a session. */
export function portalFnHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
  };
}

// ─── Shared visual language ──────────────────────────────────────────────────
export const cardClass = 'bg-white border border-border rounded-2xl';
export const inputClass = 'w-full text-[15px] bg-white border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage-pale transition-all placeholder:text-forest/30';
export const labelClass = 'block text-[12px] font-semibold uppercase tracking-wide text-ink-faint mb-1.5';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 bg-forest text-white text-[14px] font-semibold rounded-xl px-5 py-3 hover:bg-forest-mid active:bg-forest disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
export const btnGhost = 'inline-flex items-center justify-center gap-2 bg-white border border-border text-forest text-[13px] font-semibold rounded-xl px-4 py-2.5 hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

// ─── Access session ──────────────────────────────────────────────────────────
// The link opens the portal; a code emailed to the coordinator opens the private half of it
// (roster, rooming, invoices, the agreement). The session it buys lives in sessionStorage
// rather than localStorage: a shared or borrowed device should not stay unlocked after the
// tab closes.

function sessionKey(token: string) { return `campops_portal_session_${token}`; }

export function readPortalSession(token: string): string | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(token));
    if (!raw) return null;
    const v = JSON.parse(raw) as { session: string; expiresAt: number };
    if (!v.session || Date.now() > v.expiresAt) {
      sessionStorage.removeItem(sessionKey(token));
      return null;
    }
    return v.session;
  } catch { return null; }
}

export function writePortalSession(token: string, session: string, hours: number) {
  try {
    sessionStorage.setItem(sessionKey(token), JSON.stringify({
      session, expiresAt: Date.now() + hours * 3_600_000,
    }));
  } catch { /* private mode */ }
}

export function clearPortalSession(token: string) {
  try { sessionStorage.removeItem(sessionKey(token)); } catch { /* private mode */ }
}

// ─── Types (shape of get_portal_data) ────────────────────────────────────────
export interface PortalRetreat {
  id: string;
  group_name: string;
  group_type: string | null;
  camp_name?: string | null;
  /** Camp-level opt-ins. Names only unless the camp turned these on. */
  collect_gender?: boolean;
  collect_dietary?: boolean;
  arrival_date: string;
  departure_date: string;
  headcount: number | null;
  coordinator_name: string | null;
  status: string;
  dietary_flags: string[] | null;
  menu_published: boolean;
  change_requests_enabled: boolean;
  feedback_opens: string | null;
  housing_deadline: string | null;
  headcount_cutoff: string | null;
  pricing_model: string | null;
  rate_per_person_night: number | null;
  nights: number | null;
  deposit_required: number | null;
  deposit_received: number | null;
  deposit_due: string | null;
  final_headcount: number | null;
  final_headcount_at: string | null;
  final_headcount_by: string | null;
  /** The group's own "we're finished" on rooming. The camp's approval is housing[].locked. */
  housing_submitted_at: string | null;
  housing_submitted_by: string | null;
  total_charges: number | null;
  total_paid: number | null;
  balance_due: number | null;
}

export interface PortalDocument {
  id: string;
  doc_type: string;
  name: string;
  status: string;
  due_date: string | null;
  signed_at: string | null;
  signed_by: string | null;
  meta: Record<string, unknown> | null;
  has_file?: boolean;
}

export interface PortalSpace {
  id: string;
  name: string;
  building_id: string | null;
  building: string | null;
  bed_capacity: number | null;
  accessible: boolean | null;
  /** Held by another retreat whose stay overlaps these dates. Not pickable. */
  taken_by_other?: boolean;
}

export interface PortalHousing {
  id: string;
  space_id: string;
  space_name: string;
  subgroup_name: string | null;
  people_count: number | null;
  /** Booked here as a bare number, with no name attached. */
  unnamed_count: number | null;
  notes: string | null;
  locked: boolean;
}

/** One named person on the group's roster. location_id null = not yet placed in a room. */
export interface PortalGuest {
  id: string;
  full_name: string;
  subgroup: string | null;
  gender: string | null;
  dietary: string | null;
  needs_accessible: boolean;
  notes: string | null;
  location_id: string | null;
}

export interface PortalMeal {
  day_date: string;
  meal_period: string;
  name: string | null;
  items: string[] | string | null;
  allergens: string[] | null;
  alternatives: string[] | string | null;
}

export interface PortalChangeRequest {
  id: string;
  kind: string;
  body: string;
  status: string;
  /** 'camp' means the camp asked and this group owes the answer. */
  origin: 'guest' | 'camp';
  submitted_by: string | null;
  submitted_at: string | null;
  response_message: string | null;
  responded_by: string | null;
  responded_at: string | null;
}

export interface PortalInvoice {
  id: string;
  kind: 'deposit' | 'balance';
  number: string;
  amount: number;
  note: string | null;
  due_date: string | null;
  status: string;
  line_items: { description: string; amount: number }[];
  discount: number | null;
  discount_note: string | null;
  issued_at: string;
}

export interface PortalData {
  /** False when the link alone is in use: roster, documents and invoices arrive empty. */
  unlocked?: boolean;
  /** Masked coordinator address, so the portal can say where a code would go. */
  verify_email_hint?: string | null;
  retreat: PortalRetreat;
  documents: PortalDocument[];
  invoices: PortalInvoice[];
  spaces: PortalSpace[];
  housing: PortalHousing[];
  guests: PortalGuest[];
  meals: PortalMeal[];
  change_requests: PortalChangeRequest[];
  feedback_submitted: boolean;
}

// ─── Name parsing ────────────────────────────────────────────────────────────
export interface ParsedGuest {
  full_name: string;
  subgroup?: string | null;
  gender?: string | null;
  dietary?: string | null;
  notes?: string | null;
}

const HEADER_ALIASES: Record<string, keyof ParsedGuest> = {
  name: 'full_name', 'full name': 'full_name', fullname: 'full_name', guest: 'full_name',
  person: 'full_name', 'guest name': 'full_name',
  subgroup: 'subgroup', group: 'subgroup', family: 'subgroup', team: 'subgroup', bus: 'subgroup',
  gender: 'gender', sex: 'gender',
  dietary: 'dietary', diet: 'dietary', allergies: 'dietary', 'dietary needs': 'dietary',
  notes: 'notes', note: 'notes', comment: 'notes',
};

/**
 * Turn a pasted block (a spreadsheet column, a numbered list, an email) into guests.
 *
 * Coordinators paste whatever they have, so this is forgiving on purpose: it strips list
 * numbering and bullets, splits tab- or comma-delimited columns, and reads a header row when
 * one is present. `lastFirst` handles "Reyes, Dana", which is otherwise indistinguishable
 * from a two-column "name, subgroup" paste, hence a caller-supplied answer rather than a guess.
 */
export function parseNames(raw: string, opts: { lastFirst?: boolean } = {}): ParsedGuest[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));

  // A header row only counts if its first cell names something we recognise.
  let cols: (keyof ParsedGuest | null)[] | null = null;
  let start = 0;
  const firstCells = split(lines[0]).map((c) => c.toLowerCase());
  if (firstCells.length > 1 && firstCells.some((c) => HEADER_ALIASES[c] === 'full_name')) {
    cols = firstCells.map((c) => HEADER_ALIASES[c] ?? null);
    start = 1;
  }

  const out: ParsedGuest[] = [];
  for (let i = start; i < lines.length; i++) {
    // Strip "1.", "1)", "-", "•" list markers.
    const line = lines[i].replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '');
    if (!line) continue;
    const cells = split(line);

    if (cols) {
      const g: ParsedGuest = { full_name: '' };
      cols.forEach((key, idx) => { if (key && cells[idx]) (g[key] as string) = cells[idx]; });
      if (g.full_name) out.push(g);
      continue;
    }

    if (opts.lastFirst && cells.length === 2 && delim === ',') {
      out.push({ full_name: `${cells[1]} ${cells[0]}`.trim() });
      continue;
    }

    // No header: first cell is the name, an optional second is the subgroup.
    const name = cells[0];
    if (!name) continue;
    out.push({ full_name: name, subgroup: cells.length > 1 ? cells[1] || null : null });
  }
  return out;
}

/**
 * True when a two-column paste is most likely "Reyes, Dana" rather than "Dana Reyes, Staff".
 *
 * Both shapes match the same regex, so the tell is repetition: a grouping column says
 * "Smith family" over and over, while second forenames are nearly all distinct and nearly
 * all a single word. When the signal is weak this returns false, because silently rewriting
 * someone's name is a worse failure than asking the coordinator to tick a box.
 */
export function looksLastFirst(raw: string): boolean {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || lines.some((l) => l.includes('\t'))) return false;

  const pairs = lines
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, ''))
    .filter((l) => /^[^,]+,\s*[^,]+$/.test(l))
    .map((l) => l.split(',')[1].trim());
  if (pairs.length / lines.length <= 0.6) return false;

  const distinct = new Set(pairs.map((p) => p.toLowerCase())).size;
  const singleWord = pairs.filter((p) => !p.includes(' ')).length;
  return distinct / pairs.length > 0.8 && singleWord / pairs.length > 0.8;
}

// ─── Upload with progress ────────────────────────────────────────────────────
/**
 * POST JSON to an edge function and report how much of the body has gone out.
 *
 * `functions.invoke` uses fetch, which cannot report request progress, and a guest uploading a
 * COI over a phone connection deserves better than a spinner. The payload is base64 (a third
 * larger than the file), so the wait is real and worth drawing.
 */
export function portalFnPost<T>(
  fn: string,
  body: unknown,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/functions/v1/${fn}`, true);
    Object.entries(portalFnHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });
    xhr.onload = () => {
      let parsed: unknown = null;
      try { parsed = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as T);
      else reject(new Error((parsed as { error?: string })?.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out.'));
    xhr.send(JSON.stringify(body));
  });
}

/**
 * Food requests, as pure logic: demand, set-aside, late notice and the state machine.
 *
 * No store and no Supabase import, so every rule here is unit-tested in isolation. The database
 * is the authority on transitions and lateness (it computes and stores both); these mirrors exist
 * so the screens can show the right thing before a round trip, and so the kitchen's demand math
 * can be tested without a database.
 */
import type {
  FoodRequest, FoodRequestLine, FoodRequestStatus, FoodRequestDraft, FoodProgram,
} from './foodRequestTypes';
import { pluralizeUnit } from './commissaryUnits';

// ─── State machine ──────────────────────────────────────────────────────────────

/** Mirrors food_request_lock_internal. Anything not listed raises in the database. */
export const FOOD_TRANSITIONS: Record<FoodRequestStatus, FoodRequestStatus[]> = {
  submitted: ['approved', 'declined', 'cancelled'],
  approved: ['ready', 'cancelled', 'missed'],
  ready: ['picked_up', 'missed'],
  declined: [],
  picked_up: [],
  missed: [],
  cancelled: [],
};

export function canTransition(from: FoodRequestStatus, to: FoodRequestStatus): boolean {
  return FOOD_TRANSITIONS[from].includes(to);
}

export const FOOD_STATUS_LABELS: Record<FoodRequestStatus, string> = {
  submitted: 'Waiting for the kitchen',
  approved: 'Approved',
  declined: 'Declined',
  ready: 'Ready to pick up',
  picked_up: 'Picked up',
  missed: 'Not picked up',
  cancelled: 'Cancelled',
};

/** Short labels for chips and filters. */
export const FOOD_STATUS_SHORT: Record<FoodRequestStatus, string> = {
  submitted: 'New',
  approved: 'Approved',
  declined: 'Declined',
  ready: 'Ready',
  picked_up: 'Picked up',
  missed: 'Missed',
  cancelled: 'Cancelled',
};

// ─── Demand ─────────────────────────────────────────────────────────────────────

/**
 * Statuses whose food is still to come off the shelf. `picked_up` is NOT here: marking a pickup
 * writes a 'used' adjustment to stock (mark_food_request_picked_up), so the book already holds it.
 * It used to count here instead, and the counted on-hand never went down. `submitted` is not demand
 * yet (it shows as pending), and missed/declined/cancelled food never left.
 */
export const DEMAND_STATUSES: ReadonlySet<FoodRequestStatus> = new Set(['approved', 'ready']);

/** Base-unit quantity a line draws, or null when it is not linked to an item. */
export function lineDemandBase(line: FoodRequestLine): number | null {
  if (!line.itemId) return null;
  if (line.lineState === 'unavailable') return 0;
  return line.qtyApprovedBase ?? line.qtyRequestedBase ?? null;
}

function linesByRequest(lines: FoodRequestLine[]): Map<string, FoodRequestLine[]> {
  const map = new Map<string, FoodRequestLine[]>();
  for (const l of lines) {
    const arr = map.get(l.requestId);
    if (arr) arr.push(l); else map.set(l.requestId, [l]);
  }
  return map;
}

/** Per-item, per-pickup-date demand (base units) from approved and ready requests. */
export function requestDemandByItemDate(
  requests: FoodRequest[],
  lines: FoodRequestLine[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const byReq = linesByRequest(lines);
  for (const r of requests) {
    if (!DEMAND_STATUSES.has(r.status)) continue;
    for (const l of byReq.get(r.id) ?? []) {
      const base = lineDemandBase(l);
      if (!l.itemId || !base) continue;
      let byDate = out.get(l.itemId);
      if (!byDate) { byDate = new Map(); out.set(l.itemId, byDate); }
      byDate.set(r.pickupDate, (byDate.get(r.pickupDate) ?? 0) + base);
    }
  }
  return out;
}

/** Adds one item→date→base map into another, in place. */
export function mergeDemandInto(target: Map<string, Map<string, number>>, extra: Map<string, Map<string, number>>) {
  for (const [itemId, byDate] of extra) {
    let t = target.get(itemId);
    if (!t) { t = new Map(); target.set(itemId, t); }
    for (const [d, base] of byDate) t.set(d, (t.get(d) ?? 0) + base);
  }
}

export interface RequestDemandEntry {
  requestId: string;
  /** The program's name, or the requester's when there is no program. */
  who: string;
  pickupDate: string;
  pickupTime: string;
  status: FoodRequestStatus;
  base: number;
}

export interface RequestDemandSummary {
  totalBase: number;
  entries: RequestDemandEntry[];
}

function summarize(
  requests: FoodRequest[],
  lines: FoodRequestLine[],
  programs: Pick<FoodProgram, 'id' | 'name'>[],
  include: (r: FoodRequest) => boolean,
  baseOf: (l: FoodRequestLine) => number | null,
): Map<string, RequestDemandSummary> {
  const names = new Map(programs.map((p) => [p.id, p.name]));
  const byReq = linesByRequest(lines);
  const out = new Map<string, RequestDemandSummary>();
  const sorted = [...requests].sort((a, b) => (a.pickupDate + a.pickupTime).localeCompare(b.pickupDate + b.pickupTime));
  for (const r of sorted) {
    if (!include(r)) continue;
    for (const l of byReq.get(r.id) ?? []) {
      const base = baseOf(l);
      if (!l.itemId || !base) continue;
      let s = out.get(l.itemId);
      if (!s) { s = { totalBase: 0, entries: [] }; out.set(l.itemId, s); }
      s.totalBase += base;
      s.entries.push({
        requestId: r.id, who: (r.programId && names.get(r.programId)) || r.requesterName,
        pickupDate: r.pickupDate, pickupTime: r.pickupTime, status: r.status, base,
      });
    }
  }
  return out;
}

/** What is set aside on the shelf: approved or ready requests picked up today or later. */
export function setAsideByItem(
  requests: FoodRequest[],
  lines: FoodRequestLine[],
  today: string,
  programs: Pick<FoodProgram, 'id' | 'name'>[] = [],
): Map<string, RequestDemandSummary> {
  return summarize(requests, lines, programs,
    (r) => (r.status === 'approved' || r.status === 'ready') && r.pickupDate >= today,
    lineDemandBase);
}

/**
 * What each item has promised away, for the shelf picture: the total from today on, the part due
 * today (still physically on the shelf), and the last pickup day.
 */
export function promisesByItem(setAside: Map<string, RequestDemandSummary>, today: string):
  Map<string, { totalBase: number; todayBase: number; lastDate: string | null }> {
  const out = new Map<string, { totalBase: number; todayBase: number; lastDate: string | null }>();
  for (const [itemId, s] of setAside) {
    let todayBase = 0;
    let lastDate: string | null = null;
    for (const e of s.entries) {
      if (e.pickupDate === today) todayBase += e.base;
      if (!lastDate || e.pickupDate > lastDate) lastDate = e.pickupDate;
    }
    out.set(itemId, { totalBase: s.totalBase, todayBase, lastDate });
  }
  return out;
}

/** Requests still waiting for a decision, by item: not demand yet, shown so nobody is surprised. */
export function pendingByItem(
  requests: FoodRequest[],
  lines: FoodRequestLine[],
  fromDate: string,
  toDate: string,
  programs: Pick<FoodProgram, 'id' | 'name'>[] = [],
): Map<string, RequestDemandSummary> {
  return summarize(requests, lines, programs,
    (r) => r.status === 'submitted' && r.pickupDate >= fromDate && r.pickupDate <= toDate,
    (l) => (l.itemId ? l.qtyRequestedBase : null));
}

/**
 * Request demand inside an ordering window, by item. The window matches orderMath's "used by":
 * after today, through the window end. Today's pickups are already inside "on hand now".
 */
export function requestDemandInWindow(
  requests: FoodRequest[],
  lines: FoodRequestLine[],
  today: string,
  windowEnd: string,
  programs: Pick<FoodProgram, 'id' | 'name'>[] = [],
): Map<string, RequestDemandSummary> {
  return summarize(requests, lines, programs,
    (r) => DEMAND_STATUSES.has(r.status) && r.pickupDate > today && r.pickupDate <= windowEnd,
    lineDemandBase);
}

// ─── Time: camp-local wall clock → instant ─────────────────────────────────────

function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * A camp-local date and wall-clock time as a real instant, DST included — the same thing
 * `(date + time) at time zone camps.timezone` does in the database.
 */
export function zonedWallTimeToInstant(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':');
  const wall = Date.UTC(y, m - 1, d, Number(hh), Number(mm), Math.floor(Number(ss ?? 0)));
  let guess = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(guess, timeZone);
  if (second !== guess) guess = second;
  return new Date(guess);
}

/** Real hours between `now` and a camp-local pickup. Negative once the pickup has passed. */
export function noticeHours(pickupDate: string, pickupTime: string, timeZone: string, now: Date): number {
  return (zonedWallTimeToInstant(pickupDate, pickupTime, timeZone).getTime() - now.getTime()) / 3_600_000;
}

/** Exactly at the cutoff is on time; any less is late. Late is flagged, never blocked. */
export function isLate(hours: number, cutoffHours: number): boolean {
  return hours < cutoffHours;
}

/** Today's date in a time zone, YYYY-MM-DD. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)) {
    p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * When the pickup reminder goes out, mirroring the SQL rule: mail only sends 08:00–19:59 camp
 * time, so a pickup before 10:00 is reminded at 18:00 the evening before, the rest at 08:00 on
 * the day.
 */
export function pickupReminderAt(pickupTime: string): { dayOffset: -1 | 0; time: '18:00' | '08:00' } {
  return pickupTime < '10:00' ? { dayOffset: -1, time: '18:00' } : { dayOffset: 0, time: '08:00' };
}

// ─── Formatting ────────────────────────────────────────────────────────────────

/** "2pm", "2:30pm", "7am" from HH:MM[:SS]. */
export function formatClock(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** "Thu Jul 18" from a camp-local YYYY-MM-DD, never shifted by a time zone. */
export function formatDay(dateStr: string, opts: { weekday?: boolean } = { weekday: true }): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: opts.weekday === false ? undefined : 'short', month: 'short', day: 'numeric' });
}

/** "Thu Jul 18, 2pm" */
export function formatPickup(dateStr: string, timeStr: string): string {
  return `${formatDay(dateStr)}, ${formatClock(timeStr)}`;
}

/**
 * The kitchen's rule, written one way everywhere: "3 days’ notice (72 h)", "36 hours’ notice".
 * Mirrors food_request_notice_rule() in the database, which writes the emails.
 */
export function formatNoticeRule(hours: number): string {
  const h = Math.round(hours * 100) / 100;
  if (h >= 24 && h % 24 === 0) return `${h / 24} day${h === 24 ? '’s' : 's’'} notice (${h} h)`;
  return `${h} hour${h === 1 ? '’s' : 's’'} notice`;
}

/** "Short notice · 44h", the chip the kitchen sees. */
export function shortNoticeLabel(noticeHours: number): string {
  return `Short notice · ${Math.max(0, Math.round(noticeHours))}h`;
}

/** "26 hours" under two days, "3 days" beyond. Always of real notice. */
export function formatNotice(hours: number): string {
  if (hours < 0) return 'already past';
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${Math.floor(hours)} hour${Math.floor(hours) === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/** Trims float noise for display: 1.5, 3, 0.25. */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(Math.round(n * 1000) / 1000);
}

/** "5 lb", "2 boxes", "1 box". A unit the requester typed already plural ("bags") is left alone. */
export function formatLineQty(qty: number | null, unit: string | null): string {
  const q = formatNumber(qty);
  if (!unit) return q;
  const n = Number(q);
  const u = n !== 1 && /s$/i.test(unit.trim()) ? unit : pluralizeUnit(unit, n);
  return `${q} ${u}`;
}

/** "2 bags of mini chocolate chips": what the requester asked for, in their own words and unit. */
export function askedSummary(line: Pick<FoodRequestLine, 'label' | 'qtyRequested' | 'unitLabel'>): string {
  return line.unitLabel ? `${formatLineQty(line.qtyRequested, line.unitLabel)} of ${line.label}` : `${formatNumber(line.qtyRequested)} ${line.label}`;
}

/**
 * A line as the kitchen pulls it: the kitchen's item name and quantity first, and the requester's
 * words only when they differ ("asked: 2 bags of mini chocolate chips").
 */
export function kitchenLineView(line: FoodRequestLine, itemName: string | undefined): {
  name: string; qty: string; asked: string | null; linked: boolean;
} {
  const unavailable = line.lineState === 'unavailable';
  const qty = unavailable ? 'not available'
    : formatLineQty(line.qtyApproved ?? line.qtyRequested, line.qtyApproved != null ? line.approvedUnitLabel : line.unitLabel);
  const name = line.itemId && itemName ? itemName : line.label;
  const differs = !!line.itemId && !!itemName && (itemName !== line.label
    || (line.qtyApproved != null && (line.qtyApproved !== line.qtyRequested || (line.approvedUnitLabel ?? '') !== (line.unitLabel ?? ''))));
  return { name, qty, asked: differs ? askedSummary(line) : null, linked: !!line.itemId };
}

/** What the kitchen changed on one line, in the requester's words. Null when nothing changed. */
export function lineChangeSummary(line: FoodRequestLine): string | null {
  if (line.lineState === 'unavailable') return 'not available';
  if (line.lineState !== 'changed') return null;
  return `asked ${formatLineQty(line.qtyRequested, line.unitLabel)}, approved ${formatLineQty(line.qtyApproved, line.approvedUnitLabel)}`;
}

// ─── Kitchen lists ─────────────────────────────────────────────────────────────

/** The inbox: waiting for a decision, late ones on top, then soonest pickup first. */
export function inboxOrder(requests: FoodRequest[]): FoodRequest[] {
  return requests
    .filter((r) => r.status === 'submitted')
    .sort((a, b) => Number(b.isLate) - Number(a.isLate)
      || (a.pickupDate + a.pickupTime).localeCompare(b.pickupDate + b.pickupTime));
}

/** The Requests tab's views, as a link can name them: ?view=inbox|pickups|history. */
export type RequestsView = 'inbox' | 'pickups' | 'history';
export const REQUESTS_VIEWS: RequestsView[] = ['inbox', 'pickups', 'history'];

export interface PickupDay {
  /** YYYY-MM-DD, or 'past_due' for approved/ready requests whose day has gone. */
  key: string;
  label: string;
  requests: FoodRequest[];
}

/**
 * Pickups the kitchen still has to hand over, grouped by day with Today first. Anything approved
 * or ready from an earlier day sits in its own "Past due" group above, because that is the one
 * that needs a Picked up or Missed tap.
 */
export function pickupDays(requests: FoodRequest[], today: string, tomorrow: string): PickupDay[] {
  const open = requests
    .filter((r) => r.status === 'approved' || r.status === 'ready')
    .sort((a, b) => (a.pickupDate + a.pickupTime).localeCompare(b.pickupDate + b.pickupTime));
  const past = open.filter((r) => r.pickupDate < today);
  const byDay = new Map<string, FoodRequest[]>();
  for (const r of open) {
    if (r.pickupDate < today) continue;
    const arr = byDay.get(r.pickupDate);
    if (arr) arr.push(r); else byDay.set(r.pickupDate, [r]);
  }
  const days: PickupDay[] = [];
  if (past.length) days.push({ key: 'past_due', label: 'Past due', requests: past });
  if (!byDay.has(today)) days.push({ key: today, label: 'Today', requests: [] });
  for (const [d, rs] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    days.push({ key: d, label: d === today ? 'Today' : d === tomorrow ? `Tomorrow · ${formatDay(d)}` : formatDay(d), requests: rs });
  }
  // Today always leads the day groups, even when empty, so "nothing today" is an answer.
  return days.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
  function rank(d: PickupDay) { return d.key === 'past_due' ? 0 : d.key === today ? 1 : 2; }
}

/** A pickup is past due once its time has passed and it has not been handed over. */
export function isPastDue(r: FoodRequest, now: Date, timeZone: string): boolean {
  if (r.status !== 'approved' && r.status !== 'ready') return false;
  return noticeHours(r.pickupDate, r.pickupTime, timeZone, now) < 0;
}

/** Hours since an approved/ready pickup's time passed, or null while it is not late. */
export function hoursOverdue(r: FoodRequest, now: Date, timeZone: string): number | null {
  if (!isPastDue(r, now, timeZone)) return null;
  return -noticeHours(r.pickupDate, r.pickupTime, timeZone, now);
}

/** "Not picked up yet · 2h late", "… · 25 min late", "… · 2 days late". */
export function overdueLabel(hours: number): string {
  const late = hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)} days`;
  return `Not picked up yet · ${late} late`;
}

/** Handing over before the pickup day is usually a mis-tap on the wrong card, so it is confirmed. */
export function isBeforePickupDay(r: Pick<FoodRequest, 'pickupDate'>, today: string): boolean {
  return r.pickupDate > today;
}

// ─── The request form ──────────────────────────────────────────────────────────

export type DraftField = 'lines' | 'pickup' | 'name' | 'email' | `qty-${number}`;

export interface DraftCheck {
  /** In the order the fields appear on the form, so the first one is the one to scroll to. */
  errors: string[];
  fieldErrors: { field: DraftField; message: string }[];
  /** Real hours of notice, or null until a day and time are both chosen. */
  hours: number | null;
  late: boolean;
}

/** Validates a draft the way the RPC will, and works out the late notice to show before submit. */
export function checkDraft(draft: FoodRequestDraft, opts: { timeZone: string; cutoffHours: number; now: Date; requireContact: boolean }): DraftCheck {
  const fieldErrors: { field: DraftField; message: string }[] = [];
  // Form order: what you need, pickup, then who is asking.
  const filled = draft.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.label.trim() || l.itemId);
  if (filled.length === 0) fieldErrors.push({ field: 'lines', message: 'Add at least one thing you need.' });
  for (const { l, i } of filled) {
    const q = Number(l.qty);
    if (!l.qty.trim() || !Number.isFinite(q) || q <= 0) {
      fieldErrors.push({ field: `qty-${i}`, message: `Add how much${l.itemId && l.unitLabel ? ` (in ${pluralizeUnit(l.unitLabel, 2)})` : ' (e.g. 3 boxes)'}.` });
    }
  }
  let hours: number | null = null;
  if (!draft.pickupDate || !draft.pickupTime) {
    fieldErrors.push({ field: 'pickup', message: !draft.pickupDate && !draft.pickupTime ? 'Pick a pickup day and time.' : !draft.pickupDate ? 'Pick a pickup day.' : 'Pick a pickup time.' });
  } else {
    hours = noticeHours(draft.pickupDate, draft.pickupTime, opts.timeZone, opts.now);
    if (hours <= 0) fieldErrors.push({ field: 'pickup', message: 'That pickup time has already passed.' });
  }
  if (opts.requireContact) {
    if (!draft.requesterName.trim()) fieldErrors.push({ field: 'name', message: 'Add your name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.requesterEmail.trim())) {
      fieldErrors.push({ field: 'email', message: draft.requesterEmail.trim() ? 'That email address doesn’t look right.' : 'Add an email address so the kitchen can reply.' });
    }
  }
  return {
    errors: fieldErrors.map((e) => e.message),
    fieldErrors,
    hours,
    late: hours != null && hours > 0 && isLate(hours, opts.cutoffHours),
  };
}

/**
 * An amount already written into the item text: "3 boxes graham crackers", "graham crackers, like
 * 3 boxes", "marshmallows x2". Returns the amount and what is left of the words, or null.
 */
export function parseAmount(text: string): { qty: string; unit: string; rest: string } | null {
  const s = text.trim();
  const unitWord = '([a-z][a-z.]*(?: of \\d+)?)';
  const patterns: RegExp[] = [
    // trailing: "graham crackers, like 3 boxes" / "graham crackers - about 3 boxes" / "eggs 2 dozen"
    new RegExp(`^(.*?)[,;:\\-–(\\s]+(?:like|about|around|approx\\.?|maybe|~)?\\s*(\\d+(?:\\.\\d+)?)\\s*${unitWord}?\\)?\\s*$`, 'i'),
    // leading: "3 boxes of graham crackers" / "3 boxes graham crackers" / "3 graham crackers"
    new RegExp(`^(?:like|about|around|~)?\\s*(\\d+(?:\\.\\d+)?)\\s+${unitWord}?(?:\\s+of)?\\s+(.+)$`, 'i'),
    // "marshmallows x2"
    /^(.*?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i,
  ];
  let m = patterns[0].exec(s);
  if (m && m[1].trim()) return { rest: m[1].trim(), qty: m[2], unit: (m[3] ?? '').trim() };
  m = patterns[2].exec(s);
  if (m && m[1].trim()) return { rest: m[1].trim(), qty: m[2], unit: '' };
  m = patterns[1].exec(s);
  if (m && m[3]?.trim()) {
    // "3 graham crackers": with no "of", a single word after the number may be the item, not a unit.
    const unit = (m[2] ?? '').trim();
    if (unit && !/\bof\b/i.test(s.slice(m[1].length + 1 + unit.length, s.length - m[3].length)) && !KNOWN_UNITS.test(unit)) {
      return { qty: m[1], unit: '', rest: `${unit} ${m[3]}`.trim() };
    }
    return { qty: m[1], unit, rest: m[3].trim() };
  }
  return null;
}

const KNOWN_UNITS = /^(bags?|boxe?s|box|cans?|cases?(?: of \d+)?|dozens?|doz|lbs?|pounds?|oz|ounces?|kg|g|grams?|gal(?:lon)?s?|quarts?|qts?|pints?|jars?|bottles?|packs?|packages?|pkgs?|loaf|loaves|bunch(?:es)?|heads?|each|ea|cups?|tins?|tubs?|cartons?|bars?|sticks?|pieces?|pcs?|trays?|rolls?|sleeves?)$/i;

/** The draft as the RPC payload. Empty lines are dropped. */
export function draftToPayload(draft: FoodRequestDraft): Record<string, unknown> {
  return {
    program_id: draft.programId || null,
    requester_name: draft.requesterName.trim(),
    requester_email: draft.requesterEmail.trim(),
    requester_phone: draft.requesterPhone.trim() || null,
    notify_by: draft.notifyBy,
    pickup_date: draft.pickupDate,
    pickup_time: draft.pickupTime,
    purpose: draft.purpose.trim() || null,
    headcount: draft.headcount.trim() ? Number(draft.headcount) : null,
    lines: draft.lines
      .filter((l) => l.label.trim() || l.itemId)
      .map((l) => (l.itemId
        ? { item_id: l.itemId, qty: Number(l.qty), note: l.note?.trim() || null }
        : { label: l.label.trim(), qty: Number(l.qty), unit_label: l.unitLabel.trim() || null, note: l.note?.trim() || null })),
  };
}

/** Typeahead over the kitchen's items: prefix matches first, then word-starts, then anywhere. */
export function matchItems<T extends { name: string }>(items: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/[\s,/-]+/).some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    if (score >= 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name)).slice(0, limit).map((s) => s.item);
}

// ─── The printable pull list ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One page per day: what to pull from the shelves, per request, with a tick box each. */
export function pullListHtml(opts: {
  campName: string;
  dayLabel: string;
  requests: FoodRequest[];
  lines: FoodRequestLine[];
  programs: Pick<FoodProgram, 'id' | 'name'>[];
  pickupLocation: string | null;
  /** Kitchen item names by id: the shelf is pulled by the kitchen's name, not the counselor's words. */
  itemNames?: Map<string, string>;
}): string {
  const names = new Map(opts.programs.map((p) => [p.id, p.name]));
  const byReq = linesByRequest(opts.lines);
  const blocks = opts.requests.map((r) => {
    const rows = (byReq.get(r.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((l) => {
      const unavailable = l.lineState === 'unavailable';
      const v = kitchenLineView(l, l.itemId ? opts.itemNames?.get(l.itemId) : undefined);
      const extra = [v.asked ? `asked: ${v.asked}` : '', !v.linked ? 'not on the kitchen list' : '', l.note ?? ''].filter(Boolean).join(' · ');
      return `<tr${unavailable ? ' class="na"' : ''}><td class="box">${unavailable ? '' : '&#9744;'}</td><td>${unavailable ? `<s>${esc(v.name)}</s>` : esc(v.name)}${extra ? `<div class="note">${esc(extra)}</div>` : ''}</td><td class="qty">${esc(v.qty)}</td></tr>`;
    }).join('');
    const who = (r.programId && names.get(r.programId)) || r.requesterName;
    return `<section><h2>${esc(formatClock(r.pickupTime))} · ${esc(who)}</h2>
      <p class="meta">${esc(r.requesterName)}${r.headcount ? ` · ${r.headcount} people` : ''}${r.purpose ? ` · ${esc(r.purpose)}` : ''} · ${r.status === 'ready' ? 'Ready' : 'Approved'}</p>
      ${r.kitchenNote ? `<p class="meta">Kitchen note: ${esc(r.kitchenNote)}</p>` : ''}
      <table>${rows}</table></section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pull list · ${esc(opts.dayLabel)}</title>
  <style>
    /* An unavailable line strikes the item's name only: text-decoration is inherited and cannot be
       removed by a child, so striking the row also struck "not available", the one word to read. */
    body{font-family:-apple-system,Segoe UI,sans-serif;color:#23201B;margin:32px;font-size:13px}
    h1{font-size:20px;margin:0 0 2px} .sub{color:#6B6357;margin:0 0 20px}
    section{break-inside:avoid;border-top:1px solid #DED3BB;padding:12px 0}
    h2{font-size:15px;margin:0 0 2px} .meta{color:#6B6357;margin:2px 0}
    table{width:100%;border-collapse:collapse;margin-top:6px} td{padding:4px 6px;border-bottom:1px dotted #DED3BB;vertical-align:top}
    td.box{width:20px;font-size:16px} td.qty{text-align:right;white-space:nowrap;font-family:ui-monospace,monospace}
    tr.na td{color:#9AA98F} .note{color:#6B6357;font-size:11px}
  </style></head><body>
  <h1>Pull list · ${esc(opts.dayLabel)}</h1>
  <p class="sub">${esc(opts.campName)}${opts.pickupLocation ? ` · pickup at ${esc(opts.pickupLocation)}` : ''} · ${opts.requests.length} request${opts.requests.length === 1 ? '' : 's'}</p>
  ${blocks || '<p>No pickups this day.</p>'}
  </body></html>`;
}

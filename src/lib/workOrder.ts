/**
 * Shared vocabulary for the Campground module.
 *
 * The module is called Campground in the product and `issues` in the database, and that is
 * deliberate: the label and the route were renamed, the table was not. Renaming a table thirteen
 * surfaces and an iOS app read from is pure risk for zero user-visible gain, so everything here
 * translates between the two.
 *
 * Everything a work order needs that is not storage lives here — defaults, labels, colours, the
 * ordering rules and the small predicates the list and the cards keep re-deriving.
 */
import { generateId } from './utils';
import type {
  Issue, IssueStatus, Priority, Trade, IssueSource, ActivityEntry, WorkSchedule, Cadence,
} from './types';
import { TRADE_LABELS } from './types';

// ─── The queue's vocabulary ───────────────────────────────────────────────────

/**
 * Two of these are new, and they exist because "waiting on the septic guy since June" used to
 * render as `in_progress`, which is how a queue stops meaning anything. Both are open but
 * explicitly not being worked — which is the honest state of roughly a third of a camp's list.
 */
export const STATUS_LABELS: Record<IssueStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  waiting_on_vendor: 'Waiting on vendor',
  waiting_on_part: 'Waiting on a part',
  resolved: 'Done',
};

/** Everything that is not `resolved`. Named, because "open" is asked for on every surface. */
export const OPEN_STATUSES: IssueStatus[] = [
  'unassigned', 'assigned', 'in_progress', 'waiting_on_vendor', 'waiting_on_part',
];

export const isOpen = (i: Issue) => i.status !== 'resolved';

/** Open, but nobody is actually working it. The two states worth surfacing separately. */
export const isStalled = (i: Issue) =>
  i.status === 'waiting_on_vendor' || i.status === 'waiting_on_part';

export const SOURCE_LABELS: Record<NonNullable<IssueSource>, string> = {
  web: 'Logged in the app',
  ios: 'Logged on a phone',
  public: 'Public report',
  qr: 'Scanned a sticker',
  routine: 'Routine',
  retreat: 'Rental group',
  session: 'Session turnover',
  module: 'Flagged by another module',
};

// ─── Colour ───────────────────────────────────────────────────────────────────

/**
 * Trade is carried by a left stripe and a small pill — never by a fill.
 *
 * Red and amber already belong to priority and overdue. Two colour systems competing for the
 * same card is how a board becomes unreadable, so trade takes the quiet half of the palette and
 * priority keeps the loud half.
 */
export const TRADE_STRIPE: Record<Trade, string> = {
  maintenance: 'border-l-forest',
  housekeeping: 'border-l-blue',
  grounds: 'border-l-sage',
  kitchen: 'border-l-amber',
  it: 'border-l-purple',
};

export const TRADE_PILL: Record<Trade, string> = {
  maintenance: 'bg-green-muted-bg text-green-muted-text',
  housekeeping: 'bg-blue-bg text-blue-text',
  grounds: 'bg-sage-pale text-forest',
  kitchen: 'bg-amber-bg text-amber-text',
  it: 'bg-purple-bg text-purple-text',
};

export const tradeLabel = (t: Trade) => TRADE_LABELS[t] ?? t;

/**
 * A camp-invented trade has no colour of its own, so it gets one from the quiet half of the
 * palette, chosen by its key. Stable across reloads, and never red or amber — those belong to
 * priority and overdue.
 */
const SPARE_STRIPES = ['border-l-forest', 'border-l-blue', 'border-l-sage', 'border-l-purple'];
const SPARE_PILLS = [
  'bg-green-muted-bg text-green-muted-text',
  'bg-blue-bg text-blue-text',
  'bg-sage-pale text-forest',
  'bg-purple-bg text-purple-text',
];

function spareIndex(key: string, len: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % len;
}

export const tradeStripe = (t: Trade) =>
  TRADE_STRIPE[t] ?? SPARE_STRIPES[spareIndex(t, SPARE_STRIPES.length)];

export const tradePill = (t: Trade) =>
  TRADE_PILL[t] ?? SPARE_PILLS[spareIndex(t, SPARE_PILLS.length)];

// ─── Making one ───────────────────────────────────────────────────────────────

export interface NewWorkOrderInput {
  title: string;
  description?: string;
  locationIds?: string[];
  locations?: string[];
  priority?: Priority;
  status?: IssueStatus;
  trade?: Trade;
  assigneeId?: string | null;
  /** The crew it waits with. Still counts as unassigned -- nobody has taken it. */
  assigneeGroupId?: string | null;
  reportedById?: string | null;
  assetId?: string | null;
  vendorId?: string | null;
  dueDate?: string | null;
  /** Camp-local clock time it is due, or null for any time that day. */
  dueTime?: string | null;
  photoUrl?: string | null;
  source?: IssueSource;
  activityLog?: ActivityEntry[];
}

/**
 * Build a work order with every field the type requires.
 *
 * Exists because ten call sites were each constructing an `Issue` literal by hand, so every new
 * column meant ten edits and any one of them being forgotten was a runtime hole rather than a
 * compile error. The deprecated estimate fields are set to null here and nowhere else.
 */
export function newWorkOrder(input: NewWorkOrderInput): Issue {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: input.title,
    description: input.description ?? '',
    locationIds: input.locationIds ?? [],
    locations: input.locations ?? [],
    priority: input.priority ?? 'normal',
    status: input.status ?? (input.assigneeId ? 'assigned' : 'unassigned'),
    assigneeId: input.assigneeId ?? null,
    assigneeGroupId: input.assigneeGroupId ?? null,
    reportedById: input.reportedById ?? null,
    // Deprecated 2026-09-02: an estimate typed under time pressure is fiction, and it cost two
    // fields on the fastest-moving form in the product.
    estimatedCostDisplay: null,
    estimatedCostValue: null,
    actualCost: null,
    photoUrl: input.photoUrl ?? null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    isRecurring: false,
    recurringInterval: null,
    isPublicReport: false,
    reporterName: null,
    reporterContact: null,
    source: input.source ?? 'web',
    trade: input.trade ?? 'maintenance',
    assetId: input.assetId ?? null,
    vendorId: input.vendorId ?? null,
    scheduleId: null,
    retreatSpaceRequestId: null,
    retreatId: null,
    minutesSpent: null,
    // Stamped by a database trigger. A client clock is the wrong source for a number the season
    // review reports as fact.
    assignedAt: null,
    resolvedAt: null,
    reporterToken: null,
    createdAt: now,
    updatedAt: now,
    activityLog: input.activityLog ?? [],
  };
}

/** The campground fields, for spreading into a hand-built literal (seed data, fixtures). */
export const WORK_ORDER_DEFAULTS = {
  trade: 'maintenance' as Trade,
  assetId: null,
  vendorId: null,
  scheduleId: null,
  retreatSpaceRequestId: null,
  retreatId: null,
  minutesSpent: null,
  assignedAt: null,
  resolvedAt: null,
  reporterToken: null,
};

// ─── Ordering and grouping ────────────────────────────────────────────────────

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
const STATUS_RANK: Record<IssueStatus, number> = {
  unassigned: 0, assigned: 1, in_progress: 2,
  waiting_on_vendor: 3, waiting_on_part: 4, resolved: 5,
};

/** Overdue first, then priority, then how long it has been sitting. */
export function compareWorkOrders(a: Issue, b: Issue, today: string): number {
  const aLate = a.dueDate && a.dueDate < today && isOpen(a) ? 0 : 1;
  const bLate = b.dueDate && b.dueDate < today && isOpen(b) ? 0 : 1;
  if (aLate !== bLate) return aLate - bLate;
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  }
  return a.createdAt < b.createdAt ? -1 : 1;
}

export const isOverdue = (i: Issue, today: string) =>
  Boolean(i.dueDate && i.dueDate < today && isOpen(i));

// ─── Routines ─────────────────────────────────────────────────────────────────

/**
 * How a routine reads in one line: "Every 2 weeks on Mon, Thu".
 *
 * Written out rather than shown as fields, because a camp setting one up needs to be able to
 * check at a glance that it means what they intended.
 */
export function describeCadence(s: Pick<WorkSchedule,
  'cadence' | 'intervalCount' | 'byWeekday' | 'byMonthday' | 'anchorDate'
  | 'daysRelativeToOpening' | 'meterInterval' | 'meterKind'>): string {
  const n = Math.max(1, s.intervalCount || 1);
  const every = (unit: string) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  switch (s.cadence) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekly': {
      const days = (s.byWeekday ?? []).map((d) => DAYS[d]).filter(Boolean);
      return `${every('week')}${days.length ? ` on ${days.join(', ')}` : ''}`;
    }
    case 'monthly':
      return `${every('month')}${s.byMonthday ? ` on the ${ordinal(s.byMonthday)}` : ''}`;
    case 'annually':
      return every('year');
    case 'season_relative': {
      const d = s.daysRelativeToOpening ?? 0;
      if (d === 0) return 'On opening day';
      return d < 0 ? `${Math.abs(d)} days before opening` : `${d} days after opening`;
    }
    case 'on_turnover':
      return 'Every turnover';
    case 'meter':
      return s.meterInterval
        ? `Every ${s.meterInterval} ${s.meterKind === 'odometer' ? 'miles' : 'hours'}`
        : 'By meter';
    default:
      return '';
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * How far behind a routine is, in the camp's words.
 *
 * The counter exists because only ONE open occurrence is allowed per schedule: when last week's
 * is still open and this week's comes due, the open one is bumped and this goes up. Eleven
 * identical rows is how a recurring-task system earns a mute inside a month; one row that knows
 * it is behind is actionable.
 */
export function describeMissed(missedCount: number): string | null {
  if (missedCount <= 0) return null;
  if (missedCount === 1) return '1 cycle behind';
  return `${missedCount} cycles behind`;
}

export const CADENCES_NEEDING_ASSET: Cadence[] = ['meter'];

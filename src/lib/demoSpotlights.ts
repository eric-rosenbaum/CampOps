/**
 * The features a demo guide can point a prospect at.
 *
 * A demo brief (demo_briefs row) picks which ones appear, in what order, and may rewrite a
 * feature's short description. Everything else about a feature -- where it opens, the steps to
 * try it, and how the guide knows a step was done -- lives here, so a founder writing a brief
 * never has to know a route or a table name.
 *
 * Pure data: no store or Supabase imports, so it is unit-tested directly.
 */
import type { ModuleKey } from '@/lib/modules';

export type SpotlightKey =
  | 'food_requests'
  | 'town_trips'
  | 'receipts'
  | 'kitchen_ordering'
  | 'campground'
  | 'retreats';

/**
 * How the guide decides a step is done. `auto` checks read real rows this visitor created after
 * joining the demo, so the tick means they did it. Anything the data cannot show is a manual tick
 * kept in this browser only.
 */
export type StepCheck =
  | { kind: 'manual' }
  | { kind: 'auto'; id: AutoCheckId };

export type AutoCheckId =
  | 'food_request_from_link'
  | 'food_request_decided'
  | 'food_request_picked_up'
  | 'trip_seat_claimed'
  | 'trip_errand_added'
  | 'trip_planned'
  | 'receipt_saved'
  | 'statement_imported'
  | 'receipts_exported';

export interface SpotlightStep {
  /** Imperative, one line: what to do. */
  text: string;
  /** Optional second line: what to notice once you've done it. */
  notice?: string;
  /**
   * Where the step's Open button goes. `{placeholder}` tokens are filled from the guide's context
   * (e.g. `{foodLink}` becomes a program's public request link); a step whose placeholder cannot
   * be filled shows no button rather than opening a broken page.
   */
  href?: string;
  /** Open in a new tab -- used for the public, signed-out pages so the visitor keeps the guide. */
  newTab?: boolean;
  /** A sample file the step offers to download (the receipts statement CSV). */
  download?: 'sample_statement';
  check: StepCheck;
}

export interface SpotlightTemplate {
  key: SpotlightKey;
  title: string;
  /** A couple of sentences on how it works. A brief may override it. */
  summary: string;
  /** Where the feature's own Open button goes. */
  href: string;
  openLabel: string;
  /** Every module the feature needs. A feature whose modules are off is not shown. */
  modules: ModuleKey[];
  steps: SpotlightStep[];
}

export const SPOTLIGHTS: SpotlightTemplate[] = [
  {
    key: 'food_requests',
    title: 'Food requests from programs',
    summary:
      'Program leads ask the kitchen for what they need ahead of time, from their own link with no login. The kitchen approves or adjusts each request, the food is set aside and counted in the next order, and everyone gets a reminder on pickup day.',
    href: '/commissary?tab=requests',
    openLabel: 'Open food requests',
    modules: ['commissary'],
    steps: [
      {
        text: 'Be the counselor: open the Cooking Club’s request link and ask for food for a pickup in two days.',
        notice: 'It’s inside the 72-hour notice window, so it’s flagged as short notice — but not blocked.',
        href: '{foodLink}', newTab: true,
        check: { kind: 'auto', id: 'food_request_from_link' },
      },
      {
        text: 'Be the kitchen: open the request inbox and approve it. Change one quantity if you like.',
        notice: 'Your request arrived without anyone refreshing.',
        href: '/commissary?tab=requests',
        check: { kind: 'auto', id: 'food_request_decided' },
      },
      {
        text: 'Open Inventory: the approved food shows as promised to the program, and the next order already counts it.',
        href: '/commissary?tab=inventory',
        check: { kind: 'manual' },
      },
      {
        text: 'In Pickups, mark it ready, then picked up. The counselor’s status page changes and the food comes off the shelf.',
        href: '/commissary?tab=requests&view=pickups',
        check: { kind: 'auto', id: 'food_request_picked_up' },
      },
    ],
  },
  {
    key: 'town_trips',
    title: 'Town trips',
    summary:
      'Anyone heading into town posts the trip with its open seats and return time. Staff grab a seat or add what they need to one shared shopping list, and the board flags anyone who would be left without a ride back.',
    href: '/trips',
    openLabel: 'Open town trips',
    modules: ['trips'],
    steps: [
      {
        text: 'Open the week board. Notice the red warning: someone has a ride into town but none back.',
        href: '/trips',
        check: { kind: 'manual' },
      },
      {
        text: 'Grab a seat on a trip.',
        notice: 'When a trip is full, you go on the waitlist and move up automatically if someone leaves.',
        href: '/trips',
        check: { kind: 'auto', id: 'trip_seat_claimed' },
      },
      {
        text: 'Add something you need from town to the shopping list — no need to know who’s driving.',
        href: '/trips?tab=shopping',
        check: { kind: 'auto', id: 'trip_errand_added' },
      },
      {
        text: 'Plan your own trip and attach the open errands to it.',
        href: '/trips?plan=1',
        check: { kind: 'auto', id: 'trip_planned' },
      },
    ],
  },
  {
    key: 'receipts',
    title: 'Company card receipts',
    summary:
      'Card holders snap a receipt and confirm the vendor, date and taxes read from it. Each month is matched against the card statement, with GST/HST totals and a QuickBooks-ready export.',
    href: '/receipts',
    openLabel: 'Open receipts',
    modules: ['receipts'],
    steps: [
      {
        text: 'Snap or upload a receipt and confirm what was read — anything uncertain is highlighted.',
        href: '/receipts',
        check: { kind: 'auto', id: 'receipt_saved' },
      },
      {
        text: 'Open last month’s reconciliation and resolve the missing receipt and the duplicate.',
        notice: 'The header turns green when the month agrees with the Visa statement.',
        href: '{reconcileStatement}',
        check: { kind: 'manual' },
      },
      {
        text: 'Import a card statement yourself using the sample CSV, accept the suggested matches, then confirm the photographed receipts.',
        notice: 'The month turns green once every charge has a confirmed receipt or a reason.',
        href: '{reconcileImport}',
        download: 'sample_statement',
        check: { kind: 'auto', id: 'statement_imported' },
      },
      {
        text: 'Open the tax summary. Once a month agrees, export it for QuickBooks — or download it for review anytime.',
        href: '/receipts?tab=summary',
        check: { kind: 'auto', id: 'receipts_exported' },
      },
    ],
  },
  {
    key: 'kitchen_ordering',
    title: 'Kitchen ordering',
    summary:
      'Orders are built from the menu and what is on the shelf, rounded to real case sizes, with the math shown line by line.',
    href: '/commissary?tab=ordering',
    openLabel: 'Open ordering',
    modules: ['commissary'],
    steps: [
      { text: 'Open Ordering and expand “Show the math” on the next order.', href: '/commissary?tab=ordering', check: { kind: 'manual' } },
      { text: 'Open Inventory and sort by what runs out first.', href: '/commissary?tab=inventory', check: { kind: 'manual' } },
    ],
  },
  {
    key: 'campground',
    title: 'Campground work',
    summary:
      'Every maintenance request lands with the right crew, from a QR sticker or the app, and the person who asked can see when it is fixed.',
    href: '/campground',
    openLabel: 'Open the campground board',
    modules: ['issues'],
    steps: [
      { text: 'Open the Campground board and look at each crew’s lane.', href: '/campground', check: { kind: 'manual' } },
    ],
  },
  {
    key: 'retreats',
    title: 'Retreat rentals',
    summary:
      'Each visiting group gets a portal for rooming, headcount, documents and payments, and their requests become the crew’s work orders.',
    href: '/retreats',
    openLabel: 'Open retreats',
    modules: ['retreats'],
    steps: [
      { text: 'Open a retreat and look at its guest portal.', href: '/retreats', check: { kind: 'manual' } },
    ],
  },
];

export const SPOTLIGHT_BY_KEY: Record<SpotlightKey, SpotlightTemplate> =
  Object.fromEntries(SPOTLIGHTS.map((s) => [s.key, s])) as Record<SpotlightKey, SpotlightTemplate>;

/** Features that have sample data a founder can (re)seed into a demo camp. */
export const SEEDABLE: SpotlightKey[] = ['food_requests', 'town_trips', 'receipts'];

/** What a brief stores per feature. */
export interface BriefSpotlight {
  key: SpotlightKey;
  enabled: boolean;
  /** Optional rewrite of the template's summary. */
  summary?: string | null;
}

export interface DemoBrief {
  campId: string;
  prospectName: string | null;
  /** Optional heading; the guide uses the camp's name when blank. */
  headline: string | null;
  intro: string | null;
  spotlights: BriefSpotlight[];
  founderName: string | null;
  founderEmail: string | null;
}

/**
 * The features a visitor actually sees, in the brief's order: enabled in the brief, known to this
 * build, and every module they need switched on for the camp. Brief copy wins where written.
 */
export function resolveSpotlights(
  brief: Pick<DemoBrief, 'spotlights'> | null,
  moduleEnabled: (key: ModuleKey) => boolean,
): SpotlightTemplate[] {
  const out: SpotlightTemplate[] = [];
  const seen = new Set<string>();
  for (const e of brief?.spotlights ?? []) {
    if (!e.enabled || seen.has(e.key)) continue;
    const t = SPOTLIGHT_BY_KEY[e.key];
    if (!t || !t.modules.every(moduleEnabled)) continue;
    seen.add(e.key);
    out.push({ ...t, summary: e.summary?.trim() || t.summary });
  }
  return out;
}

/**
 * Fills `{placeholder}` tokens in a step link. Returns null when any token is missing, so the step
 * shows no button instead of a link to a page that cannot load.
 */
export function fillHref(href: string | undefined, ctx: Record<string, string | null | undefined>): string | null {
  if (!href) return null;
  let missing = false;
  const filled = href.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = ctx[k];
    if (!v) { missing = true; return ''; }
    return v;
  });
  return missing ? null : filled;
}

/** The brief a new demo starts with: the chosen features, default copy. */
export function defaultBriefSpotlights(keys: SpotlightKey[]): BriefSpotlight[] {
  return keys.map((key) => ({ key, enabled: true, summary: null }));
}

/**
 * The Demo Guide's building blocks: one spotlight per feature a prospect might be shown.
 *
 * A demo brief (demo_briefs row) picks which spotlights appear and can rewrite the two sentences
 * that matter — "what you told us" and "what we built" — in the prospect's own words. Everything
 * else about a spotlight (its steps, where each step opens, how the guide knows a step was done)
 * lives here, so a founder writing a brief never has to know a route or a table name.
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
 * How the guide decides a step is done. `auto` checks read real data created after the visitor
 * joined the demo, so the tick means they actually did it, not that they clicked a box. Anything
 * the data cannot show is a manual tick kept in this browser only.
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
   * Where the Open button goes. `{token}`-style placeholders are filled from the guide's context
   * (e.g. `{foodLink}` becomes a program's public request link); a step whose placeholder cannot
   * be filled hides its button rather than opening a broken page.
   */
  href?: string;
  /** Open in a new tab — used for the public, signed-out pages so the visitor keeps the guide. */
  newTab?: boolean;
  check: StepCheck;
}

export interface SpotlightTemplate {
  key: SpotlightKey;
  title: string;
  /** Default copy; a brief may override both. */
  youToldUs: string;
  whatWeBuilt: string;
  /** Every module the spotlight's steps open. A spotlight whose modules are off is not shown. */
  modules: ModuleKey[];
  steps: SpotlightStep[];
}

export const SPOTLIGHTS: SpotlightTemplate[] = [
  {
    key: 'food_requests',
    title: 'Food requests from programs',
    youToldUs:
      'Programs like cooking club come to the kitchen for food. People forget to pick it up, take food the kitchen was planning to cook with, and the kitchen doesn’t order enough.',
    whatWeBuilt:
      'Programs request food ahead of time from a link, no login needed. The kitchen approves it, the food is set aside and added to the next order, and everyone gets reminded on pickup day.',
    modules: ['commissary'],
    steps: [
      {
        text: 'Be the counselor: open the Cooking Club’s request link and ask for food for a pickup in two days.',
        notice: 'It’s inside the 72-hour notice window, so it’s flagged as late — but not blocked.',
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
        text: 'Open Inventory and Ordering to see the approved food set aside and counted in the next order.',
        href: '/commissary?tab=ordering',
        check: { kind: 'manual' },
      },
      {
        text: 'On pickup day, mark it ready, then picked up. Check the counselor’s status page change.',
        href: '/commissary?tab=requests',
        check: { kind: 'auto', id: 'food_request_picked_up' },
      },
    ],
  },
  {
    key: 'town_trips',
    title: 'Town trips',
    youToldUs:
      'Someone heads into town and everyone calls them with a list, so a one-hour trip takes three. Staff on days off get stranded without a ride back, and supplies get fetched at the last minute.',
    whatWeBuilt:
      'A shared board of every trip into town this week: open seats, who’s coming back, and one shopping list the driver checks off, so nobody has to call around.',
    modules: ['trips'],
    steps: [
      {
        text: 'Open the week board. Notice the red warning: someone has a ride to town but none back.',
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
        href: '/trips?tab=list',
        check: { kind: 'auto', id: 'trip_errand_added' },
      },
      {
        text: 'Plan your own trip and attach the open errands to it.',
        href: '/trips',
        check: { kind: 'auto', id: 'trip_planned' },
      },
    ],
  },
  {
    key: 'receipts',
    title: 'Company-card receipts',
    youToldUs:
      'Eight to ten people carry company cards. Receipts go into Concur with the taxes typed into comments, then everything gets matched to the Visa bill by hand in Excel before it goes into QuickBooks.',
    whatWeBuilt:
      'Snap a receipt and the vendor, date and taxes are read for you to confirm. Each month is matched to the card statement automatically, with GST/HST totals ready and a QuickBooks-ready export.',
    modules: ['receipts'],
    steps: [
      {
        text: 'Snap or upload a receipt. Confirm what was read — the uncertain fields are highlighted.',
        href: '/receipts?tab=snap',
        check: { kind: 'auto', id: 'receipt_saved' },
      },
      {
        text: 'Open last month’s reconciliation. Resolve the missing receipt and the duplicate.',
        notice: 'The header turns green when the month agrees with the Visa statement.',
        href: '/receipts/reconcile',
        check: { kind: 'manual' },
      },
      {
        text: 'Import a statement yourself using the sample CSV.',
        href: '/receipts/reconcile',
        check: { kind: 'auto', id: 'statement_imported' },
      },
      {
        text: 'Open the tax summary, then export the month for QuickBooks.',
        href: '/receipts?tab=export',
        check: { kind: 'auto', id: 'receipts_exported' },
      },
    ],
  },
  {
    key: 'kitchen_ordering',
    title: 'Kitchen ordering',
    youToldUs: 'The kitchen runs out of things, or orders too much and throws it away.',
    whatWeBuilt:
      'Orders come from the menu and what’s on the shelf, rounded to real case sizes, with the math shown line by line.',
    modules: ['commissary'],
    steps: [
      { text: 'Open Ordering and expand “Show the math” on the next order.', href: '/commissary?tab=ordering', check: { kind: 'manual' } },
      { text: 'Open Inventory and sort by what runs out first.', href: '/commissary?tab=inventory', check: { kind: 'manual' } },
    ],
  },
  {
    key: 'campground',
    title: 'Campground work',
    youToldUs: 'Maintenance requests get lost between texts, radios and whiteboards.',
    whatWeBuilt:
      'Every request lands with the right crew, from a QR sticker or the app, and the person who asked can see when it’s fixed.',
    modules: ['issues'],
    steps: [
      { text: 'Open the Campground board and look at each crew’s lane.', href: '/campground', check: { kind: 'manual' } },
    ],
  },
  {
    key: 'retreats',
    title: 'Retreat rentals',
    youToldUs: 'Off-season groups mean dozens of emails about rooms, headcounts, menus and invoices.',
    whatWeBuilt:
      'Each group gets a portal for rooming, headcount, documents and payments, and their requests turn into the crew’s work orders.',
    modules: ['retreats'],
    steps: [
      { text: 'Open a retreat and look at its guest portal.', href: '/retreats', check: { kind: 'manual' } },
    ],
  },
];

export const SPOTLIGHT_BY_KEY: Record<SpotlightKey, SpotlightTemplate> =
  Object.fromEntries(SPOTLIGHTS.map((s) => [s.key, s])) as Record<SpotlightKey, SpotlightTemplate>;

/** What a brief stores per spotlight. */
export interface BriefSpotlight {
  key: SpotlightKey;
  enabled: boolean;
  you_told_us?: string | null;
  what_we_built?: string | null;
}

export interface DemoBrief {
  campId: string;
  prospectName: string | null;
  headline: string | null;
  intro: string | null;
  spotlights: BriefSpotlight[];
  founderName: string | null;
  founderEmail: string | null;
}

export interface ResolvedSpotlight extends SpotlightTemplate {
  youToldUs: string;
  whatWeBuilt: string;
}

/**
 * The spotlights a visitor actually sees, in the brief's order: enabled in the brief, known to
 * this build, and every module they open switched on for the camp. Brief copy wins over the
 * default where it was written.
 */
export function resolveSpotlights(
  brief: Pick<DemoBrief, 'spotlights'> | null,
  moduleEnabled: (key: ModuleKey) => boolean,
): ResolvedSpotlight[] {
  const entries: BriefSpotlight[] = brief?.spotlights?.length
    ? brief.spotlights
    : [];
  const out: ResolvedSpotlight[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.enabled || seen.has(e.key)) continue;
    const t = SPOTLIGHT_BY_KEY[e.key];
    if (!t) continue;
    if (!t.modules.every(moduleEnabled)) continue;
    seen.add(e.key);
    out.push({
      ...t,
      youToldUs: e.you_told_us?.trim() || t.youToldUs,
      whatWeBuilt: e.what_we_built?.trim() || t.whatWeBuilt,
    });
  }
  return out;
}

/**
 * Fills `{placeholder}` tokens in a step link. Returns null when any token is missing, so the
 * step shows no button instead of a link to a page that cannot load.
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

/** The brief a new demo starts with: the three spotlights built for this prospect, default copy. */
export function defaultBriefSpotlights(keys: SpotlightKey[]): BriefSpotlight[] {
  return keys.map((key) => ({ key, enabled: true, you_told_us: null, what_we_built: null }));
}

/** Spotlights that have sample data a founder can (re)seed into a demo camp. */
export const SEEDABLE: SpotlightKey[] = ['food_requests', 'town_trips', 'receipts'];

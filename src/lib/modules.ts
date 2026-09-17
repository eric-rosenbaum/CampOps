/**
 * Which modules a camp has, and who decided.
 *
 * There are two switches per module and they are not the same question:
 *
 *   1. `camps.platform_modules` — whether this camp is sold the module at all. Ours, not
 *      theirs. Off means the module is absent from their nav, absent from Camp Info, and
 *      unreachable by URL: they never learn it exists.
 *   2. `camps.modules` — whether the camp, having been sold it, uses it. Theirs. Off means it
 *      is off their nav and unreachable, but the toggle is still sitting in Camp Info for them
 *      to turn back on.
 *
 * Both read the same way: a module is off ONLY when its key is explicitly `false`. An absent
 * key is on. That direction matters — these objects predate half the module list, and a rule
 * of "absent means off" would have made a deploy silently delete Building Systems and Retreats
 * from every camp in the product.
 *
 * `camps.modules` used to be written by a setup wizard and read by nothing at all, which is the
 * bug this file exists to fix: turning Kitchen Manager off in Camp Info changed a row and
 * nothing else.
 */
import { useMemo } from 'react';
import { useCampStore } from '@/store/campStore';
import type { Camp } from '@/store/campStore';

export type ModuleKey =
  | 'dashboard' | 'tasks'
  | 'issues' | 'pool' | 'safety' | 'assets' | 'building' | 'commissary' | 'retreats'
  | 'trips' | 'receipts';

export interface ModuleDef {
  key: ModuleKey;
  /** What the camp calls it. Must match the sidebar, or the toggle looks unrelated to the nav. */
  label: string;
  desc: string;
  /**
   * Every route the module owns, including the renamed-away ones that still resolve. A path
   * listed here 404s to the dashboard when the module is off — otherwise a bookmark, a link in
   * an old email or a typed URL walks straight past the switch.
   */
  paths: string[];
  /**
   * What a camp gets when nobody has said. The original seven are sold by default — the rows
   * predate them. A module added later for particular camps (Town Trips, Receipts) is NOT: with
   * "absent means on" it would have appeared in every camp's sidebar the day it deployed.
   * Applies to the platform switch only; once a camp is sold a module, the camp's own switch
   * still reads absent as on.
   */
  defaultOn: boolean;
}

export const MODULES: ModuleDef[] = [
  // The two "Today" pages can be switched off like any module. A focused demo, or a camp that
  // only uses one module, should not open on a dashboard of things it doesn't have.
  { key: 'dashboard', label: 'Dashboard', desc: 'The operations overview a camp lands on',
    paths: ['/home'], defaultOn: true },
  { key: 'tasks', label: 'My Tasks', desc: 'Each person’s own assigned work',
    paths: ['/my-tasks'], defaultOn: true },
  { key: 'issues', label: 'Campground', desc: 'Work orders, routines, housekeeping and repairs',
    paths: ['/campground', '/issues', '/hub'], defaultOn: true },
  { key: 'safety', label: 'Compliance', desc: 'Permit, safety plan, inspections, staff certifications',
    paths: ['/compliance', '/safety'], defaultOn: true },
  { key: 'assets', label: 'Assets & Vehicles', desc: 'Fleet, equipment, checkouts, service records',
    paths: ['/assets'], defaultOn: true },
  { key: 'building', label: 'Building Systems', desc: 'Electrical & plumbing infrastructure by room',
    paths: ['/building'], defaultOn: true },
  { key: 'commissary', label: 'Kitchen Manager', desc: 'Inventory, recipes, menu planning, ordering',
    paths: ['/commissary', '/food-requests'], defaultOn: true },
  { key: 'pool', label: 'Pool & Waterfront', desc: 'Chemical readings, inspections, equipment',
    paths: ['/pool'], defaultOn: true },
  { key: 'retreats', label: 'Retreat Manager', desc: 'External group rentals, guest portal, invoicing',
    paths: ['/retreats'], defaultOn: true },
  { key: 'trips', label: 'Town Trips', desc: 'Rides into town, seats, return trips and a shared errand list',
    paths: ['/trips'], defaultOn: false },
  { key: 'receipts', label: 'Receipts', desc: 'Company-card receipts, statement matching, tax summary, QuickBooks export',
    paths: ['/receipts'], defaultOn: false },
];

export const MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);
export const MODULE_LABELS: Record<ModuleKey, string> =
  Object.fromEntries(MODULES.map((m) => [m.key, m.label])) as Record<ModuleKey, string>;

/**
 * Keys these objects were written with before the module list settled.
 *
 * `kitchen` is Commissary; `compliance` is the Safety key under the name the UI now uses. Rows
 * carrying them are still out there — the normalising migration rewrote what existed on the day
 * it ran, and nothing stops an old seed or a restored backup reintroducing them.
 */
const ALIASES: Record<ModuleKey, string[]> = {
  issues: [], pool: [], assets: [], retreats: [], trips: [], receipts: [], dashboard: [], tasks: [],
  safety: ['compliance'],
  building: ['building_systems'],
  commissary: ['kitchen'],
};

/**
 * An explicit answer under the key or any of its old names wins; otherwise `fallback`.
 * Exported for tests.
 */
export function readSwitch(
  obj: Record<string, boolean> | null | undefined, key: ModuleKey, fallback = true,
): boolean {
  if (!obj) return fallback;
  if (typeof obj[key] === 'boolean') return obj[key];
  for (const alias of ALIASES[key]) {
    if (typeof obj[alias] === 'boolean') return obj[alias];
  }
  return fallback;
}

export function moduleDefaultOn(key: ModuleKey): boolean {
  return MODULES.find((m) => m.key === key)?.defaultOn ?? true;
}

/** Is the camp sold this module? The founder's answer. Unanswered = the module's default. */
export function platformAllows(camp: Pick<Camp, 'platformModules'> | null, key: ModuleKey): boolean {
  return readSwitch(camp?.platformModules, key, moduleDefaultOn(key));
}

/** Has the camp switched it on for itself? Only meaningful where the platform allows it. */
export function campWants(camp: Pick<Camp, 'modules'> | null, key: ModuleKey): boolean {
  return readSwitch(camp?.modules, key);
}

/** Both switches, which is the only one that decides whether a screen exists. */
export function moduleEnabled(camp: Pick<Camp, 'modules' | 'platformModules'> | null, key: ModuleKey): boolean {
  return platformAllows(camp, key) && campWants(camp, key);
}

/**
 * The module a path belongs to, or null for the parts of the app nobody can switch off
 * (the dashboard, My Tasks, Camp Info).
 *
 * Matched on the first segment so `/commissary/orders` and `/hub/abc123` resolve the same as
 * their parents.
 */
export function moduleForPath(pathname: string): ModuleKey | null {
  const first = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  return MODULES.find((m) => m.paths.includes(first))?.key ?? null;
}

export interface ModuleAccess {
  /** On the nav and reachable: the platform sells it and the camp uses it. */
  enabled: (key: ModuleKey) => boolean;
  /** The platform sells it. Decides whether the camp even sees a toggle for it. */
  allowed: (key: ModuleKey) => boolean;
  /** The camp's own switch, ignoring entitlement. Only for rendering that toggle. */
  wanted: (key: ModuleKey) => boolean;
  /** Everything this camp is allowed to see a toggle for, in nav order. */
  allowedModules: ModuleDef[];
}

/**
 * The hook every screen should ask.
 *
 * Subscribes to `currentCamp` rather than to a derived object: a selector that built a new
 * Set or array each render is the React 19 + zustand v5 infinite loop, and this is called from
 * the sidebar, which renders on every navigation.
 */
export function useModules(): ModuleAccess {
  const currentCamp = useCampStore((s) => s.currentCamp);
  return useMemo(() => ({
    enabled: (key: ModuleKey) => moduleEnabled(currentCamp, key),
    allowed: (key: ModuleKey) => platformAllows(currentCamp, key),
    wanted: (key: ModuleKey) => campWants(currentCamp, key),
    allowedModules: MODULES.filter((m) => platformAllows(currentCamp, m.key)),
  }), [currentCamp]);
}

/**
 * Where to send someone whose camp has no dashboard: the first page, in sidebar order, that the
 * camp does have. Camp Info always exists, so this never returns nothing.
 */
export function firstEnabledPath(enabled: (key: ModuleKey) => boolean): string {
  for (const m of MODULES) {
    if (m.key !== 'dashboard' && enabled(m.key)) return m.paths[0];
  }
  return '/settings';
}

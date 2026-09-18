// The camp's own crews, wherever a list of them is needed.
//
// A crew and a trade are one thing. This used to read `camp_trades`, a second list a camp had to
// maintain alongside its crews in a different screen — the one camp that made crews named them
// after two of its own trades, which is how you know they were never two ideas.
//
// So these read `staff_groups`, and a work order filed under `trade` is filed under a crew that
// has people on it. The seed list is still the fallback while those rows load, so a board
// mid-hydration shows the usual five rather than nothing at all.
import { useMemo } from 'react';
import { useCampStore } from '@/store/campStore';
import { TRADES, TRADE_LABELS, type Trade } from './types';

/** Active crews in the camp's own order. Retired ones are not offered for new work. */
export function useTradeKeys(): Trade[] {
  // Subscribe to the raw slice and derive: a selector returning a fresh array every render is
  // the React 19 + zustand v5 infinite loop.
  const groups = useCampStore((s) => s.staffGroups);
  return useMemo(
    () => (groups.length === 0
      ? TRADES
      : groups.filter((g) => g.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((g) => g.key as Trade)),
    [groups],
  );
}

/**
 * Key to label. Retired crews still resolve, because a work order filed under one two seasons
 * ago should not start reading as a bare slug the day the camp stops using it.
 */
export function useTradeLabel(): (t: Trade) => string {
  const groups = useCampStore((s) => s.staffGroups);
  return useMemo(() => {
    const byKey = new Map(groups.map((g) => [g.key, g.name]));
    return (t: Trade) => seedCrewName(t, byKey.get(t)) ?? TRADE_LABELS[t] ?? t;
  }, [groups]);
}

/**
 * A crew's name is the camp's own words, so it is shown as the camp wrote it — except for the
 * five seed crews under their seed names, which were never the camp's words at all. "Maintenance"
 * is our default, and a Spanish reader should see "Mantenimiento" until the camp renames it.
 */
export function seedCrewName(key: string, name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  return name === SEED_CREW_NAMES[key] ? TRADE_LABELS[key] : name;
}

const SEED_CREW_NAMES: Record<string, string> = {
  maintenance: 'Maintenance', housekeeping: 'Housekeeping', grounds: 'Grounds', kitchen: 'Kitchen', it: 'Tech',
};

/** The crew a trade key names, when the caller needs the row and not just the label. */
export function useCrewByTrade(): (t: Trade) => { id: string; name: string } | undefined {
  const groups = useCampStore((s) => s.staffGroups);
  return useMemo(() => {
    const byKey = new Map(groups.map((g) => [g.key, { id: g.id, name: g.name }]));
    return (t: Trade) => byKey.get(t);
  }, [groups]);
}

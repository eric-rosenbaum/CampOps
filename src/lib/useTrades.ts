// The camp's own trades, wherever a list of them is needed.
//
// Trades used to be a five-value constant, so every screen imported TRADES and mapped it. They
// are now rows in `camp_trades`, one set per camp — this hook is the single place that knows to
// fall back to the seed list while those rows are still loading, so a board mid-hydration shows
// the usual five rather than nothing at all.
import { useMemo } from 'react';
import { useCampgroundStore } from '@/store/campgroundStore';
import { TRADES, TRADE_LABELS, type Trade } from './types';

/** Active trades in the camp's own order. Retired ones are not offered for new work. */
export function useTradeKeys(): Trade[] {
  // Subscribe to the raw slice and derive: a selector returning a fresh array every render is
  // the React 19 + zustand v5 infinite loop.
  const trades = useCampgroundStore((s) => s.trades);
  return useMemo(
    () => (trades.length === 0
      ? TRADES
      : trades.filter((t) => t.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
        .map((t) => t.key)),
    [trades],
  );
}

/**
 * Key to label. Retired trades still resolve, because a work order filed under one two seasons
 * ago should not start reading as a bare slug the day the camp stops using it.
 */
export function useTradeLabel(): (t: Trade) => string {
  const trades = useCampgroundStore((s) => s.trades);
  return useMemo(() => {
    const byKey = new Map(trades.map((t) => [t.key, t.label]));
    return (t: Trade) => byKey.get(t) ?? TRADE_LABELS[t] ?? t;
  }, [trades]);
}

import { useMemo } from 'react';
import { Route, CheckCircle2 } from 'lucide-react';
import { useCampgroundStore, routingFor } from '@/store/campgroundStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { TRADE_PILL } from '@/lib/workOrder';
import { TRADES, TRADE_LABELS } from '@/lib/types';
import type { Trade } from '@/lib/types';

/**
 * Where each trade's work lands by default.
 *
 * This is the highest-value setting in the module and the least impressive-looking. An untriaged
 * queue is why maintenance systems get abandoned: a housekeeping report that sits unassigned
 * until an admin happens to notice it is a report nobody acted on, and after a fortnight of that
 * people go back to texting the maintenance director. Setting a default per trade means a
 * housekeeping report lands on the housekeeping lead the moment it is filed, with nobody in the
 * middle.
 *
 * Routing is a DEFAULT, never a permission. Gating who can see work by trade would rebuild the
 * staff-visibility trap that once hid a reporter's own issue from them.
 */

const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';

export function WorkRoutingCard() {
  const routing = useCampgroundStore((s) => s.routing);
  const setTradeRouting = useCampgroundStore((s) => s.setTradeRouting);
  const issues = useIssuesStore((s) => s.issues);
  const members = useCampStore((s) => s.members);
  const staffGroups = useCampStore((s) => s.staffGroups);
  const { role } = useAuth();
  const canEdit = role === 'admin';

  const assignable = useMemo(
    () => members
      .filter((m) => m.isActive && m.role !== 'viewer')
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')),
    [members],
  );

  /** How much work is sitting unassigned in each trade — the cost of an empty row, in numbers. */
  const unassignedByTrade = useMemo(() => {
    const map = new Map<Trade, number>();
    for (const i of issues) {
      if (i.status !== 'unassigned') continue;
      map.set(i.trade, (map.get(i.trade) ?? 0) + 1);
    }
    return map;
  }, [issues]);

  const routed = useMemo(
    () => TRADES.filter((t) => {
      const r = routingFor(routing, t);
      return Boolean(r?.defaultAssigneeId || r?.defaultStaffGroupId);
    }).length,
    [routing],
  );

  return (
    <div className="rounded-card border border-border bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-start gap-3">
          <Route className="w-5 h-5 text-forest flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="font-display text-[15px] font-bold text-forest">Where work lands</h3>
            <p className="text-[12.5px] text-ink-soft leading-relaxed mt-1 max-w-2xl">
              Work filed against a trade with no default here waits in the unassigned pile.
            </p>
            <p className="text-[11.5px] text-ink-faint mt-1.5">
              {routed} of {TRADES.length} trades routed.
            </p>
          </div>
        </div>
      </div>

      <ul>
        {TRADES.map((trade) => {
          const r = routingFor(routing, trade);
          const assigneeId = r?.defaultAssigneeId ?? '';
          const groupId = r?.defaultStaffGroupId ?? '';
          const waiting = unassignedByTrade.get(trade) ?? 0;
          const isRouted = Boolean(assigneeId || groupId);

          return (
            <li key={trade} className="px-5 py-3.5 border-b border-border last:border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="sm:w-44 flex-shrink-0">
                  <span className={`rounded-tag px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${TRADE_PILL[trade]}`}>
                    {TRADE_LABELS[trade]}
                  </span>
                  <p className={`text-[11.5px] mt-1.5 ${waiting > 0 && !isRouted ? 'text-red-text' : 'text-ink-faint'}`}>
                    {waiting === 0
                      ? 'nothing unassigned'
                      : `${waiting} unassigned right now`}
                  </p>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1"
                      htmlFor={`routing-assignee-${trade}`}
                    >
                      Default assignee
                    </label>
                    <select
                      id={`routing-assignee-${trade}`}
                      className={inputClass}
                      value={assigneeId}
                      disabled={!canEdit}
                      onChange={(e) => setTradeRouting(trade, groupId || null, e.target.value || null)}
                    >
                      <option value="">Nobody — leave it unassigned</option>
                      {assignable.map((m) => (
                        <option key={m.userId} value={m.userId}>{m.displayName ?? m.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1"
                      htmlFor={`routing-group-${trade}`}
                    >
                      Staff group
                    </label>
                    <select
                      id={`routing-group-${trade}`}
                      className={inputClass}
                      value={groupId}
                      disabled={!canEdit}
                      onChange={(e) => setTradeRouting(trade, e.target.value || null, assigneeId || null)}
                    >
                      <option value="">None</option>
                      {staffGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="sm:w-5 flex-shrink-0 flex sm:justify-center">
                  {isRouted && (
                    <CheckCircle2
                      className="w-4 h-4 text-green-muted-text"
                      aria-label={`${TRADE_LABELS[trade]} is routed`}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!canEdit && (
        <p className="px-5 py-3 text-[11.5px] text-ink-faint border-t border-border">
          Only an administrator can change routing.
        </p>
      )}
    </div>
  );
}

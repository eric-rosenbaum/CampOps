import { useMemo } from 'react';
import { Route, CheckCircle2 } from 'lucide-react';
import { useCampgroundStore, routingFor } from '@/store/campgroundStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { tradePill } from '@/lib/workOrder';
import { useTradeLabel } from '@/lib/useTrades';
import type { Trade } from '@/lib/types';
import { useTradeKeys } from '@/lib/useTrades';

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
  const tradeKeys = useTradeKeys();
  const labelOf = useTradeLabel();
  const routing = useCampgroundStore((s) => s.routing);
  const setTradeRouting = useCampgroundStore((s) => s.setTradeRouting);
  const issues = useIssuesStore((s) => s.issues);
  const members = useCampStore((s) => s.members);
  const staffGroups = useCampStore((s) => s.staffGroups);
  const { role } = useAuth();
  const canEdit = role === 'admin';

  const crewMembership = useCampStore((s) => s.crewMembership);

  /** The crew a trade key names. Since the merge, every trade IS one. */
  const crewFor = useMemo(() => {
    const byKey = new Map(staffGroups.map((g) => [g.key, g]));
    return (t: Trade) => byKey.get(t);
  }, [staffGroups]);

  /**
   * Who can take work in a given crew.
   *
   * Only that crew's own members, which is the point of merging the two lists: the default for
   * housekeeping work is a housekeeper, and offering the whole camp in that dropdown was how a
   * camp ended up routing kitchen work to the waterfront director by mis-click.
   */
  const assignableIn = useMemo(() => {
    const active = members.filter((m) => m.isActive && m.role !== 'viewer');
    return (groupId: string | undefined) => {
      const ids = groupId ? crewMembership[groupId] ?? [] : [];
      return active
        .filter((m) => ids.includes(m.userId))
        .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    };
  }, [members, crewMembership]);

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
    () => tradeKeys.filter((t) => {
      const r = routingFor(routing, t);
      return Boolean(r?.defaultAssigneeId || r?.defaultStaffGroupId);
    }).length,
    [routing, tradeKeys],
  );

  return (
    <div className="rounded-card border border-border bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-start gap-3">
          <Route className="w-5 h-5 text-forest flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="font-display text-[15px] font-bold text-forest">Where work lands</h3>
            <p className="text-[12.5px] text-ink-soft leading-relaxed mt-1 max-w-2xl">
              Every crew is a kind of work. Work filed against a crew with nobody on it and no
              default here waits in the unassigned pile until someone takes it.
            </p>
            <p className="text-[11.5px] text-ink-faint mt-1.5">
              {routed} of {tradeKeys.length} crews have somewhere to send work.
            </p>
          </div>
        </div>
      </div>

      <ul>
        {tradeKeys.map((trade) => {
          const r = routingFor(routing, trade);
          const assigneeId = r?.defaultAssigneeId ?? '';
          const crew = crewFor(trade);
          const crewMembers = assignableIn(crew?.id);
          const waiting = unassignedByTrade.get(trade) ?? 0;
          // A crew with people on it is a destination even with no named default: the work sits
          // with the crew and any of them can take it. That is routed, not stranded.
          const isRouted = Boolean(assigneeId) || crewMembers.length > 0;

          return (
            <li key={trade} className="px-5 py-3.5 border-b border-border last:border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="sm:w-44 flex-shrink-0">
                  <span className={`rounded-tag px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${tradePill(trade)}`}>
                    {labelOf(trade)}
                  </span>
                  <p className={`text-[11.5px] mt-1.5 ${waiting > 0 && !isRouted ? 'text-red-text' : 'text-ink-faint'}`}>
                    {waiting === 0
                      ? 'nothing unassigned'
                      : `${waiting} unassigned right now`}
                  </p>
                </div>

                <div className="flex-1">
                  <label
                    className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1"
                    htmlFor={`routing-assignee-${trade}`}
                  >
                    Who on this crew gets it
                  </label>
                  <select
                    id={`routing-assignee-${trade}`}
                    className={inputClass}
                    value={assigneeId}
                    disabled={!canEdit || !crew}
                    onChange={(e) => setTradeRouting(trade, crew?.id ?? null, e.target.value || null)}
                  >
                    <option value="">The whole crew — anyone can pick it up</option>
                    {crewMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.displayName ?? m.fullName}</option>
                    ))}
                  </select>
                  {crew && crewMembers.length === 0 && (
                    <p className="text-[11px] text-ink-faint mt-1">
                      Nobody is on {crew.name} yet. Add people under Team, or leave this for the crew.
                    </p>
                  )}
                </div>

                <div className="sm:w-5 flex-shrink-0 flex sm:justify-center">
                  {isRouted && (
                    <CheckCircle2
                      className="w-4 h-4 text-green-muted-text"
                      aria-label={`${labelOf(trade)} is routed`}
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

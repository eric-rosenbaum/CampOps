import { useMemo } from 'react';
import type { FoodProgram, FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import { useCommissaryStore } from '@/store/commissaryStore';
import { formatNotice, formatNoticeRule, formatPickup, kitchenLineView, lineChangeSummary, overdueLabel } from '@/lib/foodRequests';
import { FoodStatusChip, LateChip, ProgramDot } from './foodUi';

/**
 * One request as a card: who, when, how much notice, and what. The actions are the caller's,
 * because the same card sits in the inbox (decide), the pickup board (hand over) and history.
 *
 * Lines read the way the shelf is pulled: the kitchen's item name and the approved amount, with
 * the counselor's own words underneath only when they differ. The card used to show "mini
 * chocolate chips 2 lb", which is neither what was asked for nor what is on the shelf.
 */
export function RequestCard({ request, lines, program, actions, onOpen, showStatus = true, overdueHours = null }: {
  request: FoodRequest;
  lines: FoodRequestLine[];
  program: FoodProgram | undefined;
  actions?: React.ReactNode;
  onOpen: () => void;
  showStatus?: boolean;
  /** Hours past the pickup time for an approved/ready request, or null. */
  overdueHours?: number | null;
}) {
  const items = useCommissaryStore((s) => s.items);
  const names = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  const who = program?.name ?? request.requesterName;
  const late = request.isLate && request.status === 'submitted';
  const overdue = overdueHours != null;
  return (
    <article
      data-testid="food-request-card"
      data-request-id={request.id}
      data-overdue={overdue || undefined}
      className={`rounded-card border bg-white ${
        overdue ? 'border-red/50 shadow-[inset_4px_0_0_#B4552F]'
          : late ? 'border-amber/60 shadow-[inset_4px_0_0_#D08C1B]' : 'border-border'}`}
    >
      <button type="button" onClick={onOpen} className="block w-full px-4 pt-3 pb-2 text-left">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ProgramDot color={program?.color ?? null} />
          <h3 className="text-[14px] font-semibold text-forest">{who}</h3>
          {program && <span className="text-[12px] text-ink-soft">· {request.requesterName}</span>}
          <span className="flex-1" />
          {late && <LateChip hours={request.noticeHours} />}
          {overdue && (
            <span data-testid="overdue-chip" className="inline-flex items-center whitespace-nowrap rounded-pill border border-red/30 bg-red-bg px-2 py-0.5 text-[11px] font-bold text-red-text">
              {overdueLabel(overdueHours)}
            </span>
          )}
          {showStatus && (
            <FoodStatusChip status={request.status}
              label={request.status === 'cancelled' && request.cancelledBy ? `Cancelled by ${request.cancelledBy}` : undefined} />
          )}
        </div>
        <p className="mt-1 text-[13px] text-ink">
          <span className="font-semibold">{formatPickup(request.pickupDate, request.pickupTime)}</span>
          {request.headcount ? <span className="text-ink-soft"> · {request.headcount} people</span> : null}
          {request.purpose ? <span className="text-ink-soft"> · {request.purpose}</span> : null}
        </p>
        {request.status === 'submitted' && (
          // The chip already says the hours; this line says the rule it was measured against.
          <p className="text-[12px] text-ink-soft">
            {late ? `You ask for ${formatNoticeRule(request.cutoffHours)}` : `${formatNotice(request.noticeHours)}’ notice`}
          </p>
        )}
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {lines.map((l) => {
            const v = kitchenLineView(l, l.itemId ? names.get(l.itemId) : undefined);
            const change = lineChangeSummary(l);
            return (
              <li key={l.id} data-testid="request-line"
                className={`inline-flex max-w-full flex-col rounded-tag border px-2 py-0.5 text-[12px] ${
                  l.lineState === 'unavailable' ? 'border-border bg-cream-dark text-ink-faint'
                    : !v.linked ? 'border-dashed border-amber/60 bg-amber-bg/40 text-ink' : 'border-border bg-cream/60 text-ink'
                }`}
                title={!v.linked ? 'Not on your kitchen list: link it to an item when you approve, so it is set aside and ordered' : change ?? undefined}>
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="truncate">{v.name}</span>
                  <span className="font-mono text-[11px] text-ink-soft">{l.lineState === 'unavailable' ? 'n/a' : v.qty}</span>
                </span>
                {v.asked && <span className="truncate text-[10.5px] text-ink-soft">asked: {v.asked}</span>}
              </li>
            );
          })}
        </ul>
      </button>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2.5">{actions}</div>}
    </article>
  );
}

/** The key to the dashed chips, shown once above a list that has any. */
export function UnlinkedLegend() {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-soft" data-testid="unlinked-legend">
      <span className="inline-block h-3 w-5 rounded-[3px] border border-dashed border-amber/70 bg-amber-bg/40" aria-hidden="true" />
      Dashed = not on your kitchen list. Link it when you approve so it is set aside and ordered.
    </p>
  );
}

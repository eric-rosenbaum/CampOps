import type { FoodProgram, FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import { formatLineQty, formatNotice, formatPickup, lineChangeSummary } from '@/lib/foodRequests';
import { FoodStatusChip, LateChip, ProgramDot } from './foodUi';

/**
 * One request as a card: who, when, how much notice, and what. The actions are the caller's,
 * because the same card sits in the inbox (decide), the pickup board (hand over) and history.
 */
export function RequestCard({ request, lines, program, actions, onOpen, showStatus = true }: {
  request: FoodRequest;
  lines: FoodRequestLine[];
  program: FoodProgram | undefined;
  actions?: React.ReactNode;
  onOpen: () => void;
  showStatus?: boolean;
}) {
  const who = program?.name ?? request.requesterName;
  return (
    <article
      data-testid="food-request-card"
      data-request-id={request.id}
      className={`rounded-card border bg-white ${request.isLate && request.status === 'submitted' ? 'border-amber/60 shadow-[inset_4px_0_0_#D08C1B]' : 'border-border'}`}
    >
      <button type="button" onClick={onOpen} className="block w-full px-4 pt-3 pb-2 text-left">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ProgramDot color={program?.color ?? null} />
          <h3 className="text-[14px] font-semibold text-forest">{who}</h3>
          {program && <span className="text-[12px] text-ink-soft">· {request.requesterName}</span>}
          <span className="flex-1" />
          {request.isLate && request.status === 'submitted' && <LateChip hours={request.noticeHours} />}
          {showStatus && <FoodStatusChip status={request.status} />}
        </div>
        <p className="mt-1 text-[13px] text-ink">
          <span className="font-semibold">{formatPickup(request.pickupDate, request.pickupTime)}</span>
          {request.headcount ? <span className="text-ink-soft"> · {request.headcount} people</span> : null}
          {request.purpose ? <span className="text-ink-soft"> · {request.purpose}</span> : null}
        </p>
        {request.status === 'submitted' && (
          // The late chip already says the hours; this line only adds what it cannot.
          <p className={`text-[12px] ${request.isLate ? 'font-semibold text-amber-text' : 'text-ink-soft'}`}>
            {request.isLate ? `Under the ${Math.round(request.cutoffHours)}-hour cutoff` : `${formatNotice(request.noticeHours)}’ notice`}
          </p>
        )}
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {lines.map((l) => {
            const change = lineChangeSummary(l);
            return (
              <li key={l.id}
                className={`inline-flex max-w-full items-center gap-1 rounded-tag border px-2 py-0.5 text-[12px] ${
                  l.lineState === 'unavailable' ? 'border-border bg-cream-dark text-ink-faint'
                    : !l.itemId ? 'border-dashed border-amber/50 bg-amber-bg/40 text-ink' : 'border-border bg-cream/60 text-ink'
                }`}
                title={!l.itemId ? 'Not linked to an inventory item, so ordering cannot see it' : change ?? undefined}>
                <span className="truncate">{l.label}</span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {l.lineState === 'unavailable' ? 'n/a'
                    : formatLineQty(l.qtyApproved ?? l.qtyRequested, l.qtyApproved != null ? l.approvedUnitLabel : l.unitLabel)}
                </span>
              </li>
            );
          })}
        </ul>
      </button>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2.5">{actions}</div>}
    </article>
  );
}

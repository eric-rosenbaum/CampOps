// One lead on the pipeline board.
//
// A camp runs fifteen to forty groups a year, not four thousand leads, so this card is
// deliberately short: who they are, when they want to come (or the words they used when they
// had no dates yet), what it is worth, whose it is, and — the one field that turns a list into
// a pipeline — what happens next and when.
import { useState } from 'react';
import { MoreHorizontal, CalendarClock, CircleUser } from 'lucide-react';
import type { LeadStage, Retreat } from '@/lib/types';
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@/lib/types';
import { money, fmtRange, fmtDate, Badge } from './retreatUi';
import { relativeDueDate, todayStr } from '@/lib/utils';

interface Props {
  retreat: Retreat;
  /** Display name for `ownerId`, resolved by the board (which already has the member list). */
  ownerName: string | null;
  /** ISO timestamp of the newest touchpoint. A lead nobody has spoken to in a month is news. */
  lastTouchAt?: string | null;
  onOpen: () => void;
  onMove: (stage: LeadStage) => void;
  onEditNextAction: () => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  canManage: boolean;
}

/** Whole days since an ISO timestamp, or null. Used only for the "last spoken to" line. */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function LeadCard({
  retreat: r, ownerName, lastTouchAt, onOpen, onMove, onEditNextAction, onDragStart, canManage,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const hasDates = Boolean(r.arrivalDate || r.departureDate);
  const due = r.nextActionOn ? relativeDueDate(r.nextActionOn) : null;
  const overdue = Boolean(r.nextActionOn && r.nextActionOn <= todayStr() && due?.overdue);
  const quiet = daysSince(lastTouchAt);

  return (
    <div
      draggable={canManage}
      // Firefox refuses to start a drag unless dataTransfer carries something, so the id goes on
      // it even though the board tracks the dragged lead in its own state.
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', r.id);
        onDragStart?.(e);
      }}
      onClick={onOpen}
      className={`relative bg-white border rounded-card px-3 py-2.5 cursor-pointer transition-colors
        hover:border-sage ${overdue ? 'border-red/40' : 'border-border'}`}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[13px] font-semibold text-forest leading-snug min-w-0">
          {r.groupName}
        </p>
        {canManage && (
          <button
            type="button"
            aria-label="Move stage"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="text-ink-faint hover:text-forest transition-colors -mr-1 -mt-0.5 p-0.5"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dates, or the words they actually used. "Any weekend in October" is information;
          a blank line where a date should be is not. */}
      <p className="text-[11.5px] text-ink-soft mt-1 leading-snug">
        {hasDates
          ? fmtRange(r.arrivalDate, r.departureDate)
          : r.dateFlexibility
            ? <span className="italic">“{r.dateFlexibility}”</span>
            : <span className="text-ink-faint">No dates yet</span>}
        {r.headcount > 0 && <span className="text-ink-faint"> · {r.headcount} people</span>}
      </p>

      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="text-[12.5px] font-semibold text-ink tabular-nums">
          {r.estimatedValue != null ? money(r.estimatedValue) : <span className="text-ink-faint font-normal">Value TBC</span>}
        </span>
        {ownerName && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft min-w-0">
            <CircleUser className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{ownerName}</span>
          </span>
        )}
      </div>

      {r.leadStage === 'lost' && r.lostReason && (
        <p className="text-[11px] text-ink-soft mt-1.5 pt-1.5 border-t border-border">
          Lost: {r.lostReason}
        </p>
      )}

      {/* The next action gets its own ruled row because it is the reason to look at this card
          at all. Overdue turns rust — the same alarm colour the rest of the app uses. */}
      {r.leadStage !== 'won' && r.leadStage !== 'lost' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (canManage) onEditNextAction(); }}
          className="w-full text-left mt-2 pt-2 border-t border-border group/na"
        >
          {r.nextAction ? (
            <span className={`flex items-start gap-1.5 text-[11.5px] leading-snug ${overdue ? 'text-red' : 'text-ink'}`}>
              <CalendarClock className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
              <span className="min-w-0">
                <span className="font-medium">{r.nextAction}</span>
                {r.nextActionOn && (
                  <span className={overdue ? 'font-semibold' : 'text-ink-soft'}>
                    {' · '}{fmtDate(r.nextActionOn)}{due ? ` (${due.label.toLowerCase()})` : ''}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint group-hover/na:text-forest transition-colors">
              <CalendarClock className="w-3.5 h-3.5" /> Set a next action
            </span>
          )}
        </button>
      )}

      {quiet != null && quiet >= 14 && r.leadStage !== 'won' && r.leadStage !== 'lost' && (
        <p className="mt-1.5"><Badge tone="warn">No contact in {quiet} days</Badge></p>
      )}

      {menuOpen && (
        <>
          {/* A plain backdrop rather than a document listener: it closes on the same click that
              would otherwise fall through to the card and open the retreat. */}
          <div
            className="fixed inset-0 z-20"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
          />
          <div className="absolute right-2 top-8 z-30 bg-white border border-border rounded-card shadow-lg py-1 w-44">
            <p className="px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">Move to</p>
            {LEAD_STAGES.filter((s) => s !== r.leadStage).map((s) => (
              <button
                key={s}
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMove(s); }}
                className="w-full text-left px-3 py-1.5 text-[12.5px] text-ink hover:bg-cream-dark transition-colors"
              >
                {LEAD_STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

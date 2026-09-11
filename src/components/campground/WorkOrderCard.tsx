import { Repeat } from 'lucide-react';
import type { Issue, IssueStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useCampStore } from '@/store/campStore';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampgroundStore, checklistProgress, hasUnread, inThread } from '@/store/campgroundStore';
import {
  STATUS_LABELS, tradeStripe, tradePill, tradeLabel, isOverdue, describeMissed,
} from '@/lib/workOrder';
import { LocationIcon } from '@/components/shared/LocationIcon';
import { Avatar } from '@/components/shared/Avatar';
import { relativeDueDate, formatDate } from '@/lib/utils';

/**
 * Status colour, kept out of workOrder.ts because it is a presentation choice this card and
 * the detail share and nothing else needs.
 *
 * The two waiting states take amber deliberately: open-but-nobody-is-working-it is the state a
 * camp most needs to notice, and it used to hide inside "in progress".
 */
const STATUS_TONE: Record<IssueStatus, string> = {
  unassigned: 'border-red text-red',
  assigned: 'border-border text-ink-soft',
  in_progress: 'border-sage text-green-muted-text',
  waiting_on_vendor: 'border-amber text-amber-text',
  waiting_on_part: 'border-amber text-amber-text',
  resolved: 'border-sage text-sage',
};

/** Shared with the detail, as a component rather than a bare map so fast refresh survives. */
export function StatusChip({ status }: { status: IssueStatus }) {
  return (
    <span className={`rounded-tag border px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.09em] ${STATUS_TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

interface Props {
  issue: Issue;
  selected: boolean;
  onClick: () => void;
  /** The camp's calendar day. Passed in so a list of 200 cards agrees on what "today" is. */
  today: string;
  onTakeIt?: () => void;
}

export function WorkOrderCard({ issue, selected, onClick, today, onTakeIt }: Props) {
  const { currentUser } = useAuth();
  const members = useCampStore((s) => s.members);
  // Raw slices only. A selector that filtered any of these would allocate a new array every
  // render, which under React 19 + zustand v5 is an infinite loop and a white screen.
  const checklistItems = useCampgroundStore((s) => s.checklistItems);
  const comments = useCampgroundStore((s) => s.comments);
  const readAt = useCampgroundStore((s) => s.readAt);
  const schedules = useCampgroundStore((s) => s.schedules);
  const retreats = useRetreatStore((s) => s.retreats);

  const assigneeName = issue.assigneeId
    ? (members.find((m) => m.userId === issue.assigneeId)?.fullName ?? null)
    : null;
  const location = issue.locations[0];
  const due = issue.dueDate ? relativeDueDate(issue.dueDate, issue.dueTime) : null;
  const late = isOverdue(issue, today);

  const progress = checklistProgress(checklistItems, issue.id);
  // Only for threads this person is actually in. A dot on every card is a dot that means
  // nothing.
  const unread = inThread(issue, comments, currentUser.id)
    && hasUnread(comments, readAt, issue.id, currentUser.id);

  const schedule = issue.scheduleId ? schedules.find((s) => s.id === issue.scheduleId) : undefined;
  const behind = schedule ? describeMissed(schedule.missedCount) : null;

  // A rental group's name, not "retreat". The crew knows the Hendersons, not a source enum.
  const retreatName = issue.retreatId
    ? (retreats.find((r) => r.id === issue.retreatId)?.groupName ?? null)
    : null;

  return (
    <div
      onClick={onClick}
      aria-current={selected || undefined}
      className={`mb-2 flex w-full items-center gap-3 sm:gap-4 rounded-card border border-l-4 bg-white
                  px-3 py-3 sm:px-4 sm:py-4 text-left cursor-pointer
                  transition-[box-shadow,transform,border-color] duration-150
                  hover:-translate-y-px hover:shadow-[0_3px_0_rgba(35,32,27,0.07)]
                  ${tradeStripe(issue.trade)}
                  ${selected ? 'border-forest shadow-[0_0_0_1px_#1D3A2E]' : 'border-border'}`}
    >
      <LocationIcon location={location} className="hidden sm:grid" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {unread && (
            <span
              className="h-2 w-2 flex-none rounded-full bg-red"
              title="New message on this work order"
            />
          )}
          <p className="truncate font-display text-[15.5px] sm:text-[16.5px] font-semibold leading-snug text-ink">
            {issue.title}
          </p>
          {issue.scheduleId && (
            <Repeat className="h-3.5 w-3.5 flex-none text-sage" aria-label="Routine" />
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] sm:text-[12.5px] text-ink-soft">
          <span className={`rounded-tag px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.09em] ${tradePill(issue.trade)}`}>
            {tradeLabel(issue.trade)}
          </span>
          <StatusChip status={issue.status} />
          {location && <span className="truncate">{location}</span>}
          {issue.priority !== 'normal' && (
            <span className={issue.priority === 'urgent' ? 'font-bold text-red' : 'font-semibold text-amber-text'}>
              {issue.priority === 'urgent' ? 'Urgent' : 'High'}
            </span>
          )}
          {behind && <span className="font-semibold text-red">{behind}</span>}
          {retreatName && <span className="truncate">For {retreatName}</span>}
          {issue.isPublicReport && (
            <span className="rounded-tag border border-red px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] text-red">
              Public
            </span>
          )}
        </div>

        {/* What lets a housekeeping lead see which cabins are actually finished without
            walking to each one. */}
        {progress && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1 w-16 flex-none overflow-hidden rounded-pill bg-cream-dark">
              <span
                className="block h-full bg-sage"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </span>
            <span className="text-[11.5px] tabular-nums text-ink-soft">
              {progress.done} of {progress.total}
            </span>
          </div>
        )}
      </div>

      <div className="flex-none text-right">
        {assigneeName ? (
          <div className="flex items-center justify-end gap-1.5">
            <Avatar name={assigneeName} size={20} />
            <span className="hidden sm:inline text-[12.5px] font-bold text-forest">
              {assigneeName.trim().split(/\s+/)[0]}
            </span>
          </div>
        ) : (
          <p className="text-[12.5px] font-bold text-red">Unassigned</p>
        )}
        {due ? (
          <p className={`mt-0.5 text-[11.5px] tabular-nums ${late ? 'font-bold text-red' : 'text-ink-soft'}`}>
            {due.label}
          </p>
        ) : (
          <p className="mt-0.5 text-[11.5px] text-ink-faint">
            {issue.status === 'resolved' ? formatDate(issue.updatedAt) : 'No due date'}
          </p>
        )}
        {onTakeIt && !issue.assigneeId && (
          <button
            onClick={(e) => { e.stopPropagation(); onTakeIt(); }}
            className="mt-1.5 rounded-tag border border-border bg-paper px-2 py-0.5 text-[11px] font-semibold
                       text-forest transition-colors hover:border-sage"
          >
            Take it
          </button>
        )}
      </div>
    </div>
  );
}

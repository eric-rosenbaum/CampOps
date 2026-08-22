import type { Issue } from '@/lib/types';
import { useCampStore } from '@/store/campStore';
import { LocationIcon } from './LocationIcon';
import { relativeDueDate, formatDate } from '@/lib/utils';

interface Props {
  issue: Issue;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
  onTakeIt?: () => void;
}

/** The left edge carries priority, so urgency is readable down the gutter of the whole list. */
const priorityEdge: Record<string, string> = {
  urgent: 'border-l-red',
  high: 'border-l-amber',
  normal: 'border-l-sage',
};

const priorityWord: Record<string, string> = {
  urgent: 'text-red font-bold',
  high: 'text-amber-text font-semibold',
  normal: 'text-ink-soft',
};

const priorityLabel: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
};

export function IssueCard({ issue, selected, onClick, compact = false, onTakeIt }: Props) {
  const members = useCampStore((s) => s.members);
  const memberName = (userId: string | null) =>
    userId ? (members.find((m) => m.userId === userId)?.fullName ?? null) : null;

  const assigneeName = memberName(issue.assigneeId);
  const location = issue.locations[0];
  const due = issue.dueDate ? relativeDueDate(issue.dueDate) : null;

  return (
    <div
      onClick={onClick}
      aria-current={selected || undefined}
      className={`mb-2 flex w-full items-center gap-4 rounded-card border border-l-4 bg-white text-left
                  transition-[box-shadow,transform,border-color] duration-150 cursor-pointer
                  hover:-translate-y-px hover:shadow-[0_3px_0_rgba(35,32,27,0.07)]
                  ${priorityEdge[issue.priority]}
                  ${selected ? 'border-forest shadow-[0_0_0_1px_#1D3A2E]' : 'border-border'}
                  ${compact ? 'px-3.5 py-3' : 'px-4 py-4'}`}
    >
      <LocationIcon location={location} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[16.5px] font-semibold leading-snug text-ink">{issue.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-soft">
          {location && <span className="truncate">{location}</span>}
          {location && <span className="text-border">·</span>}
          <span className={priorityWord[issue.priority]}>{priorityLabel[issue.priority]}</span>
          {issue.isPublicReport && (
            <span className="rounded-tag border border-red px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] text-red">
              Public
            </span>
          )}
          {issue.status === 'resolved' && issue.actualCost != null && (
            <>
              <span className="text-border">·</span>
              <span className="tabular-nums">${issue.actualCost.toLocaleString()}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-none text-right">
        {assigneeName ? (
          <p className="text-[12.5px] font-bold text-forest">{assigneeName.trim().split(/\s+/)[0]}</p>
        ) : (
          <p className="text-[12.5px] font-bold text-red">Unassigned</p>
        )}
        {due ? (
          <p className={`mt-0.5 text-[11.5px] tabular-nums ${due.overdue ? 'text-red' : 'text-ink-soft'}`}>
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

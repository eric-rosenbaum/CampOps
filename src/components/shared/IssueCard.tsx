import type { Issue } from '@/lib/types';
import { useCampStore } from '@/store/campStore';
import { TagPill } from './TagPill';
import { relativeTime, formatDate } from '@/lib/utils';

interface Props {
  issue: Issue;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}

const priorityBorderColor = {
  urgent: 'border-l-red',
  high: 'border-l-amber',
  normal: 'border-l-sage',
};

const priorityDotColor = {
  urgent: 'bg-red',
  high: 'bg-amber',
  normal: 'bg-sage',
};

const statusLabel: Record<string, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

export function IssueCard({ issue, selected, onClick, compact = false }: Props) {
  const members = useCampStore((s) => s.members);
  const memberName = (userId: string | null) => userId ? (members.find((m) => m.userId === userId)?.fullName ?? null) : null;
  const reporterName = memberName(issue.reportedById);
  const assigneeName = memberName(issue.assigneeId);

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-card border border-l-[3px] ${priorityBorderColor[issue.priority]} cursor-pointer transition-all hover:shadow-sm ${
        selected ? 'border-border' : 'border-border'
      } ${compact ? 'p-3' : 'p-4'}`}
      style={selected ? { boxShadow: '0 0 0 2px #1a2e1a' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${priorityDotColor[issue.priority]}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-forest leading-snug truncate">{issue.title}</p>
            {reporterName && (
              <p className="text-[11px] text-forest/50 mt-0.5">
                Reported by {reporterName} · {relativeTime(issue.createdAt)}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {issue.locations.map((l) => <TagPill key={l} label={l} variant="location" />)}
              <TagPill label={statusLabel[issue.status] ?? issue.status} />
              {issue.estimatedCostDisplay && issue.status !== 'resolved' && (
                <TagPill label={`Est. ${issue.estimatedCostDisplay}`} variant="cost" />
              )}
              {issue.status === 'resolved' && issue.actualCost != null && (
                <TagPill label={`$${issue.actualCost.toLocaleString()}`} variant="cost" />
              )}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {assigneeName ? (
            <p className="text-[12px] font-medium text-forest/70">{assigneeName}</p>
          ) : (
            <p className="text-[12px] font-medium text-red">Unassigned</p>
          )}
          {issue.dueDate && (
            <p className="text-[11px] text-forest/45 mt-0.5">{formatDate(issue.dueDate)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

import type { ChecklistTask } from '@/lib/types';
import { SEED_USERS } from '@/lib/seedData';
import { TagPill } from './TagPill';
import { relativeTime, relativeDueDate } from '@/lib/utils';

interface Props {
  task: ChecklistTask;
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

export function TaskCard({ task, selected, onClick, compact = false }: Props) {
  const assignee = SEED_USERS.find((u) => u.id === task.assigneeId);

  const dueInfo = task.dueDate ? relativeDueDate(task.dueDate) : null;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-card border border-l-[3px] ${priorityBorderColor[task.priority]} cursor-pointer transition-all hover:shadow-sm border-border ${compact ? 'p-3' : 'p-4'}`}
      style={selected ? { boxShadow: '0 0 0 2px #1a2e1a' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${priorityDotColor[task.priority]}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-forest leading-snug truncate">{task.title}</p>
            <p className="text-[11px] text-forest/50 mt-0.5">
              {task.location} · Updated {relativeTime(task.updatedAt)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <TagPill label={task.location} variant="location" />
              {dueInfo && (
                <span className={`text-[11px] font-medium ${dueInfo.overdue ? 'text-red' : 'text-forest/60'}`}>
                  {dueInfo.label}
                </span>
              )}
              <TagPill label="Recurring annually" variant="recurring" />
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {assignee ? (
            <p className="text-[12px] font-medium text-forest/70">{assignee.name}</p>
          ) : (
            <p className="text-[12px] font-medium text-red">Unassigned</p>
          )}
          <div className={`mt-1 inline-flex px-2 py-0.5 rounded-pill text-[10px] font-semibold ${
            task.status === 'complete' ? 'bg-green-muted-bg text-green-muted-text' :
            task.status === 'in_progress' ? 'bg-amber-bg text-amber-text' :
            'bg-cream-dark text-forest/50'
          }`}>
            {task.status === 'complete' ? 'Complete' : task.status === 'in_progress' ? 'In progress' : 'Pending'}
          </div>
        </div>
      </div>
    </div>
  );
}

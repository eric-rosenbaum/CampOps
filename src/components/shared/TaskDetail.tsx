import type { ChecklistTask, ChecklistStatus } from '@/lib/types';
import { SEED_USERS } from '@/lib/seedData';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';
import { PriorityBadge } from './PriorityBadge';
import { ActivityFeed } from './ActivityFeed';
import { Button } from './Button';
import { formatDate, formatDateTime, generateId } from '@/lib/utils';

interface Props {
  task: ChecklistTask;
}

export function TaskDetail({ task }: Props) {
  const { updateTask, completeTask, addActivityEntry } = useChecklistStore();
  const { currentUser, can } = useAuth();
  const currentUserId = currentUser.id;

  const assignee = SEED_USERS.find((u) => u.id === task.assigneeId);

  function handleStatusChange(newStatus: ChecklistStatus) {
    updateTask(task.id, { status: newStatus });
    addActivityEntry(task.id, {
      id: generateId(),
      userId: currentUserId,
      userName: currentUser.name,
      action: `Status changed to ${newStatus.replace('_', ' ')} by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleAssigneeChange(assigneeId: string) {
    const newAssignee = SEED_USERS.find((u) => u.id === assigneeId);
    updateTask(task.id, { assigneeId: assigneeId || null });
    addActivityEntry(task.id, {
      id: generateId(),
      userId: currentUserId,
      userName: currentUser.name,
      action: assigneeId
        ? `Assigned to ${newAssignee?.name ?? 'unknown'} by ${currentUser.name}`
        : `Unassigned by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleComplete() {
    completeTask(task.id);
    addActivityEntry(task.id, {
      id: generateId(),
      userId: currentUserId,
      userName: currentUser.name,
      action: `Marked complete by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  const selectClass = 'text-[13px] bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage w-full';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-forest leading-snug">{task.title}</h2>
        <p className="text-[11px] text-forest/50 mt-1">
          {task.location} · {task.phase === 'pre' ? 'Pre-camp' : 'Post-camp'} · Logged {formatDate(task.createdAt)}
        </p>
      </div>

      <div className="px-5 py-4 space-y-5 flex-1">
        {/* Status section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Priority</span>
            <PriorityBadge priority={task.priority} />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Phase</span>
            <span className="text-[13px] font-medium text-forest">{task.phase === 'pre' ? 'Pre-camp' : 'Post-camp'}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Recurs</span>
            <span className="text-[13px] font-medium text-forest">Annually</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Status</span>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e.target.value as ChecklistStatus)}
              className={`${selectClass} w-36`}
              disabled={task.status === 'complete'}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Assigned to</span>
            {can('assign') ? (
              <select
                value={task.assigneeId ?? ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className={`${selectClass} w-36`}
              >
                <option value="">Unassigned</option>
                {SEED_USERS.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            ) : assignee ? (
              <span className="text-[13px] font-medium text-forest">{assignee.name}</span>
            ) : (
              <span className="text-[13px] font-medium text-red">Unassigned</span>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Description</p>
          <p className="text-[13px] text-forest/80 leading-relaxed">{task.description}</p>
        </div>

        {/* Due date */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Due date</p>
          <p className="text-[13px] text-forest/80">
            {task.dueDate ? formatDate(task.dueDate) : 'No due date set'}
          </p>
          {task.daysRelativeToOpening < 0 && (
            <p className="text-[11px] text-forest/45 mt-0.5">
              {Math.abs(task.daysRelativeToOpening)} days before opening
            </p>
          )}
          {task.daysRelativeToOpening > 0 && (
            <p className="text-[11px] text-forest/45 mt-0.5">
              {task.daysRelativeToOpening} days after closing
            </p>
          )}
        </div>

        {/* Logged */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Logged</p>
          <p className="text-[13px] text-forest/80">{formatDateTime(task.createdAt)}</p>
        </div>

        {/* Activity */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-2">Activity</p>
          <ActivityFeed entries={task.activityLog} />
        </div>
      </div>

      {/* Footer */}
      {task.status !== 'complete' && (
        <div className="px-5 py-4 border-t border-border">
          <Button size="sm" className="w-full justify-center" onClick={handleComplete}>
            Mark complete
          </Button>
        </div>
      )}
    </div>
  );
}

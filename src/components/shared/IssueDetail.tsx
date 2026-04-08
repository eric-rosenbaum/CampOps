import { useState, useEffect } from 'react';
import type { Issue, IssueStatus } from '@/lib/types';
import { SEED_USERS } from '@/lib/seedData';
import { useIssuesStore } from '@/store/issuesStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { PriorityBadge } from './PriorityBadge';
import { ActivityFeed } from './ActivityFeed';
import { Button } from './Button';
import { formatDate, formatDateTime, generateId } from '@/lib/utils';
import { Camera } from 'lucide-react';

interface Props {
  issue: Issue;
}

export function IssueDetail({ issue }: Props) {
  const { updateIssue, resolveIssue, reopenIssue, addActivityEntry, deleteIssue } = useIssuesStore();
  const { openEditIssueModal } = useUIStore();
  const { currentUser, can } = useAuth();
  const currentUserId = currentUser.id;

  const [showResolveForm, setShowResolveForm] = useState(false);
  const [actualCostInput, setActualCostInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset transient UI state when switching issues
  useEffect(() => {
    setShowResolveForm(false);
    setActualCostInput('');
    setShowDeleteConfirm(false);
  }, [issue.id]);

  const assignee = SEED_USERS.find((u) => u.id === issue.assigneeId);
  const reporter = SEED_USERS.find((u) => u.id === issue.reportedById);

  function handleStatusChange(newStatus: IssueStatus) {
    updateIssue(issue.id, { status: newStatus });
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUserId,
      userName: currentUser.name,
      action: `Status changed to ${newStatus.replace('_', ' ')} by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleAssigneeChange(assigneeId: string) {
    const newAssignee = SEED_USERS.find((u) => u.id === assigneeId);
    const newStatus = assigneeId ? 'assigned' : 'unassigned';
    updateIssue(issue.id, {
      assigneeId: assigneeId || null,
      status: issue.status === 'unassigned' || issue.status === 'assigned' ? newStatus : issue.status,
    });
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUserId,
      userName: currentUser.name,
      action: assigneeId
        ? `Assigned to ${newAssignee?.name ?? 'unknown'} by ${currentUser.name}`
        : `Unassigned by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleResolve() {
    const cost = actualCostInput ? parseFloat(actualCostInput.replace(/[$,]/g, '')) : null;
    resolveIssue(issue.id, cost);
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUserId,
      userName: currentUser.name,
      action: cost != null
        ? `Marked resolved by ${currentUser.name} — actual cost $${cost.toLocaleString()}`
        : `Marked resolved by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
    setShowResolveForm(false);
    setActualCostInput('');
  }

  function handleReopen() {
    reopenIssue(issue.id);
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUserId,
      userName: currentUser.name,
      action: `Reopened by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleDelete() {
    deleteIssue(issue.id);
  }

  const selectClass = 'text-[13px] bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage w-full';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-forest leading-snug">{issue.title}</h2>
        <p className="text-[11px] text-forest/50 mt-1">
          {issue.locations.join(' · ')} · Logged {reporter ? `by ${reporter.name}` : ''} {formatDate(issue.createdAt)}
        </p>
      </div>

      <div className="px-5 py-4 space-y-5 flex-1">
        {/* Status section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Priority</span>
            <PriorityBadge priority={issue.priority} />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Status</span>
            <select
              value={issue.status}
              onChange={(e) => handleStatusChange(e.target.value as IssueStatus)}
              className={`${selectClass} w-36`}
              disabled={issue.status === 'resolved'}
            >
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Assigned to</span>
            {can('assign') ? (
              <select
                value={issue.assigneeId ?? ''}
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
          <p className="text-[13px] text-forest/80 leading-relaxed">{issue.description}</p>
        </div>

        {/* Photo */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Photo</p>
          {issue.photoUrl ? (
            <img src={issue.photoUrl} alt="Issue" className="w-full rounded-card border border-border object-cover max-h-40" />
          ) : (
            <div className="flex items-center gap-2 py-3 px-3 bg-cream rounded-card border border-border text-forest/40">
              <Camera className="w-4 h-4" />
              <span className="text-[12px]">No photo attached</span>
            </div>
          )}
        </div>

        {/* Cost */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Cost</p>
          <div className="space-y-1">
            <div className="flex justify-between text-[13px]">
              <span className="text-forest/60">Estimated</span>
              <span className="font-medium text-forest">{issue.estimatedCostDisplay ?? '—'}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-forest/60">Actual</span>
              {issue.actualCost != null ? (
                <span className="font-medium text-forest">${issue.actualCost.toLocaleString()}</span>
              ) : (
                <span className="text-forest/40 italic">— pending resolution</span>
              )}
            </div>
          </div>
        </div>

        {/* Due date */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Due date</p>
          <p className="text-[13px] text-forest/80">
            {issue.dueDate ? formatDate(issue.dueDate) : 'No due date set'}
          </p>
        </div>

        {/* Logged at */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Logged</p>
          <p className="text-[13px] text-forest/80">{formatDateTime(issue.createdAt)}</p>
        </div>

        {/* Activity log */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-2">Activity</p>
          <ActivityFeed entries={issue.activityLog} />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border space-y-2">
        {showDeleteConfirm ? (
          <div className="space-y-2">
            <p className="text-[12px] text-forest/60 text-center">Delete this issue? This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" className="flex-1 justify-center" onClick={handleDelete}>
                Confirm delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : issue.status === 'resolved' ? (
          <>
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={handleReopen}>
              Reopen issue
            </Button>
            {can('createIssue') && (
              <Button variant="ghost" size="sm" className="w-full justify-center text-red/70 hover:text-red" onClick={() => setShowDeleteConfirm(true)}>
                Delete issue
              </Button>
            )}
          </>
        ) : (
          <>
            {showResolveForm ? (
              <div className="space-y-2">
                {can('enterActualCost') && (
                  <input
                    type="text"
                    placeholder="Actual cost (optional, e.g. 280)"
                    value={actualCostInput}
                    onChange={(e) => setActualCostInput(e.target.value)}
                    className="w-full text-[13px] bg-white border border-border rounded-btn px-3 py-1.5 focus:outline-none focus:border-sage"
                  />
                )}
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 justify-center" onClick={handleResolve}>
                    Confirm resolve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowResolveForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" className="w-full justify-center" onClick={() => setShowResolveForm(true)}>
                Mark resolved
              </Button>
            )}
            {can('createIssue') && !showResolveForm && (
              <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => openEditIssueModal(issue.id)}>
                Edit
              </Button>
            )}
            {can('createIssue') && !showResolveForm && (
              <Button variant="ghost" size="sm" className="w-full justify-center text-red/70 hover:text-red" onClick={() => setShowDeleteConfirm(true)}>
                Delete issue
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

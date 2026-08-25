import { useState, useEffect } from 'react';
import type { Issue, IssueStatus } from '@/lib/types';
import { useCampStore } from '@/store/campStore';
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
  const members = useCampStore((s) => s.members);
  const memberName = (userId: string | null) => userId ? (members.find((m) => m.userId === userId)?.fullName ?? null) : null;

  const [showResolveForm, setShowResolveForm] = useState(false);
  const [actualCostInput, setActualCostInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setShowResolveForm(false);
    setActualCostInput('');
    setShowDeleteConfirm(false);
  }, [issue.id]);

  const assigneeName = memberName(issue.assigneeId);
  const reporterName = issue.isPublicReport
    ? (issue.reporterName ?? 'Anonymous')
    : memberName(issue.reportedById);

  function handleStatusChange(newStatus: IssueStatus) {
    updateIssue(issue.id, { status: newStatus });
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: `Status changed to ${newStatus.replace('_', ' ')} by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleAssigneeChange(assigneeId: string) {
    const newName = assigneeId ? (memberName(assigneeId) ?? 'unknown') : null;
    const newStatus = assigneeId ? 'assigned' : 'unassigned';
    updateIssue(issue.id, {
      assigneeId: assigneeId || null,
      status: issue.status === 'unassigned' || issue.status === 'assigned' ? newStatus : issue.status,
    });
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: assigneeId
        ? `Assigned to ${newName} by ${currentUser.name}`
        : `Unassigned by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleResolve() {
    const cost = actualCostInput ? parseFloat(actualCostInput.replace(/[$,]/g, '')) : null;
    resolveIssue(issue.id, cost);
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: cost != null
        ? `Marked resolved by ${currentUser.name}, actual cost $${cost.toLocaleString()}`
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
      userId: currentUser.id,
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
      <div className="border-b border-border bg-white px-6 pb-4 pt-5">
        <div className="flex items-start gap-2 mb-1">
          <h2 className="flex-1 font-display text-[21px] font-bold leading-[1.2] text-forest">{issue.title}</h2>
          {issue.isPublicReport && (
            <span className="flex-shrink-0 rounded-tag border border-red px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] text-red">
              Public
            </span>
          )}
        </div>
        <p className="text-[12px] text-ink-soft">
          {issue.locations.length > 0 ? `${issue.locations.join(' · ')} · ` : ''}
          Logged {reporterName ? `by ${reporterName}` : ''} {formatDate(issue.createdAt)}
        </p>
      </div>

      <div className="flex-1 space-y-5 px-6 py-5">
        {/* Status section */}
        <div className="space-y-3">
          <div className="flex items-baseline gap-2 pb-1">
            <span className="flex-none text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">Priority</span>
            <span
              className="h-px flex-1 -translate-y-[3px] bg-[repeating-linear-gradient(90deg,#DED3BB_0_4px,transparent_4px_8px)]"
              aria-hidden="true"
            />
            <PriorityBadge priority={issue.priority} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">Status</span>
            <select
              value={issue.status}
              onChange={(e) => handleStatusChange(e.target.value as IssueStatus)}
              className={`${selectClass} w-full`}
              disabled={issue.status === 'resolved'}
            >
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">Assigned to</span>
            {can('assign') ? (
              <select
                value={issue.assigneeId ?? ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className={`${selectClass} w-full`}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.fullName}</option>
                ))}
              </select>
            ) : assigneeName ? (
              <span className="text-[13px] font-medium text-forest">{assigneeName}</span>
            ) : (
              <span className="text-[13px] font-medium text-red">Unassigned</span>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-1.5">Description</p>
          {issue.description ? (
            <p className="text-[13px] text-ink leading-relaxed">{issue.description}</p>
          ) : (
            <p className="text-[13px] text-forest/30 italic">No description provided</p>
          )}
        </div>

        {/* Reporter info, public reports only */}
        {issue.isPublicReport && (issue.reporterName || issue.reporterContact) && (
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-1.5">Reported by</p>
            <div className="space-y-0.5">
              {issue.reporterName && (
                <p className="text-[13px] text-ink">{issue.reporterName}</p>
              )}
              {issue.reporterContact && (
                <p className="text-[13px] text-ink-soft">{issue.reporterContact}</p>
              )}
            </div>
          </div>
        )}

        {/* Photo */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-1.5">Photo</p>
          {issue.photoUrl ? (
            <img src={issue.photoUrl} alt="Issue" className="w-full rounded-card border border-border object-cover max-h-40" />
          ) : (
            <div className="flex items-center gap-2 py-3 px-3 bg-cream rounded-card border border-border text-ink-faint">
              <Camera className="w-4 h-4" />
              <span className="text-[12px]">No photo attached</span>
            </div>
          )}
        </div>

        {/* Cost */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-1.5">Cost</p>
          <div className="space-y-1">
            <div className="flex justify-between text-[13px]">
              <span className="text-ink-soft">Estimated</span>
              <span className="font-medium text-forest">{issue.estimatedCostDisplay ?? '-'}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-ink-soft">Actual</span>
              {issue.actualCost != null ? (
                <span className="font-medium text-forest">${issue.actualCost.toLocaleString()}</span>
              ) : (
                <span className="text-ink-faint italic">pending resolution</span>
              )}
            </div>
          </div>
        </div>

        {/* Due date */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-1.5">Due date</p>
          <p className="text-[13px] text-ink">
            {issue.dueDate ? formatDate(issue.dueDate) : 'No due date set'}
          </p>
        </div>

        {/* Logged at */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-1.5">Logged</p>
          <p className="text-[13px] text-ink">{formatDateTime(issue.createdAt)}</p>
        </div>

        {/* Activity log */}
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-2">Activity</p>
          <ActivityFeed entries={issue.activityLog} />
        </div>
      </div>

      {/* Footer */}
      <div className="space-y-2 border-t border-border px-6 py-5">
        {showDeleteConfirm ? (
          <div className="space-y-2">
            <p className="text-[12px] text-ink-soft text-center">Delete this issue? This cannot be undone.</p>
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

import { useState } from 'react';
import type { ChecklistTask, ChecklistStatus, Priority, Location } from '@/lib/types';
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

const LOCATIONS: Location[] = [
  'Waterfront','Dining Hall','Cabins','Art Barn','Aquatics',
  'Athletic Fields','Main Lodge','Health Center','Other',
];

export function TaskDetail({ task }: Props) {
  const { updateTask, completeTask, addActivityEntry, deleteTask, selectTask } = useChecklistStore();
  const { currentUser, can } = useAuth();
  const currentUserId = currentUser.id;

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description);
  const [editLocation, setEditLocation] = useState<Location>(task.location);
  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editPhase, setEditPhase] = useState<'pre' | 'post'>(task.phase);
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? '');

  const assignee = SEED_USERS.find((u) => u.id === task.assigneeId);

  function handleStatusChange(newStatus: ChecklistStatus) {
    updateTask(task.id, { status: newStatus });
    addActivityEntry(task.id, {
      id: generateId(), userId: currentUserId, userName: currentUser.name,
      action: `Status changed to ${newStatus.replace('_', ' ')} by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleAssigneeChange(assigneeId: string) {
    const newAssignee = SEED_USERS.find((u) => u.id === assigneeId);
    updateTask(task.id, { assigneeId: assigneeId || null });
    addActivityEntry(task.id, {
      id: generateId(), userId: currentUserId, userName: currentUser.name,
      action: assigneeId
        ? `Assigned to ${newAssignee?.name ?? 'unknown'} by ${currentUser.name}`
        : `Unassigned by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleComplete() {
    completeTask(task.id);
    addActivityEntry(task.id, {
      id: generateId(), userId: currentUserId, userName: currentUser.name,
      action: `Marked complete by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
  }

  function handleSaveEdit() {
    updateTask(task.id, {
      title: editTitle.trim(),
      description: editDescription,
      location: editLocation,
      priority: editPriority,
      phase: editPhase,
      dueDate: editDueDate || null,
    });
    addActivityEntry(task.id, {
      id: generateId(), userId: currentUserId, userName: currentUser.name,
      action: `Edited by ${currentUser.name}`,
      timestamp: new Date().toISOString(),
    });
    setIsEditing(false);
  }

  function handleDelete() {
    deleteTask(task.id);
    selectTask(null);
  }

  const selectClass = 'text-[13px] bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage w-full';
  const inputClass = 'text-[13px] bg-white border border-border rounded-btn px-2 py-1.5 focus:outline-none focus:border-sage w-full';

  if (isEditing) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="px-5 pt-5 pb-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-forest">Edit Task</h2>
          <button onClick={() => setIsEditing(false)} className="text-[13px] text-forest/50 hover:text-forest">Cancel</button>
        </div>
        <div className="px-5 py-4 space-y-4 flex-1">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 block mb-1">Title</label>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 block mb-1">Description</label>
            <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
              rows={3} className={`${inputClass} resize-none`} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 block mb-1">Phase</label>
            <select value={editPhase} onChange={(e) => setEditPhase(e.target.value as 'pre' | 'post')} className={selectClass}>
              <option value="pre">Pre-camp</option>
              <option value="post">Post-camp</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 block mb-1">Location</label>
            <select value={editLocation} onChange={(e) => setEditLocation(e.target.value as Location)} className={selectClass}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 block mb-1">Priority</label>
            <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as Priority)} className={selectClass}>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 block mb-1">Due date</label>
            <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border">
          <Button size="sm" className="w-full justify-center" onClick={handleSaveEdit} disabled={!editTitle.trim()}>
            Save changes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-forest leading-snug">{task.title}</h2>
          {can('createTask') && (
            <div className="flex gap-1 shrink-0">
              <button onClick={() => setIsEditing(true)}
                className="text-[12px] text-forest/50 hover:text-forest px-2 py-1 rounded border border-border hover:border-forest/30">
                Edit
              </button>
              <button onClick={() => setShowDeleteConfirm(true)}
                className="text-[12px] text-red-600 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:border-red-400">
                Delete
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-forest/50 mt-1">
          {task.location} · {task.phase === 'pre' ? 'Pre-camp' : 'Post-camp'} · Logged {formatDate(task.createdAt)}
        </p>
      </div>

      {showDeleteConfirm && (
        <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-[13px] text-red-800 font-medium mb-2">Delete this task?</p>
          <p className="text-[12px] text-red-600 mb-3">This action cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={handleDelete}
              className="text-[12px] font-medium bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700">
              Delete
            </button>
            <button onClick={() => setShowDeleteConfirm(false)}
              className="text-[12px] text-forest/60 px-3 py-1.5 rounded border border-border hover:border-forest/30">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="px-5 py-4 space-y-5 flex-1">
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
            <select value={task.status} onChange={(e) => handleStatusChange(e.target.value as ChecklistStatus)}
              className={`${selectClass} w-36`} disabled={task.status === 'complete'}>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forest/50">Assigned to</span>
            {can('assign') ? (
              <select value={task.assigneeId ?? ''} onChange={(e) => handleAssigneeChange(e.target.value)}
                className={`${selectClass} w-36`}>
                <option value="">Unassigned</option>
                {SEED_USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : assignee ? (
              <span className="text-[13px] font-medium text-forest">{assignee.name}</span>
            ) : (
              <span className="text-[13px] font-medium text-red">Unassigned</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Description</p>
          <p className="text-[13px] text-forest/80 leading-relaxed">{task.description}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Due date</p>
          <p className="text-[13px] text-forest/80">{task.dueDate ? formatDate(task.dueDate) : 'No due date set'}</p>
          {task.daysRelativeToOpening < 0 && (
            <p className="text-[11px] text-forest/45 mt-0.5">{Math.abs(task.daysRelativeToOpening)} days before opening</p>
          )}
          {task.daysRelativeToOpening > 0 && (
            <p className="text-[11px] text-forest/45 mt-0.5">{task.daysRelativeToOpening} days after closing</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-1.5">Logged</p>
          <p className="text-[13px] text-forest/80">{formatDateTime(task.createdAt)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest/50 mb-2">Activity</p>
          <ActivityFeed entries={task.activityLog} />
        </div>
      </div>

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

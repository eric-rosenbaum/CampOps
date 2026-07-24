import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { RetreatIssue, RetreatIssueStatus } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';

const PRIORITIES: { value: string; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];
const STATUSES: { value: RetreatIssueStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
];

export function LogIssueModal({ retreatId, issueId }: { retreatId: string; issueId?: string }) {
  const { issuesFor, addIssue, updateIssue, deleteIssue, closeModal } = useRetreatStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const existing = issueId ? issuesFor(retreatId).find((i) => i.id === issueId) ?? null : null;
  const editing = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [reportedBy, setReportedBy] = useState(existing?.reportedBy ?? currentUser.name ?? '');
  const [priority, setPriority] = useState(existing?.priority ?? 'normal');
  const [assignedTo, setAssignedTo] = useState(existing?.assignedTo ?? '');
  const [status, setStatus] = useState<RetreatIssueStatus>(existing?.status ?? 'open');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !canManage) return;
    const now = new Date().toISOString();

    if (editing && existing) {
      const resolvedAt = status === 'resolved' ? existing.resolvedAt ?? now : null;
      updateIssue({
        ...existing,
        title: title.trim(),
        reportedBy: reportedBy.trim() || null,
        priority,
        assignedTo: assignedTo.trim() || null,
        status,
        notes: notes.trim() || null,
        resolvedAt,
        updatedAt: now,
      });
    } else {
      const issue: RetreatIssue = {
        id: generateId(),
        campId: '',
        retreatId,
        title: title.trim(),
        reportedBy: reportedBy.trim() || null,
        priority,
        assignedTo: assignedTo.trim() || null,
        status,
        notes: notes.trim() || null,
        createdAt: now,
        resolvedAt: status === 'resolved' ? now : null,
        updatedAt: now,
      };
      addIssue(issue);
    }
    closeModal();
  }

  function handleDelete() {
    if (!existing || !canManage) return;
    deleteIssue(existing.id);
    closeModal();
  }

  return (
    <Modal title={editing ? 'Update issue' : 'Log issue'} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Issue</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Main lodge projector not connecting" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Reported by</label>
            <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} className={inputClass} placeholder="Name" />
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Assigned to</label>
            <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass} placeholder="Staff member" />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as RetreatIssueStatus)} className={inputClass}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} min-h-[64px] resize-y`} placeholder="Details, resolution, follow-up…" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!title.trim() || !canManage}>
            {editing ? 'Save' : 'Log issue'}
          </Button>
          {editing ? (
            <Button type="button" variant="danger" onClick={handleDelete} disabled={!canManage}>Delete</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

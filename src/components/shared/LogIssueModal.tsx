import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from './Modal';
import { Button } from './Button';
import { useUIStore } from '@/store/uiStore';
import { useIssuesStore } from '@/store/issuesStore';
import { SEED_USERS } from '@/lib/seedData';
import type { Issue, Location, Priority, RecurringInterval } from '@/lib/types';
import { generateId } from '@/lib/utils';

const LOCATIONS: Location[] = [
  'Waterfront', 'Dining Hall', 'Cabins', 'Art Barn', 'Aquatics',
  'Athletic Fields', 'Main Lodge', 'Health Center', 'Other',
];

interface FormValues {
  title: string;
  location: Location;
  priority: Priority;
  description: string;
  assigneeId: string;
  dueDate: string;
  costEstimate: string;
  isRecurring: boolean;
  recurringInterval: RecurringInterval;
}

export function LogIssueModal() {
  const { isLogIssueModalOpen, editingIssueId, closeAllModals, currentUserId } = useUIStore();
  const { addIssue, updateIssue, addActivityEntry, selectIssue, issues } = useIssuesStore();

  const currentUser = SEED_USERS.find((u) => u.id === currentUserId) ?? SEED_USERS[0];
  const editingIssue = editingIssueId ? issues.find((i) => i.id === editingIssueId) : null;

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      priority: 'normal',
      location: 'Waterfront',
      isRecurring: false,
      recurringInterval: 'weekly',
    },
  });

  const isRecurring = watch('isRecurring');

  // Populate form when editing
  useEffect(() => {
    if (editingIssue) {
      reset({
        title: editingIssue.title,
        location: editingIssue.location,
        priority: editingIssue.priority,
        description: editingIssue.description,
        assigneeId: editingIssue.assigneeId ?? '',
        dueDate: editingIssue.dueDate ?? '',
        costEstimate: editingIssue.estimatedCostDisplay ?? '',
        isRecurring: editingIssue.isRecurring,
        recurringInterval: editingIssue.recurringInterval ?? 'weekly',
      });
    } else {
      reset({
        priority: 'normal',
        location: 'Waterfront',
        isRecurring: false,
        recurringInterval: 'weekly',
        title: '',
        description: '',
        assigneeId: '',
        dueDate: '',
        costEstimate: '',
      });
    }
  }, [editingIssue, reset, isLogIssueModalOpen]);

  function parseCost(raw: string): { display: string | null; value: number | null } {
    if (!raw.trim()) return { display: null, value: null };
    const cleaned = raw.replace(/[$,]/g, '');
    if (cleaned.includes('–') || cleaned.includes('-')) {
      const parts = cleaned.split(/[-–]/).map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const avg = (parts[0] + parts[1]) / 2;
        return {
          display: `$${parts[0].toLocaleString()}–${parts[1].toLocaleString()}`,
          value: avg,
        };
      }
    }
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      return { display: `$${num.toLocaleString()}`, value: num };
    }
    return { display: raw, value: null };
  }

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    const assigneeId = data.assigneeId || null;
    const assignee = SEED_USERS.find((u) => u.id === assigneeId);
    const { display, value } = parseCost(data.costEstimate);

    if (editingIssue) {
      updateIssue(editingIssue.id, {
        title: data.title,
        location: data.location,
        priority: data.priority,
        description: data.description,
        assigneeId,
        status: assigneeId ? (editingIssue.status === 'unassigned' ? 'assigned' : editingIssue.status) : editingIssue.status,
        dueDate: data.dueDate || null,
        estimatedCostDisplay: display,
        estimatedCostValue: value,
        isRecurring: data.isRecurring,
        recurringInterval: data.isRecurring ? data.recurringInterval : null,
      });
      addActivityEntry(editingIssue.id, {
        id: generateId(),
        userId: currentUserId,
        userName: currentUser.name,
        action: `Issue edited by ${currentUser.name}`,
        timestamp: now,
      });
    } else {
      const id = generateId();
      const activityLog = [
        {
          id: generateId(),
          userId: currentUserId,
          userName: currentUser.name,
          action: `Issue logged by ${currentUser.name}`,
          timestamp: now,
        },
      ];
      if (assigneeId && assignee) {
        activityLog.push({
          id: generateId(),
          userId: currentUserId,
          userName: currentUser.name,
          action: `Assigned to ${assignee.name} by ${currentUser.name}`,
          timestamp: now,
        });
      }

      const newIssue: Issue = {
        id,
        title: data.title,
        description: data.description,
        location: data.location,
        priority: data.priority,
        status: assigneeId ? 'assigned' : 'unassigned',
        assigneeId,
        reportedById: currentUserId,
        estimatedCostDisplay: display,
        estimatedCostValue: value,
        actualCost: null,
        photoUrl: null,
        dueDate: data.dueDate || null,
        isRecurring: data.isRecurring,
        recurringInterval: data.isRecurring ? data.recurringInterval : null,
        createdAt: now,
        updatedAt: now,
        activityLog,
      };

      addIssue(newIssue);
      selectIssue(id);
    }

    closeAllModals();
  }

  if (!isLogIssueModalOpen) return null;

  const inputClass = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
  const labelClass = 'block text-[12px] font-medium text-forest/70 mb-1';
  const errorClass = 'text-[11px] text-red mt-0.5';

  return (
    <Modal title={editingIssue ? 'Edit issue' : 'Log new issue'} onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className={labelClass}>Title *</label>
          <input
            {...register('title', { required: 'Title is required' })}
            className={inputClass}
            placeholder="Brief description of the issue"
          />
          {errors.title && <p className={errorClass}>{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Location *</label>
            <select {...register('location', { required: true })} className={inputClass}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priority *</label>
            <select {...register('priority', { required: true })} className={inputClass}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            {...register('description')}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Additional details about the issue"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Assign to</label>
            <select {...register('assigneeId')} className={inputClass}>
              <option value="">Unassigned</option>
              {SEED_USERS.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Due date</label>
            <input type="date" {...register('dueDate')} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Cost estimate</label>
          <input
            {...register('costEstimate')}
            className={inputClass}
            placeholder="e.g. $380 or 600-1200"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isRecurring"
            {...register('isRecurring')}
            className="w-3.5 h-3.5 accent-sage"
          />
          <label htmlFor="isRecurring" className="text-[13px] text-forest/70 cursor-pointer">
            Recurring issue
          </label>
        </div>

        {isRecurring && (
          <div>
            <label className={labelClass}>Recurrence interval</label>
            <select {...register('recurringInterval')} className={inputClass}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1 justify-center">
            {editingIssue ? 'Save changes' : 'Log issue'}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

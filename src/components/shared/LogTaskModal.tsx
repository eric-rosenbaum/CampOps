import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useForm, useWatch } from 'react-hook-form';
import { useUIStore } from '@/store/uiStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useCampStore } from '@/store/campStore';
import { useLocationStore } from '@/store/locationStore';
import { LocationPicker } from '@/components/shared/LocationPicker';
import { useAuth } from '@/lib/auth';
import type { ChecklistTask, Priority } from '@/lib/types';
import { generateId, toDateStr, parseDateStr } from '@/lib/utils';
import { addDays } from 'date-fns';
import { getBuckets, bucketValueToString, stringToBucketValue } from '@/lib/timingBuckets';

interface FormValues {
  title: string;
  priority: Priority;
  description: string;
  assigneeId: string;
  phase: 'pre' | 'post';
  timingBucket: string;
  customDate: string;
  moduleTag: string;
}

export function LogTaskModal() {
  const { isLogTaskModalOpen, closeAllModals } = useUIStore();
  const { addTask, season, activePhase } = useChecklistStore();
  const { currentUser, can } = useAuth();
  const members = useCampStore((s) => s.members);

  const [locationIds, setLocationIds] = useState<string[]>([]);

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      priority: 'normal',
      phase: activePhase,
      timingBucket: activePhase === 'post' ? '0' : '-7',
      moduleTag: '',
    },
  });

  const phase = useWatch({ control, name: 'phase' }) as 'pre' | 'post';
  const timingBucket = useWatch({ control, name: 'timingBucket' });
  const isCustomDate = timingBucket === 'custom';
  const buckets = getBuckets(phase);

  useEffect(() => {
    setValue('timingBucket', phase === 'post' ? '0' : '-7');
  }, [phase, setValue]);

  function onSubmit(data: FormValues) {
    if (locationIds.length === 0) return;
    const now = new Date().toISOString();
    const locations = useLocationStore.getState().namesFor(locationIds);
    const isCustom = data.timingBucket === 'custom';
    const daysRel = isCustom ? null : stringToBucketValue(data.timingBucket);

    let dueDate: string | null = null;
    if (isCustom) {
      dueDate = data.customDate || null;
    } else if (daysRel !== null && season) {
      const baseDate = data.phase === 'post' ? season.closingDate : season.openingDate;
      dueDate = toDateStr(addDays(parseDateStr(baseDate), daysRel));
    }

    const task: ChecklistTask = {
      id: generateId(),
      title: data.title,
      description: data.description,
      locationIds,
      locations,
      priority: data.priority,
      status: 'pending',
      assigneeId: data.assigneeId || null,
      phase: data.phase,
      daysRelativeToOpening: daysRel,
      dueDate,
      isRecurring: true,
      moduleTag: data.moduleTag || null,
      createdAt: now,
      updatedAt: now,
      activityLog: [
        {
          id: generateId(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: `Task logged by ${currentUser.name}`,
          timestamp: now,
        },
      ],
    };

    addTask(task);
    closeAllModals();
  }

  if (!isLogTaskModalOpen) return null;

  const inputClass = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
  const labelClass = 'block text-[12px] font-medium text-ink mb-1';
  const errorClass = 'text-[11px] text-red mt-0.5';

  return (
    <Modal title="Add checklist task" onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className={labelClass}>Title *</label>
          <input
            {...register('title', { required: 'Title is required' })}
            className={inputClass}
            placeholder="Task description"
          />
          {errors.title && <p className={errorClass}>{errors.title.message}</p>}
        </div>

        <div>
          <label className={labelClass}>Location * {locationIds.length === 0 && <span className="text-red text-[11px]">Select at least one</span>}</label>
          <LocationPicker value={locationIds} onChange={setLocationIds} />
        </div>

        <div>
          <label className={labelClass}>Priority *</label>
          <select {...register('priority', { required: true })} className={inputClass}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            {...register('description')}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Details about what needs to be done"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Phase *</label>
            <select {...register('phase', { required: true })} className={inputClass}>
              <option value="pre">Pre-camp</option>
              <option value="post">Post-camp</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Timing *</label>
            <select {...register('timingBucket', { required: true })} className={inputClass}>
              {buckets.map((b) => (
                <option key={bucketValueToString(b.value)} value={bucketValueToString(b.value)}>
                  {b.label}
                </option>
              ))}
              <option value="custom">Custom date…</option>
            </select>
            {isCustomDate && (
              <input
                type="date"
                {...register('customDate')}
                className={`${inputClass} mt-2`}
              />
            )}
          </div>
        </div>

        {can('assign') && (
          <div>
            <label className={labelClass}>Assign to</label>
            <select {...register('assigneeId')} className={inputClass}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>Tag as module (optional)</label>
          <select {...register('moduleTag')} className={inputClass}>
            <option value="">General</option>
            <option value="pool">Pool management</option>
            <option value="assets">Assets & vehicles</option>
          </select>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1 justify-center" disabled={locationIds.length === 0}>
            Add task
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

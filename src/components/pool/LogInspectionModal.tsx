import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore } from '@/store/poolStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { InspectionLogEntry, InspectionResult, PoolInspection } from '@/lib/types';

interface FormValues {
  inspectionId: string;
  inspectionDate: string;
  conductedBy: string;
  result: InspectionResult;
  notes: string;
  nextDue: string;
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function LogInspectionModal() {
  const { closeAllModals, logInspectionForId, editingInspectionLogEntryId } = useUIStore();
  const { activeInspections, inspectionLog, addInspectionLog, updateInspectionLog, deleteInspectionLog, activePoolId } = usePoolStore();
  const inspections = activeInspections();
  const { currentUser } = useAuth();

  const editing = editingInspectionLogEntryId
    ? inspectionLog.find((e) => e.id === editingInspectionLogEntryId) ?? null
    : null;

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      inspectionId: editing?.inspectionId ?? logInspectionForId ?? '',
      inspectionDate: editing?.inspectionDate ?? new Date().toISOString().slice(0, 10),
      conductedBy: editing?.conductedBy ?? currentUser.name,
      result: editing?.result ?? 'passed',
      notes: editing?.notes ?? '',
      nextDue: editing?.nextDue ?? '',
    },
  });

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();

    if (editing) {
      updateInspectionLog(editing.id, {
        inspectionId: data.inspectionId,
        inspectionDate: data.inspectionDate,
        conductedBy: data.conductedBy,
        result: data.result,
        notes: data.notes || null,
        nextDue: data.nextDue || null,
      });
      closeAllModals();
      return;
    }

    const entry: InspectionLogEntry = {
      id: generateId(),
      poolId: activePoolId ?? '',
      inspectionId: data.inspectionId,
      inspectionDate: data.inspectionDate,
      conductedBy: data.conductedBy,
      result: data.result,
      notes: data.notes || null,
      nextDue: data.nextDue || null,
      createdAt: now,
    };

    const insp = inspections.find((i) => i.id === data.inspectionId);
    if (insp) {
      const formattedDate = new Date(data.inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const updated: PoolInspection = {
        ...insp,
        status: 'ok',
        lastCompleted: data.inspectionDate,
        nextDue: data.nextDue || insp.nextDue,
        history: [formattedDate, ...insp.history].slice(0, 5),
        updatedAt: now,
      };
      addInspectionLog(entry, updated);
    } else {
      addInspectionLog(entry, null);
    }
    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    deleteInspectionLog(editing.id);
    closeAllModals();
  }

  return (
    <Modal title={editing ? 'Edit inspection record' : 'Log inspection'} onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!editing && (
          <p className="text-secondary text-forest/50 -mt-1">Record a completed inspection or compliance check</p>
        )}

        <div>
          <label className={labelClass}>Inspection type</label>
          <select {...register('inspectionId')} className={inputClass}>
            <option value="">— Select if applicable —</option>
            {inspections.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
            <option value="health_dept">Health dept. water quality</option>
            <option value="aca_waterfront">ACA waterfront safety</option>
            <option value="equipment_monthly">Pool equipment monthly service</option>
            <option value="lifeguard_cert">Lifeguard certification verification</option>
            <option value="pre_season">Pre-season pool opening</option>
            <option value="end_of_season">End-of-season closing</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Inspection date *</label>
            <input {...register('inspectionDate', { required: true })} type="date" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Conducted by *</label>
            <input
              {...register('conductedBy', { required: true })}
              className={inputClass}
              placeholder="Name or organization"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Result *</label>
          <select {...register('result', { required: true })} className={inputClass}>
            <option value="passed">Passed — no issues</option>
            <option value="passed_with_notes">Passed with notes</option>
            <option value="conditional">Conditional — corrections required</option>
            <option value="failed">Failed — pool closed</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Notes / findings</label>
          <textarea
            {...register('notes')}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Document any findings, corrective actions required, or follow-up items…"
          />
        </div>

        <div>
          <label className={labelClass}>Next inspection due</label>
          <input {...register('nextDue')} type="date" className={inputClass} />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : 'Save inspection record'}
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" className="text-red hover:bg-red-bg hover:text-red" onClick={handleDelete}>
              Delete
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

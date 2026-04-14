import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { SafetyInspectionLog, SafetyItem } from '@/lib/types';
import { addDays } from 'date-fns';

interface FormValues {
  itemId: string;
  locationNote: string;
  inspectionDate: string;
  completedBy: string;
  result: SafetyInspectionLog['result'];
  notes: string;
  cost: string;
  nextDue: string;
}

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const lc = 'block text-[12px] font-medium text-forest/70 mb-1';

const RESULT_OPTIONS: { value: SafetyInspectionLog['result']; label: string }[] = [
  { value: 'passed', label: 'Passed — no issues' },
  { value: 'passed_with_notes', label: 'Passed with notes' },
  { value: 'action_taken', label: 'Action taken — resolved' },
  { value: 'failed', label: 'Failed — follow-up required' },
];

export function LogInspectionModal() {
  const { closeAllModals, logInspectionForSafetyItemId, editingInspectionLogId } = useUIStore();
  const { items, inspectionLog, addInspectionLog, updateInspectionLog, deleteInspectionLog } = useSafetyStore();
  const { currentUser } = useAuth();

  const editing = editingInspectionLogId
    ? inspectionLog.find((l) => l.id === editingInspectionLogId) ?? null
    : null;

  const preselectedItem = logInspectionForSafetyItemId
    ? items.find((i) => i.id === logInspectionForSafetyItemId) ?? null
    : editing?.itemId
    ? items.find((i) => i.id === editing.itemId) ?? null
    : null;

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      itemId: editing?.itemId ?? preselectedItem?.id ?? '',
      locationNote: editing?.locationNote ?? preselectedItem?.location ?? '',
      inspectionDate: editing?.inspectionDate ?? new Date().toISOString().slice(0, 10),
      completedBy: editing?.completedBy ?? currentUser.name,
      result: editing?.result ?? 'passed',
      notes: editing?.notes ?? '',
      cost: editing?.cost != null ? String(editing.cost) : '',
      nextDue: editing?.nextDue ?? '',
    },
  });

  const selectedItemId = watch('itemId');
  const selectedItem: SafetyItem | null = items.find((i) => i.id === selectedItemId) ?? null;
  const inspectionDate = watch('inspectionDate');

  // Suggest next due based on selected item's frequency
  const suggestedNextDue = selectedItem && inspectionDate
    ? addDays(new Date(inspectionDate + 'T00:00:00'), selectedItem.frequencyDays).toISOString().slice(0, 10)
    : '';

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();

    if (editing) {
      updateInspectionLog(editing.id, {
        itemId: data.itemId || null,
        locationNote: data.locationNote || selectedItem?.location || '',
        inspectionDate: data.inspectionDate,
        completedBy: data.completedBy,
        result: data.result,
        notes: data.notes || null,
        cost: data.cost ? parseFloat(data.cost) : null,
        nextDue: data.nextDue || null,
      });
    } else {
      const category = selectedItem?.category ?? 'fire';

      const entry: SafetyInspectionLog = {
        id: generateId(),
        itemId: data.itemId || null,
        category,
        locationNote: data.locationNote || selectedItem?.location || '',
        inspectionDate: data.inspectionDate,
        completedBy: data.completedBy,
        result: data.result,
        notes: data.notes || null,
        cost: data.cost ? parseFloat(data.cost) : null,
        nextDue: data.nextDue || null,
        createdAt: now,
      };

      let updatedItem: SafetyItem | undefined;
      if (selectedItem) {
        updatedItem = {
          ...selectedItem,
          lastInspected: data.inspectionDate,
          nextDue: data.nextDue || suggestedNextDue || selectedItem.nextDue,
          updatedAt: now,
        };
      }

      addInspectionLog(entry, updatedItem);
    }

    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    if (!window.confirm('Delete this inspection record? This cannot be undone.')) return;
    deleteInspectionLog(editing.id);
    closeAllModals();
  }

  // Group items by category for the dropdown
  const fireItems = items.filter((i) => i.category === 'fire');
  const waterItems = items.filter((i) => i.category === 'water');
  const kitchenItems = items.filter((i) => i.category === 'kitchen');

  return (
    <Modal title={editing ? 'Edit inspection record' : 'Log inspection'} onClose={closeAllModals} width="480px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!editing && (
          <p className="text-[13px] text-forest/50 -mt-1">Record a completed inspection, corrective action, or compliance event.</p>
        )}

        <div>
          <label className={lc}>Item (optional)</label>
          <select {...register('itemId')} className={ic}>
            <option value="">— General / not linked to an item —</option>
            {fireItems.length > 0 && (
              <optgroup label="Fire safety">
                {fireItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </optgroup>
            )}
            {waterItems.length > 0 && (
              <optgroup label="Water safety">
                {waterItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </optgroup>
            )}
            {kitchenItems.length > 0 && (
              <optgroup label="Kitchen">
                {kitchenItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        <div>
          <label className={lc}>Location / item description</label>
          <input
            {...register('locationNote')}
            className={ic}
            placeholder={selectedItem ? selectedItem.location : 'e.g. Dining hall kitchen, Cabin 4'}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>Date *</label>
            <input {...register('inspectionDate', { required: true })} type="date" className={ic} />
          </div>
          <div>
            <label className={lc}>Completed by *</label>
            <input {...register('completedBy', { required: true })} className={ic} placeholder="Name or vendor" />
          </div>
        </div>

        <div>
          <label className={lc}>Result *</label>
          <select {...register('result', { required: true })} className={ic}>
            {RESULT_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={lc}>Notes / findings</label>
          <textarea
            {...register('notes')}
            className={`${ic} resize-none`}
            rows={3}
            placeholder="Document findings, corrective actions, or follow-up required…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>Cost (if any)</label>
            <input {...register('cost')} type="number" step="0.01" className={ic} placeholder="$0.00" />
          </div>
          <div>
            <label className={lc}>Next due</label>
            <input {...register('nextDue')} type="date" className={ic} />
            {suggestedNextDue && !editing && (
              <p className="text-[10px] text-forest/40 mt-0.5">Suggested: {new Date(suggestedNextDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : 'Save record'}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={handleDelete} className="text-red hover:bg-red-bg">
              Delete
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

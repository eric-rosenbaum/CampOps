import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore } from '@/store/poolStore';
import { generateId } from '@/lib/utils';
import type { ServiceLogEntry, ServiceType } from '@/lib/types';

interface FormValues {
  equipmentId: string;
  serviceType: ServiceType;
  datePerformed: string;
  performedBy: string;
  notes: string;
  cost: string;
  nextServiceDue: string;
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function LogServiceModal() {
  const { closeAllModals, logServiceForEquipmentId, editingServiceLogId } = useUIStore();
  const { activeEquipment, serviceLog, addServiceLog, updateServiceLog, deleteServiceLog, activePoolId } = usePoolStore();
  const equipment = activeEquipment();

  const editing = editingServiceLogId
    ? serviceLog.find((e) => e.id === editingServiceLogId) ?? null
    : null;

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: {
      equipmentId: editing?.equipmentId ?? logServiceForEquipmentId ?? '',
      serviceType: editing?.serviceType ?? 'routine_maintenance',
      datePerformed: editing?.datePerformed ?? new Date().toISOString().slice(0, 10),
      performedBy: editing?.performedBy ?? '',
      notes: editing?.notes ?? '',
      cost: editing?.cost != null ? String(editing.cost) : '',
      nextServiceDue: editing?.nextServiceDue ?? '',
    },
  });

  function onSubmit(data: FormValues) {
    const parsed: Partial<ServiceLogEntry> = {
      equipmentId: data.equipmentId,
      serviceType: data.serviceType,
      datePerformed: data.datePerformed,
      performedBy: data.performedBy,
      notes: data.notes || null,
      cost: data.cost ? parseFloat(data.cost.replace(/[$,]/g, '')) : null,
      nextServiceDue: data.nextServiceDue || null,
    };

    if (editing) {
      updateServiceLog(editing.id, parsed);
    } else {
      addServiceLog({
        id: generateId(),
        poolId: activePoolId ?? '',
        equipmentId: data.equipmentId,
        serviceType: data.serviceType,
        datePerformed: data.datePerformed,
        performedBy: data.performedBy,
        notes: data.notes || null,
        cost: parsed.cost ?? null,
        nextServiceDue: data.nextServiceDue || null,
        createdAt: new Date().toISOString(),
      });
    }
    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    if (window.confirm('Delete this service record? This cannot be undone.')) {
      deleteServiceLog(editing.id);
      closeAllModals();
    }
  }

  return (
    <Modal
      title={editing ? 'Edit service record' : 'Log equipment service'}
      onClose={closeAllModals}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!editing && (
          <p className="text-secondary text-forest/50 -mt-1">Record a service, maintenance, or repair event</p>
        )}

        <div>
          <label className={labelClass}>Equipment *</label>
          <select {...register('equipmentId', { required: true })} className={inputClass}>
            <option value="">Select equipment…</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Service type *</label>
            <select {...register('serviceType', { required: true })} className={inputClass}>
              <option value="routine_maintenance">Routine maintenance</option>
              <option value="repair">Repair</option>
              <option value="inspection">Inspection</option>
              <option value="part_replacement">Part replacement</option>
              <option value="vendor_service">Vendor service</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Date performed *</label>
            <input {...register('datePerformed', { required: true })} type="date" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Performed by *</label>
          <input
            {...register('performedBy', { required: true })}
            className={inputClass}
            placeholder="Name or vendor"
          />
          {errors.performedBy && <p className="text-meta text-red mt-0.5">Required</p>}
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            {...register('notes')}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Describe what was done, any findings, parts replaced…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cost</label>
            <input {...register('cost')} className={inputClass} placeholder="$0" />
          </div>
          <div>
            <label className={labelClass}>Next service due</label>
            <input {...register('nextServiceDue')} type="date" className={inputClass} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : 'Save service record'}
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-red hover:bg-red-bg hover:text-red"
              onClick={handleDelete}
            >
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

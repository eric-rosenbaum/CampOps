import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore } from '@/store/poolStore';
import { generateId } from '@/lib/utils';
import type { PoolEquipment, EquipmentType } from '@/lib/types';

interface FormValues {
  name: string;
  type: EquipmentType;
  manufacturer: string;
  installDate: string;
  vendor: string;
  serviceFrequency: string;
  notes: string;
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function AddEquipmentModal() {
  const { closeAllModals } = useUIStore();
  const { addEquipment } = usePoolStore();

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: { type: 'pump', serviceFrequency: 'monthly' },
  });

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    const equip: PoolEquipment = {
      id: generateId(),
      name: data.name,
      type: data.type,
      status: 'ok',
      statusDetail: 'Normal',
      lastServiced: data.installDate || null,
      nextServiceDue: null,
      vendor: data.vendor || null,
      specs: data.manufacturer || null,
      createdAt: now,
      updatedAt: now,
    };
    addEquipment(equip);
    closeAllModals();
  }

  return (
    <Modal title="Add equipment" onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-secondary text-forest/50 -mt-1">Add a piece of pool equipment to track</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Equipment name *</label>
            <input
              {...register('name', { required: 'Name is required' })}
              className={inputClass}
              placeholder="e.g. Main circulation pump"
            />
            {errors.name && <p className="text-meta text-red mt-0.5">{errors.name.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Type *</label>
            <select {...register('type', { required: true })} className={inputClass}>
              <option value="pump">Pump</option>
              <option value="filter">Filter</option>
              <option value="heater">Heater</option>
              <option value="chlorinator">Chlorinator</option>
              <option value="safety">Safety equipment</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Manufacturer / specs</label>
            <input
              {...register('manufacturer')}
              className={inputClass}
              placeholder="Brand / model / size"
            />
          </div>
          <div>
            <label className={labelClass}>Install / last service date</label>
            <input {...register('installDate')} type="date" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Service vendor</label>
            <input {...register('vendor')} className={inputClass} placeholder="Vendor name" />
          </div>
          <div>
            <label className={labelClass}>Service frequency</label>
            <select {...register('serviceFrequency')} className={inputClass}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
              <option value="as_needed">As needed</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            {...register('notes')}
            className={`${inputClass} resize-none`}
            rows={2}
            placeholder="Any additional details about this equipment…"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            Add equipment
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

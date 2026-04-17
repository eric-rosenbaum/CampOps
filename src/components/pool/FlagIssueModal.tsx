import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore } from '@/store/poolStore';
import type { EquipmentStatus } from '@/lib/types';

interface FormValues {
  status: 'warn' | 'alert';
  detail: string;
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function FlagIssueModal() {
  const { closeAllModals, flagIssueEquipmentId } = useUIStore();
  const { equipment, updateEquipment } = usePoolStore();

  const equip = equipment.find((e) => e.id === flagIssueEquipmentId) ?? null;
  const hasExistingIssue = equip && (equip.status === 'warn' || equip.status === 'alert');

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: {
      status: (equip?.status === 'warn' || equip?.status === 'alert') ? equip.status : 'warn',
      detail: equip?.statusDetail ?? '',
    },
  });

  function onSubmit(data: FormValues) {
    if (!equip) return;
    updateEquipment({
      ...equip,
      status: data.status as EquipmentStatus,
      statusDetail: data.detail,
      updatedAt: new Date().toISOString(),
    });
    closeAllModals();
  }

  function handleClear() {
    if (!equip) return;
    updateEquipment({
      ...equip,
      status: 'ok',
      statusDetail: 'Normal',
      updatedAt: new Date().toISOString(),
    });
    closeAllModals();
  }

  if (!equip) return null;

  return (
    <Modal
      title={hasExistingIssue ? `Edit issue — ${equip.name}` : `Flag issue — ${equip.name}`}
      onClose={closeAllModals}
      width="440px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {hasExistingIssue ? (
          <div className="bg-amber-bg border border-amber/30 rounded-card px-4 py-3 -mt-1">
            <p className="text-secondary text-amber-text font-medium">
              Current issue: <span className="font-normal">{equip.statusDetail || 'No detail recorded'}</span>
            </p>
          </div>
        ) : (
          <p className="text-secondary text-forest/50 -mt-1">
            Record an equipment issue. This will update the status on the equipment card.
          </p>
        )}

        <div>
          <label className={labelClass}>Severity *</label>
          <select {...register('status', { required: true })} className={inputClass}>
            <option value="warn">Warning — service needed soon</option>
            <option value="alert">Alert — out of service / needs repair</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Issue description *</label>
          <textarea
            {...register('detail', { required: 'Description is required' })}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Describe the issue — what's wrong, when it was noticed, any immediate action taken…"
          />
          {errors.detail && <p className="text-meta text-red mt-0.5">{errors.detail.message}</p>}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {hasExistingIssue ? 'Update issue' : 'Flag issue'}
          </Button>
          {hasExistingIssue && (
            <Button
              type="button"
              variant="ghost"
              className="text-green-muted-text hover:bg-green-muted-bg"
              onClick={handleClear}
            >
              Clear issue
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

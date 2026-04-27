import { useForm } from 'react-hook-form';
import { Modal } from './Modal';
import { Button } from './Button';
import { useUIStore } from '@/store/uiStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';

interface FormValues {
  name: string;
  openingDate: string;
  closingDate: string;
  acaInspectionDate: string;
}

export function SeasonModal() {
  const { isSeasonModalOpen, closeAllModals } = useUIStore();
  const { activateNewSeason, season } = useChecklistStore();
  const { currentUser } = useAuth();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: season ? `Summer ${new Date().getFullYear() + 1}` : 'Summer 2026',
    },
  });

  function onSubmit(data: FormValues) {
    activateNewSeason(
      {
        id: `s${Date.now()}`,
        name: data.name,
        openingDate: data.openingDate,
        closingDate: data.closingDate,
        acaInspectionDate: data.acaInspectionDate || null,
      },
      currentUser.name,
    );
    closeAllModals();
  }

  if (!isSeasonModalOpen) return null;

  const inputClass = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
  const labelClass = 'block text-[12px] font-medium text-forest/70 mb-1';
  const errorClass = 'text-[11px] text-red mt-0.5';

  return (
    <Modal title="New season" onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-[13px] text-forest/60 bg-amber-bg border border-amber/20 rounded-btn px-3 py-2">
          This will reset all checklist task statuses to Pending and recompute due dates.
        </p>

        <div>
          <label className={labelClass}>Season name *</label>
          <input
            {...register('name', { required: 'Season name is required' })}
            className={inputClass}
            placeholder="e.g. Summer 2026"
          />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Opening date *</label>
            <input
              type="date"
              {...register('openingDate', { required: 'Required' })}
              className={inputClass}
            />
            {errors.openingDate && <p className={errorClass}>{errors.openingDate.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Closing date *</label>
            <input
              type="date"
              {...register('closingDate', { required: 'Required' })}
              className={inputClass}
            />
            {errors.closingDate && <p className={errorClass}>{errors.closingDate.message}</p>}
          </div>
        </div>

        <div>
          <label className={labelClass}>ACA inspection date (optional)</label>
          <input
            type="date"
            {...register('acaInspectionDate')}
            className={inputClass}
          />
          <p className="text-[11px] text-forest/40 mt-1">If your camp has an upcoming ACA accreditation visit, enter the date to track it in Safety & Compliance.</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1 justify-center">
            Activate new season
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

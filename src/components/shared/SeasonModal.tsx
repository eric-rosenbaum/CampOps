import { useForm } from 'react-hook-form';
import { Modal } from './Modal';
import { Button } from './Button';
import { useUIStore } from '@/store/uiStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useTranslation } from 'react-i18next';

interface FormValues {
  name: string;
  openingDate: string;
  closingDate: string;
  acaInspectionDate: string;
}

export function SeasonModal() {
  const { t } = useTranslation(['shell', 'common']);
  const { isSeasonModalOpen, closeAllModals } = useUIStore();
  const { editSeason, season } = useChecklistStore();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: t('season.defaultName', { year: season ? new Date().getFullYear() + 1 : 2026 }),
    },
  });

  function onSubmit(data: FormValues) {
    // Starting a season used to also reset every Pre/Post Camp task to pending and recompute
    // its due date off the new opening. That module is gone; a season is now just dates.
    editSeason({
      id: crypto.randomUUID(),
      name: data.name,
      openingDate: data.openingDate,
      closingDate: data.closingDate,
      acaInspectionDate: data.acaInspectionDate || null,
    });
    closeAllModals();
  }

  if (!isSeasonModalOpen) return null;

  const inputClass = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
  const labelClass = 'block text-[12px] font-medium text-ink mb-1';
  const errorClass = 'text-[11px] text-red mt-0.5';

  return (
    <Modal title={t('season.title')} onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-[13px] text-ink-soft bg-amber-bg border border-amber/20 rounded-btn px-3 py-2">
          {t('season.warning')}
        </p>

        <div>
          <label className={labelClass}>{t('season.name')} *</label>
          <input
            {...register('name', { required: t('season.nameRequired') })}
            className={inputClass}
            placeholder={t('season.namePlaceholder', { year: 2026 })}
          />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('season.opening')} *</label>
            <input
              type="date"
              {...register('openingDate', { required: t('season.required') })}
              className={inputClass}
            />
            {errors.openingDate && <p className={errorClass}>{errors.openingDate.message}</p>}
          </div>
          <div>
            <label className={labelClass}>{t('season.closing')} *</label>
            <input
              type="date"
              {...register('closingDate', { required: t('season.required') })}
              className={inputClass}
            />
            {errors.closingDate && <p className={errorClass}>{errors.closingDate.message}</p>}
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('season.aca')}</label>
          <input
            type="date"
            {...register('acaInspectionDate')}
            className={inputClass}
          />
          <p className="text-[11px] text-ink-faint mt-1">{t('season.acaHint')}</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1 justify-center">
            {t('season.activate')}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>
            {t('common:actions.cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

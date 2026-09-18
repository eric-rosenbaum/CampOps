import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore } from '@/store/safetyStore';
import { generateId } from '@/lib/utils';
import { useScreenTranslation } from '@/components/i18n/untranslated';
import type { SafetyStaff } from '@/lib/types';

interface FormValues {
  name: string;
  title: string;
  isActive: boolean;
  dateOfBirth: string;
  sex: string;
  education: string;
  qualifyingExperience: string;
  professionalLicenseNumber: string;
}

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const lc = 'block text-[12px] font-medium text-ink mb-1';

export function AddStaffModal() {
  const { closeAllModals, editingSafetyStaffId } = useUIStore();
  const { staff, addStaff, updateStaff, deleteStaff } = useSafetyStore();
  // Opened from Camp Info (translated) and from Safety and Compliance (still English), so it
  // speaks whichever language the page around it does.
  const { t } = useScreenTranslation('staff');
  const { t: tc } = useScreenTranslation('common');

  const editing = editingSafetyStaffId
    ? staff.find((s) => s.id === editingSafetyStaffId) ?? null
    : null;

  /**
   * The permit details are folded away by default.
   *
   * A camp adds a kitchen porter and a lifeguard through this same dialog, and only the
   * lifeguard's date of birth is ever printed on anything. Putting five more inputs above the
   * save button for every hire makes the common case worse to serve the rare one. Folded, the
   * dialog stays the two fields it was, and the extra work is one labelled click away.
   *
   * It opens by itself when the person already has any of it, because a value nobody can see
   * is a value nobody can correct.
   */
  const hasPermitDetails = Boolean(
    editing && (editing.dateOfBirth || editing.sex || editing.education
      || editing.qualifyingExperience || editing.professionalLicenseNumber),
  );
  const [showPermitDetails, setShowPermitDetails] = useState(hasPermitDetails);

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      title: editing?.title ?? '',
      isActive: editing?.isActive ?? true,
      dateOfBirth: editing?.dateOfBirth ?? '',
      sex: editing?.sex ?? '',
      education: editing?.education ?? '',
      qualifyingExperience: editing?.qualifyingExperience ?? '',
      professionalLicenseNumber: editing?.professionalLicenseNumber ?? '',
    },
  });

  function handleDelete() {
    if (!editing) return;
    if (!window.confirm(t('form.confirmDelete', { name: editing.name }))) return;
    deleteStaff(editing.id);
    closeAllModals();
  }

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    // An empty input is no answer, not an empty answer. Stored as null so the form builders can
    // tell "we do not know this person's date of birth" from "this person has one".
    const permit = {
      dateOfBirth: data.dateOfBirth || null,
      sex: data.sex || null,
      education: data.education.trim() || null,
      qualifyingExperience: data.qualifyingExperience.trim() || null,
      professionalLicenseNumber: data.professionalLicenseNumber.trim() || null,
    };

    if (editing) {
      updateStaff(editing.id, {
        name: data.name,
        title: data.title,
        isActive: data.isActive,
        ...permit,
      });
    } else {
      const member: SafetyStaff = {
        id: generateId(),
        name: data.name,
        title: data.title,
        isActive: true,
        ...permit,
        createdAt: now,
        updatedAt: now,
      };
      addStaff(member);
    }
    closeAllModals();
  }

  return (
    <Modal title={editing ? t('form.titleEdit') : t('form.titleAdd')} onClose={closeAllModals} width="420px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-[13px] text-ink-soft -mt-1">
          {t('form.intro')}
        </p>

        <div>
          <label className={lc}>{t('form.name')}</label>
          <input
            {...register('name', { required: true })}
            className={`${ic} ${errors.name ? 'border-red' : ''}`}
            placeholder={t('form.namePlaceholder')}
          />
          {errors.name && <p className="text-[11px] text-red mt-1">{t('form.nameRequired')}</p>}
        </div>

        <div>
          <label className={lc}>{t('form.title')}</label>
          <input
            {...register('title', { required: true })}
            className={`${ic} ${errors.title ? 'border-red' : ''}`}
            placeholder={t('form.titlePlaceholder')}
          />
          {errors.title && <p className="text-[11px] text-red mt-1">{t('form.titleRequired')}</p>}
        </div>

        {editing && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isActive"
              {...register('isActive')}
              className="w-4 h-4 accent-sage cursor-pointer"
            />
            <label htmlFor="isActive" className="text-[13px] text-ink cursor-pointer">
              {t('form.active')}
            </label>
          </div>
        )}

        <div className="border-t border-cream-dark pt-3">
          <button
            type="button"
            onClick={() => setShowPermitDetails((v) => !v)}
            className="w-full flex items-center justify-between text-start cursor-pointer"
          >
            <span>
              <span className="block text-[12px] font-medium text-ink">{t('form.permitHeading')}</span>
              <span className="block text-[11px] text-ink-faint mt-0.5">
                {t('form.permitHint')}
              </span>
            </span>
            {showPermitDetails
              ? <ChevronUp className="w-4 h-4 text-forest/40 flex-shrink-0 ms-3" />
              : <ChevronDown className="w-4 h-4 text-forest/40 flex-shrink-0 ms-3" />}
          </button>

          {showPermitDetails && (
            <div className="mt-4 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {t('form.everyCertified')}
              </p>

              <div>
                <label className={lc}>{t('form.dob')}</label>
                <input type="date" {...register('dateOfBirth')} className={ic} dir="ltr" />
                <p className="text-[11px] text-ink-faint mt-1 leading-relaxed">
                  {t('form.dobHelp')}
                </p>
              </div>

              <div>
                <label className={lc}>{t('form.sex')}</label>
                <select {...register('sex')} className={ic}>
                  <option value="">{t('form.sexNotRecorded')}</option>
                  <option value="male">{t('form.male')}</option>
                  <option value="female">{t('form.female')}</option>
                </select>
                <p className="text-[11px] text-ink-faint mt-1">
                  {t('form.sexHelp')}
                </p>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint pt-1">
                {t('form.directorsOnly')}
              </p>

              <div>
                <label className={lc}>{t('form.education')}</label>
                <input
                  {...register('education')}
                  className={ic}
                  placeholder={t('form.educationPlaceholder')}
                />
              </div>

              <div>
                <label className={lc}>{t('form.experience')}</label>
                <textarea
                  {...register('qualifyingExperience')}
                  rows={2}
                  className={`${ic} resize-none`}
                  placeholder={t('form.experiencePlaceholder')}
                />
              </div>

              <div>
                <label className={lc}>{t('form.license')}</label>
                <input
                  {...register('professionalLicenseNumber')}
                  className={ic}
                  placeholder={t('form.licensePlaceholder')}
                />
                <p className="text-[11px] text-ink-faint mt-1">
                  {t('form.licenseHelp')}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? t('form.saveChanges') : t('form.add')}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>{tc('actions.cancel')}</Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={handleDelete} className="text-red hover:bg-red-bg">
              {tc('actions.delete')}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

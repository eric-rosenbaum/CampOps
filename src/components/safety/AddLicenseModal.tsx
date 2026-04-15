import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore } from '@/store/safetyStore';
import { generateId } from '@/lib/utils';
import type { SafetyLicense, LicenseType } from '@/lib/types';

interface FormValues {
  name: string;
  licenseType: LicenseType;
  issuingAuthority: string;
  licenseNumber: string;
  issuedDate: string;
  expiryDate: string;
  notes: string;
}

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const lc = 'block text-[12px] font-medium text-forest/70 mb-1';

const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  health_permit: 'Health permit',
  state_camping: 'State camping license',
  food_service: 'Food service license',
  boating: 'Boating / watercraft permit',
  aca_accreditation: 'ACA accreditation',
  other: 'Other',
};

const LICENSE_TYPE_PLACEHOLDERS: Record<LicenseType, string> = {
  health_permit: 'e.g. County Health Permit',
  state_camping: 'e.g. State Youth Camp License',
  food_service: 'e.g. Food Service Permit',
  boating: 'e.g. Boating Facility Permit',
  aca_accreditation: 'e.g. ACA Camp Accreditation',
  other: 'License or permit name',
};

export function AddLicenseModal() {
  const { closeAllModals, editingLicenseId } = useUIStore();
  const { licenses, addLicense, updateLicense, deleteLicense } = useSafetyStore();

  const editing = editingLicenseId
    ? licenses.find((l) => l.id === editingLicenseId) ?? null
    : null;

  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      licenseType: editing?.licenseType ?? 'health_permit',
      issuingAuthority: editing?.issuingAuthority ?? '',
      licenseNumber: editing?.licenseNumber ?? '',
      issuedDate: editing?.issuedDate ?? '',
      expiryDate: editing?.expiryDate ?? '',
      notes: editing?.notes ?? '',
    },
  });

  const licenseType = watch('licenseType');

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    if (editing) {
      updateLicense(editing.id, {
        name: data.name,
        licenseType: data.licenseType,
        issuingAuthority: data.issuingAuthority || null,
        licenseNumber: data.licenseNumber || null,
        issuedDate: data.issuedDate || null,
        expiryDate: data.expiryDate || null,
        notes: data.notes || null,
      });
    } else {
      const lic: SafetyLicense = {
        id: generateId(),
        name: data.name,
        licenseType: data.licenseType,
        issuingAuthority: data.issuingAuthority || null,
        licenseNumber: data.licenseNumber || null,
        issuedDate: data.issuedDate || null,
        expiryDate: data.expiryDate || null,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      };
      addLicense(lic);
    }
    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.name}"? This cannot be undone.`)) return;
    deleteLicense(editing.id);
    closeAllModals();
  }

  return (
    <Modal
      title={editing ? 'Edit permit / license' : 'Add permit or license'}
      onClose={closeAllModals}
      width="460px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className={lc}>License type *</label>
          <select {...register('licenseType', { required: true })} className={ic}>
            {Object.entries(LICENSE_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={lc}>Name / description *</label>
          <input
            {...register('name', { required: true })}
            className={errors.name ? ic.replace('border-border', 'border-red') : ic}
            placeholder={LICENSE_TYPE_PLACEHOLDERS[licenseType]}
          />
          {errors.name && <p className="text-[11px] text-red mt-1">Name is required.</p>}
        </div>

        <div>
          <label className={lc}>Issuing authority</label>
          <input
            {...register('issuingAuthority')}
            className={ic}
            placeholder="e.g. County Health Department, State of California"
          />
        </div>

        <div>
          <label className={lc}>License / permit number</label>
          <input
            {...register('licenseNumber')}
            className={ic}
            placeholder="e.g. HP-2024-00123"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>Issued date</label>
            <input {...register('issuedDate')} type="date" className={ic} />
          </div>
          <div>
            <label className={lc}>Expiry date</label>
            <input {...register('expiryDate')} type="date" className={ic} />
          </div>
        </div>

        <div>
          <label className={lc}>Notes</label>
          <textarea
            {...register('notes')}
            className={`${ic} resize-none`}
            rows={2}
            placeholder="Renewal requirements, contact info, or any other details…"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : 'Add license'}
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

import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore, CERT_TYPE_LABELS } from '@/store/safetyStore';
import { generateId } from '@/lib/utils';
import type { StaffCertification, CertType } from '@/lib/types';

interface FormValues {
  staffId: string;
  certType: CertType;
  certName: string;
  issuedDate: string;
  expiryDate: string;
  provider: string;
  notes: string;
}

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const lc = 'block text-[12px] font-medium text-forest/70 mb-1';

const CERT_TYPE_DEFAULTS: Record<CertType, string> = {
  cpr_aed: 'CPR / AED Certification',
  mandatory_reporter: 'Mandatory Reporter Training',
  lifeguard: 'Lifeguard Certification',
  first_aid: 'First Aid Certification',
  wsi: 'Water Safety Instructor (WSI)',
  other: '',
};

export function StaffCertModal() {
  const { closeAllModals, editingStaffCertId, staffCertForStaffId } = useUIStore();
  const { staff, certifications, addCert, updateCert, deleteCert } = useSafetyStore();

  const editing = editingStaffCertId
    ? certifications.find((c) => c.id === editingStaffCertId) ?? null
    : null;

  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      staffId: editing?.staffId ?? staffCertForStaffId ?? (staff[0]?.id ?? ''),
      certType: editing?.certType ?? 'cpr_aed',
      certName: editing?.certName ?? CERT_TYPE_DEFAULTS['cpr_aed'],
      issuedDate: editing?.issuedDate ?? '',
      expiryDate: editing?.expiryDate ?? '',
      provider: editing?.provider ?? '',
      notes: editing?.notes ?? '',
    },
  });

  const certType = watch('certType');

  function handleCertTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const type = e.target.value as CertType;
    setValue('certType', type);
    if (!editing) {
      setValue('certName', CERT_TYPE_DEFAULTS[type] ?? '');
    }
  }

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();

    if (editing) {
      updateCert(editing.id, {
        certType: data.certType,
        certName: data.certName,
        issuedDate: data.issuedDate || null,
        expiryDate: data.expiryDate || null,
        provider: data.provider || null,
        notes: data.notes || null,
      });
    } else {
      const cert: StaffCertification = {
        id: generateId(),
        staffId: data.staffId,
        certType: data.certType,
        certName: data.certName,
        issuedDate: data.issuedDate || null,
        expiryDate: data.expiryDate || null,
        provider: data.provider || null,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      };
      addCert(cert);
    }
    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    deleteCert(editing.id);
    closeAllModals();
  }

  const activeStaff = staff.filter((s) => s.isActive);

  return (
    <Modal title={editing ? 'Edit certification' : 'Add certification'} onClose={closeAllModals} width="480px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!editing && (
          <div>
            <label className={lc}>Staff member *</label>
            <select {...register('staffId', { required: true })} className={ic}>
              {activeStaff.length === 0 && <option value="">No staff added yet</option>}
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.title}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={lc}>Certification type *</label>
          <select
            {...register('certType', { required: true })}
            className={ic}
            onChange={handleCertTypeChange}
          >
            {Object.entries(CERT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={lc}>Certification name *</label>
          <input
            {...register('certName', { required: true })}
            className={ic}
            placeholder={
              certType === 'lifeguard' ? 'e.g. Red Cross Lifeguarding' :
              certType === 'cpr_aed' ? 'e.g. Red Cross CPR/AED for Professionals' :
              certType === 'mandatory_reporter' ? 'e.g. Praesidium Guardian — Child Abuse Prevention' :
              'Certification name'
            }
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
          <label className={lc}>Issuing organization / provider</label>
          <input {...register('provider')} className={ic} placeholder="e.g. American Red Cross, State of California" />
        </div>

        <div>
          <label className={lc}>Notes</label>
          <textarea {...register('notes')} className={`${ic} resize-none`} rows={2} placeholder="Certificate number, verification link, or any notes…" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting || (!editing && activeStaff.length === 0)}>
            {editing ? 'Save changes' : 'Add certification'}
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

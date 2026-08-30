import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore } from '@/store/safetyStore';
import { generateId } from '@/lib/utils';
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
    if (!window.confirm(`Remove ${editing.name} from staff? This will delete all their certifications.`)) return;
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
    <Modal title={editing ? 'Edit staff member' : 'Add staff member'} onClose={closeAllModals} width="420px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-[13px] text-ink-soft -mt-1">
          Staff members added here can be tracked for certifications and training compliance.
        </p>

        <div>
          <label className={lc}>Full name *</label>
          <input
            {...register('name', { required: true })}
            className={`${ic} ${errors.name ? 'border-red' : ''}`}
            placeholder="e.g. Alex Rivera"
          />
          {errors.name && <p className="text-[11px] text-red mt-1">Name is required.</p>}
        </div>

        <div>
          <label className={lc}>Title / role *</label>
          <input
            {...register('title', { required: true })}
            className={`${ic} ${errors.title ? 'border-red' : ''}`}
            placeholder="e.g. Head Lifeguard, Counselor, Cook"
          />
          {errors.title && <p className="text-[11px] text-red mt-1">Title is required.</p>}
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
              Active staff member
            </label>
          </div>
        )}

        <div className="border-t border-cream-dark pt-3">
          <button
            type="button"
            onClick={() => setShowPermitDetails((v) => !v)}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <span>
              <span className="block text-[12px] font-medium text-ink">Details the permit forms ask for</span>
              <span className="block text-[11px] text-ink-faint mt-0.5">
                Optional. Leave blank and the form prints a blank line for someone to write on.
              </span>
            </span>
            {showPermitDetails
              ? <ChevronUp className="w-4 h-4 text-forest/40 flex-shrink-0 ml-3" />
              : <ChevronDown className="w-4 h-4 text-forest/40 flex-shrink-0 ml-3" />}
          </button>

          {showPermitDetails && (
            <div className="mt-4 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Asked about every certified staff member
              </p>

              <div>
                <label className={lc}>Date of birth</label>
                <input type="date" {...register('dateOfBirth')} className={ic} />
                <p className="text-[11px] text-ink-faint mt-1 leading-relaxed">
                  DOH-367a prints this beside every lifeguard and first aid certification. It is
                  personal information about an employee, and anyone with access to this camp can
                  see it.
                </p>
              </div>

              <div>
                <label className={lc}>Sex</label>
                <select {...register('sex')} className={ic}>
                  <option value="">Not recorded</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <p className="text-[11px] text-ink-faint mt-1">
                  The counselor table on DOH-367a counts staff as male or female. Those are the
                  only two columns the state prints.
                </p>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint pt-1">
                Asked only about the camp, health and aquatics directors
              </p>

              <div>
                <label className={lc}>Education</label>
                <input
                  {...register('education')}
                  className={ic}
                  placeholder="e.g. BS Recreation Management, SUNY Cortland 2014"
                />
              </div>

              <div>
                <label className={lc}>Qualifying experience</label>
                <textarea
                  {...register('qualifyingExperience')}
                  rows={2}
                  className={`${ic} resize-none`}
                  placeholder="e.g. Six seasons as unit head at a NYS children's camp"
                />
              </div>

              <div>
                <label className={lc}>Professional license number</label>
                <input
                  {...register('professionalLicenseNumber')}
                  className={ic}
                  placeholder="e.g. NYS RN 123456"
                />
                <p className="text-[11px] text-ink-faint mt-1">
                  DOH-367 asks the health director for a NYS license number.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : 'Add staff member'}
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

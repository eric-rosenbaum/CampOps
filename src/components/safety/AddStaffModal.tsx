import { useForm } from 'react-hook-form';
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
}

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const lc = 'block text-[12px] font-medium text-forest/70 mb-1';

export function AddStaffModal() {
  const { closeAllModals, editingSafetyStaffId } = useUIStore();
  const { staff, addStaff, updateStaff, deleteStaff } = useSafetyStore();

  const editing = editingSafetyStaffId
    ? staff.find((s) => s.id === editingSafetyStaffId) ?? null
    : null;

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      title: editing?.title ?? '',
      isActive: editing?.isActive ?? true,
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

    if (editing) {
      updateStaff(editing.id, {
        name: data.name,
        title: data.title,
        isActive: data.isActive,
      });
    } else {
      const member: SafetyStaff = {
        id: generateId(),
        name: data.name,
        title: data.title,
        isActive: true,
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
        <p className="text-[13px] text-forest/50 -mt-1">
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
            <label htmlFor="isActive" className="text-[13px] text-forest/70 cursor-pointer">
              Active staff member
            </label>
          </div>
        )}

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

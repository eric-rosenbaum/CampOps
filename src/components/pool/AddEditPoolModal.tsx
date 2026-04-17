import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore, POOL_TYPE_LABELS } from '@/store/poolStore';
import { generateId } from '@/lib/utils';
import type { CampPool, PoolType } from '@/lib/types';

interface FormValues {
  name: string;
  type: PoolType;
  notes: string;
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-[12px] font-medium text-forest/70 mb-1';

export function AddEditPoolModal() {
  const { closeAllModals, editingPoolId } = useUIStore();
  const { pools, addPool, updatePool, deletePool } = usePoolStore();

  const editing = editingPoolId ? pools.find((p) => p.id === editingPoolId) ?? null : null;

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      type: editing?.type ?? 'pool',
      notes: editing?.notes ?? '',
    },
  });

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    if (editing) {
      updatePool({ ...editing, name: data.name, type: data.type, notes: data.notes || null, updatedAt: now });
    } else {
      const maxOrder = pools.reduce((m, p) => Math.max(m, p.sortOrder), -1);
      const pool: CampPool = {
        id: generateId(),
        name: data.name,
        type: data.type,
        isActive: true,
        notes: data.notes || null,
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      };
      addPool(pool);
    }
    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    if (window.confirm(`Delete "${editing.name}"? This will also delete all readings, equipment, and tasks for this pool. This cannot be undone.`)) {
      deletePool(editing.id);
      closeAllModals();
    }
  }

  return (
    <Modal
      title={editing ? `Edit — ${editing.name}` : 'Add pool / waterfront'}
      onClose={closeAllModals}
      width="440px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!editing && (
          <p className="text-[13px] text-forest/50 -mt-1">
            Add a swimming pool, lake, pond, or other aquatic location.
          </p>
        )}

        <div>
          <label className={labelClass}>Name *</label>
          <input
            {...register('name', { required: 'Name is required' })}
            className={inputClass}
            placeholder="e.g. Main Pool, Lower Lake, Waterfront"
            autoFocus
          />
          {errors.name && <p className="text-[11px] text-red mt-0.5">{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelClass}>Type *</label>
          <select {...register('type', { required: true })} className={inputClass}>
            {(Object.entries(POOL_TYPE_LABELS) as [PoolType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <p className="text-[11px] text-forest/40 mt-1">
            Swimming pools and "other" types include the chemical log. Lakes, ponds, rivers, and waterfront locations use equipment + inspection tracking only.
          </p>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            {...register('notes')}
            className={`${inputClass} resize-none`}
            rows={2}
            placeholder="Location, capacity, any relevant details…"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : 'Add pool'}
          </Button>
          {editing ? (
            <>
              <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
              <Button
                type="button"
                variant="ghost"
                className="text-red hover:bg-red-bg hover:text-red"
                onClick={handleDelete}
              >
                Delete
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

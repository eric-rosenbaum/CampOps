import { useForm } from 'react-hook-form';
import { useScreenTranslation } from '@/components/i18n/untranslated';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore } from '@/store/poolStore';
import { generateId } from '@/lib/utils';
import type { CampPool, PoolType } from '@/lib/types';

// The stored type is the key; its label is read through t() so it follows the screen's language.
const POOL_TYPES: PoolType[] = ['pool', 'waterfront', 'other'];

interface FormValues {
  name: string;
  type: PoolType;
  notes: string;
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-[12px] font-medium text-ink mb-1';

export function AddEditPoolModal({ fromSettings = false }: { fromSettings?: boolean }) {
  // Screen-aware: Pool Management is not translated yet and opens this same modal.
  const { t } = useScreenTranslation('campInfo');
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
    if (window.confirm(t('poolModal.confirmDelete', { name: editing.name }))) {
      deletePool(editing.id);
      closeAllModals();
    }
  }

  return (
    <Modal
      title={editing ? t('poolModal.editTitle', { name: editing.name }) : t('poolModal.addTitle')}
      onClose={closeAllModals}
      width="440px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!editing && (
          <p className="text-[13px] text-ink-soft -mt-1">
            {t('poolModal.intro')}
          </p>
        )}

        <div>
          <label className={labelClass}>{t('locations.name')} *</label>
          <input
            {...register('name', { required: t('poolModal.nameRequired') })}
            className={inputClass}
            placeholder={t('poolModal.namePlaceholder')}
            autoFocus
          />
          {errors.name && <p className="text-[11px] text-red mt-0.5">{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelClass}>{t('poolModal.type')} *</label>
          <select {...register('type', { required: true })} className={inputClass}>
            {POOL_TYPES.map((v) => (
              <option key={v} value={v}>{t(`pools.types.${v}`)}</option>
            ))}
          </select>
          <p className="text-[11px] text-ink-faint mt-1">
            {t('poolModal.typeHelp')}
          </p>
        </div>

        <div>
          <label className={labelClass}>{t('poolModal.notes')}</label>
          <textarea
            {...register('notes')}
            className={`${inputClass} resize-none`}
            rows={2}
            placeholder={t('poolModal.notesPlaceholder')}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? t('saveChanges') : t('pools.add')}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>{t('descriptions.cancel')}</Button>
          {editing && fromSettings && (
            <Button
              type="button"
              variant="ghost"
              className="text-red hover:bg-red-bg hover:text-red"
              onClick={handleDelete}
            >
              {t('poolModal.delete')}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

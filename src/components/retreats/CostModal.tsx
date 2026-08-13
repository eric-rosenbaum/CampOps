import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatCost } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { inputClass, labelClass } from './retreatUi';

const now = () => new Date().toISOString();

/** Add or edit a single cost-breakdown line (category · budgeted · actual). */
export function CostModal({ retreatId, costId }: { retreatId: string; costId?: string }) {
  const { costsFor, addCost, updateCost, deleteCost, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const existing = costId ? costsFor(retreatId).find((c) => c.id === costId) ?? null : null;

  const [category, setCategory] = useState(existing?.category ?? '');
  const [budgeted, setBudgeted] = useState(existing ? String(existing.budgeted) : '');
  const [actual, setActual] = useState(existing?.actual != null ? String(existing.actual) : '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const b = Number(budgeted);
    if (!category.trim() || !Number.isFinite(b)) return;
    const actualNum = actual.trim() === '' ? null : Number(actual);

    if (existing) {
      updateCost({ ...existing, category: category.trim(), budgeted: b, actual: actualNum, updatedAt: now() });
    } else {
      const row: RetreatCost = {
        id: generateId(),
        campId: '',
        retreatId,
        category: category.trim(),
        budgeted: b,
        actual: actualNum,
        sortOrder: costsFor(retreatId).length,
        createdAt: now(),
        updatedAt: now(),
      };
      addCost(row);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm('Delete this cost line?')) {
      deleteCost(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit cost line' : 'Add cost line'} onClose={closeModal} width="440px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[12px] text-forest/55 leading-relaxed">
          Track what this retreat costs the camp — food, staff, utilities, cleaning. Actual is
          optional until you know the real number; margin uses actual when set, otherwise budgeted.
        </p>
        <div>
          <label className={labelClass}>Category</label>
          <input
            autoFocus
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
            placeholder="e.g. Food & beverage"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Budgeted ($)</label>
            <input type="number" step="1" min="0" value={budgeted} onChange={(e) => setBudgeted(e.target.value)} className={inputClass} placeholder="0" />
          </div>
          <div>
            <label className={labelClass}>Actual ($)</label>
            <input type="number" step="1" min="0" value={actual} onChange={(e) => setActual(e.target.value)} className={inputClass} placeholder="—" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage || !category.trim() || budgeted === ''}>
            {existing ? 'Save changes' : 'Add cost'}
          </Button>
          {existing && canManage && (
            <Button type="button" variant="danger" onClick={handleDelete}>Delete</Button>
          )}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

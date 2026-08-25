import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import type { InventoryCategory } from '@/lib/types';
import { CATEGORY_LABELS, todayStr } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

/** A cost that didn't come through a purchase order (cash run, Costco, standing contract). */
export function AddExpenseModal() {
  const { addExpense, closeModal } = useCommissaryStore();
  const { currentUser } = useAuth();

  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState<InventoryCategory>('produce');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!date || !Number.isFinite(amt) || amt <= 0) return;
    addExpense(date, category, description.trim() || null, amt, currentUser.name || null);
    closeModal();
  }

  return (
    <Modal title="Add expense" onClose={closeModal} width="440px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          For food spending that didn't go through a purchase order, a cash produce run, a
          Costco trip, a standing contract. Counts toward the session's per-diem.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Amount ($)</label>
            <input type="number" step="0.01" min="0" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)} className={inputClass}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="e.g. Farmers market produce" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!amount}>Add expense</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

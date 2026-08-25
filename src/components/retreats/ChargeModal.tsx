import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatCharge } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { money, inputClass, labelClass } from './retreatUi';

const now = () => new Date().toISOString();

/** Add or edit an invoice line item (description · qty · unit rate → amount). */
export function ChargeModal({ retreatId, chargeId }: { retreatId: string; chargeId?: string }) {
  const { chargesFor, addCharge, updateCharge, deleteCharge, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const existing = chargeId ? chargesFor(retreatId).find((c) => c.id === chargeId) ?? null : null;

  const [description, setDescription] = useState(existing?.description ?? '');
  const [qty, setQty] = useState(existing ? String(existing.qty) : '1');
  const [unitRate, setUnitRate] = useState(existing ? String(existing.unitRate) : '');
  // Amount defaults to qty × unitRate but stays editable (round numbers, discounts, etc.).
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [amountTouched, setAmountTouched] = useState(false);

  const q = Number(qty);
  const rate = Number(unitRate);
  const computed = Number.isFinite(q) && Number.isFinite(rate) ? q * rate : 0;
  const effectiveAmount = amountTouched && amount.trim() !== '' ? Number(amount) : computed;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    if (!description.trim() || !Number.isFinite(q) || !Number.isFinite(rate)) return;
    const amt = Number.isFinite(effectiveAmount) ? effectiveAmount : 0;

    if (existing) {
      updateCharge({ ...existing, description: description.trim(), qty: q, unitRate: rate, amount: amt, updatedAt: now() });
    } else {
      const row: RetreatCharge = {
        id: generateId(),
        campId: '',
        retreatId,
        description: description.trim(),
        qty: q,
        unitRate: rate,
        amount: amt,
        sortOrder: chargesFor(retreatId).length,
        createdAt: now(),
        updatedAt: now(),
      };
      addCharge(row);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm('Delete this charge?')) {
      deleteCharge(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit charge' : 'Add charge'} onClose={closeModal} width="460px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          Charges become line items on the invoice. Amount is calculated from quantity × rate,
          but you can override it directly.
        </p>
        <div>
          <label className={labelClass}>Description</label>
          <input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="e.g. Lodging, 3 nights per person" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Qty</label>
            <input type="number" step="1" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} placeholder="0" />
          </div>
          <div>
            <label className={labelClass}>Unit rate ($)</label>
            <input type="number" step="0.01" min="0" value={unitRate} onChange={(e) => setUnitRate(e.target.value)} className={inputClass} placeholder="0" />
          </div>
          <div>
            <label className={labelClass}>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              value={amountTouched ? amount : (computed || '')}
              onChange={(e) => { setAmountTouched(true); setAmount(e.target.value); }}
              className={inputClass}
              placeholder="0"
            />
          </div>
        </div>
        <p className="text-[11px] text-ink-faint">
          Line total: <span className="font-mono text-ink">{money(effectiveAmount || 0)}</span>
          {!amountTouched && Number.isFinite(computed) && <span className="text-ink-faint"> · auto from {q || 0} × {money(rate || 0)}</span>}
        </p>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage || !description.trim()}>
            {existing ? 'Save changes' : 'Add charge'}
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

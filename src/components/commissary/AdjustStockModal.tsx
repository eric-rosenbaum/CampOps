import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import type { AdjustmentReason } from '@/lib/types';
import {
  ADJUSTMENT_REASON_LABELS, formatInStockUnit, onHandInStockUnit, toBase, tidy,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

// Deliveries add, everything else removes. The form takes a positive magnitude and
// applies the sign, so nobody has to reason about negative numbers at 6am.
const ADDITIVE: Record<AdjustmentReason, boolean> = {
  received: true,
  used: false,
  waste: false,
  count_correction: true, // handled specially — see below
  other: true,
};

export function AdjustStockModal({ itemId }: { itemId: string }) {
  const { items, adjustmentsFor, adjustItem, closeModal } = useCommissaryStore();
  const { currentUser } = useAuth();
  const item = items.find((i) => i.id === itemId);

  const [reason, setReason] = useState<AdjustmentReason>('received');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!item) return null;

  const history = adjustmentsFor(itemId).slice(0, 5);
  const current = onHandInStockUnit(item);
  const magnitude = Number(qty) || 0;

  // A count correction is an absolute recount ("there are actually 14 cases"),
  // not a delta — so the delta is whatever closes the gap, and may be negative.
  const isRecount = reason === 'count_correction';
  const deltaStock = isRecount
    ? magnitude - current
    : (ADDITIVE[reason] ? magnitude : -magnitude);
  const projected = Math.max(0, tidy(current + deltaStock));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || qty === '' || (deltaStock === 0 && !isRecount)) return;
    setSaving(true);
    await adjustItem(
      item.id,
      toBase(deltaStock, item.stockUnitInBase),
      reason,
      notes.trim() || null,
      currentUser.name || null,
    );
    setSaving(false);
    closeModal();
  }

  return (
    <Modal title={`Adjust — ${item.name}`} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3">
          <p className="text-[11px] uppercase tracking-widest text-forest/40 font-semibold">On hand</p>
          <p className="font-mono text-[20px] text-forest mt-0.5">
            {current.toLocaleString()} <span className="text-[13px] text-forest/50">{item.stockUnit}</span>
          </p>
        </div>

        <div>
          <label className={labelClass}>Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} className={inputClass}>
            {Object.entries(ADJUSTMENT_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>
            {isRecount ? `Counted quantity (${item.stockUnit})` : `Quantity (${item.stockUnit})`}
          </label>
          <input
            autoFocus type="number" step="any" min="0" value={qty}
            onChange={(e) => setQty(e.target.value)} className={inputClass} placeholder="0"
          />
          <p className="text-[11px] text-forest/45 mt-1">
            {isRecount
              ? 'Enter what you actually counted. The difference is recorded as the adjustment.'
              : ADDITIVE[reason]
                ? 'Added to stock on hand.'
                : 'Removed from stock on hand.'}
          </p>
        </div>

        {qty !== '' && (
          <div className="flex items-center justify-between rounded-card border border-border px-4 py-2.5">
            <span className="text-[12px] text-forest/60">
              {deltaStock >= 0 ? 'Adding' : 'Removing'}{' '}
              <span className="font-mono">{Math.abs(tidy(deltaStock)).toLocaleString()} {item.stockUnit}</span>
            </span>
            <span className="text-[12px] text-forest/60">
              New on hand <span className="font-mono font-medium text-forest">{projected.toLocaleString()} {item.stockUnit}</span>
            </span>
          </div>
        )}

        <div>
          <label className={labelClass}>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="optional" />
        </div>

        {history.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-widest text-forest/40 font-semibold mb-1.5">Recent activity</p>
            <div className="space-y-1">
              {history.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-[11px] text-forest/55">
                  <span>
                    {ADJUSTMENT_REASON_LABELS[a.reason]}
                    {a.adjustedBy ? ` · ${a.adjustedBy}` : ''}
                  </span>
                  <span className="font-mono">
                    {a.deltaBase >= 0 ? '+' : '−'}{formatInStockUnit(item, Math.abs(a.deltaBase))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={qty === '' || saving}>
            {saving ? 'Saving…' : 'Record adjustment'}
          </Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

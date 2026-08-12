import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import type { AdjustmentReason, WasteCategory } from '@/lib/types';
import {
  ADJUSTMENT_REASON_LABELS, formatInStockUnit, onHandInStockUnit, tidy, pluralizeUnit,
  WASTE_CATEGORIES, WASTE_CATEGORY_LABELS, WASTE_CATEGORY_SHORT, isReducibleWaste,
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

const STOCK = '__stock';

export function AdjustStockModal({ itemId }: { itemId: string }) {
  const { items, adjustmentsFor, adjustItem, packsForItem, vendors, closeModal } = useCommissaryStore();
  const { currentUser } = useAuth();
  const item = items.find((i) => i.id === itemId);

  const [reason, setReason] = useState<AdjustmentReason>('received');
  // Deliberately starts empty rather than defaulting to a category. A default would be a
  // guess recorded as a fact, and the Waste tab's reducible share is only worth quoting if
  // every category on it was actually chosen by someone who saw what was thrown out.
  const [wasteCategory, setWasteCategory] = useState<WasteCategory | ''>('');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // For a delivery you can log in the vendor's pack (2 cases) and let the system convert.
  const packs = item ? packsForItem(item.id) : [];
  const [entryUnit, setEntryUnit] = useState<string>(() => packs.find((p) => p.isDefault)?.id ?? STOCK);

  if (!item) return null;

  const history = adjustmentsFor(itemId).slice(0, 5);
  const current = onHandInStockUnit(item);
  const magnitude = Number(qty) || 0;

  const isRecount = reason === 'count_correction';
  const isWaste = reason === 'waste';
  const needsCategory = isWaste && wasteCategory === '';
  // Pack entry is only meaningful for a received delivery; a recount is always a stock count.
  const usePack = reason === 'received' && entryUnit !== STOCK ? packs.find((p) => p.id === entryUnit) ?? null : null;
  const entryUnitLabel = usePack ? usePack.purchaseUnit : item.stockUnit;
  const entryUnitInBase = usePack ? usePack.purchaseUnitInBase : item.stockUnitInBase;

  // A count correction is an absolute recount ("there are actually 14 cases"), not a
  // delta. Everything else is a signed delta in the chosen entry unit.
  const deltaBase = isRecount
    ? (magnitude - current) * item.stockUnitInBase
    : (ADDITIVE[reason] ? magnitude : -magnitude) * entryUnitInBase;
  const deltaStock = deltaBase / item.stockUnitInBase;
  const projected = Math.max(0, tidy(current + deltaStock));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || qty === '' || needsCategory || (deltaBase === 0 && !isRecount)) return;
    setSaving(true);
    await adjustItem(
      item.id, deltaBase, reason, notes.trim() || null, currentUser.name || null,
      isWaste ? (wasteCategory as WasteCategory) : null,
    );
    setSaving(false);
    closeModal();
  }

  const vendorName = (vId: string) => vendors.find((v) => v.id === vId)?.name ?? 'vendor';

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

        {/* Required on waste. Without it the Waste tab can only report a lump sum, which
            overstates what better ordering could actually have prevented. */}
        {isWaste && (
          <div>
            <label className={labelClass}>What happened?</label>
            <select
              value={wasteCategory}
              onChange={(e) => setWasteCategory(e.target.value as WasteCategory | '')}
              className={inputClass}
            >
              <option value="">Choose one…</option>
              {WASTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{WASTE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <p className="text-[11px] text-forest/45 mt-1">
              {wasteCategory === ''
                ? 'Required — the waste report separates what ordering can prevent from what it cannot.'
                : isReducibleWaste(wasteCategory)
                  ? 'Counted as preventable — this shows in the reducible share of the waste report.'
                  : 'Recorded, but not counted as preventable by better ordering.'}
            </p>
          </div>
        )}

        {/* Delivery-in-packs: pick the vendor pack and log e.g. "2 cases". */}
        {reason === 'received' && packs.length > 0 && (
          <div>
            <label className={labelClass}>Log in</label>
            <select value={entryUnit} onChange={(e) => setEntryUnit(e.target.value)} className={inputClass}>
              <option value={STOCK}>{pluralizeUnit(item.stockUnit, 2)} (how you stock it)</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.purchaseUnit} — {vendorName(p.vendorId)} ({tidy(p.purchaseUnitInBase / item.stockUnitInBase, 2)} {item.stockUnit})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>
            {isRecount ? `Counted quantity (${item.stockUnit})` : `Quantity (${entryUnitLabel})`}
          </label>
          <input
            autoFocus type="number" step="any" min="0" value={qty}
            onChange={(e) => setQty(e.target.value)} className={inputClass} placeholder="0"
          />
          <p className="text-[11px] text-forest/45 mt-1">
            {isRecount
              ? 'Enter what you actually counted. The difference is recorded as the adjustment.'
              : usePack
                ? `Converted to ${item.stockUnit} and added to stock on hand.`
                : ADDITIVE[reason]
                  ? 'Added to stock on hand.'
                  : 'Removed from stock on hand.'}
          </p>
        </div>

        {qty !== '' && (
          <div className="flex items-center justify-between rounded-card border border-border px-4 py-2.5">
            <span className="text-[12px] text-forest/60">
              {deltaStock >= 0 ? 'Adding' : 'Removing'}{' '}
              <span className="font-mono">
                {isRecount || !usePack
                  ? `${Math.abs(tidy(deltaStock)).toLocaleString()} ${item.stockUnit}`
                  : `${magnitude.toLocaleString()} ${pluralizeUnit(entryUnitLabel, magnitude)} = ${Math.abs(tidy(deltaStock)).toLocaleString()} ${item.stockUnit}`}
              </span>
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
                    {a.wasteCategory
                      ? `Waste — ${WASTE_CATEGORY_SHORT[a.wasteCategory].toLowerCase()}`
                      : ADJUSTMENT_REASON_LABELS[a.reason]}
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
          <Button type="submit" className="flex-1 justify-center" disabled={qty === '' || needsCategory || saving}>
            {saving ? 'Saving…' : 'Record adjustment'}
          </Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

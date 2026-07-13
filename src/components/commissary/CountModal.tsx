import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { STORAGE_LABELS, onHandInStockUnit } from '@/lib/commissaryUnits';

const STORAGE_ORDER = ['walk_in_refrigerator', 'walk_in_freezer', 'reach_in_refrigerator', 'dry_storage', 'other'];

/**
 * Physical count — the weekly walk-the-walk-in ritual. Enter what you actually counted,
 * grouped by storage location; each change posts a count-correction adjustment.
 */
export function CountModal() {
  const { items, recordCount, closeModal } = useCommissaryStore();
  const { currentUser } = useAuth();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const grouped = STORAGE_ORDER
    .map((loc) => ({ loc, items: items.filter((i) => i.storageLocation === loc).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length > 0);

  const changed = Object.entries(counts).filter(([id, v]) => {
    if (v === '') return false;
    const item = items.find((i) => i.id === id);
    return item && Number(v) !== onHandInStockUnit(item);
  }).length;

  async function handleSubmit() {
    setSaving(true);
    const payload = Object.entries(counts)
      .filter(([, v]) => v !== '')
      .map(([itemId, v]) => ({ itemId, countedStock: Number(v) || 0 }));
    await recordCount(payload, currentUser.name || null);
    setSaving(false);
    closeModal();
  }

  return (
    <Modal title="Physical count" onClose={closeModal} width="620px">
      <div className="space-y-4">
        <p className="text-[12px] text-forest/55 leading-relaxed">
          Walk each storage area and enter what you count. Blank rows are left untouched; any
          number that differs from the last-known amount posts a correction.
        </p>

        <div className="max-h-[55vh] overflow-y-auto space-y-4">
          {grouped.map((g) => (
            <div key={g.loc}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-forest/40 mb-1.5 sticky top-0 bg-white py-1">
                {STORAGE_LABELS[g.loc]}
              </p>
              <div className="rounded-card border border-border overflow-hidden">
                {g.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0">
                    <span className="text-[13px] text-forest flex-1 truncate">{item.name}</span>
                    <span className="font-mono text-[11px] text-forest/40 w-24 text-right">was {onHandInStockUnit(item).toLocaleString()} {item.stockUnit}</span>
                    <input
                      type="number" step="any" min="0"
                      value={counts[item.id] ?? ''}
                      onChange={(e) => setCounts((c) => ({ ...c, [item.id]: e.target.value }))}
                      className="w-20 font-mono text-[12px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage"
                      placeholder="count"
                    />
                    <span className="text-[11px] text-forest/40 w-12">{item.stockUnit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-[12px] text-forest/50">{changed} change{changed === 1 ? '' : 's'} to record</span>
          <div className="flex-1" />
          <Button onClick={handleSubmit} disabled={changed === 0 || saving}>
            {saving ? 'Saving…' : `Record count`}
          </Button>
          <Button variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

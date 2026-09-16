import { useMemo, useState } from 'react';
import type { Trip } from '@/lib/tripTypes';
import { tripsTakingErrands, dayLabel, clock, type LocalNow } from '@/lib/trips';
import { dbAddErrand } from '@/lib/tripsDb';
import { Sheet } from './tripUi';
import { inputClass, labelClass } from './tripStyle';

interface Props {
  campId: string;
  trips: Trip[];
  now: LocalNow;
  /** Pre-selected trip, from a trip's "Add an errand". Null: the shared list. */
  tripId: string | null;
  /** The driver may add to their own trip after its list closes. */
  managedTripIds: Set<string>;
  onClose: () => void;
  notify: (text: string, tone?: 'ok' | 'warn' | 'error') => void;
}

/**
 * "I need something from town." The whole point is that it takes no knowledge of who is driving:
 * the default is the shared list, where whoever goes next will see it.
 */
export function ErrandSheet({ campId, trips, now, tripId, managedTripIds, onClose, notify }: Props) {
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [store, setStore] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [forActivity, setForActivity] = useState('');
  const [target, setTarget] = useState<string>(tripId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const open = tripsTakingErrands(trips, now);
    const extra = trips.filter((t) => managedTripIds.has(t.id) && (t.status === 'planned' || t.status === 'out') && !open.includes(t));
    return [...open, ...extra];
  }, [trips, now, managedTripIds]);

  async function save() {
    if (!item.trim()) { setError('Say what you need.'); return; }
    setSaving(true);
    setError(null);
    const r = await dbAddErrand(campId, {
      item: item.trim(), quantity: quantity.trim() || null, store: store.trim() || null, estCost: null,
      neededBy: neededBy || null, forActivity: forActivity.trim() || null, tripId: target || null,
    });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    const t = trips.find((x) => x.id === target);
    notify(t ? `Added to ${t.title}.` : 'On the shopping list. Whoever goes next will see it.');
    onClose();
  }

  return (
    <Sheet
      title="Add an errand"
      onClose={onClose}
      testId="errand-sheet"
      footer={(
        <div className="flex items-center gap-2">
          {error && <p className="min-w-0 flex-1 text-[12.5px] font-semibold text-red-text" role="alert">{error}</p>}
          <button type="button" onClick={onClose} className="ml-auto min-h-11 rounded-btn border border-border bg-white px-4 text-[13.5px] font-bold text-forest">Cancel</button>
          <button type="button" onClick={save} disabled={saving} data-testid="save-errand"
            className="min-h-11 rounded-btn bg-forest px-5 text-[13.5px] font-bold text-paper hover:bg-forest-mid disabled:opacity-60">
            {saving ? 'Adding…' : 'Add errand'}
          </button>
        </div>
      )}
    >
      <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="block">
          <span className={labelClass}>What do you need?</span>
          <input autoFocus value={item} onChange={(e) => setItem(e.target.value)} placeholder="Craft glue, AA batteries, a birthday card" className={inputClass} name="item" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>How much</span>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="6 bottles" className={inputClass} name="quantity" />
          </label>
          <label className="block">
            <span className={labelClass}>Store</span>
            <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Any store" className={inputClass} name="store" list="trip-stores" />
            <datalist id="trip-stores">
              {['Walmart', 'Dollarama', 'Canadian Tire', 'Shoppers Drug Mart', 'Home Hardware', 'LCBO', 'Post office'].map((s) => <option key={s} value={s} />)}
            </datalist>
          </label>
          <label className="block">
            <span className={labelClass}>Needed by</span>
            <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={inputClass} name="neededBy" />
          </label>
          <label className="block">
            <span className={labelClass}>For</span>
            <input value={forActivity} onChange={(e) => setForActivity(e.target.value)} placeholder="Arts & crafts" className={inputClass} name="forActivity" />
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>Put it on</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} name="trip">
            <option value="">The shopping list — whoever goes next</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {dayLabel(t.departDate)} {clock(t.departTime)} · {t.title}{t.destination ? ` → ${t.destination}` : ''}
              </option>
            ))}
          </select>
        </label>
      </form>
    </Sheet>
  );
}

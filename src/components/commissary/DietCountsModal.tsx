import { useState } from 'react';
import { Trash2, Utensils } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import {
  ALLERGENS, DIETARY_RESTRICTIONS, restrictionLabel,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

const OPTIONS = [...DIETARY_RESTRICTIONS, ...ALLERGENS];

/**
 * Standing dietary counts for a session — for camps that know "42 vegetarian" without
 * entering each camper — plus the camp-level kosher default. Relocated here from the
 * allergy tab, which is now a document locker.
 */
export function DietCountsModal() {
  const { dietCountsForSession, upsertDietCount, removeDietCount, closeModal } = useCommissaryStore();
  const { currentCamp, updateCamp } = useCampStore();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const kosher = Boolean(currentCamp?.dietaryDefaults?.kosher);
  const rows = dietCountsForSession();

  function toggleKosher() {
    if (!currentCamp) return;
    updateCamp(currentCamp.id, { dietaryDefaults: { ...currentCamp.dietaryDefaults, kosher: !kosher } });
  }

  const [restriction, setRestriction] = useState('vegetarian');
  const [count, setCount] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0) return;
    upsertDietCount(restriction, n);
    setCount('');
  }

  return (
    <Modal title="Dietary defaults" onClose={closeModal} width="480px">
      <div className="space-y-4">
        <label className={`flex items-center gap-2.5 rounded-card border border-border px-4 py-3 ${isAdmin ? 'cursor-pointer' : 'opacity-60'}`}>
          <Utensils className="w-4 h-4 text-ink-soft" />
          <input type="checkbox" checked={kosher} disabled={!isAdmin} onChange={toggleKosher} className="accent-sage" />
          <span className="text-[13px] text-ink">Kitchen serves fully kosher</span>
          {!isAdmin && <span className="text-[11px] text-ink-faint ml-auto">Admins only</span>}
        </label>

        <p className="text-[12px] text-ink-soft leading-relaxed">
          Set how many campers this session have each restriction, when you know the number
          but not the names. Production uses these to plan parallel portions.
        </p>

        {rows.length > 0 && (
          <div className="rounded-card border border-border overflow-hidden">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0">
                <span className="text-[13px] text-forest flex-1">{restrictionLabel(r.restriction)}</span>
                <span className="font-mono text-[13px] text-forest">{r.count}</span>
                <button onClick={() => removeDietCount(r.id)} className="p-1 text-forest/30 hover:text-red" aria-label="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="flex-1">
            <label className={labelClass}>Restriction</label>
            <select value={restriction} onChange={(e) => setRestriction(e.target.value)} className={inputClass}>
              {OPTIONS.map((o) => <option key={o} value={o}>{restrictionLabel(o)}</option>)}
            </select>
          </div>
          <div className="w-24">
            <label className={labelClass}>Count</label>
            <input type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} placeholder="0" />
          </div>
          <Button type="submit" disabled={count === ''}>Set</Button>
        </form>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={closeModal}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

// The camp's own list of trades.
//
// These were five fixed values for everybody, which is wrong in both directions: a camp with no
// IT person had an empty Tech lane on the board, and a camp with a waterfront crew or a horse
// barn had nowhere to file that work. Every camp starts with the same five and changes them or
// doesn't.
//
// Keys never change once created, because `issues.trade` stores the key: renaming Grounds to
// "Property" is a label edit, not a rewrite of a season of work orders. A trade that has been
// used cannot be deleted for the same reason — it is retired instead, which takes it out of
// every picker while leaving old work orders readable.
import { useMemo, useState } from 'react';
import { Plus, Wrench } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import { tradePill } from '@/lib/workOrder';
import type { CampTrade } from '@/lib/types';

/** "Waterfront" -> "waterfront"; "A/V & Tech" -> "a_v_tech". */
function toKey(label: string): string {
  const k = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31);
  return /^[a-z]/.test(k) ? k : `t_${k}`.slice(0, 31);
}

export function TradesCard() {
  const trades = useCampgroundStore((s) => s.trades);
  const addTrade = useCampgroundStore((s) => s.addTrade);
  const updateTrade = useCampgroundStore((s) => s.updateTrade);
  const issues = useIssuesStore((s) => s.issues);
  const schedules = useCampgroundStore((s) => s.schedules);
  const currentCamp = useCampStore((s) => s.currentCamp);
  const { can } = useAuth();
  const canEdit = can('manageCampSettings');

  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  // Derived from the raw slices, never inside a selector.
  const sorted = useMemo(
    () => trades.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    [trades],
  );
  const useCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of issues) m.set(i.trade, (m.get(i.trade) ?? 0) + 1);
    for (const s of schedules) m.set(s.trade, (m.get(s.trade) ?? 0) + 1);
    return m;
  }, [issues, schedules]);

  async function create() {
    const label = newLabel.trim();
    if (!label) return;
    const key = toKey(label);
    if (!key) { setError('Give it a name with at least one letter.'); return; }
    if (trades.some((t) => t.key === key)) { setError('You already have a trade with that name.'); return; }
    const err = await addTrade({
      id: generateId(),
      campId: currentCamp?.id ?? '',
      key,
      label,
      sortOrder: (trades.reduce((m, t) => Math.max(m, t.sortOrder), 0) ?? 0) + 1,
      isActive: true,
    });
    if (err) { setError(err); return; }
    setNewLabel(''); setAdding(false); setError(null);
  }

  function rename(t: CampTrade) {
    const label = editLabel.trim();
    if (label && label !== t.label) updateTrade({ ...t, label });
    setEditingId(null);
  }

  return (
    <div className="bg-white border border-border rounded-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-[13px] font-semibold text-forest">Trades</h3>
          <p className="text-[11.5px] text-ink-soft mt-0.5">
            The crews you file work under. Everyone starts with the same five.
          </p>
        </div>
        {canEdit && !adding && (
          <Button size="sm" variant="ghost" onClick={() => { setAdding(true); setError(null); }}>
            <Plus className="w-3.5 h-3.5" /> Add a trade
          </Button>
        )}
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-border bg-cream-dark/40">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => { setNewLabel(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
              placeholder="Waterfront"
              className="flex-1 text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage"
            />
            <Button size="sm" onClick={() => void create()} disabled={!newLabel.trim()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewLabel(''); setError(null); }}>
              Cancel
            </Button>
          </div>
          {error && <p className="text-[11.5px] text-red mt-1.5">{error}</p>}
        </div>
      )}

      <ul className="divide-y divide-border">
        {sorted.map((t) => {
          const used = useCount.get(t.key) ?? 0;
          return (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`rounded-tag px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${tradePill(t.key)}`}>
                {t.label}
              </span>

              {editingId === t.id ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => rename(t)}
                  onKeyDown={(e) => { if (e.key === 'Enter') rename(t); if (e.key === 'Escape') setEditingId(null); }}
                  className="flex-1 text-[13px] bg-white border border-sage rounded-btn px-2 py-1 focus:outline-none"
                />
              ) : (
                <span className="flex-1 min-w-0 text-[12px] text-ink-soft truncate">
                  {used > 0 ? `${used} on the books` : 'Nothing filed under it yet'}
                  {!t.isActive && ' · retired'}
                </span>
              )}

              {canEdit && editingId !== t.id && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setEditingId(t.id); setEditLabel(t.label); }}
                    className="text-[12px] font-semibold text-forest hover:underline px-1.5"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => updateTrade({ ...t, isActive: !t.isActive })}
                    className="text-[12px] font-semibold text-ink-soft hover:text-forest px-1.5"
                    title={t.isActive
                      ? 'Take it out of the pickers. Work already filed under it stays readable.'
                      : 'Offer it again on new work'}
                  >
                    {t.isActive ? 'Retire' : 'Bring back'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {sorted.length === 0 && (
        <p className="flex items-center justify-center gap-2 px-4 py-6 text-[12.5px] text-ink-faint">
          <Wrench className="w-4 h-4" /> No trades yet.
        </p>
      )}
    </div>
  );
}

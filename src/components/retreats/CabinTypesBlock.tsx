// What a group is told about the cabin it is choosing.
//
// A coordinator picking between "Cabin 1" and "Cabin 7" had a name and a bed count and nothing
// else, and the camp had no way to say that one is a heated lodge room and the other is a
// screened summer cabin. A cabin type is that description written once and pointed at as many
// cabins as it fits -- edit the type and every cabin using it changes, which is the reason to
// write it once rather than paste it eight times.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { supabase } from '@/lib/supabase';
import { useCampStore } from '@/store/campStore';
import { generateId } from '@/lib/utils';
import type { CabinType } from '@/lib/types';
import { useCabinTypes } from './useCabinTypes';
import { inputClass, labelClass } from './retreatUi';


export function CabinTypesBlock({ canManage }: { canManage: boolean }) {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const [types, refresh] = useCabinTypes();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!campId || !name.trim()) return;
    setBusy(true); setError(null);
    const { error: err } = await supabase.from('camp_cabin_types').insert({
      id: generateId(), camp_id: campId, name: name.trim(), description: description.trim(),
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setName(''); setDescription(''); setAdding(false); refresh();
  }

  async function save(t: CabinType, patch: Partial<CabinType>) {
    await supabase.from('camp_cabin_types')
      .update({ name: patch.name ?? t.name, description: patch.description ?? t.description,
                updated_at: new Date().toISOString() })
      .eq('id', t.id);
    refresh();
  }

  async function remove(t: CabinType) {
    // Cabins pointing at it are set back to no type by the FK, not deleted.
    await supabase.from('camp_cabin_types').delete().eq('id', t.id);
    refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-[13px] font-semibold text-forest">Cabin types</h3>
        {canManage && !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Add a type
          </Button>
        )}
      </div>
      <p className="text-[12px] text-ink-soft mb-3">
        Written once, shown to every group choosing one of these cabins.
      </p>

      {adding && (
        <div className="rounded-card border border-border bg-cream-dark/40 px-3.5 py-3 mb-3 space-y-2.5">
          <div>
            <label className={labelClass}>Name</label>
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Standard cabin" className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>What a group should know</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Eight bunks, screened windows, shared bathhouse a short walk away. No heat."
              className={`${inputClass} resize-y`}
            />
          </div>
          {error && <p className="text-[11.5px] text-red">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void create()} disabled={busy || !name.trim()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {types.length === 0 && !adding ? (
        <p className="text-[12.5px] text-ink-faint">
          None yet. Without one, a group sees a cabin's name and its bed count.
        </p>
      ) : (
        <ul className="space-y-2">
          {types.map((t) => (
            <li key={t.id} className="rounded-card border border-border bg-white px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    defaultValue={t.name} disabled={!canManage}
                    onBlur={(e) => { if (e.target.value.trim() !== t.name) void save(t, { name: e.target.value.trim() }); }}
                    className="w-full text-[13px] font-semibold text-forest bg-transparent focus:outline-none"
                  />
                  <textarea
                    defaultValue={t.description} disabled={!canManage} rows={2}
                    onBlur={(e) => { if (e.target.value !== t.description) void save(t, { description: e.target.value }); }}
                    placeholder="What a group should know"
                    className={`${inputClass} resize-y text-[12.5px]`}
                  />
                </div>
                {canManage && (
                  <button
                    type="button" onClick={() => void remove(t)}
                    title="Delete this type. Cabins using it keep their own notes."
                    className="p-1.5 text-ink-faint hover:text-red flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

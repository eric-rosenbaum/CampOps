import { useState } from 'react';
import { Trash2, Plus, Check } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { RetreatSpace } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';

/** One editable inventory row. Edits commit to the store on blur (or toggle). */
function SpaceRow({ space, canManage }: { space: RetreatSpace; canManage: boolean }) {
  const { updateSpace, deleteSpace } = useRetreatStore();
  const [name, setName] = useState(space.name);
  const [bedCapacity, setBedCapacity] = useState(String(space.bedCapacity));
  const [notes, setNotes] = useState(space.notes ?? '');

  function commit(patch: Partial<RetreatSpace>) {
    if (!canManage) return;
    updateSpace({
      ...space,
      name: name.trim() || space.name,
      bedCapacity: Math.max(0, Math.round(Number(bedCapacity) || 0)),
      notes: notes.trim() || null,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="rounded-card border border-border bg-white px-3.5 py-3">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => commit({ name: name.trim() || space.name })}
          disabled={!canManage}
          className="flex-1 text-[13px] font-medium bg-transparent border border-transparent hover:border-border focus:border-sage rounded-btn px-2 py-1 focus:outline-none"
          placeholder="Cabin name"
        />
        <div className="flex items-center gap-1">
          <input
            type="number" min="0" step="1"
            value={bedCapacity}
            onChange={(e) => setBedCapacity(e.target.value)}
            onBlur={() => commit({ bedCapacity: Math.max(0, Math.round(Number(bedCapacity) || 0)) })}
            disabled={!canManage}
            className="w-16 text-[13px] text-center bg-white border border-border rounded-btn px-1.5 py-1 focus:outline-none focus:border-sage"
          />
          <span className="text-[11px] text-forest/45">beds</span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => deleteSpace(space.id)}
            className="text-forest/30 hover:text-red p-1"
            title="Delete space"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          disabled={!canManage}
          onClick={() => commit({ accessible: !space.accessible })}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-pill border transition-colors ${
            space.accessible
              ? 'bg-blue-bg text-blue-text border-blue/30'
              : 'bg-white text-forest/50 border-border hover:border-forest/30'
          }`}
        >
          {space.accessible && <Check className="w-3 h-3" />} Accessible / ADA
        </button>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => commit({ notes: notes.trim() || null })}
          disabled={!canManage}
          className="flex-1 text-[12px] text-forest/70 bg-transparent border border-transparent hover:border-border focus:border-sage rounded-btn px-2 py-1 focus:outline-none"
          placeholder="Notes (optional)"
        />
      </div>
    </div>
  );
}

export function SpacesModal() {
  const { spaces, addSpace, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [name, setName] = useState('');
  const [bedCapacity, setBedCapacity] = useState('');
  const [accessible, setAccessible] = useState(false);
  const [notes, setNotes] = useState('');

  const sorted = [...spaces].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addSpace(name.trim(), Math.max(0, Math.round(Number(bedCapacity) || 0)), accessible, notes.trim() || null);
    setName(''); setBedCapacity(''); setAccessible(false); setNotes('');
  }

  return (
    <Modal title="Manage cabins & spaces" onClose={closeModal} width="560px">
      <p className="text-[12px] text-forest/50 -mt-2 mb-4">
        Camp-level inventory, shared across every retreat. Assign these to groups from the Housing tab.
      </p>

      <div className="flex flex-col gap-2 mb-5">
        {sorted.length === 0 && (
          <p className="bg-cream rounded-card border border-border px-4 py-6 text-center text-[13px] text-forest/45">
            No spaces yet. Add your cabins, lodges, and bunkhouses below.
          </p>
        )}
        {sorted.map((s) => <SpaceRow key={s.id} space={s} canManage={canManage} />)}
      </div>

      {canManage && (
        <form onSubmit={handleAdd} className="rounded-card border border-border bg-cream-dark/30 px-4 py-3.5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-forest/50">Add a space</p>
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <label className={labelClass}>Name *</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Cabin 1" />
            </div>
            <div>
              <label className={labelClass}>Beds</label>
              <input type="number" min="0" step="1" value={bedCapacity} onChange={(e) => setBedCapacity(e.target.value)} className={inputClass} placeholder="16" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="optional" />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAccessible((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-pill border transition-colors ${
                accessible ? 'bg-blue-bg text-blue-text border-blue/30' : 'bg-white text-forest/50 border-border hover:border-forest/30'
              }`}
            >
              {accessible && <Check className="w-3 h-3" />} Accessible / ADA
            </button>
            <Button type="submit" size="sm" disabled={!name.trim()}>
              <Plus className="w-3.5 h-3.5" /> Add space
            </Button>
          </div>
        </form>
      )}

      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={closeModal}>Done</Button>
      </div>
    </Modal>
  );
}

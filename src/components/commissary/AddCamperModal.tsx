import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { Camper, CamperRestriction, RestrictionSeverity } from '@/lib/types';
import {
  ALLERGENS, ALLERGEN_LABELS, DIETARY_RESTRICTIONS, DIETARY_LABELS, SEVERITY_LABELS,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

const SEVERITIES: RestrictionSeverity[] = ['intolerance', 'confirmed', 'anaphylactic'];

export function AddCamperModal({ editId }: { editId?: string }) {
  const {
    campers, sessions, activeSessionId, restrictionsFor,
    addCamper, updateCamper, deleteCamper, closeModal,
  } = useCommissaryStore();
  const existing = editId ? campers.find((c) => c.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [cabin, setCabin] = useState(existing?.cabin ?? '');
  const [sessionId, setSessionId] = useState(existing?.sessionId ?? activeSessionId ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // allergen slug -> severity. Absent = camper does not have it.
  const [allergens, setAllergens] = useState<Record<string, RestrictionSeverity>>(() => {
    if (!existing) return {};
    const out: Record<string, RestrictionSeverity> = {};
    for (const r of restrictionsFor(existing.id)) {
      if (r.kind === 'allergen' && r.severity) out[r.restriction] = r.severity;
    }
    return out;
  });

  const [diets, setDiets] = useState<string[]>(() =>
    existing ? restrictionsFor(existing.id).filter((r) => r.kind === 'dietary').map((r) => r.restriction) : [],
  );

  function toggleAllergen(slug: string) {
    setAllergens((prev) => {
      if (prev[slug]) {
        const next = { ...prev };
        delete next[slug];
        return next;
      }
      // Default to the middle severity — "confirmed" is the common case, and defaulting
      // to anaphylactic would cry wolf while defaulting to intolerance would understate.
      return { ...prev, [slug]: 'confirmed' };
    });
  }

  function toggleDiet(slug: string) {
    setDiets((prev) => prev.includes(slug) ? prev.filter((d) => d !== slug) : [...prev, slug]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const camperId = existing?.id ?? generateId();

    const camper: Camper = {
      id: camperId,
      sessionId: sessionId || null,
      name: name.trim(),
      cabin: cabin.trim() || null,
      notes: notes.trim() || null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const rows: CamperRestriction[] = [
      ...Object.entries(allergens).map(([restriction, severity]) => ({
        id: generateId(), camperId, restriction, kind: 'allergen' as const,
        severity, notes: null, createdAt: now, updatedAt: now,
      })),
      // Dietary preferences carry no severity — the CHECK constraint requires null here.
      ...diets.map((restriction) => ({
        id: generateId(), camperId, restriction, kind: 'dietary' as const,
        severity: null, notes: null, createdAt: now, updatedAt: now,
      })),
    ];

    if (existing) updateCamper(camper, rows);
    else addCamper(camper, rows);
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Remove ${existing.name} and their dietary restrictions?`)) {
      deleteCamper(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit camper' : 'Add camper'} onClose={closeModal} width="600px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Name *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Sarah M." />
          </div>
          <div>
            <label className={labelClass}>Cabin</label>
            <input value={cabin} onChange={(e) => setCabin(e.target.value)} className={inputClass} placeholder="Cabin 3" />
          </div>
          <div>
            <label className={labelClass}>Session</label>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={inputClass}>
              <option value="">All sessions</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Allergies</label>
          <p className="text-[11px] text-forest/45 mb-2">
            Select an allergen, then set how severe it is. Anaphylactic flags appear in red
            on every affected recipe and prep task.
          </p>
          <div className="space-y-1.5">
            {ALLERGENS.map((a) => {
              const on = Boolean(allergens[a]);
              return (
                <div key={a} className="flex items-center gap-3">
                  <button
                    type="button" onClick={() => toggleAllergen(a)}
                    className={`w-32 text-left px-2.5 py-1.5 rounded-btn text-[12px] font-medium border transition-colors ${
                      on
                        ? allergens[a] === 'anaphylactic'
                          ? 'bg-red-bg text-red border-red/30'
                          : 'bg-amber-bg text-amber-text border-amber/30'
                        : 'bg-white text-forest/50 border-border hover:border-forest/30'
                    }`}
                  >
                    {ALLERGEN_LABELS[a]}
                  </button>
                  {on && (
                    <div className="flex gap-1.5">
                      {SEVERITIES.map((sev) => (
                        <button
                          key={sev} type="button"
                          onClick={() => setAllergens((p) => ({ ...p, [a]: sev }))}
                          className={`px-2 py-1 rounded-pill text-[11px] border transition-colors ${
                            allergens[a] === sev
                              ? sev === 'anaphylactic'
                                ? 'bg-red text-white border-red'
                                : 'bg-forest text-cream border-forest'
                              : 'bg-white text-forest/50 border-border hover:border-forest/30'
                          }`}
                        >
                          {SEVERITY_LABELS[sev].split(' —')[0]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelClass}>Dietary preferences</label>
          <p className="text-[11px] text-forest/45 mb-2">
            An accommodation, not a safety hazard — these do not raise allergen warnings.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DIETARY_RESTRICTIONS.map((d) => (
              <button
                key={d} type="button" onClick={() => toggleDiet(d)}
                className={`px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-colors ${
                  diets.includes(d)
                    ? 'bg-forest text-cream border-forest'
                    : 'bg-white text-forest/50 border-border hover:border-forest/30'
                }`}
              >
                {DIETARY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes / substitutions</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save changes' : 'Add camper'}</Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { MealPeriod, MenuSubstitution } from '@/lib/types';
import {
  MEAL_PERIOD_LABELS, dateForCell, restrictionLabel,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

interface Props {
  weekNumber: number;
  dayIndex: number;
  mealPeriod: MealPeriod;
  editId?: string;
}

/** Encodes/decodes a recipe|item reference in a single <select>. */
type Ref = { recipeId: string | null; itemId: string | null };
function refValue(r: Ref): string {
  if (r.recipeId) return `recipe:${r.recipeId}`;
  if (r.itemId) return `item:${r.itemId}`;
  return '';
}
function parseRef(v: string): Ref {
  if (v.startsWith('recipe:')) return { recipeId: v.slice(7), itemId: null };
  if (v.startsWith('item:')) return { recipeId: null, itemId: v.slice(5) };
  return { recipeId: null, itemId: null };
}

export function SubstitutionModal({ weekNumber, dayIndex, mealPeriod, editId }: Props) {
  const {
    recipes, items, activeSession, restrictionSummary, substitutionsForSession,
    addSubstitution, updateSubstitution, deleteSubstitution, closeModal, itemsById, recipesById,
  } = useCommissaryStore();
  const session = activeSession();
  const existing = editId ? substitutionsForSession().find((s) => s.id === editId) ?? null : null;

  const [forRestriction, setForRestriction] = useState(existing?.forRestriction ?? '');
  const [mainRef, setMainRef] = useState(existing ? refValue({ recipeId: existing.mainRecipeId, itemId: existing.mainItemId }) : '');
  const [mainLabel, setMainLabel] = useState(existing?.mainLabel ?? '');
  const [sideRef, setSideRef] = useState(existing ? refValue({ recipeId: existing.sideRecipeId, itemId: existing.sideItemId }) : '');
  const [sideLabel, setSideLabel] = useState(existing?.sideLabel ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  if (!session) return null;

  const date = dateForCell(session.startDate, weekNumber, dayIndex);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Restrictions actually present in camp, worst first — the ones worth planning around.
  const presentRestrictions = restrictionSummary
    .filter((r) => r.camperCount > 0)
    .sort((a, b) => b.anaphylacticCount - a.anaphylacticCount || b.camperCount - a.camperCount);

  const byId = itemsById();
  const recById = recipesById();

  /** Resolve a ref to a display name for auto-labeling. */
  function nameForRef(v: string): string {
    const r = parseRef(v);
    if (r.recipeId) return recById.get(r.recipeId)?.name ?? '';
    if (r.itemId) return byId.get(r.itemId)?.name ?? '';
    return '';
  }

  function pickMain(v: string) {
    setMainRef(v);
    const name = nameForRef(v);
    if (name) setMainLabel(name);
  }
  function pickSide(v: string) {
    setSideRef(v);
    const name = nameForRef(v);
    if (name) setSideLabel(name);
  }

  function refPicker(value: string, onChange: (v: string) => void, placeholder: string) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">{placeholder}</option>
        <optgroup label="Recipes">
          {recipes.map((r) => <option key={r.id} value={`recipe:${r.id}`}>{r.name}</option>)}
        </optgroup>
        <optgroup label="Inventory items">
          {items.map((i) => <option key={i.id} value={`item:${i.id}`}>{i.name}</option>)}
        </optgroup>
      </select>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !mainLabel.trim()) return;
    const now = new Date().toISOString();
    const main = parseRef(mainRef);
    const side = parseRef(sideRef);
    const sub: MenuSubstitution = {
      id: existing?.id ?? generateId(),
      sessionId: session.id,
      weekNumber, dayIndex, mealPeriod,
      forRestriction: forRestriction || null,
      mainRecipeId: main.recipeId, mainItemId: main.itemId, mainLabel: mainLabel.trim(),
      sideRecipeId: side.recipeId, sideItemId: side.itemId,
      sideLabel: sideLabel.trim() || null,
      notes: notes.trim() || null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) updateSubstitution(sub); else addSubstitution(sub);
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm('Delete this replacement meal?')) { deleteSubstitution(existing.id); closeModal(); }
  }

  return (
    <Modal title={existing ? 'Edit replacement meal' : 'Replacement meal'} onClose={closeModal} width="500px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-2.5">
          <p className="text-[12px] text-forest/60">
            {MEAL_PERIOD_LABELS[mealPeriod]} · {dateLabel} · week {weekNumber}
          </p>
        </div>

        <div>
          <label className={labelClass}>For which restriction</label>
          <select value={forRestriction} onChange={(e) => setForRestriction(e.target.value)} className={inputClass}>
            <option value="">General (any allergy)</option>
            {presentRestrictions.map((r) => (
              <option key={r.restriction} value={r.restriction}>
                {restrictionLabel(r.restriction)} — {r.camperCount} affected{r.anaphylacticCount > 0 ? `, ${r.anaphylacticCount} anaphylactic` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Replacement main *</label>
          {refPicker(mainRef, pickMain, '— Free text —')}
          <input
            value={mainLabel} onChange={(e) => setMainLabel(e.target.value)}
            className={`${inputClass} mt-2`} placeholder="e.g. Grilled chicken (no marinade)"
          />
        </div>

        <div>
          <label className={labelClass}>Replacement side</label>
          {refPicker(sideRef, pickSide, '— Free text / none —')}
          <input
            value={sideLabel} onChange={(e) => setSideLabel(e.target.value)}
            className={`${inputClass} mt-2`} placeholder="e.g. Steamed rice"
          />
        </div>

        <div>
          <label className={labelClass}>Notes for the line</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="e.g. Plate with dedicated utensils" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!mainLabel.trim()}>
            {existing ? 'Save' : 'Add replacement'}
          </Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import {
  Plus, ListChecks, ArrowUp, ArrowDown, X, Camera, Trash2, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Modal } from '@/components/shared/Modal';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import { useTradeKeys, useTradeLabel } from '@/lib/useTrades';
import { tradePill } from '@/lib/workOrder';
import type { ChecklistTemplateItem, Trade, WorkChecklistTemplate } from '@/lib/types';

/**
 * Checklists, as templates rather than as prose in a description field.
 *
 * The point of a template is that the eleventh step is the same eleventh step every time, and
 * that the person who did it is recorded against it. Six ship seeded (cabin turnover, bathhouse
 * daily, program space reset, vehicle pre-trip, cabin opening, cabin closing) because a camp
 * that has to author six checklists before it can use the feature never uses the feature.
 *
 * `requiresPhoto` asks for a photo, it does not demand one: the step still ticks without it. A
 * checklist that refuses to close is a checklist people stop opening, and the crew with no signal
 * at the back of the property is exactly who needed it to work.
 */

const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-widest text-ink-soft mb-1';

function blankTemplate(): WorkChecklistTemplate {
  const now = new Date().toISOString();
  return {
    id: generateId(), campId: '', name: '', trade: 'housekeeping',
    items: [], isActive: true, createdAt: now, updatedAt: now,
  };
}

export function ChecklistTemplatesPanel() {
  const tradeKeys = useTradeKeys();
  const labelOf = useTradeLabel();
  const templates = useCampgroundStore((s) => s.templates);
  const { role } = useAuth();
  const canEdit = role !== 'viewer';

  const [editing, setEditing] = useState<WorkChecklistTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const byTrade = useMemo(() => {
    const groups = new Map<Trade, WorkChecklistTemplate[]>();
    for (const t of templates) {
      const list = groups.get(t.trade) ?? [];
      list.push(t);
      groups.set(t.trade, list);
    }
    for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return tradeKeys.filter((t) => groups.has(t)).map((t) => ({ trade: t, items: groups.get(t) ?? [] }));
  }, [templates, tradeKeys]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="max-w-2xl">
          <h2 className="font-display text-[18px] font-bold text-forest">Checklists</h2>
          <p className="text-[12.5px] text-ink-soft leading-relaxed mt-1">
            Ticking the last step closes the work order.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New checklist
          </Button>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <ListChecks className="w-6 h-6 text-sage mx-auto mb-3" aria-hidden="true" />
          <p className="font-display text-[16px] font-bold text-forest">No checklists yet</p>
          <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
            A cabin turnover, a bathhouse round, a vehicle pre-trip.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {byTrade.map(({ trade, items }) => (
            <section key={trade}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`rounded-tag px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${tradePill(trade)}`}>
                  {labelOf(trade)}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((t) => {
                  const photos = t.items.filter((i) => i.requiresPhoto).length;
                  const shell = `w-full text-left block rounded-card border border-border bg-white px-4 py-3.5 transition-colors ${
                    canEdit ? 'cursor-pointer hover:border-sage' : ''
                  } ${t.isActive ? '' : 'opacity-60'}`;
                  const body = (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-[14px] font-semibold text-forest">{t.name}</b>
                        {!t.isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                            Retired
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-ink-soft mt-1">
                        {t.items.length} step{t.items.length === 1 ? '' : 's'}
                        {photos > 0 && ` · ${photos} ask${photos === 1 ? 's' : ''} for a photo`}
                      </p>
                      {t.items.length > 0 && (
                        <p className="text-[12px] text-ink-faint mt-1.5 leading-relaxed line-clamp-2">
                          {t.items.slice(0, 4).map((i) => i.text).join(' · ')}
                          {t.items.length > 4 ? ' …' : ''}
                        </p>
                      )}
                    </>
                  );
                  return (
                    <li key={t.id}>
                      {canEdit
                        ? <button type="button" onClick={() => setEditing(t)} className={shell}>{body}</button>
                        : <div className={shell}>{body}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <TemplateModal
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function TemplateModal({ template, onClose }: {
  template: WorkChecklistTemplate | null;
  onClose: () => void;
}) {
  const tradeKeys = useTradeKeys();
  const labelOf = useTradeLabel();
  const addTemplate = useCampgroundStore((s) => s.addTemplate);
  const updateTemplate = useCampgroundStore((s) => s.updateTemplate);
  const deleteTemplate = useCampgroundStore((s) => s.deleteTemplate);

  const [draft, setDraft] = useState<WorkChecklistTemplate>(() => template ?? blankTemplate());
  const [newStep, setNewStep] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = template == null;

  const photoSteps = draft.items.filter((i) => i.requiresPhoto).length;
  // The threshold is a judgement, not a rule: past about a third, "take a photo" stops being a
  // signal and starts being the reason the checklist gets ticked from the truck.
  const photoOveruse = draft.items.length >= 3 && photoSteps / draft.items.length > 0.34;

  function setItems(items: ChecklistTemplateItem[]) {
    setDraft((d) => ({ ...d, items }));
  }
  function patchItem(index: number, patch: Partial<ChecklistTemplateItem>) {
    setItems(draft.items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= draft.items.length) return;
    const next = [...draft.items];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setItems(next);
  }
  function addStep() {
    const text = newStep.trim();
    if (!text) return;
    setItems([...draft.items, { text }]);
    setNewStep('');
  }

  function save() {
    if (!draft.name.trim() || draft.items.length === 0) return;
    const row: WorkChecklistTemplate = {
      ...draft,
      name: draft.name.trim(),
      // Strip empty notes so the stored jsonb stays the shape it claims to be.
      items: draft.items
        .map((i) => ({
          text: i.text.trim(),
          ...(i.note?.trim() ? { note: i.note.trim() } : {}),
          ...(i.requiresPhoto ? { requiresPhoto: true } : {}),
        }))
        .filter((i) => i.text),
      updatedAt: new Date().toISOString(),
    };
    if (isNew) addTemplate(row); else updateTemplate(row);
    onClose();
  }

  return (
    <Modal
      title={isNew ? 'New checklist' : draft.name || 'Checklist'}
      onClose={onClose}
      width="min(620px, 94vw)"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
          <div>
            <label className={labelClass} htmlFor="tmpl-name">Name</label>
            <input
              id="tmpl-name" className={inputClass} value={draft.name}
              placeholder="Cabin turnover"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tmpl-trade">Trade</label>
            <select
              id="tmpl-trade" className={`${inputClass} sm:w-44`} value={draft.trade}
              onChange={(e) => setDraft((d) => ({ ...d, trade: e.target.value as Trade }))}
            >
              {tradeKeys.map((t) => <option key={t} value={t}>{labelOf(t)}</option>)}
            </select>
          </div>
        </div>

        {/* ── Steps ────────────────────────────────────────────────────────── */}
        <div>
          <label className={labelClass}>Steps</label>
          {draft.items.length === 0 ? (
            <p className="text-[12.5px] text-ink-faint italic py-2">
              Nothing yet. Add the first step below.
            </p>
          ) : (
            <ol className="space-y-2">
              {draft.items.map((item, i) => (
                <li key={i} className="rounded-card border border-border bg-cream px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-[11px] text-ink-faint pt-2.5 w-5 flex-shrink-0 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        className={inputClass}
                        value={item.text}
                        aria-label={`Step ${i + 1}`}
                        onChange={(e) => patchItem(i, { text: e.target.value })}
                      />
                      <input
                        className={`${inputClass} text-[12px]`}
                        value={item.note ?? ''}
                        placeholder="Note (optional)"
                        aria-label={`Note for step ${i + 1}`}
                        onChange={(e) => patchItem(i, { note: e.target.value })}
                      />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox" className="accent-forest"
                          checked={Boolean(item.requiresPhoto)}
                          onChange={(e) => patchItem(i, { requiresPhoto: e.target.checked })}
                        />
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-soft">
                          <Camera className="w-3.5 h-3.5" aria-hidden="true" /> Ask for a photo
                        </span>
                      </label>
                    </div>
                    {/* Up/down rather than drag: a housekeeping lead reorders this on a phone,
                        and drag-and-drop on touch is where that goes wrong. */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        type="button" onClick={() => move(i, -1)} disabled={i === 0}
                        aria-label={`Move step ${i + 1} up`}
                        className="p-1 rounded-btn text-ink-faint hover:text-forest disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button" onClick={() => move(i, 1)} disabled={i === draft.items.length - 1}
                        aria-label={`Move step ${i + 1} down`}
                        className="p-1 rounded-btn text-ink-faint hover:text-forest disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setItems(draft.items.filter((_, x) => x !== i))}
                        aria-label={`Remove step ${i + 1}`}
                        className="p-1 rounded-btn text-ink-faint hover:text-red cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="flex gap-2 mt-2">
            <input
              className={inputClass}
              value={newStep}
              placeholder="Add a step…"
              aria-label="New step"
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }}
            />
            <Button variant="ghost" onClick={addStep} disabled={!newStep.trim()}>Add</Button>
          </div>
        </div>

        {/* Only worth a line when most of the steps are asking for one. */}
        {photoOveruse && (
          <div className="rounded-card border border-amber/30 bg-amber-bg px-4 py-3">
            <div className="flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-text flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[12px] leading-relaxed text-amber-text">
                {photoSteps} of {draft.items.length} steps need a photo.
              </p>
            </div>
          </div>
        )}

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox" className="mt-0.5 accent-forest"
            checked={!draft.isActive}
            onChange={(e) => setDraft((d) => ({ ...d, isActive: !e.target.checked }))}
          />
          <span className="text-body text-ink">
            Retire this checklist
            <span className="block text-[11.5px] text-ink-soft">
              Hides it from the pickers. Work orders that already have its steps keep them.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={save} disabled={!draft.name.trim() || draft.items.length === 0}>
            {isNew ? 'Create checklist' : 'Save changes'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!isNew && (
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-soft">Delete it?</span>
                  <Button
                    variant="danger" size="sm"
                    onClick={() => { deleteTemplate(draft.id); onClose(); }}
                  >
                    Yes, delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-faint hover:text-red transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

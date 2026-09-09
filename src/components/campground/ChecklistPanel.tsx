import { useRef, useState } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import type { IssueChecklistItem } from '@/lib/types';
import { useTradeLabel } from '@/lib/useTrades';
import { useAuth } from '@/lib/auth';
import { useCampgroundStore, checklistFor } from '@/store/campgroundStore';
import { dbUploadPhoto } from '@/lib/db';
import { generateId } from '@/lib/utils';

interface Props {
  issueId: string;
  /** Set by the detail when Done was pressed on a work order that has steps, so the panel
   *  opens looking like the thing standing between the user and a closed work order. */
  highlight?: boolean;
}

/**
 * The steps on one work order.
 *
 * Ticking the last step closes the work order and unticking one reopens it — both done by a
 * database trigger, so the rule holds however the row was changed (web, iOS, or an offline
 * queue draining hours later). Nothing here closes anything client-side; doing that as well
 * would mean fighting the trigger and losing on a slow connection.
 */
export function ChecklistPanel({ issueId, highlight = false }: Props) {
  const labelOf = useTradeLabel();
  const { currentUser } = useAuth();
  // Raw slices, derived below. Filtering inside a selector allocates a new array per render.
  const checklistItems = useCampgroundStore((s) => s.checklistItems);
  const templates = useCampgroundStore((s) => s.templates);
  const applyTemplate = useCampgroundStore((s) => s.applyTemplate);
  const tickChecklistItem = useCampgroundStore((s) => s.tickChecklistItem);
  const addChecklistStep = useCampgroundStore((s) => s.addChecklistStep);
  const removeChecklistStep = useCampgroundStore((s) => s.removeChecklistStep);

  const items = checklistFor(checklistItems, issueId);
  const done = items.filter((i) => i.isDone).length;

  const [templateId, setTemplateId] = useState('');
  const [applying, setApplying] = useState(false);
  const [newStep, setNewStep] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const author = { id: currentUser.id, name: currentUser.name };
  const activeTemplates = templates.filter((t) => t.isActive);

  async function handleApply() {
    if (!templateId) return;
    setApplying(true);
    // No optimistic rows: the server decides the positions and refuses to apply twice.
    await applyTemplate(issueId, templateId);
    setApplying(false);
    setTemplateId('');
  }

  async function attachPhoto(item: IssueChecklistItem, file: File) {
    setUploadingId(item.id);
    setError(null);
    const url = await dbUploadPhoto(file, `${issueId}-step-${generateId().slice(0, 8)}`);
    setUploadingId(null);
    if (!url) {
      setError('That photo did not upload. The step is still open, so try it again.');
      return;
    }
    tickChecklistItem(item.id, true, author, url);
  }

  function toggle(item: IssueChecklistItem) {
    // Pass the existing photo back through: the writer stores `photoUrl ?? null`, so leaving
    // it out would quietly wipe the proof somebody already took.
    tickChecklistItem(item.id, !item.isDone, author, item.photoUrl);
  }

  function handleAdd() {
    const text = newStep.trim();
    if (!text) return;
    addChecklistStep(issueId, text);
    setNewStep('');
  }

  return (
    <div
      className={`rounded-card border px-3 py-3 transition-colors ${
        highlight ? 'border-forest bg-paper' : 'border-border bg-white'
      }`}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="flex-none text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">
          Steps
        </span>
        <span
          className="h-px flex-1 -translate-y-[3px] bg-[repeating-linear-gradient(90deg,#DED3BB_0_4px,transparent_4px_8px)]"
          aria-hidden="true"
        />
        {items.length > 0 && (
          <span className="flex-none text-[11.5px] tabular-nums text-ink-soft">
            {done} of {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        activeTemplates.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-btn border border-border bg-white px-2 py-1.5 text-[13px] focus:border-sage focus:outline-none sm:flex-1"
            >
              <option value="">Apply a checklist…</option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · {labelOf(t.trade)}</option>
              ))}
            </select>
            <button
              onClick={handleApply}
              disabled={!templateId || applying}
              className="rounded-btn bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper
                         transition-colors hover:bg-forest-mid disabled:opacity-50"
            >
              {applying ? 'Applying…' : 'Apply'}
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-ink-soft">
            No steps yet.
          </p>
        )
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <Step
              key={item.id}
              item={item}
              uploading={uploadingId === item.id}
              onToggle={() => toggle(item)}
              onPhoto={(file) => attachPhoto(item, file)}
              onRemove={() => removeChecklistStep(item.id)}
            />
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-[11.5px] text-red">{error}</p>}

      <div className="mt-2.5 flex items-center gap-1.5">
        <input
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="Add a step…"
          className="min-w-0 flex-1 rounded-btn border border-border bg-white px-2 py-1.5 text-[12.5px]
                     placeholder:text-ink-faint focus:border-sage focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newStep.trim()}
          title="Add this step"
          className="grid h-[30px] w-[30px] flex-none place-items-center rounded-btn border border-border
                     text-forest transition-colors hover:border-sage disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {items.length > 0 && done === items.length - 1 && (
        <p className="mt-2 text-[11.5px] text-ink-soft">One step left. Ticking it closes this work order.</p>
      )}
    </div>
  );
}

function Step({ item, uploading, onToggle, onPhoto, onRemove }: {
  item: IssueChecklistItem;
  uploading: boolean;
  onToggle: () => void;
  onPhoto: (file: File) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // A step that wants proof and does not have it yet asks for the camera instead of the tick,
  // because "beds made" ticked from the parking lot is what the requirement exists to prevent.
  const needsPhotoFirst = item.requiresPhoto && !item.isDone && !item.photoUrl;

  return (
    <li className="group flex items-start gap-2">
      <button
        onClick={() => (needsPhotoFirst ? fileRef.current?.click() : onToggle())}
        disabled={uploading}
        aria-pressed={item.isDone}
        title={needsPhotoFirst ? 'Take a photo to finish this step' : (item.isDone ? 'Untick' : 'Tick')}
        className={`mt-[3px] grid h-[17px] w-[17px] flex-none place-items-center rounded-[3px] border
                    transition-colors disabled:opacity-50 ${
          item.isDone ? 'border-forest bg-forest text-paper' : 'border-border bg-white hover:border-sage'
        }`}
      >
        {item.isDone && (
          <svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" aria-hidden="true">
            <path d="M2.5 6.4 4.8 8.7 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-[13px] leading-snug ${item.isDone ? 'text-ink-faint line-through' : 'text-ink'}`}>
          {item.text}
        </p>
        {item.note && <p className="text-[11.5px] text-ink-soft">{item.note}</p>}
        {item.isDone && item.doneByName && (
          <p className="text-[11px] text-ink-faint">Done by {item.doneByName}</p>
        )}
        {item.photoUrl && (
          <a href={item.photoUrl} target="_blank" rel="noreferrer">
            <img
              src={item.photoUrl}
              alt={`Proof for ${item.text}`}
              className="mt-1 h-14 w-14 rounded-card border border-border object-cover"
            />
          </a>
        )}
      </div>

      {item.requiresPhoto && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title={item.photoUrl ? 'Replace the photo' : 'This step needs a photo'}
            className={`mt-0.5 flex-none transition-colors hover:text-forest disabled:opacity-50 ${
              item.photoUrl ? 'text-sage' : 'text-amber'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onPhoto(file);
            }}
          />
        </>
      )}

      <button
        onClick={onRemove}
        title="Remove this step"
        className="mt-0.5 flex-none text-ink-faint opacity-0 transition-opacity hover:text-red
                   group-hover:opacity-100 focus:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

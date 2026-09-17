import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Link2, Plus } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import type { FoodProgram, FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import type { InventoryCategory, InventoryItem } from '@/lib/types';
import { askedSummary, formatLineQty, formatNumber, formatPickup, kitchenLineView, matchItems } from '@/lib/foodRequests';
import {
  BASE_UNIT, CATEGORY_LABELS, STOCK_UNIT_GROUPS, STOCK_UNIT_OPTIONS, formatInStockUnit, pluralizeUnit, shortDay, suggestStockUnit,
} from '@/lib/commissaryUnits';
import { dbAddKitchenItemForRequest, type DecisionLineInput } from '@/lib/foodRequestsDb';
import type { useFoodRequestActions } from './useFoodRequestActions';
import { ConfirmDialog } from './ConfirmDialog';
import { LateChip } from './foodUi';

/** "jars" and "jar" are one unit; "bags" and "lb" are not. */
function sameUnitWord(a: string | null, b: string | null): boolean {
  const norm = (u: string | null) => (u ?? '').trim().toLowerCase().replace(/(es|s)$/, '');
  return norm(a) === norm(b);
}

interface LineDraft {
  itemId: string | null;
  qty: string;
  unavailable: boolean;
  reason: string;
}

/**
 * Approve (as asked or with changes) or decline, in one place.
 *
 * Linking a free-text line to an inventory item is what makes it count: an unlinked line is
 * visible to people and invisible to ordering, so the modal says so on each one, and a line whose
 * words are not on the kitchen's list at all can be added to it here.
 *
 * Each linked line shows the shelf in the Inventory tab's own terms (on shelf, promised, menu use
 * through the next delivery, this request, left), from the same shelfPictures(), so the two screens
 * cannot tell different stories about the same flour.
 */
export function DecisionModal({ request, lines, program, mode, onClose, actions }: {
  request: FoodRequest;
  lines: FoodRequestLine[];
  program: FoodProgram | undefined;
  mode: 'approve' | 'decline';
  onClose: () => void;
  /** The Requests tab's actions, so the toast and its Undo outlive this dialog. */
  actions: ReturnType<typeof useFoodRequestActions>;
}) {
  const items = useCommissaryStore((s) => s.items);
  const shelfPictures = useCommissaryStore((s) => s.shelfPictures);
  const foodRequests = useCommissaryStore((s) => s.foodRequests);
  const foodRequestLines = useCommissaryStore((s) => s.foodRequestLines);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the data it reads changes
  const pictures = useMemo(() => shelfPictures(), [shelfPictures, items, foodRequests, foodRequestLines]);
  const [note, setNote] = useState(request.kitchenNote ?? '');
  const [initial] = useState<Record<string, LineDraft>>(() => Object.fromEntries(
    lines.map((l) => [l.id, { itemId: l.itemId, qty: formatNumber(l.qtyRequested), unavailable: false, reason: '' }]),
  ));
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(initial);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = note !== (request.kitchenNote ?? '') || lines.some((l) => {
    const a = drafts[l.id], b = initial[l.id];
    return a.itemId !== b.itemId || a.qty !== b.qty || a.unavailable !== b.unavailable || a.reason !== b.reason;
  });
  // Escape, the ×, or a click outside used to throw away every link and amount without a word.
  function requestClose() {
    if (dirty) setConfirmDiscard(true); else onClose();
  }

  const changed = lines.some((l) => {
    const d = drafts[l.id];
    return d.unavailable || Number(d.qty) !== l.qtyRequested || (d.itemId !== l.itemId && !!d.itemId
      && (itemsById.get(d.itemId)?.stockUnit ?? '') !== (l.unitLabel ?? ''));
  });
  const missingReason = mode === 'approve' && lines.some((l) => drafts[l.id].unavailable && !drafts[l.id].reason.trim());
  const invalid = mode === 'approve' && (missingReason || lines.some((l) => !drafts[l.id].unavailable && !(Number(drafts[l.id].qty) > 0)));
  // Base units each item would give out if approved as drafted, across every line of this request.
  const drawByItem = new Map<string, number>();
  for (const l of lines) {
    const d = drafts[l.id];
    const item = d.itemId ? itemsById.get(d.itemId) : undefined;
    if (!item || d.unavailable || !(Number(d.qty) > 0)) continue;
    drawByItem.set(item.id, (drawByItem.get(item.id) ?? 0) + Number(d.qty) * item.stockUnitInBase);
  }
  const unlinked = lines.filter((l) => !drafts[l.id].itemId && !drafts[l.id].unavailable).length;

  async function submit(decision: 'approve' | 'decline') {
    const payload: DecisionLineInput[] = lines.map((l) => {
      const d = drafts[l.id];
      return {
        id: l.id,
        unavailable: d.unavailable,
        qty: d.unavailable ? undefined : Number(d.qty),
        ...(d.unavailable ? { reason: d.reason.trim() } : {}),
        ...(d.itemId && d.itemId !== l.itemId ? { item_id: d.itemId } : {}),
      };
    });
    const ok = await actions.decide(request, decision, decision === 'approve' ? payload : [], note.trim() || null);
    if (ok) onClose();
  }

  const busy = actions.busyId === request.id;

  return (
    <Modal
      title={mode === 'approve' ? `Review ${program?.name ?? request.requesterName}` : `Decline ${program?.name ?? request.requesterName}`}
      onClose={requestClose}
      width="min(680px, calc(100vw - 24px))"
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          {missingReason && <span className="mr-auto text-[12px] font-semibold text-amber-text">Say why each unavailable line is not available.</span>}
          <Button variant="ghost" onClick={requestClose}>Close</Button>
          {mode === 'approve' ? (
            <Button disabled={busy || invalid} onClick={() => submit('approve')}>
              {busy ? 'Saving…' : changed ? 'Approve with changes' : 'Approve'}
            </Button>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => submit('decline')}>{busy ? 'Saving…' : 'Decline request'}</Button>
          )}
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <p className="text-[14px] font-semibold text-forest">{formatPickup(request.pickupDate, request.pickupTime)}</p>
          <p className="text-[12.5px] text-ink-soft">
            {request.requesterName}{request.requesterEmail ? ` · ${request.requesterEmail}` : ''}
            {request.headcount ? ` · ${request.headcount} ${request.headcount === 1 ? 'person' : 'people'}` : ''}{request.purpose ? ` · ${request.purpose}` : ''}
          </p>
          {request.isLate && <div className="mt-1.5"><LateChip hours={request.noticeHours} /></div>}
        </div>

        {mode === 'approve' && (
          <div className="space-y-2.5">
            {lines.map((l) => {
              const d = drafts[l.id];
              const item = d.itemId ? itemsById.get(d.itemId) : undefined;
              const setD = (patch: Partial<LineDraft>) => setDrafts((all) => ({ ...all, [l.id]: { ...all[l.id], ...patch } }));
              return (
                <div key={l.id} data-testid="decision-line" className={`rounded-card border px-3 py-2.5 ${d.unavailable ? 'border-border bg-cream-dark/60' : 'border-border bg-white'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className={`text-[14px] font-semibold ${d.unavailable ? 'text-ink-faint' : 'text-forest'}`}>{l.label}</p>
                    {!(item && item.name !== l.label) && <p className="text-[12px] text-ink-soft">asked {formatLineQty(l.qtyRequested, l.unitLabel)}</p>}
                  </div>
                  {item && item.name !== l.label && (
                    <p className="text-[12px] text-ink-soft" data-testid="asked-for">Asked for: {askedSummary(l)}</p>
                  )}
                  {l.note && <p className="text-[12px] text-ink-soft">“{l.note}”</p>}

                  {!d.unavailable && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!l.itemId && (
                        <ItemLinker
                          line={l}
                          items={items}
                          selected={item}
                          onPick={(it) => setD(it
                            // A number never crosses units: "2 bags" linked to an item counted in lb
                            // leaves the amount blank for the kitchen to fill in, in lb.
                            ? { itemId: it.id, qty: sameUnitWord(it.stockUnit, l.unitLabel) ? formatNumber(l.qtyRequested) : '' }
                            : { itemId: null, qty: formatNumber(l.qtyRequested) })}
                        />
                      )}
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label={`Approved quantity for ${l.label}`}
                          aria-invalid={!(Number(d.qty) > 0)}
                          inputMode="decimal"
                          placeholder={item ? pluralizeUnit(item.stockUnit, 2) : 'Qty'}
                          value={d.qty}
                          onChange={(e) => setD({ qty: e.target.value.replace(/[^0-9.]/g, '').slice(0, 9) })}
                          className={`w-20 rounded-btn border bg-white px-2.5 py-1.5 font-mono text-[13px] focus:border-sage focus:outline-none ${Number(d.qty) > 0 ? 'border-border' : 'border-amber'}`}
                        />
                        <span className="text-[12px] text-ink-soft">{item ? pluralizeUnit(item.stockUnit, Number(d.qty) || 2) : l.unitLabel ?? ''}</span>
                      </div>
                    </div>
                  )}
                  {!d.unavailable && item && !(Number(d.qty) > 0) && (
                    <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-amber-text">
                      Enter how much {item.name} to give, in {pluralizeUnit(item.stockUnit, 2)}. They asked for {formatLineQty(l.qtyRequested, l.unitLabel)}.
                    </p>
                  )}
                  {!d.unavailable && item && (() => {
                    const pic = pictures.get(item.id);
                    if (!pic || item.lastCountedAt == null) return <p className="mt-1.5 text-[11.5px] text-ink-faint">{item.name} has not been counted, so there is no shelf figure yet.</p>;
                    const draw = drawByItem.get(item.id) ?? 0;
                    const left = pic.left - draw;
                    const tone = left < 0 ? 'text-red-text font-semibold' : item.parLevelBase > 0 && left < item.parLevelBase ? 'text-amber-text font-semibold' : 'text-forest font-semibold';
                    const f = (b: number) => formatInStockUnit(item, b);
                    // The Inventory row's terms, one per cell, then this request, then what is left.
                    const terms: [string, string, string?][] = [
                      ['On shelf', f(pic.onShelf)],
                      ['Promised', pic.promised > 0 ? `− ${f(pic.promised)}` : '0', 'to other programs, not yet picked up'],
                      [`Menu to ${shortDay(pic.through)}`, `− ${f(pic.menuUse)}`, 'planned menu use through the next delivery'],
                      ...(pic.incoming > 0 ? [['Arriving', `+ ${f(pic.incoming)}`] as [string, string]] : []),
                      ['This request', `− ${f(draw)}`],
                    ];
                    return (
                      <div data-testid="stock-context" className="mt-2 rounded-[8px] bg-cream/70 px-2.5 py-2">
                        <dl className="flex flex-wrap items-end gap-x-4 gap-y-1.5 text-[11.5px]">
                          {terms.map(([termLabel, value, tip]) => (
                            <div key={termLabel} title={tip}>
                              <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{termLabel}</dt>
                              <dd className="font-mono text-ink" data-testid={`stock-${termLabel.split(' ')[0].toLowerCase()}`}>{value}</dd>
                            </div>
                          ))}
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-ink-faint">Left</dt>
                            <dd className={`font-mono ${tone}`} data-testid="stock-left">{left < 0 ? `short ${f(-left)}` : f(left)}</dd>
                          </div>
                        </dl>
                        {left >= 0 && item.parLevelBase > 0 && left < item.parLevelBase && (
                          <p className="mt-1 text-[11px] text-amber-text">Below your {f(item.parLevelBase)} minimum on hand by {shortDay(pic.through)}.</p>
                        )}
                      </div>
                    );
                  })()}
                  {!d.unavailable && !d.itemId && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-amber-text">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" /> Not on your kitchen list. Approved as is, it goes on the pull list as something to buy or source, and ordering won&rsquo;t count it.
                    </p>
                  )}
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-soft">
                    <input type="checkbox" checked={d.unavailable} onChange={(e) => setD({ unavailable: e.target.checked })} />
                    Not available
                  </label>
                  {d.unavailable && (
                    <div className="mt-1.5">
                      <label htmlFor={`reason-${l.id}`} className="mb-1 block text-[12px] font-medium text-ink">
                        Why, or what to use instead <span className="text-ink-faint">({request.requesterName.split(' ')[0]} sees this)</span>
                      </label>
                      <input id={`reason-${l.id}`} value={d.reason} maxLength={300}
                        aria-invalid={!d.reason.trim()}
                        onChange={(e) => setD({ reason: e.target.value })}
                        placeholder="Out until Monday's delivery, take the oat flour instead"
                        className={`w-full rounded-btn border bg-white px-2.5 py-1.5 text-[13px] focus:border-sage focus:outline-none ${d.reason.trim() ? 'border-border' : 'border-amber'}`} />
                    </div>
                  )}
                </div>
              );
            })}
            {unlinked > 0 && (
              <p className="text-[12px] text-ink-soft">
                {unlinked} line{unlinked === 1 ? ' is' : 's are'} in the requester&rsquo;s own words. Link {unlinked === 1 ? 'it' : 'them'} to an item, or add {unlinked === 1 ? 'it' : 'them'} to your list, to set the food aside and order for it.
              </p>
            )}
          </div>
        )}

        {mode === 'decline' && (
          <div className="overflow-hidden rounded-card border border-border" data-testid="decline-lines">
            {lines.map((l) => {
              const v = kitchenLineView(l, l.itemId ? itemsById.get(l.itemId)?.name : undefined);
              return (
                <div key={l.id} className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
                  <span className="min-w-0 text-[13px] text-forest">{v.name}{v.asked && <span className="block text-[11px] text-ink-soft">asked: {v.asked}</span>}</span>
                  <span className="flex-shrink-0 font-mono text-[12px] text-ink-soft">{formatLineQty(l.qtyRequested, l.unitLabel)}</span>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <label htmlFor="decision-note" className="mb-1 block text-[12px] font-medium text-ink">
            Note to {request.requesterName.split(' ')[0]} <span className="text-ink-faint">(optional, included in the email)</span>
          </label>
          <textarea id="decision-note" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'decline' ? 'We are short on eggs until Monday' : 'Only 3 lb until the Monday delivery'}
            className="w-full rounded-btn border border-border bg-white px-3 py-2 text-[13px] focus:border-sage focus:outline-none" />
        </div>
      </div>
      {confirmDiscard && (
        <ConfirmDialog tone="danger" title="Discard your changes?"
          body="The links, amounts and notes you set here have not been saved."
          confirmLabel="Discard" cancelLabel="Keep editing"
          onCancel={() => setConfirmDiscard(false)} onConfirm={onClose} />
      )}
    </Modal>
  );
}

function ItemLinker({ line, items, selected, onPick }: {
  line: FoodRequestLine;
  items: InventoryItem[];
  selected: InventoryItem | undefined;
  onPick: (item: InventoryItem | null) => void;
}) {
  const label = line.label;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = query.trim();
  // Suggest from the requester's own words until the kitchen starts typing its own search.
  const matches = useMemo(() => {
    const q = typed || label.split(/\s+/).filter((w) => w.length > 2).pop() || label;
    return matchItems(items, q, 6);
  }, [items, typed, label]);

  if (selected) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-btn border border-sage/40 bg-green-muted-bg px-2.5 py-1.5 text-[12.5px] text-green-muted-text">
        <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{selected.name}</span>
        <button type="button" className="ml-1 font-semibold underline" onClick={() => { onPick(null); setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }}>change</button>
      </span>
    );
  }
  if (adding) {
    return (
      <QuickAddItem initialName={typed || label} unitHint={line.unitLabel}
        onCancel={() => { setAdding(false); setTimeout(() => inputRef.current?.focus(), 0); }}
        onAdded={(it) => { setAdding(false); onPick(it); }} />
    );
  }
  const addName = typed || label;
  return (
    <div className="relative min-w-0 flex-1 basis-56">
      <input
        ref={inputRef}
        aria-label={`Link ${label} to an item`}
        placeholder="Link to an item on your list…"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          // Escape closes the search, never the whole dialog (which discarded every edit).
          if (e.key === 'Escape') {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            if (open) setOpen(false); else if (query) setQuery(''); else inputRef.current?.blur();
          }
        }}
        className="w-full rounded-btn border border-dashed border-amber/60 bg-white px-2.5 py-1.5 text-[13px] focus:border-sage focus:outline-none"
      />
      {open && (
        <ul role="listbox" data-testid="link-results" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-card border border-border bg-white shadow-lg">
          {matches.length === 0 && (
            <li className="px-3 py-2 text-[12.5px] text-ink-soft" data-testid="link-empty">
              Nothing on your kitchen list matches &ldquo;{typed || label}&rdquo;.
            </li>
          )}
          {matches.map((m) => (
            <li key={m.id} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(m); setOpen(false); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-cream">
                <span className="truncate">{m.name}</span>
                <span className="flex-shrink-0 text-[11px] text-ink-soft">{m.stockUnit}</span>
              </button>
            </li>
          ))}
          <li className="border-t border-border">
            <button type="button" data-testid="quick-add-item" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); setAdding(true); }}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] font-semibold text-forest hover:bg-cream">
              <Plus className="h-3.5 w-3.5 flex-shrink-0" /> Add &ldquo;{addName}&rdquo; to the kitchen list
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** The typed words become an item (not counted, no minimum yet), then the line links to it. */
function QuickAddItem({ initialName, unitHint, onCancel, onAdded }: {
  initialName: string;
  unitHint: string | null;
  onCancel: () => void;
  onAdded: (item: InventoryItem) => void;
}) {
  const campId = useCampStore((s) => s.currentCamp?.id);
  const hinted = STOCK_UNIT_OPTIONS.find((o) => unitHint && o.value === unitHint.trim().toLowerCase().replace(/e?s$/, ''));
  const [name, setName] = useState(initialName.charAt(0).toUpperCase() + initialName.slice(1));
  const [unit, setUnit] = useState(hinted?.value ?? suggestStockUnit(initialName) ?? 'each');
  const [category, setCategory] = useState<InventoryCategory>('other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const opt = STOCK_UNIT_OPTIONS.find((o) => o.value === unit) ?? STOCK_UNIT_OPTIONS[0];
    if (!campId || !name.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err, id } = await dbAddKitchenItemForRequest(campId, {
      name: name.trim(), dimension: opt.dimension, baseUnit: BASE_UNIT[opt.dimension], stockUnit: opt.value,
      stockUnitInBase: opt.inBase, category,
    });
    setBusy(false);
    if (err || !id) { setError(err ?? 'Could not add it.'); return; }
    const existing = useCommissaryStore.getState().items.find((i) => i.id === id);
    const now = new Date().toISOString();
    const item: InventoryItem = existing ?? {
      id, name: name.trim(), category, storageLocation: 'other', dimension: opt.dimension, baseUnit: BASE_UNIT[opt.dimension],
      stockUnit: opt.value, stockUnitInBase: opt.inBase, purchaseUnit: opt.value, purchaseUnitInBase: opt.inBase, unitPrice: null,
      onHandBase: 0, parLevelBase: 0, lastCountedAt: null, shelfLifeDays: null, vendorId: null, allergens: [], dietary: [],
      kosherType: null, notes: null, sortOrder: useCommissaryStore.getState().items.length, createdAt: now, updatedAt: now,
    };
    // Shown at once; the realtime reload brings the database's row a moment later.
    if (!existing) useCommissaryStore.setState((s) => ({ items: [...s.items, item] }));
    onAdded(item);
  }

  return (
    <div data-testid="quick-add-form" className="w-full rounded-card border border-sage/40 bg-green-muted-bg/40 px-2.5 py-2"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onCancel(); } }}>
      <p className="mb-1.5 text-[12px] font-semibold text-forest">Add to the kitchen list</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 basis-40 text-[11px] text-ink-soft">Name
          <input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="New item name"
            className="mt-0.5 block w-full rounded-btn border border-border bg-white px-2.5 py-1.5 text-[13px] text-ink focus:border-sage focus:outline-none" />
        </label>
        <label className="text-[11px] text-ink-soft">Counted in
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Counted in"
            className="mt-0.5 block rounded-btn border border-border bg-white px-2 py-1.5 text-[13px] text-ink focus:border-sage focus:outline-none">
            {STOCK_UNIT_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {STOCK_UNIT_OPTIONS.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-soft">Category
          <select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)} aria-label="Category"
            className="mt-0.5 block rounded-btn border border-border bg-white px-2 py-1.5 text-[13px] text-ink focus:border-sage focus:outline-none">
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-soft">It starts uncounted with no minimum; count it in Inventory when it arrives.</p>
      {error && <p role="alert" className="mt-1 text-[12px] font-semibold text-red-text">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={busy || !name.trim()} onClick={add}>{busy ? 'Adding…' : 'Add and link'}</Button>
      </div>
    </div>
  );
}

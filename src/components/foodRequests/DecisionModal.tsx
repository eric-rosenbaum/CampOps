import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Link2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import type { FoodProgram, FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import type { InventoryItem } from '@/lib/types';
import { askedSummary, formatLineQty, formatNumber, formatPickup, kitchenLineView, matchItems } from '@/lib/foodRequests';
import { formatInStockUnit } from '@/lib/commissaryUnits';
import type { DecisionLineInput } from '@/lib/foodRequestsDb';
import { useFoodRequestActions } from './useFoodRequestActions';
import { LateChip } from './foodUi';

interface LineDraft {
  itemId: string | null;
  qty: string;
  unavailable: boolean;
}

/**
 * Approve (as asked or with changes) or decline, in one place.
 *
 * Linking a free-text line to an inventory item is what makes it count: an unlinked line is
 * visible to people and invisible to ordering, so the modal says so on each one.
 */
export function DecisionModal({ request, lines, program, mode, onClose }: {
  request: FoodRequest;
  lines: FoodRequestLine[];
  program: FoodProgram | undefined;
  mode: 'approve' | 'decline';
  onClose: () => void;
}) {
  const items = useCommissaryStore((s) => s.items);
  const shelfPictures = useCommissaryStore((s) => s.shelfPictures);
  const foodRequests = useCommissaryStore((s) => s.foodRequests);
  const foodRequestLines = useCommissaryStore((s) => s.foodRequestLines);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // The same shelf picture the Inventory tab shows, so "left after this" matches what it will say.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the data it reads changes
  const pictures = useMemo(() => shelfPictures(), [shelfPictures, items, foodRequests, foodRequestLines]);
  const actions = useFoodRequestActions();
  const [note, setNote] = useState(request.kitchenNote ?? '');
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() => Object.fromEntries(
    lines.map((l) => [l.id, { itemId: l.itemId, qty: formatNumber(l.qtyRequested), unavailable: false }]),
  ));

  const changed = lines.some((l) => {
    const d = drafts[l.id];
    return d.unavailable || Number(d.qty) !== l.qtyRequested || (d.itemId !== l.itemId && !!d.itemId
      && (itemsById.get(d.itemId)?.stockUnit ?? '') !== (l.unitLabel ?? ''));
  });
  const invalid = mode === 'approve' && lines.some((l) => !drafts[l.id].unavailable && !(Number(drafts[l.id].qty) > 0));
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
      onClose={onClose}
      width="min(640px, calc(100vw - 24px))"
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
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
            {request.headcount ? ` · ${request.headcount} people` : ''}{request.purpose ? ` · ${request.purpose}` : ''}
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
                    <p className="text-[12px] text-ink-soft">asked {formatLineQty(l.qtyRequested, l.unitLabel)}</p>
                  </div>
                  {item && item.name !== l.label && (
                    <p className="text-[12px] text-ink-soft" data-testid="asked-for">Asked for: {askedSummary(l)}</p>
                  )}
                  {l.note && <p className="text-[12px] text-ink-soft">“{l.note}”</p>}

                  {!d.unavailable && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!l.itemId && (
                        <ItemLinker
                          label={l.label}
                          items={items}
                          selected={item}
                          onPick={(it) => setD(it
                            // A number never crosses units: "2 bags" linked to an item counted in lb
                            // leaves the amount blank for the kitchen to fill in, in lb.
                            ? { itemId: it.id, qty: (it.stockUnit ?? '') === (l.unitLabel ?? '') ? formatNumber(l.qtyRequested) : '' }
                            : { itemId: null, qty: formatNumber(l.qtyRequested) })}
                        />
                      )}
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label={`Approved quantity for ${l.label}`}
                          aria-invalid={!(Number(d.qty) > 0)}
                          inputMode="decimal"
                          placeholder={item ? item.stockUnit : 'Qty'}
                          value={d.qty}
                          onChange={(e) => setD({ qty: e.target.value.replace(/[^0-9.]/g, '').slice(0, 9) })}
                          className={`w-20 rounded-btn border bg-white px-2.5 py-1.5 font-mono text-[13px] focus:border-sage focus:outline-none ${Number(d.qty) > 0 ? 'border-border' : 'border-amber'}`}
                        />
                        <span className="text-[12px] text-ink-soft">{item ? item.stockUnit : l.unitLabel ?? ''}</span>
                      </div>
                    </div>
                  )}
                  {!d.unavailable && item && !(Number(d.qty) > 0) && (
                    <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-amber-text">
                      How much {item.name} to give, in {item.stockUnit}? They asked for {formatLineQty(l.qtyRequested, l.unitLabel)}.
                    </p>
                  )}
                  {!d.unavailable && item && (() => {
                    const pic = pictures.get(item.id);
                    if (!pic || item.lastCountedAt == null) return <p className="mt-1.5 text-[11.5px] text-ink-faint">{item.name} has not been counted, so there is no shelf figure yet.</p>;
                    const draw = drawByItem.get(item.id) ?? 0;
                    const left = pic.leftAfter - draw;
                    const tone = left < 0 ? 'text-red-text font-semibold' : item.parLevelBase > 0 && left < item.parLevelBase ? 'text-amber-text font-semibold' : 'text-ink';
                    return (
                      <p data-testid="stock-context" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-soft">
                        <span>On shelf <span className="font-mono text-ink">{formatInStockUnit(item, pic.onShelf)}</span></span>
                        <span>Already promised <span className="font-mono text-ink">{formatInStockUnit(item, pic.promised)}</span></span>
                        <span>Left after this <span className={`font-mono ${tone}`}>{left < 0 ? `short ${formatInStockUnit(item, -left)}` : formatInStockUnit(item, left)}</span>
                          {left >= 0 && item.parLevelBase > 0 && left < item.parLevelBase ? ' (below min on hand)' : ''}</span>
                      </p>
                    );
                  })()}
                  {!d.unavailable && !d.itemId && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-amber-text">
                      <AlertTriangle className="h-3 w-3" /> Not linked to an item, so ordering won&rsquo;t count it.
                    </p>
                  )}
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-soft">
                    <input type="checkbox" checked={d.unavailable} onChange={(e) => setD({ unavailable: e.target.checked })} />
                    Not available
                  </label>
                </div>
              );
            })}
            {unlinked > 0 && (
              <p className="text-[12px] text-ink-soft">
                {unlinked} line{unlinked === 1 ? ' is' : 's are'} in the requester&rsquo;s own words. Link {unlinked === 1 ? 'it' : 'them'} to an item to set the food aside and order for it.
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
    </Modal>
  );
}

function ItemLinker({ label, items, selected, onPick }: {
  label: string;
  items: InventoryItem[];
  selected: InventoryItem | undefined;
  onPick: (item: InventoryItem | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Suggest from the requester's own words until the kitchen starts typing its own search.
  const matches = useMemo(() => {
    const q = query.trim() || label.split(/\s+/).filter((w) => w.length > 2).pop() || label;
    return matchItems(items, q, 6);
  }, [items, query, label]);

  if (selected) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-btn border border-sage/40 bg-green-muted-bg px-2.5 py-1.5 text-[12.5px] text-green-muted-text">
        <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{selected.name}</span>
        <button type="button" className="ml-1 font-semibold underline" onClick={() => { onPick(null); setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }}>change</button>
      </span>
    );
  }
  return (
    <div className="relative min-w-0 flex-1 basis-56">
      <input
        ref={inputRef}
        aria-label={`Link ${label} to an item`}
        placeholder="Link to an item…"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        className="w-full rounded-btn border border-dashed border-amber/60 bg-white px-2.5 py-1.5 text-[13px] focus:border-sage focus:outline-none"
      />
      {open && matches.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-card border border-border bg-white shadow-lg">
          {matches.map((m) => (
            <li key={m.id} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(m); setOpen(false); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-cream">
                <span className="truncate">{m.name}</span>
                <span className="flex-shrink-0 text-[11px] text-ink-soft">{m.stockUnit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

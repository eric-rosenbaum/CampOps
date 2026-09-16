import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, Link2, Loader2, X } from 'lucide-react';
import type { FoodFormItem, FoodRequestDraft, FoodRequestDraftLine } from '@/lib/foodRequestTypes';
import { checkDraft, formatClock, formatDay, formatNotice, matchItems, todayInZone } from '@/lib/foodRequests';

/**
 * The one request form, used by the no-login program link and by signed-in staff.
 *
 * Built for a counselor on a phone between activities who has never seen the app: one column,
 * big targets, type what you need and pick it from the kitchen's list or keep your own words.
 * Short notice is shown before sending, in hours, and never blocks — the kitchen decides.
 */

// Width is kept out of the shared string: a `w-full` in it beats an appended `w-24` by
// stylesheet order, not attribute order (CLAUDE.md trap 10).
const fieldBase =
  'rounded-btn border border-border bg-white px-3 py-2.5 text-[16px] sm:text-[14px] text-ink ' +
  'focus:border-sage focus:outline-none';
const field = `w-full ${fieldBase}`;
const labelCls = 'block text-[13px] font-semibold text-forest mb-1.5';

const blankLine = (): FoodRequestDraftLine => ({ itemId: null, label: '', qty: '', unitLabel: '' });

export interface RequestFormProps {
  items: FoodFormItem[];
  timeZone: string;
  cutoffHours: number;
  pickupLocation: string | null;
  /** Signed-in flavor: pick which program this is for (optional). */
  programs?: { id: string; name: string }[];
  /** Prefilled contact details (signed-in); the no-login form starts empty. */
  initialContact?: { name: string; email: string };
  /** When false the contact block is hidden and the account's details are used. */
  askContact: boolean;
  submitLabel?: string;
  /** Resolves to an error message to show, or null on success. */
  onSubmit: (draft: FoodRequestDraft) => Promise<string | null>;
}

export function RequestForm({
  items, timeZone, cutoffHours, pickupLocation, programs, initialContact, askContact,
  submitLabel = 'Send to the kitchen', onSubmit,
}: RequestFormProps) {
  const [draft, setDraft] = useState<FoodRequestDraft>(() => ({
    programId: null,
    requesterName: initialContact?.name ?? '',
    requesterEmail: initialContact?.email ?? '',
    requesterPhone: '',
    notifyBy: 'email',
    pickupDate: '',
    pickupTime: '',
    purpose: '',
    headcount: '',
    lines: [blankLine()],
  }));
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Re-evaluated on each render so the notice counts down while someone dawdles on the form.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const check = checkDraft(draft, { timeZone, cutoffHours, now, requireContact: askContact });
  const minDate = todayInZone(timeZone, now);

  function set<K extends keyof FoodRequestDraft>(key: K, value: FoodRequestDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setLine(i: number, patch: Partial<FoodRequestDraftLine>) {
    setDraft((d) => {
      const lines = d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l));
      // Always one empty line waiting at the bottom, so a third item is a tap, not a button hunt.
      const last = lines[lines.length - 1];
      if (last && (last.label.trim() || last.itemId) && lines.length < 40) lines.push(blankLine());
      return { ...d, lines };
    });
  }

  function removeLine(i: number) {
    setDraft((d) => {
      const lines = d.lines.filter((_, j) => j !== i);
      return { ...d, lines: lines.length ? lines : [blankLine()] };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (check.errors.length) return;
    setSending(true);
    const err = await onSubmit(draft);
    setSending(false);
    if (err) setServerError(err);
  }

  const pickupWords = draft.pickupDate && draft.pickupTime
    ? `${formatDay(draft.pickupDate)} ${formatClock(draft.pickupTime)}`
    : null;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="flex items-start gap-2.5 rounded-card border border-border bg-white px-3.5 py-3">
        <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" />
        <p className="text-[14px] leading-snug text-ink">
          The kitchen asks for <strong>{formatHoursPlain(cutoffHours)}&rsquo; notice</strong>.
          {pickupLocation && <> Pickups are at <strong>{pickupLocation}</strong>.</>}
        </p>
      </div>

      {programs && programs.length > 0 && (
        <div>
          <label className={labelCls} htmlFor="fr-program">For which program?</label>
          <select id="fr-program" className={field} value={draft.programId ?? ''}
            onChange={(e) => set('programId', e.target.value || null)}>
            <option value="">No program — just me</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <fieldset>
        <legend className={labelCls}>What do you need?</legend>
        <p className="-mt-1 mb-2.5 text-[12.5px] text-ink-soft">
          Start typing to pick from the kitchen&rsquo;s list, or just write it in your own words.
        </p>
        <div className="space-y-2.5">
          {draft.lines.map((line, i) => (
            <LineRow
              key={i}
              index={i}
              line={line}
              items={items}
              canRemove={draft.lines.length > 1 && (!!line.label || !!line.itemId)}
              onChange={(patch) => setLine(i, patch)}
              onRemove={() => removeLine(i)}
            />
          ))}
        </div>
        {draft.lines.length >= 40 && <p className="mt-2 text-[12px] text-ink-soft">That&rsquo;s the most one request can hold.</p>}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="fr-date">Pickup day</label>
          <input id="fr-date" type="date" className={field} min={minDate} value={draft.pickupDate}
            onChange={(e) => set('pickupDate', e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="fr-time">Time</label>
          <input id="fr-time" type="time" className={field} step={900} value={draft.pickupTime}
            onChange={(e) => set('pickupTime', e.target.value)} />
        </div>
      </div>

      {check.late && check.hours != null && pickupWords && (
        <div role="alert" data-testid="late-warning"
          className="flex items-start gap-2.5 rounded-card border-2 border-amber/50 bg-amber-bg px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-text" />
          <p className="text-[14px] leading-snug text-amber-text">
            <strong>Short notice.</strong> {pickupWords} is {formatNotice(check.hours)} away, and the kitchen asks
            for {formatHoursPlain(cutoffHours)}, so they may not be able to fill all of it. You can still send it.
          </p>
        </div>
      )}

      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div>
          <label className={labelCls} htmlFor="fr-purpose">What&rsquo;s it for?</label>
          <input id="fr-purpose" className={field} value={draft.purpose} maxLength={500}
            placeholder="Pancake night" onChange={(e) => set('purpose', e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="fr-headcount">People</label>
          <input id="fr-headcount" className={field} inputMode="numeric" value={draft.headcount}
            placeholder="14" onChange={(e) => set('headcount', e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} />
        </div>
      </div>

      {askContact && (
        <fieldset className="space-y-3">
          <legend className={labelCls}>Who&rsquo;s asking?</legend>
          <input aria-label="Your name" className={field} autoComplete="name" placeholder="Your name"
            value={draft.requesterName} maxLength={120} onChange={(e) => set('requesterName', e.target.value)} />
          <input aria-label="Email" className={field} type="email" autoComplete="email" inputMode="email" placeholder="Email"
            value={draft.requesterEmail} maxLength={200} onChange={(e) => set('requesterEmail', e.target.value)} />
          <input aria-label="Mobile phone (optional)" className={field} type="tel" autoComplete="tel" inputMode="tel"
            placeholder="Mobile phone (optional)" value={draft.requesterPhone} maxLength={40}
            onChange={(e) => { set('requesterPhone', e.target.value); if (!e.target.value.trim()) set('notifyBy', 'email'); }} />
          <div>
            <p className="mb-1.5 text-[13px] text-ink-soft">How should the kitchen reach you?</p>
            <div className="grid grid-cols-2 gap-2">
              {(['email', 'text'] as const).map((k) => {
                const disabled = k === 'text' && !draft.requesterPhone.trim();
                return (
                  <button key={k} type="button" disabled={disabled} aria-pressed={draft.notifyBy === k}
                    onClick={() => set('notifyBy', k)}
                    className={`rounded-btn border px-3 py-2.5 text-[14px] font-semibold transition-colors disabled:opacity-40 ${
                      draft.notifyBy === k ? 'border-forest bg-forest text-paper' : 'border-border bg-white text-forest'
                    }`}>
                    {k === 'email' ? 'Email' : 'Text message'}
                  </button>
                );
              })}
            </div>
            {draft.notifyBy === 'text' && (
              <p className="mt-1.5 text-[12px] text-ink-soft">Texts are not switched on yet, so you&rsquo;ll get the same updates by email.</p>
            )}
          </div>
        </fieldset>
      )}

      {((touched && check.errors.length > 0) || serverError) && (
        <div role="alert" className="rounded-card border border-red/30 bg-red-bg px-3.5 py-3 text-[14px] text-red-text">
          {serverError ?? check.errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}

      <button type="submit" disabled={sending}
        className="flex w-full items-center justify-center gap-2 rounded-btn bg-forest px-4 py-3.5 text-[16px] font-bold text-paper transition-colors hover:bg-forest-mid disabled:opacity-60">
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        {sending ? 'Sending…' : submitLabel}
      </button>
    </form>
  );
}

function formatHoursPlain(h: number): string {
  if (h % 24 === 0 && h >= 48) return `${h / 24} days`;
  return `${h} hours`;
}

function LineRow({ index, line, items, canRemove, onChange, onRemove }: {
  index: number;
  line: FoodRequestDraftLine;
  items: FoodFormItem[];
  canRemove: boolean;
  onChange: (patch: Partial<FoodRequestDraftLine>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => (line.itemId ? [] : matchItems(items, line.label, 6)), [items, line.label, line.itemId]);
  const showList = open && matches.length > 0;

  useEffect(() => {
    function onDoc(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); };
  }, []);

  function pick(item: FoodFormItem) {
    onChange({ itemId: item.id, label: item.name, unitLabel: item.unit });
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative rounded-card border border-border bg-white p-2.5" data-testid={`line-${index}`}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            aria-label={`Item ${index + 1}`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            className={`${field} ${line.itemId ? 'pr-8' : ''}`}
            placeholder={index === 0 ? 'e.g. flour, eggs, marshmallows' : 'Another item'}
            value={line.label}
            maxLength={120}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              // Editing a picked item's name makes it the person's own words again.
              onChange({ label: e.target.value, itemId: null, unitLabel: line.itemId ? '' : line.unitLabel });
              setOpen(true);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (!showList) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); pick(matches[active]); }
              else if (e.key === 'Escape') setOpen(false);
            }}
          />
          {line.itemId && (
            <Link2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage" aria-label="On the kitchen's list" />
          )}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove item ${index + 1}`}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-btn text-ink-faint hover:bg-cream hover:text-red">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul id={listId} role="listbox"
          className="absolute left-2.5 right-2.5 top-[calc(100%-6px)] z-20 max-h-64 overflow-y-auto rounded-card border border-border bg-white shadow-lg">
          {matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[15px] ${i === active ? 'bg-cream' : ''}`}>
                <span className="truncate text-ink">{m.name}</span>
                <span className="flex-shrink-0 text-[12px] text-ink-soft">{m.unit}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}
              className="w-full border-t border-border px-3 py-2.5 text-left text-[13px] text-ink-soft">
              Keep &ldquo;{line.label.trim()}&rdquo; as I wrote it
            </button>
          </li>
        </ul>
      )}

      {(line.label.trim() || line.itemId) && (
        <div className="mt-2 flex items-center gap-2">
          <input aria-label={`How much ${line.label || `item ${index + 1}`}`} className={`${fieldBase} w-24 flex-none`} inputMode="decimal"
            placeholder="Qty" value={line.qty}
            onChange={(e) => onChange({ qty: e.target.value.replace(/[^0-9.]/g, '').slice(0, 9) })} />
          {line.itemId ? (
            <span className="text-[14px] text-ink-soft">{line.unitLabel}</span>
          ) : (
            <input aria-label={`Unit for ${line.label || `item ${index + 1}`}`} className={`${fieldBase} min-w-0 flex-1`}
              placeholder="bags, lb, dozen…" value={line.unitLabel} maxLength={30}
              onChange={(e) => onChange({ unitLabel: e.target.value })} />
          )}
        </div>
      )}
    </div>
  );
}

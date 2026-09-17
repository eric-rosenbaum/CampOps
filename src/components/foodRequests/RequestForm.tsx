import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, Loader2, X } from 'lucide-react';
import type { FoodFormItem, FoodRequestDraft, FoodRequestDraftLine } from '@/lib/foodRequestTypes';
import { checkDraft, formatClock, formatDay, formatNotice, formatNoticeRule, matchItems, parseAmount, readAmountText, todayInZone, type DraftField } from '@/lib/foodRequests';
import { pluralizeUnit } from '@/lib/commissaryUnits';

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
/** Added to a field with an error; the border colour class it replaces is dropped by `withError`. */
const errorRing = 'border-red ring-1 ring-red/40';
const withError = (cls: string, bad: boolean) => (bad ? `${cls.replace('border-border', '')} ${errorRing}` : cls);

/** The element each error belongs to, so the first one can be scrolled to and focused. */
function fieldElementId(f: DraftField, draftHasDate: boolean): string {
  if (f === 'lines') return 'fr-item-0';
  if (f === 'pickup') return draftHasDate ? 'fr-time' : 'fr-date';
  if (f === 'name') return 'fr-name';
  if (f === 'email') return 'fr-email';
  return `fr-qty-${f.slice(4)}`;
}

/** "boxes" and "box" are the same unit for deciding whether a typed amount fits a picked item. */
const sameUnit = (a: string, b: string) => {
  const norm = (u: string) => u.trim().toLowerCase().replace(/(es|s)$/, '');
  return norm(a) === norm(b);
};
const labelCls = 'block text-[13px] font-semibold text-forest mb-1.5';

const blankLine = (): FoodRequestDraftLine => ({ itemId: null, label: '', qty: '', unitLabel: '' });

/**
 * Name, email, phone and how to reach them, remembered on this device: a counselor sends several
 * requests a week and typed all four every time. localStorage can be blocked (private mode), so
 * every read and write is guarded and the form works without it.
 */
const CONTACT_KEY = 'campcommand-food-contact';
type SavedContact = { name: string; email: string; phone: string; notifyBy: 'email' | 'text' };
function readSavedContact(): SavedContact | null {
  try {
    const v = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? 'null') as Partial<SavedContact> | null;
    if (!v || typeof v !== 'object') return null;
    return { name: String(v.name ?? ''), email: String(v.email ?? ''), phone: String(v.phone ?? ''), notifyBy: v.notifyBy === 'text' ? 'text' : 'email' };
  } catch { return null; }
}
function saveContact(c: SavedContact) {
  try { localStorage.setItem(CONTACT_KEY, JSON.stringify(c)); } catch { /* storage blocked */ }
}

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
  const [draft, setDraft] = useState<FoodRequestDraft>(() => {
    const saved = askContact && !initialContact ? readSavedContact() : null;
    return {
    programId: null,
    requesterName: initialContact?.name ?? saved?.name ?? '',
    requesterEmail: initialContact?.email ?? saved?.email ?? '',
    requesterPhone: saved?.phone ?? '',
    notifyBy: saved?.phone ? saved.notifyBy : 'email',
    pickupDate: '',
    pickupTime: '',
    purpose: '',
    headcount: '',
    lines: [blankLine()],
    };
  });
  const [remembered] = useState(() => askContact && !initialContact && !!readSavedContact());
  const [headcountText, setHeadcountText] = useState('');
  // Errors show for a field once it has been left, or once a send was tried with it wrong. They
  // used to appear on every row the moment Send was tapped, including rows added afterwards.
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [failedOnSend, setFailedOnSend] = useState<Set<string>>(() => new Set());
  const markLeft = (f: string) => setLeft((prev) => (prev.has(f) ? prev : new Set([...prev, f])));
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
    setFailedOnSend(new Set(check.fieldErrors.map((x) => x.field)));
    setServerError(null);
    if (check.fieldErrors.length) {
      // Take the person to the first problem, in form order, instead of a list at the bottom.
      const el = document.getElementById(fieldElementId(check.fieldErrors[0].field, !!draft.pickupDate));
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
      }
      return;
    }
    setSending(true);
    if (askContact && !initialContact) {
      saveContact({ name: draft.requesterName.trim(), email: draft.requesterEmail.trim(), phone: draft.requesterPhone.trim(), notifyBy: draft.notifyBy });
    }
    const err = await onSubmit(draft);
    setSending(false);
    if (err) setServerError(err);
  }

  const errorFor = (f: DraftField) => (left.has(f) || failedOnSend.has(f) ? check.fieldErrors.find((e) => e.field === f)?.message ?? null : null);
  const shownErrors = check.fieldErrors.filter((e) => left.has(e.field) || failedOnSend.has(e.field));
  // Items already picked on another line are not suggested again (Graham crackers showed twice).
  const pickedIds = draft.lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const pickupError = errorFor('pickup');

  const pickupWords = draft.pickupDate && draft.pickupTime
    ? `${formatDay(draft.pickupDate)} ${formatClock(draft.pickupTime)}`
    : null;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="flex items-start gap-2.5 rounded-card border border-border bg-white px-3.5 py-3">
        <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" />
        <p className="text-[14px] leading-snug text-ink">
          The kitchen asks for <strong>{formatNoticeRule(cutoffHours)}</strong>.
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
              qtyError={errorFor(`qty-${i}`)}
              itemError={i === 0 ? errorFor('lines') : null}
              excludeIds={pickedIds.filter((id) => id !== line.itemId)}
              onLeaveQty={() => markLeft(`qty-${i}`)}
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
          <input id="fr-date" type="date" className={withError(field, !!pickupError && (!draft.pickupDate || !!draft.pickupTime))} min={minDate} value={draft.pickupDate}
            aria-invalid={!!pickupError} aria-describedby={pickupError ? 'fr-pickup-error' : undefined}
            onBlur={() => { if (draft.pickupTime) markLeft('pickup'); }}
            onChange={(e) => set('pickupDate', e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="fr-time">Time</label>
          <input id="fr-time" type="time" className={withError(field, !!pickupError && (!draft.pickupTime || !!draft.pickupDate))} step={900} value={draft.pickupTime}
            aria-invalid={!!pickupError} aria-describedby={pickupError ? 'fr-pickup-error' : undefined}
            onBlur={() => markLeft('pickup')}
            onChange={(e) => set('pickupTime', e.target.value)} />
        </div>
        {pickupError && <FieldError id="fr-pickup-error" className="col-span-2">{pickupError}</FieldError>}
      </div>

      {check.late && check.hours != null && pickupWords && (
        <div role="alert" data-testid="late-warning"
          className="flex items-start gap-2.5 rounded-card border-2 border-amber/50 bg-amber-bg px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-text" />
          <p className="text-[14px] leading-snug text-amber-text">
            <strong>Short notice.</strong> {pickupWords} is {formatNotice(check.hours)} away, and the kitchen asks
            for {formatNoticeRule(cutoffHours)}, so they may not be able to fill all of it. You can still send it.
          </p>
        </div>
      )}

      <div className="grid grid-cols-[1fr_7.5rem] gap-3">
        <div>
          <label className={labelCls} htmlFor="fr-purpose">What&rsquo;s it for?</label>
          <input id="fr-purpose" className={`${field} placeholder:text-ink-faint`} value={draft.purpose} maxLength={400}
            placeholder="e.g. pancake night" onChange={(e) => set('purpose', e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="fr-headcount">How many people</label>
          <input id="fr-headcount" className={`${field} placeholder:text-ink-faint`} inputMode="numeric" value={headcountText}
            placeholder="e.g. 14" maxLength={40}
            onChange={(e) => {
              const { value, words } = readAmountText(e.target.value);
              setHeadcountText(e.target.value);
              setDraft((d) => ({ ...d, headcount: value.replace(/\..*$/, '').slice(0, 5), headcountWords: words ?? undefined }));
            }} />
        </div>
        {draft.headcountWords && (
          <p className="col-span-2 -mt-1.5 text-[12.5px] text-ink-soft" data-testid="headcount-words">
            {draft.headcount ? <>The kitchen plans for <strong>{draft.headcount}</strong> and sees your words, &ldquo;{draft.headcountWords}&rdquo;.</>
              : <>The kitchen will see &ldquo;{draft.headcountWords}&rdquo;. A number helps them plan.</>}
          </p>
        )}
      </div>

      {askContact && (
        <fieldset className="space-y-3">
          <legend className={labelCls}>Who&rsquo;s asking?</legend>
          {remembered && <p className="-mt-1 text-[12.5px] text-ink-soft" data-testid="contact-remembered">Filled in from your last request on this phone.</p>}
          <div>
            <input id="fr-name" aria-label="Your name" className={withError(field, !!errorFor('name'))} autoComplete="name" placeholder="Your name"
              aria-invalid={!!errorFor('name')} aria-describedby={errorFor('name') ? 'fr-name-error' : undefined}
              onBlur={() => markLeft('name')}
              value={draft.requesterName} maxLength={120} onChange={(e) => set('requesterName', e.target.value)} />
            {errorFor('name') && <FieldError id="fr-name-error">{errorFor('name')}</FieldError>}
          </div>
          <div>
            <input id="fr-email" aria-label="Email" className={withError(field, !!errorFor('email'))} type="email" autoComplete="email" inputMode="email" placeholder="Email"
              aria-invalid={!!errorFor('email')} aria-describedby={errorFor('email') ? 'fr-email-error' : undefined}
              onBlur={() => markLeft('email')}
              value={draft.requesterEmail} maxLength={200} onChange={(e) => set('requesterEmail', e.target.value)} />
            {errorFor('email') && <FieldError id="fr-email-error">{errorFor('email')}</FieldError>}
          </div>
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
                    title={disabled ? 'Add a mobile number to get texts' : undefined}
                    onClick={() => set('notifyBy', k)}
                    className={`rounded-btn border px-3 py-2.5 text-[14px] font-semibold transition-colors disabled:opacity-40 ${
                      draft.notifyBy === k ? 'border-forest bg-forest text-paper' : 'border-border bg-white text-forest'
                    }`}>
                    {k === 'email' ? 'Email' : 'Text message'}
                  </button>
                );
              })}
            </div>
            {!draft.requesterPhone.trim() && (
              <p className="mt-1.5 text-[12px] text-ink-soft">To choose text, add a mobile number above.</p>
            )}
            {draft.notifyBy === 'text' && (
              <p className="mt-1.5 text-[12px] text-ink-soft" data-testid="text-not-on">Texts aren&rsquo;t switched on yet, so you&rsquo;ll get the same updates by email. The kitchen sees your number and that you prefer texts.</p>
            )}
          </div>
        </fieldset>
      )}

      {serverError ? (
        <div role="alert" className="rounded-card border border-red/30 bg-red-bg px-3.5 py-3 text-[14px] text-red-text">{serverError}</div>
      ) : failedOnSend.size > 0 && shownErrors.length > 0 ? (
        // The messages sit beside their fields; this only says there is something to fix above.
        <p role="alert" data-testid="form-error-summary" className="text-center text-[14px] font-semibold text-red-text">
          {shownErrors.length === 1 ? 'One thing to fix above.' : `${shownErrors.length} things to fix above.`}
        </p>
      ) : null}

      <button type="submit" disabled={sending}
        className="flex w-full items-center justify-center gap-2 rounded-btn bg-forest px-4 py-3.5 text-[16px] font-bold text-paper transition-colors hover:bg-forest-mid disabled:opacity-60">
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        {sending ? 'Sending…' : submitLabel}
      </button>
    </form>
  );
}

function FieldError({ id, children, className = '' }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <p id={id} data-testid="field-error" className={`mt-1.5 flex items-start gap-1.5 text-[13px] font-semibold text-red-text ${className}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{children}
    </p>
  );
}

function LineRow({ index, line, items, canRemove, onChange, onRemove, qtyError, itemError, excludeIds, onLeaveQty }: {
  index: number;
  line: FoodRequestDraftLine;
  items: FoodFormItem[];
  canRemove: boolean;
  qtyError: string | null;
  itemError: string | null;
  excludeIds: string[];
  onLeaveQty: () => void;
  onChange: (patch: Partial<FoodRequestDraftLine>) => void;
  onRemove: () => void;
}) {
  // The box shows what was typed; the draft carries the number and, when there were words, the words.
  const [qtyText, setQtyText] = useState(line.qtyWords ?? line.qty);
  const shownQty = line.qtyWords != null || qtyText !== '' ? qtyText : line.qty;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    if (line.itemId) return [];
    const seen = new Set<string>();
    return matchItems(items.filter((i) => !excludeIds.includes(i.id)), line.label, 12)
      .filter((m) => { const k = m.name.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6);
  }, [items, line.label, line.itemId, excludeIds]);
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
    // "2 dozen eggs" → Large eggs, 2: an amount typed into the words carries over when its unit
    // fits the item (or has none). It never carries across units.
    const amount = !line.qty.trim() ? parseAmount(line.label) : null;
    const qty = amount && (!amount.unit || sameUnit(amount.unit, item.unit)) ? amount.qty : line.qty;
    onChange({ itemId: item.id, label: item.name, unitLabel: item.unit, qty });
    if (qty !== line.qty) setQtyText(qty);
    setOpen(false);
  }

  /** "graham crackers, like 3 boxes" typed as one line becomes words, 3 and boxes. */
  function takeAmountFromWords() {
    if (line.itemId || line.qty.trim()) return;
    const amount = parseAmount(line.label);
    if (!amount) return;
    onChange({ label: amount.rest, qty: amount.qty, unitLabel: line.unitLabel.trim() ? line.unitLabel : amount.unit });
    setQtyText(amount.qty);
  }

  return (
    <div ref={wrapRef} className="relative rounded-card border border-border bg-white p-2.5" data-testid={`line-${index}`}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={`fr-item-${index}`}
            aria-invalid={!!itemError}
            aria-label={`Item ${index + 1}`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            className={`${withError(field, !!itemError)} ${line.itemId ? 'pr-8' : ''}`}
            placeholder={index === 0 ? 'e.g. flour, eggs, marshmallows' : 'Another item'}
            autoComplete="off" autoCorrect="off"
            value={line.label}
            maxLength={120}
            onFocus={() => setOpen(true)}
            onBlur={takeAmountFromWords}
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
            <Check className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sage" aria-hidden="true" />
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

      {itemError && <FieldError id={`fr-item-${index}-error`}>{itemError}</FieldError>}
      {/* The icon alone meant nothing to a counselor; say what it means. */}
      {line.itemId ? (
        <p className="mt-1 text-[12px] text-green-muted-text" data-testid="on-kitchen-list">On the kitchen&rsquo;s list</p>
      ) : line.label.trim() && !showList ? (
        <p className="mt-1 text-[12px] text-ink-soft">In your words. The kitchen will match it to what they have.</p>
      ) : null}

      {(line.label.trim() || line.itemId) && (
        <div className="mt-2 flex items-center gap-2">
          <input id={`fr-qty-${index}`} aria-label={`How much ${line.label || `item ${index + 1}`}`}
            aria-invalid={!!qtyError} aria-describedby={qtyError ? `fr-qty-${index}-error` : line.qtyWords ? `fr-qty-${index}-words` : undefined}
            className={`${withError(fieldBase, !!qtyError)} ${line.qtyWords ? 'w-44' : 'w-28'} flex-none placeholder:text-ink-faint`} inputMode="decimal"
            placeholder="Amount" value={shownQty} maxLength={80}
            onBlur={onLeaveQty}
            onChange={(e) => {
              const { value, words } = readAmountText(e.target.value);
              setQtyText(e.target.value);
              onChange({ qty: value.slice(0, 9), qtyWords: words ?? undefined });
            }} />
          {line.itemId ? (
            <span className="text-[14px] text-ink-soft">{pluralizeUnit(line.unitLabel, Number(line.qty) || 2)}</span>
          ) : (
            <input aria-label={`Unit for ${line.label || `item ${index + 1}`}`} className={`${fieldBase} min-w-0 flex-1`}
              placeholder="bags, lb, dozen…" value={line.unitLabel} maxLength={30}
              onChange={(e) => onChange({ unitLabel: e.target.value })} />
          )}
        </div>
      )}
      {line.qtyWords && !qtyError && (
        <p id={`fr-qty-${index}-words`} className="mt-1.5 text-[12.5px] text-ink-soft" data-testid="qty-words">
          The kitchen gets {line.qty ? <><strong>{line.qty}</strong> and </> : ''}your words, &ldquo;{line.qtyWords}&rdquo;.
        </p>
      )}
      {qtyError && <FieldError id={`fr-qty-${index}-error`}>{qtyError}</FieldError>}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useCampStore } from '@/store/campStore';
import { AlertTriangle, Copy, ExternalLink, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { dbUpdateReceipt } from '@/lib/receiptsDb';
import { LOW_CONFIDENCE, duplicatePartner, findDuplicates, fromCents, mathCheck, parseMoney, toCents, formatCents } from '@/lib/receipts';
import { TAX_LABELS, TAX_TYPES, type AiField, type Receipt, type TaxType } from '@/lib/receiptTypes';
import {
  Callout, ConfirmDialog, StatusChip, cardWithHolder, fieldClass, fmtDay, fmtInstantDay, inputClass, labelClass, money, useEscape, useReceiptsRole, useSignedUrls,
} from './receiptsUi';
import { removeReceiptWithUndo } from './removeWithUndo';
import type { CaptureItem } from './useReceiptCapture';

/** `auto`: the amount was worked out from the rate, so a new subtotal or rate works it out again. */
interface TaxRow { type: TaxType; rate: string; amount: string; auto?: boolean }
interface SplitRow { codeId: string; amount: string }

interface FormState {
  cardId: string;
  vendor: string;
  date: string;
  subtotal: string;
  taxes: TaxRow[];
  tip: string;
  total: string;
  currency: 'CAD' | 'USD';
  codeId: string;
  purpose: string;
  splits: SplitRow[];
  /** The total is the sum of the parts until someone types one (or the reader found one). */
  totalAuto: boolean;
}

const amt = (n: number | null) => (n == null ? '' : n.toFixed(2));

function formFrom(r: Receipt): FormState {
  return {
    cardId: r.cardId ?? '',
    vendor: r.vendor ?? '',
    date: r.purchaseDate ?? '',
    subtotal: amt(r.subtotal),
    taxes: r.taxes.map((t) => ({ type: t.type, rate: t.ratePct == null ? '' : String(t.ratePct), amount: t.amount.toFixed(2) })),
    tip: amt(r.tip),
    total: amt(r.total),
    currency: r.currency,
    codeId: r.budgetCodeId ?? '',
    purpose: r.purpose ?? '',
    splits: r.splits.map((s) => ({ codeId: s.budgetCodeId, amount: s.amount.toFixed(2) })),
    totalAuto: r.total == null,
  };
}

const parseRate = (v: string): number | null => {
  const n = Number(v.trim().replace(',', '.').replace('%', ''));
  return v.trim() && Number.isFinite(n) && n >= 0 && n <= 30 ? n : null;
};

/**
 * Typing by hand does the arithmetic a calculator would: a tax rate and a subtotal give the tax,
 * and the parts give the total, until the person types either over. After a failed read, the form
 * used to leave every sum to be worked out on a phone's calculator.
 */
function recompute(f: FormState): FormState {
  const sub = parseMoney(f.subtotal);
  const taxes = f.taxes.map((t) => {
    const rate = parseRate(t.rate);
    if (!t.auto || rate == null || sub == null) return t;
    return { ...t, amount: fromCents(Math.round(toCents(sub) * rate / 100)).toFixed(2) };
  });
  let total = f.total;
  if (f.totalAuto && sub != null) {
    const cents = toCents(sub) + taxes.reduce((s, t) => s + toCents(parseMoney(t.amount)), 0) + toCents(parseMoney(f.tip));
    total = fromCents(cents).toFixed(2);
  }
  return { ...f, taxes, total };
}

const READ_STAGE_TEXT: Record<string, string> = {
  preparing: 'Preparing the photo…',
  uploading: 'Uploading…',
  reading: 'Reading the receipt…',
};

/**
 * The review form: where an AI draft becomes a receipt a person has vouched for.
 *
 * Nothing the reader returned is final until someone presses Save here ("never silently
 * auto-fill" — the same rule as contracts). Fields the reader was unsure of are amber until
 * they are touched, a total the parts do not add up to says so in words, and a receipt that
 * looks like one already saved says which one.
 */
export function ReceiptReview({ receiptId, capture, onClose, onCompare }: {
  receiptId: string | null;
  capture?: CaptureItem | null;
  onClose: () => void;
  onCompare?: (a: string, b: string) => void;
}) {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const receipts = useReceiptsStore((s) => s.receipts);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const upsertLocal = useReceiptsStore((s) => s.upsertReceiptLocal);
  const { isFinance, userId, myCards } = useReceiptsRole();

  const receipt = useMemo(() => receipts.find((r) => r.id === receiptId) ?? null, [receipts, receiptId]);
  const signed = useSignedUrls(useMemo(() => (receipt ? [receipt] : []), [receipt]));
  const fileUrl = receipt?.filePath ? signed[receipt.filePath] : undefined;
  const imageUrl = capture?.previewUrl ?? fileUrl;
  const isPdf = capture?.isPdf || receipt?.fileType === 'application/pdf';

  const reading = !receipt || receipt.status === 'processing' || (capture && capture.stage !== 'done' && capture.stage !== 'failed');
  // Seeded from the receipt until the first edit, then the person's own copy: re-seeding on every
  // realtime echo would throw away what they have typed so far.
  const [edited, setForm] = useState<FormState | null>(null);
  const form = useMemo(() => edited ?? (receipt && !reading ? formFrom(receipt) : null), [edited, receipt, reading]);
  const [touched, setTouched] = useState<Partial<Record<AiField, boolean>>>({});
  const [saving, setSaving] = useState<null | 'save' | 'later' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!reading) return;
    const started = capture?.startedAt ?? Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [reading, capture?.startedAt]);

  useEscape(onClose, !zoom && !confirmDelete);
  useEscape(() => setZoom(false), zoom);

  const ai = receipt?.aiResult ?? null;
  const locked = receipt?.status === 'exported' && !isFinance;
  const canDelete = receipt && (isFinance || (receipt.submittedBy === userId && receipt.status !== 'exported'));

  /** Amber when the reader was unsure of it, or could not find it, and nobody has touched it. */
  const amber = (field: AiField): string | null => {
    // Only while the draft is unconfirmed: once someone has saved it, the numbers are theirs.
    if (!ai?.readable || touched[field] || !form || receipt?.status !== 'needs_review') return null;
    const c = ai.confidence?.[field];
    const empty = {
      vendor: !form.vendor, date: !form.date, total: !form.total, subtotal: !form.subtotal,
      taxes: false, tip: false, currency: false,
    }[field];
    if (empty && ['vendor', 'date', 'total'].includes(field)) return 'Not found on the receipt — enter it';
    if (c != null && c < LOW_CONFIDENCE) return field === 'date' && receipt?.aiResult?.flags?.dateOutOfRange
      ? 'This date looks wrong — check it' : 'Check this — the photo was unclear';
    return null;
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K], field?: AiField) => {
    setForm((f) => {
      const base = f ?? form;
      if (!base) return base;
      const next = { ...base, [k]: v, ...(k === 'total' ? { totalAuto: false } : {}) };
      return k === 'subtotal' || k === 'taxes' || k === 'tip' ? recompute(next) : next;
    });
    if (field) setTouched((t) => ({ ...t, [field]: true }));
  };

  const parsed = useMemo(() => {
    if (!form) return null;
    const taxes = form.taxes
      .map((t) => ({ type: t.type, ratePct: t.rate.trim() ? Number(t.rate.replace(',', '.')) : null, amount: parseMoney(t.amount) }))
      .filter((t) => t.amount != null) as Receipt['taxes'];
    return {
      subtotal: parseMoney(form.subtotal), tip: parseMoney(form.tip), total: parseMoney(form.total), taxes,
      splits: form.splits.filter((s) => s.codeId && parseMoney(s.amount) != null).map((s) => ({ budgetCodeId: s.codeId, amount: parseMoney(s.amount)! })),
    };
  }, [form]);

  const math = parsed ? mathCheck(parsed) : null;
  const splitCovered = parsed ? parsed.splits.reduce((s, x) => s + toCents(x.amount), 0) : 0;
  // Worked out live, on every card: the flag stored at snap time only knew the receipts of that
  // moment, and only on the same card.
  const partner = useMemo(() => (receipt && receipt.purchaseDate && receipt.total != null
    ? duplicatePartner(findDuplicates(receipts), receipt.id) : null), [receipts, receipt]);
  const duplicateOf = partner ? receipts.find((r) => r.id === partner.otherId) ?? null
    : receipt?.possibleDuplicateOf && !receipt.duplicateDismissed ? receipts.find((r) => r.id === receipt.possibleDuplicateOf) ?? null : null;
  const printedLast4 = ai?.cardLast4 ?? null;
  const chosenCard = cards.find((c) => c.id === form?.cardId) ?? null;
  const printedCard = printedLast4 ? cards.find((c) => c.active && c.last4 === printedLast4) ?? null : null;
  const cardMatchesSlip = !!printedLast4 && chosenCard?.last4 === printedLast4;
  const cardMismatch = !!printedLast4 && !cardMatchesSlip;

  const problems: string[] = [];
  if (form && !form.vendor.trim()) problems.push('vendor');
  if (form && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) problems.push('date');
  if (parsed && parsed.total == null) problems.push('total');

  async function save(kind: 'save' | 'later') {
    if (!receipt || !form || !parsed) return;
    if (kind === 'save' && problems.length) { setShowErrors(true); return; }
    setSaving(kind); setError(null);
    const next: Receipt = {
      ...receipt,
      cardId: form.cardId || null,
      vendor: form.vendor.trim() || null,
      purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? form.date : null,
      subtotal: parsed.subtotal, taxes: parsed.taxes, tip: parsed.tip, total: parsed.total,
      currency: form.currency,
      budgetCodeId: form.codeId || null,
      splits: parsed.splits,
      purpose: form.purpose.trim() || null,
      status: kind === 'save' ? (receipt.status === 'exported' ? 'exported' : 'ready') : 'needs_review',
      reviewedBy: kind === 'save' ? userId : receipt.reviewedBy,
      reviewedAt: kind === 'save' ? new Date().toISOString() : receipt.reviewedAt,
    };
    const res = await dbUpdateReceipt(next);
    setSaving(null);
    if (res.error) { setError(res.error); return; }
    upsertLocal(next);
    onClose();
  }

  function remove() {
    if (!receipt || !campId) return;
    setConfirmDelete(false);
    removeReceiptWithUndo({ receipt, keepId: null, campId, label: `Deleted the receipt from ${receipt.vendor ?? 'an unknown vendor'}.` });
    onClose();
  }

  const selectableCards = cards.filter((c) => c.active || c.id === form?.cardId);
  const activeCodes = codes.filter((c) => c.active || c.id === form?.codeId || form?.splits.some((s) => s.codeId === c.id));

  const amberClass = (field: AiField) => (amber(field) ? '!border-amber bg-amber-bg/60 ring-2 ring-amber/25' : '');
  const errClass = (field: string) => (showErrors && problems.includes(field) ? '!border-red ring-2 ring-red/20' : '');

  const hint = (field: AiField) => {
    const text = amber(field);
    return text ? <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-amber-text" data-amber={field}><AlertTriangle className="h-3.5 w-3.5" />{text}</p> : null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Check the receipt">
      <div className="flex h-full w-full flex-col overflow-hidden bg-paper-card sm:h-auto sm:max-h-[94vh] sm:max-w-[1040px] sm:rounded-modal sm:shadow-2xl">
        {/* Header */}
        <div className="flex flex-none items-center gap-3 border-b border-border px-4 py-3 sm:px-6"
             style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[17px] font-bold text-forest">
              {reading ? 'Reading your receipt' : receipt?.status === 'ready' || receipt?.status === 'exported' ? 'Receipt' : 'Check the receipt'}
            </h2>
            {receipt && !reading && (
              <p className="truncate text-[12px] text-ink-soft">
                {receipt.submitterName ? `Snapped by ${receipt.submitterName}` : 'Snapped'} · {fmtInstantDay(receipt.createdAt)}
              </p>
            )}
          </div>
          {receipt && <StatusChip status={receipt.status} />}
          <button onClick={onClose} className="-mr-1 rounded-btn p-2 text-ink-soft hover:bg-cream hover:text-forest" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
          {/* The paper */}
          <div className="flex-none border-b border-border bg-[#3d3a35] sm:w-[42%] sm:overflow-y-auto sm:border-b-0 sm:border-r">
            {isPdf ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-cream sm:h-full">
                <p className="text-[13px]">PDF receipt</p>
                {fileUrl && (
                  <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-btn bg-white/10 px-3 py-1.5 text-[13px] font-semibold hover:bg-white/20">
                    Open the PDF <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ) : imageUrl ? (
              <button type="button" onClick={() => setZoom(true)} className="relative block w-full" aria-label="Enlarge the photo">
                <img src={imageUrl} alt="The receipt" className={`mx-auto max-h-[34vh] w-auto object-contain sm:max-h-none sm:w-full ${reading ? 'opacity-70' : ''}`} />
                {reading && <span className="absolute inset-0 animate-pulse bg-gradient-to-b from-transparent via-white/15 to-transparent" />}
              </button>
            ) : (
              <div className="flex h-40 items-center justify-center text-[13px] text-cream/70 sm:h-full">No photo</div>
            )}
          </div>

          {/* The form */}
          <div className="min-w-0 flex-1 sm:overflow-y-auto">
            {reading ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-sage" />
                <p className="mt-3 font-display text-[16px] font-bold text-forest">{READ_STAGE_TEXT[capture?.stage ?? 'reading'] ?? 'Reading the receipt…'}</p>
                <p className="mt-1 max-w-xs text-[13px] text-ink-soft">
                  Usually 5 to 15 seconds. You will check every number before it is saved.
                </p>
                {elapsed > 0 && <p className="mt-2 text-[12px] tabular-nums text-ink-faint">{elapsed}s</p>}
                {capture?.error && <Callout tone="red" className="mt-4 text-left">{capture.error}</Callout>}
              </div>
            ) : form ? (
              <div className="space-y-4 px-4 py-4 sm:px-6">
                {locked && <Callout tone="blue">Exported to the books on {fmtInstantDay(receipt!.exportedAt)}. Ask finance to change it.</Callout>}
                {ai && !ai.readable && receipt?.status === 'needs_review' && !(form.vendor.trim() && form.total.trim()) && (
                  // Only until the details are in: it stayed on screen after the receipt was typed
                  // in and saved, still saying it could not be read.
                  <Callout tone="blue">
                    <b>Not read automatically.</b> {capture?.aiError ?? ai.error ?? 'Type the details from the receipt.'}
                  </Callout>
                )}
                {ai?.readable && !locked && receipt?.status === 'needs_review' && (
                  <p className="flex items-start gap-2 text-[13px] text-ink-soft">
                    <Sparkles className="mt-0.5 h-4 w-4 flex-none text-sage" />
                    <span>Filled in from the photo. Check each number against the receipt{Object.values(ai.confidence ?? {}).some((c) => (c ?? 1) < LOW_CONFIDENCE) ? ', especially the highlighted ones' : ''}.</span>
                  </p>
                )}
                {duplicateOf && (
                  <Callout tone="amber">
                    <div className="flex flex-wrap items-center gap-2">
                      <Copy className="h-4 w-4 flex-none" />
                      <span className="min-w-0 flex-1" data-testid="review-duplicate">Looks like a receipt already saved: <b>{duplicateOf.vendor}</b> · {money(duplicateOf.total, duplicateOf.currency)} · {fmtDay(duplicateOf.purchaseDate)} · on {cardWithHolder(cards, duplicateOf.cardId)}{duplicateOf.cardId !== receipt?.cardId ? ' (a different card)' : ''}.</span>
                      {onCompare && <button className="font-bold underline" onClick={() => onCompare(duplicateOf.id, receipt!.id)}>Compare</button>}
                    </div>
                  </Callout>
                )}

                <fieldset disabled={locked} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="rc-vendor">Vendor</label>
                      <input id="rc-vendor" className={`${inputClass} ${amberClass('vendor')} ${errClass('vendor')}`} value={form.vendor}
                             onChange={(e) => set('vendor', e.target.value, 'vendor')} placeholder="Where was it bought?" autoComplete="off" />
                      {hint('vendor')}
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="rc-date">Date</label>
                      <input id="rc-date" type="date" className={`${inputClass} ${amberClass('date')} ${errClass('date')}`} value={form.date}
                             onChange={(e) => set('date', e.target.value, 'date')} />
                      {hint('date')}
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="rc-card">Card</label>
                      <select id="rc-card" className={`${inputClass} ${!locked && cardMatchesSlip ? '!border-green-muted-text ring-2 ring-green-muted-text/20' : ''} ${!locked && cardMismatch ? '!border-amber bg-amber-bg/60 ring-2 ring-amber/25' : ''}`} value={form.cardId}
                              onChange={(e) => {
                                const card = cards.find((c) => c.id === e.target.value);
                                setForm((f) => { const b = f ?? form; return b ? { ...b, cardId: e.target.value, codeId: b.codeId || card?.defaultBudgetCodeId || '' } : b; });
                              }}>
                        <option value="">No company card</option>
                        {selectableCards.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}{c.holderName ? ` · ${c.holderName}` : ''}{myCards.some((m) => m.id === c.id) ? ' (yours)' : ''}</option>
                        ))}
                      </select>
                      {!locked && cardMatchesSlip && (
                        <p className="mt-1 text-[12px] font-semibold text-green-muted-text" data-testid="card-matches-slip">Matches the card on the receipt (····{printedLast4})</p>
                      )}
                      {!locked && cardMismatch && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] font-semibold text-amber-text" data-testid="card-mismatch">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Receipt shows ····{printedLast4}; saving to {chosenCard?.last4 ? `····${chosenCard.last4}` : 'no card'}.</span>
                          {printedCard && <button type="button" className="underline" onClick={() => set('cardId', printedCard.id)}>Use {printedCard.label}</button>}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Money */}
                  <div className="rounded-card border border-border bg-white p-3 sm:p-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <MoneyInput id="rc-subtotal" label="Subtotal" value={form.subtotal} onChange={(v) => set('subtotal', v, 'subtotal')} className={amberClass('subtotal')} />
                      <MoneyInput id="rc-tip" label="Tip" value={form.tip} onChange={(v) => set('tip', v, 'tip')} className={amberClass('tip')} placeholder="0.00" />
                      <div className="col-span-2 sm:col-span-1">
                        <label className={labelClass} htmlFor="rc-currency">Currency</label>
                        <select id="rc-currency" className={`${inputClass} ${amberClass('currency')}`} value={form.currency}
                                onChange={(e) => set('currency', e.target.value as FormState['currency'], 'currency')}>
                          <option value="CAD">CAD</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">{hint('subtotal')}{hint('tip')}{hint('currency')}</div>

                    <div className={`mt-3 rounded-btn ${amber('taxes') ? 'bg-amber-bg/60 p-2 ring-2 ring-amber/25' : ''}`}>
                      <p className={labelClass}>Sales taxes</p>
                      {form.taxes.length === 0 && <p className="text-[13px] text-ink-soft">No tax on this receipt.</p>}
                      <div className="space-y-2">
                        {form.taxes.map((t, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <select aria-label="Tax type" className={`${fieldClass} w-[104px] flex-none`} value={t.type}
                                    onChange={(e) => set('taxes', form.taxes.map((x, j) => (j === i ? { ...x, type: e.target.value as TaxType } : x)), 'taxes')}>
                              {TAX_TYPES.map((ty) => <option key={ty} value={ty}>{TAX_LABELS[ty]}</option>)}
                            </select>
                            <div className="relative w-[76px] flex-none">
                              <input aria-label="Rate percent" inputMode="decimal" className={`${fieldClass} w-full pr-6`} value={t.rate} placeholder="rate"
                                     onChange={(e) => set('taxes', form.taxes.map((x, j) => (j === i ? { ...x, rate: e.target.value, auto: parseRate(e.target.value) != null ? true : x.auto } : x)), 'taxes')} />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-ink-soft">%</span>
                            </div>
                            <div className="relative min-w-0 flex-1">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">$</span>
                              <input aria-label={`${TAX_LABELS[t.type]} amount`} inputMode="decimal" className={`${fieldClass} w-full pl-6 text-right tabular-nums`} value={t.amount}
                                     onChange={(e) => set('taxes', form.taxes.map((x, j) => (j === i ? { ...x, amount: e.target.value, auto: false } : x)), 'taxes')} />
                            </div>
                            {!locked && (
                              <button type="button" aria-label="Remove tax line" className="flex-none rounded-btn p-2 text-ink-soft hover:bg-cream hover:text-red"
                                      onClick={() => set('taxes', form.taxes.filter((_, j) => j !== i), 'taxes')}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {!locked && (
                        <button type="button" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-forest hover:underline"
                                onClick={() => set('taxes', [...form.taxes, { type: 'HST', rate: '', amount: '', auto: true }], 'taxes')}>
                          <Plus className="h-3.5 w-3.5" /> Add a tax line
                        </button>
                      )}
                      {hint('taxes')}
                    </div>

                    <div className="mt-3 border-t border-border pt-3">
                      <MoneyInput id="rc-total" label="Total charged" value={form.total} onChange={(v) => set('total', v, 'total')}
                                  className={`text-[17px] font-bold ${amberClass('total')} ${errClass('total')}`} />
                      {hint('total')}
                      {form.totalAuto && form.total && !locked && <p className="mt-1 text-[12px] text-ink-soft">Worked out from the subtotal, taxes and tip. Type over it if the receipt says otherwise.</p>}
                    </div>
                    {math?.mismatch && (
                      <Callout tone="red" className="mt-3">
                        <b>These numbers don't add up.</b> Subtotal + taxes + tip = {formatCents(math.expectedCents, form.currency)}, but the total is {formatCents(toCents(parsed!.total), form.currency)}. Check them against the receipt.
                      </Callout>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="rc-code">Budget code</label>
                      <select id="rc-code" className={inputClass} value={form.codeId} onChange={(e) => set('codeId', e.target.value)}>
                        <option value="">Not coded yet</option>
                        {activeCodes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="rc-purpose">What was it for?</label>
                      <input id="rc-purpose" className={inputClass} value={form.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="e.g. Dock repairs" />
                    </div>
                  </div>

                  {/* Split */}
                  {form.splits.length === 0 ? (
                    codes.length > 1 && !locked && (
                      <button type="button" className="text-[13px] font-semibold text-forest hover:underline"
                              onClick={() => set('splits', [{ codeId: '', amount: '' }])}>
                        Split across budget codes…
                      </button>
                    )
                  ) : (
                    <div className="rounded-card border border-border bg-white p-3">
                      <p className={labelClass}>Split</p>
                      <p className="mb-2 text-[12.5px] text-ink-soft">Give part of the total to other codes. Whatever is left stays on {codes.find((c) => c.id === form.codeId)?.code ?? 'the budget code above'}; taxes divide in the same proportions.</p>
                      <div className="space-y-2">
                        {form.splits.map((sp, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <select aria-label="Split budget code" className={`${fieldClass} min-w-0 flex-1`} value={sp.codeId}
                                    onChange={(e) => set('splits', form.splits.map((x, j) => (j === i ? { ...x, codeId: e.target.value } : x)))}>
                              <option value="">Budget code…</option>
                              {activeCodes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                            </select>
                            <div className="relative w-[112px] flex-none">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">$</span>
                              <input aria-label="Split amount" inputMode="decimal" className={`${fieldClass} w-full pl-6 text-right tabular-nums`} value={sp.amount}
                                     onChange={(e) => set('splits', form.splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                            </div>
                            <button type="button" aria-label="Remove split" className="rounded-btn p-2 text-ink-soft hover:bg-cream hover:text-red"
                                    onClick={() => set('splits', form.splits.filter((_, j) => j !== i))}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                        <button type="button" className="font-semibold text-forest hover:underline" onClick={() => set('splits', [...form.splits, { codeId: '', amount: '' }])}>+ Another code</button>
                        {parsed?.total != null && (
                          <span className={splitCovered > toCents(parsed.total) ? 'font-semibold text-red' : 'text-ink-soft'}>
                            {formatCents(Math.max(0, toCents(parsed.total) - splitCovered), form.currency)} left on the main code
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </fieldset>

                {showErrors && problems.length > 0 && (
                  <Callout tone="red">A receipt needs a vendor, a date and a total before it can be saved.</Callout>
                )}
                {error && <Callout tone="red">{error}</Callout>}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        {!reading && form && (
          <div className="flex flex-none flex-wrap items-center gap-2 border-t border-border bg-paper-raised px-4 py-3 sm:px-6"
               style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {canDelete && !locked && (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={!!saving}
                      className="inline-flex items-center gap-1 rounded-btn px-2 py-2 text-[13px] font-semibold text-red hover:bg-red-bg disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!locked && receipt?.status !== 'ready' && receipt?.status !== 'exported' && (
                <Button variant="ghost" onClick={() => save('later')} disabled={!!saving}>
                  {saving === 'later' ? 'Saving…' : 'Finish later'}
                </Button>
              )}
              {!locked ? (
                <Button onClick={() => save('save')} disabled={!!saving} className="px-5 py-2.5 text-[14px]">
                  {saving === 'save' ? 'Saving…' : math?.mismatch ? 'Save anyway' : 'Save receipt'}
                </Button>
              ) : (
                <Button variant="ghost" onClick={onClose}>Close</Button>
              )}
            </div>
          </div>
        )}
      </div>

      {confirmDelete && receipt && (
        <ConfirmDialog title="Delete this receipt?" confirmLabel="Delete receipt" danger onCancel={() => setConfirmDelete(false)} onConfirm={remove}>
          {receipt.vendor ?? 'This receipt'}{receipt.total != null ? `, ${money(receipt.total, receipt.currency)},` : ''} and its photo are deleted. You can undo this for a few seconds.
        </ConfirmDialog>
      )}
      {zoom && imageUrl && (
        <div className="fixed inset-0 z-[60] overflow-auto bg-black/90" onClick={() => setZoom(false)} role="dialog" aria-label="Receipt photo">
          <button className="fixed right-3 top-3 rounded-full bg-white/15 p-2 text-white" aria-label="Close photo" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <X className="h-5 w-5" />
          </button>
          <img src={imageUrl} alt="The receipt, full size" className="mx-auto min-w-full sm:min-w-0" />
        </div>
      )}
    </div>
  );
}

function MoneyInput({ id, label, value, onChange, className = '', placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <label className={labelClass} htmlFor={id}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">$</span>
        <input id={id} inputMode="decimal" autoComplete="off" className={`${fieldClass} w-full pl-6 text-right tabular-nums ${className}`}
               value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

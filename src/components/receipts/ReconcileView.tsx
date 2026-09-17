import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowRightLeft, BellRing, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy,
  Link2, Lock, LockOpen, Mail, Pencil, Undo2, Upload, X,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import {
  dbAskHolder, dbDeleteStatement, dbPatchReceipts, dbRemindHolder, dbResolveLines, dbSetReceiptAside, dbSetStatementTotal,
  dbUnlockStatement, refreshReceipts, type LineChange,
} from '@/lib/receiptsDb';
import {
  autoMatch, blockerText, daysBetween, duplicatePartner, findDuplicates, formatCents, monthBounds, monthKey, monthLabel, noReceiptText,
  parseMoney, rankAttachCandidates, reconcileSummary, shiftMonth, toCents, vendorSimilarity, type MatchSuggestion,
} from '@/lib/receipts';
import { todayStr } from '@/lib/utils';
import type { BudgetCode, ExpenseCard, NoReceiptKind, Receipt, StatementLine } from '@/lib/receiptTypes';
import { StatementImport } from './StatementImport';
import {
  Callout, ConfirmDialog, EmptyState, Figure, SectionTitle, StatusChip, Thumb, UnlockDialog, cardWithHolder, fmtDay, fmtInstantDay,
  inputClass, labelClass, money, selectClass, useEscape, useSignedUrls,
} from './receiptsUi';

/**
 * One card, one month, against the Visa bill. The core of what finance did by hand in Excel.
 *
 * The header answers the only question that matters — does this month agree? — and lists every
 * single thing still in the way, so nobody has to trust a tick. Below it, the same things as work
 * to clear: suggested matches, charges with no receipt, receipts with no charge (each with a way
 * to resolve it), matched receipts still to check, and receipts with no date.
 */
export function ReconcileView({ onOpen, onCompare, onUploadForLine }: {
  onOpen: (id: string) => void;
  onCompare: (a: string, b: string) => void;
  onUploadForLine: (line: StatementLine, card: ExpenseCard, file: File) => void;
}) {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const statements = useReceiptsStore((s) => s.statements);
  const allLines = useReceiptsStore((s) => s.lines);
  const receipts = useReceiptsStore((s) => s.receipts);
  const timeZone = useReceiptsStore((s) => s.timeZone);
  const apply = useReceiptsStore((s) => s.apply);
  const patchLinesLocal = useReceiptsStore((s) => s.patchLinesLocal);
  const upsertLocal = useReceiptsStore((s) => s.upsertReceiptLocal);

  const [params, setParams] = useSearchParams();
  const activeCards = useMemo(() => cards.filter((c) => c.active), [cards]);
  const cardId = params.get('card') && cards.some((c) => c.id === params.get('card')) ? params.get('card')! : activeCards[0]?.id ?? null;
  const card = cards.find((c) => c.id === cardId) ?? null;

  const defaultMonth = useMemo(() => {
    const latest = statements.filter((s) => s.cardId === cardId).map((s) => s.periodMonth.slice(0, 7)).sort().pop();
    return latest ?? shiftMonth(monthKey(todayStr()), -1);
  }, [statements, cardId]);
  const rawMonth = params.get('month');
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : defaultMonth;

  const go = (next: { card?: string; month?: string }) => {
    const p = new URLSearchParams(params);
    if (next.card) p.set('card', next.card);
    if (next.month) p.set('month', next.month);
    setParams(p, { replace: true });
  };

  const statement = statements.find((s) => s.cardId === cardId && s.periodMonth.startsWith(month)) ?? null;
  const lines = useMemo(() => (statement ? allLines.filter((l) => l.statementId === statement.id) : []), [allLines, statement]);
  // An exported month is in QuickBooks: nothing on it changes until finance unlocks it to correct it.
  const locked = !!statement?.exportId && !statement.reexportNeededAt;
  const matchedAnywhere = useMemo(() => new Set(allLines.map((l) => l.receiptId).filter(Boolean) as string[]), [allLines]);
  const receiptById = useMemo(() => new Map(receipts.map((r) => [r.id, r])), [receipts]);
  const receiptOf = (id: string | null) => (id ? receiptById.get(id) ?? null : null);

  // Receipts that could belong to this card-month: on this card (or on no card), dated in the
  // month or a week either side, because a charge on the 1st was often bought on the 29th.
  const { from, to } = monthBounds(month);
  const candidates = useMemo(() => receipts.filter((r) => (r.cardId === cardId || !r.cardId)
    && r.status !== 'processing' && r.purchaseDate
    && daysBetween(from, r.purchaseDate) >= -7 && daysBetween(r.purchaseDate, to) >= -7), [receipts, cardId, from, to]);

  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const suggestions = useMemo(() => {
    if (!statement) return [];
    return autoMatch(lines, candidates.filter((r) => !matchedAnywhere.has(r.id)))
      .filter((s) => !rejected.has(`${s.lineId}:${s.receiptId}`))
      .sort((a, b) => (lines.find((l) => l.id === a.lineId)?.postedDate ?? '').localeCompare(lines.find((l) => l.id === b.lineId)?.postedDate ?? ''));
  }, [statement, lines, candidates, matchedAnywhere, rejected]);
  const suggestedLine = useMemo(() => new Map(suggestions.map((s) => [s.lineId, s])), [suggestions]);
  const suggestedReceipt = useMemo(() => new Set(suggestions.map((s) => s.receiptId)), [suggestions]);

  const summary = useMemo(() => (cardId ? reconcileSummary({
    statement, cardId, month, lines, matchedReceiptIds: matchedAnywhere, receipts, timeZone,
  }) : null), [statement, cardId, month, lines, matchedAnywhere, receipts, timeZone]);

  const charges = lines.filter((l) => l.amount > 0);
  const credits = lines.filter((l) => l.amount <= 0);
  const matched = charges.filter((l) => l.matchState === 'matched');
  const missing = charges.filter((l) => l.matchState === 'unmatched' && !suggestedLine.has(l.id));
  const explainedOther = charges.filter((l) => l.matchState === 'no_receipt_ok' || l.matchState === 'personal');

  // What the month still has to account for. A receipt that is only a suggestion right now is
  // shown there, not twice.
  const orphanReceipts = useMemo(() => (summary?.noCharge ?? []).map((r) => receiptById.get(r.id)).filter((r): r is Receipt => !!r && !suggestedReceipt.has(r.id)),
    [summary, suggestedReceipt, receiptById]);
  const undatedReceipts = useMemo(() => (summary?.undated ?? []).map((r) => receiptById.get(r.id)).filter((r): r is Receipt => !!r),
    [summary, receiptById]);
  const setAside = useMemo(() => receipts.filter((r) => r.cardId === cardId && r.deferredMonth === `${month}-01` && !matchedAnywhere.has(r.id)),
    [receipts, cardId, month, matchedAnywhere]);
  const toCheck = matched.filter((l) => summary?.amountDiffersLineIds.includes(l.id)
    || summary?.matchedNeedsReviewIds.includes(l.receiptId ?? ''));

  const duplicates = useMemo(() => findDuplicates(receipts, cards), [receipts, cards]);

  const signed = useSignedUrls(useMemo(() => [...candidates, ...undatedReceipts, ...orphanReceipts, ...receipts.filter((r) => lines.some((l) => l.receiptId === r.id))],
    [candidates, undatedReceipts, orphanReceipts, receipts, lines]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attachFor, setAttachFor] = useState<StatementLine | null>(null);
  const [noteFor, setNoteFor] = useState<{ line: StatementLine; state: 'personal' } | null>(null);
  const [noReceiptFor, setNoReceiptFor] = useState<{ line: StatementLine; kind: NoReceiptKind } | null>(null);
  const [asked, setAsked] = useState<Record<string, { email: string; text: string }>>({});
  const [unlocking, setUnlocking] = useState(false);
  const [asideFor, setAsideFor] = useState<Receipt | null>(null);
  const [moveFor, setMoveFor] = useState<Receipt | null>(null);
  const [dupFor, setDupFor] = useState<Receipt | null>(null);
  const [reminded, setReminded] = useState<Record<string, { email: string; text: string }>>({});
  const [editingTotal, setEditingTotal] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadLine = useRef<StatementLine | null>(null);

  const refresh = () => { if (campId) void refreshReceipts(campId, apply); };

  async function resolve(changes: LineChange[]) {
    setBusy(true); setError(null);
    // Optimistic, so a long "Accept all" does not look like nothing happened.
    patchLinesLocal(Object.fromEntries(changes.map((c) => [c.lineId, { matchState: c.matchState, receiptId: c.matchState === 'matched' ? c.receiptId ?? null : null, ...(c.note !== undefined ? { note: c.note } : {}) }])));
    const res = await dbResolveLines(changes);
    setBusy(false);
    if (res.error) setError(res.error);
    refresh();
  }

  async function ask(r: Receipt) {
    setBusy(true); setError(null);
    const res = await dbAskHolder(r.id);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setAsked((a) => ({ ...a, [r.id]: { email: res.toEmail ?? '', text: res.bodyText ?? '' } }));
    upsertLocal({ ...r, holderAskedAt: new Date().toISOString() });
  }

  async function remind(line: StatementLine) {
    setBusy(true); setError(null);
    const res = await dbRemindHolder(line.id);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setReminded((r) => ({ ...r, [line.id]: { email: res.toEmail ?? '', text: res.bodyText ?? '' } }));
    patchLinesLocal({ [line.id]: { remindedAt: new Date().toISOString() } });
  }

  async function deleteStatement() {
    if (!statement) return;
    setBusy(true);
    const res = await dbDeleteStatement(statement.id);
    setBusy(false);
    setConfirmDelete(false);
    if (res.error) { setError(res.error); return; }
    refresh();
  }

  async function saveTotal() {
    if (!statement || editingTotal == null) return;
    const v = parseMoney(editingTotal);
    if (v == null) { setError('Type the total as a number, like 885.78.'); return; }
    setBusy(true); setError(null);
    const res = await dbSetStatementTotal(statement.id, v);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setEditingTotal(null);
    refresh();
  }

  async function patchReceipt(r: Receipt, patch: Partial<Receipt>, run: () => Promise<{ error: string | null }>) {
    setBusy(true); setError(null);
    upsertLocal({ ...r, ...patch });
    const res = await run();
    setBusy(false);
    if (res.error) { upsertLocal(r); setError(res.error); }
    refresh();
  }

  function pickUpload(line: StatementLine) {
    uploadLine.current = line;
    uploadRef.current?.click();
  }

  if (!activeCards.length) {
    return (
      <EmptyState title="Add a company card first">
        Reconciling works one card at a time. Add the camp's cards and who holds them in Settings.
      </EmptyState>
    );
  }

  const holderFirst = card?.holderName?.split(' ')[0] ?? 'the holder';
  const compareWith = (r: Receipt, otherId: string, isCopy: boolean) => onCompare(isCopy ? otherId : r.id, isCopy ? r.id : otherId);

  /**
   * "Maya Torres's card · snapped by Luis Ortega". The holder first: listing only who took the photo
   * made a receipt snapped by finance look as if it were on finance's card.
   */
  const whoLine = (r: Pick<Receipt, 'submitterName'>) => {
    const holder = card?.holderName;
    const snapper = r.submitterName && r.submitterName !== holder ? `snapped by ${r.submitterName}` : null;
    return [holder ? `${holder}’s card` : card?.label, snapper].filter(Boolean).join(' · ');
  };

  return (
    <div data-testid="reconcile">
      {/* Card × month */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Card" className={`${selectClass} max-w-full`} value={cardId ?? ''} onChange={(e) => go({ card: e.target.value })}>
          {activeCards.map((c) => <option key={c.id} value={c.id}>{c.label}{c.holderName ? ` · ${c.holderName}` : ''}</option>)}
        </select>
        <div className="flex items-center rounded-btn border border-border bg-white">
          <button className="p-1.5 text-ink-soft hover:text-forest" aria-label="Previous month" onClick={() => go({ month: shiftMonth(month, -1) })}><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[118px] px-1 text-center text-[13px] font-semibold text-forest" data-testid="reconcile-month">{monthLabel(month)}</span>
          <button className="p-1.5 text-ink-soft hover:text-forest" aria-label="Next month" onClick={() => go({ month: shiftMonth(month, 1) })}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {card && statement && !replacing && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-paper-raised px-3 py-2 text-[12.5px] text-ink-soft" data-testid="statement-imported">
          <span className="w-full min-w-0 sm:w-auto sm:flex-1">
            <b className="font-semibold text-ink">Statement already imported</b> for {card.label} · {monthLabel(month)}: {charges.length} charge{charges.length === 1 ? '' : 's'}
            {credits.length ? `, ${credits.length} credit${credits.length === 1 ? '' : 's'}` : ''}
            {statement.fileName ? ` from ${statement.fileName}` : ''}, {fmtInstantDay(statement.createdAt)}.
            {statement.exportedAt && <> Exported {fmtInstantDay(statement.exportedAt)}.</>}
          </span>
          {locked ? (
            <span className="flex items-center gap-2" data-testid="statement-locked">
              <Lock className="h-3.5 w-3.5" /> Locked
              <Button size="sm" variant="ghost" onClick={() => setUnlocking(true)} data-testid="unlock-statement">Unlock to correct</Button>
            </span>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setReplacing(true)} data-testid="replace-statement">Replace statement…</Button>
              <button className="text-[12.5px] font-semibold text-red hover:underline" onClick={() => setConfirmDelete(true)}>Delete</button>
            </>
          )}
        </div>
      )}
      {card && statement && !replacing && statement.reexportNeededAt && (
        <Callout tone="amber" className="mt-2 flex flex-wrap items-center gap-2" data-testid="reexport-needed">
          <LockOpen className="h-4 w-4 flex-none" />
          <span className="min-w-0 flex-1"><b>Unlocked to correct, {fmtInstantDay(statement.reexportNeededAt)}.</b> {statement.reexportReason} Correct it in QuickBooks too, then export this month again.</span>
          <Link to={`/receipts?tab=export&card=${card.id}&month=${month}`} className="font-bold underline">Export again →</Link>
        </Callout>
      )}

      {card && (!statement || replacing) && (
        <div className="mt-4">
          <StatementImport
            key={`${card.id}-${month}-${replacing}`}
            card={card} month={month}
            replacing={statement ? { chargeCount: charges.length, creditCount: credits.length, resolvedCount: charges.filter((l) => l.matchState !== 'unmatched').length } : null}
            onDone={(m) => { setReplacing(false); go({ month: m }); refresh(); }}
            onCancel={statement ? () => setReplacing(false) : undefined}
          />
          {!statement && orphanReceipts.length > 0 && (
            <p className="mt-3 text-[13px] text-ink-soft">{orphanReceipts.length} receipt{orphanReceipts.length === 1 ? '' : 's'} on this card in {monthLabel(month)} {orphanReceipts.length === 1 ? 'is' : 'are'} waiting for the statement.</p>
          )}
        </div>
      )}

      {statement && !replacing && summary && (
        <>
          {/* Does the month agree? */}
          <div className="mt-3 overflow-hidden rounded-card border border-border bg-white">
            <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
              <div className="relative min-w-0">
                {editingTotal == null ? (
                  <>
                    {statement.totalSource === 'sum_of_lines' ? (
                      <Figure label="Statement total" value="Not typed" hint={`sum of lines ${formatCents(summary.netCents)} — not checked against the bill`} tone="amber" />
                    ) : (
                      <Figure label="Statement total" value={summary.statementTotalCents != null ? formatCents(summary.statementTotalCents) : '—'} hint="typed from the bill" />
                    )}
                    <button className="absolute right-1.5 top-1.5 rounded-btn p-1.5 text-ink-soft hover:bg-cream hover:text-forest disabled:opacity-40" aria-label="Edit the statement total" data-testid="edit-total" disabled={locked}
                            onClick={() => setEditingTotal(statement.totalSource === 'typed' && summary.statementTotalCents != null ? (summary.statementTotalCents / 100).toFixed(2) : '')}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="px-3 py-3 sm:px-5">
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Statement total</p>
                    <input autoFocus inputMode="decimal" aria-label="Statement total" className={`${inputClass} mt-1 py-1.5 tabular-nums`} value={editingTotal}
                           onChange={(e) => setEditingTotal(e.target.value)}
                           onKeyDown={(e) => { if (e.key === 'Enter') void saveTotal(); if (e.key === 'Escape') { e.stopPropagation(); setEditingTotal(null); } }} />
                    <div className="mt-1.5 flex gap-3 text-[12px]">
                      <button className="font-bold text-forest hover:underline" disabled={busy || locked} onClick={() => void saveTotal()}>Save</button>
                      <button className="text-ink-soft hover:underline" onClick={() => setEditingTotal(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              <Figure label="Lines add up to" value={formatCents(summary.netCents)} hint={`${summary.chargeCount} charge${summary.chargeCount === 1 ? '' : 's'} · ${credits.length} credit${credits.length === 1 ? '' : 's'}`}
                      tone={summary.statementAddsUp ? 'default' : 'red'} />
              <Figure label="Matched receipts" value={formatCents(summary.matchedReceiptCents)} hint={`against ${formatCents(summary.matchedLineCents)} of charges`}
                      tone={summary.amountDiffersLineIds.length ? 'red' : 'default'} />
              <Figure label="Explained" value={`${summary.chargeCount - summary.unresolvedCount} of ${summary.chargeCount}`}
                      hint={summary.unresolvedCount ? `${formatCents(summary.unresolvedCents)} still open` : 'every charge'} tone={summary.unresolvedCount ? 'amber' : 'green'} />
            </div>
            {summary.agrees ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-green-muted-text/20 bg-green-muted-bg px-4 py-3 text-green-muted-text" data-testid="month-agrees">
                <CheckCircle2 className="h-5 w-5 flex-none" />
                <p className="text-[14px] font-bold">This month agrees with the Visa bill</p>
                <p className="w-full text-[12px] sm:ml-auto sm:w-auto">
                  Every charge explained, every receipt on the card accounted for{statement.totalSource === 'sum_of_lines' ? ' (the bill’s total was not typed, so the lines were not checked against it)' : ''}.
                  {' '}<Link to={`/receipts?tab=export&card=${card?.id ?? ''}&month=${month}`} className="font-bold underline" data-testid="export-this-month">{statement.exportId && !statement.reexportNeededAt ? 'See the export' : 'Export this month'} →</Link>
                </p>
              </div>
            ) : (
              <div className="border-t border-amber/30 bg-amber-bg px-4 py-3 text-amber-text" data-testid="month-disagrees">
                <p className="flex items-center gap-2 text-[13.5px] font-bold"><AlertTriangle className="h-4 w-4" /> Not agreeing yet</p>
                <ul className="mt-1 list-disc pl-6 text-[13px]" data-testid="blockers">
                  {summary.blockers.map((b) => {
                    // A suggestion is not a match until accepted, so it still counts. The banner said
                    // "9 receipts on this card have no charge" above a section headed "Receipts with no
                    // charge 0", because all nine were waiting as suggestions; it now says so.
                    const suggested = b.code === 'unexplained' ? suggestions.length : b.code === 'no_charge' ? summary.noCharge.filter((r) => suggestedReceipt.has(r.id)).length : 0;
                    return <li key={b.code} data-blocker={b.code}>{blockerText(b, suggested)}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>
          {error && <Callout tone="red" className="mt-3">{error}</Callout>}

          {/* Suggested matches */}
          {suggestions.length > 0 && (
            <>
              <SectionTitle title="Suggested matches" count={suggestions.length}>
                <Button size="sm" disabled={busy || locked} onClick={() => resolve(suggestions.map((s) => ({ lineId: s.lineId, matchState: 'matched', receiptId: s.receiptId })))}>
                  <Check className="h-4 w-4" /> Accept all {suggestions.length}
                </Button>
              </SectionTitle>
              <ul className="space-y-2" data-testid="suggestions">
                {suggestions.map((s) => (
                  <SuggestionRow key={s.lineId} s={s} line={lines.find((l) => l.id === s.lineId)!} receipt={receiptOf(s.receiptId)!}
                                 url={signed[receiptOf(s.receiptId)?.filePath ?? '']} busy={busy || locked} onOpen={onOpen}
                                 onAccept={() => resolve([{ lineId: s.lineId, matchState: 'matched', receiptId: s.receiptId }])}
                                 onReject={() => setRejected((r) => new Set(r).add(`${s.lineId}:${s.receiptId}`))} />
                ))}
              </ul>
            </>
          )}

          {/* Charges with no receipt */}
          <SectionTitle title="Charges with no receipt" count={missing.length} />
          {missing.length === 0 ? (
            <p className="text-[13px] text-ink-soft">None. Every charge has a receipt or a reason.</p>
          ) : (
            <ul className="space-y-2" data-testid="missing">
              {missing.map((l) => (
                <li key={l.id} className="rounded-card border border-border bg-white p-3" data-line={l.id}>
                  <LineHead line={l} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => setAttachFor(l)}><Link2 className="h-3.5 w-3.5" /> Attach receipt</Button>
                    <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => pickUpload(l)}><Upload className="h-3.5 w-3.5" /> Upload the receipt</Button>
                    <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => remind(l)}><BellRing className="h-3.5 w-3.5" /> Email {holderFirst} a reminder</Button>
                    <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => setNoReceiptFor({ line: l, kind: 'lost' })}>Receipt lost</Button>
                    <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => setNoReceiptFor({ line: l, kind: 'not_expected' })}>No receipt expected</Button>
                    <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => setNoteFor({ line: l, state: 'personal' })}>Personal</Button>
                  </div>
                  {reminded[l.id] ? (
                    <div className="mt-2 rounded-btn bg-paper-raised px-2.5 py-2 text-[12.5px] text-ink-soft" data-testid="reminded">
                      <p><b className="font-semibold text-ink">Reminder emailed to {reminded[l.id].email}.</b></p>
                      <p className="mt-0.5">If texts were on, it would say: “{reminded[l.id].text}”</p>
                    </div>
                  ) : l.remindedAt ? (
                    <p className="mt-2 text-[12.5px] text-ink-soft" data-testid="reminded">Reminder emailed to {card?.holderName ?? 'the holder'} on {fmtInstantDay(l.remindedAt)}.</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <input ref={uploadRef} type="file" accept="image/*,application/pdf" className="hidden" data-testid="line-upload-input"
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   if (f && uploadLine.current && card) onUploadForLine(uploadLine.current, card, f);
                   e.target.value = ''; uploadLine.current = null;
                 }} />

          {/* Receipts with no charge */}
          <SectionTitle title="Receipts with no charge" count={orphanReceipts.length} />
          {orphanReceipts.length === 0 ? (
            <p className="text-[13px] text-ink-soft">None. Every receipt on this card this month is on the statement.</p>
          ) : (
            <>
              <p className="mb-2 text-[12.5px] text-ink-soft">On {card?.label} and dated {monthLabel(month)}, but no charge on the statement matches. Say which it is:</p>
              <ul className="space-y-2" data-testid="orphans">
                {orphanReceipts.map((r) => {
                  const partner = duplicatePartner(duplicates, r.id);
                  const carried = r.deferredMonth === `${shiftMonth(month, -1)}-01`;
                  return (
                    <li key={r.id} className="rounded-card border border-border bg-white p-2.5" data-orphan={r.id}>
                      <div className="flex items-center gap-3">
                        <Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={44} onClick={() => onOpen(r.id)} />
                        <div className="min-w-0 flex-1">
                          <button className="block max-w-full text-left" onClick={() => onOpen(r.id)}>
                            <span className="block truncate text-[13.5px] font-bold text-ink">{r.vendor ?? 'Not read yet'}</span>
                            <span className="block text-[12px] text-ink-soft sm:truncate">{fmtDay(r.purchaseDate)} · {whoLine(r)}</span>
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {r.status !== 'ready' && r.status !== 'exported' && <StatusChip status={r.status} />}
                            {partner && (
                              <button className="rounded-tag bg-amber-bg px-2 py-0.5 text-[12px] font-bold text-amber-text hover:underline"
                                      onClick={() => compareWith(r, partner.otherId, partner.isCopy)}>
                                Possible duplicate{partner.crossCard ? ` on ${cardWithHolder(cards, receiptOf(partner.otherId)?.cardId ?? null)}` : ''}
                              </button>
                            )}
                            {carried && <span className="rounded-tag bg-blue-bg px-2 py-0.5 text-[12px] font-semibold text-blue-text">Set aside from {monthLabel(shiftMonth(month, -1))}{r.deferredNote ? `: ${r.deferredNote}` : ''}</span>}
                          </div>
                        </div>
                        <span className="text-right text-[14px] font-bold tabular-nums">{money(r.total, r.currency)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/70 pt-2">
                        <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => (partner ? compareWith(r, partner.otherId, partner.isCopy) : setDupFor(r))}>
                          <Copy className="h-3.5 w-3.5" /> It’s a duplicate
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => setMoveFor(r)}><ArrowRightLeft className="h-3.5 w-3.5" /> Wrong card</Button>
                        {!carried && <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => setAsideFor(r)}><CalendarClock className="h-3.5 w-3.5" /> Posts next month</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {toCheck.length > 0 && (
            <>
              <SectionTitle title="Matched receipts to check" count={toCheck.length} />
              <ul className="space-y-2" data-testid="to-check">
                {toCheck.map((l) => {
                  const r = receiptOf(l.receiptId);
                  const differs = summary.amountDiffersLineIds.includes(l.id);
                  return (
                    <li key={l.id} className="flex items-center gap-3 rounded-card border border-border bg-white p-2.5">
                      {r && <Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={40} onClick={() => onOpen(r.id)} />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{r?.vendor ?? 'Receipt'} <span className="font-normal text-ink-soft">· {fmtDay(l.postedDate)}</span></p>
                        <p className="text-[12px] text-ink-soft">
                          {r && (r.status === 'needs_review' || r.status === 'processing') ? 'Nobody has confirmed what was read. ' : ''}
                          {differs && r ? `Receipt ${money(r.total, r.currency)}, charge ${money(l.amount)}.` : ''}
                        </p>
                      </div>
                      {r && <Button size="sm" onClick={() => onOpen(r.id)}>Check it</Button>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {undatedReceipts.length > 0 && (
            <>
              <SectionTitle title="Receipts with no date" count={undatedReceipts.length} />
              <p className="mb-2 text-[12.5px] text-ink-soft">On {card?.label}, snapped around this month, but with no date, so they cannot be matched yet.</p>
              <ul className="space-y-2" data-testid="undated">
                {undatedReceipts.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-white p-2.5" data-undated={r.id}>
                    <Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={44} onClick={() => onOpen(r.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold">{r.vendor ?? 'Not read yet'}</p>
                      <p className="truncate text-[12px] text-ink-soft">Snapped {fmtInstantDay(r.createdAt)} · {whoLine(r)}</p>
                    </div>
                    <span className="text-[14px] font-bold tabular-nums">{money(r.total, r.currency)}</span>
                    <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => ask(r)} data-testid="ask-holder"><Mail className="h-3.5 w-3.5" /> Ask {holderFirst} about it</Button>
                      <Button size="sm" onClick={() => onOpen(r.id)}>Add date</Button>
                    </div>
                    {asked[r.id] ? (
                      <div className="w-full rounded-btn bg-paper-raised px-2.5 py-2 text-[12.5px] text-ink-soft" data-testid="asked">
                        <p><b className="font-semibold text-ink">Emailed {asked[r.id].email}.</b></p>
                        <p className="mt-0.5">If texts were on, it would say: “{asked[r.id].text}”</p>
                      </div>
                    ) : r.holderAskedAt ? (
                      <p className="w-full text-[12px] text-ink-soft" data-testid="asked">Asked {card?.holderName ?? 'the holder'} on {fmtInstantDay(r.holderAskedAt)}.</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}

          {setAside.length > 0 && (
            <>
              <SectionTitle title="Set aside for next month" count={setAside.length} />
              <ul className="divide-y divide-border rounded-card border border-border bg-white" data-testid="set-aside">
                {setAside.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <CalendarClock className="h-4 w-4 flex-none text-ink-soft" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]"><b>{r.vendor}</b> · {fmtDay(r.purchaseDate)} · {money(r.total, r.currency)}</p>
                      <p className="truncate text-[12px] text-ink-soft">Expected on the {monthLabel(shiftMonth(month, 1))} statement{r.deferredNote ? ` · ${r.deferredNote}` : ''}</p>
                    </div>
                    <button className="rounded-btn p-1.5 text-ink-soft hover:bg-cream hover:text-forest" aria-label="Bring it back to this month" disabled={busy || locked}
                            onClick={() => patchReceipt(r, { deferredMonth: null, deferredNote: null }, () => dbSetReceiptAside(r.id, null, null))}>
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Settled */}
          {(matched.length > 0 || explainedOther.length > 0) && (
            <>
              <SectionTitle title="Matched and explained" count={matched.length + explainedOther.length} />
              <ul className="divide-y divide-border rounded-card border border-border bg-white" data-testid="matched">
                {[...matched, ...explainedOther].sort((a, b) => a.postedDate.localeCompare(b.postedDate)).map((l) => {
                  const r = receiptOf(l.receiptId);
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                      <Check className="h-4 w-4 flex-none text-green-muted-text" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px]"><span className="tabular-nums text-ink-soft">{fmtDay(l.postedDate)}</span> · {l.description}</p>
                        <p className="truncate text-[12px] text-ink-soft">
                          {l.matchState === 'matched' && r ? (
                            <button className="hover:underline" onClick={() => onOpen(r.id)}>Receipt: {r.vendor} · {money(r.total, r.currency)}{toCents(r.total) !== toCents(l.amount) ? ' (amount differs)' : ''}{r.status === 'needs_review' ? ' · needs review' : ''}</button>
                          ) : l.matchState === 'personal' ? `Personal${l.note ? ` · ${l.note}` : ''}` : `${noReceiptText(l.noReceiptKind, l.note)} · ${codes.find((c) => c.id === (l.budgetCodeId ?? card?.defaultBudgetCodeId))?.name ?? 'Not coded'}`}
                        </p>
                        {l.remindedAt && (
                          // Kept once the charge is explained: the reminder is part of its history.
                          <p className="truncate text-[11.5px] text-ink-faint" data-testid="reminded-history">Reminder emailed to {card?.holderName ?? 'the holder'} on {fmtInstantDay(l.remindedAt)}</p>
                        )}
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums">{money(l.amount)}</span>
                      <button className="rounded-btn p-1.5 text-ink-soft hover:bg-cream hover:text-forest disabled:opacity-40" aria-label="Undo" disabled={busy || locked}
                              onClick={() => resolve([{ lineId: l.id, matchState: 'unmatched', receiptId: null }])}>
                        <Undo2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {credits.length > 0 && (
            <details className="mt-5 text-[13px]">
              <summary className="cursor-pointer font-semibold text-forest">Payments and credits ({credits.length})</summary>
              <ul className="mt-2 divide-y divide-border rounded-card border border-border bg-white">
                {credits.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate"><span className="tabular-nums text-ink-soft">{fmtDay(l.postedDate)}</span> · {l.description}</span>
                    <span className="tabular-nums text-green-muted-text">−{money(-l.amount)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {attachFor && card && (
        <AttachPicker line={attachFor} card={card} cards={cards} receipts={receipts} exclude={matchedAnywhere} signed={signed} codes={codes}
                      onClose={() => setAttachFor(null)}
                      onUpload={() => { const l = attachFor; setAttachFor(null); pickUpload(l); }}
                      onPick={(r) => { setAttachFor(null); void resolve([{ lineId: attachFor.id, matchState: 'matched', receiptId: r.id }]); }} />
      )}
      {noReceiptFor && card && (
        <NoReceiptDialog line={noReceiptFor.line} initialKind={noReceiptFor.kind} card={card} codes={codes} holderFirst={holderFirst}
                         reminded={!!noReceiptFor.line.remindedAt || !!reminded[noReceiptFor.line.id]}
                         onClose={() => setNoReceiptFor(null)}
                         onSave={(kind, note, codeId) => {
                           const n = noReceiptFor; setNoReceiptFor(null);
                           void resolve([{ lineId: n.line.id, matchState: 'no_receipt_ok', note, noReceiptKind: kind, budgetCodeId: codeId }]);
                         }} />
      )}
      {unlocking && statement && (
        <UnlockDialog what="statement" onCancel={() => setUnlocking(false)}
                      onUnlock={async (reason) => {
                        const res = await dbUnlockStatement(statement.id, reason);
                        if (res.error) return res.error;
                        setUnlocking(false);
                        refresh();
                        return null;
                      }} />
      )}
      {noteFor && (
        <NoteDialog title="Mark as personal"
                    subtitle={`${noteFor.line.description} · ${fmtDay(noteFor.line.postedDate)} · ${money(noteFor.line.amount)}`}
                    hint="A personal charge on the company card. It is left out of the QuickBooks export and totalled separately. Note how it will be repaid."
                    onClose={() => setNoteFor(null)}
                    onSave={(note) => { const n = noteFor; setNoteFor(null); void resolve([{ lineId: n.line.id, matchState: n.state, note }]); }} />
      )}
      {asideFor && (
        <NoteDialog title="Posts next month"
                    subtitle={`${asideFor.vendor ?? 'Receipt'} · ${fmtDay(asideFor.purchaseDate)} · ${money(asideFor.total, asideFor.currency)}`}
                    hint={`It stops holding up ${monthLabel(month)} and is listed on ${card?.label}’s ${monthLabel(shiftMonth(month, 1))} reconciliation, where its charge should appear.`}
                    placeholder="Note (e.g. bought on the 31st)" saveLabel="Set aside"
                    onClose={() => setAsideFor(null)}
                    onSave={(note) => { const r = asideFor; setAsideFor(null); void patchReceipt(r, { deferredMonth: `${month}-01`, deferredNote: note }, () => dbSetReceiptAside(r.id, `${month}-01`, note)); }} />
      )}
      {moveFor && card && (
        <MoveCardDialog receipt={moveFor} fromCard={card} cards={activeCards} statements={statements} lines={allLines}
                        onClose={() => setMoveFor(null)}
                        onMove={(dest) => { const r = moveFor; setMoveFor(null); void patchReceipt(r, { cardId: dest }, () => dbPatchReceipts([r.id], { card_id: dest })); }} />
      )}
      {dupFor && (
        <DuplicatePicker receipt={dupFor} receipts={receipts} cards={cards} onClose={() => setDupFor(null)}
                         onPick={(other) => {
                           const r = dupFor; setDupFor(null);
                           const otherFirst = other.createdAt <= r.createdAt;
                           onCompare(otherFirst ? other.id : r.id, otherFirst ? r.id : other.id);
                         }} />
      )}
      {confirmDelete && statement && (
        <ConfirmDialog title="Delete this statement?" confirmLabel="Delete statement" danger busy={busy}
                       onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteStatement()}>
          Its {charges.length} charge{charges.length === 1 ? '' : 's'}, and every match, note and “no receipt needed” on them, are deleted. Receipts are kept.
        </ConfirmDialog>
      )}
    </div>
  );
}

function LineHead({ line }: { line: StatementLine }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-ink">{line.description || 'Charge'}</p>
        <p className="text-[12px] tabular-nums text-ink-soft">Posted {fmtDay(line.postedDate)}</p>
      </div>
      <span className="text-[15px] font-bold tabular-nums">{money(line.amount)}</span>
    </div>
  );
}

function SuggestionRow({ s, line, receipt, url, busy, onAccept, onReject, onOpen }: {
  s: MatchSuggestion; line: StatementLine; receipt: Receipt; url?: string; busy: boolean;
  onAccept: () => void; onReject: () => void; onOpen: (id: string) => void;
}) {
  if (!line || !receipt) return null;
  return (
    <li className="rounded-card border border-border bg-white p-3" data-suggestion={line.id}>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Charge</p>
          <p className="truncate text-[13px] font-semibold">{line.description}</p>
          <p className="text-[12px] tabular-nums text-ink-soft">{fmtDay(line.postedDate)} · <b className="text-ink">{money(line.amount)}</b></p>
        </div>
        <span className="hidden text-ink-faint sm:block">⟷</span>
        <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => onOpen(receipt.id)}>
          <Thumb receipt={receipt} url={url} size={40} />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-soft">Receipt</span>
            <span className="block truncate text-[13px] font-semibold">{receipt.vendor}</span>
            <span className="block text-[12px] tabular-nums text-ink-soft">{fmtDay(receipt.purchaseDate)} · <b className="text-ink">{money(receipt.total, receipt.currency)}</b> <StatusChip status={receipt.status} /></span>
          </span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {s.confidence !== 'exact' && (
          <span className="rounded-tag bg-amber-bg px-1.5 py-0.5 text-[11px] font-bold text-amber-text">
            {s.confidence === 'tie' ? 'Two receipts fit equally — check' : 'Closest of several'}
          </span>
        )}
        {s.dateDiff > 0 && <span className="text-[12px] text-ink-soft">{s.dateDiff} day{s.dateDiff === 1 ? '' : 's'} apart</span>}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onReject} disabled={busy}><X className="h-3.5 w-3.5" /> Not this</Button>
          <Button size="sm" onClick={onAccept} disabled={busy}><Check className="h-3.5 w-3.5" /> Match</Button>
        </div>
      </div>
    </li>
  );
}

function DialogShell({ label, title, subtitle, onClose, children, footer, wide }: {
  label: string; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`flex max-h-[88vh] w-full flex-col rounded-t-modal bg-paper-card sm:rounded-modal ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'}`}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[16px] font-bold text-forest">{title}</h3>
            {subtitle && <p className="truncate text-[12.5px] text-ink-soft">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-btn p-2 text-ink-soft hover:bg-cream" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
        {footer && <div className="border-t border-border px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
      </div>
    </div>
  );
}

function AttachPicker({ line, card, cards, codes, receipts, exclude, signed, onPick, onUpload, onClose }: {
  line: StatementLine; card: ExpenseCard; cards: ExpenseCard[]; codes: BudgetCode[]; receipts: Receipt[]; exclude: Set<string>; signed: Record<string, string>;
  onPick: (r: Receipt) => void; onUpload: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => rankAttachCandidates(line, receipts, {
    cardId: card.id, excludeIds: exclude, query: q, cardLabel: (id) => cardWithHolder(cards, id),
  }), [line, receipts, card.id, exclude, q, cards]);
  const byId = useMemo(() => new Map(receipts.map((r) => [r.id, r])), [receipts]);
  const firstWeak = rows.findIndex((c) => c.strength === 'weak');
  return (
    <DialogShell label="Attach a receipt" title="Attach a receipt" subtitle={`${line.description} · ${fmtDay(line.postedDate)} · ${money(line.amount)}`} onClose={onClose} wide
                 footer={(
                   <div className="flex flex-wrap items-center gap-2">
                     <p className="min-w-0 flex-1 text-[12.5px] text-ink-soft">Not here? Upload it: it is read, and matched to this charge.</p>
                     <Button size="sm" onClick={onUpload}><Upload className="h-3.5 w-3.5" /> Upload the receipt</Button>
                   </div>
                 )}>
      <div className="border-b border-border px-4 py-2">
        <input autoFocus className={inputClass} placeholder="Search vendor, purpose, who snapped it, amount" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="mt-1 text-[11.5px] text-ink-soft">{q ? 'Searching every open receipt, on any card and any date.' : 'Best first: the amount closest to the charge, then a matching name, then the date. Each says why it is here.'}</p>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" data-testid="attach-results">
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-[13px] text-ink-soft">
            {q ? `No open receipt matches “${q}”.` : 'No open receipts within six weeks of this charge.'} Upload it below, or say the receipt was lost.
          </li>
        )}
        {rows.map(({ receipt, reasons, strength }, i) => {
          const r = byId.get(receipt.id)!;
          const code = codes.find((c) => c.id === r.budgetCodeId);
          return (
            <li key={r.id} data-strength={strength}>
              {i === firstWeak && (
                <p className="bg-paper-raised px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft" data-testid="attach-weak-divider">
                  {firstWeak === 0 ? 'Nothing close: these are open receipts nearby, with a different amount and name' : 'Less likely: a different amount and name'}
                </p>
              )}
              <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cream" onClick={() => onPick(r)} data-attach={r.id}>
                <Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {r.vendor ?? 'Not read yet'}
                    <span className="font-normal text-ink-soft"> · {r.purchaseDate ? fmtDay(r.purchaseDate) : 'no date'}{code ? ` · ${code.name}` : ''}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1" data-testid="attach-reasons">
                    {reasons.map((why) => (
                      <span key={why} className={`rounded-tag px-1.5 py-0.5 text-[11px] font-semibold ${/^Same amount|^Name matches|^Same day/.test(why) ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-ink-soft'}`}>{why}</span>
                    ))}
                  </span>
                </span>
                <span className="text-[14px] font-bold tabular-nums">{money(r.total, r.currency)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </DialogShell>
  );
}

/**
 * A charge with no receipt, said properly. "Receipt lost" needs a note, because that note is the
 * missing-receipt record an auditor or the CRA asks for; "No receipt expected" (a bank fee, a
 * parking meter) does not. Either is booked to a budget code, the card's default until changed:
 * the one-button version sent van fuel to Waterfront Equipment because that was the card's default.
 */
function NoReceiptDialog({ line, initialKind, card, codes, holderFirst, reminded, onSave, onClose }: {
  line: StatementLine; initialKind: NoReceiptKind; card: ExpenseCard; codes: BudgetCode[]; holderFirst: string; reminded: boolean;
  onSave: (kind: NoReceiptKind, note: string | null, codeId: string | null) => void; onClose: () => void;
}) {
  const [kind, setKind] = useState<NoReceiptKind>(initialKind);
  const [note, setNote] = useState(line.note ?? '');
  const [codeId, setCodeId] = useState(line.budgetCodeId ?? card.defaultBudgetCodeId ?? '');
  const [tried, setTried] = useState(false);
  const needsNote = kind === 'lost' && !note.trim();
  const save = () => { setTried(true); if (!needsNote) onSave(kind, note.trim() || null, codeId || null); };
  const active = codes.filter((c) => c.active || c.id === codeId);
  return (
    <DialogShell label="No receipt for this charge" title="No receipt for this charge" subtitle={`${line.description} · ${fmtDay(line.postedDate)} · ${money(line.amount)}`} onClose={onClose}
                 footer={(
                   <div className="flex justify-end gap-2">
                     <Button variant="ghost" onClick={onClose}>Cancel</Button>
                     <Button onClick={save} data-testid="no-receipt-save">Save</Button>
                   </div>
                 )}>
      <div className="space-y-3 overflow-y-auto px-4 py-3">
        <div className="space-y-2" role="radiogroup" aria-label="Why there is no receipt">
          {([
            ['lost', 'Receipt lost', `There was a receipt and it is gone. Say what was bought and why there is no receipt${reminded ? '' : ` (you can email ${holderFirst} first)`}: the note is the missing-receipt record an auditor asks for. No tax is claimed on it.`],
            ['not_expected', 'No receipt expected', 'Nothing was ever printed: a bank or card fee, interest, a parking meter.'],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-btn border px-3 py-2 text-[13px] ${kind === value ? 'border-sage bg-white' : 'border-border'}`}>
              <input type="radio" name="no-receipt-kind" className="mt-0.5" checked={kind === value} onChange={() => setKind(value)} data-kind={value} />
              <span><b className="font-semibold">{label}</b><span className="block text-[12px] text-ink-soft">{hint}</span></span>
            </label>
          ))}
        </div>
        <div>
          <label className={labelClass} htmlFor="no-receipt-note">{kind === 'lost' ? 'What was it, and what happened to the receipt? (required)' : 'Note (optional)'}</label>
          <input id="no-receipt-note" autoFocus className={`${inputClass} ${tried && needsNote ? '!border-red ring-2 ring-red/20' : ''}`} value={note}
                 onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                 placeholder={kind === 'lost' ? 'e.g. Van fuel for the canoe trip; pump printed no slip' : 'e.g. Monthly card fee'} />
          {tried && needsNote && <p className="mt-1 text-[12px] font-semibold text-red">A lost receipt needs a note.</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="no-receipt-code">Budget code</label>
          <select id="no-receipt-code" className={inputClass} value={codeId} onChange={(e) => setCodeId(e.target.value)}>
            <option value="">Not coded</option>
            {active.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code}){c.id === card.defaultBudgetCodeId ? ' · card default' : ''}</option>)}
          </select>
          <p className="mt-1 text-[12px] text-ink-soft">Goes to QuickBooks under {codes.find((c) => c.id === codeId)?.qbAccount ?? codes.find((c) => c.id === codeId)?.name ?? 'Uncategorised Expense'}.</p>
        </div>
      </div>
    </DialogShell>
  );
}

function NoteDialog({ title, subtitle, hint, placeholder = 'Note (optional)', saveLabel = 'Save', onSave, onClose }: {
  title: string; subtitle: string; hint: string; placeholder?: string; saveLabel?: string; onSave: (note: string | null) => void; onClose: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <DialogShell label={title} title={title} subtitle={subtitle} onClose={onClose}
                 footer={(
                   <div className="flex justify-end gap-2">
                     <Button variant="ghost" onClick={onClose}>Cancel</Button>
                     <Button onClick={() => onSave(note.trim() || null)}>{saveLabel}</Button>
                   </div>
                 )}>
      <div className="px-4 py-3">
        <p className="text-[13px] text-ink-soft">{hint}</p>
        <input autoFocus className={`${inputClass} mt-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder}
               onKeyDown={(e) => { if (e.key === 'Enter') onSave(note.trim() || null); }} />
      </div>
    </DialogShell>
  );
}

function MoveCardDialog({ receipt, fromCard, cards, statements, lines, onMove, onClose }: {
  receipt: Receipt; fromCard: ExpenseCard; cards: ExpenseCard[];
  statements: { id: string; cardId: string }[]; lines: StatementLine[];
  onMove: (cardId: string) => void; onClose: () => void;
}) {
  // A charge of the same amount within three days on another card's statement is the likeliest
  // answer, so it is named and preselected.
  const hints = useMemo(() => {
    const out = new Map<string, StatementLine>();
    for (const l of lines) {
      if (l.matchState !== 'unmatched' || toCents(l.amount) !== toCents(receipt.total) || !receipt.purchaseDate) continue;
      if (Math.abs(daysBetween(receipt.purchaseDate, l.postedDate)) > 3) continue;
      const st = statements.find((s) => s.id === l.statementId);
      if (st && st.cardId !== fromCard.id && !out.has(st.cardId)) out.set(st.cardId, l);
    }
    return out;
  }, [lines, statements, receipt, fromCard.id]);
  const others = cards.filter((c) => c.id !== fromCard.id);
  const [dest, setDest] = useState(() => [...hints.keys()][0] ?? others[0]?.id ?? '');
  return (
    <DialogShell label="Move to another card" title="Wrong card" subtitle={`${receipt.vendor ?? 'Receipt'} · ${fmtDay(receipt.purchaseDate)} · ${money(receipt.total, receipt.currency)}`} onClose={onClose}
                 footer={(
                   <div className="flex justify-end gap-2">
                     <Button variant="ghost" onClick={onClose}>Cancel</Button>
                     <Button disabled={!dest} onClick={() => onMove(dest)}>Move receipt</Button>
                   </div>
                 )}>
      <div className="space-y-1.5 overflow-y-auto px-4 py-3">
        <p className="mb-1 text-[13px] text-ink-soft">Move it off {fromCard.label} to the card that paid:</p>
        {others.length === 0 && <p className="text-[13px] text-ink-soft">There is no other card in use.</p>}
        {others.map((c) => {
          const hint = hints.get(c.id);
          return (
            <label key={c.id} className={`flex cursor-pointer items-start gap-2 rounded-btn border px-3 py-2 text-[13px] ${dest === c.id ? 'border-sage bg-white' : 'border-border'}`}>
              <input type="radio" name="move-card" className="mt-0.5" checked={dest === c.id} onChange={() => setDest(c.id)} />
              <span>
                <b className="font-semibold">{c.label}</b>{c.holderName ? ` · ${c.holderName}` : ''}
                {hint && <span className="block text-[12px] font-semibold text-green-muted-text">Has a {money(hint.amount)} charge on {fmtDay(hint.postedDate)}: {hint.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </DialogShell>
  );
}

function DuplicatePicker({ receipt, receipts, cards, onPick, onClose }: {
  receipt: Receipt; receipts: Receipt[]; cards: ExpenseCard[]; onPick: (other: Receipt) => void; onClose: () => void;
}) {
  // Same amount, any card, within a week, most alike first.
  const rows = useMemo(() => receipts
    .filter((r) => r.id !== receipt.id && toCents(r.total) === toCents(receipt.total)
      && (!r.purchaseDate || !receipt.purchaseDate || Math.abs(daysBetween(r.purchaseDate, receipt.purchaseDate)) <= 7))
    .map((r) => ({ r, sim: vendorSimilarity(r.vendor, receipt.vendor) }))
    .sort((a, b) => b.sim - a.sim || a.r.createdAt.localeCompare(b.r.createdAt)), [receipts, receipt]);
  return (
    <DialogShell label="Which receipt is it a copy of?" title="A copy of which receipt?" subtitle={`${receipt.vendor ?? 'Receipt'} · ${fmtDay(receipt.purchaseDate)} · ${money(receipt.total, receipt.currency)}`} onClose={onClose}>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-soft">No other receipt for {money(receipt.total, receipt.currency)} within a week, on any card.</li>}
        {rows.map(({ r }) => (
          <li key={r.id}>
            <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cream" onClick={() => onPick(r)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{r.vendor ?? 'Not read yet'}</span>
                <span className="block truncate text-[12px] text-ink-soft">{fmtDay(r.purchaseDate)} · {cardWithHolder(cards, r.cardId)}</span>
              </span>
              <StatusChip status={r.status} />
            </button>
          </li>
        ))}
      </ul>
    </DialogShell>
  );
}

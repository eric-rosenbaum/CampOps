import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, BellRing, Check, CheckCircle2, ChevronLeft, ChevronRight, Link2, MoreHorizontal, Undo2, X,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import {
  dbDeleteStatement, dbRemindHolder, dbResolveLines, refreshReceipts, type LineChange,
} from '@/lib/receiptsDb';
import {
  autoMatch, daysBetween, findDuplicates, formatCents, monthBounds, monthKey, monthLabel, reconcileSummary, toCents,
  type MatchSuggestion,
} from '@/lib/receipts';
import { todayStr } from '@/lib/utils';
import type { Receipt, StatementLine } from '@/lib/receiptTypes';
import { StatementImport } from './StatementImport';
import {
  Callout, EmptyState, Figure, SectionTitle, StatusChip, Thumb, fmtDay, inputClass, money, selectClass, useSignedUrls,
} from './receiptsUi';

function shiftMonth(yyyyMm: string, by: number): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * One card, one month, against the Visa bill. The core of what finance did by hand in Excel.
 *
 * The header answers the only question that matters — does this month agree? — and shows the
 * three numbers behind the answer so nobody has to trust a tick. Below it, everything that stands
 * between the month and agreeing, in the order it is usually cleared: suggested matches (accept
 * all), charges with no receipt, and receipts with no charge.
 */
export function ReconcileView({ onOpen, onCompare }: { onOpen: (id: string) => void; onCompare: (a: string, b: string) => void }) {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const cards = useReceiptsStore((s) => s.cards);
  const statements = useReceiptsStore((s) => s.statements);
  const allLines = useReceiptsStore((s) => s.lines);
  const receipts = useReceiptsStore((s) => s.receipts);
  const apply = useReceiptsStore((s) => s.apply);
  const patchLinesLocal = useReceiptsStore((s) => s.patchLinesLocal);

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
  const matchedAnywhere = useMemo(() => new Set(allLines.map((l) => l.receiptId).filter(Boolean) as string[]), [allLines]);

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
      .filter((s) => !rejected.has(`${s.lineId}:${s.receiptId}`));
  }, [statement, lines, candidates, matchedAnywhere, rejected]);
  const suggestedLine = useMemo(() => new Map(suggestions.map((s) => [s.lineId, s])), [suggestions]);
  const suggestedReceipt = useMemo(() => new Set(suggestions.map((s) => s.receiptId)), [suggestions]);

  const summary = useMemo(() => reconcileSummary(statement, lines, receipts), [statement, lines, receipts]);
  const charges = lines.filter((l) => l.amount > 0);
  const credits = lines.filter((l) => l.amount <= 0);
  const matched = charges.filter((l) => l.matchState === 'matched');
  const missing = charges.filter((l) => l.matchState === 'unmatched' && !suggestedLine.has(l.id));
  const explainedOther = charges.filter((l) => l.matchState === 'no_receipt_ok' || l.matchState === 'personal');
  const orphanReceipts = useMemo(() => candidates.filter((r) => r.cardId === cardId && r.purchaseDate!.startsWith(month)
    && !matchedAnywhere.has(r.id) && !suggestedReceipt.has(r.id)), [candidates, cardId, month, matchedAnywhere, suggestedReceipt]);
  const duplicates = useMemo(() => findDuplicates(receipts), [receipts]);
  const dupOf = useMemo(() => new Map(duplicates.map((d) => [d.duplicateId, d.originalId])), [duplicates]);
  const originalOf = useMemo(() => new Map(duplicates.map((d) => [d.originalId, d.duplicateId])), [duplicates]);

  const signed = useSignedUrls(useMemo(() => [...candidates, ...receipts.filter((r) => matchedAnywhere.has(r.id) && lines.some((l) => l.receiptId === r.id))], [candidates, receipts, matchedAnywhere, lines]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachFor, setAttachFor] = useState<StatementLine | null>(null);
  const [noteFor, setNoteFor] = useState<{ line: StatementLine; state: 'no_receipt_ok' | 'personal' } | null>(null);
  const [reminded, setReminded] = useState<Record<string, string>>({});

  async function resolve(changes: LineChange[]) {
    setBusy(true); setError(null);
    // Optimistic, so a long "Accept all" does not look like nothing happened.
    patchLinesLocal(Object.fromEntries(changes.map((c) => [c.lineId, { matchState: c.matchState, receiptId: c.matchState === 'matched' ? c.receiptId ?? null : null, ...(c.note !== undefined ? { note: c.note } : {}) }])));
    const res = await dbResolveLines(changes);
    setBusy(false);
    if (res.error) setError(res.error);
    if (campId) void refreshReceipts(campId, apply);
  }

  async function remind(line: StatementLine) {
    setBusy(true); setError(null);
    const res = await dbRemindHolder(line.id);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setReminded((r) => ({ ...r, [line.id]: `Reminder queued to ${res.toEmail}. The text would say: “${res.bodyText}”` }));
    patchLinesLocal({ [line.id]: { remindedAt: new Date().toISOString() } });
  }

  async function deleteStatement() {
    if (!statement || !window.confirm('Delete this statement and its matches? Receipts are kept.')) return;
    setBusy(true);
    const res = await dbDeleteStatement(statement.id);
    setBusy(false);
    setMenuOpen(false);
    if (res.error) { setError(res.error); return; }
    if (campId) void refreshReceipts(campId, apply);
  }

  if (!activeCards.length) {
    return (
      <EmptyState title="Add a company card first">
        Reconciling works one card at a time. Add the camp's cards and who holds them in Settings.
      </EmptyState>
    );
  }

  const receiptOf = (id: string | null) => receipts.find((r) => r.id === id) ?? null;

  return (
    <div data-testid="reconcile">
      {/* Card × month */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Card" className={selectClass} value={cardId ?? ''} onChange={(e) => go({ card: e.target.value })}>
          {activeCards.map((c) => <option key={c.id} value={c.id}>{c.label}{c.holderName ? ` · ${c.holderName}` : ''}</option>)}
        </select>
        <div className="flex items-center rounded-btn border border-border bg-white">
          <button className="p-1.5 text-ink-soft hover:text-forest" aria-label="Previous month" onClick={() => go({ month: shiftMonth(month, -1) })}><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[118px] px-1 text-center text-[13px] font-semibold text-forest" data-testid="reconcile-month">{monthLabel(month)}</span>
          <button className="p-1.5 text-ink-soft hover:text-forest" aria-label="Next month" onClick={() => go({ month: shiftMonth(month, 1) })}><ChevronRight className="h-4 w-4" /></button>
        </div>
        {statement && (
          <div className="relative ml-auto">
            <button className="rounded-btn border border-border bg-white p-1.5 text-ink-soft hover:text-forest" aria-label="Statement options" onClick={() => setMenuOpen((o) => !o)}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-card border border-border bg-white py-1 shadow-lg">
                <button className="block w-full px-3 py-2 text-left text-[13px] hover:bg-cream" onClick={() => { setReplacing(true); setMenuOpen(false); }}>Replace the statement…</button>
                <button className="block w-full px-3 py-2 text-left text-[13px] text-red hover:bg-red-bg" onClick={deleteStatement}>Delete the statement</button>
              </div>
            )}
          </div>
        )}
      </div>

      {card && (!statement || replacing) && (
        <div className="mt-4">
          <StatementImport
            key={`${card.id}-${month}-${replacing}`}
            card={card} month={month} replace={!!statement}
            onDone={(m) => { setReplacing(false); go({ month: m }); if (campId) void refreshReceipts(campId, apply); }}
            onCancel={statement ? () => setReplacing(false) : undefined}
          />
          {!statement && orphanReceipts.length > 0 && (
            <p className="mt-3 text-[13px] text-ink-soft">{orphanReceipts.length} receipt{orphanReceipts.length === 1 ? '' : 's'} on this card in {monthLabel(month)} are waiting for the statement.</p>
          )}
        </div>
      )}

      {statement && !replacing && (
        <>
          {/* Does the month agree? */}
          <div className="mt-4 overflow-hidden rounded-card border border-border bg-white">
            <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
              <Figure label="Statement total" value={summary.statementTotalCents != null ? formatCents(summary.statementTotalCents) : '—'} hint="from the bill" />
              <Figure label="Lines add up to" value={formatCents(summary.netCents)} hint={`${summary.chargeCount} charges · ${credits.length} credits`}
                      tone={summary.statementAddsUp ? 'default' : 'red'} />
              <Figure label="Matched receipts" value={formatCents(summary.matchedReceiptCents)} hint={`against ${formatCents(summary.matchedLineCents)} of charges`}
                      tone={summary.matchedReceiptCents === summary.matchedLineCents ? 'default' : 'red'} />
              <Figure label="Explained" value={`${summary.chargeCount - summary.unresolvedCount} of ${summary.chargeCount}`}
                      hint={summary.unresolvedCount ? `${formatCents(summary.unresolvedCents)} still open` : 'every charge'} tone={summary.unresolvedCount ? 'amber' : 'green'} />
            </div>
            {summary.agrees ? (
              <div className="flex items-center gap-2 border-t border-green-muted-text/20 bg-green-muted-bg px-4 py-3 text-green-muted-text" data-testid="month-agrees">
                <CheckCircle2 className="h-5 w-5 flex-none" />
                <p className="text-[14px] font-bold">This month agrees with the Visa bill ✓</p>
              </div>
            ) : (
              <div className="border-t border-amber/30 bg-amber-bg px-4 py-3 text-amber-text" data-testid="month-disagrees">
                <p className="flex items-center gap-2 text-[13.5px] font-bold"><AlertTriangle className="h-4 w-4" /> Not agreeing yet</p>
                <ul className="mt-1 list-disc pl-6 text-[13px]">{summary.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
          </div>
          {error && <Callout tone="red" className="mt-3">{error}</Callout>}

          {/* Suggested matches */}
          {suggestions.length > 0 && (
            <>
              <SectionTitle title="Suggested matches" count={suggestions.length}>
                <Button size="sm" disabled={busy} onClick={() => resolve(suggestions.map((s) => ({ lineId: s.lineId, matchState: 'matched', receiptId: s.receiptId })))}>
                  <Check className="h-4 w-4" /> Accept all {suggestions.length}
                </Button>
              </SectionTitle>
              <ul className="space-y-2" data-testid="suggestions">
                {suggestions.map((s) => (
                  <SuggestionRow key={s.lineId} s={s} line={lines.find((l) => l.id === s.lineId)!} receipt={receiptOf(s.receiptId)!}
                                 url={signed[receiptOf(s.receiptId)?.filePath ?? '']} busy={busy} onOpen={onOpen}
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
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAttachFor(l)}><Link2 className="h-3.5 w-3.5" /> Attach receipt</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => remind(l)}><BellRing className="h-3.5 w-3.5" /> Remind {card?.holderName?.split(' ')[0] ?? 'holder'}</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setNoteFor({ line: l, state: 'no_receipt_ok' })}>No receipt needed</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setNoteFor({ line: l, state: 'personal' })}>Personal</Button>
                  </div>
                  {(reminded[l.id] || l.remindedAt) && (
                    <p className="mt-2 text-[12.5px] text-ink-soft" data-testid="reminded">{reminded[l.id] ?? `Holder reminded ${fmtDay(l.remindedAt!.slice(0, 10))}.`}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Receipts with no charge */}
          <SectionTitle title="Receipts with no charge" count={orphanReceipts.length} />
          {orphanReceipts.length === 0 ? (
            <p className="text-[13px] text-ink-soft">None. Every receipt on this card this month is on the statement.</p>
          ) : (
            <>
              <p className="mb-2 text-[12.5px] text-ink-soft">On {card?.label} and dated {monthLabel(month)}, but no charge matches. A duplicate, the wrong card, or a charge that posts next month?</p>
              <ul className="space-y-2" data-testid="orphans">
                {orphanReceipts.map((r) => {
                  const other = dupOf.get(r.id) ?? originalOf.get(r.id);
                  return (
                    <li key={r.id} className="flex items-center gap-3 rounded-card border border-border bg-white p-2.5" data-orphan={r.id}>
                      <Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={44} onClick={() => onOpen(r.id)} />
                      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(r.id)}>
                        <p className="truncate text-[13.5px] font-bold text-ink">{r.vendor ?? 'Not read yet'}</p>
                        <p className="text-[12px] text-ink-soft">{fmtDay(r.purchaseDate)} · {r.submitterName ?? ''}</p>
                      </button>
                      {other && (
                        <button className="rounded-tag bg-amber-bg px-2 py-1 text-[12px] font-bold text-amber-text hover:underline"
                                onClick={() => onCompare(dupOf.has(r.id) ? other : r.id, dupOf.has(r.id) ? r.id : other)}>
                          Possible duplicate
                        </button>
                      )}
                      <span className="text-right text-[14px] font-bold tabular-nums">{money(r.total, r.currency)}</span>
                    </li>
                  );
                })}
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
                            <button className="hover:underline" onClick={() => onOpen(r.id)}>Receipt: {r.vendor} · {money(r.total, r.currency)}{toCents(r.total) !== toCents(l.amount) ? ' (amount differs)' : ''}</button>
                          ) : l.matchState === 'personal' ? `Personal${l.note ? ` · ${l.note}` : ''}` : `No receipt needed${l.note ? ` · ${l.note}` : ''}`}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums">{money(l.amount)}</span>
                      <button className="rounded-btn p-1.5 text-ink-soft hover:bg-cream hover:text-forest" aria-label="Undo" disabled={busy}
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

      {attachFor && (
        <AttachPicker line={attachFor} candidates={candidates.filter((r) => !matchedAnywhere.has(r.id))} signed={signed}
                      onClose={() => setAttachFor(null)}
                      onPick={(r) => { setAttachFor(null); void resolve([{ lineId: attachFor.id, matchState: 'matched', receiptId: r.id }]); }} />
      )}
      {noteFor && (
        <NoteDialog title={noteFor.state === 'personal' ? 'Mark as personal' : 'No receipt needed'}
                    hint={noteFor.state === 'personal' ? 'A personal charge on the company card. Note how it will be repaid.' : 'Say why, for whoever audits this later (e.g. "Parking meter, no receipt").'}
                    line={noteFor.line} onClose={() => setNoteFor(null)}
                    onSave={(note) => { const n = noteFor; setNoteFor(null); void resolve([{ lineId: n.line.id, matchState: n.state, note }]); }} />
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

function AttachPicker({ line, candidates, signed, onPick, onClose }: {
  line: StatementLine; candidates: Receipt[]; signed: Record<string, string>; onPick: (r: Receipt) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => candidates
    .filter((r) => !q || (r.vendor ?? '').toLowerCase().includes(q.toLowerCase()) || String(r.total ?? '').includes(q))
    .sort((a, b) => Math.abs(toCents(a.total) - toCents(line.amount)) - Math.abs(toCents(b.total) - toCents(line.amount))
      || Math.abs(daysBetween(a.purchaseDate!, line.postedDate)) - Math.abs(daysBetween(b.purchaseDate!, line.postedDate)))
    .slice(0, 30), [candidates, q, line]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-label="Attach a receipt">
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-modal bg-paper-card sm:max-w-lg sm:rounded-modal">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[16px] font-bold text-forest">Attach a receipt</h3>
            <p className="truncate text-[12.5px] text-ink-soft">{line.description} · {fmtDay(line.postedDate)} · {money(line.amount)}</p>
          </div>
          <button onClick={onClose} className="rounded-btn p-2 text-ink-soft hover:bg-cream" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <input className={inputClass} placeholder="Search vendor or amount" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-soft">No unmatched receipts on this card around this date.</li>}
          {rows.map((r) => {
            const diff = toCents(r.total) - toCents(line.amount);
            return (
              <li key={r.id}>
                <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cream" onClick={() => onPick(r)}>
                  <Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{r.vendor ?? 'Not read yet'}</span>
                    <span className="block text-[12px] text-ink-soft">{fmtDay(r.purchaseDate)}{diff !== 0 ? ` · differs by ${formatCents(Math.abs(diff))}` : ' · same amount'}</span>
                  </span>
                  <span className="text-[14px] font-bold tabular-nums">{money(r.total, r.currency)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NoteDialog({ title, hint, line, onSave, onClose }: {
  title: string; hint: string; line: StatementLine; onSave: (note: string | null) => void; onClose: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-label={title}>
      <div className="w-full rounded-t-modal bg-paper-card p-4 sm:max-w-md sm:rounded-modal">
        <h3 className="font-display text-[16px] font-bold text-forest">{title}</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">{line.description} · {fmtDay(line.postedDate)} · {money(line.amount)}</p>
        <p className="mt-3 text-[13px] text-ink-soft">{hint}</p>
        <input autoFocus className={`${inputClass} mt-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
               onKeyDown={(e) => { if (e.key === 'Enter') onSave(note.trim() || null); }} />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(note.trim() || null)}>Save</Button>
        </div>
      </div>
    </div>
  );
}

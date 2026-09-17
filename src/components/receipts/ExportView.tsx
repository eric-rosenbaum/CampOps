import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import { dbExportStatement, refreshReceipts } from '@/lib/receiptsDb';
import { parseCsv } from '@/lib/csv';
import {
  DATE_FORMATS, EXPORT_FORMATS, QBO_MAX_BILLS, QBO_MAX_LINES, REVIEW_FORMAT, buildStatementExport, exportFileName, formatCents,
  monthLabel, reconcileSummary, toCents, toStatementCsv, type StatementExport, type StatementExportFormat,
} from '@/lib/receipts';
import type { CardStatement, DateFormat, ExpenseCard } from '@/lib/receiptTypes';
import { Callout, EmptyState, SectionTitle, downloadText, fmtInstantDay, labelClass, selectClass } from './receiptsUi';

type QboFormat = Exclude<StatementExportFormat, 'detailed'>;

const FORMAT_LABEL: Record<string, string> = {
  qbo_bank_3col: 'Bank upload, 3 columns', qbo_bank_4col: 'Bank upload, 4 columns', qbo_bills: 'Bills import',
  detailed: 'Review spreadsheet', qbo_3col: 'QuickBooks 3 columns (receipts)', qbo_4col: 'QuickBooks 4 columns (receipts)',
};

/**
 * Export a card's month for QuickBooks, from its statement.
 *
 * One file per card, one row per statement charge at the posted date and amount, so each file adds
 * up to that card's bill: the rows, plus the personal charges left out (and, for bills, the
 * credits), equal the statement total, and the screen shows that sum before anything downloads.
 *
 * Two different actions, on purpose. "Download for review" writes the review spreadsheet and marks
 * nothing. "Export for QuickBooks" is refused until the month agrees, marks the statement and its
 * receipts exported, and then downloads. The detailed download used to mark receipts exported as a
 * side effect of someone just wanting to look.
 */
export function ExportView() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const receipts = useReceiptsStore((s) => s.receipts);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const statements = useReceiptsStore((s) => s.statements);
  const lines = useReceiptsStore((s) => s.lines);
  const exports = useReceiptsStore((s) => s.exports);
  const taxSettings = useReceiptsStore((s) => s.taxSettings);
  const timeZone = useReceiptsStore((s) => s.timeZone);
  const apply = useReceiptsStore((s) => s.apply);

  const months = useMemo(() => [...new Set(statements.map((s) => s.periodMonth.slice(0, 7)))].sort().reverse(), [statements]);
  const [month, setMonth] = useState<string>(() => months[0] ?? '');
  const inMonth = useMemo(() => statements.filter((s) => s.periodMonth.startsWith(month)), [statements, month]);
  const cardsInMonth = useMemo(() => cards.filter((c) => inMonth.some((s) => s.cardId === c.id)), [cards, inMonth]);
  const [cardChoice, setCardChoice] = useState<string>(() => cardsInMonth[0]?.id ?? '');
  const chosenCard = cardChoice === 'all' ? 'all' : cardsInMonth.some((c) => c.id === cardChoice) ? cardChoice : cardsInMonth[0]?.id ?? '';
  const [format, setFormat] = useState<QboFormat>('qbo_bills');
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY');
  const [reexport, setReexport] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const matchedAnywhere = useMemo(() => new Set(lines.map((l) => l.receiptId).filter(Boolean) as string[]), [lines]);
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;

  const panels = useMemo(() => {
    const chosen = chosenCard === 'all' ? cardsInMonth : cardsInMonth.filter((c) => c.id === chosenCard);
    return chosen.map((card) => {
      const statement = inMonth.find((s) => s.cardId === card.id)!;
      const stLines = lines.filter((l) => l.statementId === statement.id);
      const summary = reconcileSummary({ statement, cardId: card.id, month, lines: stLines, matchedReceiptIds: matchedAnywhere, receipts, timeZone });
      const ex = buildStatementExport({ card, month, statement, lines: stLines, receipts, codes, province: taxSettings?.province });
      return { card, statement, summary, ex };
    });
  }, [chosenCard, cardsInMonth, inMonth, lines, month, matchedAnywhere, receipts, timeZone, codes, taxSettings]);

  const fileFor = (ex: StatementExport, card: ExpenseCard, f: StatementExportFormat) => ({
    name: exportFileName(f, ex.cardSlug, month),
    csv: toStatementCsv(ex, f, dateFormat, { appOrigin, last4: card.last4 }),
  });

  function reviewDownload() {
    for (const p of panels) {
      const file = fileFor(p.ex, p.card, 'detailed');
      downloadText(file.name, file.csv, true);
    }
    setDone(`Downloaded the review spreadsheet${panels.length === 1 ? '' : 's'}. Nothing was marked exported.`);
  }

  const blockedReason = (p: (typeof panels)[number]): string | null => {
    if (!p.summary.agrees) return 'The month does not agree yet';
    if (p.statement.exportId && !reexport[p.statement.id]) return 'Already exported';
    if (format !== 'qbo_bills' && p.ex.bankRowCount > QBO_MAX_LINES) return `More than ${QBO_MAX_LINES} lines`;
    if (format === 'qbo_bills' && p.ex.billCount > QBO_MAX_BILLS) return `More than ${QBO_MAX_BILLS} bills`;
    return null;
  };
  const ready = panels.filter((p) => !blockedReason(p));

  async function exportForQuickBooks() {
    if (!ready.length) return;
    setBusy(true); setError(null); setDone(null);
    const names: string[] = [];
    for (const p of ready) {
      const file = fileFor(p.ex, p.card, format);
      // Marked before the download: a file that downloaded while the marking failed would be a
      // month in the books that the next export includes again.
      // A receipt exported by the older receipt-based export was never part of this statement's file.
      const includeExported = !!p.statement.exportId || p.ex.rows.some((r) => r.receiptStatus === 'exported');
      const res = await dbExportStatement({ statementId: p.statement.id, format, fileName: file.name, dateFormat, includeExported });
      if (res.error) { setError(`${p.card.label}: ${res.error}`); break; }
      downloadText(file.name, file.csv, false);
      names.push(file.name);
    }
    setBusy(false);
    if (names.length) setDone(`Downloaded ${names.join(', ')}. ${names.length === 1 ? 'That month is' : 'Those months are'} marked exported.`);
    setReexport({});
    if (campId) void refreshReceipts(campId, apply);
  }

  if (!statements.length) {
    return (
      <EmptyState title="Import a statement first">
        Exports follow the card statement, one file per card per month, so each file adds up to the bill it came from. <Link to="/receipts/reconcile" className="font-bold underline">Import one on Reconcile</Link>.
      </EmptyState>
    );
  }

  const formatInfo = EXPORT_FORMATS.find((f) => f.value === format)!;

  return (
    <div data-testid="export">
      <div className="grid grid-cols-1 gap-4 rounded-card border border-border bg-white p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className={labelClass} htmlFor="export-month">Statement month</label>
              <select id="export-month" className={`${selectClass} w-full`} value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className={labelClass} htmlFor="export-card">Card</label>
              <select id="export-card" className={`${selectClass} w-full`} value={chosenCard} onChange={(e) => setCardChoice(e.target.value)}>
                {cardsInMonth.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                {cardsInMonth.length > 1 && <option value="all">All {cardsInMonth.length} cards, one file each</option>}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="export-dates">Dates in the file</label>
            <select id="export-dates" className={`${selectClass} w-full`} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
              {DATE_FORMATS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <p className="mt-1 text-[12px] text-ink-soft">Pick the same format in QuickBooks’ import step. Posted dates from the statement are used, not receipt dates.</p>
          </div>
        </div>
        <div>
          <p className={labelClass}>QuickBooks Online format</p>
          <div className="space-y-2">
            {EXPORT_FORMATS.map((f) => (
              <label key={f.value} className={`flex items-start gap-2 rounded-btn border px-3 py-2 text-[13px] ${format === f.value ? 'border-sage bg-paper-raised' : 'border-border'}`}>
                <input type="radio" name="export-format" className="mt-0.5" checked={format === f.value} onChange={() => setFormat(f.value as QboFormat)} value={f.value} />
                <span className="min-w-0"><b className="font-semibold">{f.label}</b>
                  <span className="block text-[12px] text-ink-soft">{f.carries}</span>
                  {format === f.value && <span className="mt-0.5 block text-[12px] font-semibold text-amber-text">{f.lacks}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {error && <Callout tone="red">{error}</Callout>}
        {done && <Callout tone="green" className="font-semibold">{done}</Callout>}
      </div>

      {panels.map((p) => {
        const blocked = blockedReason(p);
        const bills = format === 'qbo_bills';
        const rowsCents = bills ? p.ex.billsCents : p.ex.bankRowsCents;
        const rowCount = bills ? p.ex.billCount : p.ex.bankRowCount;
        const preview = parseCsv(fileFor(p.ex, p.card, format).csv);
        const statementCents = p.ex.statementTotalCents;
        return (
          <section key={p.card.id} className="mt-5" data-testid="export-card" data-card={p.card.id}>
            <SectionTitle title={`${p.card.label}${p.card.holderName ? ` · ${p.card.holderName}` : ''} · ${monthLabel(month)}`} count={rowCount} />

            {/* The file adds up to the bill: say so, with the numbers. */}
            <div className="rounded-card border border-border bg-white px-4 py-3 text-[13px]" data-testid="export-reconciles">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
                <span><b className="text-[15px]">{formatCents(rowsCents)}</b> in {rowCount} {bills ? 'bill' : 'row'}{rowCount === 1 ? '' : 's'}</span>
                {p.ex.personalCount > 0 && <span className="text-ink-soft">+ {formatCents(p.ex.personalCents)} personal ({p.ex.personalCount}, not exported)</span>}
                {bills && p.ex.creditCount > 0 && <span className="text-ink-soft">− {formatCents(-p.ex.creditsCents)} credits ({p.ex.creditCount}, not in bills)</span>}
                <span className="text-ink-soft">= {formatCents(rowsCents + p.ex.personalCents + (bills ? p.ex.creditsCents : 0))}</span>
                <span className={statementCents != null && statementCents === rowsCents + p.ex.personalCents + (bills ? p.ex.creditsCents : 0) ? 'font-semibold text-green-muted-text' : 'font-semibold text-red'}>
                  {statementCents == null ? 'no statement total' : statementCents === rowsCents + p.ex.personalCents + (bills ? p.ex.creditsCents : 0) ? `the statement total ✓` : `but the statement says ${formatCents(statementCents)}`}
                </span>
              </div>
              {bills && p.ex.creditCount > 0 && (
                <p className="mt-1 text-[12px] text-ink-soft">QuickBooks’ bill import has no credits: record the {p.ex.creditCount} payment{p.ex.creditCount === 1 ? '' : 's'} and refund{p.ex.creditCount === 1 ? '' : 's'} on the card account in QuickBooks.</p>
              )}
            </div>

            {!p.summary.agrees ? (
              <Callout tone="amber" className="mt-2">
                <p className="flex items-center gap-1.5 font-bold"><AlertTriangle className="h-4 w-4" /> Not ready for QuickBooks: this month does not agree yet.</p>
                <ul className="mt-1 list-disc pl-6">{p.summary.blockers.map((b) => <li key={b.code}>{b.message}</li>)}</ul>
                <p className="mt-1">
                  <Link to={`/receipts/reconcile?card=${p.card.id}&month=${month}`} className="font-bold underline">Resolve it on Reconcile</Link>, or download the review spreadsheet to look at it as it is.
                </p>
              </Callout>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-green-muted-text"><CheckCircle2 className="h-4 w-4" /> The month agrees with the bill.</p>
            )}
            {p.statement.exportId && (
              <label className="mt-2 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={!!reexport[p.statement.id]} onChange={(e) => setReexport((x) => ({ ...x, [p.statement.id]: e.target.checked }))} />
                Exported {fmtInstantDay((p.statement as CardStatement).exportedAt)}. Export it again (only if the first file never went into QuickBooks).
              </label>
            )}
            {blocked && blocked !== 'The month does not agree yet' && blocked !== 'Already exported' && <Callout tone="red" className="mt-2">{blocked}: split the import in QuickBooks.</Callout>}

            <div className="mt-2 max-h-[340px] overflow-auto rounded-card border border-border bg-white" data-testid="export-preview">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-paper-raised">
                  <tr>{preview[0]?.map((h, i) => <th key={i} className="whitespace-nowrap px-2.5 py-1.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.slice(1, 201).map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      {r.map((c, j) => <td key={j} className={`whitespace-nowrap px-2.5 py-1.5 ${/^-?\d+\.\d{2}$/.test(c) ? 'text-right tabular-nums' : ''}`}>{c}</td>)}
                    </tr>
                  ))}
                  {preview.length <= 1 && <tr><td className="px-3 py-4 text-center text-ink-soft">No rows.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[12px] text-ink-soft">Exactly what <code>{exportFileName(format, p.ex.cardSlug, month)}</code> will contain.</p>
          </section>
        );
      })}

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-paper-raised/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border"
           style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <p className="mr-auto min-w-0 text-[12px] text-ink-soft">{formatInfo.label}. {ready.length} of {panels.length} ready.</p>
        <Button variant="ghost" onClick={reviewDownload} disabled={!panels.length} data-testid="download-review">
          <FileSpreadsheet className="h-4 w-4" /> Download for review
        </Button>
        <Button onClick={exportForQuickBooks} disabled={!ready.length || busy} data-testid="export-qbo">
          <Download className="h-4 w-4" /> {busy ? 'Exporting…' : 'Export for QuickBooks'}
        </Button>
      </div>
      <p className="mt-1.5 text-right text-[11.5px] text-ink-soft">{REVIEW_FORMAT.carries} Export for QuickBooks marks the month and its receipts exported.</p>

      {exports.length > 0 && (
        <>
          <SectionTitle title="Past exports" count={exports.length} />
          <ul className="divide-y divide-border rounded-card border border-border bg-white text-[13px]">
            {exports.slice(0, 20).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-semibold">{fmtInstantDay(x.createdAt)}</span>
                <span className="min-w-0 truncate text-ink-soft">{x.fileName}</span>
                <span className="text-ink-soft">{FORMAT_LABEL[x.format] ?? x.format}</span>
                <span className="ml-auto tabular-nums">{x.rowCount} · {formatCents(toCents(x.total))}{x.personalTotal ? ` + ${formatCents(toCents(x.personalTotal))} personal` : ''}</span>
                {x.createdByName && <span className="w-full text-[12px] text-ink-soft sm:w-auto">by {x.createdByName}{x.includeExported ? ' · re-export' : ''}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

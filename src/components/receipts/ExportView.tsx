import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import { dbExportReceipts, refreshReceipts } from '@/lib/receiptsDb';
import { parseCsv } from '@/lib/csv';
import {
  EXPORT_FORMATS, QBO_MAX_LINES, exportFileName, formatCents, monthBounds, monthKey, monthLabel, toCents, toQuickBooksCsv,
} from '@/lib/receipts';
import { todayStr } from '@/lib/utils';
import type { ExportFormat } from '@/lib/receiptTypes';
import { Callout, EmptyState, SectionTitle, downloadText, fmtDay, labelClass, selectClass } from './receiptsUi';

/**
 * Pick a period and cards, see exactly the rows that will be written, download, and the rows are
 * marked exported in the same step.
 *
 * Marking happens before the download, not after: a file that downloaded while the marking
 * failed would be a set of receipts in the books that the next export includes again. An
 * already-exported receipt only comes back with the box ticked on purpose.
 */
export function ExportView() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const receipts = useReceiptsStore((s) => s.receipts);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const exports = useReceiptsStore((s) => s.exports);
  const apply = useReceiptsStore((s) => s.apply);

  const months = useMemo(() => {
    const set = new Set(receipts.map((r) => (r.purchaseDate ? monthKey(r.purchaseDate) : null)).filter(Boolean) as string[]);
    set.add(monthKey(todayStr()));
    return [...set].sort();
  }, [receipts]);
  const latestWithReady = useMemo(() => receipts.filter((r) => r.status === 'ready' && r.purchaseDate).map((r) => monthKey(r.purchaseDate!)).sort().pop(), [receipts]);

  const [fromMonth, setFromMonth] = useState(latestWithReady ?? months[months.length - 1]);
  const [toMonth, setToMonth] = useState(latestWithReady ?? months[months.length - 1]);
  const [cardIds, setCardIds] = useState<string[]>(() => cards.map((c) => c.id));
  const [format, setFormat] = useState<ExportFormat>('qbo_3col');
  const [includeExported, setIncludeExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const from = monthBounds(fromMonth <= toMonth ? fromMonth : toMonth).from;
  const to = monthBounds(fromMonth <= toMonth ? toMonth : fromMonth).to;
  const inPeriod = useMemo(() => receipts.filter((r) => r.purchaseDate && r.purchaseDate >= from && r.purchaseDate <= to
    && (r.cardId ? cardIds.includes(r.cardId) : cardIds.includes('none'))), [receipts, from, to, cardIds]);
  const rows = useMemo(() => inPeriod.filter((r) => r.status === 'ready' || (includeExported && r.status === 'exported')), [inPeriod, includeExported]);
  const waiting = inPeriod.filter((r) => r.status === 'needs_review' || r.status === 'processing').length;
  const alreadyExported = inPeriod.filter((r) => r.status === 'exported').length;

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const csv = useMemo(() => (rows.length ? toQuickBooksCsv(rows, format, { codes, cards, appOrigin }) : ''), [rows, format, codes, cards, appOrigin]);
  const preview = useMemo(() => (csv ? parseCsv(csv) : []), [csv]);
  const totalCents = rows.reduce((s, r) => s + toCents(r.total), 0);
  const fileName = exportFileName(format, from, to);
  const tooMany = format !== 'detailed' && preview.length - 1 > QBO_MAX_LINES;

  async function run() {
    if (!campId || !rows.length) return;
    setBusy(true); setError(null); setDone(null);
    const res = await dbExportReceipts({
      campId, receiptIds: rows.map((r) => r.id), periodFrom: from, periodTo: to,
      cardIds: cardIds.filter((c) => c !== 'none'), format, fileName, includeExported,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    downloadText(fileName, csv, format === 'detailed');
    setDone(`Downloaded ${fileName}: ${rows.length} receipt${rows.length === 1 ? '' : 's'}, ${formatCents(totalCents)}. They are marked exported.`);
    void refreshReceipts(campId, apply);
  }

  if (!receipts.length) return <EmptyState title="Nothing to export yet">Checked receipts can be exported for QuickBooks once there are some.</EmptyState>;

  const toggleCard = (id: string) => setCardIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  return (
    <div data-testid="export">
      <div className="grid grid-cols-1 gap-4 rounded-card border border-border bg-white p-4 lg:grid-cols-3">
        <div>
          <p className={labelClass}>Period</p>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="From month" className={selectClass} value={fromMonth} onChange={(e) => setFromMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <span className="text-[13px] text-ink-soft">to</span>
            <select aria-label="To month" className={selectClass} value={toMonth} onChange={(e) => setToMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <p className={labelClass}>Cards</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {cards.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" checked={cardIds.includes(c.id)} onChange={() => toggleCard(c.id)} /> {c.label}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-[13px] text-ink-soft">
              <input type="checkbox" checked={cardIds.includes('none')} onChange={() => toggleCard('none')} /> No card
            </label>
          </div>
        </div>
        <div>
          <p className={labelClass}>Format</p>
          <div className="space-y-1.5">
            {EXPORT_FORMATS.map((f) => (
              <label key={f.value} className="flex items-start gap-2 text-[13px]">
                <input type="radio" name="export-format" className="mt-0.5" checked={format === f.value} onChange={() => setFormat(f.value)} value={f.value} />
                <span><b className="font-semibold">{f.label}</b><span className="block text-[12px] text-ink-soft">{f.hint}</span></span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={includeExported} onChange={(e) => setIncludeExported(e.target.checked)} />
        Include receipts already exported{alreadyExported ? ` (${alreadyExported} in this period)` : ''}
      </label>

      <div className="mt-3 space-y-2">
        {waiting > 0 && <Callout tone="amber">{waiting} receipt{waiting === 1 ? '' : 's'} in this period still need{waiting === 1 ? 's' : ''} checking and will not be exported.</Callout>}
        {tooMany && <Callout tone="red">QuickBooks Online takes at most {QBO_MAX_LINES} lines per upload. Export a shorter period.</Callout>}
        {error && <Callout tone="red">{error}</Callout>}
        {done && <Callout tone="green" className="font-semibold">{done}</Callout>}
      </div>

      <SectionTitle title="Preview" count={rows.length}>
        <span className="text-[13px] font-bold tabular-nums">{formatCents(totalCents)}</span>
        <Button onClick={run} disabled={!rows.length || busy || tooMany}>
          <Download className="h-4 w-4" /> {busy ? 'Exporting…' : 'Download and mark exported'}
        </Button>
      </SectionTitle>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-soft">No ready receipts in this period{alreadyExported && !includeExported ? ' that have not already been exported' : ''}.</p>
      ) : (
        <>
          <p className="mb-2 text-[12px] text-ink-soft">Exactly what the file will contain: <code>{fileName}</code></p>
          <div className="max-h-[420px] overflow-auto rounded-card border border-border bg-white" data-testid="export-preview">
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
              </tbody>
            </table>
          </div>
        </>
      )}

      {exports.length > 0 && (
        <>
          <SectionTitle title="Past exports" count={exports.length} />
          <ul className="divide-y divide-border rounded-card border border-border bg-white text-[13px]">
            {exports.slice(0, 20).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-semibold">{fmtDay(x.createdAt.slice(0, 10))}</span>
                <span className="text-ink-soft">{x.fileName}</span>
                <span className="text-ink-soft">{EXPORT_FORMATS.find((f) => f.value === x.format)?.label}</span>
                <span className="ml-auto tabular-nums">{x.rowCount} · {formatCents(toCents(x.total))}</span>
                {x.createdByName && <span className="w-full text-[12px] text-ink-soft sm:w-auto">by {x.createdByName}{x.includeExported ? ' · re-export' : ''}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

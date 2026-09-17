import { useMemo, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { parseCsv } from '@/lib/csv';
import {
  STATEMENT_FIELDS, dominantMonth, formatCents, guessStatementMapping, monthLabel, parseMoney,
  parseStatementGrid, toCents, type DateOrder, type StatementField, type StatementMapping,
} from '@/lib/receipts';
import { dbImportStatement } from '@/lib/receiptsDb';
import type { ExpenseCard } from '@/lib/receiptTypes';
import { Callout, fieldClass, fmtDay, inputClass, labelClass, money } from './receiptsUi';

/**
 * Upload a bank's CSV, check what we think each column is, see the lines, import.
 *
 * The mapping is guessed (from the header when there is one, from the cells when there is not)
 * and then shown, never silently applied: a wrong guess about which column is the amount, or
 * whether 03/08 is March or August, imports a month that cannot agree with anything.
 */
export function StatementImport({ card, month, replacing, onDone, onCancel }: {
  card: ExpenseCard; month: string;
  /** The statement already imported for this card-month, when this is a replacement. */
  replacing: { chargeCount: number; creditCount: number; resolvedCount: number } | null;
  onDone: (month: string) => void; onCancel?: () => void;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<StatementMapping | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [periodMonth, setPeriodMonth] = useState(month);
  const [totalInput, setTotalInput] = useState('');
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  // "I don't have the bill's total": the import goes ahead, and every screen says the total is only
  // the lines' own sum. A blank total used to import as if it had been typed, and the header then
  // read "$885.78 from the bill" though nobody had looked at the bill.
  const [noTotal, setNoTotal] = useState(false);
  const replace = !!replacing;
  const fileRef = useRef<HTMLInputElement>(null);

  const grid = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);

  function load(next: string, name: string | null) {
    setText(next);
    setFileName(name);
    setError(null);
    const g = parseCsv(next);
    if (!g.length) { setMapping(null); setWarnings(['That file has no rows.']); return; }
    const guess = guessStatementMapping(g);
    setMapping(guess.mapping);
    setWarnings(guess.warnings);
    const parsed = parseStatementGrid(g, guess.mapping);
    const dom = dominantMonth(parsed.lines.map((l) => l.postedDate));
    if (dom) setPeriodMonth(dom);
    setTotalInput('');
    setNoTotal(false);
  }

  const parsed = useMemo(() => (mapping ? parseStatementGrid(grid, mapping) : { lines: [], errors: [] }), [grid, mapping]);
  const netCents = parsed.lines.reduce((s, l) => s + toCents(l.amount), 0);
  const chargeCount = parsed.lines.filter((l) => l.amount > 0).length;
  const typedTotal = totalInput.trim() ? parseMoney(totalInput) : null;
  const creditCount = parsed.lines.filter((l) => l.amount <= 0).length;
  const dates = parsed.lines.map((l) => l.postedDate).sort();
  const header = mapping?.hasHeader ? grid[0] : null;
  const width = Math.max(0, ...grid.map((r) => r.length));
  const sampleRow = grid[mapping?.hasHeader ? 1 : 0] ?? [];

  const setColumn = (i: number, f: StatementField) => setMapping((m) => {
    if (!m) return m;
    const columns = m.columns.slice();
    // One date and one amount column: picking a second one moves the choice.
    if (f !== 'skip' && f !== 'description') columns.forEach((c, j) => { if (c === f) columns[j] = 'skip'; });
    if (f === 'amount') columns.forEach((c, j) => { if (c === 'debit' || c === 'credit') columns[j] = 'skip'; });
    if (f === 'debit' || f === 'credit') columns.forEach((c, j) => { if (c === 'amount') columns[j] = 'skip'; });
    columns[i] = f;
    return { ...m, columns };
  });

  const hasAmount = mapping?.columns.some((c) => c === 'amount' || c === 'debit');
  const hasDate = mapping?.columns.includes('date');
  // A total typed from the bill that the lines do not add up to is either a typo or a line the CSV
  // dropped. It was accepted silently, and the month then refused to agree for a reason nobody saw
  // at import. Now it is said at once, and importing anyway takes a tick.
  const totalMismatch = !noTotal && typedTotal != null && toCents(typedTotal) !== netCents;
  const newCharges = parsed.lines.filter((l) => l.amount > 0).length;
  const totalReady = noTotal || typedTotal != null;
  const canImport = !!mapping && hasAmount && hasDate && parsed.lines.length > 0 && parsed.errors.length === 0 && !(!noTotal && totalInput.trim() && typedTotal == null)
    && totalReady && (!totalMismatch || acceptMismatch);

  async function doImport() {
    if (!mapping) return;
    setBusy(true); setError(null);
    const res = await dbImportStatement({
      cardId: card.id, periodMonth: `${periodMonth}-01`, statementTotal: noTotal ? null : toCents(typedTotal) / 100, fileName,
      lines: parsed.lines.map((l) => ({ postedDate: l.postedDate, description: l.description, amount: l.amount })),
      replace,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onDone(periodMonth);
  }

  if (!text) {
    return (
      <div className="rounded-card border border-border bg-white p-4 sm:p-6" data-testid="statement-import">
        <h3 className="font-display text-[16px] font-bold text-forest">{replace ? 'Replace the statement' : 'Import the statement'} for {card.label} · {monthLabel(month)}</h3>
        {replacing && (
          <Callout tone="amber" className="mt-2">
            A statement for this card and month is already imported, with {replacing.chargeCount} charge{replacing.chargeCount === 1 ? '' : 's'}
            {replacing.resolvedCount ? ` (${replacing.resolvedCount} matched or explained)` : ''}. Importing a new file replaces all of them, and their matches and notes.
          </Callout>
        )}
        <p className="mt-1 text-[13px] text-ink-soft">Download the card's transactions as a CSV from online banking (RBC, TD, Scotiabank, BMO, CIBC, Desjardins and others all work) and drop it here.</p>
        <div
          className="mt-4 flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-paper-raised px-4 py-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) load(await f.text(), f.name);
          }}
        >
          <FileUp className="h-7 w-7 text-sage" />
          <Button onClick={() => fileRef.current?.click()}>Choose the statement CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" data-testid="statement-file"
                 name="statement-csv" aria-label={`Card statement CSV for ${card.label}`}
                 onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text(), f.name); e.target.value = ''; }} />
          <button className="text-[12.5px] font-semibold text-forest underline" onClick={() => setPasting((p) => !p)}>or paste the rows</button>
        </div>
        {pasting && (
          <PasteBox onUse={(t) => load(t, null)} />
        )}
        {onCancel && <div className="mt-3 text-right"><Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button></div>}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-white p-4 sm:p-6" data-testid="statement-mapper">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="flex-1 font-display text-[16px] font-bold text-forest">Check the columns</h3>
        <span className="text-[12.5px] text-ink-soft">{fileName ?? 'Pasted rows'} · {parsed.lines.length} {parsed.lines.length === 1 ? 'line' : 'lines'}{mapping?.hasHeader ? ' and a header row' : ''}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-soft">We guessed what each column is. Fix anything that looks wrong; the preview updates as you go.</p>
      {warnings.map((w) => <Callout key={w} tone="amber" className="mt-3">{w}</Callout>)}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: width }, (_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-btn border border-border bg-paper-raised px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-ink">{header?.[i]?.trim() || `Column ${i + 1}`}</p>
              <p className="truncate text-[11.5px] text-ink-soft">e.g. {sampleRow[i]?.trim() || '(blank)'}</p>
            </div>
            <select aria-label={`Column ${i + 1}: ${header?.[i] ?? ''}`} className={`${fieldClass} w-[150px] flex-none py-1.5`} value={mapping?.columns[i] ?? 'skip'}
                    onChange={(e) => setColumn(i, e.target.value as StatementField)} data-column={i}>
              {STATEMENT_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-ink-soft">Dates are</span>
          <select className={`${fieldClass} py-1.5`} value={mapping?.dateOrder} onChange={(e) => setMapping((m) => m && { ...m, dateOrder: e.target.value as DateOrder })}>
            <option value="MDY">month / day / year</option>
            <option value="DMY">day / month / year</option>
            <option value="YMD">year - month - day</option>
          </select>
        </label>
        {mapping?.columns.includes('amount') && (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-ink-soft">Purchases are</span>
            <select className={`${fieldClass} py-1.5`} value={mapping.chargeSign} onChange={(e) => setMapping((m) => m && { ...m, chargeSign: e.target.value as 'positive' | 'negative' })}>
              <option value="positive">positive numbers</option>
              <option value="negative">negative numbers</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={mapping?.hasHeader ?? false} onChange={(e) => setMapping((m) => m && { ...m, hasHeader: e.target.checked })} />
          <span className="text-ink-soft">First row is a header</span>
        </label>
      </div>

      {/* Preview */}
      <div className="mt-4">
        <p className={labelClass}>Preview · {parsed.lines.length} lines: {chargeCount} {chargeCount === 1 ? 'charge' : 'charges'}{creditCount ? `, ${creditCount} ${creditCount === 1 ? 'credit' : 'credits'}` : ''}{dates.length ? `, ${fmtDay(dates[0])} to ${fmtDay(dates[dates.length - 1])}` : ''}</p>
        {parsed.errors.length > 0 && (
          <Callout tone="red" className="mb-2">
            {parsed.errors.slice(0, 3).map((e) => <div key={e.row}>{e.message}</div>)}
            {parsed.errors.length > 3 && <div>…and {parsed.errors.length - 3} more. Check the date column and the date order.</div>}
          </Callout>
        )}
        <div className="max-h-72 overflow-auto rounded-btn border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-paper-raised">
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
                <th className="px-2.5 py-1.5">Date</th><th className="px-2.5 py-1.5">Description</th><th className="px-2.5 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {parsed.lines.slice(0, 60).map((l) => (
                <tr key={l.row} className="border-t border-border/60">
                  <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{fmtDay(l.postedDate)}</td>
                  <td className="px-2.5 py-1.5">{l.description}</td>
                  <td className={`whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums ${l.amount < 0 ? 'text-green-muted-text' : ''}`}>
                    {l.amount < 0 ? `−${money(-l.amount)} credit` : money(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[12px] text-ink-soft">Purchases are positive; payments and refunds show as credits.</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="st-month">Statement month</label>
          <input id="st-month" type="month" className={inputClass} value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
          {periodMonth !== month && <p className="mt-1 text-[12px] text-amber-text">Most lines are from {monthLabel(periodMonth)}.</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="st-total">Statement total (from the Visa bill)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">$</span>
            <input id="st-total" inputMode="decimal" className={`${inputClass} pl-6 tabular-nums`} placeholder="From the bill"
                   disabled={noTotal} value={noTotal ? '' : totalInput} onChange={(e) => setTotalInput(e.target.value)} />
          </div>
          <p className="mt-1 text-[12px] text-ink-soft">The lines add up to <b className="tabular-nums">{formatCents(netCents)}</b> ({chargeCount} {chargeCount === 1 ? 'charge' : 'charges'}). Type the total from the bill so we can check nothing was dropped.</p>
          <label className="mt-1.5 flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" className="mt-0.5" checked={noTotal} onChange={(e) => { setNoTotal(e.target.checked); setAcceptMismatch(false); }} data-testid="no-total" />
            <span>I don’t have the bill’s total. Import anyway; the total will say “sum of lines, not checked against the bill” until it is typed.</span>
          </label>
        </div>
      </div>
      {totalMismatch && !noTotal && (
        <Callout tone="red" className="mt-3" >
          <p data-testid="total-mismatch"><b>The bill’s total, {formatCents(toCents(typedTotal))}, is not what the lines add up to ({formatCents(netCents)}).</b> A {formatCents(Math.abs(toCents(typedTotal) - netCents))} difference: check the total for a typo, or the file for a missing line.</p>
          <label className="mt-1.5 flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={acceptMismatch} onChange={(e) => setAcceptMismatch(e.target.checked)} />
            Import anyway. The month will not agree until they match; the total can be corrected later.
          </label>
        </Callout>
      )}
      {replacing && (
        <Callout tone="amber" className="mt-3">
          <span data-testid="replace-warning">This replaces {replacing.chargeCount} charge{replacing.chargeCount === 1 ? '' : 's'} with {newCharges}.{replacing.resolvedCount ? ` The ${replacing.resolvedCount} match${replacing.resolvedCount === 1 ? '' : 'es'} and notes on the old lines are cleared; receipts are kept and suggested again.` : ''}</span>
        </Callout>
      )}

      {error && <Callout tone="red" className="mt-3">{error}</Callout>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => { setText(''); setMapping(null); onCancel?.(); }}>Start over</Button>
        {!totalReady && parsed.lines.length > 0 && <span className="mr-auto self-center text-[12.5px] text-amber-text" data-testid="total-needed">Type the bill’s total, or tick “I don’t have the bill’s total”.</span>}
        <Button onClick={doImport} disabled={!canImport || busy}>{busy ? 'Importing…' : replace ? `Replace with ${parsed.lines.length} lines` : `Import ${parsed.lines.length} lines`}</Button>
      </div>
    </div>
  );
}

function PasteBox({ onUse }: { onUse: (text: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="mt-3">
      <textarea className={`${inputClass} h-32 font-mono text-[12px]`} value={v} onChange={(e) => setV(e.target.value)} placeholder="08/03/2026,NORTHWIND HARDWARE,84.75" />
      <div className="mt-2 text-right"><Button size="sm" onClick={() => onUse(v)} disabled={!v.trim()}>Use these rows</Button></div>
    </div>
  );
}

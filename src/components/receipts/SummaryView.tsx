import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useReceiptsStore } from '@/store/receiptsStore';
import { formatCents, monthLabel, noReceiptCharges, spendSummary, statementTieOut, type SpendRow, type TieOutRow } from '@/lib/receipts';
import { TAX_TYPES, type TaxType } from '@/lib/receiptTypes';
import { Callout, EmptyState, Figure, SectionTitle, selectClass } from './receiptsUi';

/**
 * The season in numbers: spend by month and by budget code, sales tax paid by type, the share of it
 * the camp may get back, and whether it all ties out to the card bills.
 *
 * Recoverable tax is labelled an estimate everywhere it appears. It is computed from rules the
 * camp typed in, and whether those rules are right depends on its charity or public-service-body
 * status — which is a question for its finance director, not for this screen.
 */
export function SummaryView() {
  const receipts = useReceiptsStore((s) => s.receipts);
  const codes = useReceiptsStore((s) => s.codes);
  const cards = useReceiptsStore((s) => s.cards);
  const statements = useReceiptsStore((s) => s.statements);
  const lines = useReceiptsStore((s) => s.lines);
  const taxSettings = useReceiptsStore((s) => s.taxSettings);
  const [cardId, setCardId] = useState('all');

  const rules = useMemo(() => taxSettings?.taxRules ?? [], [taxSettings]);
  const currency = taxSettings?.currency ?? 'CAD';
  const scoped = useMemo(() => receipts.filter((r) => cardId === 'all' || r.cardId === cardId), [receipts, cardId]);
  const scopedStatements = useMemo(() => statements.filter((st) => cardId === 'all' || st.cardId === cardId), [statements, cardId]);
  const charges = useMemo(() => noReceiptCharges(lines, scopedStatements, cards), [lines, scopedStatements, cards]);
  const province = taxSettings?.province ?? null;
  const s = useMemo(() => spendSummary(scoped, codes, rules, currency, province, charges), [scoped, codes, rules, currency, province, charges]);
  const tieOut = useMemo(() => statementTieOut(scopedStatements, lines, receipts), [scopedStatements, lines, receipts]);
  const taxTypes = TAX_TYPES.filter((t) => s.totals.taxes[t] !== 0);

  if (!receipts.some((r) => r.status === 'ready' || r.status === 'exported') && !charges.length) {
    return <EmptyState title="Nothing to sum up yet">Once receipts are checked and saved, spend by month, by budget code and by tax type shows here.</EmptyState>;
  }

  const fig = (c: number) => formatCents(c, currency);
  const codeOf = (key: string) => codes.find((c) => c.id === key)?.code;

  return (
    <div data-testid="summary">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Card" className={selectClass} value={cardId} onChange={(e) => setCardId(e.target.value)}>
          <option value="all">All cards</option>
          {cards.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="text-[12.5px] text-ink-soft">
          {s.totals.count} confirmed receipt{s.totals.count === 1 ? '' : 's'}{s.totals.noReceiptCount ? ` and ${s.totals.noReceiptCount} charge${s.totals.noReceiptCount === 1 ? '' : 's'} with no receipt` : ''}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-card border border-border bg-white sm:grid-cols-4 sm:divide-x sm:divide-border">
        <Figure label="Total spend" value={fig(s.totals.totalCents)} hint={`${fig(s.totals.subtotalCents)} before tax`} />
        <Figure label="Sales tax paid" value={fig(TAX_TYPES.reduce((a, t) => a + s.totals.taxes[t], 0))} hint={taxTypes.map((t) => `${t === 'other' ? 'Other' : t} ${fig(s.totals.taxes[t])}`).join(' · ') || 'none'} />
        <Figure label="Recoverable (estimate)" value={fig(s.recoverable.totalCents)} hint={rules.length ? 'from your tax settings, on the totals' : 'set your tax rules'} tone="green" />
        <Figure label="Exported" value={`${s.totals.exportedCount} of ${s.totals.count}`} hint="receipts, to QuickBooks" />
      </div>

      {s.totals.taxes.HST !== 0 && (
        <p className="mt-2 text-[12.5px] text-ink-soft" data-testid="hst-split">
          HST {fig(s.totals.taxes.HST)} = federal part {fig(s.totals.hst.federal)} + provincial part {fig(s.totals.hst.provincial)}, split at the rate on each receipt.
        </p>
      )}

      {(s.needsReviewCount > 0 || s.otherCurrency.count > 0 || !taxSettings?.confirmedAt) && (
        <div className="mt-3 space-y-2">
          {s.needsReviewCount > 0 && <Callout tone="amber">{s.needsReviewCount} receipt{s.needsReviewCount === 1 ? ' is' : 's are'} still waiting to be checked and {s.needsReviewCount === 1 ? 'is' : 'are'} not counted.</Callout>}
          {s.otherCurrency.count > 0 && <Callout tone="blue">{s.otherCurrency.count} receipt{s.otherCurrency.count === 1 ? '' : 's'} in {s.otherCurrency.currency} ({formatCents(s.otherCurrency.totalCents, s.otherCurrency.currency ?? 'USD')}) {s.otherCurrency.count === 1 ? 'is' : 'are'} not added to {currency} totals.</Callout>}
          {!taxSettings?.confirmedAt && (
            <Callout tone="amber">
              Recoverable amounts are an <b>estimate</b> from tax rules nobody has checked yet. <Link to="/receipts?tab=settings" className="font-bold underline">Check they match how your camp claims sales tax back</Link>.
            </Callout>
          )}
        </div>
      )}

      {tieOut.length > 0 && (
        <>
          <SectionTitle title="Does it tie out to the card bills?" count={tieOut.length} />
          <TieOutTable rows={tieOut} cards={cards} fig={fig} />
        </>
      )}

      <SectionTitle title="By month" count={s.byMonth.length} />
      <SpendTable rows={s.byMonth} taxTypes={taxTypes} fig={fig} firstLabel="Month" totals={s.totals} showExported />

      <SectionTitle title="By budget code" count={s.byCode.length} />
      <SpendTable rows={s.byCode} taxTypes={taxTypes} fig={fig} firstLabel="Budget code" totals={s.totals} codeOf={codeOf} />

      <p className="mt-4 text-[12px] text-ink-soft" data-testid="rebate-method">
        Spend is every confirmed receipt, at its purchase date, and every charge explained with no receipt, at its posted date, with no tax claimed on it.
        Recoverable tax is worked out the way the rebate or input tax credits are filed: the tax on everything shown here is added up first, each part
        (GST, HST’s federal and provincial parts, PST, QST) rounded once, and the result shared back out to receipts in proportion to the tax each paid,
        so every row adds up to the total exactly. Narrowing the card or the months shown works it out again on those totals. It is an estimate, not tax advice.
      </p>
    </div>
  );
}

function TieOutTable({ rows, cards, fig }: { rows: TieOutRow[]; cards: { id: string; label: string }[]; fig: (c: number) => string }) {
  const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  const th = 'px-3 py-2 text-right font-bold';
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-white" data-testid="tie-out">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-border bg-paper-raised text-[10.5px] uppercase tracking-wider text-ink-soft">
            <th className="px-3 py-2 text-left font-bold">Card · month</th>
            <th className={th}>Receipts</th>
            <th className={th}>No receipt</th>
            <th className={th}>Personal</th>
            <th className={th}>Credits</th>
            <th className={th}>= Explained</th>
            <th className={th}>Statement</th>
            <th className="px-3 py-2 text-left font-bold">Ties out?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const card = cards.find((c) => c.id === r.cardId);
            return (
              <tr key={r.statementId} className="border-b border-border/60 align-top last:border-0" data-tie-out={r.statementId}>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{card?.label ?? 'Card'} · {monthLabel(r.month)}</td>
                <td className={td}>{fig(r.receiptsCents)}</td>
                <td className={td}>{r.noReceiptCents ? fig(r.noReceiptCents) : '—'}</td>
                <td className={td}>{r.personalCents ? fig(r.personalCents) : '—'}</td>
                <td className={td}>{r.creditsCents ? fig(r.creditsCents) : '—'}</td>
                <td className={`${td} font-bold`}>{fig(r.explainedCents)}</td>
                <td className={td}>
                  {r.statementTotalCents != null ? fig(r.statementTotalCents) : '—'}
                  {r.totalSource === 'sum_of_lines' && <span className="block text-[11px] text-amber-text">sum of lines, not checked</span>}
                </td>
                <td className="min-w-[15rem] px-3 py-2">
                  {r.ties ? (
                    <span className="flex items-center gap-1 font-semibold text-green-muted-text" data-ties="yes"><CheckCircle2 className="h-4 w-4" /> Ties out</span>
                  ) : (
                    <div className="text-amber-text" data-ties="no">
                      <p className="font-semibold">{r.differenceCents ? `${fig(Math.abs(r.differenceCents))} ${r.differenceCents > 0 ? 'short of' : 'over'} the statement` : 'Not yet'}</p>
                      <ul className="list-disc pl-4 text-[12px]">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[12px]">
                    {!r.ties && <Link className="font-semibold text-forest underline" to={`/receipts/reconcile?card=${r.cardId}&month=${r.month}`}>Reconcile →</Link>}
                    <Link className="font-semibold text-forest underline" to={`/receipts?tab=export&card=${r.cardId}&month=${r.month}`} data-testid="summary-export-link">Export this month →</Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SpendTable({ rows, taxTypes, fig, firstLabel, totals, showExported, codeOf }: {
  rows: SpendRow[]; taxTypes: TaxType[]; fig: (c: number) => string; firstLabel: string; totals: SpendRow; showExported?: boolean;
  codeOf?: (key: string) => string | undefined;
}) {
  const th = 'px-3 py-2 text-right font-bold';
  const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  const showNoReceipt = totals.noReceiptCount > 0;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-white">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-border bg-paper-raised text-[10.5px] uppercase tracking-wider text-ink-soft">
            <th className="px-3 py-2 text-left font-bold">{firstLabel}</th>
            <th className={th}>Receipts</th>
            {showNoReceipt && <th className={th}>No receipt</th>}
            <th className={th}>Subtotal</th>
            {taxTypes.map((t) => <th key={t} className={th}>{t === 'other' ? 'Other tax' : t}</th>)}
            <th className={th}>Tip</th>
            <th className={th}>Total</th>
            <th className={th}>Recoverable*</th>
            {showExported && <th className={th}>Exported</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/60">
              <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.label}{codeOf?.(r.key) && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">{codeOf(r.key)}</span>}</td>
              <td className={td}>{r.count}</td>
              {showNoReceipt && <td className={td}>{r.noReceiptCount || '—'}</td>}
              <td className={td}>{fig(r.subtotalCents)}</td>
              {taxTypes.map((t) => <td key={t} className={td}>{fig(r.taxes[t])}</td>)}
              <td className={td}>{r.tipCents ? fig(r.tipCents) : '—'}</td>
              <td className={`${td} font-bold`}>{fig(r.totalCents)}</td>
              <td className={`${td} text-green-muted-text`}>{fig(r.recoverableCents)}</td>
              {showExported && <td className={td}>{r.exportedCount}/{r.count}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-paper-raised font-bold">
            <td className="px-3 py-2">Total</td>
            <td className={td}>{totals.count}</td>
            {showNoReceipt && <td className={td}>{totals.noReceiptCount}</td>}
            <td className={td}>{fig(totals.subtotalCents)}</td>
            {taxTypes.map((t) => <td key={t} className={td}>{fig(totals.taxes[t])}</td>)}
            <td className={td}>{totals.tipCents ? fig(totals.tipCents) : '—'}</td>
            <td className={td}>{fig(totals.totalCents)}</td>
            <td className={`${td} text-green-muted-text`}>{fig(totals.recoverableCents)}</td>
            {showExported && <td className={td}>{totals.exportedCount}/{totals.count}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

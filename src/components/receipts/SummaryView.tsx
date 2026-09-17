import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReceiptsStore } from '@/store/receiptsStore';
import { formatCents, spendSummary, type SpendRow } from '@/lib/receipts';
import { TAX_TYPES, type TaxType } from '@/lib/receiptTypes';
import { Callout, EmptyState, Figure, SectionTitle, selectClass } from './receiptsUi';

/**
 * The season in numbers: spend by month and by budget code, sales tax paid by type, and the
 * share of it the camp may get back.
 *
 * Recoverable tax is labelled an estimate everywhere it appears. It is computed from rules the
 * camp typed in, and whether those rules are right depends on its charity or public-service-body
 * status — which is a question for its finance director, not for this screen.
 */
export function SummaryView() {
  const receipts = useReceiptsStore((s) => s.receipts);
  const codes = useReceiptsStore((s) => s.codes);
  const cards = useReceiptsStore((s) => s.cards);
  const taxSettings = useReceiptsStore((s) => s.taxSettings);
  const [cardId, setCardId] = useState('all');

  const rules = useMemo(() => taxSettings?.taxRules ?? [], [taxSettings]);
  const currency = taxSettings?.currency ?? 'CAD';
  const scoped = useMemo(() => receipts.filter((r) => cardId === 'all' || r.cardId === cardId), [receipts, cardId]);
  const province = taxSettings?.province ?? null;
  const s = useMemo(() => spendSummary(scoped, codes, rules, currency, province), [scoped, codes, rules, currency, province]);
  const taxTypes = TAX_TYPES.filter((t) => s.totals.taxes[t] !== 0);

  if (!receipts.some((r) => r.status === 'ready' || r.status === 'exported')) {
    return <EmptyState title="Nothing to sum up yet">Once receipts are checked and saved, spend by month, by budget code and by tax type shows here.</EmptyState>;
  }

  const fig = (c: number) => formatCents(c, currency);

  return (
    <div data-testid="summary">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Card" className={selectClass} value={cardId} onChange={(e) => setCardId(e.target.value)}>
          <option value="all">All cards</option>
          {cards.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="text-[12.5px] text-ink-soft">{s.totals.count} confirmed receipts</span>
      </div>

      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-card border border-border bg-white sm:grid-cols-4 sm:divide-x sm:divide-border">
        <Figure label="Total spend" value={fig(s.totals.totalCents)} hint={`${fig(s.totals.subtotalCents)} before tax`} />
        <Figure label="Sales tax paid" value={fig(TAX_TYPES.reduce((a, t) => a + s.totals.taxes[t], 0))} hint={taxTypes.map((t) => `${t === 'other' ? 'Other' : t} ${fig(s.totals.taxes[t])}`).join(' · ') || 'none'} />
        <Figure label="Recoverable (estimate)" value={fig(s.recoverable.totalCents)} hint={rules.length ? 'from your tax settings' : 'set your tax rules'} tone="green" />
        <Figure label="Exported" value={`${s.totals.exportedCount} of ${s.totals.count}`} hint="to QuickBooks" />
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

      <SectionTitle title="By month" count={s.byMonth.length} />
      <SpendTable rows={s.byMonth} taxTypes={taxTypes} fig={fig} firstLabel="Month" totals={s.totals} showExported />

      <SectionTitle title="By budget code" count={s.byCode.length} />
      <SpendTable rows={s.byCode} taxTypes={taxTypes} fig={fig} firstLabel="Budget code" totals={s.totals} />

      <p className="mt-4 text-[12px] text-ink-soft">
        Recoverable tax is estimated from your tax settings, HST part by part, rounded to the cent on each receipt and then added up, so every total is the sum of the rows above it. It is an estimate, not tax advice.
      </p>
    </div>
  );
}

function SpendTable({ rows, taxTypes, fig, firstLabel, totals, showExported }: {
  rows: SpendRow[]; taxTypes: TaxType[]; fig: (c: number) => string; firstLabel: string; totals: SpendRow; showExported?: boolean;
}) {
  const th = 'px-3 py-2 text-right font-bold';
  const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-white">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-border bg-paper-raised text-[10.5px] uppercase tracking-wider text-ink-soft">
            <th className="px-3 py-2 text-left font-bold">{firstLabel}</th>
            <th className={th}>Receipts</th>
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
              <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.label}</td>
              <td className={td}>{r.count}</td>
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

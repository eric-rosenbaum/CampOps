import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { StatCard } from '@/components/shared/StatCard';
import { FilterPill } from '@/components/shared/FilterPill';
import { ColumnChart, type ColumnDatum } from '@/components/shared/ColumnChart';
import { useCommissaryStore } from '@/store/commissaryStore';
import {
  formatCurrency, formatInStockUnit, WASTE_CATEGORY_SHORT, WASTE_CATEGORY_LABELS,
} from '@/lib/commissaryUnits';
import { buildWasteSummary } from '@/lib/wasteMetrics';
import { formatDate } from '@/lib/utils';

// Fixed, and not to be re-picked per chart. Validated against the white card surface for
// colour-vision deficiency (ΔE 25.9 protan, 31.8 normal), which most default categorical
// palettes fail. The legend carries the meaning, so reusing this pair in other modules is
// fine — inventing a third colour is what breaks the system.
const C_REDUCIBLE = '#c47d08';
const C_OTHER = '#185fa5';

const PERIODS: { label: string; months: number | null }[] = [
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '12 months', months: 12 },
  { label: 'All time', months: null },
];

/** Compact dollars for the y-axis, where "$1,200" in every tick is noise. */
function axisMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

export function WasteTab() {
  const items = useCommissaryStore((s) => s.items);
  const adjustments = useCommissaryStore((s) => s.adjustments);
  const [months, setMonths] = useState<number | null>(6);

  // Keyed on the raw slices, never on a store getter — see the zustand selector gotcha.
  const summary = useMemo(
    () => buildWasteSummary(adjustments, items, months),
    [adjustments, items, months],
  );

  const wasteEver = useMemo(() => adjustments.some((a) => a.reason === 'waste'), [adjustments]);

  const columns: ColumnDatum[] = summary.months.map((m) => ({
    key: m.key,
    label: m.label,
    segments: [m.reducible, m.other],
  }));

  if (!wasteEver) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto py-16">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <Trash2 className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No waste logged yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed">
            Log waste from any item on the Inventory tab — adjust stock, choose
            “Waste / spoilage”, and say what happened. Once there are a few weeks of
            entries this tab shows what it cost you, and how much of it better ordering
            could have prevented.
          </p>
        </div>
      </div>
    );
  }

  const pct = summary.reduciblePct;
  const topItems = summary.byItem.slice(0, 10);

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="flex items-center gap-2 mb-5">
        {PERIODS.map((p) => (
          <FilterPill
            key={p.label}
            label={p.label}
            active={months === p.months}
            onClick={() => setMonths(p.months)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Waste logged"
          value={formatCurrency(summary.totalValue)}
          hint={`${summary.totalEvents} entr${summary.totalEvents === 1 ? 'y' : 'ies'}`}
        />
        <StatCard
          label="Preventable"
          value={formatCurrency(summary.reducibleValue)}
          variant="amber"
          hint={pct == null ? 'no priced waste yet' : `${Math.round(pct * 100)}% of logged waste`}
        />
        <StatCard
          label="Not preventable by ordering"
          value={formatCurrency(summary.nonReducibleValue)}
          hint="trim loss and plate waste"
        />
        <StatCard
          label="Uncategorised"
          value={summary.uncategorisedEvents}
          variant={summary.uncategorisedEvents > 0 ? 'amber' : 'default'}
          hint={summary.uncategorisedEvents > 0 ? 'not counted either way' : 'every entry categorised'}
        />
      </div>

      <div className="bg-white rounded-card border border-border px-5 py-5 mb-6">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-forest">Waste by month</h3>
          <span className="text-[11px] text-forest/45">value of what was thrown out</span>
        </div>
        <ColumnChart
          data={columns}
          series={[
            { label: 'Preventable (spoilage, overproduction, damage)', color: C_REDUCIBLE },
            { label: 'Trim loss, plate waste, other', color: C_OTHER },
          ]}
          formatValue={axisMoney}
          height={190}
          emptyMessage="No priced waste in this period"
        />
      </div>

      {/* Coverage caveats. These travel with the dollar figures rather than sitting in a
          footnote, because a total that silently excludes rows reads as complete. */}
      {(summary.unpricedEvents > 0 || summary.uncategorisedEvents > 0) && (
        <div className="rounded-card border border-amber/30 bg-amber-bg px-5 py-4 mb-6">
          <p className="text-[12px] font-semibold text-amber-text mb-1.5">What these totals do not cover</p>
          <ul className="text-[12px] text-amber-text/90 leading-relaxed space-y-1">
            {summary.unpricedEvents > 0 && (
              <li>
                · {summary.unpricedEvents} entr{summary.unpricedEvents === 1 ? 'y is' : 'ies are'} excluded
                from every dollar figure because {summary.unpricedItemNames.length === 1 ? 'this item has' : 'these items have'} no
                unit price set: {summary.unpricedItemNames.slice(0, 6).join(', ')}
                {summary.unpricedItemNames.length > 6 ? `, and ${summary.unpricedItemNames.length - 6} more` : ''}.
                The quantities are real; the dollars are unknown until a price is set.
              </li>
            )}
            {summary.uncategorisedEvents > 0 && (
              <li>
                · {summary.uncategorisedEvents} entr{summary.uncategorisedEvents === 1 ? 'y was' : 'ies were'} logged
                without a category{summary.uncategorisedValue > 0 ? ` (${formatCurrency(summary.uncategorisedValue)})` : ''}.
                They count in the total but not as preventable — assuming a category would
                be inventing the answer.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-card border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="text-[14px] font-semibold text-forest">By cause</h3>
          </div>
          <table className="w-full">
            <tbody>
              {summary.byCategory.map((c) => (
                <tr key={c.category ?? '__none'} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-[2px] flex-shrink-0"
                        style={{ backgroundColor: c.reducible ? C_REDUCIBLE : C_OTHER }}
                      />
                      <span className="text-[13px] text-forest">
                        {c.category ? WASTE_CATEGORY_SHORT[c.category] : 'Uncategorised'}
                      </span>
                    </span>
                    {c.category && (
                      <p className="text-[11px] text-forest/40 pl-[18px]">{WASTE_CATEGORY_LABELS[c.category]}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[11px] text-forest/45 whitespace-nowrap">
                    {c.events} entr{c.events === 1 ? 'y' : 'ies'}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-[13px] text-forest whitespace-nowrap">
                    {formatCurrency(c.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-card border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-baseline justify-between">
            <h3 className="text-[14px] font-semibold text-forest">Costliest items</h3>
            {summary.byItem.length > topItems.length && (
              <span className="text-[11px] text-forest/45">
                top {topItems.length} of {summary.byItem.length}
              </span>
            )}
          </div>
          <table className="w-full">
            <tbody>
              {topItems.map((it) => (
                <tr key={it.itemId} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5 text-[13px] text-forest">{it.itemName}</td>
                  <td className="px-3 py-2.5 text-right text-[11px] text-forest/45 whitespace-nowrap">
                    {it.reducibleValue > 0 ? `${formatCurrency(it.reducibleValue)} preventable` : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-[13px] text-forest whitespace-nowrap">
                    {formatCurrency(it.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-card border border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="text-[14px] font-semibold text-forest">Waste log</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-cream-dark/30">
              <th className="px-5 py-2 text-left text-[11px] uppercase tracking-wide font-semibold text-forest/45">Date</th>
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide font-semibold text-forest/45">Item</th>
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide font-semibold text-forest/45">Cause</th>
              <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wide font-semibold text-forest/45">Quantity</th>
              <th className="px-5 py-2 text-right text-[11px] uppercase tracking-wide font-semibold text-forest/45">Value</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.slice(0, 100).map((r) => {
              const item = items.find((i) => i.id === r.itemId);
              return (
                <tr key={r.adjustmentId} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5 text-[12px] text-forest/60 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-3 py-2.5 text-[13px] text-forest">{r.itemName}</td>
                  <td className="px-3 py-2.5 text-[12px]">
                    <span className={r.reducible ? 'text-amber-text' : 'text-forest/55'}>
                      {r.category ? WASTE_CATEGORY_SHORT[r.category] : 'Uncategorised'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[12px] text-forest/70 whitespace-nowrap">
                    {item ? formatInStockUnit(item, r.qtyBase) : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-[13px] whitespace-nowrap">
                    {r.value == null
                      ? <span className="text-forest/35" title="No unit price set for this item">no price</span>
                      : <span className="text-forest">{formatCurrency(r.value)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {summary.rows.length > 100 && (
          <div className="px-5 py-2.5 border-t border-border text-[11px] text-forest/45">
            Showing the 100 most recent of {summary.rows.length} entries in this period.
          </div>
        )}
        {summary.rows.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-forest/45">
            No waste logged in this period.
          </div>
        )}
      </div>
    </div>
  );
}

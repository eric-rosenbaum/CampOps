// The rentals year, in one document.
//
// Camps in the group-rental business run on occupancy and they compute it in a spreadsheet,
// badly — usually as "how many weekends were booked", which flatters a season of small groups in
// big buildings. Bed-nights sold against bed-nights available is the real number, and it is the
// headline here because it is the one figure a board actually asks about.
//
// Everything is computed in Postgres by `rentals_review` and rendered as it arrives. Nothing on
// this screen is recalculated in the browser, so the frozen snapshot and the live view can never
// disagree about what a season was.
import { useEffect, useMemo, useState } from 'react';
import { Printer, Snowflake, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { ColumnChart, type ColumnDatum } from '@/components/shared/ColumnChart';
import { fetchRentalsReview, dbSnapshotReview } from '@/lib/campgroundDb';
import type { RentalsReview as RentalsReviewData } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { money, stars, inputClass, labelClass } from './retreatUi';

const FOREST = '#1D3A2E';

/** "2026-08" → "Aug". Pure string work: a YYYY-MM never needs a timezone to name its month. */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function pct(n: number, d: number): number | null {
  if (!d) return null;
  return Math.round((n / d) * 100);
}

interface Props {
  /** Initial range. Defaults to the current calendar year. */
  from?: string;
  to?: string;
}

export function RentalsReview({ from: initialFrom, to: initialTo }: Props) {
  const { can } = useAuth();
  const canFreeze = can('manageRetreats');

  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(initialFrom ?? `${thisYear}-01-01`);
  const [to, setTo] = useState(initialTo ?? `${thisYear}-12-31`);
  const [data, setData] = useState<RentalsReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [freezing, setFreezing] = useState(false);
  const [frozen, setFrozen] = useState(false);

  // The fetch runs in an async continuation with a liveness guard rather than as a synchronous
  // effect body: changing the range twice quickly must not let the slower answer overwrite the
  // faster one, and setState inside the effect body itself would cascade renders.
  useEffect(() => {
    let live = true;
    (async () => {
      const d = await fetchRentalsReview(from, to);
      if (!live) return;
      setData(d);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [from, to]);

  async function reload() {
    setLoading(true);
    const d = await fetchRentalsReview(from, to);
    setData(d);
    setLoading(false);
  }

  const monthColumns = useMemo<ColumnDatum[]>(
    () => (data?.occupancy.by_month ?? []).map((m) => ({
      key: m.month, label: monthLabel(m.month), segments: [m.bed_nights],
    })),
    [data],
  );

  const sources = useMemo(() => {
    const entries = Object.entries(data?.where_groups_come_from.by_source ?? {});
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return { entries: entries.sort((a, b) => b[1] - a[1]), total };
  }, [data]);

  const lostReasons = useMemo(
    () => Object.entries(data?.pipeline.lost_reasons ?? {}).sort((a, b) => b[1] - a[1]),
    [data],
  );

  async function freeze() {
    setFreezing(true);
    const ok = await dbSnapshotReview('rentals', from, to);
    setFreezing(false);
    setFrozen(ok);
  }

  const occ = data?.occupancy;
  const occPct = occ ? pct(occ.bed_nights_sold, occ.bed_nights_available) : null;
  const returningPct = data
    ? pct(data.where_groups_come_from.returning, data.where_groups_come_from.total)
    : null;
  const conversionPct = data
    ? pct(data.pipeline.won, data.pipeline.won + data.pipeline.lost)
    : null;

  return (
    <div id="rentals-review" className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* Print CSS lives with the thing it prints. The app shell around this component is not
          mine to restyle, so the review lifts itself out of the page rather than asking every
          other screen to know about printing. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #rentals-review, #rentals-review * { visibility: visible; }
          #rentals-review { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          #rentals-review .no-print { display: none !important; }
          #rentals-review .print-break { break-inside: avoid; }
        }
      `}</style>

      {/* Controls ----------------------------------------------------------- */}
      <div className="no-print flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-page-title font-bold text-forest">Rentals review</h2>
          <p className="text-[12.5px] text-ink-soft">
            The season the way a board asks about it: occupancy, money, and what it cost to host.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelClass}>From</label>
            <input type="date" value={from} onChange={(e) => { setLoading(true); setFrom(e.target.value); }} className={`${inputClass} w-auto`} />
          </div>
          <div>
            <label className={labelClass}>To</label>
            <input type="date" value={to} onChange={(e) => { setLoading(true); setTo(e.target.value); }} className={`${inputClass} w-auto`} />
          </div>
          <Button variant="ghost" onClick={() => void reload()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print
          </Button>
          {canFreeze && (
            <Button onClick={freeze} disabled={freezing || loading}>
              {freezing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Freezing…</>
                : <><Snowflake className="w-4 h-4" /> Freeze</>}
            </Button>
          )}
        </div>
      </div>

      {frozen && (
        <p className="no-print text-[12.5px] text-green-muted-text bg-green-muted-bg border border-sage/30 rounded-card px-3.5 py-2.5 mb-5">
          Frozen. This range is stored as it stands.
        </p>
      )}

      {loading && !data && (
        <p className="flex items-center gap-2 text-[13px] text-ink-soft py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Working out the season…
        </p>
      )}

      {!loading && !data && (
        <p className="text-[13px] text-ink-soft py-10 text-center">
          The review could not be loaded for this range.
        </p>
      )}

      {data && occ && (
        <div className="space-y-8">
          {/* ── Occupancy ───────────────────────────────────────────────────── */}
          <section className="print-break">
            <h3 className="font-display text-[16px] font-bold text-forest mb-1">Occupancy</h3>
            <p className="text-[12px] text-ink-soft mb-3">
              Bed-nights sold against bed-nights available.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
              <StatCard
                label="Occupancy"
                value={occPct == null ? '—' : `${occPct}%`}
                variant={occPct != null && occPct >= 50 ? 'green' : 'default'}
                hint={`${occ.bed_nights_sold.toLocaleString()} of ${occ.bed_nights_available.toLocaleString()} bed-nights`}
              />
              <StatCard
                label="Beds available"
                value={occ.beds_available.toLocaleString()}
                hint={`across ${occ.nights.toLocaleString()} nights in range`}
              />
              <StatCard
                label="Bed-nights sold"
                value={occ.bed_nights_sold.toLocaleString()}
                hint="confirmed groups only"
              />
              {/* Out-of-service beds are called out rather than folded in: a camp that looks 60%
                  full because a quarter of its beds are broken has a maintenance problem, not a
                  sales one, and the two need different meetings. */}
              <StatCard
                label="Beds out of service"
                value={occ.out_of_service_beds.toLocaleString()}
                variant={occ.out_of_service_beds > 0 ? 'amber' : 'default'}
                hint={occ.out_of_service_beds > 0
                  ? 'not sellable — a maintenance number, not a sales one'
                  : 'every bed sellable'}
              />
            </div>

            <div className="bg-white border border-border rounded-card p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft mb-3">
                Bed-nights by month
              </p>
              <ColumnChart
                data={monthColumns}
                series={[{ label: 'Bed-nights sold', color: FOREST }]}
                formatValue={(n) => Math.round(n).toLocaleString()}
                height={160}
                emptyMessage="No bed-nights sold in this range"
              />
            </div>
          </section>

          {/* ── Revenue ─────────────────────────────────────────────────────── */}
          <section className="print-break">
            <h3 className="font-display text-[16px] font-bold text-forest mb-3">Revenue</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-4">
              <StatCard label="Invoiced" value={money(data.revenue.invoiced)} />
              <StatCard label="Collected" value={money(data.revenue.collected)} variant="green" />
              <StatCard
                label="Outstanding"
                value={money(data.revenue.outstanding)}
                variant={data.revenue.outstanding > 0 ? 'amber' : 'default'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-border rounded-card">
                <p className="px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft border-b border-border">
                  Add-ons, by revenue
                </p>
                {data.revenue.addons.length === 0 ? (
                  <p className="px-4 py-5 text-[12.5px] text-ink-faint text-center">
                    No add-ons sold in this range.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.revenue.addons.map((a) => (
                      <li key={a.name} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                        <span className="text-[13px] text-ink min-w-0">{a.name}</span>
                        <span className="text-right flex-shrink-0">
                          <span className="block text-[13px] font-semibold text-forest tabular-nums">
                            {money(a.revenue)}
                          </span>
                          <span className="block text-[11px] text-ink-soft">sold {a.times_sold}×</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white border border-border rounded-card">
                <p className="px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft border-b border-border">
                  By group
                </p>
                {data.revenue.by_group.length === 0 ? (
                  <p className="px-4 py-5 text-[12.5px] text-ink-faint text-center">No groups in this range.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.revenue.by_group.map((g, i) => (
                      <li key={`${g.group}-${i}`} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                        <span className="text-[13px] text-ink min-w-0 truncate">{g.group}</span>
                        <span className="text-right flex-shrink-0">
                          <span className="block text-[13px] font-semibold text-forest tabular-nums">
                            {money(g.invoiced)}
                          </span>
                          <span className="block text-[11px] text-ink-soft">{g.people} people</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* ── Pipeline ────────────────────────────────────────────────────── */}
          <section className="print-break">
            <h3 className="font-display text-[16px] font-bold text-forest mb-3">Pipeline</h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-4">
              <StatCard label="Enquiries" value={data.pipeline.inquiries} />
              <StatCard label="Proposals sent" value={data.pipeline.proposals_sent} />
              <StatCard label="Booked" value={data.pipeline.won} variant="green" />
              <StatCard label="Lost" value={data.pipeline.lost} variant={data.pipeline.lost ? 'amber' : 'default'} />
              <StatCard
                label="Conversion"
                value={conversionPct == null ? '—' : `${conversionPct}%`}
                hint={data.pipeline.median_days_to_win != null
                  ? `${data.pipeline.median_days_to_win} days to win, typically`
                  : 'nothing won yet'}
              />
            </div>

            <div className="bg-white border border-border rounded-card">
              <p className="px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft border-b border-border">
                Why bookings were lost
              </p>
              {lostReasons.length === 0 ? (
                <p className="px-4 py-5 text-[12.5px] text-ink-faint text-center">Nothing lost in this range.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {lostReasons.map(([reason, n]) => (
                    <li key={reason} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-ink">{reason}</span>
                      <span className="text-[13px] font-semibold text-forest tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ── Where groups come from ──────────────────────────────────────── */}
          <section className="print-break">
            <h3 className="font-display text-[16px] font-bold text-forest mb-1">Where groups come from</h3>
            <p className="text-[12px] text-ink-soft mb-3">
              The returning-group percentage is the health of a rental business in one number: a
              camp that has to win every group again each year is running a sales operation, not a
              venue.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 content-start">
                <StatCard
                  label="Returning groups"
                  value={returningPct == null ? '—' : `${returningPct}%`}
                  variant={returningPct != null && returningPct >= 50 ? 'green' : 'default'}
                  hint={`${data.where_groups_come_from.returning} of ${data.where_groups_come_from.total} had stayed before`}
                />
                <StatCard
                  label="Groups in range"
                  value={data.where_groups_come_from.total}
                  hint="arriving between the dates above"
                />
              </div>

              <div className="bg-white border border-border rounded-card">
                <p className="px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft border-b border-border">
                  Lead source
                </p>
                {sources.entries.length === 0 ? (
                  <p className="px-4 py-5 text-[12.5px] text-ink-faint text-center">Nothing recorded.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {sources.entries.map(([src, n]) => (
                      <li key={src} className="px-4 py-2.5">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <span className="text-[13px] text-ink min-w-0 truncate">{src}</span>
                          <span className="text-[13px] font-semibold text-forest tabular-nums flex-shrink-0">
                            {n}{sources.total ? ` · ${Math.round((n / sources.total) * 100)}%` : ''}
                          </span>
                        </div>
                        <div className="h-1.5 bg-cream-dark rounded-pill overflow-hidden">
                          <div
                            className="h-full bg-sage rounded-pill"
                            style={{ width: `${sources.total ? (n / sources.total) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* ── Cost to host ────────────────────────────────────────────────── */}
          <section className="print-break">
            <h3 className="font-display text-[16px] font-bold text-forest mb-3">Cost to host</h3>

            <div className="bg-white border border-border rounded-card overflow-x-auto">
              {data.cost_to_host.length === 0 ? (
                <p className="px-4 py-5 text-[12.5px] text-ink-faint text-center">No groups in this range.</p>
              ) : (
                <table className="w-full min-w-[560px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-bold uppercase tracking-[0.1em] text-[9.5px] text-ink-soft px-4 py-2.5">Group</th>
                      <th className="text-right font-bold uppercase tracking-[0.1em] text-[9.5px] text-ink-soft px-3 py-2.5">Budgeted</th>
                      <th className="text-right font-bold uppercase tracking-[0.1em] text-[9.5px] text-ink-soft px-3 py-2.5">Actual</th>
                      <th className="text-right font-bold uppercase tracking-[0.1em] text-[9.5px] text-ink-soft px-3 py-2.5">Work orders</th>
                      <th className="text-right font-bold uppercase tracking-[0.1em] text-[9.5px] text-ink-soft px-3 py-2.5">Labour</th>
                      <th className="text-right font-bold uppercase tracking-[0.1em] text-[9.5px] text-ink-soft px-4 py-2.5">Work cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.cost_to_host.map((c, i) => (
                      <tr key={`${c.group}-${i}`}>
                        <td className="px-4 py-2.5 text-ink">{c.group}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">{money(c.budgeted)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                          c.actual > c.budgeted && c.budgeted > 0 ? 'text-red' : 'text-forest'
                        }`}>{money(c.actual)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink">{c.work_orders}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                          {c.work_minutes ? `${Math.round(c.work_minutes / 60)}h` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink">{money(c.work_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-[12px] text-ink-soft mt-2">
              These last three columns exist only because the maintenance board and the rental book
              are one system: the work orders a group's stay generated are counted against that
              group. Nobody else can tell a camp what a rental group actually cost to host.
            </p>
          </section>

          {/* ── Feedback ────────────────────────────────────────────────────── */}
          <section className="print-break">
            <h3 className="font-display text-[16px] font-bold text-forest mb-3">Feedback</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
              <StatCard
                label="Average score"
                value={data.feedback.average_overall != null
                  ? `${data.feedback.average_overall.toFixed(1)} ${stars(data.feedback.average_overall)}`
                  : '—'}
                hint={data.feedback.responses ? `${data.feedback.responses} responses` : 'no responses yet'}
              />
              <StatCard
                label="Would not return"
                value={data.feedback.would_not_return.length}
                variant={data.feedback.would_not_return.length ? 'red' : 'green'}
                hint={data.feedback.would_not_return.length
                  ? 'the only feedback worth reading twice'
                  : 'nobody said they would not come back'}
              />
            </div>

            {data.feedback.would_not_return.length > 0 && (
              <div className="bg-red-bg border border-red/25 rounded-card">
                <p className="px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-red border-b border-red/20">
                  Groups who said they would not come back
                </p>
                <ul className="divide-y divide-red/15">
                  {data.feedback.would_not_return.map((f, i) => (
                    <li key={`${f.group}-${i}`} className="px-4 py-3">
                      <p className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-forest">{f.group}</span>
                        {f.overall != null && (
                          <span className="text-[12px] text-red tabular-nums">{f.overall.toFixed(1)}</span>
                        )}
                      </p>
                      {f.comment && (
                        <p className="text-[12.5px] text-ink mt-1 leading-snug">“{f.comment}”</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <p className="text-[11px] text-ink-faint pt-4 border-t border-border">
            {data.from} to {data.to} · computed live. Freeze the range when the season closes so it
            cannot change afterwards.
          </p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Printer, Lock, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { ColumnChart, type ColumnDatum } from '@/components/shared/ColumnChart';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';
import { fetchSeasonReview, dbSnapshotReview } from '@/lib/campgroundDb';
import { SOURCE_LABELS, STATUS_LABELS } from '@/lib/workOrder';
import { formatCost, formatDate, parseDateStr, todayStr } from '@/lib/utils';
import { TRADE_LABELS } from '@/lib/types';
import type { IssueSource, IssueStatus, SeasonReview as SeasonReviewData, Trade } from '@/lib/types';

/**
 * The renewal artifact.
 *
 * Everything here is computed in Postgres by `season_review` and rendered as-is. The design
 * rules that matter are honesty rules, not layout ones:
 *
 *  · Response times are MEDIANS and say so on the page. One work order somebody forgot about for
 *    four months destroys a mean, and a camp that spots the lie once stops reading the report.
 *  · Small samples are labelled as small samples rather than dressed up as a confident number.
 *  · The per-person block is headed "Workload", never "Performance", and never ranked. Counts
 *    alone would put a summer hire above a career carpenter for closing easy tickets fast.
 *  · Freezing exists because a back-dated closure in November must not silently rewrite the
 *    numbers a board already saw in September.
 */

const inputClass =
  'text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';

// Palette tokens, as hex, because ColumnChart paints SVG fills. Amber for work coming in,
// pine for work going out — one scale, two clearly separable greens/golds.
const REPORTED_COLOR = '#D08C1B';
const CLOSED_COLOR = '#2C5342';

/** Below this many work orders, a median is a direction rather than a measurement. */
const SMALL_SAMPLE = 5;

function hoursLabel(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return 'under an hour';
  if (h < 48) return `${Math.round(h)} hr`;
  return `${(h / 24).toFixed(1)} days`;
}

function weekLabel(week: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(week) ? format(parseDateStr(week), 'MMM d') : week;
}

interface Period { from: string; to: string; scope: string }

function defaultRange(season: { openingDate: string; closingDate: string } | null) {
  if (season) return { from: season.openingDate, to: season.closingDate };
  const today = todayStr();
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export function SeasonReview() {
  const season = useChecklistStore((s) => s.season);
  const sessions = useCampgroundStore((s) => s.sessions);
  const { role } = useAuth();

  const [override, setOverride] = useState<Period | null>(null);
  const [reload, setReload] = useState(0);

  // The season arrives from the same bootstrap as everything else, so it is null for the first
  // render on a cold load. Derived during render rather than copied into state by an effect:
  // syncing it would be a cascading render, and it would also fight anybody who had already
  // picked a period. Once they pick one, `override` wins and the season stops mattering.
  const period: Period = override ?? { ...defaultRange(season), scope: season ? 'season' : 'custom' };
  const { from, to, scope } = period;
  const key = `${from}|${to}|${reload}`;

  // The fetch result carries the period it answers, so "loading" is derived rather than a flag
  // an effect has to set — which also means a slow response for last week's dates can never
  // paint over this week's.
  const [result, setResult] = useState<{ key: string; data: SeasonReviewData | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchSeasonReview(from, to).then((d) => { if (!cancelled) setResult({ key, data: d }); });
    return () => { cancelled = true; };
  }, [from, to, key]);

  const loading = result?.key !== key;
  const data = result?.key === key ? result.data : null;
  const failed = !loading && data == null;

  // Freeze state is keyed to the period it was for, so changing the dates resets the whole
  // affordance without an effect reaching in to clear it.
  const [frozenKey, setFrozenKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [freezeFailedKey, setFreezeFailedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isFrozen = frozenKey === key;
  const isConfirming = confirmKey === key;
  const freezeFailed = freezeFailedKey === key;

  function applyScope(value: string) {
    if (value === 'season' && season) {
      setOverride({ scope: value, from: season.openingDate, to: season.closingDate });
      return;
    }
    const s = sessions.find((x) => x.id === value);
    if (s) { setOverride({ scope: value, from: s.startDate, to: s.endDate }); return; }
    setOverride({ ...period, scope: 'custom' });
  }

  async function doFreeze() {
    setSaving(true);
    const ok = await dbSnapshotReview('season', from, to);
    setSaving(false);
    if (ok) { setFrozenKey(key); setConfirmKey(null); } else setFreezeFailedKey(key);
  }

  const weekly = useMemo<ColumnDatum[]>(() => {
    const weeks = data?.volume.by_week ?? [];
    // A grouped pair per week — reported beside closed — rather than a stack. Stacking them
    // would add a work order to its own bar twice in any week it was both raised and closed.
    const stride = weeks.length > 16 ? 2 : 1;
    const out: ColumnDatum[] = [];
    weeks.forEach((w, i) => {
      out.push({ key: `${w.week}-r`, label: i % stride === 0 ? weekLabel(w.week) : '', segments: [w.reported, 0] });
      out.push({ key: `${w.week}-c`, label: '', segments: [0, w.closed] });
    });
    return out;
  }, [data]);

  const totalSample = data?.volume.reported ?? 0;

  if (loading) {
    return (
      <p className="text-[13px] text-ink-faint italic py-10 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
        Adding up the season…
      </p>
    );
  }

  if (failed || !data) {
    return (
      <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
        <p className="font-display text-[16px] font-bold text-forest">The review could not be built</p>
        <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
          That did not come back. Try again.
        </p>
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => setReload((n) => n + 1)}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Print rules live with the thing they print. `window.print()` on the app otherwise
          produces the sidebar, the tab bar and a cropped heading. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #season-review, #season-review * { visibility: visible !important; }
          #season-review { position: absolute; left: 0; top: 0; width: 100%; }
          .cc-no-print { display: none !important; }
          .cc-keep-together { break-inside: avoid; page-break-inside: avoid; }
          @page { margin: 1.4cm; }
        }
      `}</style>

      {/* ── Period picker ───────────────────────────────────────────────────── */}
      <div className="cc-no-print flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="review-scope">
            Period
          </label>
          <select
            id="review-scope" className={inputClass} value={scope}
            onChange={(e) => applyScope(e.target.value)}
          >
            {season && <option value="season">{season.name} (whole season)</option>}
            {sessions.length > 0 && (
              <optgroup label="One session">
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            )}
            <option value="custom">Custom dates</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="review-from">
            From
          </label>
          <input
            id="review-from" type="date" className={inputClass} value={from}
            onChange={(e) => setOverride({ ...period, scope: 'custom', from: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="review-to">
            To
          </label>
          <input
            id="review-to" type="date" className={inputClass} value={to}
            onChange={(e) => setOverride({ ...period, scope: 'custom', to: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Print
          </Button>
          {role === 'admin' && (
            isFrozen ? (
              <span className="text-[12.5px] text-green-muted-text font-semibold">Frozen</span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmKey(isConfirming ? null : key)}>
                <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Freeze this review
              </Button>
            )
          )}
        </div>
      </div>

      {isConfirming && (
        <div className="cc-no-print rounded-card border border-border bg-cream px-5 py-4 mb-6">
          <p className="text-[13px] text-ink leading-relaxed">
            Freezing stores these numbers as they stand today.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button onClick={doFreeze} disabled={saving}>
              {saving ? 'Freezing…' : `Freeze ${formatDate(from)} – ${formatDate(to)}`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmKey(null)}>Not now</Button>
          </div>
        </div>
      )}
      {freezeFailed && (
        <p className="cc-no-print text-[12.5px] text-red-text mb-6">
          The snapshot did not save. Nothing was changed — try again.
        </p>
      )}

      <div id="season-review">
        <header className="mb-6">
          <h1 className="font-display text-[24px] font-bold text-forest leading-tight">
            Season review
          </h1>
          <p className="text-[12.5px] text-ink-soft mt-1">
            {formatDate(from)} – {formatDate(to)}
          </p>
        </header>

        {totalSample === 0 ? (
          <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
            <p className="font-display text-[16px] font-bold text-forest">
              No work orders in this period
            </p>
            <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
              Nothing was reported between {formatDate(from)} and {formatDate(to)}. Widen the dates,
              or check whether the season's opening and closing dates are right.
            </p>
          </div>
        ) : (
          <>
            {totalSample < 20 && (
              <p className="cc-keep-together flex items-start gap-2 rounded-card border border-border bg-cream px-4 py-3 mb-6 text-[12px] text-ink-soft leading-relaxed">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-sage" aria-hidden="true" />
                <span>
                  This period holds {totalSample} work order{totalSample === 1 ? '' : 's'}. That is
                  a small sample — the medians below move a lot on one or two tickets, so read them
                  as direction rather than measurement.
                </span>
              </p>
            )}

            <VolumeSection data={data} weekly={weekly} />
            <TimingSection data={data} />
            <LocationsSection data={data} />
            <AssetsSection data={data} />
            {role === 'admin' && <WorkloadSection data={data} />}
            <VendorsSection data={data} />
            <SourcesSection data={data} />
            <RoutinesSection data={data} />
            <CarryOverSection data={data} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Section chrome ───────────────────────────────────────────────────────────

function Section({ title, lede, children }: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cc-keep-together mb-9">
      <h2 className="font-display text-[17px] font-bold text-forest border-b border-border pb-2 mb-3">
        {title}
      </h2>
      {lede && <p className="text-[12.5px] text-ink-soft leading-relaxed mb-3 max-w-3xl">{lede}</p>}
      {children}
    </section>
  );
}

/** A wide block that must scroll inside itself — the page body never scrolls sideways. */
function Scroller({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

const th = 'text-left text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft pb-2 pr-4 whitespace-nowrap';
const td = 'text-[12.5px] text-ink py-2 pr-4 border-t border-border align-top';

// ─── 1 · Volume & flow ────────────────────────────────────────────────────────

function VolumeSection({ data, weekly }: { data: SeasonReviewData; weekly: ColumnDatum[] }) {
  const trades = Object.entries(data.volume.by_trade)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxTrade = Math.max(1, ...trades.map(([, n]) => n));

  return (
    <Section
      title="Volume and flow"
    >
      <div className="flex flex-wrap border-b border-border mb-4">
        <StatCard label="Reported" value={data.volume.reported} />
        <StatCard label="Closed" value={data.volume.closed} variant="green" />
        <StatCard
          label="Still open" value={data.volume.open}
          variant={data.volume.open > 0 ? 'amber' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-2">
            By week
          </p>
          <ColumnChart
            data={weekly}
            series={[
              { label: 'Reported', color: REPORTED_COLOR },
              { label: 'Closed', color: CLOSED_COLOR },
            ]}
            formatValue={(n) => String(Math.round(n))}
            height={170}
            emptyMessage="No weekly detail for this period"
          />
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-2">
            By trade
          </p>
          <ul className="space-y-2">
            {trades.map(([trade, n]) => (
              <li key={trade}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] text-ink">
                    {TRADE_LABELS[trade as Trade] ?? trade}
                  </span>
                  <span className="text-[12.5px] font-semibold text-forest tabular-nums">{n}</span>
                </div>
                <div className="h-1.5 bg-cream-dark rounded-pill mt-1 overflow-hidden">
                  <div
                    className="h-full bg-forest rounded-pill"
                    style={{ width: `${(n / maxTrade) * 100}%` }}
                  />
                </div>
              </li>
            ))}
            {trades.length === 0 && <li className="text-[12px] text-ink-faint italic">Nothing recorded.</li>}
          </ul>
        </div>
      </div>
    </Section>
  );
}

// ─── 2 · Response times ───────────────────────────────────────────────────────

function TimingSection({ data }: { data: SeasonReviewData }) {
  const rows = [...data.timing].sort((a, b) => a.trade.localeCompare(b.trade));
  const thin = rows.every((r) => r.sample < SMALL_SAMPLE);

  return (
    <Section
      title="Response times — medians"
      lede="Medians."
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">Nothing closed in this period yet.</p>
      ) : (
        <>
          {thin && (
            <p className="text-[12px] text-amber-text bg-amber-bg border border-amber/30 rounded-card px-4 py-2.5 mb-3 leading-relaxed">
              Every row here rests on fewer than {SMALL_SAMPLE} work orders. Those are real numbers,
              but they are not yet a pattern.
            </p>
          )}
          <Scroller>
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Trade</th>
                  <th className={th}>Priority</th>
                  <th className={th}>Median to assign</th>
                  <th className={th}>Median to close</th>
                  <th className={th}>Based on</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.trade}-${r.priority}`}>
                    <td className={`${td} font-semibold text-forest`}>
                      {TRADE_LABELS[r.trade as Trade] ?? r.trade}
                    </td>
                    <td className={td}>{r.priority}</td>
                    <td className={`${td} tabular-nums`}>{hoursLabel(r.median_hours_to_assign)}</td>
                    <td className={`${td} tabular-nums`}>{hoursLabel(r.median_hours_to_close)}</td>
                    <td className={`${td} tabular-nums ${r.sample < SMALL_SAMPLE ? 'text-ink-faint' : 'text-ink-soft'}`}>
                      {r.sample} work order{r.sample === 1 ? '' : 's'}
                      {r.sample < SMALL_SAMPLE ? ' — small sample' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        </>
      )}
    </Section>
  );
}

// ─── 3 · Where the work is ────────────────────────────────────────────────────

function LocationsSection({ data }: { data: SeasonReviewData }) {
  const rows = data.locations.slice(0, 15);
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const maxDays = Math.max(1, ...rows.map((r) => r.open_days));

  return (
    <Section
      title="Where the work is"
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">No work was tied to a location.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.location} className="cc-keep-together">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <b className="text-[14px] font-semibold text-forest">{r.location}</b>
                <span className="text-[12px] text-ink-soft tabular-nums">
                  {r.count} work order{r.count === 1 ? '' : 's'}
                  {' · '}{Math.round(r.open_days)} open-day{Math.round(r.open_days) === 1 ? '' : 's'}
                  {r.cost > 0 ? ` · ${formatCost(r.cost)}` : ''}
                </span>
              </div>
              {/* Two bars on two scales, each labelled with the value it reaches: how OFTEN it
                  breaks, and how LONG it stays broken. They are different arguments. */}
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] uppercase tracking-[0.1em] text-ink-faint flex-shrink-0">
                    Count
                  </span>
                  <div className="flex-1 h-2.5 bg-cream-dark rounded-pill overflow-hidden">
                    <div className="h-full bg-forest rounded-pill" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] uppercase tracking-[0.1em] text-ink-faint flex-shrink-0">
                    Days open
                  </span>
                  <div className="flex-1 h-2.5 bg-cream-dark rounded-pill overflow-hidden">
                    <div className="h-full bg-sage rounded-pill" style={{ width: `${(r.open_days / maxDays) * 100}%` }} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.locations.length > rows.length && (
        <p className="text-[11.5px] text-ink-faint mt-3">
          Showing the top {rows.length} of {data.locations.length} locations.
        </p>
      )}
    </Section>
  );
}

// ─── 4 · What it cost, by thing ───────────────────────────────────────────────

function AssetsSection({ data }: { data: SeasonReviewData }) {
  return (
    <Section
      title="What it cost, by thing"
      lede={`${formatCost(data.money.recorded_cost)} recorded across ${data.money.with_cost} work order${data.money.with_cost === 1 ? '' : 's'}.`}
    >
      {data.assets.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">
          No work was tied to a specific asset.
        </p>
      ) : (
        <Scroller>
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Asset</th>
                <th className={th}>Work orders</th>
                <th className={th}>Days out of service</th>
                <th className={th}>Recorded cost</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.map((a) => (
                <tr key={a.asset}>
                  <td className={`${td} font-semibold text-forest`}>{a.asset}</td>
                  <td className={`${td} tabular-nums`}>{a.count}</td>
                  <td className={`${td} tabular-nums`}>{Math.round(a.days_out)}</td>
                  <td className={`${td} tabular-nums`}>{a.cost > 0 ? formatCost(a.cost) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      )}
    </Section>
  );
}

// ─── 5 · Workload (admin only) ────────────────────────────────────────────────

function WorkloadSection({ data }: { data: SeasonReviewData }) {
  return (
    <Section title="Workload">
      <p className="text-[12.5px] text-ink-soft leading-relaxed mb-3 max-w-3xl">
        A workload picture, not a ranking.
      </p>
      {data.workload.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">Nothing was assigned in this period.</p>
      ) : (
        <Scroller>
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Person</th>
                <th className={th}>Closed</th>
                <th className={th}>Still open</th>
                <th className={th}>Median to close</th>
                <th className={th}>Minutes logged</th>
              </tr>
            </thead>
            <tbody>
              {/* Alphabetical, deliberately. Sorting by closed count would make it a leaderboard
                  whatever the heading says. */}
              {[...data.workload].sort((a, b) => a.name.localeCompare(b.name)).map((w) => (
                <tr key={w.name}>
                  <td className={`${td} font-semibold text-forest`}>{w.name}</td>
                  <td className={`${td} tabular-nums`}>{w.closed}</td>
                  <td className={`${td} tabular-nums`}>{w.still_open}</td>
                  <td className={`${td} tabular-nums`}>{hoursLabel(w.median_hours_to_close)}</td>
                  <td className={`${td} tabular-nums`}>
                    {w.minutes_logged > 0 ? w.minutes_logged.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      )}
    </Section>
  );
}

// ─── Vendors ──────────────────────────────────────────────────────────────────

function VendorsSection({ data }: { data: SeasonReviewData }) {
  if (data.vendors.length === 0) return null;

  // How much of the cost column is actually filled in. A camp that priced two of eleven jobs
  // should be told that rather than shown a total that reads as complete.
  const priced = data.vendors.reduce((n, v) => n + v.with_cost, 0);
  const jobs = data.vendors.reduce((n, v) => n + v.jobs, 0);

  return (
    <Section
      title="Vendors"
      lede={priced < jobs ? `Cost recorded on ${priced} of ${jobs} jobs.` : undefined}
    >
      <Scroller>
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className={th}>Vendor</th>
              <th className={th}>Jobs</th>
              <th className={th}>Still open</th>
              <th className={th}>Median to close</th>
              <th className={th}>Recorded cost</th>
            </tr>
          </thead>
          <tbody>
            {data.vendors.map((v) => (
              <tr key={v.id}>
                <td className={`${td} font-semibold text-forest`}>
                  {v.name}
                  {v.trade && <span className="font-normal text-ink-soft"> · {v.trade}</span>}
                </td>
                <td className={`${td} tabular-nums`}>{v.jobs}</td>
                <td className={`${td} tabular-nums`}>{v.open || '—'}</td>
                <td className={`${td} tabular-nums`}>
                  {v.median_days != null ? `${v.median_days} d` : '—'}
                </td>
                <td className={`${td} tabular-nums`}>{v.cost > 0 ? formatCost(v.cost) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
    </Section>
  );
}

// ─── 6 · How work arrived ─────────────────────────────────────────────────────

function SourcesSection({ data }: { data: SeasonReviewData }) {
  const rows = Object.entries(data.sources)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);

  return (
    <Section
      title="How work arrived"
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">No source was recorded.</p>
      ) : (
        <ul className="space-y-2 max-w-2xl">
          {rows.map(([key, n]) => (
            <li key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] text-ink">
                  {SOURCE_LABELS[key as NonNullable<IssueSource>] ?? key}
                </span>
                <span className="text-[12.5px] text-ink-soft tabular-nums">
                  {n} · {Math.round((n / total) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-cream-dark rounded-pill mt-1 overflow-hidden">
                <div className="h-full bg-sage rounded-pill" style={{ width: `${(n / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── 7 · Routines ─────────────────────────────────────────────────────────────

function RoutinesSection({ data }: { data: SeasonReviewData }) {
  const r = data.routines;
  return (
    <Section
      title="Routines"
    >
      <div className="flex flex-wrap border-b border-border mb-3">
        <StatCard label="Active routines" value={r.active} />
        <StatCard label="Occurrences raised" value={r.generated} />
        <StatCard
          label="Behind" value={r.behind.length}
          variant={r.behind.length > 0 ? 'red' : 'green'}
        />
      </div>
      {r.behind.length === 0 ? (
        <p className="text-[12.5px] text-ink-soft">Nothing fell behind in this period.</p>
      ) : (
        <ul className="space-y-1">
          {r.behind.map((b) => (
            <li key={b.title} className="text-[12.5px] text-ink">
              <b className="font-semibold">{b.title}</b>
              <span className="text-red-text"> — {b.cycles} cycle{b.cycles === 1 ? '' : 's'} behind</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── 8 · Carry-over ───────────────────────────────────────────────────────────

function CarryOverSection({ data }: { data: SeasonReviewData }) {
  const rows = [...data.carry_over].sort((a, b) => b.age_days - a.age_days);

  return (
    <Section
      title="Carry-over"
      lede="Open work orders from this season. Oldest first."
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-soft">
          Nothing is carrying over.
        </p>
      ) : (
        <Scroller>
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Work order</th>
                <th className={th}>Trade</th>
                <th className={th}>Priority</th>
                <th className={th}>Location</th>
                <th className={th}>Status</th>
                <th className={th}>Open for</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} font-semibold text-forest`}>{c.title}</td>
                  <td className={td}>{TRADE_LABELS[c.trade as Trade] ?? c.trade}</td>
                  <td className={td}>{c.priority}</td>
                  <td className={td}>{c.location ?? '—'}</td>
                  <td className={td}>{STATUS_LABELS[c.status as IssueStatus] ?? c.status}</td>
                  <td className={`${td} tabular-nums ${c.age_days > 60 ? 'text-red-text font-semibold' : ''}`}>
                    {Math.round(c.age_days)} days
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      )}
    </Section>
  );
}

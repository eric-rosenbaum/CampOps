import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Printer, Lock, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { ColumnChart, type ColumnDatum } from '@/components/shared/ColumnChart';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';
import {
  fetchSeasonReview, dbSnapshotReview, dbListReviewSnapshots, dbGetReviewSnapshot,
  dbReleaseReviewSnapshot, type ReviewSnapshotRow,
} from '@/lib/campgroundDb';
import { SOURCE_LABELS, STATUS_LABELS } from '@/lib/workOrder';
import { formatCost, formatDate, parseDateStr, todayStr, toDateStr } from '@/lib/utils';
import { useTradeLabel } from '@/lib/useTrades';
import type { IssueSource, IssueStatus, Priority, SeasonReview as SeasonReviewData } from '@/lib/types';
import { TranslatedText } from '@/components/i18n/TranslatedText';
import i18n, { currentLang } from '@/i18n';

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

type AdminT = TFunction<'campgroundAdmin'>;

function hoursLabel(t: AdminT, h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return t('review.underHour');
  const nf = new Intl.NumberFormat(currentLang(), { maximumFractionDigits: 1, minimumFractionDigits: h < 48 ? 0 : 1 });
  if (h < 48) return t('review.hours', { value: nf.format(Math.round(h)) });
  return t('review.days', { value: nf.format(h / 24) });
}

function weekLabel(week: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(week)
    ? new Intl.DateTimeFormat(currentLang(), { month: 'short', day: 'numeric' }).format(parseDateStr(week))
    : week;
}

/** The server sends priority as its raw key; unknown values are shown as sent. */
function priorityLabel(p: string): string {
  return p === 'urgent' || p === 'high' || p === 'normal'
    ? i18n.t(`common:priority.${p as Priority}`)
    : p;
}

interface Period { from: string; to: string; scope: string }

function defaultRange(season: { openingDate: string; closingDate: string } | null) {
  if (season) return { from: season.openingDate, to: season.closingDate };
  const today = todayStr();
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export function SeasonReview() {
  const { t } = useTranslation(['campgroundAdmin', 'common']);
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

  /**
   * A saved snapshot being read instead of the live numbers. Selecting one replaces the whole
   * report; releasing it puts the live figures back. Frozen used to be component state, so it
   * was forgotten on reload and nothing could ever be unfrozen.
   */
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<ReviewSnapshotRow[]>([]);
  const viewing = snapshots.find((sn) => sn.id === viewingId) ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = viewingId
      ? dbGetReviewSnapshot(viewingId)
      : fetchSeasonReview(from, to);
    void load.then((d) => { if (!cancelled) setResult({ key, data: d }); });
    return () => { cancelled = true; };
  }, [from, to, key, viewingId]);

  // What has already been saved for this period, so the affordance survives a reload.
  useEffect(() => {
    let cancelled = false;
    void dbListReviewSnapshots('season', from, to).then((rows) => {
      if (!cancelled) setSnapshots(rows);
    });
    return () => { cancelled = true; };
  }, [from, to, reload]);

  const loading = result?.key !== key;
  const data = result?.key === key ? result.data : null;
  const failed = !loading && data == null;

  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [freezeFailedKey, setFreezeFailedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [asOf, setAsOf] = useState('');

  /**
   * A stored instant rendered as the camp's own calendar day. Slicing the ISO string would show
   * the UTC day, so "as of Sep 2" saved in the evening reads back as Sep 3.
   */
  const localDay = (iso: string) => formatDate(toDateStr(new Date(iso)));
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
    // A bare date means the end of that day, so "as of the closing date" includes the closing
    // day's work rather than stopping at midnight before it.
    const stamp = asOf ? new Date(`${asOf}T23:59:59`).toISOString() : new Date().toISOString();
    const ok = await dbSnapshotReview('season', from, to, stamp);
    setSaving(false);
    if (ok) { setConfirmKey(null); setAsOf(''); setReload((n) => n + 1); }
    else setFreezeFailedKey(key);
  }

  async function doRelease(id: string) {
    const ok = await dbReleaseReviewSnapshot(id);
    if (!ok) { setFreezeFailedKey(key); return; }
    if (viewingId === id) setViewingId(null);
    setReload((n) => n + 1);
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
        {t('review.loading')}
      </p>
    );
  }

  if (failed || !data) {
    return (
      <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
        <p className="font-display text-[16px] font-bold text-forest">{t('review.failedTitle')}</p>
        <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
          {t('review.failedBody')}
        </p>
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => setReload((n) => n + 1)}>{t('common:actions.retry')}</Button>
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
            {t('review.period')}
          </label>
          <select
            id="review-scope" className={inputClass} value={scope}
            onChange={(e) => applyScope(e.target.value)}
          >
            {season && <option value="season">{t('review.wholeSeason', { name: season.name })}</option>}
            {sessions.length > 0 && (
              <optgroup label={t('review.oneSession')}>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            )}
            <option value="custom">{t('review.custom')}</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="review-from">
            {t('shared.from')}
          </label>
          <input
            id="review-from" type="date" className={inputClass} value={from}
            onChange={(e) => setOverride({ ...period, scope: 'custom', from: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="review-to">
            {t('shared.to')}
          </label>
          <input
            id="review-to" type="date" className={inputClass} value={to}
            onChange={(e) => setOverride({ ...period, scope: 'custom', to: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 ms-auto">
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" aria-hidden="true" /> {t('review.print')}
          </Button>
          {role === 'admin' && (
            <Button variant="ghost" onClick={() => setConfirmKey(isConfirming ? null : key)}>
              <Lock className="w-3.5 h-3.5" aria-hidden="true" /> {t('review.saveSnapshot')}
            </Button>
          )}
        </div>
      </div>

      {isConfirming && (
        <div className="cc-no-print rounded-card border border-border bg-cream px-5 py-4 mb-6">
          <p className="text-[13px] text-ink leading-relaxed">
            {t('review.confirmBody')}
          </p>
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <div>
              <label
                className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1"
                htmlFor="review-asof"
              >
                {t('review.asOf')}
              </label>
              <input
                id="review-asof" type="date" className={inputClass} value={asOf} max={todayStr()}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
            <Button onClick={doFreeze} disabled={saving}>
              {saving
                ? t('common:actions.saving')
                : asOf ? t('review.saveAsOf', { date: formatDate(asOf) }) : t('review.saveToday')}
            </Button>
            <Button variant="ghost" onClick={() => { setConfirmKey(null); setAsOf(''); }}>
              {t('review.notNow')}
            </Button>
          </div>
          <p className="text-[11.5px] text-ink-soft mt-2.5">
            {t('review.costsNote')}
          </p>
        </div>
      )}

      {/* Saved snapshots for this period. Reading one replaces the report; releasing it puts the
          live numbers back. */}
      {snapshots.length > 0 && (
        <div className="cc-no-print rounded-card border border-border bg-white px-5 py-3.5 mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-2">
            {t('review.savedSnapshots')}
          </p>
          <ul className="divide-y divide-border">
            {snapshots.map((sn) => {
              const on = viewingId === sn.id;
              return (
                <li key={sn.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="text-[13px] font-semibold text-forest">
                    {t('review.asOfDate', { date: localDay(sn.as_of) })}
                  </span>
                  <span className="text-[11.5px] text-ink-soft">
                    {sn.taken_by
                      ? t('review.savedOnBy', { date: localDay(sn.taken_at), name: sn.taken_by })
                      : t('review.savedOn', { date: localDay(sn.taken_at) })}
                  </span>
                  <span className="ms-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingId(on ? null : sn.id)}
                      className="text-[12px] font-semibold text-forest hover:underline px-1.5"
                    >
                      {on ? t('review.backToLive') : t('common:actions.open')}
                    </button>
                    {role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => void doRelease(sn.id)}
                        title={t('review.releaseTitle')}
                        className="text-[12px] font-semibold text-ink-soft hover:text-red px-1.5"
                      >
                        {t('review.release')}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {viewing && (
        <div className="rounded-card border border-forest/30 bg-sage-pale px-5 py-3.5 mb-6 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-forest flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12.5px] text-forest leading-relaxed">
            <Trans
              t={t}
              i18nKey={viewing.taken_by ? 'review.frozenBy' : 'review.frozen'}
              values={{
                asOf: localDay(viewing.as_of), saved: localDay(viewing.taken_at), name: viewing.taken_by ?? '',
              }}
              components={{ b: <b /> }}
            />
          </p>
        </div>
      )}
      {freezeFailed && (
        <p className="cc-no-print text-[12.5px] text-red-text mb-6">
          {t('review.actionFailed')}
        </p>
      )}

      <div id="season-review">
        <header className="mb-6">
          <h1 className="font-display text-[24px] font-bold text-forest leading-tight">
            {t('review.heading')}
          </h1>
          <p className="text-[12.5px] text-ink-soft mt-1">
            {t('shared.range', { from: formatDate(from), to: formatDate(to) })}
          </p>
        </header>

        {totalSample === 0 ? (
          <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
            <p className="font-display text-[16px] font-bold text-forest">
              {t('review.noWorkTitle')}
            </p>
            <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
              {t('review.noWorkBody', { from: formatDate(from), to: formatDate(to) })}
            </p>
          </div>
        ) : (
          <>
            {totalSample < 20 && (
              <p className="cc-keep-together flex items-start gap-2 rounded-card border border-border bg-cream px-4 py-3 mb-6 text-[12px] text-ink-soft leading-relaxed">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-sage" aria-hidden="true" />
                <span>
                  {t('review.smallSample', { count: totalSample })}
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

const th = 'text-start text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft pb-2 pe-4 whitespace-nowrap';
const td = 'text-[12.5px] text-ink py-2 pe-4 border-t border-border align-top';

// ─── 1 · Volume & flow ────────────────────────────────────────────────────────

function VolumeSection({ data, weekly }: { data: SeasonReviewData; weekly: ColumnDatum[] }) {
  const { t } = useTranslation('campgroundAdmin');
  const labelOf = useTradeLabel();
  const trades = Object.entries(data.volume.by_trade)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxTrade = Math.max(1, ...trades.map(([, n]) => n));

  return (
    <Section
      title={t('review.volume.title')}
    >
      <div className="flex flex-wrap border-b border-border mb-4">
        <StatCard label={t('review.volume.reported')} value={data.volume.reported} />
        <StatCard label={t('review.volume.closed')} value={data.volume.closed} variant="green" />
        <StatCard
          label={t('review.volume.stillOpen')} value={data.volume.open}
          variant={data.volume.open > 0 ? 'amber' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-2">
            {t('review.volume.byWeek')}
          </p>
          {/* Held left-to-right in Hebrew: the chart is SVG, which does not mirror, and under an
              inherited rtl its text-anchor flips and the axis labels land inside the bars. */}
          <div dir="ltr">
            <ColumnChart
              data={weekly}
              series={[
                { label: t('review.volume.reported'), color: REPORTED_COLOR },
                { label: t('review.volume.closed'), color: CLOSED_COLOR },
              ]}
              formatValue={(n) => String(Math.round(n))}
              height={170}
              emptyMessage={t('review.volume.noWeekly')}
            />
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-2">
            {t('review.volume.byCrew')}
          </p>
          <ul className="space-y-2">
            {trades.map(([trade, n]) => (
              <li key={trade}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] text-ink">
                    {labelOf(trade)}
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
            {trades.length === 0 && <li className="text-[12px] text-ink-faint italic">{t('review.volume.nothingRecorded')}</li>}
          </ul>
        </div>
      </div>
    </Section>
  );
}

// ─── 2 · Response times ───────────────────────────────────────────────────────

function TimingSection({ data }: { data: SeasonReviewData }) {
  const { t } = useTranslation('campgroundAdmin');
  const labelOf = useTradeLabel();
  const rows = [...data.timing].sort((a, b) => a.trade.localeCompare(b.trade));
  const thin = rows.every((r) => r.sample < SMALL_SAMPLE);

  return (
    <Section
      title={t('review.timing.title')}
      lede={t('review.timing.lede')}
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">{t('review.timing.nothingClosed')}</p>
      ) : (
        <>
          {thin && (
            <p className="text-[12px] text-amber-text bg-amber-bg border border-amber/30 rounded-card px-4 py-2.5 mb-3 leading-relaxed">
              {t('review.timing.thin', { n: SMALL_SAMPLE })}
            </p>
          )}
          <Scroller>
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('shared.crew')}</th>
                  <th className={th}>{t('shared.priority')}</th>
                  <th className={th}>{t('review.timing.medianAssign')}</th>
                  <th className={th}>{t('review.timing.medianClose')}</th>
                  <th className={th}>{t('review.timing.basedOn')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.trade}-${r.priority}`}>
                    <td className={`${td} font-semibold text-forest`}>
                      {labelOf(r.trade)}
                    </td>
                    <td className={td}>{priorityLabel(r.priority)}</td>
                    <td className={`${td} tabular-nums`}>{hoursLabel(t, r.median_hours_to_assign)}</td>
                    <td className={`${td} tabular-nums`}>{hoursLabel(t, r.median_hours_to_close)}</td>
                    <td className={`${td} tabular-nums ${r.sample < SMALL_SAMPLE ? 'text-ink-faint' : 'text-ink-soft'}`}>
                      {r.sample < SMALL_SAMPLE
                        ? t('review.timing.sampleSmall', { count: r.sample })
                        : t('review.timing.sample', { count: r.sample })}
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
  const { t } = useTranslation('campgroundAdmin');
  const rows = data.locations.slice(0, 15);
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const maxDays = Math.max(1, ...rows.map((r) => r.open_days));

  return (
    <Section
      title={t('review.locations.title')}
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">{t('review.locations.none')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.location} className="cc-keep-together">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <b className="text-[14px] font-semibold text-forest">{r.location}</b>
                <span className="text-[12px] text-ink-soft tabular-nums">
                  {t('review.locations.workOrders', { count: r.count })}
                  {' · '}{t('review.locations.openDays', { count: Math.round(r.open_days) })}
                  {r.cost > 0 ? <>{' · '}<bdi>{formatCost(r.cost)}</bdi></> : null}
                </span>
              </div>
              {/* Two bars on two scales, each labelled with the value it reaches: how OFTEN it
                  breaks, and how LONG it stays broken. They are different arguments. */}
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] uppercase tracking-[0.1em] text-ink-faint flex-shrink-0">
                    {t('review.locations.count')}
                  </span>
                  <div className="flex-1 h-2.5 bg-cream-dark rounded-pill overflow-hidden">
                    <div className="h-full bg-forest rounded-pill" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[10px] uppercase tracking-[0.1em] text-ink-faint flex-shrink-0">
                    {t('review.locations.daysOpen')}
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
          {t('review.locations.showingTop', { shown: rows.length, total: data.locations.length })}
        </p>
      )}
    </Section>
  );
}

// ─── 4 · What it cost, by thing ───────────────────────────────────────────────

function AssetsSection({ data }: { data: SeasonReviewData }) {
  const { t } = useTranslation('campgroundAdmin');
  return (
    <Section
      title={t('review.assets.title')}
      lede={t('review.assets.lede', { cost: formatCost(data.money.recorded_cost), count: data.money.with_cost })}
    >
      {data.assets.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">
          {t('review.assets.none')}
        </p>
      ) : (
        <Scroller>
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('review.assets.asset')}</th>
                <th className={th}>{t('review.assets.workOrders')}</th>
                <th className={th}>{t('review.assets.daysOut')}</th>
                <th className={th}>{t('review.assets.recordedCost')}</th>
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
  const { t } = useTranslation('campgroundAdmin');
  return (
    <Section title={t('review.workload.title')}>
      <p className="text-[12.5px] text-ink-soft leading-relaxed mb-3 max-w-3xl">
        {t('review.workload.lede')}
      </p>
      {data.workload.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">{t('review.workload.none')}</p>
      ) : (
        <Scroller>
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('review.workload.person')}</th>
                <th className={th}>{t('review.workload.closed')}</th>
                <th className={th}>{t('review.workload.stillOpen')}</th>
                <th className={th}>{t('review.timing.medianClose')}</th>
                <th className={th}>{t('review.workload.minutes')}</th>
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
                  <td className={`${td} tabular-nums`}>{hoursLabel(t, w.median_hours_to_close)}</td>
                  <td className={`${td} tabular-nums`}>
                    {w.minutes_logged > 0 ? w.minutes_logged.toLocaleString(currentLang()) : '—'}
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
  const { t } = useTranslation('campgroundAdmin');
  const labelOf = useTradeLabel();
  if (data.vendors.length === 0) return null;

  // How much of the cost column is actually filled in. A camp that priced two of eleven jobs
  // should be told that rather than shown a total that reads as complete.
  const priced = data.vendors.reduce((n, v) => n + v.with_cost, 0);
  const jobs = data.vendors.reduce((n, v) => n + v.jobs, 0);

  return (
    <Section
      title={t('review.vendors.title')}
      lede={priced < jobs ? t('review.vendors.costCoverage', { priced, jobs }) : undefined}
    >
      <Scroller>
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('review.vendors.vendor')}</th>
              <th className={th}>{t('review.vendors.jobs')}</th>
              <th className={th}>{t('review.workload.stillOpen')}</th>
              <th className={th}>{t('review.timing.medianClose')}</th>
              <th className={th}>{t('review.assets.recordedCost')}</th>
            </tr>
          </thead>
          <tbody>
            {data.vendors.map((v) => (
              <tr key={v.id}>
                <td className={`${td} font-semibold text-forest`}>
                  {v.name}
                  {v.trade && <span className="font-normal text-ink-soft"> · {labelOf(v.trade)}</span>}
                </td>
                <td className={`${td} tabular-nums`}>{v.jobs}</td>
                <td className={`${td} tabular-nums`}>{v.open || '—'}</td>
                <td className={`${td} tabular-nums`}>
                  {v.median_days != null ? t('review.daysShort', { value: v.median_days.toLocaleString(currentLang()) }) : '—'}
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
  const { t } = useTranslation('campgroundAdmin');

  return (
    <Section
      title={t('review.sources.title')}
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint italic">{t('review.sources.none')}</p>
      ) : (
        <ul className="space-y-2 max-w-2xl">
          {rows.map(([key, n]) => (
            <li key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] text-ink">
                  {SOURCE_LABELS[key as NonNullable<IssueSource>] ?? key}
                </span>
                <span className="text-[12.5px] text-ink-soft tabular-nums">
                  <bdi dir="ltr">{n} · {Math.round((n / total) * 100)}%</bdi>
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
  const { t } = useTranslation('campgroundAdmin');
  const r = data.routines;
  return (
    <Section
      title={t('review.routines.title')}
    >
      <div className="flex flex-wrap border-b border-border mb-3">
        <StatCard label={t('review.routines.active')} value={r.active} />
        <StatCard label={t('review.routines.raised')} value={r.generated} />
        <StatCard
          label={t('review.routines.behind')} value={r.behind.length}
          variant={r.behind.length > 0 ? 'red' : 'green'}
        />
      </div>
      {r.behind.length === 0 ? (
        <p className="text-[12.5px] text-ink-soft">{t('review.routines.noneBehind')}</p>
      ) : (
        <ul className="space-y-1">
          {r.behind.map((b) => (
            <li key={b.title} className="text-[12.5px] text-ink">
              <b className="font-semibold">{b.title}</b>
              <span className="text-red-text"> — {t('cadenceText.missed', { count: b.cycles })}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── 8 · Carry-over ───────────────────────────────────────────────────────────

function CarryOverSection({ data }: { data: SeasonReviewData }) {
  const { t } = useTranslation('campgroundAdmin');
  const labelOf = useTradeLabel();
  const rows = [...data.carry_over].sort((a, b) => b.age_days - a.age_days);

  return (
    <Section
      title={t('review.carry.title')}
      lede={t('review.carry.lede')}
    >
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-soft">
          {t('review.carry.none')}
        </p>
      ) : (
        <Scroller>
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('review.carry.workOrder')}</th>
                <th className={th}>{t('shared.crew')}</th>
                <th className={th}>{t('shared.priority')}</th>
                <th className={th}>{t('review.carry.location')}</th>
                <th className={th}>{t('review.carry.status')}</th>
                <th className={th}>{t('review.carry.openFor')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} font-semibold text-forest`}>
                    <TranslatedText source="issues" id={c.id} field="title" text={c.title} />
                  </td>
                  <td className={td}>{labelOf(c.trade)}</td>
                  <td className={td}>{priorityLabel(c.priority)}</td>
                  <td className={td}>{c.location ?? '—'}</td>
                  <td className={td}>{STATUS_LABELS[c.status as IssueStatus] ?? c.status}</td>
                  <td className={`${td} tabular-nums ${c.age_days > 60 ? 'text-red-text font-semibold' : ''}`}>
                    {t('review.carry.ageDays', { count: Math.round(c.age_days) })}
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

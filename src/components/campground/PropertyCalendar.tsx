import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useChecklistStore } from '@/store/checklistStore';
import { fetchPropertyCalendar } from '@/lib/campgroundDb';
import { parseDateStr, toDateStr, todayStr, formatDate } from '@/lib/utils';
import type { PropertyCalendar as PropertyCalendarData } from '@/lib/types';
import { currentLang } from '@/i18n';
import { weekStartsOn } from './RoutineModal';

/**
 * One screen where both halves of the product are visibly the same product.
 *
 * Camp sessions, rental groups, program-space bookings and out-of-service buildings on one
 * timeline — and on top of them, turnover days. A departure and an arrival meeting on the same
 * date with eleven cabins to turn is a staffing decision, and at every camp that decision is
 * currently discovered at 7am on the morning it lands. It is the only thing on this page drawn in
 * a saturated colour, because it is the only thing here that is a surprise.
 */

const DAY_W = 20;      // px per calendar day
const LABEL_W = 156;   // the sticky name column
const ROW_H = 28;
const DAY_MS = 86_400_000;
/** Past this many days the timeline is unreadable and enormous; the picker says so instead. */
const MAX_DAYS = 420;

const inputClass =
  'text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';

// Every horizontal position below is `insetInlineStart`, never `left`. The timeline is a line
// of days read in the reader's direction: in Hebrew, time runs right-to-left like the text,
// with the sticky name column on the right. With `left` the bands stayed put while the name
// column and the scroller flipped, so every band sat under the wrong week.

function addDaysStr(day: string, n: number): string {
  const d = parseDateStr(day);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function defaultRange(season: { openingDate: string; closingDate: string } | null) {
  // A fortnight either side of the season: the turnovers that hurt are the ones at the edges,
  // and a range that stops on closing day hides the last one.
  if (season) {
    return { from: addDaysStr(season.openingDate, -14), to: addDaysStr(season.closingDate, 14) };
  }
  const today = todayStr();
  return { from: addDaysStr(today, -30), to: addDaysStr(today, 120) };
}

export function PropertyCalendar() {
  const season = useChecklistStore((s) => s.season);

  const [override, setOverride] = useState<{ from: string; to: string } | null>(null);
  const [reload, setReload] = useState(0);

  // Derived during render rather than synced by an effect: the season lands after the first
  // paint on a cold load, and copying it into state would be a cascading render that also
  // overwrote a range somebody had already chosen.
  const { from, to } = override ?? defaultRange(season);
  const key = `${from}|${to}|${reload}`;

  // The result carries the range it answers, so a slow response for last month's dates can
  // never paint over this month's, and "loading" needs no flag of its own.
  const [result, setResult] = useState<{ key: string; data: PropertyCalendarData | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchPropertyCalendar(from, to).then((d) => { if (!cancelled) setResult({ key, data: d }); });
    return () => { cancelled = true; };
  }, [from, to, key]);

  const loading = result?.key !== key;
  const data = result?.key === key ? result.data : null;
  const failed = !loading && data == null;

  const totalDays = useMemo(() => {
    const n = Math.round((parseDateStr(to).getTime() - parseDateStr(from).getTime()) / DAY_MS) + 1;
    return Number.isFinite(n) ? n : 0;
  }, [from, to]);

  const dayIndex = useMemo(() => {
    const base = parseDateStr(from).getTime();
    return (day: string) => Math.round((parseDateStr(day).getTime() - base) / DAY_MS);
  }, [from]);

  const trackW = Math.max(0, totalDays * DAY_W);

  /** Start offset/width for an inclusive date range, clipped to the visible window. */
  function band(start: string, end: string | null): { start: number; width: number } | null {
    const s = Math.max(0, dayIndex(start));
    const e = Math.min(totalDays - 1, end ? dayIndex(end) : totalDays - 1);
    if (e < 0 || s > totalDays - 1 || e < s) return null;
    return { start: s * DAY_W, width: (e - s + 1) * DAY_W };
  }

  /** Offsets of the first day of each week (Sunday, or Monday in Spanish), for the rules and ticks. */
  const weekTicks = useMemo(() => {
    const out: { index: number; label: string }[] = [];
    const first = weekStartsOn();
    const fmt = new Intl.DateTimeFormat(currentLang(), { month: 'short', day: 'numeric' });
    const cursor = parseDateStr(from);
    for (let i = 0; i < totalDays; i++) {
      if (cursor.getDay() === first) out.push({ index: i, label: fmt.format(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [from, totalDays]);

  const months = useMemo(() => {
    const out: { index: number; span: number; label: string }[] = [];
    const fmt = new Intl.DateTimeFormat(currentLang(), { month: 'long', year: 'numeric' });
    const cursor = parseDateStr(from);
    let startIdx = 0;
    let label = fmt.format(cursor);
    for (let i = 0; i < totalDays; i++) {
      const next = fmt.format(cursor);
      if (next !== label) {
        out.push({ index: startIdx, span: i - startIdx, label });
        startIdx = i;
        label = next;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (totalDays > 0) out.push({ index: startIdx, span: totalDays - startIdx, label });
    return out;
  }, [from, totalDays]);

  const turnovers = useMemo(
    () => (data?.turnover_days ?? [])
      .filter((t) => dayIndex(t.day) >= 0 && dayIndex(t.day) < totalDays)
      .sort((a, b) => a.day.localeCompare(b.day)),
    [data, dayIndex, totalDays],
  );

  const heaviest = useMemo(
    () => turnovers.reduce<typeof turnovers[number] | null>(
      (best, t) => (best == null || t.rooms_to_turn > best.rooms_to_turn ? t : best), null),
    [turnovers],
  );

  /** Program-space bookings collapse to one row per space; they are single days, not stays. */
  const spaceRows = useMemo(() => {
    const m = new Map<string, PropertyCalendarData['space_bookings']>();
    for (const b of data?.space_bookings ?? []) {
      if (b.status !== 'approved') continue;
      const list = m.get(b.space) ?? [];
      list.push(b);
      m.set(b.space, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const todayIdx = useMemo(() => {
    const i = dayIndex(todayStr());
    return i >= 0 && i < totalDays ? i : null;
  }, [dayIndex, totalDays]);

  const tooWide = totalDays > MAX_DAYS;
  const { t } = useTranslation(['campgroundAdmin', 'common']);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* ── Range ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="cal-from">
            {t('shared.from')}
          </label>
          <input
            id="cal-from" type="date" className={inputClass} value={from}
            onChange={(e) => setOverride({ from: e.target.value, to })}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="cal-to">
            {t('shared.to')}
          </label>
          <input
            id="cal-to" type="date" className={inputClass} value={to}
            onChange={(e) => setOverride({ from, to: e.target.value })}
          />
        </div>
        {season && (
          <Button variant="ghost" onClick={() => setOverride(defaultRange(season))}>
            {season.name}
          </Button>
        )}
      </div>

      {/* ── Turnover callout ────────────────────────────────────────────────── */}
      {turnovers.length > 0 && (
        <div className="rounded-card border border-red/25 bg-red-bg px-5 py-4 mb-5">
          <div className="flex items-start gap-3">
            <ArrowLeftRight className="w-5 h-5 text-red flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display text-[16px] font-bold text-red-text">
                {t('calendar.turnoverDays', { count: turnovers.length })}
              </p>
              <p className="text-[12.5px] text-red-text/85 leading-relaxed mt-1">
                {heaviest && heaviest.rooms_to_turn > 0
                  ? `${t('calendar.heaviest', { date: formatDate(heaviest.day), count: heaviest.rooms_to_turn })} `
                  : ''}
                {t('calendar.sameDay')}
              </p>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
                {turnovers.map((d) => (
                  <li key={d.day} className="text-[12px] text-red-text tabular-nums">
                    <b className="font-semibold">{formatDate(d.day)}</b>
                    {' — '}
                    {d.rooms_to_turn > 0
                      ? t('calendar.turnoverLineRooms', { departing: d.departing, arriving: d.arriving, rooms: d.rooms_to_turn })
                      : t('calendar.turnoverLine', { departing: d.departing, arriving: d.arriving })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-2.5">
        <LegendKey className="bg-forest" label={t('calendar.legendSession')} />
        <LegendKey className="bg-blue" label={t('calendar.legendRental')} />
        <LegendKey className="bg-purple" label={t('calendar.legendSpace')} />
        <LegendKey className="bg-amber" label={t('calendar.legendOutOfService')} />
        <LegendKey className="bg-red" label={t('calendar.legendTurnover')} />
      </div>

      {/* ── The timeline ────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-[13px] text-ink-faint italic py-10 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('calendar.building')}
        </p>
      ) : failed || !data ? (
        <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <p className="font-display text-[16px] font-bold text-forest">{t('calendar.failedTitle')}</p>
          <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
            {t('calendar.failedBody')}
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" onClick={() => setReload((n) => n + 1)}>{t('common:actions.retry')}</Button>
          </div>
        </div>
      ) : tooWide ? (
        <p className="rounded-card border border-border bg-cream px-5 py-4 text-[12.5px] text-ink-soft leading-relaxed">
          {t('calendar.tooWide', { days: totalDays })}
        </p>
      ) : totalDays <= 0 ? (
        <p className="rounded-card border border-border bg-cream px-5 py-4 text-[12.5px] text-ink-soft">
          {t('calendar.endBeforeStart')}
        </p>
      ) : (
        // The one horizontal scroller on the page. The body must never scroll sideways.
        <div className="overflow-x-auto border border-border rounded-card bg-white">
          <div style={{ minWidth: LABEL_W + trackW }}>
            {/* Header: months, then week ticks */}
            <div className="flex bg-cream border-b border-border">
              <div
                className="sticky start-0 z-20 bg-cream flex-shrink-0 border-e border-border"
                style={{ width: LABEL_W }}
              />
              <div className="relative flex-shrink-0" style={{ width: trackW, height: 40 }}>
                {months.map((m) => (
                  <div
                    key={`${m.label}-${m.index}`}
                    className="absolute top-0 h-5 flex items-center border-s border-border px-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-forest whitespace-nowrap overflow-hidden"
                    style={{ insetInlineStart: m.index * DAY_W, width: m.span * DAY_W }}
                  >
                    {m.label}
                  </div>
                ))}
                {weekTicks.map((w) => (
                  <div
                    key={w.index}
                    className="absolute top-5 h-5 flex items-center border-s border-border ps-1 text-[9.5px] text-ink-soft whitespace-nowrap overflow-hidden"
                    style={{ insetInlineStart: w.index * DAY_W, width: 7 * DAY_W }}
                  >
                    {w.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Turnovers — the loudest row, and the first one. */}
            {turnovers.length > 0 && (
              <Row
                label={t('calendar.rowTurnovers')}
                labelClassName="text-red-text font-semibold"
                trackW={trackW}
                weekTicks={weekTicks}
                turnovers={turnovers}
                dayIndex={dayIndex}
                todayIdx={todayIdx}
              >
                {turnovers.map((d) => (
                  <div
                    key={d.day}
                    title={t('calendar.turnoverTitle', {
                      date: formatDate(d.day), departing: d.departing, arriving: d.arriving, rooms: d.rooms_to_turn,
                    })}
                    className="absolute top-1 bottom-1 bg-red text-white rounded-tag flex items-center justify-center text-[10px] font-bold tabular-nums"
                    style={{ insetInlineStart: dayIndex(d.day) * DAY_W, width: DAY_W }}
                  >
                    {d.rooms_to_turn > 0 ? d.rooms_to_turn : '·'}
                  </div>
                ))}
              </Row>
            )}

            <GroupLabel label={t('calendar.groupSessions')} count={data.sessions.length} />
            {data.sessions.length === 0 && <EmptyRow text={t('calendar.noSessions')} />}
            {[...data.sessions].sort((a, b) => a.start.localeCompare(b.start)).map((s) => {
              const b = band(s.start, s.end);
              return (
                <Row
                  key={s.id} label={s.name} trackW={trackW} weekTicks={weekTicks}
                  turnovers={turnovers} dayIndex={dayIndex} todayIdx={todayIdx}
                >
                  {b && (
                    <div
                      title={t('calendar.sessionTitle', {
                        name: s.name, from: formatDate(s.start), to: formatDate(s.end), count: s.people,
                      })}
                      className="absolute top-1 bottom-1 bg-forest text-paper rounded-tag px-2 flex items-center text-[11px] whitespace-nowrap overflow-hidden"
                      style={{ insetInlineStart: b.start, width: b.width }}
                    >
                      {s.people > 0 ? t('calendar.people', { count: s.people }) : s.name}
                    </div>
                  )}
                </Row>
              );
            })}

            <GroupLabel label={t('calendar.groupRentals')} count={data.retreats.length} />
            {data.retreats.length === 0 && <EmptyRow text={t('calendar.noRentals')} />}
            {[...data.retreats].sort((a, b) => a.start.localeCompare(b.start)).map((r) => {
              const b = band(r.start, r.end);
              return (
                <Row
                  key={r.id} label={r.group} trackW={trackW} weekTicks={weekTicks}
                  turnovers={turnovers} dayIndex={dayIndex} todayIdx={todayIdx}
                >
                  {b && (
                    <div
                      title={t('calendar.retreatTitle', {
                        name: r.group, from: formatDate(r.start), to: formatDate(r.end), count: r.people, status: r.status,
                      })}
                      className="absolute top-1 bottom-1 bg-blue text-white rounded-tag px-2 flex items-center text-[11px] whitespace-nowrap overflow-hidden"
                      style={{ insetInlineStart: b.start, width: b.width }}
                    >
                      {r.people > 0 ? t('calendar.people', { count: r.people }) : r.group}
                    </div>
                  )}
                </Row>
              );
            })}

            <GroupLabel label={t('calendar.groupSpaces')} count={spaceRows.length} />
            {spaceRows.length === 0 && <EmptyRow text={t('calendar.noSpaces')} />}
            {spaceRows.map(([space, bookings]) => (
              <Row
                key={space} label={space} trackW={trackW} weekTicks={weekTicks}
                turnovers={turnovers} dayIndex={dayIndex} todayIdx={todayIdx}
              >
                {bookings.map((bk) => {
                  const i = dayIndex(bk.day);
                  if (i < 0 || i >= totalDays) return null;
                  return (
                    <div
                      key={bk.id}
                      title={bk.purpose
                        ? t('calendar.spaceTitlePurpose', { space, date: formatDate(bk.day), group: bk.group, purpose: bk.purpose })
                        : t('calendar.spaceTitle', { space, date: formatDate(bk.day), group: bk.group })}
                      className="absolute top-1.5 bottom-1.5 bg-purple-bg border border-purple/40 rounded-tag"
                      style={{ insetInlineStart: i * DAY_W + 1, width: DAY_W - 2 }}
                    />
                  );
                })}
              </Row>
            ))}

            <GroupLabel label={t('calendar.groupOutOfService')} count={data.out_of_service.length} />
            {data.out_of_service.length === 0 && <EmptyRow text={t('calendar.allInService')} />}
            {data.out_of_service.map((o) => {
              const b = band(o.since ?? from, o.expected_back);
              return (
                <Row
                  key={o.id} label={o.name} trackW={trackW} weekTicks={weekTicks}
                  turnovers={turnovers} dayIndex={dayIndex} todayIdx={todayIdx}
                >
                  {b && (
                    <div
                      title={o.expected_back
                        ? (o.reason
                          ? t('calendar.oosReasonBack', { name: o.name, reason: o.reason, date: formatDate(o.expected_back) })
                          : t('calendar.oosBack', { name: o.name, date: formatDate(o.expected_back) }))
                        : (o.reason
                          ? t('calendar.oosReasonNoDate', { name: o.name, reason: o.reason })
                          : t('calendar.oosNoDate', { name: o.name }))}
                      className="absolute top-1 bottom-1 bg-amber-bg border border-amber/50 text-amber-text rounded-tag px-2 flex items-center text-[11px] whitespace-nowrap overflow-hidden"
                      style={{ insetInlineStart: b.start, width: b.width }}
                    >
                      {o.reason ?? t('calendar.legendOutOfService')}
                    </div>
                  )}
                </Row>
              );
            })}
          </div>
        </div>
      )}

      {!loading && data && turnovers.length === 0 && (
        <p className="mt-3 text-[12px] text-ink-soft flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-sage" aria-hidden="true" />
          {t('calendar.noTurnovers')}
        </p>
      )}
    </div>
  );
}

// ─── Row chrome ───────────────────────────────────────────────────────────────

function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
      <span className={`w-3 h-2.5 rounded-[2px] ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function GroupLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex border-t border-border bg-cream">
      <div
        className="sticky start-0 z-20 bg-cream flex-shrink-0 px-3 py-1.5 border-e border-border text-[10px] font-bold uppercase tracking-[0.12em] text-forest"
        style={{ width: LABEL_W }}
      >
        {label}
      </div>
      <div className="flex items-center px-3 text-[10px] text-ink-faint tabular-nums">{count}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex border-t border-border">
      <div
        className="sticky start-0 z-10 bg-white flex-shrink-0 px-3 py-1.5 border-e border-border text-[11.5px] text-ink-faint italic"
        style={{ width: LABEL_W }}
      >
        {text}
      </div>
      <div className="flex-1" />
    </div>
  );
}

function Row({
  label, labelClassName = '', trackW, weekTicks, turnovers, dayIndex, todayIdx, children,
}: {
  label: string;
  labelClassName?: string;
  trackW: number;
  weekTicks: { index: number; label: string }[];
  turnovers: PropertyCalendarData['turnover_days'];
  dayIndex: (day: string) => number;
  todayIdx: number | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex border-t border-border">
      <div
        className={`sticky start-0 z-10 bg-white flex-shrink-0 px-3 border-e border-border flex items-center text-[11.5px] text-ink truncate ${labelClassName}`}
        style={{ width: LABEL_W, height: ROW_H }}
        title={label}
      >
        <span className="truncate">{label}</span>
      </div>
      <div className="relative flex-shrink-0" style={{ width: trackW, height: ROW_H }}>
        {/* Week rules, then the turnover wash, then today, then the bands on top. */}
        {weekTicks.map((w) => (
          <div
            key={w.index}
            className="absolute top-0 bottom-0 border-s border-border/60"
            style={{ insetInlineStart: w.index * DAY_W }}
            aria-hidden="true"
          />
        ))}
        {turnovers.map((t) => (
          <div
            key={t.day}
            className="absolute top-0 bottom-0 bg-red/10"
            style={{ insetInlineStart: dayIndex(t.day) * DAY_W, width: DAY_W }}
            aria-hidden="true"
          />
        ))}
        {todayIdx != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-forest/50"
            style={{ insetInlineStart: todayIdx * DAY_W }}
            aria-hidden="true"
          />
        )}
        {children}
      </div>
    </div>
  );
}

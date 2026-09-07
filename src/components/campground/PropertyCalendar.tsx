import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useChecklistStore } from '@/store/checklistStore';
import { fetchPropertyCalendar } from '@/lib/campgroundDb';
import { parseDateStr, toDateStr, todayStr, formatDate } from '@/lib/utils';
import type { PropertyCalendar as PropertyCalendarData } from '@/lib/types';

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

  /** Left/width for an inclusive date range, clipped to the visible window. */
  function band(start: string, end: string | null): { left: number; width: number } | null {
    const s = Math.max(0, dayIndex(start));
    const e = Math.min(totalDays - 1, end ? dayIndex(end) : totalDays - 1);
    if (e < 0 || s > totalDays - 1 || e < s) return null;
    return { left: s * DAY_W, width: (e - s + 1) * DAY_W };
  }

  /** Sunday offsets, for the week rules and the header ticks. */
  const weekTicks = useMemo(() => {
    const out: { index: number; label: string }[] = [];
    const cursor = parseDateStr(from);
    for (let i = 0; i < totalDays; i++) {
      if (cursor.getDay() === 0) out.push({ index: i, label: format(cursor, 'MMM d') });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [from, totalDays]);

  const months = useMemo(() => {
    const out: { index: number; span: number; label: string }[] = [];
    const cursor = parseDateStr(from);
    let startIdx = 0;
    let label = format(cursor, 'MMMM yyyy');
    for (let i = 0; i < totalDays; i++) {
      const next = format(cursor, 'MMMM yyyy');
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

  return (
    <div>
      {/* ── Range ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="cal-from">
            From
          </label>
          <input
            id="cal-from" type="date" className={inputClass} value={from}
            onChange={(e) => setOverride({ from: e.target.value, to })}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1" htmlFor="cal-to">
            To
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
                {turnovers.length} turnover day{turnovers.length === 1 ? '' : 's'} in this window
              </p>
              <p className="text-[12.5px] text-red-text/85 leading-relaxed mt-1">
                {heaviest && heaviest.rooms_to_turn > 0
                  ? `${formatDate(heaviest.day)} is the heaviest — ${heaviest.rooms_to_turn} room${heaviest.rooms_to_turn === 1 ? '' : 's'} to turn between a departure and an arrival. `
                  : ''}
                A group leaves and another arrives the same day.
              </p>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
                {turnovers.map((t) => (
                  <li key={t.day} className="text-[12px] text-red-text tabular-nums">
                    <b className="font-semibold">{formatDate(t.day)}</b>
                    {' — '}{t.departing} out, {t.arriving} in
                    {t.rooms_to_turn > 0 ? `, ${t.rooms_to_turn} to turn` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-2.5">
        <LegendKey className="bg-forest" label="Camp session" />
        <LegendKey className="bg-blue" label="Rental group" />
        <LegendKey className="bg-purple" label="Program space booked" />
        <LegendKey className="bg-amber" label="Out of service" />
        <LegendKey className="bg-red" label="Turnover day" />
      </div>

      {/* ── The timeline ────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-[13px] text-ink-faint italic py-10 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> Building the calendar…
        </p>
      ) : failed || !data ? (
        <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <p className="font-display text-[16px] font-bold text-forest">The calendar could not load</p>
          <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
            Nothing is lost — the bookings themselves are unaffected.
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" onClick={() => setReload((n) => n + 1)}>Try again</Button>
          </div>
        </div>
      ) : tooWide ? (
        <p className="rounded-card border border-border bg-cream px-5 py-4 text-[12.5px] text-ink-soft leading-relaxed">
          That is {totalDays} days. A timeline that wide is a wall of colour rather than something
          you can read a week off — narrow it to a season or less.
        </p>
      ) : totalDays <= 0 ? (
        <p className="rounded-card border border-border bg-cream px-5 py-4 text-[12.5px] text-ink-soft">
          The end date is before the start date.
        </p>
      ) : (
        // The one horizontal scroller on the page. The body must never scroll sideways.
        <div className="overflow-x-auto border border-border rounded-card bg-white">
          <div style={{ minWidth: LABEL_W + trackW }}>
            {/* Header: months, then week ticks */}
            <div className="flex bg-cream border-b border-border">
              <div
                className="sticky left-0 z-20 bg-cream flex-shrink-0 border-r border-border"
                style={{ width: LABEL_W }}
              />
              <div className="relative flex-shrink-0" style={{ width: trackW, height: 40 }}>
                {months.map((m) => (
                  <div
                    key={`${m.label}-${m.index}`}
                    className="absolute top-0 h-5 flex items-center border-l border-border px-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-forest whitespace-nowrap overflow-hidden"
                    style={{ left: m.index * DAY_W, width: m.span * DAY_W }}
                  >
                    {m.label}
                  </div>
                ))}
                {weekTicks.map((w) => (
                  <div
                    key={w.index}
                    className="absolute top-5 h-5 flex items-center border-l border-border pl-1 text-[9.5px] text-ink-soft whitespace-nowrap overflow-hidden"
                    style={{ left: w.index * DAY_W, width: 7 * DAY_W }}
                  >
                    {w.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Turnovers — the loudest row, and the first one. */}
            {turnovers.length > 0 && (
              <Row
                label="Turnovers"
                labelClassName="text-red-text font-semibold"
                trackW={trackW}
                weekTicks={weekTicks}
                turnovers={turnovers}
                dayIndex={dayIndex}
                todayIdx={todayIdx}
              >
                {turnovers.map((t) => (
                  <div
                    key={t.day}
                    title={`${formatDate(t.day)} — ${t.departing} out, ${t.arriving} in, ${t.rooms_to_turn} to turn`}
                    className="absolute top-1 bottom-1 bg-red text-white rounded-tag flex items-center justify-center text-[10px] font-bold tabular-nums"
                    style={{ left: dayIndex(t.day) * DAY_W, width: DAY_W }}
                  >
                    {t.rooms_to_turn > 0 ? t.rooms_to_turn : '·'}
                  </div>
                ))}
              </Row>
            )}

            <GroupLabel label="Camp sessions" count={data.sessions.length} />
            {data.sessions.length === 0 && <EmptyRow text="No sessions in this window" />}
            {[...data.sessions].sort((a, b) => a.start.localeCompare(b.start)).map((s) => {
              const b = band(s.start, s.end);
              return (
                <Row
                  key={s.id} label={s.name} trackW={trackW} weekTicks={weekTicks}
                  turnovers={turnovers} dayIndex={dayIndex} todayIdx={todayIdx}
                >
                  {b && (
                    <div
                      title={`${s.name} · ${formatDate(s.start)} – ${formatDate(s.end)} · ${s.people} people`}
                      className="absolute top-1 bottom-1 bg-forest text-paper rounded-tag px-2 flex items-center text-[11px] whitespace-nowrap overflow-hidden"
                      style={{ left: b.left, width: b.width }}
                    >
                      {s.people > 0 ? `${s.people} people` : s.name}
                    </div>
                  )}
                </Row>
              );
            })}

            <GroupLabel label="Rental groups" count={data.retreats.length} />
            {data.retreats.length === 0 && <EmptyRow text="No rental groups in this window" />}
            {[...data.retreats].sort((a, b) => a.start.localeCompare(b.start)).map((r) => {
              const b = band(r.start, r.end);
              return (
                <Row
                  key={r.id} label={r.group} trackW={trackW} weekTicks={weekTicks}
                  turnovers={turnovers} dayIndex={dayIndex} todayIdx={todayIdx}
                >
                  {b && (
                    <div
                      title={`${r.group} · ${formatDate(r.start)} – ${formatDate(r.end)} · ${r.people} people · ${r.status}`}
                      className="absolute top-1 bottom-1 bg-blue text-white rounded-tag px-2 flex items-center text-[11px] whitespace-nowrap overflow-hidden"
                      style={{ left: b.left, width: b.width }}
                    >
                      {r.people > 0 ? `${r.people} people` : r.group}
                    </div>
                  )}
                </Row>
              );
            })}

            <GroupLabel label="Program spaces" count={spaceRows.length} />
            {spaceRows.length === 0 && <EmptyRow text="No approved space bookings" />}
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
                      title={`${space} · ${formatDate(bk.day)} · ${bk.group}${bk.purpose ? ` — ${bk.purpose}` : ''}`}
                      className="absolute top-1.5 bottom-1.5 bg-purple-bg border border-purple/40 rounded-tag"
                      style={{ left: i * DAY_W + 1, width: DAY_W - 2 }}
                    />
                  );
                })}
              </Row>
            ))}

            <GroupLabel label="Out of service" count={data.out_of_service.length} />
            {data.out_of_service.length === 0 && <EmptyRow text="Everything is in service" />}
            {data.out_of_service.map((o) => {
              const b = band(o.since ?? from, o.expected_back);
              return (
                <Row
                  key={o.id} label={o.name} trackW={trackW} weekTicks={weekTicks}
                  turnovers={turnovers} dayIndex={dayIndex} todayIdx={todayIdx}
                >
                  {b && (
                    <div
                      title={`${o.name} out of service${o.reason ? ` — ${o.reason}` : ''}${o.expected_back ? `, back ${formatDate(o.expected_back)}` : ', no return date'}`}
                      className="absolute top-1 bottom-1 bg-amber-bg border border-amber/50 text-amber-text rounded-tag px-2 flex items-center text-[11px] whitespace-nowrap overflow-hidden"
                      style={{ left: b.left, width: b.width }}
                    >
                      {o.reason ?? 'Out of service'}
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
          No turnover days in this window — nothing departs and arrives on the same date.
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
        className="sticky left-0 z-20 bg-cream flex-shrink-0 px-3 py-1.5 border-r border-border text-[10px] font-bold uppercase tracking-[0.12em] text-forest"
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
        className="sticky left-0 z-10 bg-white flex-shrink-0 px-3 py-1.5 border-r border-border text-[11.5px] text-ink-faint italic"
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
        className={`sticky left-0 z-10 bg-white flex-shrink-0 px-3 border-r border-border flex items-center text-[11.5px] text-ink truncate ${labelClassName}`}
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
            className="absolute top-0 bottom-0 border-l border-border/60"
            style={{ left: w.index * DAY_W }}
            aria-hidden="true"
          />
        ))}
        {turnovers.map((t) => (
          <div
            key={t.day}
            className="absolute top-0 bottom-0 bg-red/10"
            style={{ left: dayIndex(t.day) * DAY_W, width: DAY_W }}
            aria-hidden="true"
          />
        ))}
        {todayIdx != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-forest/50"
            style={{ left: todayIdx * DAY_W }}
            aria-hidden="true"
          />
        )}
        {children}
      </div>
    </div>
  );
}

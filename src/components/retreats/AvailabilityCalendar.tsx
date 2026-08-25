import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Retreat } from '@/lib/types';
import { fmtRange } from './retreatUi';

// Availability at a glance: any day inside a retreat's arrival→departure (inclusive) is
// booked, everything else is open.
//
// Which group is on a booked day used to live in the title attribute, which is to say it was
// invisible: you cannot hover a phone, and nobody hovers twelve squares to find out who is in
// on the 14th. Each retreat now carries a colour, the booked squares wear it, and every month
// prints a key naming the groups underneath. Hover still works, it is just no longer the only
// way to read the calendar.
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Assigned in booking order and reused as the year wraps around. Distinct hues rather than a
 * ramp: neighbouring bookings need to be told apart, not ranked.
 */
const BAND = [
  { bg: 'bg-sage', text: 'text-white', dot: 'bg-sage' },
  { bg: 'bg-blue', text: 'text-white', dot: 'bg-blue' },
  { bg: 'bg-amber', text: 'text-white', dot: 'bg-amber' },
  { bg: 'bg-purple', text: 'text-white', dot: 'bg-purple' },
  { bg: 'bg-red', text: 'text-white', dot: 'bg-red' },
  { bg: 'bg-forest-mid', text: 'text-white', dot: 'bg-forest-mid' },
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function isoOf(date: Date): string {
  return iso(date.getFullYear(), date.getMonth(), date.getDate());
}
function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const total = m + n;
  return { y: y + Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

export function AvailabilityCalendar({ retreats }: { retreats: Retreat[] }) {
  const today = isoOf(new Date());
  const [anchor, setAnchor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });

  // date → the retreats on that day. An array rather than a single retreat: two groups can
  // overlap on a changeover day, and the old map silently kept whichever was written last.
  const { booked, colourOf } = useMemo(() => {
    const live = retreats.filter((r) => r.status !== 'cancelled');
    const order = live.slice().sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
    const colour = new Map<string, typeof BAND[number]>();
    order.forEach((r, i) => colour.set(r.id, BAND[i % BAND.length]));

    const map = new Map<string, Retreat[]>();
    for (const r of live) {
      const end = new Date(r.departureDate + 'T00:00:00');
      const cur = new Date(r.arrivalDate + 'T00:00:00');
      let guard = 0;
      while (cur <= end && guard++ < 400) {
        const key = isoOf(cur);
        (map.get(key) ?? map.set(key, []).get(key)!).push(r);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return { booked: map, colourOf: (id: string) => colour.get(id) ?? BAND[0] };
  }, [retreats]);

  const months = [0, 1, 2].map((n) => addMonths(anchor.y, anchor.m, n));

  return (
    <div className="bg-white rounded-card border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-ink-soft">
          Coloured days are booked. The key under each month says by whom.
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setAnchor((a) => addMonths(a.y, a.m, -1))} className="p-1.5 rounded-btn text-ink-soft hover:bg-cream hover:text-forest" aria-label="Previous months">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => { const n = new Date(); setAnchor({ y: n.getFullYear(), m: n.getMonth() }); }} className="text-[12px] font-medium text-ink-soft hover:text-forest px-2 py-1 rounded-btn hover:bg-cream">
            Today
          </button>
          <button onClick={() => setAnchor((a) => addMonths(a.y, a.m, 1))} className="p-1.5 rounded-btn text-ink-soft hover:bg-cream hover:text-forest" aria-label="Next months">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {months.map(({ y, m }) => {
          const startDay = new Date(y, m, 1).getDay();
          const daysInMonth = new Date(y, m + 1, 0).getDate();
          const cells: (number | null)[] = [
            ...Array.from({ length: startDay }, () => null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];
          return (
            <div key={`${y}-${m}`}>
              <p className="text-[13px] font-semibold text-forest text-center mb-2">{MONTHS[m]} {y}</p>
              <div className="grid grid-cols-2 sm:grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((w, i) => <div key={i} className="text-[10px] font-semibold text-ink-faint text-center">{w}</div>)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (d == null) return <div key={i} />;
                  const date = iso(y, m, d);
                  const on = booked.get(date) ?? [];
                  const isToday = date === today;
                  const c = on.length > 0 ? colourOf(on[0].id) : null;
                  return (
                    <div
                      key={i}
                      title={on.length > 0
                        ? on.map((r) => `${r.groupName} · ${fmtRange(r.arrivalDate, r.departureDate)}`).join('\n')
                        : `Available · ${date}`}
                      className={`relative aspect-square flex items-center justify-center text-[11px] rounded transition-colors ${
                        c ? `${c.bg} ${c.text} font-semibold` : 'text-ink-soft hover:bg-cream'
                      } ${isToday ? 'ring-2 ring-forest ring-offset-1' : ''}`}
                    >
                      {d}
                      {/* Changeover day: two groups on site, so the square is not one colour. */}
                      {on.length > 1 && (
                        <span
                          className={`absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full ring-1 ring-white ${colourOf(on[1].id).dot}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <MonthKey y={y} m={m} booked={booked} colourOf={colourOf} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The groups on site during one month, named.
 *
 * Read off the same day map the squares use rather than re-deriving from date ranges, so a
 * group can never appear in the key on a month where none of its days are drawn (or, worse,
 * be missing from one where they are).
 */
function MonthKey({
  y, m, booked, colourOf,
}: {
  y: number;
  m: number;
  booked: Map<string, Retreat[]>;
  colourOf: (id: string) => { dot: string };
}) {
  const seen = new Map<string, Retreat>();
  const days = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    for (const r of booked.get(iso(y, m, d)) ?? []) if (!seen.has(r.id)) seen.set(r.id, r);
  }
  const groups = [...seen.values()].sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));

  if (groups.length === 0) {
    return <p className="mt-2.5 text-[11px] text-ink-faint italic">Nothing booked this month.</p>;
  }
  return (
    <ul className="mt-2.5 space-y-1">
      {groups.map((r) => (
        <li key={r.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
          <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-sm ${colourOf(r.id).dot}`} />
          <span className="min-w-0">
            <span className="font-semibold text-forest">{r.groupName}</span>
            <span className="text-ink-faint"> · {fmtRange(r.arrivalDate, r.departureDate)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

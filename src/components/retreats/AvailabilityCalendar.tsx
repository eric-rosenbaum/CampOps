import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Retreat } from '@/lib/types';
import { fmtRange } from './retreatUi';

// Simple availability view: a camp hosts one retreat at a time, so any day inside a
// retreat's arrival→departure (inclusive) is booked; everything else is open.
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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

  // date → retreat for every booked day.
  const booked = useMemo(() => {
    const map = new Map<string, Retreat>();
    for (const r of retreats) {
      if (r.status === 'cancelled') continue;
      const end = new Date(r.departureDate + 'T00:00:00');
      const cur = new Date(r.arrivalDate + 'T00:00:00');
      let guard = 0;
      while (cur <= end && guard++ < 400) { map.set(isoOf(cur), r); cur.setDate(cur.getDate() + 1); }
    }
    return map;
  }, [retreats]);

  const months = [0, 1, 2].map((n) => addMonths(anchor.y, anchor.m, n));

  return (
    <div className="bg-white rounded-card border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-[12px] text-forest/55">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cream-dark border border-border" /> Available</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sage" /> Booked</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAnchor((a) => addMonths(a.y, a.m, -1))} className="p-1.5 rounded-btn text-forest/50 hover:bg-cream hover:text-forest" aria-label="Previous months">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => { const n = new Date(); setAnchor({ y: n.getFullYear(), m: n.getMonth() }); }} className="text-[12px] font-medium text-forest/60 hover:text-forest px-2 py-1 rounded-btn hover:bg-cream">
            Today
          </button>
          <button onClick={() => setAnchor((a) => addMonths(a.y, a.m, 1))} className="p-1.5 rounded-btn text-forest/50 hover:bg-cream hover:text-forest" aria-label="Next months">
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
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((w, i) => <div key={i} className="text-[10px] font-semibold text-forest/35 text-center">{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (d == null) return <div key={i} />;
                  const date = iso(y, m, d);
                  const r = booked.get(date);
                  const isToday = date === today;
                  return (
                    <div
                      key={i}
                      title={r ? `${r.groupName} · ${fmtRange(r.arrivalDate, r.departureDate)}` : `Available · ${date}`}
                      className={`aspect-square flex items-center justify-center text-[11px] rounded transition-colors ${
                        r ? 'bg-sage text-white font-semibold' : 'text-forest/60 hover:bg-cream'
                      } ${isToday ? 'ring-2 ring-forest ring-offset-1' : ''}`}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

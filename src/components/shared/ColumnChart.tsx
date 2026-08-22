import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A small stacked column chart.
//
// It draws in REAL PIXELS against a width measured by a ResizeObserver, rather than
// drawing into a fixed viewBox and letting the browser stretch it. A stretched viewBox
// needs preserveAspectRatio="none", which scales x and y by different factors and so
// distorts exactly the things that are meant to be crisp: rounded caps go oval, stroke
// widths differ per axis, and text is squashed. Measuring costs one layout pass and keeps
// every glyph and corner true at any container width.

export interface ColumnDatum {
  label: string;
  /** Stable identity when labels can repeat (e.g. the same month name in two years). */
  key?: string;
  /** One value per series, in the same order as `series`. Stacked bottom-up. */
  segments: number[];
}

interface Props {
  data: ColumnDatum[];
  series: { label: string; color: string }[];
  formatValue: (n: number) => string;
  /** Plot height in px, excluding the axis gutter and legend. */
  height?: number;
  emptyMessage?: string;
}

// A fine ladder. The usual coarse 1/2/5/10 one snaps a 630 max up to 1,000 and wastes a
// third of the plot; these steps keep the tallest column near the top of the frame.
const LADDER = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

// Not exported: this file must export components only, or fast refresh stops working.
function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const frac = v / pow;
  const step = LADDER.find((l) => frac <= l + 1e-9) ?? 10;
  return step * pow;
}

/** A rect with only its top two corners rounded — for the top segment of a stack. */
function topRoundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

const PAD_LEFT = 52;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const AXIS_H = 22;
const TICKS = 4;

export function ColumnChart({ data, series, formatValue, height = 180, emptyMessage }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Layout effect for the first measurement so the chart does not paint at width 0 and
  // then jump; the observer handles every resize after that.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (el) setWidth(el.clientWidth);
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = data.map((d) => d.segments.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const hasAny = totals.some((t) => t > 0);

  const svgH = height + AXIS_H;
  const plotW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotH = height - PAD_TOP;

  // Columns get a fixed share of their slot, so a 3-column chart does not draw three
  // enormous slabs and a 14-column one still leaves daylight between bars.
  const slot = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.max(3, Math.min(48, slot * 0.62));

  const summary = `${series.map((s) => s.label).join(' and ')} by month, ${data.length} columns, maximum ${formatValue(max)}`;

  return (
    <div>
      <div ref={hostRef} className="w-full">
        {width > 0 && (
          <svg width={width} height={svgH} role="img" aria-label={summary} className="block">
            {/* Gridlines + y labels */}
            {Array.from({ length: TICKS + 1 }, (_, i) => {
              const frac = i / TICKS;
              const y = PAD_TOP + plotH - frac * plotH;
              const value = max * frac;
              return (
                <g key={i}>
                  <line
                    x1={PAD_LEFT} y1={y} x2={PAD_LEFT + plotW} y2={y}
                    stroke="currentColor" strokeWidth={1}
                    className={i === 0 ? 'text-forest/25' : 'text-forest/10'}
                  />
                  <text
                    x={PAD_LEFT - 8} y={y + 3.5} textAnchor="end"
                    className="fill-current text-ink-faint"
                    style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatValue(value)}
                  </text>
                </g>
              );
            })}

            {/* Columns */}
            {data.map((d, ci) => {
              const cx = PAD_LEFT + ci * slot + (slot - barW) / 2;
              const topIdx = d.segments.reduce((acc, v, i) => (v > 0 ? i : acc), -1);
              let cursor = PAD_TOP + plotH;
              return (
                <g key={d.key ?? d.label}>
                  {d.segments.map((raw, si) => {
                    const v = Number.isFinite(raw) && raw > 0 ? raw : 0;
                    if (v === 0) return null;
                    const h = (v / max) * plotH;
                    cursor -= h;
                    const y = cursor;
                    const color = series[si]?.color ?? '#999';
                    return si === topIdx
                      ? <path key={si} d={topRoundedPath(cx, y, barW, h, 3)} fill={color} />
                      : <rect key={si} x={cx} y={y} width={barW} height={h} fill={color} />;
                  })}
                  <text
                    x={cx + barW / 2} y={PAD_TOP + plotH + 15} textAnchor="middle"
                    className="fill-current text-ink-soft"
                    style={{ fontSize: 10 }}
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {/* Drawn inside the plot rather than overlaid with negative margins, so it
                stays centred whatever the height prop is. */}
            {!hasAny && emptyMessage && (
              <text
                x={PAD_LEFT + plotW / 2} y={PAD_TOP + plotH / 2} textAnchor="middle"
                className="fill-current text-ink-faint" style={{ fontSize: 12 }}
              >
                {emptyMessage}
              </text>
            )}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-2 pl-[52px]">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="w-2.5 h-2.5 rounded-[2px] flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

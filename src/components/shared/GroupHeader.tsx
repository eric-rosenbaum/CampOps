/**
 * A ruled section heading: label, a dotted leader running to the right margin, and a count.
 *
 * The leader is doing work, not decoration. It ties the label to its count across the width
 * of the list the way a printed index does, so the eye can pick up "how many" without leaving
 * the heading.
 */
export function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 pb-3 pt-7 first:pt-4">
      <b className="font-display text-[14px] font-bold text-forest">{label}</b>
      <span
        className="h-px flex-1 bg-[repeating-linear-gradient(90deg,#DED3BB_0_5px,transparent_5px_10px)]"
        aria-hidden="true"
      />
      <span className="text-[11.5px] tabular-nums text-ink-soft">{count}</span>
    </div>
  );
}

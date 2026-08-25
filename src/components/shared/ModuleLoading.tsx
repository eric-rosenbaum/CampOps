import { CampCommandMark, CC_CREAM, CC_GREEN } from '@/components/shared/CampCommandMark';

/**
 * The one loading treatment, in the three sizes the app actually needs.
 *
 * A generic spinner says only "something is happening". Waiting is a real part of using this
 * app on camp wifi, so it may as well be the product's own object doing the waiting. Keeping
 * every wait on one visual also means a slow page and a slow module read as the same event
 * rather than two unrelated glitches.
 *
 * The important behaviour is not the animation, it is that these render *instead of* an empty
 * state. A module that draws "No retreats yet" while its first snapshot is still in flight is
 * not being slow, it is briefly asserting something false, and it looks settled enough to be
 * believed. Anywhere a real emptiness and a pending load look alike, one of these belongs.
 *
 * Keyframes live in index.css so every loader on screen shares a clock.
 */

const RING_SIZES = { sm: 44, md: 92 } as const;
const MARK_SIZES = { sm: 24, md: 52 } as const;

/** The mark in its sweeping ring. The shared core of every loading state below. */
export function CampLoader({ size = 'md', className = '' }: {
  size?: keyof typeof RING_SIZES;
  className?: string;
}) {
  const ring = RING_SIZES[size];
  return (
    <div className={`relative mx-auto ${className}`} style={{ height: ring, width: ring }}>
      {/* One arc rather than a full stroke, so the rotation is legible at any angle. */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 cc-loading-sweep" aria-hidden="true">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#EFE9D9" strokeWidth="2.5" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke="#5E7A61" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray="44 97"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="cc-loading-breathe">
          <CampCommandMark size={MARK_SIZES[size]} disc={CC_CREAM} ink={CC_GREEN} decorative />
        </span>
      </div>
    </div>
  );
}

/** The mark with its caption. Used on its own inside cards and panels. */
export function LoadingBlock({
  label, sublabel, size = 'md', className = '',
}: {
  label: string;
  sublabel?: string;
  size?: keyof typeof RING_SIZES;
  className?: string;
}) {
  return (
    <div className={`text-center ${className}`} role="status" aria-live="polite">
      <CampLoader size={size} />
      <p className={`font-display font-semibold text-forest ${size === 'sm' ? 'mt-3 text-[14px]' : 'mt-5 text-[16px]'}`}>
        {label}
      </p>
      {sublabel && <p className="mt-1 text-[12.5px] text-ink-soft">{sublabel}</p>}
    </div>
  );
}

/**
 * A module panel waiting on its first snapshot.
 *
 * The skeleton rows are not decoration: they hold the height the real list is about to take,
 * so the page does not jump when the data lands.
 */
export function ModuleLoading({
  label, sublabel = 'Pulling the latest from your camp…', rows = 3,
}: {
  label: string;
  sublabel?: string;
  rows?: number;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-7 py-10 sm:py-14">
      <LoadingBlock label={label} sublabel={sublabel} className="mx-auto max-w-md" />

      {rows > 0 && (
        <div className="mx-auto mt-9 max-w-3xl space-y-2.5" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="cc-loading-shimmer rounded-card border border-border bg-white px-5 py-4"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              <div className="h-3 w-2/5 rounded bg-cream-dark" />
              <div className="mt-2.5 h-2.5 w-3/5 rounded bg-cream-dark/70" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The whole window, for waits that happen before there is any shell to sit inside: app boot,
 * accepting an invite, opening a guest portal link.
 */
export function FullScreenLoading({
  label = 'Loading', sublabel, fixed = true,
}: {
  label?: string;
  sublabel?: string;
  /** Fixed overlay for app boot; false for routes that already own the viewport. */
  fixed?: boolean;
}) {
  return (
    <div className={`${fixed ? 'fixed inset-0 z-50' : 'min-h-screen w-full'} bg-paper flex items-center justify-center p-6`}>
      <LoadingBlock label={label} sublabel={sublabel} />
    </div>
  );
}

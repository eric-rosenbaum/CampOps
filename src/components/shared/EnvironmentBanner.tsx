import { APP_ENV, IS_PRODUCTION, databaseRef } from '@/lib/env';

/**
 * A standing marker on anything that is not production.
 *
 * Two environments that look identical is how a camp gets shown stale data in a demo, or how a
 * bug gets filed against the wrong one. It names the database as well as the environment,
 * because "which data am I looking at" is the question that actually gets asked.
 *
 * Fixed and bottom-left rather than a top strip: the app shell is a full-height sidebar plus a
 * sticky topbar, and inserting a band above them would shift every page's layout for something
 * that only needs to be unmissable.
 */
export function EnvironmentBanner() {
  if (IS_PRODUCTION) return null;

  const staging = APP_ENV === 'staging';
  return (
    <div
      className={`fixed bottom-3 left-3 z-[60] pointer-events-none select-none rounded-btn px-3 py-1.5
        shadow-lg border font-mono text-[11px] font-semibold tracking-wide
        ${staging ? 'bg-amber text-white border-amber-text/40' : 'bg-forest text-cream border-white/20'}`}
      role="status"
      aria-live="off"
    >
      {staging ? 'STAGING' : 'DEV'} · {databaseRef()}
    </div>
  );
}

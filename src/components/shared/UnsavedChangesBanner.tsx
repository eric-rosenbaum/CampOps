import { AlertTriangle, RotateCw, X } from 'lucide-react';
import { useWriteFailures } from '@/lib/writeFailures';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/lib/language';

/**
 * Tells the user, plainly, that something they did was not saved.
 *
 * The failure this exists for is the one where the app said "done", the row appeared, and a
 * later refresh made it vanish. The optimistic row cannot be rolled back from here. The
 * transport layer that detected the failure doesn't know which store it belonged to · so the
 * honest remedy is to reload and show only what the database actually holds. That is the point:
 * the app should never go on quietly displaying work that was never saved.
 *
 * It does not auto-dismiss. A toast that fades is exactly how this bug stayed invisible.
 */
export function UnsavedChangesBanner() {
  const { t } = useTranslation('shell');
  const lang = useLang();
  const failures = useWriteFailures((s) => s.failures);
  const clear = useWriteFailures((s) => s.clear);

  if (failures.length === 0) return null;

  const targets = Array.from(new Set(failures.map((f) => f.table))).slice(0, 3);

  return (
    <div
      role="alert"
      className="fixed bottom-4 end-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-card
                 border border-red bg-red-bg p-4 shadow-lg"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-px h-4 w-4 flex-none text-red" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-red-text">
            {t('unsaved.title', { count: failures.length })}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-red-text/90">
            {t('unsaved.body')}
            {/* Table names, as the database spells them: they are for whoever gets the bug report. */}
            {targets.length > 0 && <> {t('unsaved.affected', { list: new Intl.ListFormat(lang, { type: 'unit' }).format(targets) })}</>}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-btn bg-red px-3 py-1.5 text-[12px]
                         font-bold text-white transition-colors hover:bg-red-text"
            >
              <RotateCw className="h-3.5 w-3.5" /> {t('unsaved.reload')}
            </button>
            <button
              onClick={clear}
              className="rounded-btn px-2 py-1.5 text-[12px] font-semibold text-red-text/80
                         transition-colors hover:text-red-text"
            >
              {t('unsaved.dismiss')}
            </button>
          </div>
        </div>
        <button onClick={clear} aria-label={t('unsaved.dismiss')} className="text-red-text/60 hover:text-red-text">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { useCampStore } from '@/store/campStore';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useModules } from '@/lib/modules';
import { loadReceipts, subscribeToReceipts } from '@/lib/receiptsDb';
import { loadAndApply } from '@/lib/syncGuard';
import { campLog } from '@/lib/campLog';

const PERIODIC_REFETCH_MS = 3 * 60 * 1000;

/**
 * Loads and subscribes Receipts, and only for a camp that has the module.
 *
 * Its own component rather than another block in CampDataLoader, which loads every module
 * whatever the switches say: Receipts is opt-in, sold to a handful of camps, and a camp without
 * it should not open a realtime channel on eight tables it will never read. Keyed on the switch
 * as well as the camp, so turning the module on starts the load without a refresh, and turning
 * it off tears the channel down.
 *
 * The /receipts route sits behind <ModuleRoute>, which redirects before <Gate> could wait on a
 * load this component never started, so a disabled module cannot leave anyone on a spinner.
 */
export function ReceiptsDataLoader() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const enabled = useModules().enabled('receipts');

  useEffect(() => {
    if (!campId || !enabled) return;
    const apply = useReceiptsStore.getState().apply;
    const unsubscribe = subscribeToReceipts(campId, apply);
    void loadAndApply('receipts', () => loadReceipts(campId), apply);

    // The same safety net every other module has: a socket that dropped silently is caught
    // within three minutes, and a tab back from a long sleep catches up straight away.
    let hiddenAt: number | null = null;
    const refetch = (why: string) => {
      campLog(`[CampOps] receipts refetch (${why})`);
      void loadAndApply('receipts', () => loadReceipts(campId), apply);
    };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refetch('periodic'); }, PERIODIC_REFETCH_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 2 * 60 * 1000) setTimeout(() => refetch('visible'), 3000);
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsubscribe();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      // Another camp's receipts must never flash up while the next camp loads.
      useReceiptsStore.getState().reset();
    };
  }, [campId, enabled]);

  return null;
}

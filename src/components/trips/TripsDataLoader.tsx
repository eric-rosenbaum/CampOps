import { useEffect } from 'react';
import { useCampStore } from '@/store/campStore';
import { useTripsStore } from '@/store/tripsStore';
import { useModules } from '@/lib/modules';
import { loadAndApply } from '@/lib/syncGuard';
import { loadTrips, subscribeToTrips, TRIPS_DOMAIN } from '@/lib/tripsDb';
import { campLog } from '@/lib/campLog';

/**
 * Loads and subscribes Town Trips — only for a camp that has the module.
 *
 * Its own component rather than another block in CampDataLoader, because CampDataLoader loads
 * every module for every camp. Town Trips is sold to particular camps; a camp without it should
 * not open a realtime channel on four tables it will never show, and a camp that is switched on
 * mid-session should start receiving trips without a reload. So this keys on the module switch
 * as well as the camp.
 *
 * Nothing waits on hydration when the module is off: /trips redirects before its <Gate> renders.
 * Rendered after CampDataLoader, whose effect resets hydration on a camp change — effects run in
 * sibling order, so that reset lands before this load marks `trips` hydrated, never after.
 */
export function TripsDataLoader() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const enabled = useModules().enabled('trips');
  const apply = useTripsStore((s) => s.apply);
  const reset = useTripsStore((s) => s.reset);

  useEffect(() => {
    reset();
    if (!campId || !enabled) return;

    const unsubscribe = subscribeToTrips(campId, apply);
    void loadAndApply(TRIPS_DOMAIN, () => loadTrips(campId), apply);

    // The same safety nets CampDataLoader keeps for every other module: a socket that dropped
    // silently, or a laptop that slept through the morning's seat claims.
    const PERIODIC_MS = 3 * 60 * 1000;
    const AFTER_HIDDEN_MS = 2 * 60 * 1000;
    let hiddenAt: number | null = null;
    const refetch = (why: string) => {
      campLog(`[Trips] refetch ${why}`);
      void loadAndApply(TRIPS_DOMAIN, () => loadTrips(campId), apply);
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refetch('periodic');
    }, PERIODIC_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt !== null && Date.now() - hiddenAt >= AFTER_HIDDEN_MS) refetch('visible');
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsubscribe();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [campId, enabled, apply, reset]);

  return null;
}

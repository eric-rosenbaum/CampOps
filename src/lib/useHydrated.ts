import { useSyncExternalStore } from 'react';
import { isHydrated, subscribeHydration } from './syncGuard';

/**
 * Has this module's data been loaded at least once since the camp was selected?
 *
 * Pair with `<ModuleLoading />`: while this is false the page should say it is loading rather
 * than render an empty state, because the two are indistinguishable on screen and only one of
 * them is true.
 *
 * Pass several domains for a page assembled from more than one load (Commissary reads six).
 * It reports ready only when every one of them has settled, so the page cannot half-appear.
 */
export function useHydrated(...domains: string[]): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    () => domains.every(isHydrated),
    () => false,
  );
}

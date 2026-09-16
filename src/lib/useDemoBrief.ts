import { useEffect, useState } from 'react';
import { loadDemoBrief } from '@/lib/demoGuideDb';
import type { DemoBrief } from '@/lib/demoSpotlights';

/**
 * The current demo camp's brief, fetched once per camp and shared by the sidebar, the status
 * banner and the guide. `undefined` while loading, `null` when there is none (every customer
 * camp, and a demo nobody wrote a guide for — which then shows no guide link at all rather than
 * a link to an empty page).
 */
const cache = new Map<string, Promise<DemoBrief | null>>();

export function invalidateDemoBrief(campId: string) {
  cache.delete(campId);
}

export function useDemoBrief(campId: string | null | undefined, isDemoCamp: boolean): DemoBrief | null | undefined {
  const [state, setState] = useState<{ campId: string | null; brief: DemoBrief | null | undefined }>({ campId: null, brief: undefined });

  useEffect(() => {
    if (!campId || !isDemoCamp) return;
    let alive = true;
    let p = cache.get(campId);
    if (!p) {
      p = loadDemoBrief(campId).catch(() => null);
      cache.set(campId, p);
    }
    p.then((brief) => { if (alive) setState({ campId, brief }); });
    return () => { alive = false; };
  }, [campId, isDemoCamp]);

  if (!campId || !isDemoCamp) return null;
  return state.campId === campId ? state.brief : undefined;
}

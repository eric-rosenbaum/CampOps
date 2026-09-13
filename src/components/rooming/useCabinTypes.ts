// The camp's cabin types, loaded once per camp.
//
// Lives apart from the component so the file that draws them exports only components -- Vite's
// fast refresh gives up on a module that mixes the two.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCampStore } from '@/store/campStore';
import type { CabinType } from '@/lib/types';

export function useCabinTypes(): [CabinType[], () => void] {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const [types, setTypes] = useState<CabinType[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!campId) return;
    let cancelled = false;
    void supabase.from('camp_cabin_types').select('*').eq('camp_id', campId).order('name')
      .then(({ data }) => {
        if (cancelled) return;
        setTypes((data ?? []).map((r) => ({
          id: r.id as string, campId: r.camp_id as string,
          name: r.name as string, description: (r.description as string) ?? '',
        })));
      });
    return () => { cancelled = true; };
  }, [campId, tick]);

  return [types, () => setTick((n) => n + 1)];
}

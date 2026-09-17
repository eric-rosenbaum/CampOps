import { useEffect, useState } from 'react';
import { useCampStore } from '@/store/campStore';
import { loadCampTimeZone } from '@/lib/foodRequestsDb';
import { todayInZone } from '@/lib/foodRequests';

/**
 * The camp's time zone and a clock that ticks once a minute, so "2h late" and "pickup is today"
 * are judged in camp time and change on screen while the kitchen leaves the tab open. The browser's
 * zone was used before, which is wrong for anyone opening the camp from somewhere else.
 */
export function useCampClock(tickMs = 60_000) {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!campId) return;
    let live = true;
    loadCampTimeZone(campId).then((tz) => { if (live) setTimeZone(tz); });
    return () => { live = false; };
  }, [campId]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return { timeZone, now, today: todayInZone(timeZone, now) };
}

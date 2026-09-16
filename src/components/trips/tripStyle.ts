/** Non-component helpers for the Town Trips screens (kept out of .tsx for fast refresh). */
import { useEffect, useMemo, useState } from 'react';
import { Car, Sun, Package, MapPin } from 'lucide-react';
import type { TripKind, SeatLeg } from '@/lib/tripTypes';
import { campNow, type LocalNow } from '@/lib/trips';
import { useTripsStore } from '@/store/tripsStore';

type Icon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

export interface KindStyle {
  label: string;
  icon: Icon;
  /** Solid accent: the card's edge and the filled seat dots. */
  color: string;
  /** Pale wash behind the kind tag. */
  wash: string;
  ink: string;
}

// Colours from the Field Guide palette (tailwind.config.js), one per kind so a week of trips can
// be read at a glance: green errands, blue days off, amber supplies.
export const KIND_STYLE: Record<TripKind, KindStyle> = {
  town_run: { label: 'Town run', icon: Car, color: '#3F5D45', wash: '#E6ECE2', ink: '#2F4A35' },
  day_off: { label: 'Day-off shuttle', icon: Sun, color: '#185fa5', wash: '#e6f1fb', ink: '#0c447c' },
  supply_run: { label: 'Supply run', icon: Package, color: '#B87A12', wash: '#FBF1DC', ink: '#8A5A0C' },
  other: { label: 'Other', icon: MapPin, color: '#6b3fa0', wash: '#f0ebfc', ink: '#3d1f6b' },
};

export const LEG_SHORT: Record<SeatLeg, string> = { both: 'There & back', there: 'There only', back: 'Back only' };

/**
 * The camp's clock, ticking every 30 seconds. Countdowns and "list closes" have to move on their
 * own; a board that says "leaves in 5 min" for half an hour is lying.
 */
export function useCampClock(): LocalNow {
  const tz = useTripsStore((s) => s.timezone);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the point: re-read the clock
  return useMemo(() => campNow(tz), [tz, tick]);
}

export const fieldClass =
  'rounded-btn border border-border bg-white px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint ' +
  'focus:border-sage focus:outline-none sm:py-2 sm:text-[13.5px]';
export const inputClass = `w-full ${fieldClass}`;
export const labelClass = 'mb-1 block text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-soft';

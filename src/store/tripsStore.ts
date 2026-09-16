/**
 * Town Trips state. Holds exactly what the database last said; nothing here is optimistic (see
 * the header of lib/tripsDb.ts for why seats cannot be).
 *
 * Selector rule (React 19 + zustand v5): subscribe to these raw slices and derive with useMemo.
 * A selector that builds an array — "my seats", "open errands" — returns a new object every
 * render and white-screens the app.
 */
import { create } from 'zustand';
import type { Trip, TripSeat, TripErrand, RideRequest, TripsData } from '@/lib/tripTypes';

interface TripsState {
  trips: Trip[];
  seats: TripSeat[];
  errands: TripErrand[];
  rideRequests: RideRequest[];
  timezone: string;
  apply: (d: TripsData) => void;
  reset: () => void;
}

const EMPTY = {
  trips: [] as Trip[],
  seats: [] as TripSeat[],
  errands: [] as TripErrand[],
  rideRequests: [] as RideRequest[],
  timezone: 'America/Toronto',
};

export const useTripsStore = create<TripsState>((set) => ({
  ...EMPTY,
  apply: (d) => set({
    trips: d.trips, seats: d.seats, errands: d.errands, rideRequests: d.rideRequests, timezone: d.timezone,
  }),
  // Changing camp must not leave the last camp's cars on the board while the new one loads.
  reset: () => set(EMPTY),
}));

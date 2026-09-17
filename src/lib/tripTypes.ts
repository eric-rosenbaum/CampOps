/**
 * Town Trips — shapes of the four tables, camelCased.
 *
 * Kept out of lib/types.ts (already the size of a novel) so the module can be read, and merged,
 * on its own. Times are camp-local wall-clock strings "HH:MM" and dates are camp-local
 * "YYYY-MM-DD", never instants — see the calendar-day note in lib/utils.
 */

export type TripKind = 'town_run' | 'day_off' | 'supply_run' | 'pickup' | 'other';
/**
 * Which way the car carries people. A round trip sells seats out, back, or both; an into-town-only
 * ride (`outbound`) sells only seats there; a pickup sells only seats back to camp.
 */
export type TripDirection = 'round_trip' | 'outbound' | 'pickup';
export type TripStatus = 'planned' | 'out' | 'back' | 'cancelled';
/** Which way a rider is in the car. A `both` rider uses a seat on each leg. */
export type SeatLeg = 'both' | 'there' | 'back';
export type SeatStatus = 'confirmed' | 'waitlist' | 'cancelled';
export type ErrandStatus = 'open' | 'bought' | 'unavailable' | 'cancelled';
export type RideRequestStatus = 'open' | 'matched' | 'cancelled';

export interface Trip {
  id: string;
  campId: string;
  kind: TripKind;
  direction: TripDirection;
  title: string;
  destination: string;
  departDate: string;
  departTime: string;
  returnDate: string | null;
  returnTime: string | null;
  driverUserId: string | null;
  driverName: string | null;
  vehicleAssetId: string | null;
  vehicleLabel: string | null;
  /** Passengers, not counting the driver. */
  passengerSeats: number;
  errandsCloseTime: string | null;
  notes: string | null;
  status: TripStatus;
  cancelledReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripSeat {
  id: string;
  campId: string;
  tripId: string;
  riderUserId: string | null;
  riderName: string;
  leg: SeatLeg;
  status: SeatStatus;
  /** Waitlist order. */
  queuedAt: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface TripErrand {
  id: string;
  campId: string;
  /** Null: on the shared list, nobody going yet. */
  tripId: string | null;
  requestedBy: string | null;
  requesterName: string;
  item: string;
  quantity: string | null;
  store: string | null;
  estCost: number | null;
  neededBy: string | null;
  forActivity: string | null;
  /** Other people who said "I need that too" instead of adding a duplicate. */
  alsoNeededBy: { userId: string; name: string }[];
  status: ErrandStatus;
  driverNote: string | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RideRequest {
  id: string;
  campId: string;
  requestedBy: string | null;
  requesterName: string;
  wantedDate: string;
  earliestTime: string | null;
  latestTime: string | null;
  destination: string | null;
  leg: SeatLeg;
  note: string | null;
  status: RideRequestStatus;
  matchedTripId: string | null;
  matchedSeatId: string | null;
  createdAt: string;
}

export interface TripsData {
  trips: Trip[];
  seats: TripSeat[];
  errands: TripErrand[];
  rideRequests: RideRequest[];
  /** camps.timezone. "Leaving in 40 min" is camp time, not the time on the phone of whoever looks. */
  timezone: string;
}

/** What create_trip / update_trip take. Snake-cased at the db layer. */
export interface TripDraft {
  kind: TripKind;
  direction: TripDirection;
  title: string;
  destination: string;
  departDate: string;
  departTime: string;
  returnDate: string | null;
  returnTime: string | null;
  driverUserId: string | null;
  driverName: string | null;
  vehicleAssetId: string | null;
  passengerSeats: number;
  errandsCloseTime: string | null;
  notes: string | null;
}

export interface ErrandDraft {
  item: string;
  quantity: string | null;
  store: string | null;
  estCost: number | null;
  neededBy: string | null;
  forActivity: string | null;
  tripId: string | null;
}

export interface RideRequestDraft {
  wantedDate: string;
  earliestTime: string | null;
  latestTime: string | null;
  destination: string | null;
  leg: SeatLeg;
  note: string | null;
}

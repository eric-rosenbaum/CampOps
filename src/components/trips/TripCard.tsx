import { ShoppingBasket, AlertTriangle, Check, Clock } from 'lucide-react';
import type { Trip, SeatStatus } from '@/lib/tripTypes';
import { tripTimeLabel, seatSummary, routeLabel, type SeatUsage } from '@/lib/trips';
import { SeatDots, Initials } from './tripUi';
import { kindStyle } from './tripStyle';

interface Props {
  trip: Trip;
  usage: SeatUsage;
  errandCount: number;
  /** My seat on this trip, if I have one. */
  mine: SeatStatus | null;
  iDrive: boolean;
  strandedCount: number;
  /** Departure time has passed (camp clock), whatever the driver has or hasn't marked. */
  departed: boolean;
  /** Past its return time and nobody has marked it back. */
  overdue?: boolean;
  onOpen: () => void;
  /** Column: the 7-day grid. Row: the phone stack and the leaving-next strip. */
  variant?: 'column' | 'row';
}

/**
 * One car on the board. Everything needed to decide "is this my ride" without opening it: when,
 * where, who drives, how full, how many errands are riding along.
 */
export function TripCard({ trip, usage, errandCount, mine, iDrive, strandedCount, departed, overdue = false, onOpen, variant = 'column' }: Props) {
  const k = kindStyle(trip.kind);
  const Icon = k.icon;
  const cancelled = trip.status === 'cancelled';
  const finished = trip.status === 'back' || (trip.status === 'planned' && departed);
  const row = variant === 'row';
  const route = routeLabel(trip);

  // "Full" is not the whole story when seats are counted per leg: a car full on the way out can
  // still bring somebody home, and that is exactly the seat a stranded rider is looking for.
  let seatsLine: string;
  let seatsTone = 'text-ink-soft';
  if (cancelled) seatsLine = 'Cancelled';
  // Hours after it was due, "Left" and "On the road" read as a car still out there.
  else if (overdue) { seatsLine = 'Should be back'; seatsTone = 'text-amber-text'; }
  else if (trip.status === 'out') seatsLine = 'On the road';
  else if (trip.status === 'back') seatsLine = 'Back';
  else if (departed) seatsLine = 'Left';
  else {
    const sum = seatSummary(trip, usage);
    seatsLine = sum.text;
    seatsTone = sum.tone === 'partial' ? 'text-amber-text' : sum.tone === 'full' ? 'text-red-text' : 'text-ink-soft';
  }

  const badge = !cancelled && (mine || iDrive) ? (
    <span
      className={`inline-flex flex-none items-center gap-0.5 rounded-pill px-1.5 text-[10px] font-bold leading-[16px]
        ${mine === 'waitlist' && !iDrive ? 'bg-amber-bg text-amber-text' : 'bg-green-muted-bg text-green-muted-text'}`}
    >
      {mine === 'waitlist' && !iDrive ? <Clock className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
      {iDrive ? 'Driving' : mine === 'waitlist' ? 'Waiting' : 'You’re in'}
    </span>
  ) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="trip-card"
      data-trip-id={trip.id}
      data-status={trip.status}
      aria-label={`${trip.title}${route ? `, ${route}` : ''}, ${tripTimeLabel(trip)}, ${seatsLine}`}
      className={`group relative block w-full overflow-hidden rounded-card border text-left transition-all
        ${cancelled || finished ? 'border-border bg-paper-raised' : 'border-border bg-white hover:-translate-y-px hover:border-sage hover:shadow-md'}`}
      style={{ borderLeftWidth: 4, borderLeftColor: cancelled ? '#C9BFA9' : k.color }}
    >
      <div className={`${row ? 'px-3.5 py-3' : 'px-2 py-2'} ${cancelled || finished ? 'opacity-70' : ''}`}>
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 flex-none" style={{ color: cancelled ? '#9AA98F' : k.color }} />
          <span className={`font-bold tabular-nums text-ink ${row ? 'text-[13.5px]' : 'text-[11.5px] leading-tight'}`}>
            {tripTimeLabel(trip)}
          </span>
          {row && badge && <span className="ml-auto">{badge}</span>}
        </div>

        <p className={`mt-1 font-semibold leading-snug text-forest ${cancelled ? 'line-through decoration-ink-faint' : ''}
                       ${row ? 'text-[15.5px]' : 'text-[13px]'}`}>
          {trip.title}
        </p>
        {(route || trip.direction === 'outbound') && (
          // Wraps in a narrow laptop column: "Town centre → ca…" hid the one word that says which way.
          <p className={`text-ink-soft ${row ? 'truncate text-[13px]' : 'text-[11.5px] leading-snug'}`} data-testid="trip-route">
            {route}
            {trip.direction === 'outbound' && <span className="font-semibold text-ink-soft">{route ? ' · ' : ''}one way</span>}
          </p>
        )}

        {!cancelled && (
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${row ? 'mt-2.5' : 'mt-1.5'}`}>
            <SeatDots usage={usage} color={k.color} size={row ? 13 : 9} direction={trip.direction} />
          </div>
        )}
        <p className={`mt-1 text-[11px] font-semibold ${seatsTone}`} data-testid="seats-line">{seatsLine}</p>

        {(errandCount > 0 || trip.driverName || strandedCount > 0 || (!row && badge)) && (
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${row ? 'mt-2.5 border-t border-border pt-2' : 'mt-1.5'}`}>
            {trip.driverName && (
              <span className="flex min-w-0 items-center gap-1.5" title={`Driver: ${trip.driverName}`}>
                <Initials name={trip.driverName} className={row ? '' : '!h-5 !w-5 !text-[9px]'} />
                {row && <span className="truncate text-[12.5px] text-ink-soft">{trip.driverName}{trip.vehicleLabel ? ` · ${trip.vehicleLabel}` : ''}</span>}
              </span>
            )}
            {errandCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-ink-soft" title={`${errandCount} errand${errandCount === 1 ? '' : 's'} on this trip`}>
                <ShoppingBasket className="h-3.5 w-3.5" />
                {errandCount}{row ? ` errand${errandCount === 1 ? '' : 's'}` : ''}
              </span>
            )}
            {strandedCount > 0 && !cancelled && (
              <span className="inline-flex items-center gap-0.5 text-[11.5px] font-bold text-red-text" title={`${strandedCount} riding there with no ride back`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {strandedCount}{row ? ' no ride back' : ''}
              </span>
            )}
            {!row && badge && <span className="ml-auto">{badge}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

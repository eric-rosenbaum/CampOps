import { ShoppingBasket, AlertTriangle, Check, Clock } from 'lucide-react';
import type { Trip, SeatStatus } from '@/lib/tripTypes';
import { tripTimeLabel, type SeatUsage } from '@/lib/trips';
import { SeatDots, Initials } from './tripUi';
import { KIND_STYLE } from './tripStyle';

interface Props {
  trip: Trip;
  usage: SeatUsage;
  errandCount: number;
  /** My seat on this trip, if I have one. */
  mine: SeatStatus | null;
  iDrive: boolean;
  strandedCount: number;
  onOpen: () => void;
  /** Column: the 7-day grid. Row: the phone stack and the leaving-next strip. */
  variant?: 'column' | 'row';
}

/**
 * One car on the board. Everything needed to decide "is this my ride" without opening it: when,
 * where, who drives, how full, how many errands are riding along.
 */
export function TripCard({ trip, usage, errandCount, mine, iDrive, strandedCount, onOpen, variant = 'column' }: Props) {
  const k = KIND_STYLE[trip.kind];
  const Icon = k.icon;
  const cancelled = trip.status === 'cancelled';
  const done = trip.status === 'back';
  const full = usage.freeBoth === 0 && usage.seats > 0;

  const seatsLine = cancelled
    ? 'Cancelled'
    : trip.status === 'out' ? 'On the road'
    : done ? 'Back'
    : usage.seats === 0 ? 'Driver only'
    : full ? (usage.freeThere > 0 || usage.freeBack > 0 ? 'One-way seats left' : 'Full')
    : `${usage.freeBoth} seat${usage.freeBoth === 1 ? '' : 's'} left`;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="trip-card"
      data-trip-id={trip.id}
      data-status={trip.status}
      aria-label={`${trip.title}${trip.destination ? ` to ${trip.destination}` : ''}, ${tripTimeLabel(trip)}, ${seatsLine}`}
      className={`group relative block w-full overflow-hidden rounded-card border text-left transition-all
        ${cancelled || done ? 'border-border bg-paper-raised opacity-70' : 'border-border bg-white hover:-translate-y-px hover:border-sage hover:shadow-md'}
        ${mine === 'confirmed' || iDrive ? 'ring-2 ring-offset-1' : ''}`}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: cancelled ? '#C9BFA9' : k.color,
        ...(mine === 'confirmed' || iDrive ? { ['--tw-ring-color' as string]: k.color } : {}),
      }}
    >
      <div className={variant === 'row' ? 'px-3.5 py-3' : 'px-2.5 py-2'}>
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 flex-none" style={{ color: cancelled ? '#9AA98F' : k.color }} />
          <span className={`font-mono font-medium tabular-nums text-ink ${variant === 'row' ? 'text-[13px]' : 'text-[11.5px]'}`}>
            {tripTimeLabel(trip)}
          </span>
          {(mine || iDrive) && !cancelled && (
            <span
              className={`ml-auto inline-flex flex-none items-center gap-0.5 rounded-pill px-1.5 text-[10px] font-bold leading-[16px]
                ${mine === 'waitlist' ? 'bg-amber-bg text-amber-text' : 'bg-green-muted-bg text-green-muted-text'}`}
            >
              {mine === 'waitlist' ? <Clock className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
              {iDrive ? 'Driving' : mine === 'waitlist' ? 'Waiting' : 'In'}
            </span>
          )}
        </div>

        <p className={`mt-1 font-semibold leading-snug text-forest ${cancelled ? 'line-through decoration-ink-faint' : ''}
                       ${variant === 'row' ? 'text-[15px]' : 'text-[13px]'}`}>
          {trip.title}
        </p>
        {trip.destination && (
          <p className={`truncate text-ink-soft ${variant === 'row' ? 'text-[13px]' : 'text-[11.5px]'}`}>→ {trip.destination}</p>
        )}

        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${variant === 'row' ? 'mt-2.5' : 'mt-2'}`}>
          {!cancelled && <SeatDots usage={usage} color={k.color} size={variant === 'row' ? 12 : 9} />}
          <span className={`text-[11px] font-semibold ${full && !cancelled && !done ? 'text-red-text' : 'text-ink-soft'}`}>
            {seatsLine}
          </span>
        </div>

        {(errandCount > 0 || trip.driverName || strandedCount > 0) && (
          <div className={`flex items-center gap-2 ${variant === 'row' ? 'mt-2.5' : 'mt-1.5'}`}>
            {trip.driverName && (
              <span className="flex min-w-0 items-center gap-1" title={`Driver: ${trip.driverName}`}>
                <Initials name={trip.driverName} className={variant === 'row' ? '' : '!h-5 !w-5 !text-[9px]'} />
                {variant === 'row' && <span className="truncate text-[12px] text-ink-soft">{trip.driverName}{trip.vehicleLabel ? ` · ${trip.vehicleLabel}` : ''}</span>}
              </span>
            )}
            {errandCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-ink-soft" title={`${errandCount} errand${errandCount === 1 ? '' : 's'} on this trip`}>
                <ShoppingBasket className="h-3.5 w-3.5" />
                {errandCount}
              </span>
            )}
            {strandedCount > 0 && !cancelled && (
              <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-bold text-red-text" title={`${strandedCount} riding there with no ride back`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {strandedCount}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

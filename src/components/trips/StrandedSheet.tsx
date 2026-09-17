import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Users } from 'lucide-react';
import type { Trip, TripSeat, RideRequest } from '@/lib/tripTypes';
import {
  strandedRiders, strandedHelp, seatUsage, dayLabel, shortDow, clock, routeLabel, compareTrips, type StrandedHelp,
} from '@/lib/trips';
import { dbOfferRideBack, dbRequestRideBack } from '@/lib/tripsDb';
import type { CampRole } from '@/store/campStore';
import { Sheet, Initials } from './tripUi';
import { kindStyle } from './tripStyle';

interface Props {
  date: string;
  trips: Trip[];
  seats: TripSeat[];
  requests: RideRequest[];
  userId: string;
  role: CampRole;
  onOpenTrip: (id: string) => void;
  onClose: () => void;
  notify: (text: string, tone?: 'ok' | 'warn' | 'error') => void;
}

/**
 * Everyone who rides into town on a day with no way back, and what can be done about each.
 *
 * The red "N no ride back" chip used to be a statement with nothing behind it. Here the rider gets
 * "Find me a ride back"; the person who planned or drives their ride in (or an admin) can put them
 * on a later trip that has a seat back, or ask for a ride on their behalf when nothing is going.
 */
export function StrandedSheet({ date, trips, seats, requests, userId, role, onOpenTrip, onClose, notify }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  // Live: as each rider is sorted out they drop off this list.
  const help = useMemo(() => {
    const onDay = strandedRiders(trips, seats).filter((r) => r.trip.departDate === date)
      .sort((a, b) => compareTrips(a.trip, b.trip) || a.seat.riderName.localeCompare(b.seat.riderName));
    return strandedHelp(onDay, trips, seats, requests, userId, role);
  }, [date, trips, seats, requests, userId, role]);

  async function offer(h: StrandedHelp, t: Trip) {
    setBusy(`offer-${h.rider.seat.id}-${t.id}`);
    const r = await dbOfferRideBack(h.rider.seat.id, t.id);
    setBusy(null);
    if (!r.ok || !r.data) { notify(r.error ?? 'That did not save.', 'error'); return; }
    const who = h.isMe ? 'You’re' : `${h.rider.seat.riderName} is`;
    const when = `${t.departDate === h.rider.trip.departDate ? '' : `${shortDow(t.departDate)} `}${clock(t.departTime)} ${t.title}`;
    if (r.data.already) notify(`${who} already on ${when}.`, 'warn');
    else if (r.data.status === 'confirmed') notify(`${who} riding back on ${when}.`);
    else notify(`${who} on the waitlist to ride back on ${when}. Moved up automatically if a seat frees.`, 'warn');
  }

  async function ask(h: StrandedHelp) {
    setBusy(`ask-${h.rider.seat.id}`);
    const r = await dbRequestRideBack(h.rider.seat.id);
    setBusy(null);
    if (!r.ok) { notify(r.error ?? 'That did not save.', 'error'); return; }
    notify(h.isMe
      ? 'Asked for a ride back. Drivers see it on the board and under Ride requests.'
      : `Asked for a ride back for ${h.rider.seat.riderName}. Drivers see it under Ride requests.`);
  }

  return (
    <Sheet title={`No ride back · ${dayLabel(date)}`} onClose={onClose} testId="stranded-sheet">
      {help.length === 0 ? (
        <p className="flex items-center gap-2 rounded-card bg-green-muted-bg px-3 py-4 text-[14px] font-semibold text-green-muted-text" data-testid="stranded-empty">
          <Check className="h-5 w-5" /> Everyone riding in that day has a way back.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-ink-soft">
            These people have a seat into town and none coming back that day or the next.
          </p>
          <ul className="space-y-3">
            {help.map((h) => {
              const { seat, trip } = h.rider;
              const primary = h.options[0];
              return (
                <li key={seat.id} className="rounded-card border border-border bg-white p-3" data-testid="stranded-rider" data-seat-id={seat.id}>
                  <div className="flex items-start gap-2.5">
                    <Initials name={seat.riderName} className="!h-8 !w-8 !text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-ink">{seat.riderName}{h.isMe && <span className="text-ink-soft"> (you)</span>}</p>
                      <button type="button" onClick={() => onOpenTrip(trip.id)} className="block max-w-full truncate text-left text-[12.5px] text-ink-soft underline decoration-dotted">
                        Rides in on the {clock(trip.departTime)} {trip.title}
                      </button>
                      {h.openRequest && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-pill bg-blue-bg px-2 py-0.5 text-[11px] font-bold text-blue-text" data-testid="stranded-asked">
                          <Users className="h-3 w-3" /> Asked for a ride back
                        </span>
                      )}
                    </div>
                  </div>

                  {h.isMe && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      data-testid="find-me-a-ride-back"
                      onClick={() => (primary ? offer(h, primary) : ask(h))}
                      className="mt-3 flex min-h-12 w-full items-center justify-center rounded-btn bg-forest px-3 text-[14px] font-bold text-paper hover:bg-forest-mid disabled:opacity-60"
                    >
                      {primary ? `Find me a ride back · ${clock(primary.departTime)} ${primary.title}` : h.openRequest ? 'Asked — waiting for a driver' : 'Find me a ride back'}
                    </button>
                  )}

                  {h.options.length > 0 ? (h.isMe && h.options.length === 1 ? null : (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                        {h.isMe ? 'Or another way back' : 'Trips with a seat back'}
                      </p>
                      <ul className="space-y-1.5">
                        {(h.isMe ? h.options.slice(1, 4) : h.options.slice(0, 3)).map((t) => {
                          const free = seatUsage(t, seats).freeBack;
                          const allowed = h.canOfferOn(t);
                          return (
                            <li key={t.id} className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: kindStyle(t.kind).color }} />
                              <button type="button" onClick={() => onOpenTrip(t.id)} className="min-w-0 flex-1 text-left">
                                <span className="block text-[13px] font-semibold leading-snug text-ink">
                                  {t.departDate === trip.departDate ? '' : `${shortDow(t.departDate)} `}{clock(t.departTime)} · {t.title}
                                </span>
                                <span className="block truncate text-[11.5px] text-ink-soft">{routeLabel(t) || 'Back to camp'} · {free} seat{free === 1 ? '' : 's'} back</span>
                              </button>
                              {allowed ? (
                                <button
                                  type="button"
                                  disabled={busy !== null}
                                  data-testid="offer-ride-back"
                                  onClick={() => offer(h, t)}
                                  className="min-h-11 flex-none rounded-btn bg-forest px-3 text-[12.5px] font-bold text-paper hover:bg-forest-mid disabled:opacity-60"
                                >
                                  {h.isMe ? 'Ride back' : 'Give a seat back'}
                                </button>
                              ) : (
                                <span className="max-w-[7rem] flex-none text-right text-[11px] leading-tight text-ink-faint">its driver can add them</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )) : (
                    <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-red-text">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                      Nothing with a free seat is coming back that day or the next.
                    </p>
                  )}

                  {!h.openRequest && h.canAsk && !(h.isMe && !primary) && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      data-testid="ask-ride-back"
                      onClick={() => ask(h)}
                      className="mt-2 min-h-11 w-full rounded-btn border border-border bg-white px-3 text-[13px] font-bold text-forest hover:border-sage disabled:opacity-60"
                    >
                      {h.isMe ? 'None of these — ask for a ride back' : `Ask for a ride back for ${seat.riderName.split(' ')[0]}`}
                    </button>
                  )}
                  {!h.isMe && !h.canAsk && h.options.every((t) => !h.canOfferOn(t)) && (
                    <p className="mt-2 text-[12px] text-ink-soft">Only {seat.riderName.split(' ')[0]}, the person who planned their ride in, its driver or an admin can sort this out.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}

import { useMemo, useState } from 'react';
import { Users, X, Car } from 'lucide-react';
import type { Trip, TripSeat, RideRequest, SeatLeg } from '@/lib/tripTypes';
import {
  seatUsage, claimOutcome, canManageTrip, dayLabel, clock, tripTimeLabel, compareTrips, LEG_LABELS, toMinutes, type LocalNow,
} from '@/lib/trips';
import { dbRequestRide, dbCancelRideRequest, dbMatchRideRequest } from '@/lib/tripsDb';
import type { CampRole } from '@/store/campStore';
import { KIND_STYLE, inputClass, labelClass } from './tripStyle';

interface Props {
  campId: string;
  trips: Trip[];
  seats: TripSeat[];
  requests: RideRequest[];
  now: LocalNow;
  userId: string;
  role: CampRole;
  onOpenTrip: (id: string) => void;
  notify: (text: string, tone?: 'ok' | 'warn' | 'error') => void;
}

const LEGS: SeatLeg[] = ['both', 'there', 'back'];

/** Does a trip fall inside somebody's window? No window means any time that day. */
function fitsWindow(t: Trip, r: RideRequest): boolean {
  if (t.departDate !== r.wantedDate || t.status !== 'planned') return false;
  const m = toMinutes(t.departTime);
  if (r.earliestTime && m < toMinutes(r.earliestTime) - 60) return false;
  if (r.latestTime && m > toMinutes(r.latestTime) + 60) return false;
  return true;
}

/**
 * "I need a ride Saturday" before anyone has planned one. Demand shows up on the board as a chip
 * on that day, so a driver deciding whether a run is worth it can see who would come; a driver
 * (or the person asking) matches the request to a trip, which claims the seat.
 */
export function RideRequestsTab({ campId, trips, seats, requests, now, userId, role, onOpenTrip, notify }: Props) {
  const canWrite = role !== 'viewer';
  const [date, setDate] = useState(now.date);
  const [earliest, setEarliest] = useState('');
  const [latest, setLatest] = useState('');
  const [destination, setDestination] = useState('');
  const [leg, setLeg] = useState<SeatLeg>('both');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const open = useMemo(
    () => requests.filter((r) => r.status === 'open' && r.wantedDate >= now.date)
      .sort((a, b) => a.wantedDate.localeCompare(b.wantedDate) || (a.earliestTime ?? '').localeCompare(b.earliestTime ?? '')),
    [requests, now.date],
  );
  const matched = useMemo(() => requests.filter((r) => r.status === 'matched' && r.wantedDate >= now.date), [requests, now.date]);
  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);

  async function submit() {
    if (!date) return;
    setSaving(true);
    const r = await dbRequestRide(campId, {
      wantedDate: date, earliestTime: earliest || null, latestTime: latest || null,
      destination: destination.trim() || null, leg, note: note.trim() || null,
    });
    setSaving(false);
    if (!r.ok) { notify(r.error ?? 'That did not save.', 'error'); return; }
    notify(`Asked for a ride on ${dayLabel(date)}. Drivers will see it on the board.`);
    setNote(''); setDestination(''); setEarliest(''); setLatest('');
  }

  async function act(key: string, fn: () => Promise<{ ok: boolean; error: string | null }>, ok: string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    notify(r.ok ? ok : (r.error ?? 'That did not save.'), r.ok ? 'ok' : 'error');
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-5 sm:px-7 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {canWrite && (
        <section className="h-fit rounded-card border border-border bg-white p-4" data-testid="ride-request-form">
          <h2 className="font-display text-[18px] font-bold text-forest">I need a ride</h2>
          <p className="mb-3 text-[12.5px] text-ink-soft">For a day off or an appointment. Drivers see it on the board before they plan.</p>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <label className="block"><span className={labelClass}>Day</span>
              <input type="date" value={date} min={now.date} onChange={(e) => setDate(e.target.value)} className={inputClass} required name="wantedDate" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={labelClass}>From</span>
                <input type="time" value={earliest} onChange={(e) => setEarliest(e.target.value)} className={inputClass} name="earliest" />
              </label>
              <label className="block"><span className={labelClass}>Until</span>
                <input type="time" value={latest} onChange={(e) => setLatest(e.target.value)} className={inputClass} name="latest" />
              </label>
            </div>
            <label className="block"><span className={labelClass}>Where to</span>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Town, the bus station" className={inputClass} name="rideDestination" />
            </label>
            <div role="radiogroup" aria-label="Which way" className="grid grid-cols-3 gap-1 rounded-btn bg-cream p-1">
              {LEGS.map((l) => (
                <button key={l} type="button" role="radio" aria-checked={leg === l} onClick={() => setLeg(l)}
                  className={`min-h-11 rounded-[4px] text-[12.5px] font-bold ${leg === l ? 'bg-white text-forest shadow-sm' : 'text-ink-soft'}`}>
                  {LEG_LABELS[l]}
                </button>
              ))}
            </div>
            <label className="block"><span className={labelClass}>Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Day off, back by curfew" className={inputClass} name="note" />
            </label>
            <button type="submit" disabled={saving} className="flex min-h-12 w-full items-center justify-center rounded-btn bg-forest text-[14px] font-bold text-paper hover:bg-forest-mid disabled:opacity-60">
              {saving ? 'Asking…' : 'Ask for a ride'}
            </button>
          </form>
        </section>
      )}

      <section className={canWrite ? '' : 'lg:col-span-2'}>
        <h2 className="mb-2 flex items-baseline gap-2 font-display text-[18px] font-bold text-forest">
          Open requests <span className="font-sans text-[13px] font-semibold text-ink-soft">{open.length}</span>
        </h2>
        {open.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-[13px] text-ink-soft">Nobody is waiting for a ride.</p>
        ) : (
          <ul className="space-y-2.5">
            {open.map((r) => {
              const mine = r.requestedBy === userId;
              const candidates = trips.filter((t) => fitsWindow(t, r)).sort(compareTrips);
              return (
                <li key={r.id} className="rounded-card border border-border bg-white p-3.5" data-testid="ride-request">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-blue-bg text-blue-text"><Users className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-ink">{r.requesterName}{mine ? ' (you)' : ''}</p>
                      <p className="text-[12.5px] text-ink-soft">
                        {dayLabel(r.wantedDate)}
                        {r.earliestTime || r.latestTime ? ` · ${r.earliestTime ? clock(r.earliestTime) : 'any time'}–${r.latestTime ? clock(r.latestTime) : 'late'}` : ' · any time'}
                        {` · ${LEG_LABELS[r.leg]}`}{r.destination ? ` · ${r.destination}` : ''}
                      </p>
                      {r.note && <p className="mt-0.5 text-[12.5px] italic text-ink-soft">“{r.note}”</p>}
                    </div>
                    {(mine || role === 'admin') && (
                      <button type="button" disabled={busy !== null} aria-label="Withdraw request"
                        onClick={() => act(`cancel-${r.id}`, () => dbCancelRideRequest(r.id), 'Request withdrawn.')}
                        className="grid h-11 w-11 flex-none place-items-center rounded-btn text-ink-faint hover:bg-red-bg hover:text-red-text">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {canWrite && (
                    <div className="mt-2.5 border-t border-border pt-2.5">
                      {candidates.length === 0 ? (
                        <p className="text-[12.5px] text-ink-soft">No trip that fits yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {candidates.map((t) => {
                            const allowed = mine || canManageTrip(t, userId, role);
                            const outcome = claimOutcome(seatUsage(t, seats), r.leg);
                            const s = KIND_STYLE[t.kind];
                            return (
                              <li key={t.id} className="flex items-center gap-2">
                                <button type="button" onClick={() => onOpenTrip(t.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
                                  <span className="truncate text-[13px] text-ink"><b className="font-semibold">{tripTimeLabel(t)}</b> · {t.title}</span>
                                </button>
                                {allowed ? (
                                  <button type="button" disabled={busy !== null}
                                    onClick={() => act(`match-${r.id}`, () => dbMatchRideRequest(r.id, t.id), outcome === 'confirmed' ? `${r.requesterName} is on ${t.title}.` : `${r.requesterName} is on the waitlist for ${t.title}.`)}
                                    className={`min-h-11 flex-none rounded-btn px-3 text-[12.5px] font-bold sm:min-h-9 ${outcome === 'confirmed' ? 'bg-forest text-paper hover:bg-forest-mid' : 'border border-amber/40 bg-amber-bg text-amber-text'}`}>
                                    {outcome === 'confirmed' ? (mine ? 'Take a seat' : 'Give a seat') : 'Waitlist'}
                                  </button>
                                ) : (
                                  <span className="text-[11.5px] text-ink-faint">driver can match</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {matched.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Matched</h3>
            <ul className="divide-y divide-border rounded-card border border-border bg-white">
              {matched.map((r) => {
                const t = r.matchedTripId ? tripById.get(r.matchedTripId) : undefined;
                return (
                  <li key={r.id} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px]">
                    <Car className="h-4 w-4 flex-none text-green-muted-text" />
                    <span className="min-w-0 flex-1 truncate">{r.requesterName} · {dayLabel(r.wantedDate)}</span>
                    {t && <button type="button" onClick={() => onOpenTrip(t.id)} className="flex-none truncate font-semibold text-forest underline decoration-dotted">{clock(t.departTime)} {t.title}</button>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

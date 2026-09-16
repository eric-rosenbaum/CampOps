import { useMemo, useState } from 'react';
import {
  X, CalendarDays, Car, UserRound, StickyNote, Check, Ban, Undo2, Plus, AlertTriangle, ShoppingBasket,
  Pencil, LogOut, Flag, Bell, Clock, ListChecks,
} from 'lucide-react';
import type { Trip, TripSeat, TripErrand, SeatLeg } from '@/lib/tripTypes';
import {
  seatUsage, claimOutcome, waitlistPosition, strandedRiders, returnOptions, canManageTrip, errandListOpen,
  leavingSoonSendAt, dayLabel, clock, tripTimeLabel, minutesUntil, shortDow, LEG_LABELS, type LocalNow,
} from '@/lib/trips';
import {
  dbClaimSeat, dbReleaseSeat, dbCancelTrip, dbSetTripStatus, dbSetErrandStatus, dbAttachErrands, dbDetachErrand,
} from '@/lib/tripsDb';
import type { CampRole } from '@/store/campStore';
import { KindTag, SeatDots, Initials } from './tripUi';
import { KIND_STYLE, inputClass } from './tripStyle';

type Notify = (text: string, tone?: 'ok' | 'warn' | 'error') => void;

interface Props {
  trip: Trip;
  trips: Trip[];
  seats: TripSeat[];
  errands: TripErrand[];
  userId: string;
  role: CampRole;
  now: LocalNow;
  onClose: () => void;
  onEdit: (trip: Trip) => void;
  onAddErrand: (tripId: string) => void;
  onOpenTrip: (id: string) => void;
  onAskForRide: () => void;
  notify: Notify;
}

const LEGS: SeatLeg[] = ['both', 'there', 'back'];

export function TripDrawer({ trip, trips, seats, errands, userId, role, now, onClose, onEdit, onAddErrand, onOpenTrip, onAskForRide, notify }: Props) {
  const [leg, setLeg] = useState<SeatLeg>('both');
  const [busy, setBusy] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const k = KIND_STYLE[trip.kind];
  const usage = useMemo(() => seatUsage(trip, seats), [trip, seats]);
  const canWrite = role !== 'viewer';
  const manage = canManageTrip(trip, userId, role);
  const iDrive = trip.driverUserId === userId;
  const mySeat = usage.confirmed.find((s) => s.riderUserId === userId) ?? usage.waitlist.find((s) => s.riderUserId === userId) ?? null;
  const planned = trip.status === 'planned';
  const departed = minutesUntil(now, trip.departDate, trip.departTime) <= 0;
  const listOpen = errandListOpen(trip, now);

  const stranded = useMemo(() => {
    const ids = new Set(strandedRiders(trips, seats).filter((r) => r.trip.id === trip.id).map((r) => r.seat.id));
    return ids;
  }, [trips, seats, trip.id]);
  const myReturnOptions = useMemo(
    () => (mySeat && stranded.has(mySeat.id) ? returnOptions(trip, trips, seats) : []),
    [mySeat, stranded, trip, trips, seats],
  );

  const tripErrands = useMemo(
    () => errands.filter((e) => e.tripId === trip.id && e.status !== 'cancelled')
      .sort((a, b) => (a.store ?? '').localeCompare(b.store ?? '') || a.createdAt.localeCompare(b.createdAt)),
    [errands, trip.id],
  );
  const openUnattached = useMemo(
    () => errands.filter((e) => e.status === 'open' && (!e.tripId || !trips.some((t) => t.id === e.tripId && (t.status === 'planned' || t.status === 'out')))),
    [errands, trips],
  );
  const reminder = leavingSoonSendAt(trip.departDate, trip.departTime);

  async function run<T>(key: string, fn: () => Promise<{ ok: boolean; error: string | null; data: T | null }>, onOk?: (d: T | null) => void) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) notify(r.error ?? 'That did not save.', 'error');
      else onOk?.(r.data);
    } finally {
      setBusy(null);
    }
  }

  const grab = (tripId: string, which: SeatLeg) => run(`claim-${tripId}-${which}`, () => dbClaimSeat(tripId, which), (d) => {
    if (!d) return;
    if (d.already) notify(d.status === 'waitlist' ? 'You’re already on the waitlist.' : 'You already have a seat.', 'warn');
    else if (d.status === 'confirmed') notify(`You’re in — ${LEG_LABELS[d.leg].toLowerCase()}.`);
    else notify('That seat just went. You’re on the waitlist and will be moved up automatically.', 'warn');
  });

  const riderGroups: { title: string; rows: TripSeat[]; waitlist?: boolean }[] = [
    { title: 'There & back', rows: usage.confirmed.filter((s) => s.leg === 'both') },
    { title: 'There only', rows: usage.confirmed.filter((s) => s.leg === 'there') },
    { title: 'Back only', rows: usage.confirmed.filter((s) => s.leg === 'back') },
    { title: 'Waitlist', rows: usage.waitlist, waitlist: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside
        role="dialog"
        aria-label={trip.title}
        data-testid="trip-drawer"
        data-trip-id={trip.id}
        className="flex h-full w-full flex-col bg-paper shadow-2xl sm:max-w-[460px]"
      >
        {/* A slim bar that stays put; the trip's details scroll with everything else, because on a
            phone a fixed 200px header left the seat button below the fold. */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-white px-5 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]" style={{ borderTop: `4px solid ${trip.status === 'cancelled' ? '#C9BFA9' : k.color}` }}>
          <KindTag kind={trip.kind} />
          {trip.status === 'cancelled' && <span className="rounded-tag bg-red-bg px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-red-text">Cancelled</span>}
          {trip.status === 'out' && <span className="rounded-tag bg-blue-bg px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-blue-text">On the road</span>}
          {trip.status === 'back' && <span className="rounded-tag bg-cream-dark px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-soft">Back</span>}
          <button onClick={onClose} aria-label="Close trip" className="-mr-2 ml-auto grid h-11 w-11 place-items-center rounded-btn text-ink-soft hover:bg-cream hover:text-forest">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="trip-drawer-body">
          <div className="border-b border-border bg-white px-5 pb-4 pt-2">
            <h2 className={`font-display text-[22px] font-bold leading-tight text-forest ${trip.status === 'cancelled' ? 'line-through decoration-ink-faint' : ''}`}>
              {trip.title}
            </h2>
            {trip.destination && <p className="text-[14px] text-ink-soft">→ {trip.destination}</p>}
            <ul className="mt-3 space-y-1.5 text-[13px] text-ink">
              <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 flex-none text-ink-faint" />{dayLabel(trip.departDate)} · {tripTimeLabel(trip)}</li>
              <li className="flex items-center gap-2">
                <UserRound className="h-4 w-4 flex-none text-ink-faint" />
                {trip.driverName ? <span>Driver: <b className="font-semibold">{trip.driverName}</b>{iDrive && ' (you)'}</span> : <span className="italic text-ink-soft">No driver yet</span>}
              </li>
              {trip.vehicleLabel && <li className="flex items-center gap-2"><Car className="h-4 w-4 flex-none text-ink-faint" />{trip.vehicleLabel}</li>}
              {trip.notes && <li className="flex items-start gap-2"><StickyNote className="mt-0.5 h-4 w-4 flex-none text-ink-faint" /><span className="whitespace-pre-wrap">{trip.notes}</span></li>}
              {trip.cancelledReason && <li className="flex items-start gap-2 text-red-text"><Ban className="mt-0.5 h-4 w-4 flex-none" />{trip.cancelledReason}</li>}
            </ul>
          </div>

          {/* Your seat */}
          {canWrite && planned && (
            <section className="border-b border-border bg-white px-5 py-4" data-testid="my-seat">
              {iDrive ? (
                <p className="flex items-center gap-2 text-[14px] font-semibold text-forest"><Car className="h-4 w-4" /> You’re driving this one.</p>
              ) : mySeat ? (
                <div>
                  <div className="flex items-center gap-3">
                    <span className={`grid h-10 w-10 flex-none place-items-center rounded-full ${mySeat.status === 'waitlist' ? 'bg-amber-bg text-amber-text' : 'bg-green-muted-bg text-green-muted-text'}`}>
                      {mySeat.status === 'waitlist' ? <Clock className="h-5 w-5" /> : <Check className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-forest" data-testid="my-seat-status">
                        {mySeat.status === 'waitlist'
                          ? `You’re #${waitlistPosition(usage, mySeat.id)} on the waitlist`
                          : 'You have a seat'}
                      </p>
                      <p className="text-[12.5px] text-ink-soft">{LEG_LABELS[mySeat.leg]}{mySeat.status === 'waitlist' ? ' · moved up automatically when a seat frees' : ''}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => run('leave', () => dbReleaseSeat(mySeat.id), () => notify(mySeat.status === 'waitlist' ? 'You left the waitlist.' : 'Seat released.'))}
                      className="min-h-11 rounded-btn border border-border bg-white px-3.5 text-[13px] font-bold text-forest hover:border-red hover:text-red-text disabled:opacity-50"
                    >
                      {mySeat.status === 'waitlist' ? 'Leave waitlist' : 'Leave seat'}
                    </button>
                  </div>
                  {stranded.has(mySeat.id) && (
                    <div className="mt-3 rounded-card border border-red/30 bg-red-bg p-3" data-testid="no-ride-back">
                      <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-red-text">
                        <AlertTriangle className="h-4 w-4" /> You have no ride back yet
                      </p>
                      {myReturnOptions.length === 0 ? (
                        <p className="mt-1 text-[12.5px] text-red-text">
                          No trip that day or the next has a seat back.{' '}
                          <button type="button" onClick={onAskForRide} className="font-bold underline">Ask for a ride back</button>
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {myReturnOptions.slice(0, 3).map((t) => (
                            <li key={t.id} className="flex items-center gap-2">
                              <button type="button" onClick={() => onOpenTrip(t.id)} className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-ink underline decoration-dotted">
                                {t.departDate === trip.departDate ? '' : `${shortDow(t.departDate)} `}{clock(t.departTime)} · {t.title}
                              </button>
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => grab(t.id, 'back')}
                                className="min-h-11 flex-none rounded-btn bg-forest px-3 text-[12.5px] font-bold text-paper hover:bg-forest-mid disabled:opacity-50"
                              >
                                Ride back
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ) : departed ? (
                <p className="text-[13.5px] text-ink-soft">This trip has already left.</p>
              ) : (
                <div>
                  <div role="radiogroup" aria-label="Which way" className="grid grid-cols-3 gap-1 rounded-btn bg-cream p-1">
                    {LEGS.map((l) => {
                      const outcome = claimOutcome(usage, l);
                      return (
                        <button
                          key={l}
                          type="button"
                          role="radio"
                          aria-checked={leg === l}
                          onClick={() => setLeg(l)}
                          className={`min-h-11 rounded-[4px] px-1 text-[12.5px] font-bold transition-colors
                            ${leg === l ? 'bg-white text-forest shadow-sm' : 'text-ink-soft hover:text-forest'}`}
                        >
                          {LEG_LABELS[l]}
                          <span className={`block text-[10.5px] font-semibold ${outcome === 'confirmed' ? 'text-green-muted-text' : 'text-amber-text'}`}>
                            {outcome === 'confirmed' ? 'seat free' : 'waitlist'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => grab(trip.id, leg)}
                    data-testid="grab-seat"
                    className={`mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-btn text-[15px] font-bold transition-colors disabled:opacity-60
                      ${claimOutcome(usage, leg) === 'confirmed' ? 'bg-forest text-paper hover:bg-forest-mid' : 'bg-amber-bg text-amber-text border border-amber/40 hover:bg-amber/20'}`}
                  >
                    {busy?.startsWith('claim') ? 'Saving…' : claimOutcome(usage, leg) === 'confirmed' ? 'Grab a seat' : 'Join the waitlist'}
                  </button>
                  {leg === 'there' && (
                    <p className="mt-2 text-[12px] text-amber-text">There only means you’ll need another ride back — you’ll be flagged until you have one.</p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Riders */}
          <section className="px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Riders</h3>
              <SeatDots usage={usage} color={k.color} size={11} showWaitlist={false} />
              <span className="ml-auto text-[12px] font-semibold text-ink-soft">
                {usage.seats === 0 ? 'Driver only' : `${usage.freeBoth} of ${usage.seats} free both ways`}
              </span>
            </div>
            {usage.confirmed.length + usage.waitlist.length === 0 ? (
              <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-[13px] text-ink-soft">Nobody yet.</p>
            ) : (
              <div className="space-y-3">
                {riderGroups.filter((g) => g.rows.length > 0).map((g) => (
                  <div key={g.title} data-testid={`riders-${g.waitlist ? 'waitlist' : g.rows[0].leg}`}>
                    <p className={`mb-1 text-[11.5px] font-bold ${g.waitlist ? 'text-amber-text' : 'text-forest'}`}>{g.title} · {g.rows.length}</p>
                    <ul className="divide-y divide-border rounded-card border border-border bg-white">
                      {g.rows.map((s, i) => (
                        <li key={s.id} className="flex min-h-11 items-center gap-2.5 px-3 py-1.5" data-testid="rider-row">
                          {g.waitlist && <span className="w-4 text-right font-mono text-[11px] text-amber-text">{i + 1}</span>}
                          <Initials name={s.riderName} />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                            {s.riderName}{s.riderUserId === userId && <span className="text-ink-soft"> (you)</span>}
                          </span>
                          {stranded.has(s.id) && (
                            <span className="inline-flex flex-none items-center gap-1 rounded-pill bg-red-bg px-2 py-0.5 text-[10.5px] font-bold text-red-text">
                              <AlertTriangle className="h-3 w-3" /> No ride back
                            </span>
                          )}
                          {manage && planned && s.riderUserId !== userId && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => run(`rm-${s.id}`, () => dbReleaseSeat(s.id), () => notify(`${s.riderName} removed.`))}
                              aria-label={`Remove ${s.riderName}`}
                              className="grid h-9 w-9 flex-none place-items-center rounded-btn text-ink-faint hover:bg-red-bg hover:text-red-text disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {planned && usage.confirmed.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <Bell className="h-3.5 w-3.5" />
                Riders get a “leaving soon” reminder {reminder.date === trip.departDate ? '' : 'the evening before '}at {clock(reminder.time)}.
              </p>
            )}
          </section>

          {/* Errands */}
          <section className="border-t border-border px-5 py-4" data-testid="trip-errands">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Errands · {tripErrands.length}</h3>
              {trip.errandsCloseTime && planned && (
                <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${listOpen ? 'text-amber-text' : 'text-ink-soft'}`}>
                  <ListChecks className="h-3.5 w-3.5" /> {listOpen ? `List closes ${clock(trip.errandsCloseTime)}` : 'List closed'}
                </span>
              )}
            </div>

            {tripErrands.length === 0 ? (
              <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-[13px] text-ink-soft">No errands on this trip.</p>
            ) : (
              <ul className="space-y-2">
                {tripErrands.map((e) => {
                  const done = e.status === 'bought' || e.status === 'unavailable';
                  const mineErrand = e.requestedBy === userId;
                  return (
                    <li
                      key={e.id}
                      data-testid="errand-row"
                      data-status={e.status}
                      className={`rounded-card border bg-white p-3 ${e.status === 'bought' ? 'border-green-muted-text/30' : e.status === 'unavailable' ? 'border-red/30' : 'border-border'}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full
                          ${e.status === 'bought' ? 'bg-green-muted-text text-paper' : e.status === 'unavailable' ? 'bg-red text-paper' : 'border-2 border-border'}`}>
                          {e.status === 'bought' && <Check className="h-3.5 w-3.5" />}
                          {e.status === 'unavailable' && <X className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[14.5px] font-semibold leading-snug text-ink ${e.status === 'bought' ? 'text-ink-soft' : ''}`}>
                            <span className={e.status === 'bought' ? 'line-through decoration-ink-faint' : ''}>{e.item}</span>
                            {e.quantity && <span className="font-normal text-ink-soft"> · {e.quantity}</span>}
                          </p>
                          <p className="text-[12px] text-ink-soft">
                            {[e.store, `for ${e.requesterName}${mineErrand ? ' (you)' : ''}`, e.forActivity, e.neededBy ? `needed ${shortDow(e.neededBy)}` : null].filter(Boolean).join(' · ')}
                          </p>
                          {e.driverNote && <p className="mt-0.5 text-[12px] italic text-ink-soft">“{e.driverNote}”</p>}
                          {e.status === 'unavailable' && <p className="text-[12px] font-bold text-red-text">Couldn’t get it</p>}
                        </div>
                      </div>
                      {manage && trip.status !== 'cancelled' && (
                        done ? (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => run(`undo-${e.id}`, () => dbSetErrandStatus(e.id, 'open'))}
                              className="inline-flex min-h-11 items-center gap-1 rounded-btn px-3 text-[12.5px] font-bold text-ink-soft hover:bg-cream hover:text-forest"
                            >
                              <Undo2 className="h-4 w-4" /> Undo
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2.5">
                            <input
                              value={notes[e.id] ?? ''}
                              onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                              placeholder="Note for them (optional)"
                              aria-label={`Note about ${e.item}`}
                              className={`${inputClass} mb-2`}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={busy !== null}
                                data-testid="errand-bought"
                                onClick={() => run(`bought-${e.id}`, () => dbSetErrandStatus(e.id, 'bought', notes[e.id] || null), () => notify(`Got it: ${e.item}`))}
                                className="flex min-h-12 items-center justify-center gap-1.5 rounded-btn bg-forest text-[14px] font-bold text-paper hover:bg-forest-mid disabled:opacity-50"
                              >
                                <Check className="h-5 w-5" /> Got it
                              </button>
                              <button
                                type="button"
                                disabled={busy !== null}
                                data-testid="errand-unavailable"
                                onClick={() => run(`na-${e.id}`, () => dbSetErrandStatus(e.id, 'unavailable', notes[e.id] || null), () => notify(`Marked unavailable: ${e.item}`, 'warn'))}
                                className="flex min-h-12 items-center justify-center gap-1.5 rounded-btn border border-border bg-white text-[14px] font-bold text-red-text hover:border-red disabled:opacity-50"
                              >
                                <Ban className="h-5 w-5" /> Couldn’t get
                              </button>
                            </div>
                          </div>
                        )
                      )}
                      {!manage && mineErrand && e.status === 'open' && planned && (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => run(`detach-${e.id}`, () => dbDetachErrand(e.id), () => notify('Moved back to the shopping list.'))}
                            className="min-h-11 rounded-btn px-3 text-[12.5px] font-bold text-ink-soft hover:bg-cream hover:text-forest"
                          >
                            Take off this trip
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {manage && (planned || trip.status === 'out') && openUnattached.length > 0 && (
              <div className="mt-3 rounded-card border border-border bg-white">
                <button
                  type="button"
                  onClick={() => { setAttachOpen((v) => !v); setPicked(openUnattached.map((e) => e.id)); }}
                  data-testid="attach-errands"
                  className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-[14px] font-bold text-forest"
                >
                  <ShoppingBasket className="h-5 w-5" />
                  Attach open errands ({openUnattached.length})
                  <span className="ml-auto text-[12px] font-semibold text-ink-soft">{attachOpen ? 'Hide' : 'Choose'}</span>
                </button>
                {attachOpen && (
                  <div className="border-t border-border px-3 pb-3">
                    <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                      {openUnattached.map((e) => (
                        <li key={e.id}>
                          <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                            <input
                              type="checkbox"
                              className="h-5 w-5 flex-none accent-[#1D3A2E]"
                              checked={picked.includes(e.id)}
                              onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-semibold text-ink">{e.item}{e.quantity ? ` · ${e.quantity}` : ''}</span>
                              <span className="block truncate text-[12px] text-ink-soft">{[e.store ?? 'Any store', e.requesterName, e.neededBy ? `needed ${shortDow(e.neededBy)}` : null].filter(Boolean).join(' · ')}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={busy !== null || picked.length === 0}
                      data-testid="attach-confirm"
                      onClick={() => run('attach', () => dbAttachErrands(trip.id, picked), (n) => { setAttachOpen(false); notify(`${n ?? picked.length} errand${(n ?? picked.length) === 1 ? '' : 's'} added to this trip.`); })}
                      className="mt-2 flex min-h-12 w-full items-center justify-center rounded-btn bg-forest text-[14px] font-bold text-paper hover:bg-forest-mid disabled:opacity-50"
                    >
                      Add {picked.length} to this trip
                    </button>
                  </div>
                )}
              </div>
            )}

            {canWrite && (manage ? planned || trip.status === 'out' : listOpen) && (
              <button
                type="button"
                onClick={() => onAddErrand(trip.id)}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-btn border border-dashed border-border text-[13px] font-bold text-ink-soft hover:border-sage hover:text-forest"
              >
                <Plus className="h-4 w-4" /> Add an errand to this trip
              </button>
            )}
          </section>
        </div>

        {/* Trip actions */}
        {manage && trip.status !== 'cancelled' && (
          <div className="flex-shrink-0 border-t border-border bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {confirmCancel ? (
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-ink">
                  Cancel this trip? {usage.confirmed.length + usage.waitlist.length > 0 ? `${usage.confirmed.length + usage.waitlist.length} rider${usage.confirmed.length + usage.waitlist.length === 1 ? '' : 's'} will be told, and ` : ''}errands go back on the shopping list.
                </p>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional) — e.g. van in the shop" className={inputClass} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmCancel(false)} className="min-h-11 flex-1 rounded-btn border border-border bg-white text-[13px] font-bold text-forest">Keep it</button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    data-testid="confirm-cancel-trip"
                    onClick={() => run('cancel', () => dbCancelTrip(trip.id, reason.trim() || null), () => { setConfirmCancel(false); notify('Trip cancelled. Riders have been told.'); })}
                    className="min-h-11 flex-1 rounded-btn bg-red text-[13px] font-bold text-paper hover:bg-red-text disabled:opacity-50"
                  >
                    Cancel trip
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {planned && (
                  <button type="button" onClick={() => onEdit(trip)} className="inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-border bg-white px-3 text-[13px] font-bold text-forest hover:border-sage">
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                )}
                {trip.status === 'planned' && (
                  <button type="button" disabled={busy !== null} onClick={() => run('out', () => dbSetTripStatus(trip.id, 'out'), () => notify('Marked as on the road.'))}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-border bg-white px-3 text-[13px] font-bold text-forest hover:border-sage disabled:opacity-50">
                    <LogOut className="h-4 w-4" /> Leaving now
                  </button>
                )}
                {trip.status === 'out' && (
                  <button type="button" disabled={busy !== null} onClick={() => run('back', () => dbSetTripStatus(trip.id, 'back'), () => notify('Welcome back.'))}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-btn bg-forest px-3 text-[13px] font-bold text-paper hover:bg-forest-mid disabled:opacity-50">
                    <Flag className="h-4 w-4" /> We’re back
                  </button>
                )}
                {trip.status === 'planned' && (
                  <button type="button" onClick={() => setConfirmCancel(true)} data-testid="cancel-trip"
                    className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-btn px-3 text-[13px] font-bold text-red-text hover:bg-red-bg">
                    <Ban className="h-4 w-4" /> Cancel trip
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

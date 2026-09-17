import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Trip, TripDraft, TripKind, TripDirection } from '@/lib/tripTypes';
import {
  KIND_PRESETS, applyPreset, addMinutesLocal, fromMinutes, toMinutes, daysBetween, leavingSoonNote, clock, dayLabel,
  DIRECTION_LABELS, DIRECTION_HINTS, type LocalNow,
} from '@/lib/trips';
import { dbCreateTrip, dbUpdateTrip } from '@/lib/tripsDb';
import type { CampAsset } from '@/lib/types';
import type { MemberWithProfile } from '@/store/campStore';
import { Sheet } from './tripUi';
import { kindStyle, inputClass, fieldClass, labelClass } from './tripStyle';

interface Props {
  campId: string;
  userId: string;
  now: LocalNow;
  /** Pre-filled day, from a column's "Plan a trip". */
  initialDate?: string | null;
  editing?: Trip | null;
  members: MemberWithProfile[];
  /** Only passed when the camp has Assets & Vehicles switched on. */
  vehicles: CampAsset[] | null;
  onClose: () => void;
  onSaved: (tripId: string) => void;
  notify: (text: string, tone?: 'ok' | 'warn' | 'error') => void;
}

const KINDS: TripKind[] = ['town_run', 'day_off', 'supply_run', 'pickup', 'other'];
const DIRECTIONS: TripDirection[] = ['round_trip', 'outbound', 'pickup'];

/** The next whole hour, at least 45 minutes away, so a trip planned now is not already leaving. */
function defaultDepart(now: LocalNow, date: string): string {
  if (date !== now.date) return '13:00';
  const next = Math.ceil((now.minutes + 45) / 60) * 60;
  return next >= 22 * 60 ? '13:00' : fromMinutes(next);
}

export function PlanTripSheet({ campId, userId, now, initialDate, editing, members, vehicles, onClose, onSaved, notify }: Props) {
  const startDate = editing?.departDate ?? initialDate ?? now.date;
  const startTime = editing?.departTime ?? defaultDepart(now, startDate);
  const startPreset = applyPreset(editing?.kind ?? 'town_run', startDate, startTime);

  const [kind, setKind] = useState<TripKind>(editing?.kind ?? 'town_run');
  const [direction, setDirection] = useState<TripDirection>(editing?.direction ?? startPreset.direction);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [destination, setDestination] = useState(editing?.destination ?? '');
  const [departDate, setDepartDate] = useState(startDate);
  const [departTime, setDepartTime] = useState(startTime);
  const [returnDate, setReturnDate] = useState(editing ? (editing.returnDate ?? '') : startPreset.returnDate);
  const [returnTime, setReturnTime] = useState(editing ? (editing.returnTime ?? '') : startPreset.returnTime);
  const [seats, setSeats] = useState(editing?.passengerSeats ?? startPreset.passengerSeats);
  const [closeTime, setCloseTime] = useState(editing ? (editing.errandsCloseTime ?? '') : (startPreset.errandsCloseTime ?? ''));
  const [driverId, setDriverId] = useState<string>(editing ? (editing.driverUserId ?? '') : userId);
  const [vehicleId, setVehicleId] = useState(editing?.vehicleAssetId ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once somebody has typed a return time or a list-close time, a preset must not overwrite it.
  const [touched, setTouched] = useState<{ ret: boolean; close: boolean; seats: boolean; title: boolean; direction: boolean }>(
    { ret: !!editing, close: !!editing, seats: !!editing, title: !!editing, direction: !!editing },
  );

  const drivers = useMemo(
    () => members.filter((m) => m.isActive && m.role !== 'viewer').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [members],
  );

  function pickKind(next: TripKind) {
    setKind(next);
    if (editing) return;
    const p = applyPreset(next, departDate, departTime);
    if (!touched.ret) { setReturnDate(p.returnDate); setReturnTime(p.returnTime); }
    if (!touched.seats) setSeats(p.passengerSeats);
    if (!touched.close) setCloseTime(p.errandsCloseTime ?? '');
    if (!touched.direction) setDirection(p.direction);
  }

  // Moving the departure carries the return and the list-close time with it, keeping the gaps,
  // unless they were set by hand.
  function moveDeparture(date: string, time: string) {
    const prevDate = departDate;
    const prevTime = departTime;
    setDepartDate(date);
    setDepartTime(time);
    if (!date || !time || !prevDate || !prevTime) return;
    const clockDelta = toMinutes(time) - toMinutes(prevTime);
    const delta = daysBetween(prevDate, date) * 1440 + clockDelta;
    if (!touched.ret && returnTime) {
      const r = addMinutesLocal(returnDate || prevDate, returnTime, delta);
      setReturnDate(r.date);
      setReturnTime(r.time);
    }
    if (!touched.close && closeTime) setCloseTime(fromMinutes(toMinutes(closeTime) + clockDelta));
  }

  async function save() {
    setError(null);
    const t = title.trim() || KIND_PRESETS[kind].label;
    if (!departDate || !departTime) { setError('Pick a departure date and time.'); return; }
    if (returnTime && (returnDate || departDate) === departDate && returnTime < departTime) {
      setError('The return is before the departure. Set the return date if it comes back the next day.'); return;
    }
    const driver = drivers.find((m) => m.userId === driverId) ?? null;
    const draft: TripDraft = {
      kind, direction, title: t, destination: destination.trim(), departDate, departTime,
      returnDate: returnTime ? (returnDate || departDate) : null, returnTime: returnTime || null,
      driverUserId: driver?.userId ?? null, driverName: driver?.fullName ?? null,
      vehicleAssetId: vehicles ? (vehicleId || null) : (editing?.vehicleAssetId ?? null),
      passengerSeats: seats, errandsCloseTime: closeTime || null, notes: notes.trim() || null,
    };
    setSaving(true);
    const r = editing ? await dbUpdateTrip(editing.id, draft) : await dbCreateTrip(campId, draft);
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    notify(editing ? 'Trip updated.' : `${t} planned for ${dayLabel(departDate)}.`);
    onSaved(editing ? editing.id : (r.data as string));
  }

  const reminder = departDate && departTime ? leavingSoonNote(departDate, departTime) : null;
  const pickup = direction === 'pickup';

  return (
    <Sheet
      title={editing ? 'Edit trip' : 'Plan a trip'}
      onClose={onClose}
      wide
      testId="plan-trip"
      footer={(
        <div className="flex items-center gap-2">
          {error && <p className="min-w-0 flex-1 text-[12.5px] font-semibold text-red-text" role="alert">{error}</p>}
          <button type="button" onClick={onClose} className="ml-auto min-h-11 rounded-btn border border-border bg-white px-4 text-[13.5px] font-bold text-forest">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="save-trip"
            className="min-h-11 rounded-btn bg-forest px-5 text-[13.5px] font-bold text-paper hover:bg-forest-mid disabled:opacity-60"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Plan trip'}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Kind of trip" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((kk) => {
            const s = kindStyle(kk);
            const I = s.icon;
            const on = kind === kk;
            return (
              <button
                key={kk}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickKind(kk)}
                className={`flex min-h-[72px] flex-col items-start rounded-card border p-2.5 text-left transition-colors ${on ? 'bg-white shadow-sm' : 'border-border bg-paper-raised hover:border-sage'}`}
                style={on ? { borderColor: s.color, boxShadow: `inset 0 0 0 1px ${s.color}` } : undefined}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: s.ink }}>
                  <I className="h-4 w-4" style={{ color: s.color }} /> {KIND_PRESETS[kk].label}
                </span>
                <span className="mt-0.5 text-[11px] leading-tight text-ink-soft">{KIND_PRESETS[kk].hint}</span>
              </button>
            );
          })}
        </div>

        <div>
          <span className={labelClass}>Which way</span>
          <div role="radiogroup" aria-label="Which way" className="grid grid-cols-1 gap-1 rounded-btn bg-cream p-1 sm:grid-cols-3">
            {DIRECTIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={direction === d}
                onClick={() => { setDirection(d); setTouched((t) => ({ ...t, direction: true })); }}
                className={`min-h-11 rounded-[4px] px-2 py-1.5 text-left text-[13px] font-bold sm:text-center ${direction === d ? 'bg-white text-forest shadow-sm' : 'text-ink-soft hover:text-forest'}`}
              >
                {DIRECTION_LABELS[d]}
                <span className="block text-[11px] font-normal leading-tight text-ink-soft">{DIRECTION_HINTS[d]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Name</span>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTouched((t) => ({ ...t, title: true })); }}
              placeholder={KIND_PRESETS[kind].label}
              className={inputClass}
              name="title"
            />
          </label>
          <label className="block">
            <span className={labelClass}>{pickup ? 'Picking up from' : 'Going to'}</span>
            <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Walmart, the bank, town" className={inputClass} name="destination" />
          </label>
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>{pickup ? 'Leaves camp' : 'Leaves'}</span>
            <input type="date" value={departDate} onChange={(e) => moveDeparture(e.target.value, departTime)} className={inputClass} name="departDate" required />
          </label>
          <label className="block">
            <span className={labelClass}>At</span>
            <input type="time" value={departTime} onChange={(e) => moveDeparture(departDate, e.target.value)} className={inputClass} name="departTime" required />
          </label>
          <label className="block">
            <span className={labelClass}>{direction === 'outbound' ? 'Car back (no riders)' : pickup ? 'Back at camp' : 'Back'}</span>
            <input type="date" value={returnDate} onChange={(e) => { setReturnDate(e.target.value); setTouched((t) => ({ ...t, ret: true })); }} className={inputClass} name="returnDate" />
          </label>
          <label className="block">
            <span className={labelClass}>Around</span>
            <input type="time" value={returnTime} onChange={(e) => { setReturnTime(e.target.value); setTouched((t) => ({ ...t, ret: true })); }} className={inputClass} name="returnTime" />
          </label>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={labelClass}>Passenger seats</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="One fewer seat" onClick={() => { setSeats((n) => Math.max(0, n - 1)); setTouched((t) => ({ ...t, seats: true })); }}
                className="grid h-11 w-11 place-items-center rounded-btn border border-border bg-white text-forest hover:border-sage">
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number" min={0} max={60} value={seats} name="seats" aria-label="Passenger seats"
                onChange={(e) => { setSeats(Math.max(0, Math.min(60, Number(e.target.value) || 0))); setTouched((t) => ({ ...t, seats: true })); }}
                className={`${fieldClass} w-16 text-center font-mono`}
              />
              <button type="button" aria-label="One more seat" onClick={() => { setSeats((n) => Math.min(60, n + 1)); setTouched((t) => ({ ...t, seats: true })); }}
                className="grid h-11 w-11 place-items-center rounded-btn border border-border bg-white text-forest hover:border-sage">
                <Plus className="h-4 w-4" />
              </button>
              <span className="text-[11.5px] text-ink-soft">not counting the driver</span>
            </div>
          </div>
          <label className="block">
            <span className={labelClass}>Errand list closes</span>
            <input type="time" value={closeTime} onChange={(e) => { setCloseTime(e.target.value); setTouched((t) => ({ ...t, close: true })); }} className={inputClass} name="closeTime" />
            <span className="mt-1 block text-[11.5px] text-ink-soft">{closeTime ? `After ${clock(closeTime)} only the driver adds errands.` : 'Leave empty to take errands until it leaves.'}</span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Driver</span>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass} name="driver">
              <option value="">No driver yet</option>
              {drivers.map((m) => <option key={m.userId} value={m.userId}>{m.fullName}{m.userId === userId ? ' (me)' : ''}</option>)}
            </select>
          </label>
          {vehicles && (
            <label className="block">
              <span className={labelClass}>Vehicle</span>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass} name="vehicle">
                <option value="">Personal car / not set</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.capacity ? ` · ${v.capacity} seats` : ''}</option>)}
              </select>
            </label>
          )}
        </div>

        <label className="block">
          <span className={labelClass}>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Where to meet, what to bring" className={inputClass} name="notes" />
        </label>

        {reminder && (
          <p className="rounded-card bg-cream px-3 py-2 text-[12px] text-ink-soft" data-testid="plan-reminder-note">
            Riders and the driver get {reminder}.
          </p>
        )}
      </div>
    </Sheet>
  );
}

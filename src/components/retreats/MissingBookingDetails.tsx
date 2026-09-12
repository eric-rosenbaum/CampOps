import { useRef, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { useRetreatStore } from '@/store/retreatStore';
import { dbUpdateRetreat } from '@/lib/retreatsDb';
import type { Retreat } from '@/lib/types';
import { fieldClass } from './retreatUi';

/**
 * The booking facts an agreement needs, and where each one lives.
 *
 * Keyed by the token that went unfilled, so a gap in the contract leads straight to the field
 * that closes it. Anything not listed here is either derived from the dates or belongs to the
 * camp rather than this booking, and gets an explanation instead of an input.
 */
const FIELDS: Record<string, {
  label: string;
  type: 'time' | 'date' | 'text' | 'tel' | 'email' | 'number';
  hint?: string;
  get: (r: Retreat) => string;
  set: (r: Retreat, v: string) => Retreat;
}> = {
  arrival_time: {
    label: 'Arrival time', type: 'time', hint: 'when they get in',
    get: (r) => r.arrivalTime?.slice(0, 5) ?? '',
    set: (r, v) => ({ ...r, arrivalTime: v || null }),
  },
  departure_time: {
    label: 'Departure time', type: 'time', hint: 'when they clear out',
    get: (r) => r.departureTime?.slice(0, 5) ?? '',
    set: (r, v) => ({ ...r, departureTime: v || null }),
  },
  deposit_due: {
    label: 'Deposit due', type: 'date',
    get: (r) => r.depositDue ?? '',
    set: (r, v) => ({ ...r, depositDue: v || null }),
  },
  coordinator_name: {
    label: 'Their contact', type: 'text',
    get: (r) => r.coordinatorName ?? '',
    set: (r, v) => ({ ...r, coordinatorName: v || null }),
  },
  coordinator_email: {
    label: 'Their email', type: 'email',
    get: (r) => r.coordinatorEmail ?? '',
    set: (r, v) => ({ ...r, coordinatorEmail: v || null }),
  },
  coordinator_phone: {
    label: 'Their phone', type: 'tel',
    get: (r) => r.coordinatorPhone ?? '',
    set: (r, v) => ({ ...r, coordinatorPhone: v || null }),
  },
  headcount: {
    label: 'How many people', type: 'number',
    get: (r) => (r.headcount ? String(r.headcount) : ''),
    set: (r, v) => ({ ...r, headcount: Number(v) || 0 }),
  },
};

/** For the tokens with no field of their own, say plainly where the answer comes from. */
const ELSEWHERE: Record<string, string> = {
  camp_address: 'Set your address under Camp Info · Profile.',
  rate: 'Set the rate above.',
  total: 'Set the rate, people and nights above.',
  deposit: 'Set the deposit above.',
  arrival_date: 'Set the dates under Edit details.',
  departure_date: 'Set the dates under Edit details.',
  nights: 'Comes from the dates — set them under Edit details.',
  cancellation_date: 'Counted back from arrival — set the dates under Edit details.',
  balance_due: 'Counted back from arrival — set the dates under Edit details.',
  coi_due: 'Counted back from arrival — set the dates under Edit details.',
  headcount_due: 'Counted back from arrival — set the dates under Edit details.',
};

/**
 * Fill the gaps without leaving the agreement.
 *
 * These were listed as raw {{tokens}} in a paragraph of warning text, which told the camp what was
 * wrong and then asked them to go somewhere else to fix it — so the likely outcome was sending the
 * contract with the braces still in it. Each gap is now the field that closes it, and filling it
 * writes to the booking, so the next agreement for this group is already right.
 */
export function MissingBookingDetails({ retreat, unfilled, onFilled }: {
  retreat: Retreat;
  unfilled: string[];
  onFilled: () => void;
}) {
  const updateRetreat = useRetreatStore((s) => s.updateRetreat);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const editable = unfilled.filter((t) => FIELDS[t]);
  const elsewhere = unfilled.filter((t) => !FIELDS[t]);
  if (editable.length === 0 && elsewhere.length === 0) return null;

  async function commit(token: string, value: string) {
    const f = FIELDS[token];
    if (!f) return;
    if (value.trim() === f.get(retreat).trim()) return;
    const next = f.set(retreat, value.trim());
    updateRetreat(next);
    setSavedKey(token);
    setTimeout(() => setSavedKey(null), 1800);
    // The agreement re-renders from the SERVER, so wait for the write to land before asking for
    // it. Without this the refetch overtakes the save and the gap is still reported as a gap.
    await dbUpdateRetreat(next);
    onFilled();
  }

  /**
   * Saves as they type, not when they leave the field.
   *
   * On blur alone, somebody who fills the last gap and goes straight for Send is in a race between
   * the save and the send -- and the thing being sent is a contract. Debounced so a phone number
   * is one write rather than eleven.
   */
  function edit(token: string, value: string) {
    setDraft((d) => ({ ...d, [token]: value }));
    clearTimeout(timers.current[token]);
    timers.current[token] = setTimeout(() => { void commit(token, value); }, 500);
  }

  const n = unfilled.length;
  return (
    <div className="mt-2.5 rounded-card border border-amber-text/25 bg-amber-bg/50 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-text" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-amber-text">
            {n === 1 ? 'One detail is' : `${n} details are`} missing from this booking
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-amber-text/85">
            Fill {n === 1 ? 'it' : 'them'} in here and the agreement updates as you type. Left
            blank, {n === 1 ? 'it prints' : 'they print'} as a placeholder in the document.
          </p>

          {editable.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {editable.map((token) => {
                const f = FIELDS[token];
                const value = draft[token] ?? f.get(retreat);
                return (
                  <label key={token} className="block">
                    <span className="mb-1 flex items-baseline gap-1.5">
                      <span className="text-[11.5px] font-semibold text-forest">{f.label}</span>
                      {f.hint && <span className="text-[11px] text-ink-faint">{f.hint}</span>}
                      {savedKey === token && (
                        <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium text-green-muted-text">
                          <Check className="h-3 w-3" /> saved
                        </span>
                      )}
                    </span>
                    <input
                      type={f.type}
                      value={value}
                      onChange={(e) => edit(token, e.target.value)}
                      onBlur={(e) => { void commit(token, e.target.value); }}
                      className={`${fieldClass} w-full`}
                    />
                  </label>
                );
              })}
            </div>
          )}

          {elsewhere.length > 0 && (
            <ul className="mt-2.5 space-y-0.5">
              {elsewhere.map((t) => (
                <li key={t} className="text-[11.5px] text-amber-text/85">
                  {ELSEWHERE[t] ?? `{{${t}}} — nothing in this booking fills it.`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

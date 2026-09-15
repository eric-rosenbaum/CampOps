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
 *
 * `tokens` is every gap this document has had; `unfilled` is the ones still open. The fields used
 * to be driven off `unfilled` alone, so a box vanished the instant you finished typing in it —
 * no confirmation that the right thing had been saved, and the boxes below jumping up a row each
 * time. A filled one stays, with a tick.
 */
export function MissingBookingDetails({ retreat, tokens, unfilled, onFilled }: {
  retreat: Retreat;
  /** Every gap seen so far, in the order it appeared. */
  tokens: string[];
  /** The subset still missing. */
  unfilled: string[];
  onFilled: () => void;
}) {
  const updateRetreat = useRetreatStore((s) => s.updateRetreat);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const open = new Set(unfilled);
  const editable = tokens.filter((t) => FIELDS[t]);
  // Only the ones we cannot offer a field for, and only while they are still open — a resolved
  // one has nothing left to say.
  const elsewhere = tokens.filter((t) => !FIELDS[t] && open.has(t));
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
  const done = n === 0;
  return (
    <div className={`mb-2.5 rounded-card border px-4 py-3.5 ${
      done ? 'border-green-muted-text/25 bg-green-muted-bg/50' : 'border-amber-text/25 bg-amber-bg/50'}`}>
      <div className="flex items-start gap-2.5">
        {done
          ? <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-muted-text" />
          : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-text" />}
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold ${done ? 'text-green-muted-text' : 'text-amber-text'}`}>
            {done
              ? 'Every gap in this agreement is filled'
              : `${n === 1 ? 'One detail is' : `${n} details are`} missing from this booking`}
          </p>
          <p className={`mt-0.5 text-[12px] leading-relaxed ${done ? 'text-green-muted-text/85' : 'text-amber-text/85'}`}>
            {done
              ? 'These are saved on the booking, so the next version starts from them. Edit any of them here.'
              : `Fill ${n === 1 ? 'it' : 'them'} in here and the document updates as you type. Left blank, ${n === 1 ? 'it prints' : 'they print'} as a ruled blank in the contract.`}
          </p>

          {editable.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {editable.map((token) => {
                const f = FIELDS[token];
                const value = draft[token] ?? f.get(retreat);
                const stillOpen = open.has(token);
                return (
                  <label key={token} className="block">
                    <span className="mb-1 flex items-baseline gap-1.5">
                      <span className="text-[11.5px] font-semibold text-forest">{f.label}</span>
                      {f.hint && <span className="text-[11px] text-ink-faint">{f.hint}</span>}
                      {savedKey === token ? (
                        <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium text-green-muted-text">
                          <Check className="h-3 w-3" /> saved
                        </span>
                      ) : !stillOpen ? (
                        <Check className="ml-auto h-3.5 w-3.5 text-green-muted-text" />
                      ) : null}
                    </span>
                    <input
                      type={f.type}
                      value={value}
                      onChange={(e) => edit(token, e.target.value)}
                      onBlur={(e) => { void commit(token, e.target.value); }}
                      className={`${fieldClass} w-full ${stillOpen ? '' : 'border-green-muted-text/40 bg-white'}`}
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

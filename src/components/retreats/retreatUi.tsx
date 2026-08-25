/* eslint-disable react-refresh/only-export-components -- shared Retreats UI kit: pure format
   helpers are deliberately colocated with small display atoms so every tab imports one module;
   the rule this disables only affects dev fast-refresh, not correctness or the build. */
// Shared UI atoms + formatters for the Retreats module. Import these from every tab so
// status colors, badges, the 5-phase tracker, and date/money formatting stay consistent.
import type { Retreat, RetreatStatus, RetreatPricingModel } from '@/lib/types';
import type { PhaseState, RetreatTab } from '@/store/retreatStore';

export const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
export const labelClass = 'block text-[11px] font-semibold uppercase tracking-widest text-ink-soft mb-1';

// ─── Money & dates ────────────────────────────────────────────────────────────
export function money(n: number | null | undefined): string {
  if (n == null) return '-';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
export function fmtDate(d: string | null): string {
  if (!d) return '-';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function fmtDateFull(d: string | null): string {
  if (!d) return '-';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtRange(a: string, b: string): string {
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
export function nights(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000));
}
export function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(`${d}T00:00:00`).getTime() - Date.now()) / 86_400_000);
}

// ─── Status ───────────────────────────────────────────────────────────────────
export const STATUS_LABELS: Record<RetreatStatus, string> = {
  inquiry: 'Inquiry', confirmed: 'Confirmed', ready: 'Ready to go', active: 'Active now', complete: 'Complete', cancelled: 'Cancelled',
};
export const GROUP_TYPE_LABELS: Record<string, string> = {
  synagogue: 'Synagogue / Jewish org', corporate: 'Corporate / professional', youth: 'Youth organization',
  alumni: 'Alumni organization', family: 'Family camp', school: 'School / educational', other: 'Other',
};
export const GROUP_TYPE_OPTIONS = Object.entries(GROUP_TYPE_LABELS);

// ─── Pricing ──────────────────────────────────────────────────────────────────
export const PRICING_MODEL_LABELS: Record<RetreatPricingModel, string> = {
  per_person_night: 'Per person / night',
  per_cabin_night: 'Per cabin / night',
  flat: 'Flat facility fee',
};
export const PRICING_MODEL_OPTIONS = Object.entries(PRICING_MODEL_LABELS) as [RetreatPricingModel, string][];

/** The active rate amount for a retreat's pricing model (rate/person/night, rate/cabin/night, or flat total). */
export function pricingRate(r: Retreat): number | null {
  return r.pricingModel === 'per_person_night' ? r.ratePerPersonNight : r.flatRate;
}

/** Human summary of how a group is billed, e.g. "$85/person/night" or "$8,000 flat". */
export function rateSummary(r: Retreat): string {
  const v = pricingRate(r);
  if (v == null) return '-';
  if (r.pricingModel === 'per_person_night') return `${money(v)}/person/night`;
  if (r.pricingModel === 'per_cabin_night') return `${money(v)}/cabin/night`;
  return `${money(v)} flat`;
}

/**
 * Estimated total revenue from the rate card (used before real charges exist).
 * per_cabin_night needs a cabin count, pass how many spaces are assigned; 0 → 0 until assigned.
 */
export function estimateRevenue(r: Retreat, cabinCount: number): number {
  const nightCount = nights(r.arrivalDate, r.departureDate);
  if (r.pricingModel === 'flat') return r.flatRate ?? 0;
  if (r.pricingModel === 'per_cabin_night') return (r.flatRate ?? 0) * cabinCount * nightCount;
  return (r.ratePerPersonNight ?? 0) * r.headcount * nightCount;
}

export type BadgeTone = 'ok' | 'warn' | 'alert' | 'neutral' | 'blue' | 'purple' | 'sage';
const BADGE_CLASS: Record<BadgeTone, string> = {
  ok: 'bg-green-muted-bg text-green-muted-text',
  warn: 'bg-amber-bg text-amber-text',
  alert: 'bg-red-bg text-red',
  neutral: 'bg-cream-dark text-ink',
  blue: 'bg-blue-bg text-blue-text',
  purple: 'bg-purple-bg text-purple-text',
  sage: 'bg-sage-pale text-forest',
};
export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-tag text-[10px] font-semibold uppercase tracking-wide ${BADGE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: RetreatStatus }) {
  const tone: BadgeTone = status === 'active' ? 'sage' : status === 'ready' ? 'ok'
    : status === 'confirmed' || status === 'inquiry' ? 'blue' : status === 'cancelled' ? 'alert' : 'neutral';
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

/** The left-border accent color for a retreat card by status. */
export function statusAccent(status: RetreatStatus): string {
  return status === 'active' ? 'border-l-sage'
    : status === 'ready' || status === 'confirmed' || status === 'inquiry' ? 'border-l-blue'
    : status === 'cancelled' ? 'border-l-red' : 'border-l-cream-dark';
}

// ─── Booking progress tracker ─────────────────────────────────────────────────
// Ordered the way a booking actually moves: sign, take money, lock the numbers, place the
// group, feed them, collect the paperwork, bill the balance.
export const PHASE_KEYS = ['contract', 'deposit', 'headcount', 'housing', 'menu', 'coi', 'finalInvoice'] as const;
export const PHASE_LABELS: Record<(typeof PHASE_KEYS)[number], string> = {
  contract: 'Contract', deposit: 'Deposit', headcount: 'Headcount', housing: 'Housing',
  menu: 'Menu', coi: 'COI', finalInvoice: 'Final invoice',
};

const PHASE_STATE_LABELS: Record<PhaseState, string> = {
  done: 'completed', active: 'in progress', locked: 'not started',
};

/** Which tab actually lets you finish a step. */
export const PHASE_TAB: Record<(typeof PHASE_KEYS)[number], RetreatTab> = {
  contract: 'documents',
  deposit: 'retreatCosts',
  headcount: 'portal',
  housing: 'housing',
  menu: 'menu',
  coi: 'documents',
  finalInvoice: 'retreatCosts',
};

/**
 * What is actually left to do, per step and per state.
 *
 * Written because a green circle is not self-explanatory. Housing is the case that prompted
 * this: assignments can be complete while the plan is still unlocked, and nobody guesses that
 * "Lock housing" is the thing standing between them and a tick.
 */
export const PHASE_HINTS: Record<(typeof PHASE_KEYS)[number], Record<PhaseState, string>> = {
  contract: {
    locked: 'Upload the retreat agreement so the group can sign it in their portal.',
    active: 'The agreement is uploaded and waiting on the group to sign it.',
    done: 'Signed and on file.',
  },
  deposit: {
    locked: 'Raise a deposit invoice, or record the deposit here once it arrives.',
    active: 'Part of the deposit is in. Log the rest to secure the dates.',
    done: 'Deposit received in full.',
  },
  headcount: {
    locked: 'Set a headcount cutoff so the group knows when to confirm their numbers.',
    active: 'Waiting for the group to confirm their final headcount in the portal.',
    done: 'Final headcount confirmed by the group.',
  },
  housing: {
    locked: 'Nobody is in a room yet. Add the guest list, then place people.',
    active: 'Assignments are being built. The Housing tab says whether the group has marked theirs complete. Use "Lock housing" to finalise the plan and tick this off.',
    done: 'Housing is locked and final.',
  },
  menu: {
    locked: 'Plan the menu in Commissary, then publish it to the portal.',
    active: 'Dishes are planned but the menu is not published to the portal yet.',
    done: 'Menu published to the guest portal.',
  },
  coi: {
    locked: 'No certificate of insurance yet. The group can upload it in their portal.',
    active: 'A certificate is attached and waiting to be accepted.',
    done: 'Certificate of insurance received.',
  },
  finalInvoice: {
    locked: 'Send the balance invoice when you are ready to bill the stay.',
    active: 'The balance invoice is out. This ticks off once it is paid in full.',
    done: 'Paid in full.',
  },
};

function PhaseDot({ state }: { state: PhaseState }) {
  const cls = state === 'done' ? 'bg-sage text-white border-sage'
    : state === 'active' ? 'bg-amber text-white border-amber'
    : 'bg-white text-ink-faint border-border';
  return (
    <div className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center border text-[11px] font-bold leading-none transition-transform group-hover:scale-110 ${cls}`}>
      {state === 'done' ? '✓' : state === 'active' ? '→' : ''}
    </div>
  );
}

export function PhaseTracker({
  progress, className = '', onOpen,
}: {
  progress: Record<(typeof PHASE_KEYS)[number], PhaseState>;
  className?: string;
  /** Given a tab, take the user to it. Omit to render the tracker read-only. */
  onOpen?: (tab: RetreatTab) => void;
}) {
  return (
    <div className={`grid grid-cols-4 sm:grid-cols-7 gap-y-3 gap-x-2 ${className}`}>
      {PHASE_KEYS.map((k) => {
        const state = progress[k];
        const hint = PHASE_HINTS[k][state];
        const body = (
          <>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-faint mb-1">{PHASE_LABELS[k]}</p>
            <PhaseDot state={state} />
            <span className="sr-only">{PHASE_STATE_LABELS[state]}. {hint}</span>
          </>
        );
        // The native title attribute is deliberate: it survives the card's overflow clipping,
        // works on keyboard focus, and needs no portal.
        const tip = `${PHASE_LABELS[k]} · ${PHASE_STATE_LABELS[state]}\n${hint}`;
        return onOpen ? (
          <button
            key={k}
            type="button"
            title={tip}
            onClick={(e) => { e.stopPropagation(); onOpen(PHASE_TAB[k]); }}
            className="group text-center rounded-btn py-1 hover:bg-cream-dark/50 transition-colors"
          >
            {body}
          </button>
        ) : (
          <div key={k} className="group text-center" title={tip}>{body}</div>
        );
      })}
    </div>
  );
}

export const ALLERGENS = ['Gluten', 'Dairy', 'Egg', 'Peanut', 'Tree nut', 'Fish', 'Shellfish', 'Soy', 'Sesame'];
export const MEAL_PERIODS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MEAL_PERIOD_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

/** Stars string for a 0–5 score (e.g. 4.6 → "★★★★½"). */
export function stars(score: number | null | undefined): string {
  if (score == null) return '-';
  const full = Math.floor(score);
  const half = score - full >= 0.25 && score - full < 0.75;
  const rounded = score - full >= 0.75 ? full + 1 : full;
  return '★'.repeat(half ? full : rounded) + (half ? '½' : '') + '☆'.repeat(5 - (half ? full + 1 : rounded));
}

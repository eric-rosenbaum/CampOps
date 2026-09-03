// Extras the group can add themselves.
//
// The honest bit is the price. A "per person, per night" rate is meaningless on its own, so each
// row shows the arithmetic — 48 people × 2 nights × $6 — against the group's real numbers, and
// says plainly when a number is still provisional. A toggle that silently adds an unknown amount
// to an invoice is how a camp loses a customer's trust in one click.
import { useEffect, useState } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { supabasePublic, cardClass } from '@/pages/portal/portalShared';
import { ADDON_UNIT_LABELS, type AddonUnit } from '@/lib/types';
import { money } from '@/components/retreats/retreatUi';

interface PortalAddon {
  id: string;
  name: string;
  description: string | null;
  unit: AddonUnit;
  rate: number;
  requested: boolean;
}

interface Props {
  token: string;
  /** The group's confirmed headcount if they have given one, else their estimate. */
  headcount?: number | null;
  /** Nights in the stay. Zero or undefined while the dates are still being agreed. */
  nights?: number | null;
  /** Called after a change lands, so the page can refresh the balance. */
  onChanged?: () => void;
}

/** What one of these will actually cost, and whether we can say yet. */
function priceFor(a: PortalAddon, people: number, nights: number): { total: number | null; how: string } {
  switch (a.unit) {
    case 'per_person':
      return people > 0
        ? { total: a.rate * people, how: `${people} people × ${money(a.rate)}` }
        : { total: null, how: `${money(a.rate)} per person` };
    case 'per_night':
      return nights > 0
        ? { total: a.rate * nights, how: `${nights} ${nights === 1 ? 'night' : 'nights'} × ${money(a.rate)}` }
        : { total: null, how: `${money(a.rate)} per night` };
    case 'per_person_night':
      return people > 0 && nights > 0
        ? {
          total: a.rate * people * nights,
          how: `${people} people × ${nights} ${nights === 1 ? 'night' : 'nights'} × ${money(a.rate)}`,
        }
        : { total: null, how: `${money(a.rate)} per person, per night` };
    case 'per_unit':
      return { total: a.rate, how: `${money(a.rate)} each` };
    default:
      return { total: a.rate, how: 'Flat fee' };
  }
}

export function AddonsSection({ token, headcount, nights, onChanged }: Props) {
  const [addons, setAddons] = useState<PortalAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people = headcount ?? 0;
  const nightCount = nights ?? 0;

  // Guarded async continuation: setState in the effect body itself cascades renders, and the
  // guard stops a slow answer landing after the section has gone.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabasePublic.rpc('portal_addons', { p_token: token });
      if (!live) return;
      setAddons((data as PortalAddon[] | null) ?? []);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [token]);

  async function toggle(a: PortalAddon) {
    setBusyId(a.id);
    setError(null);
    const { error: err } = await supabasePublic.rpc('portal_request_addon', {
      p_token: token, p_addon_id: a.id, p_qty: 1, p_wanted: !a.requested,
    });
    if (err) {
      setError(err.message || 'That could not be saved. Please try again.');
      setBusyId(null);
      return;
    }
    const { data } = await supabasePublic.rpc('portal_addons', { p_token: token });
    setAddons((data as PortalAddon[] | null) ?? []);
    setBusyId(null);
    onChanged?.();
  }

  // A camp with no catalogue gets no empty section, not an empty box.
  if (loading || addons.length === 0) return null;

  const provisional = people === 0 || nightCount === 0;

  return (
    <section id="addons" className="scroll-mt-20">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-sage-pale text-forest flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-forest leading-tight">Extras</h2>
          <p className="text-[12px] text-ink-soft leading-tight">
            Tick anything you want and it goes on your invoice. Untick to remove it.
          </p>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <ul className="divide-y divide-border">
          {addons.map((a) => {
            const { total, how } = priceFor(a, people, nightCount);
            const busy = busyId === a.id;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => toggle(a)}
                  disabled={busy}
                  aria-pressed={a.requested}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors ${
                    a.requested ? 'bg-sage-pale/40' : 'hover:bg-cream'
                  } disabled:opacity-60`}
                >
                  <span
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      a.requested ? 'bg-forest border-forest text-white' : 'bg-white border-border'
                    }`}
                  >
                    {busy
                      ? <Loader2 className="w-3 h-3 animate-spin text-forest" />
                      : a.requested ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold text-forest">{a.name}</span>
                    {a.description && (
                      <span className="block text-[12.5px] text-ink-soft leading-snug mt-0.5">{a.description}</span>
                    )}
                    <span className="block text-[12px] text-ink-faint mt-1">
                      {ADDON_UNIT_LABELS[a.unit]} · {how}
                    </span>
                  </span>
                  <span className="text-right flex-shrink-0">
                    <span className="block text-[15px] font-bold text-forest tabular-nums">
                      {total != null ? money(total) : money(a.rate)}
                    </span>
                    {total == null && (
                      <span className="block text-[11px] text-ink-faint">per unit</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {provisional && (
        <p className="text-[12px] text-ink-soft mt-2">
          Prices that depend on your numbers or your dates are worked out once those are confirmed,
          so what you see above may change.
        </p>
      )}
      {error && <p className="text-[13px] text-red mt-2">{error}</p>}
    </section>
  );
}

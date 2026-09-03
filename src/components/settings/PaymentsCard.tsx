// Card payments for retreat invoices, through Stripe Connect.
//
// The important thing this card has to communicate is whose money it is. Under Connect the camp
// has its own Stripe account: payouts land in the camp's bank, the camp's name is on the
// statement, and CampCommand never holds the funds, never sees a card number and holds no API
// key for that account — we mint a checkout link against it and Stripe does the rest. Camps ask
// "so you take our money first?" and the answer has to be visible before they click Connect,
// not buried in a help page.
import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/lib/auth';
import { fetchPaymentsStatus, refreshStripeStatus, startStripeOnboarding } from '@/lib/retreatsDb';

type Status = { connected: boolean; chargesEnabled: boolean };

export function PaymentsCard() {
  const { can } = useAuth();
  const canManage = can('manageCampSettings');

  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'refresh' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A guarded async continuation rather than a synchronous effect body: setState in the body
  // itself cascades renders, and the guard stops a slow answer landing after an unmount.
  useEffect(() => {
    let live = true;
    (async () => {
      const s = await fetchPaymentsStatus();
      if (!live) return;
      // A null answer is "we could not ask", not "not connected" — saying the latter would
      // invite a camp to re-onboard an account they already have.
      setStatus(s);
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  async function connect() {
    setBusy('connect');
    setError(null);
    const url = await startStripeOnboarding();
    setBusy(null);
    if (!url) {
      setError('Stripe could not be reached. Try again in a moment.');
      return;
    }
    // Same tab: onboarding returns the camp to the app when it finishes, and a popup would be
    // blocked on half the browsers that matter here.
    window.location.href = url;
  }

  async function refresh() {
    setBusy('refresh');
    setError(null);
    await refreshStripeStatus();
    setStatus(await fetchPaymentsStatus());
    setLoading(false);
    setBusy(null);
  }

  const state: 'loading' | 'unknown' | 'off' | 'pending' | 'live' =
    loading ? 'loading'
      : status == null ? 'unknown'
      : !status.connected ? 'off'
      : !status.chargesEnabled ? 'pending'
      : 'live';

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-btn bg-sage-pale text-forest flex items-center justify-center flex-shrink-0">
          <CreditCard className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-forest">Card payments</h3>
          <p className="text-[12.5px] text-ink-soft leading-snug">
            Let groups pay a deposit or a balance from their portal.
          </p>
        </div>
        {state === 'live' && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-green-muted-text bg-green-muted-bg px-2.5 py-1 rounded-pill flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> Live
          </span>
        )}
      </div>

      {/* Whose money it is. Stated once, plainly, above the button. */}
      <div className="rounded-btn border border-border bg-cream-dark/40 px-3.5 py-3 mb-4">
        <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft mb-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> The money is yours
        </p>
        <p className="text-[12.5px] text-ink leading-relaxed">
          This is Stripe Connect. You get your own Stripe account, and payments settle straight into
          your bank on Stripe's normal schedule. CampCommand never holds your money, never sees a
          card number, and holds no key for your account — we create the checkout link and Stripe
          does the rest. Stripe's processing fee comes out of each payment; we do not add one.
        </p>
      </div>

      {state === 'loading' && (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-soft">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking your account…
        </p>
      )}

      {state === 'unknown' && (
        <div>
          <p className="text-[12.5px] text-ink-soft mb-3">
            The payment status could not be read just now. Nothing has changed on your account.
          </p>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={busy != null}>
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </Button>
        </div>
      )}

      {state === 'off' && (
        <div>
          <p className="text-[12.5px] text-ink-soft mb-3">
            Not connected. Groups can still pay you the way they do now — the portal shows your own
            payment instructions on every invoice until this is switched on.
          </p>
          <Button onClick={connect} disabled={!canManage || busy != null}>
            {busy === 'connect'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening Stripe…</>
              : <><ExternalLink className="w-4 h-4" /> Connect with Stripe</>}
          </Button>
          {!canManage && (
            <p className="text-[11.5px] text-ink-faint mt-2">Only a camp administrator can set this up.</p>
          )}
        </div>
      )}

      {/* Halfway through onboarding is a normal place to be, not an error. Stripe routinely asks
          for a bank account or an ID document and lets you come back to it. */}
      {state === 'pending' && (
        <div className="rounded-btn border border-amber/30 bg-amber-bg px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-text mb-1">
            <AlertTriangle className="w-4 h-4" /> Nearly there
          </p>
          <p className="text-[12.5px] text-amber-text leading-relaxed mb-3">
            Your Stripe account exists but cannot take payments yet. Stripe usually wants a bank
            account, or ID for whoever owns the business. Pick up where you left off — nothing you
            have already entered is lost.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={connect} disabled={!canManage || busy != null}>
              {busy === 'connect'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Opening Stripe…</>
                : <><ExternalLink className="w-3.5 h-3.5" /> Finish setting up</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={busy != null}>
              {busy === 'refresh'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> I've finished — re-check</>}
            </Button>
          </div>
        </div>
      )}

      {state === 'live' && (
        <div>
          <p className="text-[12.5px] text-ink-soft mb-3">
            Invoices in the guest portal now carry a Pay button. Payments and payouts are visible in
            your own Stripe dashboard.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-btn font-bold bg-white border border-border text-forest hover:border-sage px-3.5 py-1.5 text-[12.5px] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Stripe
            </a>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={busy != null}>
              {busy === 'refresh'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Re-check status</>}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-[12.5px] text-red mt-3">{error}</p>}
    </div>
  );
}

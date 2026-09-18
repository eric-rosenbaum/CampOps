// Card payments for retreat invoices, through Stripe Connect.
//
// The important thing this card has to communicate is whose money it is. Under Connect the camp
// has its own Stripe account: payouts land in the camp's bank, the camp's name is on the
// statement, and CampCommand never holds the funds, never sees a card number and holds no API
// key for that account — we mint a checkout link against it and Stripe does the rest. Camps ask
// "so you take our money first?" and the answer has to be visible before they click Connect,
// not buried in a help page.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/lib/auth';
import { fetchPaymentsStatus, refreshStripeStatus, startStripeOnboarding } from '@/lib/retreatsDb';

type Status = { connected: boolean; chargesEnabled: boolean };

export function PaymentsCard() {
  const { t } = useTranslation(['campInfo', 'common']);
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
    let url: string | null = null;
    try {
      url = await startStripeOnboarding();
    } catch (e) {
      // Show what actually went wrong. "Stripe could not be reached" is true of a network
      // failure and a lie about a 400, and the lie sends you debugging the wrong thing.
      setBusy(null);
      setError(e instanceof Error ? e.message : t('payments.errorStart'));
      return;
    }
    setBusy(null);
    if (!url) {
      setError(t('payments.errorReach'));
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
          <h3 className="text-[14px] font-semibold text-forest">{t('payments.title')}</h3>
          <p className="text-[12.5px] text-ink-soft leading-snug">
            {t('payments.subtitle')}
          </p>
        </div>
        {state === 'live' && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-green-muted-text bg-green-muted-bg px-2.5 py-1 rounded-pill flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('payments.live')}
          </span>
        )}
      </div>

      {/* Whose money it is. Stated once, plainly, above the button. */}
      <div className="rounded-btn border border-border bg-cream-dark/40 px-3.5 py-3 mb-4">
        <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft mb-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> {t('payments.yoursTitle')}
        </p>
        <p className="text-[12.5px] text-ink leading-relaxed">
          {t('payments.yoursBody')}
        </p>
      </div>

      {state === 'loading' && (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-soft">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payments.checkingAccount')}
        </p>
      )}

      {state === 'unknown' && (
        <div>
          <p className="text-[12.5px] text-ink-soft mb-3">
            {t('payments.unknown')}
          </p>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={busy != null}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common:actions.retry')}
          </Button>
        </div>
      )}

      {state === 'off' && (
        <div>
          <p className="text-[12.5px] text-ink-soft mb-3">
            {t('payments.off')}
          </p>
          <Button onClick={connect} disabled={!canManage || busy != null}>
            {busy === 'connect'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('payments.opening')}</>
              : <><ExternalLink className="w-4 h-4" /> {t('payments.connect')}</>}
          </Button>
          {!canManage && (
            <p className="text-[11.5px] text-ink-faint mt-2">{t('payments.adminOnly')}</p>
          )}
        </div>
      )}

      {/* Halfway through onboarding is a normal place to be, not an error. Stripe routinely asks
          for a bank account or an ID document and lets you come back to it. */}
      {state === 'pending' && (
        <div className="rounded-btn border border-amber/30 bg-amber-bg px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-text mb-1">
            <AlertTriangle className="w-4 h-4" /> {t('payments.pendingTitle')}
          </p>
          <p className="text-[12.5px] text-amber-text leading-relaxed mb-3">
            {t('payments.pendingBody')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={connect} disabled={!canManage || busy != null}>
              {busy === 'connect'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payments.opening')}</>
                : <><ExternalLink className="w-3.5 h-3.5" /> {t('payments.finish')}</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={busy != null}>
              {busy === 'refresh'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payments.checking')}</>
                : <><RefreshCw className="w-3.5 h-3.5" /> {t('payments.recheckFinished')}</>}
            </Button>
          </div>
        </div>
      )}

      {state === 'live' && (
        <div>
          <p className="text-[12.5px] text-ink-soft mb-3">
            {t('payments.liveBody')}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-btn font-bold bg-white border border-border text-forest hover:border-sage px-3.5 py-1.5 text-[12.5px] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {t('payments.openStripe')}
            </a>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={busy != null}>
              {busy === 'refresh'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payments.checking')}</>
                : <><RefreshCw className="w-3.5 h-3.5" /> {t('payments.recheck')}</>}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-[12.5px] text-red mt-3">{error}</p>}
    </div>
  );
}

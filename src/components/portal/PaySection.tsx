// Paying, from the group's own portal.
//
// Two honest states. When the camp has connected Stripe, each outstanding invoice gets a Pay
// button that opens a checkout page belonging to the CAMP's own Stripe account — the money never
// passes through CampCommand. When they have not, there is no broken button and no "coming soon":
// the camp's existing payment instructions are shown instead, because a cheque in the post is a
// perfectly good way to pay a camp and always has been.
import { useEffect, useState } from 'react';
import { Wallet, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';
import { supabasePublic, portalFnPost, cardClass, btnPrimary } from '@/pages/portal/portalShared';
import { fmtDateFull } from '@/components/retreats/retreatUi';

interface PayableInvoice {
  id: string;
  number: string;
  kind: 'deposit' | 'balance';
  amount: number;
  amount_paid: number | null;
  due_date: string | null;
  status: string;
  payment_link_url: string | null;
  payable: boolean;
}

interface Props {
  token: string;
  /**
   * The camp's own payment instructions ("Cheques to Camp Pinecrest, 12 Lake Rd…"), shown when
   * card payments are not switched on. The portal page already has this on the invoice it holds;
   * pass it through so this section never renders a dead end.
   */
  paymentNote?: string | null;
}

/**
 * Money with cents when there are cents.
 *
 * The shared `money()` rounds to whole dollars, which is right for a season total and wrong next
 * to a Pay button: a $8,437.50 balance must not be advertised as $8,438 and then charged at
 * $8,437.50.
 */
function dollars(n: number): string {
  const cents = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2,
  });
}

export function PaySection({ token, paymentNote }: Props) {
  const [invoices, setInvoices] = useState<PayableInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  /** Which invoice is mid-handoff, so its button can say so and cannot be double-clicked. */
  const [starting, setStarting] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  /**
   * Ask for a fresh checkout link and go there.
   *
   * Minted on click rather than stored on the invoice, because a Checkout Session expires within
   * 24 hours: a link created when the invoice was raised would be dead long before a deposit due
   * in three weeks is paid. Same tab, not a popup — an async `window.open` is blocked by default,
   * and Stripe returns the payer to the portal anyway.
   */
  async function pay(invoiceId: string) {
    setStarting(invoiceId);
    setPayError(null);
    try {
      const { url } = await portalFnPost<{ url: string }>('stripe-connect', {
        action: 'portal_payment_link',
        token,
        invoiceId,
        origin: window.location.origin,
      });
      if (!url) throw new Error('No checkout page came back.');
      window.location.href = url;
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Could not open the payment page.');
      setStarting(null);
    }
  }

  // Guarded async continuation rather than a synchronous effect body.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabasePublic.rpc('portal_payable_invoices', { p_token: token });
      if (!live) return;
      setInvoices((data as PayableInvoice[] | null) ?? []);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [token]);

  if (loading || invoices.length === 0) return null;

  const outstanding = invoices.filter((i) => (i.amount - (i.amount_paid ?? 0)) > 0 && i.status !== 'paid');
  const cardsOn = invoices.some((i) => i.payable);
  const totalDue = outstanding.reduce((s, i) => s + (i.amount - (i.amount_paid ?? 0)), 0);

  return (
    <section id="pay" className="scroll-mt-20">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-sage-pale text-forest flex items-center justify-center flex-shrink-0">
          <Wallet className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-forest leading-tight">Payment</h2>
          <p className="text-[12px] text-ink-soft leading-tight">
            {outstanding.length === 0
              ? 'Everything is settled.'
              : `${dollars(totalDue)} outstanding across ${outstanding.length} ${outstanding.length === 1 ? 'invoice' : 'invoices'}.`}
          </p>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <ul className="divide-y divide-border">
          {invoices.map((inv) => {
            const paid = inv.amount - (inv.amount_paid ?? 0) <= 0 || inv.status === 'paid';
            const remaining = inv.amount - (inv.amount_paid ?? 0);
            return (
              <li key={inv.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-forest">
                      {inv.kind === 'deposit' ? 'Deposit' : 'Balance'}
                      <span className="font-normal text-ink-soft"> · {inv.number}</span>
                    </p>
                    <p className="text-[12.5px] text-ink-soft mt-0.5">
                      {inv.due_date ? `Due ${fmtDateFull(inv.due_date)}` : 'No due date'}
                      {(inv.amount_paid ?? 0) > 0 && !paid && ` · ${dollars(inv.amount_paid ?? 0)} already paid`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[16px] font-bold text-forest tabular-nums">
                      {dollars(paid ? inv.amount : remaining)}
                    </p>
                    {paid && (
                      <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-green-muted-text">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                      </p>
                    )}
                  </div>
                </div>

                {!paid && inv.payable && (
                  <button
                    type="button"
                    onClick={() => pay(inv.id)}
                    disabled={starting !== null}
                    className={`${btnPrimary} w-full mt-3`}
                  >
                    {starting === inv.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Opening secure checkout…</>
                    ) : (
                      <><ExternalLink className="w-4 h-4" /> Pay {dollars(remaining)} by card</>
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {payError && (
          <p className="px-4 py-3 border-t border-border bg-red-bg text-[13px] text-red-text">
            {payError} You can try again, or contact the camp to pay another way.
          </p>
        )}

        {/* No Stripe on the camp's side: their own instructions, not a dead button. */}
        {!cardsOn && outstanding.length > 0 && (
          <div className="px-4 py-4 bg-cream border-t border-border">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-1.5">
              How to pay
            </p>
            <p className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">
              {paymentNote?.trim()
                ? paymentNote
                : 'Please contact the camp office to arrange payment — they will confirm how they would like to receive it.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// Records money that Stripe says has actually moved.
//
// There is no auth check in this function and that is correct: THE SIGNATURE IS THE AUTH. Stripe
// signs the raw body with STRIPE_WEBHOOK_SECRET, and a request that does not verify is discarded
// before anything is read out of it. It follows that the body must be taken as TEXT and verified
// before it is parsed — parsing first and verifying the re-serialised object would compare a
// different byte sequence and fail (or, worse, succeed against something we then ignore).
//
// Deployment note: this endpoint takes no JWT, so it must be deployed with --no-verify-jwt.
// Because charges are direct charges on connected accounts, register it as a CONNECT webhook —
// account-scoped events arrive with `event.account` set to the camp's acct_… id.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * The events that mean "the money arrived". `checkout.session.completed` fires the moment the
 * payer finishes the form, which for card payments is also the moment they paid — but for delayed
 * methods (ACH, bank debits) that session comes back `payment_status: "unpaid"` and settles days
 * later as `async_payment_succeeded`. Both are handled; the payment_status check below is what
 * keeps the first one from booking money that has not actually cleared.
 */
const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secretKey || !webhookSecret) {
    return json({ error: "Payments are not configured yet (missing Stripe secrets)." }, 503);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing stripe-signature header." }, 400);

  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });
  // Deno has no node `crypto` module here, so the synchronous constructEvent — which hashes with
  // it — throws before it ever checks the signature. constructEventAsync with the SubtleCrypto
  // provider is the only variant that works in this runtime. This is the single most common way
  // a Stripe webhook silently 500s on Supabase.
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody, signature, webhookSecret, undefined, cryptoProvider,
    );
  } catch (err) {
    // A bad signature is either a misconfigured secret or someone posting to us directly. 400
    // is right: Stripe treats it as a delivery failure and shows it in the dashboard, which is
    // exactly what a mismatched secret should look like.
    console.error("stripe-webhook: signature verification failed:", err instanceof Error ? err.message : err);
    return json({ error: "Signature verification failed." }, 400);
  }

  // Anything we do not act on is acknowledged, not rejected. Stripe disables an endpoint that
  // keeps erroring, so a 500 on an event we simply do not care about would eventually take the
  // events we DO care about down with it.
  if (!PAID_EVENTS.has(event.type)) {
    return json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // A completed session for a delayed payment method has not been paid yet. Acknowledge it and
  // wait for async_payment_succeeded rather than recording money that may still fail.
  if (session.payment_status !== "paid") {
    return json({ received: true, pending: session.payment_status });
  }

  // Amounts arrive in the smallest currency unit. The ledger stores decimal currency, so the
  // conversion happens once, here, at the edge.
  const amount = (session.amount_total ?? 0) / 100;
  const currency = (session.currency ?? "usd").toLowerCase();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Stripe RETRIES. A delivery that times out, or that we 500 on, comes back — repeatedly, for
    // up to three days — carrying the SAME event id. That is why the event id is the primary key
    // on the payment record inside record_stripe_payment: the second delivery of an event hits
    // the conflict and is discarded, so a retried webhook can never credit a group twice. It also
    // means retrying is safe, which is what makes the 500 below the correct answer to a failure.
    const { error } = await admin.rpc("record_stripe_payment", {
      p_event_id: event.id,
      p_session_id: session.id,
      p_amount: amount,
      p_currency: currency,
      p_raw: event as unknown as Record<string, unknown>,
    });

    if (error) {
      console.error("stripe-webhook: record_stripe_payment failed:", error.message, "event:", event.id);
      // Non-2xx so Stripe redelivers. Safe precisely because the RPC is idempotent on event id.
      return json({ error: "Could not record the payment." }, 500);
    }
  } catch (err) {
    console.error("stripe-webhook error:", err instanceof Error ? err.message : err, "event:", event.id);
    return json({ error: "Could not record the payment." }, 500);
  }

  return json({ received: true, recorded: event.id });
});

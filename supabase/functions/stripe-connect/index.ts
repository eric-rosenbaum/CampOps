// Stripe Connect (Standard) onboarding and hosted checkout for a camp.
//
// The posture that shapes every line here: THE MONEY IS THE CAMP'S. A Standard connected account
// is owned by the camp — their Stripe login, their bank account, their dashboard, their disputes.
// We store one thing about it, `camps.stripe_account_id`, which is a routing label, not a
// credential. We never hold a camp's API key, never see a balance, never take custody of funds,
// and charges are created ON the connected account (the `stripeAccount` header) rather than on
// ours, so the money never lands in a platform balance at all. That is also why offboarding is
// cheap: delete the id and we are out of the loop entirely.
//
// Every action requires a camp ADMIN. Staff can send an invoice; only an admin can connect the
// camp's bank account or mint a payment link against it.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Stripe returns to the app, so the origin has to be a real web origin. Anything else is either
 * a misconfigured client or someone trying to bounce a camp's admin somewhere unpleasant after
 * onboarding, and Stripe will reject a non-absolute URL anyway.
 */
function safeOrigin(req: Request, fromBody: unknown): string | null {
  const candidate = (typeof fromBody === "string" && fromBody) || req.headers.get("origin") || "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) return json({ error: "Payments are not configured yet (missing STRIPE_SECRET_KEY)." }, 503);

  let action: string, campId: string | undefined, invoiceId: string | undefined, origin: string | undefined;
  try {
    ({ action, campId, invoiceId, origin } = await req.json());
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (action !== "onboard" && action !== "status" && action !== "payment_link") {
    return json({ error: "action must be one of: onboard, status, payment_link." }, 400);
  }

  // The caller's own JWT. Used for identity and the admin check only — never for reading the
  // rows below, which go through the service role after the check has passed.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return json({ error: "Not authorized." }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // The SDK's own default API version is the one its bundled types were generated against, so
  // pinning a string here can only ever disagree with them. `createFetchHttpClient` is required:
  // the default client wants node's http stack, which this runtime does not provide.
  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });

  /** is_camp_admin() reads auth.uid() internally, so it must be called with the caller's client. */
  async function requireCampAdmin(id: string): Promise<boolean> {
    const { data, error } = await asUser.rpc("is_camp_admin", { p_camp_id: id });
    return !error && data === true;
  }

  try {
    // ── payment_link ────────────────────────────────────────────────────────────────────────
    // Handled first because it derives its camp from the invoice rather than trusting a campId
    // in the body: an admin of camp A must not be able to mint a link against camp B's invoice
    // by passing their own campId alongside someone else's invoiceId.
    if (action === "payment_link") {
      if (!invoiceId) return json({ error: "invoiceId is required." }, 400);

      // select("*") on a single row by id: the invoice column set is still moving (payment
      // columns are being added around this function), and a narrow select would break the
      // moment one of them lands or is renamed. There is no row-count cost at one row.
      const { data: invoice, error: invErr } = await admin
        .from("retreat_invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (invErr) return json({ error: "Could not read that invoice.", detail: invErr.message }, 500);
      if (!invoice) return json({ error: "That invoice does not exist." }, 404);

      if (!(await requireCampAdmin(invoice.camp_id))) {
        return json({ error: "Only a camp admin can create a payment link." }, 403);
      }
      if (invoice.status === "void") return json({ error: "That invoice has been voided." }, 400);
      if (invoice.status === "paid") return json({ error: "That invoice is already paid." }, 400);

      const { data: camp, error: campErr } = await admin
        .from("camps").select("id, name, stripe_account_id, stripe_charges_enabled")
        .eq("id", invoice.camp_id).maybeSingle();
      if (campErr) return json({ error: "Could not read the camp.", detail: campErr.message }, 500);
      if (!camp?.stripe_account_id) {
        return json({ error: "This camp has not connected a Stripe account yet." }, 409);
      }
      if (camp.stripe_charges_enabled === false) {
        return json({ error: "Stripe onboarding for this camp is not finished, so it cannot accept payments yet." }, 409);
      }

      const outstanding = Number(invoice.amount ?? 0) - Number(invoice.amount_paid ?? 0);
      if (!(outstanding > 0)) return json({ error: "There is nothing outstanding on that invoice." }, 400);
      // Stripe works in the smallest currency unit; our invoices are numeric dollars. Rounding
      // once here, at the boundary, is what keeps a cent from drifting in on every conversion.
      const amountCents = Math.round(outstanding * 100);
      if (amountCents < 50) return json({ error: "That balance is below Stripe's minimum charge." }, 400);

      const appOrigin = safeOrigin(req, origin);
      if (!appOrigin) return json({ error: "Could not determine where to send the payer back to." }, 400);

      // Guests pay from the portal, so that is where they land afterwards. The portal reads the
      // query flag only to say thank you — the payment itself is confirmed by the webhook, never
      // by the browser coming back, which a payer can simply not do.
      const { data: retreat } = await admin
        .from("retreats").select("portal_token, group_name, coordinator_email")
        .eq("id", invoice.retreat_id).maybeSingle();
      const back = retreat?.portal_token ? `${appOrigin}/portal/${retreat.portal_token}` : `${appOrigin}/retreats`;

      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [{
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: `${camp.name} · Invoice ${invoice.number}`,
                description: retreat?.group_name ? `Retreat: ${retreat.group_name}` : undefined,
              },
            },
          }],
          customer_email: retreat?.coordinator_email || undefined,
          success_url: `${back}?paid=1`,
          cancel_url: `${back}?paid=0`,
          // The webhook has only the session to go on, so everything it needs to record the
          // payment against the right row has to be carried here.
          metadata: {
            invoice_id: invoice.id,
            camp_id: invoice.camp_id,
            retreat_id: invoice.retreat_id,
            invoice_number: String(invoice.number ?? ""),
          },
        },
        // Direct charge on the camp's account: the funds settle in the camp's Stripe balance and
        // never pass through ours. Stripe's fees come out of the camp's side, as they should.
        { stripeAccount: camp.stripe_account_id },
      );

      if (!session.url) return json({ error: "Stripe did not return a checkout URL." }, 502);

      const { error: updErr } = await admin.from("retreat_invoices")
        .update({ stripe_session_id: session.id, payment_link_url: session.url })
        .eq("id", invoice.id);
      // A stored link is a convenience, not the source of truth — the webhook records the money
      // either way — so a failed write is logged and the payer still gets their URL.
      if (updErr) console.error("stripe-connect: could not store session on invoice:", updErr.message);

      return json({ url: session.url, amount: outstanding, expiresAt: session.expires_at ?? null });
    }

    // ── onboard / status ────────────────────────────────────────────────────────────────────
    if (!campId) return json({ error: "campId is required." }, 400);
    if (!(await requireCampAdmin(campId))) {
      return json({ error: "Only a camp admin can manage payment settings." }, 403);
    }

    const { data: camp, error: campErr } = await admin
      .from("camps").select("id, name, country, stripe_account_id, stripe_charges_enabled, stripe_connected_at")
      .eq("id", campId).maybeSingle();
    if (campErr) return json({ error: "Could not read the camp.", detail: campErr.message }, 500);
    if (!camp) return json({ error: "That camp does not exist." }, 404);

    if (action === "status") {
      if (!camp.stripe_account_id) {
        return json({ connected: false, chargesEnabled: false, detailsSubmitted: false });
      }
      const account = await stripe.accounts.retrieve(camp.stripe_account_id);
      const chargesEnabled = account.charges_enabled === true;

      const patch: Record<string, unknown> = { stripe_charges_enabled: chargesEnabled };
      // stripe_connected_at answers "since when could this camp take money", not "when did we
      // create a stub account", so it is stamped the first time charges actually turn on and
      // never moved afterwards.
      if (chargesEnabled && !camp.stripe_connected_at) patch.stripe_connected_at = new Date().toISOString();
      const { error: updErr } = await admin.from("camps").update(patch).eq("id", camp.id);
      if (updErr) console.error("stripe-connect: could not cache account status:", updErr.message);

      return json({
        // "connected" means an account exists and is linked to this camp. Whether it can take
        // money yet is chargesEnabled — a camp mid-onboarding is connected but not chargeable,
        // and the interface needs to tell those two states apart.
        connected: true,
        chargesEnabled,
        detailsSubmitted: account.details_submitted === true,
      });
    }

    // action === "onboard"
    const appOrigin = safeOrigin(req, origin);
    if (!appOrigin) return json({ error: "Could not determine where to return you after onboarding." }, 400);

    let accountId = camp.stripe_account_id as string | null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        country: (camp.country as string) || "US",
        // The admin doing the onboarding is the right prefill; Stripe asks the account owner for
        // the real business details next, and we never store what they answer.
        email: userData.user.email ?? undefined,
        business_profile: { name: camp.name as string },
        // Lets a Stripe-side support question be traced back to a camp without an export.
        metadata: { camp_id: camp.id as string },
      });
      accountId = account.id;

      // Store the id before handing out the link. If this write fails and we returned the link
      // anyway, the camp would finish onboarding into an account we had already forgotten and
      // the next "onboard" would create a second one.
      const { error: updErr } = await admin.from("camps")
        .update({ stripe_account_id: accountId }).eq("id", camp.id);
      if (updErr) {
        console.error("stripe-connect: could not store account id:", updErr.message);
        return json({ error: "Could not save the Stripe connection. Please try again." }, 500);
      }
    }

    // Account Links are single-use and expire in minutes, which is why refresh_url exists: Stripe
    // sends the admin back there when the link has gone stale and the app simply asks for another.
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appOrigin}/settings?stripe=refresh`,
      return_url: `${appOrigin}/settings?stripe=return`,
      type: "account_onboarding",
    });

    return json({ url: link.url });
  } catch (err) {
    // Stripe errors carry request ids and sometimes account detail; the caller gets a sentence
    // and the log gets the rest.
    console.error("stripe-connect error:", err instanceof Error ? err.message : err);
    return json({ error: "Stripe request failed. Please try again." }, 502);
  }
});

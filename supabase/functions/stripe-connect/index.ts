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
// Onboarding and status require a camp ADMIN. Minting a checkout link does not, and must not:
// the person who pays is the GROUP, from their portal, and they have no login here. Their
// credential is the portal token — the same unguessable string that already lets them see the
// invoice at all (`portal_payable_invoices`) — so `portal_payment_link` is authorised by proving
// the invoice belongs to the retreat that token opens. `payment_link` is the admin-side twin, for
// putting a link in front of a coordinator who is on the phone.
//
// The link is minted ON DEMAND rather than when the invoice is raised, because a Checkout Session
// expires within 24 hours and a deposit is typically due weeks out. Minting at send time would
// hand every group a link that is dead before they open it.
// v22: Accounts v2 (`stripe.v2.core.*`) does not exist in v17.
import Stripe from "npm:stripe@22";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Accounts v2 lives behind a preview API version. Pinned here rather than on the client, because
 * the Checkout Session below is a v1 call and should keep the SDK's own default.
 */
const ACCOUNTS_V2_VERSION = "2026-08-26.preview";

/** Only the fields we read. The SDK's v2 types are still preview-shaped. */
type V2Account = {
  id: string;
  configuration?: { merchant?: { capabilities?: { card_payments?: { status?: string } } } };
  requirements?: { entries?: { minimum_deadline?: { status?: string } }[] };
};

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

  let action: string, campId: string | undefined, invoiceId: string | undefined,
      origin: string | undefined, token: string | undefined;
  try {
    ({ action, campId, invoiceId, origin, token } = await req.json());
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  const ACTIONS = ["onboard", "status", "payment_link", "portal_payment_link"];
  if (!ACTIONS.includes(action)) {
    return json({ error: `action must be one of: ${ACTIONS.join(", ")}.` }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // The SDK's own default API version is the one its bundled types were generated against, so
  // pinning a string here can only ever disagree with them. `createFetchHttpClient` is required:
  // the default client wants node's http stack, which this runtime does not provide.
  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });

  /**
   * Mint a Checkout Session for one invoice on the camp's own account, and remember it.
   *
   * Shared by the admin and portal paths so the two cannot drift: whoever asks, the charge is a
   * direct charge on the camp's account and the metadata the webhook needs is identical.
   */
  async function mintCheckout(
    invoice: Record<string, unknown>,
    camp: Record<string, unknown>,
    appOrigin: string,
  ): Promise<Response> {
    if (invoice.status === "void") return json({ error: "That invoice has been voided." }, 400);
    if (invoice.status === "paid") return json({ error: "That invoice is already paid." }, 400);
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
          invoice_id: String(invoice.id),
          camp_id: String(invoice.camp_id),
          retreat_id: String(invoice.retreat_id),
          invoice_number: String(invoice.number ?? ""),
        },
      },
      // Direct charge on the camp's account: the funds settle in the camp's Stripe balance and
      // never pass through ours. Stripe's fees come out of the camp's side, as they should.
      { stripeAccount: camp.stripe_account_id as string },
    );

    if (!session.url) return json({ error: "Stripe did not return a checkout URL." }, 502);

    const { error: updErr } = await admin.from("retreat_invoices")
      .update({ stripe_session_id: session.id, payment_link_url: session.url })
      .eq("id", invoice.id as string);
    // A stored link is a convenience, not the source of truth — the webhook records the money
    // either way — so a failed write is logged and the payer still gets their URL.
    if (updErr) console.error("stripe-connect: could not store session on invoice:", updErr.message);

    return json({ url: session.url, amount: outstanding, expiresAt: session.expires_at ?? null });
  }

  // ── portal_payment_link ───────────────────────────────────────────────────────────────────
  // Handled before the login gate, because the payer has no login. Authorised by the portal
  // token, and scoped by it: the invoice is looked up THROUGH the retreat that token opens, so a
  // token can only ever mint a link for its own group's invoices.
  if (action === "portal_payment_link") {
    if (!token || !invoiceId) return json({ error: "token and invoiceId are required." }, 400);

    const { data: retreat, error: rErr } = await admin
      .from("retreats").select("id, camp_id").eq("portal_token", token).maybeSingle();
    if (rErr) return json({ error: "Could not open that portal.", detail: rErr.message }, 500);
    if (!retreat) return json({ error: "That portal link is not valid." }, 404);

    const { data: invoice, error: invErr } = await admin
      .from("retreat_invoices").select("*")
      .eq("id", invoiceId).eq("retreat_id", retreat.id).maybeSingle();
    if (invErr) return json({ error: "Could not read that invoice.", detail: invErr.message }, 500);
    if (!invoice) return json({ error: "That invoice does not exist." }, 404);

    const { data: camp, error: campErr } = await admin
      .from("camps").select("id, name, stripe_account_id, stripe_charges_enabled")
      .eq("id", invoice.camp_id).maybeSingle();
    if (campErr) return json({ error: "Could not read the camp.", detail: campErr.message }, 500);

    const appOrigin = safeOrigin(req, origin);
    if (!appOrigin) return json({ error: "Could not determine where to send you back to." }, 400);

    try {
      return await mintCheckout(invoice, camp ?? {}, appOrigin);
    } catch (err) {
      console.error("stripe-connect portal error:", err instanceof Error ? err.message : err);
      return json({ error: "Stripe request failed. Please try again." }, 502);
    }
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

      const { data: camp, error: campErr } = await admin
        .from("camps").select("id, name, stripe_account_id, stripe_charges_enabled")
        .eq("id", invoice.camp_id).maybeSingle();
      if (campErr) return json({ error: "Could not read the camp.", detail: campErr.message }, 500);

      const appOrigin = safeOrigin(req, origin);
      if (!appOrigin) return json({ error: "Could not determine where to send the payer back to." }, 400);

      return await mintCheckout(invoice, camp ?? {}, appOrigin);
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
      // Accounts v2. `charges_enabled` is a deprecated v1 field and is NOT the right question:
      // the answer for a direct-charge merchant is whether the card_payments capability is
      // active on the merchant configuration. `include` is required or these come back null.
      const account = await stripe.v2.core.accounts.retrieve(
        camp.stripe_account_id,
        { include: ["configuration.merchant", "requirements"] },
        { apiVersion: ACCOUNTS_V2_VERSION },
      ) as V2Account;
      const chargesEnabled =
        account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
      // v2 has no `details_submitted`. "Have they finished?" is "is anything still being asked
      // of them?", which is what the requirements hash actually says.
      const outstanding = (account.requirements?.entries ?? []).filter((e) =>
        e?.minimum_deadline?.status === "currently_due" || e?.minimum_deadline?.status === "past_due"
      ).length;

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
        detailsSubmitted: outstanding === 0,
        requirementsDue: outstanding,
      });
    }

    // action === "onboard"
    const appOrigin = safeOrigin(req, origin);
    if (!appOrigin) return json({ error: "Could not determine where to return you after onboarding." }, 400);

    let accountId = camp.stripe_account_id as string | null;
    if (!accountId) {
      // Accounts v2. `type: "standard"` and the whole v1 accounts.create path are refused for
      // new Connect platforms — Stripe returns "no longer recommends Accounts v1".
      //
      // The shape below is the SaaS / direct-charge configuration, which is what CampCommand is:
      // the camp is the merchant of record for its own rental customers, so Stripe bills the
      // camp its fees and carries the negative-balance risk, and the camp gets a full Stripe
      // Dashboard because it is running its own business rather than a storefront on ours.
      // `dashboard` is IMMUTABLE after creation — changing it later means a new account.
      const account = await stripe.v2.core.accounts.create(
        {
          display_name: camp.name as string,
          // Prefill only. Stripe asks the account owner for the real business details during
          // onboarding, and we never store what they answer.
          contact_email: userData.user.email ?? undefined,
          dashboard: "full",
          identity: { country: ((camp.country as string) || "US").toLowerCase() },
          configuration: {
            merchant: { capabilities: { card_payments: { requested: true } } },
          },
          defaults: {
            currency: "usd",
            responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
            locales: ["en-US"],
          },
          // Lets a Stripe-side support question be traced back to a camp without an export.
          metadata: { camp_id: camp.id as string },
          include: ["configuration.merchant", "requirements"],
        },
        { apiVersion: ACCOUNTS_V2_VERSION },
      ) as V2Account;
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
    const link = await stripe.v2.core.accountLinks.create(
      {
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            // Up front rather than incremental: a camp that connects in February and discovers
            // in June that it cannot take a deposit has been failed by the integration.
            collection_options: { fields: "eventually_due" },
            configurations: ["merchant"],
            refresh_url: `${appOrigin}/settings?stripe=refresh`,
            return_url: `${appOrigin}/settings?stripe=return`,
          },
        },
      },
      { apiVersion: ACCOUNTS_V2_VERSION },
    ) as { url: string };

    return json({ url: link.url });
  } catch (err) {
    // Stripe errors carry request ids and sometimes account detail; the caller gets a sentence
    // and the log gets the rest.
    console.error("stripe-connect error:", err instanceof Error ? err.message : err);
    return json({ error: "Stripe request failed. Please try again." }, 502);
  }
});

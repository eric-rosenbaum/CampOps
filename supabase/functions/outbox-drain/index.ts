// Drains the notification outbox: takes whatever is queued and due, sends it, records the result.
//
// Queuing exists so that the app never sends email on the request path. A retreat that changes
// four things in a minute should produce one email, not four, and an update entered at 11pm
// should not wake a camp director — both of those decisions live in claim_outbox_batch, which
// merges a recipient's pending messages into a single email and honours the camp's local quiet
// hours. This function is deliberately dumb about all of it: claim, send, report.
//
// There is no user here — it runs on a schedule — so it uses the service role and is gated by a
// shared secret header instead. Deploy with --no-verify-jwt so the scheduler can reach it.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Identical to send-email: one verified sending domain, and replies go to the camp (reply_to).
const SENDER_DOMAIN = "campcommand.app";
const DEFAULT_FROM = `retreats@${SENDER_DOMAIN}`;
// A misconfigured RETREAT_FROM_EMAIL outside the verified domain would make Resend reject every
// message in the batch, so it falls back rather than draining the queue into failures.
const configuredFrom = Deno.env.get("RETREAT_FROM_EMAIL") ?? DEFAULT_FROM;
const FROM_ADDRESS = configuredFrom.toLowerCase().endsWith("@" + SENDER_DOMAIN) ? configuredFrom : DEFAULT_FROM;

/** Big enough to keep up, small enough to finish inside one function invocation. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function isEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** A display name is interpolated into a header, so the characters that could break one go. */
const cleanName = (s: unknown) => (typeof s === "string" ? s.replace(/[<>\n"]/g, "").trim() : "");

type OutboxRow = {
  batch_id: string;
  to_email: string;
  to_name: string | null;
  reply_to: string | null;
  subject: string;
  body_html: string;
  message_ids: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // This endpoint sends mail on behalf of every camp and takes no user auth, so the shared secret
  // is the only thing standing in front of it. Missing config fails closed rather than open.
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return json({ error: "The drain is not configured yet (missing CRON_SECRET)." }, 503);
  if (req.headers.get("x-cron-secret") !== expected) return json({ error: "Not authorized." }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Email is not configured yet (missing RESEND_API_KEY)." }, 503);

  // A body is optional: the scheduler posts nothing, an operator draining by hand may pass a limit.
  let limit = DEFAULT_LIMIT;
  try {
    const body = await req.json();
    if (typeof body?.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(body.limit)));
    }
  } catch { /* no body is the normal case */ }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.rpc("claim_outbox_batch", { p_limit: limit });
  if (error) {
    console.error("outbox-drain: claim failed:", error.message);
    return json({ error: "Could not claim the outbox batch." }, 500);
  }

  const rows = (data ?? []) as OutboxRow[];
  if (!rows.length) return json({ claimed: 0, sent: 0, failed: 0 });

  let sent = 0;
  let failed = 0;

  // Sequential on purpose. Resend rate-limits, and a burst of parallel sends against that limit
  // turns a drainable queue into a queue of 429s that we would then have to un-claim.
  for (const row of rows) {
    const ids = Array.isArray(row.message_ids) ? row.message_ids : [];
    let ok = false;
    let failure: string | null = null;

    try {
      if (!isEmail(row.to_email)) {
        // Not retryable — a malformed address will still be malformed next time — so it is
        // reported as a permanent failure rather than left to cycle through the queue forever.
        failure = "Invalid recipient address.";
      } else {
        const name = cleanName(row.to_name);
        const payload: Record<string, unknown> = {
          from: `CampCommand <${FROM_ADDRESS}>`,
          to: [name ? `${name} <${row.to_email}>` : row.to_email],
          subject: row.subject,
          html: row.body_html,
        };
        if (isEmail(row.reply_to)) payload.reply_to = row.reply_to;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) ok = true;
        else failure = `Resend ${res.status}: ${(await res.text()).slice(0, 500)}`;
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }

    if (ok) sent++; else failed++;

    // The claim took these rows out of circulation; this is what settles them. If the mark fails
    // after a successful send, the messages stay claimed and a later sweep will surface them —
    // which is why this is logged loudly rather than swallowed: it is the one path that can
    // produce a duplicate email.
    const { error: markErr } = await admin.rpc("mark_outbox_sent", {
      p_ids: ids,
      p_ok: ok,
      p_error: failure,
    });
    if (markErr) {
      console.error("outbox-drain: mark_outbox_sent failed for batch", row.batch_id, markErr.message);
    }
  }

  return json({ claimed: rows.length, sent, failed });
});

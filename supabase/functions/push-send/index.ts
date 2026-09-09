// Delivers the push queue to APNs. Claims whatever is pending, sends it, records the result.
//
// The queue is filled by triggers on issues and issue_comments, in the same transaction as the
// change that caused it, and drain_push() pings this function the moment a row lands. A cron job
// calls it again every minute as a safety net, so a pg_net hiccup costs a minute rather than the
// notification. This function is deliberately dumb about all of that: claim, send, report.
//
// Like outbox-drain there is no user here, so it runs on the service role and is gated by the
// same shared secret header. Deploy with --no-verify-jwt so Postgres can reach it.
//
// Auth to Apple is token-based (a .p8 signing key), not certificate-based: one key works for
// every app on the team, in both environments, and does not expire annually. The JWT it produces
// is what APNs checks, and Apple rejects one older than an hour — hence the cache below.
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

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID");
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID");
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY");
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID");
// Which Apple to talk to when a device row does not say. A token minted by a debug build is only
// valid against sandbox and a TestFlight/App Store one only against production; sending to the
// wrong host fails with BadDeviceToken, which looks exactly like a dead token.
const APNS_ENV = (Deno.env.get("APNS_ENV") ?? "production").trim().toLowerCase();

const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

/** Big enough to keep up, small enough to finish inside one invocation. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Device = { token: string; environment: string | null };
type PushRow = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  devices: Device[] | null;
};

function missingConfig(): string[] {
  const missing: string[] = [];
  if (!APNS_KEY_ID) missing.push("APNS_KEY_ID");
  if (!APNS_TEAM_ID) missing.push("APNS_TEAM_ID");
  if (!APNS_PRIVATE_KEY) missing.push("APNS_PRIVATE_KEY");
  if (!APNS_BUNDLE_ID) missing.push("APNS_BUNDLE_ID");
  return missing;
}

const b64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64urlText = (s: string) => b64url(new TextEncoder().encode(s));

/**
 * The .p8 Apple hands out is a PKCS#8 PEM. Two things get done to it on the way in: a secret
 * pasted through a dashboard field often arrives with its newlines escaped, and some people
 * store the whole file base64'd rather than as PEM. Both are accepted, because the failure mode
 * for guessing wrong is an unreadable "InvalidProviderToken" hours later.
 */
function signingKeyBytes(raw: string): Uint8Array {
  const text = raw.replace(/\\n/g, "\n").trim();
  const body = text.includes("BEGIN")
    ? text.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "")
    : text;
  return b64ToBytes(body.replace(/\s+/g, ""));
}

// APNs rejects a provider token older than an hour and rejects minting them more often than
// every twenty minutes, so the cache refreshes in the middle of that window. It lives at module
// scope, which means a warm isolate reuses one token across invocations.
let cached: { jwt: string; issuedAt: number } | null = null;

async function providerToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.issuedAt < 50 * 60) return cached.jwt;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    signingKeyBytes(APNS_PRIVATE_KEY!),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signingInput = `${b64urlText(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }))}.` +
    b64urlText(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  // Web Crypto returns ECDSA signatures as raw r||s, which is exactly what ES256 JWS wants.
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  ));

  const jwt = `${signingInput}.${b64url(sig)}`;
  cached = { jwt, issuedAt: now };
  return jwt;
}

/** APNs answers 200 with an empty body, or a status with `{"reason": "..."}`. */
type SendResult = { ok: boolean; retire: boolean; reason: string | null };

async function sendToDevice(device: Device, payload: unknown, jwt: string): Promise<SendResult> {
  const env = device.environment === "sandbox" || device.environment === "production"
    ? device.environment
    : (APNS_ENV === "sandbox" ? "sandbox" : "production");

  let res: Response;
  try {
    res = await fetch(`${HOSTS[env]}/3/device/${device.token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID!,
        "apns-push-type": "alert",
        // 10 is "deliver now". 5 would let iOS hold it back to save power, which is the wrong
        // trade for work landing on somebody's shift.
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 60 * 60 * 12),
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, retire: false, reason: err instanceof Error ? err.message : String(err) };
  }

  if (res.ok) {
    await res.body?.cancel();
    return { ok: true, retire: false, reason: null };
  }

  let reason = `HTTP ${res.status}`;
  try {
    const detail = await res.json();
    if (typeof detail?.reason === "string") reason = detail.reason;
  } catch { /* Apple does not always send a body */ }

  // The app was deleted, or the token never belonged to this app. Neither gets better with a
  // retry, and a token that stays in the table keeps every future send half-failing.
  const retire = res.status === 410 ||
    ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason);

  // A rejected provider token is usually a rotated key. Drop the cache so the next invocation
  // mints a fresh one rather than repeating the same rejection for the next fifty minutes.
  if (res.status === 403) cached = null;

  return { ok: false, retire, reason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // This sends on behalf of every camp and takes no user auth, so the shared secret is the only
  // thing standing in front of it. Missing config fails closed rather than open.
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return json({ error: "The sender is not configured yet (missing CRON_SECRET)." }, 503);
  if (req.headers.get("x-cron-secret") !== expected) return json({ error: "Not authorized." }, 401);

  // Checked BEFORE anything is claimed. Claiming first would take the queue out of circulation
  // and then strand it in 'sending' for ten minutes over a missing environment variable.
  const missing = missingConfig();
  if (missing.length) {
    return json({
      error: `Push is not configured yet (missing ${missing.join(", ")}).`,
      missing,
    }, 503);
  }

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

  const { data, error } = await admin.rpc("claim_push_batch", { p_limit: limit });
  if (error) {
    console.error("push-send: claim failed:", error.message);
    return json({ error: "Could not claim the push batch." }, 500);
  }

  const rows = (data ?? []) as PushRow[];
  if (!rows.length) return json({ claimed: 0, delivered: 0, failed: 0, retired: 0 });

  let jwt: string;
  try {
    jwt = await providerToken();
  } catch (err) {
    // An unreadable key is a configuration problem, not a per-message one. Nothing has been sent,
    // so hand the whole batch back rather than marking it failed one row at a time.
    console.error("push-send: could not sign a provider token:", err);
    for (const row of rows) {
      await admin.rpc("mark_push_sent", {
        p_id: row.id,
        p_delivered: 0,
        p_error: "APNS_PRIVATE_KEY could not be read as a PKCS#8 signing key.",
      });
    }
    return json({ error: "APNS_PRIVATE_KEY could not be read as a PKCS#8 signing key." }, 503);
  }

  let delivered = 0;
  let failed = 0;
  let retired = 0;

  for (const row of rows) {
    const devices = Array.isArray(row.devices) ? row.devices : [];
    const payload = {
      aps: {
        alert: { title: row.title, body: row.body },
        sound: "default",
        // Groups every notification about one work order into a single stack on the lock screen.
        "thread-id": String(row.data?.issue_id ?? row.id),
      },
      data: row.data ?? {},
    };

    let ok = 0;
    const problems: string[] = [];

    for (const device of devices) {
      if (!device?.token) continue;
      const result = await sendToDevice(device, payload, jwt);
      if (result.ok) {
        ok++;
        continue;
      }
      if (result.reason) problems.push(result.reason);
      if (result.retire) {
        retired++;
        await admin.from("device_tokens").delete().eq("token", device.token);
      }
    }

    if (ok > 0) delivered++; else failed++;

    // The claim took this row out of circulation; this is what settles it. A row whose mark fails
    // stays 'sending' and the next claim un-sticks it after ten minutes, which is the one path
    // that can produce a duplicate push -- so it is logged loudly rather than swallowed.
    const { error: markErr } = await admin.rpc("mark_push_sent", {
      p_id: row.id,
      p_delivered: ok,
      // A partial success is not a failure: one dead phone should not mark a delivered
      // notification as failed.
      p_error: ok > 0 || !problems.length ? null : problems.slice(0, 5).join("; "),
    });
    if (markErr) console.error("push-send: mark_push_sent failed for", row.id, markErr.message);
  }

  return json({ claimed: rows.length, delivered, failed, retired });
});

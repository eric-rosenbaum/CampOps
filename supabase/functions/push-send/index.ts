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
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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

/** The languages content_translations holds, and so the ones a push can be said in. */
type Lang = "en" | "es" | "he";
const isLang = (s: unknown): s is Lang => s === "en" || s === "es" || s === "he";

/** How long a push will wait for its own translation before going out in the original. */
const TRANSLATE_WAIT_MS = 8000;

/**
 * Puts each notification in its recipient's language: the work order's title, and for a comment
 * the comment itself. The fixed wording ("Assigned to you") was already chosen by the trigger
 * that queued the row; what the trigger could not do is translate words typed a moment earlier,
 * because translate-content had not seen them yet. So this looks again at send time, asks
 * translate-content for anything still missing, and waits a few seconds for the answer.
 *
 * Somebody with no preferred language is left exactly as queued. And nothing here may stop a
 * send: a notification in the original language is late news, a notification that never went
 * out is none.
 */
async function localize(admin: SupabaseClient, rows: PushRow[]): Promise<void> {
  const { data: owners, error: ownErr } = await admin
    .from("push_notifications").select("id, user_id").in("id", rows.map((r) => r.id));
  if (ownErr) throw new Error(ownErr.message);
  const userIds = [...new Set((owners ?? []).map((o) => o.user_id as string))];
  if (!userIds.length) return;
  const { data: profiles, error: profErr } = await admin
    .from("profiles").select("id, preferred_language").in("id", userIds);
  if (profErr) throw new Error(profErr.message);
  const langOfUser = new Map((profiles ?? []).map((p) => [p.id as string, p.preferred_language]));

  const langOf = new Map<string, Lang>();
  for (const o of owners ?? []) {
    const lang = langOfUser.get(o.user_id as string);
    if (isLang(lang)) langOf.set(o.id as string, lang);
  }
  const todo = rows.filter((r) => langOf.has(r.id) && typeof r.data?.issue_id === "string");
  if (!todo.length) return;

  const issueIds = [...new Set(todo.map((r) => String(r.data!.issue_id)))];
  const commentIds = [...new Set(todo
    .filter((r) => r.data?.kind === "work_order_comment" && typeof r.data?.comment_id === "string")
    .map((r) => String(r.data!.comment_id)))];

  const [{ data: issues }, { data: comments }] = await Promise.all([
    admin.from("issues").select("id, title").in("id", issueIds),
    commentIds.length
      ? admin.from("issue_comments").select("id, body, author_name").in("id", commentIds)
      : Promise.resolve({ data: [] as { id: string; body: string; author_name: string }[] }),
  ]);
  const titleOf = new Map((issues ?? []).map((i) => [i.id as string, i.title as string]));
  const commentOf = new Map((comments ?? []).map((c) => [c.id as string, c as { body: string; author_name: string }]));

  type Tr = { source_table: string; source_id: string; field: string; lang: string; source_text: string; text: string };
  const read = async (): Promise<Tr[]> => {
    const [a, b] = await Promise.all([
      admin.from("content_translations").select("source_table, source_id, field, lang, source_text, text")
        .eq("source_table", "issues").eq("field", "title").in("source_id", issueIds),
      commentIds.length
        ? admin.from("content_translations").select("source_table, source_id, field, lang, source_text, text")
          .eq("source_table", "issue_comments").eq("field", "body").in("source_id", commentIds)
        : Promise.resolve({ data: [] as Tr[] }),
    ]);
    return [...((a.data ?? []) as Tr[]), ...((b.data ?? []) as Tr[])];
  };
  // Current means made from the text as it stands now — the same rule both clients use.
  const current = (all: Tr[], table: string, id: string, lang: Lang, original: string | undefined) =>
    original === undefined ? undefined
      : all.find((t) => t.source_table === table && t.source_id === id && t.lang === lang && t.source_text === original)?.text;

  let translations = await read();
  const missing = new Map<string, { source: string; id: string }>();
  for (const r of todo) {
    const lang = langOf.get(r.id)!;
    const issueId = String(r.data!.issue_id);
    if (titleOf.has(issueId) && current(translations, "issues", issueId, lang, titleOf.get(issueId)) === undefined) {
      missing.set(`issues/${issueId}`, { source: "issues", id: issueId });
    }
    const commentId = typeof r.data?.comment_id === "string" ? r.data.comment_id : null;
    if (commentId && commentOf.has(commentId) &&
        current(translations, "issue_comments", commentId, lang, commentOf.get(commentId)!.body) === undefined) {
      missing.set(`issue_comments/${commentId}`, { source: "issue_comments", id: commentId });
    }
  }

  if (missing.size) {
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/translate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET")! },
        body: JSON.stringify({ refs: [...missing.values()].slice(0, 50) }),
        signal: AbortSignal.timeout(TRANSLATE_WAIT_MS),
      });
      await res.body?.cancel();
      translations = await read();
    } catch (err) {
      console.warn("push-send: translation did not arrive in time; sending originals:", err instanceof Error ? err.message : err);
    }
  }

  for (const r of todo) {
    const lang = langOf.get(r.id)!;
    const issueId = String(r.data!.issue_id);
    const title = current(translations, "issues", issueId, lang, titleOf.get(issueId));
    if (title) r.title = title.slice(0, 120);
    const commentId = typeof r.data?.comment_id === "string" ? r.data.comment_id : null;
    const comment = commentId ? commentOf.get(commentId) : undefined;
    const body = comment && commentId ? current(translations, "issue_comments", commentId, lang, comment.body) : undefined;
    if (comment && body) r.body = `${comment.author_name}: ${body}`.slice(0, 300);
  }
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

  try {
    await localize(admin, rows);
  } catch (err) {
    console.error("push-send: could not localize; sending as queued:", err instanceof Error ? err.message : err);
  }

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

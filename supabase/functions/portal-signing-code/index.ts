// Sends the one-time code that authorises signing a retreat agreement.
//
// The portal link is a bearer credential: whoever it is forwarded to can open it. Reading the
// agreement that way is acceptable; BINDING THE GROUP TO A CONTRACT is not. This adds a second
// factor to that one action.
//
// The code goes to the coordinator address already on the retreat record, never to an address
// the visitor types, which would verify nothing. The response only ever returns a masked hint
// so the portal can say "we sent a code to j•••@church.org" without disclosing the address to
// someone who does not already know it.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM_ADDRESS = Deno.env.get("RETREAT_FROM_EMAIL") ?? "retreats@campcommand.app";
const CODE_TTL_MINUTES = 15;

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "your email on file";
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(2, user.length - 1))}@${domain}`;
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token: string, docId: string;
  try { ({ token, docId } = await req.json()); }
  catch { return json({ error: "Invalid request body." }, 400); }
  if (!token || !docId) return json({ error: "token and docId are required." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: retreats, error: rErr } = await admin
    .from("retreats")
    .select("id, group_name, coordinator_email, departure_date")
    .eq("portal_token", token)
    .limit(1);

  if (rErr || !retreats?.length) return json({ error: "This portal link is not valid." }, 403);
  const retreat = retreats[0];

  // Same lifetime the database enforces (portal_link_expired); checked here too so an expired
  // link cannot even trigger an email.
  const expiredAfter = new Date(retreat.departure_date);
  expiredAfter.setDate(expiredAfter.getDate() + 14);
  if (new Date() > expiredAfter) return json({ error: "This portal link has expired." }, 403);

  const email = (retreat.coordinator_email ?? "").trim();
  if (!email) {
    // No address to verify against. The database allows signing in this case and records it as
    // the weaker 'typed' method; the portal is told so it can skip the code step.
    return json({ codeRequired: false });
  }

  const { data: docs } = await admin
    .from("retreat_documents")
    .select("id, name, signed_at")
    .eq("id", docId)
    .eq("retreat_id", retreat.id)
    .limit(1);
  if (!docs?.length) return json({ error: "Document not found." }, 404);
  if (docs[0].signed_at) return json({ error: "This document has already been signed." }, 409);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  // Supersede any outstanding code so only the newest one works.
  await admin.from("retreat_signing_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("document_id", docId).is("consumed_at", null);

  const { error: insErr } = await admin.from("retreat_signing_codes").insert({
    retreat_id: retreat.id,
    document_id: docId,
    code_hash: await sha256Hex(code),
    sent_to: email,
    expires_at: expiresAt,
  });
  if (insErr) return json({ error: "Could not start verification. Please try again." }, 500);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Email is not configured yet." }, 503);

  const html = `
    <p>Hello,</p>
    <p>Your verification code for signing the <strong>${docs[0].name}</strong> for
       <strong>${retreat.group_name}</strong> is:</p>
    <p style="font-size:26px;font-weight:700;letter-spacing:5px;margin:20px 0">${code}</p>
    <p>It expires in ${CODE_TTL_MINUTES} minutes. If you did not request this, you can ignore
       this email and the agreement will not be signed.</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `CampCommand <${FROM_ADDRESS}>`,
      to: email,
      subject: `Your signing code: ${code}`,
      html,
    }),
  });
  if (!res.ok) return json({ error: "Could not send the code. Please try again." }, 502);

  return json({ codeRequired: true, sentTo: maskEmail(email), expiresInMinutes: CODE_TTL_MINUTES });
});

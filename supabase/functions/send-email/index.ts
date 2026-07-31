// Sends transactional email (retreat reminders + invoices) via Resend. Called from the
// authenticated ops app. Requires the RESEND_API_KEY secret and a verified sender domain.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// The verified sending domain in Resend. Group replies go to the camp (reply_to).
const FROM_ADDRESS = Deno.env.get("RETREAT_FROM_EMAIL") ?? "retreats@campcommand.app";
// Callers may pick a sender address, but only within our verified domain (no spoofing).
const SENDER_DOMAIN = "campcommand.app";

function isEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Require a logged-in user (block anon-key abuse).
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json({ error: "Not authorized." }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Email is not configured yet (missing RESEND_API_KEY)." }, 503);

  let to: string, subject: string, html: string, fromName: string | undefined, replyTo: string | undefined, fromEmail: string | undefined;
  try {
    ({ to, subject, html, fromName, replyTo, fromEmail } = await req.json());
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!isEmail(to)) return json({ error: "A valid recipient email is required." }, 400);
  if (!subject || !html) return json({ error: "subject and html are required." }, 400);

  // Sender address: caller may choose one, but only within our verified domain.
  const fromAddress = (isEmail(fromEmail) && fromEmail.toLowerCase().endsWith("@" + SENDER_DOMAIN))
    ? fromEmail : FROM_ADDRESS;
  const from = `${(fromName ?? "CampCommand").replace(/[<>\n"]/g, "")} <${fromAddress}>`;
  const payload: Record<string, unknown> = { from, to: [to], subject, html };
  if (isEmail(replyTo)) payload.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: "Email provider rejected the message.", detail }, 502);
  }
  const data = await res.json();
  return json({ ok: true, id: data.id });
});

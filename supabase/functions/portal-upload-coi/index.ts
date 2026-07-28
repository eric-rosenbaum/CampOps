// Guest-portal COI upload. The portal is anonymous, so it cannot write to the private
// `retreat-documents` bucket directly. This function validates the retreat's portal token
// with the service role, stores the file, and records/updates the COI document row.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
};

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token: string, fileBase64: string, fileName: string, contentType: string, uploadedBy: string | undefined;
  try {
    ({ token, fileBase64, fileName, contentType, uploadedBy } = await req.json());
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (!token || !fileBase64 || !contentType) {
    return json({ error: "token, fileBase64 and contentType are required." }, 400);
  }
  const ext = ALLOWED[contentType];
  if (!ext) {
    return json({ error: "Only PDF, JPG, PNG or HEIC files are accepted." }, 400);
  }

  const bytes = decodeBase64(fileBase64);
  if (bytes.byteLength === 0) return json({ error: "Empty file." }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: "File is larger than 10 MB." }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate the portal token → retreat.
  const { data: retreat, error: rErr } = await supabase
    .from("retreats")
    .select("id, camp_id")
    .eq("portal_token", token)
    .maybeSingle();
  if (rErr) return json({ error: "Server error." }, 500);
  if (!retreat) return json({ error: "Invalid portal link." }, 404);

  // Store under the camp folder so the existing member-read RLS applies for camp staff.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = safeName((fileName || "coi").replace(/\.[^.]+$/, ""));
  const path = `${retreat.camp_id}/${retreat.id}/coi-${stamp}-${base}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("retreat-documents")
    .upload(path, bytes, { contentType, upsert: false });
  if (upErr) return json({ error: "Could not store the file." }, 500);

  // Update an existing COI document row, or create one.
  const { data: existing } = await supabase
    .from("retreat_documents")
    .select("id")
    .eq("retreat_id", retreat.id)
    .eq("doc_type", "coi")
    .limit(1)
    .maybeSingle();

  const meta = { uploaded_by: uploadedBy || null, uploaded_via: "portal", original_name: fileName || null };

  if (existing) {
    await supabase.from("retreat_documents")
      .update({ status: "received", file_path: path, meta, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("retreat_documents").insert({
      camp_id: retreat.camp_id, retreat_id: retreat.id, doc_type: "coi",
      name: "Certificate of Insurance", status: "received", file_path: path, meta,
    });
  }

  return json({ ok: true });
});

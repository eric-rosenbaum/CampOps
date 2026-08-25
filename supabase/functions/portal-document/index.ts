// Guest-portal document read. Mirror of `portal-upload-coi`, in the other direction.
//
// The portal is anonymous and `retreat-documents` is a private bucket, so a guest had no way to
// read the agreement they were being asked to sign. The portal only ever knew that a file
// existed. Making the bucket public would expose every camp's contracts to anyone who guessed a
// path, so instead this validates the retreat's portal token with the service role and returns a
// short-lived signed URL for exactly the one object that belongs to that retreat.
//
// It also returns a SHA-256 of the bytes, which the portal records alongside the signature. That
// is what lets the camp later prove which version of the agreement was actually signed.
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

/** Long enough to read a contract, short enough that a leaked URL is not a standing key. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token: string, docId: string, access: string | null = null;
  try {
    ({ token, docId, access = null } = await req.json());
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!token || !docId) return json({ error: "token and docId are required." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // The RPC is the authority on whether this token may see this document: it resolves the
  // retreat from the token and only returns a path when the document belongs to that retreat.
  // The session is checked inside the RPC, not here: keeping the rule in one place means an
  // extra caller of the function cannot forget it.
  const { data: filePath, error: rpcError } = await admin.rpc("portal_document_path", {
    p_token: token,
    p_doc_id: docId,
    p_access: access,
  });

  if (rpcError) return json({ error: "This portal link is not valid." }, 403);
  if (!filePath) return json({ error: "No file has been attached to this document yet." }, 404);

  const { data: signed, error: signError } = await admin.storage
    .from("retreat-documents")
    .createSignedUrl(filePath as string, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return json({ error: "Could not open the document. Please try again." }, 500);
  }

  // Hash the bytes as served, so the signature can be tied to this exact version.
  let sha256: string | null = null;
  const { data: blob } = await admin.storage.from("retreat-documents").download(filePath as string);
  if (blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    sha256 = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  return json({ url: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS, sha256 });
});

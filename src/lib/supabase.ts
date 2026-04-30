import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// After idle time, browsers send the first request on a stale TCP connection
// (NAT/firewall keep-alive expired). Non-idempotent requests (POST/PATCH) are
// not auto-retried by the browser, so the write fails silently. Retry once
// after 3 s to give the network time to re-establish a fresh connection.
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (_err) {
    await new Promise<void>((r) => setTimeout(r, 3000));
    return fetch(input, init);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry },
});

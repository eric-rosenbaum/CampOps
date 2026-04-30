import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Browsers never auto-retry non-idempotent requests (POST/PATCH) on connection
// reset. After idle time the TCP connection is stale and the first write fails.
// Retry up to 3 times with escalating delays (3s, then 10s).
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const delays = [3000, 10000];
  for (let i = 0; i < delays.length; i++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      console.warn(`[CampOps] fetch attempt ${i + 1} failed — retrying in ${delays[i] / 1000}s`, err);
      await new Promise<void>((r) => setTimeout(r, delays[i]));
    }
  }
  console.warn('[CampOps] fetch attempt 3 (final)');
  return fetch(input, init);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry },
});

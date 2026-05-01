import { createClient } from '@supabase/supabase-js';
import { campLog } from './campLog';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// After idle time TCP connections go stale. The server may silently drop the
// request (no RST) causing fetch() to hang until the browser's own timeout
// (30-120s). We abort each attempt after 8s and retry with fresh connections.
// We don't retry if an *external* AbortSignal fired (Supabase SDK cancellation).
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ATTEMPT_TIMEOUT_MS = 8000;
  const delays = [3000, 10000];

  for (let i = 0; i <= delays.length; i++) {
    if (i > 0) {
      await new Promise<void>((r) => setTimeout(r, delays[i - 1]));
      campLog(`[CampOps] fetch attempt ${i + 1} (after ${delays[i - 1] / 1000}s wait)`);
    }

    const timer = new AbortController();
    const timeoutId = setTimeout(() => timer.abort(), ATTEMPT_TIMEOUT_MS);

    // Merge our timeout signal with any external signal the SDK may have set.
    let signal: AbortSignal = timer.signal;
    if (init?.signal) {
      signal = (AbortSignal as { any?(s: AbortSignal[]): AbortSignal }).any?.([init.signal, timer.signal])
        ?? timer.signal;
    }

    try {
      const res = await fetch(input, { ...init, signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      if (init?.signal?.aborted) throw err; // caller cancelled, don't retry
      if (i < delays.length) {
        campLog(`[CampOps] fetch attempt ${i + 1} failed — retrying in ${delays[i] / 1000}s: ${String(err)}`);
      } else {
        campLog(`[CampOps] fetch attempt ${i + 1} (final) failed: ${String(err)}`);
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry },
});

import { createClient } from '@supabase/supabase-js';
import { campLog } from './campLog';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const delays = [3000, 10000];
  for (let i = 0; i < delays.length; i++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      campLog(`[CampOps] fetch attempt ${i + 1} failed — retrying in ${delays[i] / 1000}s err=${String(err)}`);
      await new Promise<void>((r) => setTimeout(r, delays[i]));
    }
  }
  campLog('[CampOps] fetch attempt 3 (final)');
  return fetch(input, init);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry },
});

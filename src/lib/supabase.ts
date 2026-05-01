import { createClient } from '@supabase/supabase-js';
import { campLog, campError } from './campLog';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// fetch() + AbortController does NOT cancel stale kernel-level TCP connections on
// macOS Chrome.  The AbortSignal fires in JS but Chrome never propagates it to the
// underlying socket, which stays open until the OS timeout (60–120 s).
//
// XMLHttpRequest.abort() operates at Chrome's network-service layer and actually
// closes the socket.  This adaptor lets us use XHR via the fetch() API so that
// AbortController works correctly and the 4 s timeout below actually fires retries.
function xhrFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    // campOpsDebug.simulateStaleFetch() sets this to test stale-TCP behaviour fast.
    // We hook up the AbortSignal so the 4s AbortController timeout works in debug mode,
    // letting the retry fire at ~5s just like a real stale connection.
    const dbgHang = (window as unknown as Record<string, unknown>)._campOpsXhrHangMs as number | undefined;
    if (dbgHang) {
      campLog(`[CampOps] xhrFetch: DEBUG hang ${dbgHang}ms`);
      const tid = setTimeout(() => reject(new TypeError('campOpsDebug: simulated stale fetch')), dbgHang);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(tid);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      }, { once: true });
      return;
    }

    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (init?.signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.responseType = 'arraybuffer';

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      init?.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const onAbort = () => {
      xhr.abort(); // actually closes the socket — this is the key difference from fetch()
      settle(() => reject(new DOMException('The operation was aborted.', 'AbortError')));
    };
    init?.signal?.addEventListener('abort', onAbort, { once: true });

    xhr.onload = () => settle(() => {
      const headers = new Headers();
      xhr.getAllResponseHeaders().trim().split(/\r?\n/).forEach((line) => {
        const colon = line.indexOf(':');
        if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      });
      // 204/205/304 are "null body status" — Response() throws if a body is passed.
      const nullBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(new Response(nullBody ? null : (xhr.response as ArrayBuffer), {
        status: xhr.status,
        statusText: xhr.statusText,
        headers,
      }));
    });
    xhr.onerror = () => settle(() => reject(new TypeError('XHR network error')));
    xhr.onabort = () => settle(() => reject(new DOMException('The operation was aborted.', 'AbortError')));

    xhr.open(method, url, true);

    const headersInit = init?.headers ?? (input instanceof Request ? input.headers : null);
    if (headersInit) {
      new Headers(headersInit as HeadersInit).forEach((v, k) => xhr.setRequestHeader(k, v));
    }

    xhr.send((init?.body ?? null) as XMLHttpRequestBodyInit | null);
  });
}

// Wraps xhrFetch with a per-attempt AbortController timeout and retries.
// With xhrFetch, the abort actually cancels the socket, so the retry opens a
// genuinely fresh connection — total time on a stale connection is ~5 s.
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ATTEMPT_TIMEOUT_MS = 4000;
  const delays = [1000, 5000];
  const url = input instanceof Request ? input.url : String(input);
  const tag = url.split('?')[0].split('/').slice(-2).join('/'); // "rest/v1/issues" etc
  campLog(`[CampOps] fetchWithRetry CALLED ${tag}`);

  for (let i = 0; i <= delays.length; i++) {
    if (i > 0) {
      await new Promise<void>((r) => setTimeout(r, delays[i - 1]));
      campLog(`[CampOps] fetch attempt ${i + 1} (after ${delays[i - 1] / 1000}s wait) ${tag}`);
    }

    const timer = new AbortController();
    const timeoutId = setTimeout(() => {
      campLog(`[CampOps] fetchWithRetry abort timer FIRED attempt=${i + 1} ${tag}`);
      timer.abort();
    }, ATTEMPT_TIMEOUT_MS);

    // Merge our timeout signal with any external signal the SDK may have set.
    let signal: AbortSignal = timer.signal;
    if (init?.signal) {
      signal = (AbortSignal as { any?(s: AbortSignal[]): AbortSignal }).any?.([init.signal, timer.signal])
        ?? timer.signal;
    }

    try {
      const res = await xhrFetch(input, { ...init, signal });
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

// No-op lock.  The default auth-js lock serializes auth ops behind a
// navigator.locks mutex.  When something inside the lock hangs (typically a
// network call), the lock is held and ALL subsequent Supabase calls — writes and
// reads — queue forever behind it (the symptom: dbUpsertIssue never logs SUCCESS
// or FAILED, and fetchWithRetry never even runs).  Single-tab app, so concurrent
// refresh races aren't a real concern.
let _lockSeq = 0;
async function lockNoOp<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const id = ++_lockSeq;
  campLog(`[CampOps] lockNoOp #${id} START ${name}`);
  try {
    const result = await fn();
    campLog(`[CampOps] lockNoOp #${id} DONE`);
    return result;
  } catch (err) {
    campLog(`[CampOps] lockNoOp #${id} THREW: ${String(err)}`);
    throw err;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry },
  auth: {
    // Disabled: auto-refresh fires on every visibilitychange and hangs on stale
    // TCP, blocking everything behind it.  We refresh manually in the heartbeat.
    autoRefreshToken: false,
    lock: lockNoOp,
  },
});

// Stub out auth-js's visibility handler.  On every visibilitychange to 'visible'
// it acquires the auth lock and runs _recoverAndRefresh, which can make a network
// call (_getUser).  On stale TCP that call hangs and holds the lock indefinitely,
// blocking every subsequent Supabase operation in the app.  Our heartbeat already
// handles visibility transitions safely without holding the lock during network.
(supabase.auth as unknown as { _onVisibilityChanged: (calledFromInitialize: boolean) => Promise<void> })
  ._onVisibilityChanged = async (calledFromInitialize: boolean) => {
  campLog(`[CampOps] auth _onVisibilityChanged stubbed (init=${calledFromInitialize})`);
};

// Periodic ping to keep the TCP socket alive and the JWT fresh.  Runs every 30 s
// while the tab is visible, plus immediately when the tab becomes visible after
// being hidden.  This (a) prevents Chrome's pooled connection from going stale
// during idle periods (server-side FIN that Chrome doesn't notice), and (b)
// refreshes the auth token before it expires, since we've disabled the SDK's
// auto-refresh to avoid the lock-on-stale-TCP deadlock.
export function startSupabaseHeartbeat(): () => void {
  const TICK_MS = 30_000;
  const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // refresh if expires within 5 min

  let stopped = false;
  let inFlight = false;

  const tick = async (reason: string) => {
    campLog(`[CampOps] heartbeat ${reason} TICK CALLED stopped=${stopped} inFlight=${inFlight} vis=${document.visibilityState}`);
    if (stopped) return;
    if (inFlight) return;
    if (document.visibilityState !== 'visible') return;
    inFlight = true;
    const t0 = Date.now();
    try {
      campLog(`[CampOps] heartbeat ${reason} → getSession`);
      const { data: { session } } = await supabase.auth.getSession();
      campLog(`[CampOps] heartbeat ${reason} ← getSession (${Date.now() - t0}ms)`);
      if (session?.expires_at) {
        const expiresInMs = session.expires_at * 1000 - Date.now();
        if (expiresInMs < REFRESH_THRESHOLD_MS) {
          campLog(`[CampOps] heartbeat ${reason}: refreshing token (expires in ${Math.round(expiresInMs / 1000)}s)`);
          const { error } = await supabase.auth.refreshSession();
          if (error) campError('[CampOps] heartbeat refresh error', error);
        }
      }
      campLog(`[CampOps] heartbeat ${reason} → ping`);
      const { error } = await supabase.from('camps').select('id').limit(1);
      const ms = Date.now() - t0;
      if (error) campLog(`[CampOps] heartbeat ${reason} FAIL (${ms}ms): ${error.message}`);
      else campLog(`[CampOps] heartbeat ${reason} OK (${ms}ms)`);
    } catch (err) {
      campLog(`[CampOps] heartbeat ${reason} THREW (${Date.now() - t0}ms): ${String(err)}`);
    } finally {
      inFlight = false;
    }
  };

  campLog('[CampOps] heartbeat STARTED');
  const intervalId = window.setInterval(() => tick('interval'), TICK_MS);
  const onVisibility = () => { if (document.visibilityState === 'visible') tick('visibility'); };
  document.addEventListener('visibilitychange', onVisibility);
  tick('initial');

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

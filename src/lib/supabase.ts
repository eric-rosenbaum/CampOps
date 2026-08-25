import { createClient } from '@supabase/supabase-js';
import { campLog, campError } from './campLog';
import { noteWriteStart, noteWriteEnd } from './syncGuard';
import { recordWriteFailure } from './writeFailures';
import { reportUploadBytes } from './uploadProgress';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// fetch() + AbortController does NOT cancel stale kernel-level TCP connections on
// macOS Chrome.  The AbortSignal fires in JS but Chrome never propagates it to the
// underlying socket, which stays open until the OS timeout (60–120 s).
//
// XMLHttpRequest.abort() operates at Chrome's network-service layer and actually
// closes the socket.  This adaptor lets us use XHR via the fetch() API so that
// cancellation works correctly and a dead connection is retried promptly.
//
// XHR earns its keep a second time here: its progress events are what let the timeout below
// measure silence rather than elapsed time.

/**
 * How long a request may make *no progress* before its socket is called dead.
 *
 * Idle time is the thing worth measuring, never total time. A stale TCP socket moves no bytes
 * at all, so it trips this quickly and the retry opens a fresh connection. A live 9 MB upload
 * on a slow link moves bytes the whole way and never trips it, however long it takes.
 *
 * The fixed 4 s *total* budget this replaces could not tell those two apart. It aborted uploads
 * the storage API had already accepted, so the client never saw the 200 that was on its way
 * back, and the retry then failed as a duplicate. A file that uploaded perfectly was reported
 * to the user as a failure.
 */
const STALL_MS = 20_000;

/**
 * Grace before the first observable byte, when there is nothing to measure yet.
 *
 * DNS, TLS and the CORS preflight are all invisible from here: the browser issues the OPTIONS
 * itself and XHR reports nothing until it has succeeded. A storage preflight was measured at
 * 3.5 s on a real connection, which on its own exhausted the entire old budget. Requests
 * carrying a file get far more, because that preflight is the only thing standing between them
 * and their first progress event, and losing the race costs a whole upload.
 */
const FIRST_BYTE_MS = 8_000;
const FIRST_BYTE_BODY_MS = 45_000;

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
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      init?.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const onAbort = () => {
      xhr.abort(); // actually closes the socket. This is the key difference from fetch()
      settle(() => reject(new DOMException('The operation was aborted.', 'AbortError')));
    };
    init?.signal?.addEventListener('abort', onAbort, { once: true });

    // A file, rather than any body at all: a JSON write is as small as a read and should be
    // called dead just as quickly. Only an actual upload earns the long first-byte grace.
    const body = init?.body;
    const isFileUpload = body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer;

    // Progress-driven deadline: any byte in either direction pushes it out, so only real
    // silence can expire it.
    let deadline = Date.now() + (isFileUpload ? FIRST_BYTE_BODY_MS : FIRST_BYTE_MS);
    const bump = () => { deadline = Date.now() + STALL_MS; };

    const tick = () => {
      if (settled) return;
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        // Re-check rather than trusting one long timer: a throttled background tab fires
        // timers late, and we would rather notice that than abort a healthy request.
        watchdog = setTimeout(tick, Math.min(remaining, 2000));
        return;
      }
      settle(() => reject(new DOMException(
        `No progress for ${Math.round(STALL_MS / 1000)}s`, 'TimeoutError')));
      xhr.abort();
    };

    // Only for uploads. Any listener on xhr.upload makes the request non-simple and forces a
    // CORS preflight, which is not a cost worth adding to requests that have nothing to send.
    if (isFileUpload) {
      xhr.upload.addEventListener('progress', (e) => {
        bump();
        // The only point in the stack where the bytes of an upload are visible. Anything
        // wanting to draw a progress bar reads them from here.
        if (e.lengthComputable) reportUploadBytes(url, e.loaded, e.total);
      });
      xhr.upload.addEventListener('load', bump);
    }
    xhr.addEventListener('progress', bump);
    xhr.addEventListener('readystatechange', () => {
      // readyState 1 fires on open(), before anything has been sent, and would shorten the
      // first-byte grace to the stall budget. Only headers onwards count as progress.
      if (xhr.readyState >= XMLHttpRequest.HEADERS_RECEIVED) bump();
    });

    xhr.onload = () => settle(() => {
      const headers = new Headers();
      xhr.getAllResponseHeaders().trim().split(/\r?\n/).forEach((line) => {
        const colon = line.indexOf(':');
        if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      });
      // 204/205/304 are "null body status"Response() throws if a body is passed.
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
    tick();
  });
}

// Wraps xhrFetch with retries. xhrFetch's abort actually cancels the socket, so a retry
// opens a genuinely fresh connection rather than queueing behind the dead one.
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Every write in the app funnels through here, which makes this the one place that can
  // tell the sync guard "a mutation is still on the wire". Reloads triggered by realtime
  // or the periodic refetch wait for this count to hit zero, so they never read (and then
  // apply) a half-applied save over the optimistic local state. See lib/syncGuard.ts.
  const isWrite = isMutatingRequest(input, init);
  if (isWrite) noteWriteStart();
  try {
    const res = await fetchWithRetryInner(input, init);

    // A mutation that came back non-2xx after every retry did not save. The caller cannot see
    // this (the dbX() helpers log and return void) so it is recorded here, where every write
    // in the app passes through exactly once.
    if (isWrite && !res.ok) {
      const url = input instanceof Request ? input.url : String(input);
      recordWriteFailure({
        table: describeTarget(url),
        op: (init?.method ?? 'POST').toUpperCase(),
        status: res.status,
        message: `${res.status} ${res.statusText || 'request rejected'}`,
      });
    }
    return res;
  } catch (err) {
    // Never completed: timed out, aborted, or the network went away.
    if (isWrite) {
      const url = input instanceof Request ? input.url : String(input);
      recordWriteFailure({
        table: describeTarget(url),
        op: (init?.method ?? 'POST').toUpperCase(),
        status: null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  } finally {
    if (isWrite) noteWriteEnd();
  }
}

// RPCs that only read. Everything else that arrives by POST is assumed to mutate -
// `adjust_inventory_item` and `receive_purchase_order` are the reason: they change stock
// through a function rather than a table write, and missing them would let a reload
// observe the pre-write state exactly as the direct table writes used to.
const READ_ONLY_RPCS = new Set([
  'get_portal_data', 'get_public_camp', 'get_restriction_summary', 'invitation_info',
  'is_platform_admin', 'list_platform_admins', 'admin_list_camp_accounts', 'export_camp_data',
]);

/** A PostgREST/storage call that changes rows, anything but a plain read. */
function isMutatingRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const url = input instanceof Request ? input.url : String(input);
  // Auth traffic (token refresh, session) is not a data mutation.
  if (url.includes('/auth/v1/')) return false;
  const rpc = url.match(/\/rest\/v1\/rpc\/([^/?#]+)/);
  if (rpc) return !READ_ONLY_RPCS.has(rpc[1]);
  return true;
}

/**
 * Refresh the access token, collapsing concurrent callers onto one request.
 *
 * Without this a page with several writes in flight would fire a refresh per 401, and the
 * losers would race to write the session back to storage.
 */
let _refreshInFlight: Promise<boolean> | null = null;

function refreshSessionOnce(): Promise<boolean> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        campError('[CampOps] token refresh failed', error);
        return false;
      }
      campLog('[CampOps] token refreshed');
      return true;
    } catch (err) {
      campError('[CampOps] token refresh threw', err);
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this promise all see the same result.
      setTimeout(() => { _refreshInFlight = null; }, 0);
    }
  })();
  return _refreshInFlight;
}

/**
 * Refresh ahead of a write when the token is about to die.
 *
 * The heartbeat only runs while the tab is visible, so a tab that sat hidden past the token's
 * one-hour life comes back with a dead JWT. The visibility handler does refresh on return, but
 * it is asynchronous and nothing gates writes behind it. Click quickly enough after returning
 * and the write outruns the refresh. This closes that race for mutations specifically.
 */
/** Transient HTTP statuses worth another attempt. Everything else 4xx is a real rejection. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** "rest/v1/retreats?..." → "retreats"; "rest/v1/rpc/foo" → "rpc:foo". */
function describeTarget(url: string): string {
  const rpc = url.match(/\/rest\/v1\/rpc\/([^/?#]+)/);
  if (rpc) return `rpc:${rpc[1]}`;
  const rest = url.match(/\/rest\/v1\/([^/?#]+)/);
  if (rest) return rest[1];
  const storage = url.match(/\/storage\/v1\/object\/([^/?#]+)/);
  if (storage) return `storage:${storage[1]}`;
  return url.split('?')[0].split('/').slice(-1)[0] || 'unknown';
}

async function fetchWithRetryInner(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Timeouts belong to xhrFetch, which can see progress. A timer out here can only measure
  // elapsed time, and elapsed time is exactly the wrong thing to abort a file upload on.
  const delays = [1000, 5000];
  const url = input instanceof Request ? input.url : String(input);
  const tag = url.split('?')[0].split('/').slice(-2).join('/'); // "rest/v1/issues" etc
  const isAuthUrl = url.includes('/auth/v1/');
  let refreshedFor401 = false;
  campLog(`[CampOps] fetchWithRetry CALLED ${tag}`);

  for (let i = 0; i <= delays.length; i++) {
    if (i > 0) {
      await new Promise<void>((r) => setTimeout(r, delays[i - 1]));
      campLog(`[CampOps] fetch attempt ${i + 1} (after ${delays[i - 1] / 1000}s wait) ${tag}`);
    }

    try {
      const breakLeft = (window as unknown as Record<string, unknown>)._campOpsBreakWrites as number | undefined;
      if (breakLeft && isMutatingRequest(input, init)) {
        (window as unknown as Record<string, unknown>)._campOpsBreakWrites = breakLeft - 1;
        throw new TypeError('campOpsDebug: forced write failure');
      }

      const res = await xhrFetch(input, init);

      // supabase-js does not throw on an HTTP error, and the retry loop used to only catch
      // thrown ones, so a 401 from an expired JWT sailed through as a "successful" fetch and
      // became a silently dropped write. Statuses are inspected here for that reason.
      if (!res.ok && !isAuthUrl) {
        if (res.status === 401 && !refreshedFor401 && i < delays.length) {
          refreshedFor401 = true;
          campLog(`[CampOps] 401 on ${tag}, refreshing token and retrying`);
          const ok = await refreshSessionOnce();
          if (ok) {
            // The SDK reads the session from storage per request, so the retry below picks
            // up the new token without us rewriting the header by hand.
            continue;
          }
        }
        if (isRetryableStatus(res.status) && i < delays.length) {
          campLog(`[CampOps] ${res.status} on ${tag} · retrying`);
          continue;
        }
      }
      return res;
    } catch (err) {
      if (init?.signal?.aborted) throw err; // caller cancelled, don't retry
      if (i < delays.length) {
        campLog(`[CampOps] fetch attempt ${i + 1} failed, retrying in ${delays[i] / 1000}s: ${String(err)}`);
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
// network call), the lock is held and ALL subsequent Supabase calls · writes and
// reads, queue forever behind it (the symptom: dbUpsertIssue never logs SUCCESS
// or FAILED, and fetchWithRetry never even runs).  Single-tab app, so concurrent
// refresh races aren't a real concern.
let _lockSeq = 0;

/**
 * How long an auth operation may run before we call the client wedged.
 *
 * Generous: a token refresh on a slow connection is a couple of seconds, and the fetch layer's
 * own retry budget is ~10s. Anything past this is not slow, it is stuck.
 */
const AUTH_WEDGE_MS = 20_000;

async function lockNoOp<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const id = ++_lockSeq;
  campLog(`[CampOps] lockNoOp #${id} START ${name}`);

  // supabase-js resolves the access token *before* it builds a request, so an auth operation
  // that never settles takes every subsequent write with it: `.from(...).upsert()` awaits a
  // promise that will not resolve, our fetch wrapper is never reached, and the write dies
  // without a response, without an error, and without ever appearing in the retry logs. The
  // optimistic row stays on screen and vanishes on the next refresh. The bug this whole
  // change is about. Nothing downstream can observe it, so it is reported from here.
  // Defence in depth. The known cause (an async onAuthStateChange callback making a Supabase
  // call) is fixed in authStore, but any auth operation that never settles would wedge the
  // whole client again. Rejecting is strictly better than hanging: a rejected refresh settles
  // supabase-js's promise so the next operation can proceed, where a hung one poisons every
  // write for the life of the page.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wedge = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      campError(`[CampOps] auth op '${name}' exceeded ${AUTH_WEDGE_MS / 1000}s, failing it to keep the client usable`);
      recordWriteFailure({
        table: 'session',
        op: 'AUTH',
        status: null,
        message: 'The connection stopped responding. Recent changes may not have been saved.',
      });
      reject(new Error(`auth operation timed out after ${AUTH_WEDGE_MS}ms`));
    }, AUTH_WEDGE_MS);
  });

  try {
    const result = await Promise.race([fn(), wedge]);
    campLog(`[CampOps] lockNoOp #${id} DONE`);
    return result;
  } catch (err) {
    campLog(`[CampOps] lockNoOp #${id} THREW: ${String(err)}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry },
  auth: {
    // Persist the session in localStorage (per-origin) so returning users to
    // app.campcommand.app stay logged in. Per-origin storage is also what keeps the
    // marketing host (campcommand.app) session-free.
    persistSession: true,
    // Re-enabled. It was turned off because auto-refresh fired on every visibilitychange and
    // hung on stale TCP, holding the auth lock and blocking everything behind it. Both causes
    // are now neutralised independently: `lock: lockNoOp` removes the mutex that could be held,
    // and `_onVisibilityChanged` is stubbed out below so the visibility path never runs.
    //
    // Leaving it off had a worse failure of its own. supabase-js resolves the access token
    // *before* it calls our fetch wrapper, so an expired session made `.from(...).upsert()`
    // hang forever. The request was never issued, `fetchWithRetry` never ran, and the write
    // died silently while the optimistic row stayed on screen. That is the "logged something,
    // refreshed, it was gone" bug. The SDK refreshing on demand is what makes the token valid
    // by the time the request is built.
    autoRefreshToken: true,
    lock: lockNoOp,
  },
});

/**
 * Drop Supabase's persisted session from this browser.
 *
 * The fallback for when the network sign-out does not answer: the SDK only clears storage
 * once its own request settles, so a hung /auth/v1/logout leaves the token behind and the
 * next page load signs the user straight back in. Matches the chunked keys the SDK writes
 * for large sessions (`sb-<ref>-auth-token.0`) as well as the plain one.
 */
export function clearStoredAuthSession(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^sb-.+-auth-token/.test(key)) localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Nothing to clear.
  }
}

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
/**
 * Debug hooks for the write-durability work. Reproducing the bug is the only way to know the
 * fix works. The failure it targets happens after an hour of idle, which is not a thing you
 * can wait for while iterating.
 *
 *   campOpsDebug.expireToken()   corrupt the stored access token → next write 401s
 *   campOpsDebug.breakWrites(n)  force the next n mutating requests to fail outright
 */
export function installWriteDebugHooks(): void {
  const W = window as unknown as Record<string, unknown>;
  const debug = (W.campOpsDebug ??= {}) as Record<string, unknown>;

  debug.expireToken = () => {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.+-auth-token/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) {
          parsed.access_token = `${parsed.access_token}corrupt`;
          parsed.expires_at = Math.floor(Date.now() / 1000) - 10;
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch { /* chunked or unexpected shape, skip */ }
    }
    console.log('[campOpsDebug] access token corrupted + marked expired. Next write should 401.');
  };

  debug.breakWrites = (n = 1) => {
    W._campOpsBreakWrites = n;
    console.log(`[campOpsDebug] next ${n} mutating request(s) will fail.`);
  };
}

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

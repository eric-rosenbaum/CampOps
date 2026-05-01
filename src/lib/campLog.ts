// Persistent debug log — survives tab freezes and closed DevTools.
// After reproducing a bug: run  campLog.dump()  in the browser console.
const KEY = 'campops_log';
const MAX = 500;

type Entry = { t: string; msg: string };

function write(msg: string) {
  const raw = localStorage.getItem(KEY);
  const entries: Entry[] = raw ? JSON.parse(raw) : [];
  entries.push({ t: new Date().toISOString(), msg });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function campLog(...args: unknown[]) {
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  console.log(msg);
  try { write(msg); } catch { /* storage full or unavailable */ }
}

export function campError(...args: unknown[]) {
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  console.error(msg);
  try { write('[ERROR] ' + msg); } catch { /* */ }
}

// Expose to browser console for post-hoc inspection.
// Usage after a bug: campLog.dump()
(window as unknown as Record<string, unknown>).campLog = {
  dump: () => {
    const raw = localStorage.getItem(KEY);
    if (!raw) { console.log('(no campops_log entries)'); return; }
    const entries: Entry[] = JSON.parse(raw);
    entries.forEach((e) => console.log(e.t, e.msg));
  },
  clear: () => { localStorage.removeItem(KEY); console.log('cleared'); },
  raw: () => localStorage.getItem(KEY),
};

// Debug helper: simulate stale TCP without waiting 4+ minutes for a real idle period.
// Sets a flag that xhrFetch (supabase.ts) checks — each XHR will hang for hangMs then
// reject, exactly like a real stale connection.
//
// Usage:
//   campOpsDebug.simulateStaleFetch(100)   // fetches hang 100 ms then fail (fast test)
//   campOpsDebug.simulateStaleFetch()      // default: realistic 5 s hang
//   campOpsDebug.resetFetch()              // restore normal behaviour
//
// Typical test:
//   1. campOpsDebug.simulateStaleFetch(100)
//   2. Submit an issue — attempt 1 fails in ~100 ms
//   3. campOpsDebug.resetFetch()           — mimics "TCP recovered"
//   4. ~5 s later: retry succeeds (campLog.dump() to verify)
(window as unknown as Record<string, unknown>).campOpsDebug = {
  simulateStaleFetch: (hangMs = 5_000) => {
    (window as Record<string, unknown>)._campOpsXhrHangMs = hangMs;
    console.warn(`[campOpsDebug] simulateStaleFetch ACTIVE — XHR requests hang ${hangMs}ms. campOpsDebug.resetFetch() to stop.`);
  },
  resetFetch: () => {
    delete (window as Record<string, unknown>)._campOpsXhrHangMs;
    console.log('[campOpsDebug] simulateStaleFetch disabled — XHR restored');
  },
};

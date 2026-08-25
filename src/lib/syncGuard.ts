// ─── Sync guard ───────────────────────────────────────────────────────────────
// Every store mutation is optimistic: the local slice is updated immediately and the
// Supabase write is fired without awaiting it. Two separate mechanisms then reload the
// authoritative rows. The realtime channel (one reload per WAL event) and the periodic
// refetchAll in CampDataLoader. Neither used to know anything about writes still on the
// wire, which produced the "it didn't save until I refreshed and did it again" bug:
//
//   1. A save that rewrites a child table does DELETE-then-INSERT (camper restrictions,
//      recipe ingredients, order lines…). The DELETE's WAL event fires a reload whose
//      SELECT runs BEFORE the INSERT lands, so it reads the half-applied state.
//   2. Reloads had no ordering. Two overlapping reloads applied in completion order, so
//      the older snapshot could land last and overwrite the newer one.
//   3. Once the local store held the half-applied state, re-opening the edit modal
//      seeded its form from that state, and the next save wrote the loss back to the
//      database for real. That is why the data was gone after a refresh.
//
// This module closes all three: writes are counted at the fetch layer, reloads wait for
// write quiet, and each domain only ever applies its newest snapshot.

// ─── In-flight write tracking ────────────────────────────────────────────────
// Counted in supabase.ts's fetch wrapper, which every REST call goes through, so a new
// db helper is covered without having to remember to instrument it.

let _inFlight = 0;
let _lastSettledAt = 0;

export function noteWriteStart(): void {
  _inFlight++;
}

export function noteWriteEnd(): void {
  _inFlight = Math.max(0, _inFlight - 1);
  _lastSettledAt = Date.now();
}

export function writesInFlight(): number {
  return _inFlight;
}

/**
 * Resolve once no write has been on the wire for `quietMs`. Reloads call this before
 * reading so they never observe a half-applied multi-statement save.
 *
 * Bounded by `maxWaitMs`: a wedged write must not stop the app from ever refreshing.
 */
export async function awaitWriteQuiet(quietMs = 400, maxWaitMs = 8000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const now = Date.now();
    if (now >= deadline) return;
    if (_inFlight === 0) {
      const quietFor = now - _lastSettledAt;
      if (quietFor >= quietMs) return;
      await sleep(Math.min(quietMs - quietFor, deadline - now));
    } else {
      await sleep(Math.min(100, Math.max(0, deadline - now)));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

// ─── Per-domain snapshot ordering ────────────────────────────────────────────
// A "domain" is one subscription's slice of the world (issues, commissary-menu, …).
// Take a token before the read, then ask whether the result is still the newest one
// before applying it.

const _nextToken = new Map<string, number>();
const _appliedToken = new Map<string, number>();

export function beginSnapshot(domain: string): number {
  const token = (_nextToken.get(domain) ?? 0) + 1;
  _nextToken.set(domain, token);
  return token;
}

/** True if this snapshot is newer than whatever was applied last. Records it if so. */
export function shouldApplySnapshot(domain: string, token: number): boolean {
  if ((_appliedToken.get(domain) ?? 0) >= token) return false;
  _appliedToken.set(domain, token);
  return true;
}

/**
 * The whole read-and-apply dance for one domain: wait for write quiet, take a token,
 * load, and apply only if nothing newer already has. Returns whether it applied.
 */
export async function loadAndApply<T>(
  domain: string,
  load: () => Promise<T | null | undefined>,
  apply: (data: T) => void,
): Promise<boolean> {
  await awaitWriteQuiet();
  const token = beginSnapshot(domain);
  const data = await load();
  if (data == null) return false;
  if (!shouldApplySnapshot(domain, token)) return false;
  apply(data);
  return true;
}

/**
 * Collapse a burst of WAL events into a single reload. A save that touches four tables
 * fires four events; without this each one reloads the entire domain.
 */
export function debounce(fn: () => void, waitMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(); }, waitMs);
  };
}

/** How long to let WAL events settle before reloading a domain. */
export const WAL_DEBOUNCE_MS = 350;

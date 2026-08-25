import { create } from 'zustand';

/**
 * The record of writes that did not reach the database.
 *
 * Every mutating request in the app funnels through the fetch wrapper in `lib/supabase.ts`,
 * which makes that the one place able to notice a write dying, regardless of which store or
 * which of the ~136 `dbX()` helpers issued it. Those helpers log and return void, so the
 * caller cannot tell success from failure and the optimistic UI keeps showing a row the
 * database never accepted. Catching it at the transport chokepoint covers every path at once
 * rather than requiring each call site to be rewritten.
 *
 * Failures persist to localStorage deliberately: the symptom users report is "it was there,
 * then I refreshed and it was gone". A refresh must not be what erases the evidence.
 */

const KEY = 'campops_write_failures';
const MAX = 25;

export interface FailedWrite {
  id: string;
  /** Human-readable target, e.g. "retreats" or "issues". */
  table: string;
  /** insert | update | delete | rpc */
  op: string;
  /** HTTP status when there was a response; null when the request never completed. */
  status: number | null;
  message: string;
  at: string;
}

function read(): FailedWrite[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

function write(list: FailedWrite[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* storage full */ }
}

interface WriteFailureStore {
  failures: FailedWrite[];
  record: (f: Omit<FailedWrite, 'id' | 'at'>) => void;
  clear: () => void;
}

export const useWriteFailures = create<WriteFailureStore>((set, get) => ({
  failures: read(),
  record: (f) => {
    const entry: FailedWrite = {
      ...f,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
    };
    const next = [...get().failures, entry].slice(-MAX);
    set({ failures: next });
    write(next);
  },
  clear: () => { set({ failures: [] }); write([]); },
}));

/** Callable from non-React code (the fetch wrapper) without importing the hook everywhere. */
export function recordWriteFailure(f: Omit<FailedWrite, 'id' | 'at'>): void {
  useWriteFailures.getState().record(f);
}

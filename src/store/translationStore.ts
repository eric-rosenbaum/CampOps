/**
 * Translations of what people typed, for the current camp, in the reader's language only.
 *
 * Keyed `${source_table}:${source_id}:${field}` (see translationKey). One language at a time
 * because a reader only ever reads one: holding all three would triple the rows for nothing,
 * and a language change reloads (contentTranslationDb) rather than filtering.
 *
 * Deliberately free of the Supabase client, so the rules in lib/contentTranslation can be
 * unit-tested under plain Node. The Db module plugs `requester` in when it starts.
 */
import { create } from 'zustand';
import type { Lang } from '@/i18n';
import type { ContentTranslation, TranslationRef } from '@/lib/contentTranslation';

type Rows = Record<string, ContentTranslation>;

interface TranslationState {
  campId: string | null;
  /** The language whose snapshot is loaded; null until the first load lands (or if it failed). */
  loadedLang: Lang | null;
  rows: Rows;
  /** Asks the server for a missing translation. Null until contentTranslationDb starts. */
  requester: ((ref: TranslationRef, lang: Lang) => void) | null;

  reset: (campId: string | null) => void;
  applySnapshot: (campId: string, lang: Lang, rows: ContentTranslation[], startedAt: number) => void;
  upsert: (campId: string, lang: Lang, rows: ContentTranslation[]) => void;
  remove: (campId: string, row: Pick<ContentTranslation, 'id' | 'sourceTable' | 'sourceId' | 'field' | 'lang'>) => void;
  setRequester: (fn: TranslationState['requester']) => void;
}

export function rowKey(r: Pick<ContentTranslation, 'sourceTable' | 'sourceId' | 'field'>): string {
  return `${r.sourceTable}:${r.sourceId}:${r.field}`;
}

/**
 * Replace the rows with a snapshot, except where a row arrived by realtime or an on-demand
 * answer AFTER the snapshot's read began. Without this, an answer landing while a reload was
 * in flight was overwritten by the older snapshot, and because the ref had already been asked
 * for this session, it stayed in the original until the next periodic refetch.
 */
export function mergeSnapshot(
  prev: Rows, touchedAt: ReadonlyMap<string, number>, snapshot: readonly ContentTranslation[], startedAt: number,
): Rows {
  const next: Rows = {};
  for (const r of snapshot) next[rowKey(r)] = r;
  for (const [k, t] of touchedAt) {
    if (t > startedAt && prev[k]) next[k] = prev[k];
  }
  return next;
}

// When each key was last written by something newer than a snapshot. Not state: nothing renders
// from it, and keeping it out of the store keeps `rows` the only thing selectors see change.
const touchedAt = new Map<string, number>();

export const useTranslationStore = create<TranslationState>((set, get) => ({
  campId: null,
  loadedLang: null,
  rows: {},
  requester: null,

  reset: (campId) => {
    touchedAt.clear();
    set({ campId, loadedLang: null, rows: {} });
  },

  applySnapshot: (campId, lang, rows, startedAt) => {
    const s = get();
    if (s.campId !== campId) return;
    // A snapshot in a different language shares no rows with the one on screen. Before the
    // first snapshot, the rows are whatever realtime delivered in this language meanwhile.
    const prev = s.loadedLang === lang || s.loadedLang === null ? s.rows : {};
    set({ loadedLang: lang, rows: mergeSnapshot(prev, touchedAt, rows, startedAt) });
    touchedAt.clear();
  },

  upsert: (campId, lang, incoming) => {
    const s = get();
    // `lang` is the reader's language now; rows for a language still loading are kept so the
    // snapshot can merge them rather than lose an event that landed mid-read.
    if (s.campId !== campId || (s.loadedLang !== null && s.loadedLang !== lang)) return;
    const mine = incoming.filter((r) => r.lang === lang);
    if (mine.length === 0) return;
    const now = Date.now();
    const rows = { ...s.rows };
    for (const r of mine) {
      const k = rowKey(r);
      const had = rows[k];
      // An older answer (a slow on-demand call) must not replace a newer realtime row.
      if (had && had.updatedAt > r.updatedAt) continue;
      rows[k] = r;
      touchedAt.set(k, now);
    }
    set({ rows });
  },

  remove: (campId, r) => {
    const s = get();
    if (s.campId !== campId) return;
    const k = rowKey(r);
    if (!s.rows[k] || s.rows[k].id !== r.id) return;
    const rows = { ...s.rows };
    delete rows[k];
    set({ rows });
  },

  setRequester: (fn) => set({ requester: fn }),
}));

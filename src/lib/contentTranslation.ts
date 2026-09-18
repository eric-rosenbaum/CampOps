/**
 * Reading what other people typed, in your own language. See TranslatedText for the contract.
 *
 * Three layers, kept apart so the rules can be tested without a browser or a database:
 *   - this file: the rules (which row is current, what a reader sees, how requests batch) and
 *     the hooks screens call;
 *   - src/store/translationStore.ts: the rows for this camp in the reader's language;
 *   - src/lib/contentTranslationDb.ts: loading, realtime, and asking the server for what's
 *     missing. It plugs its requester into the store, so nothing here imports the client.
 */
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isLang, type Lang } from '@/i18n';
import { useTranslationStore } from '@/store/translationStore';

export type TranslatableSource = 'issues' | 'issue_comments' | 'issue_checklist_items';
export type TranslatableField = 'title' | 'description' | 'body' | 'text' | 'note';

/** One stored translation of one field, as the client holds it. */
export interface ContentTranslation {
  id: string;
  sourceTable: TranslatableSource;
  sourceId: string;
  field: TranslatableField;
  /** The language of `text`. */
  lang: Lang;
  /** The detected language of the original; null when the model could not tell. */
  sourceLang: string | null;
  /** The original this translation was made from. */
  sourceText: string;
  text: string;
  updatedAt: string;
}

/** A field somebody is looking at, with the original as it stands today. */
export interface TranslationRef {
  source: TranslatableSource;
  id: string;
  field: TranslatableField;
  text: string;
}

/** What the edge function takes: a row, not a field. It translates every field of it. */
export interface WireRef {
  source: TranslatableSource;
  id: string;
}

export function translationKey(source: TranslatableSource, id: string, field: TranslatableField): string {
  return `${source}:${id}:${field}`;
}

/**
 * A translation is only as good as the original it was made from. Once somebody edits the work
 * order, the stored translation describes text that no longer exists, and showing it would put
 * words in their mouth — so a mismatch means "show the original" until the new one lands.
 */
export function isCurrent(row: Pick<ContentTranslation, 'sourceText'> | undefined, original: string): boolean {
  return !!row && row.sourceText === original;
}

export interface Resolution {
  /** What to put on screen. */
  text: string;
  /** True when `text` is a translation rather than the original. */
  translated: boolean;
  /** The original's language when a current row says so. */
  sourceLang: string | null;
  /** True when nothing current exists yet, and the server should be asked for it. */
  missing: boolean;
}

/**
 * What a reader in `readerLang` sees for one field. A current row whose original was already in
 * the reader's language is the original (no marker): rows exist for the source language too, so
 * "already Spanish" is distinguishable from "not translated yet", and only the latter asks.
 */
export function resolveTranslation(
  row: ContentTranslation | undefined, original: string, readerLang: Lang,
): Resolution {
  const usable = row && row.lang === readerLang ? row : undefined;
  if (!usable || !isCurrent(usable, original)) {
    return { text: original, translated: false, sourceLang: null, missing: original.trim() !== '' };
  }
  const sameLanguage = usable.sourceLang === readerLang || usable.text === original;
  return {
    text: sameLanguage ? original : usable.text,
    translated: !sameLanguage,
    sourceLang: usable.sourceLang,
    missing: false,
  };
}

// ─── Asking for what is missing ──────────────────────────────────────────────
// Translations are made on write by the server; on-demand requests fill the gaps — rows written
// before the feature existed, a reader whose language the camp had not asked for yet, an edit
// the queue has not reached. They are cheap to send and expensive to answer (a model call), so
// every ref is asked for at most once per session for the same original.

/** A ref asked about in one language, for one version of its original. */
export function requestKey(ref: TranslationRef, lang: Lang): string {
  return `${lang}|${translationKey(ref.source, ref.id, ref.field)}|${ref.text}`;
}

export interface PendingRequest {
  ref: TranslationRef;
  lang: Lang;
}

/**
 * The next call to make: up to `max` distinct rows in one language, in the order they were
 * asked for. The server translates whole rows, so a title and a description of the same work
 * order share one wire ref. Everything not taken stays pending for the next call.
 */
export function planBatch(pending: readonly PendingRequest[], max: number): {
  lang: Lang | null; wire: WireRef[]; taken: PendingRequest[]; rest: PendingRequest[];
} {
  if (pending.length === 0) return { lang: null, wire: [], taken: [], rest: [] };
  const lang = pending[0].lang;
  const wire: WireRef[] = [];
  const inBatch = new Set<string>();
  const taken: PendingRequest[] = [];
  const rest: PendingRequest[] = [];
  for (const p of pending) {
    const rowKey = `${p.ref.source}:${p.ref.id}`;
    if (p.lang === lang && (inBatch.has(rowKey) || wire.length < max)) {
      if (!inBatch.has(rowKey)) { inBatch.add(rowKey); wire.push({ source: p.ref.source, id: p.ref.id }); }
      taken.push(p);
    } else {
      rest.push(p);
    }
  }
  return { lang, wire, taken, rest };
}

/** How long to wait after `failures` consecutive failed calls: 2s, 4s, 8s… capped at 5 minutes. */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(1000 * 2 ** failures, 5 * 60 * 1000);
}

export interface RequestQueueOptions {
  send: (refs: WireRef[], lang: Lang) => Promise<void>;
  debounceMs?: number;
  maxPerCall?: number;
  /** A ref that has failed this many calls is given up on for the session. */
  maxAttempts?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface RequestQueue {
  add: (ref: TranslationRef, lang: Lang) => void;
  /** Forget what is waiting (a camp change); what was already asked stays asked. */
  clearPending: () => void;
  pendingCount: () => number;
  dispose: () => void;
}

/**
 * Collects refs as screens render them, and sends them in batches: one call at a time, after
 * `debounceMs` of quiet, ≤ `maxPerCall` rows each. A board of forty cards rendering at once is
 * one call, not forty. A failed call puts its refs back and waits longer before the next one, so
 * a missing edge function costs a handful of requests per session rather than one per render.
 */
export function createRequestQueue(opts: RequestQueueOptions): RequestQueue {
  const debounceMs = opts.debounceMs ?? 300;
  const maxPerCall = opts.maxPerCall ?? 50;
  const maxAttempts = opts.maxAttempts ?? 3;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  const asked = new Set<string>();
  const attempts = new Map<string, number>();
  let pending: PendingRequest[] = [];
  let timer: unknown = null;
  let inFlight = false;
  let failures = 0;
  let disposed = false;

  const schedule = (ms: number) => {
    if (disposed || inFlight) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { timer = null; void flush(); }, ms);
  };

  async function flush() {
    if (disposed || inFlight || pending.length === 0) return;
    const { lang, wire, taken, rest } = planBatch(pending, maxPerCall);
    if (!lang) return;
    pending = rest;
    inFlight = true;
    try {
      await opts.send(wire, lang);
      failures = 0;
    } catch {
      failures++;
      for (const p of taken) {
        const k = requestKey(p.ref, p.lang);
        const n = (attempts.get(k) ?? 0) + 1;
        attempts.set(k, n);
        if (n < maxAttempts) pending.push(p);
      }
    } finally {
      inFlight = false;
    }
    if (pending.length > 0) schedule(Math.max(debounceMs, backoffMs(failures)));
  }

  return {
    add(ref, lang) {
      if (disposed || ref.text.trim() === '') return;
      const k = requestKey(ref, lang);
      if (asked.has(k)) return;
      asked.add(k);
      pending.push({ ref, lang });
      // While backing off, a new ref must not pull the next attempt forward.
      schedule(Math.max(debounceMs, backoffMs(failures)));
    },
    clearPending() {
      for (const p of pending) asked.delete(requestKey(p.ref, p.lang));
      pending = [];
    },
    pendingCount: () => pending.length,
    dispose() {
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending = [];
    },
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useReaderLang(): Lang {
  const { i18n } = useTranslation();
  return isLang(i18n.language) ? i18n.language : 'en';
}

/**
 * Asking is only meaningful once this camp's rows in this language have loaded: before then
 * every field looks missing, and a first paint would fire a request for the whole board. A camp
 * whose table failed to load never loads, so it never asks either.
 */
function ask(ref: TranslationRef, lang: Lang) {
  const s = useTranslationStore.getState();
  if (s.loadedLang !== lang || !s.requester) return;
  s.requester(ref, lang);
}

/**
 * One field, resolved for the reader. The engine behind `<TranslatedText>`; exported for the
 * rare screen that needs to know whether it is looking at a translation.
 */
export function useContentTranslation(
  source: TranslatableSource, id: string, field: TranslatableField, text: string,
): Resolution & { readerLang: Lang } {
  const readerLang = useReaderLang();
  // One row by key: a stable reference, not a fresh object per render (trap 2).
  const row = useTranslationStore((s) => s.rows[translationKey(source, id, field)]);
  const loadedLang = useTranslationStore((s) => s.loadedLang);
  const res = resolveTranslation(row, text, readerLang);
  const missing = res.missing;
  useEffect(() => {
    if (missing && loadedLang === readerLang) ask({ source, id, field, text }, readerLang);
  }, [missing, loadedLang, readerLang, source, id, field, text]);
  return { ...res, readerLang };
}

/**
 * The same, as a plain string, for places a component cannot go: `title=` attributes, search
 * matching, document titles. Returns the original until a current translation exists.
 */
export function useTranslatedString(
  source: TranslatableSource, id: string, field: TranslatableField, text: string,
): string {
  return useContentTranslation(source, id, field, text).text;
}

/**
 * A lookup for many rows at once — search over a board of work orders, sorting, exports.
 * Returns a function `(source, id, field, original) => string` that yields the reader's-language
 * text when a current translation exists and the original otherwise. Search should match BOTH
 * (see `searchableText`), so a Spanish reader finds "gotera" and the director still finds "leak".
 *
 * Its identity changes when the rows or the language do, so a `useMemo` that lists it as a
 * dependency recomputes when a translation lands.
 */
export function useTranslationLookup(): (
  source: TranslatableSource, id: string, field: TranslatableField, text: string,
) => string {
  const readerLang = useReaderLang();
  const rows = useTranslationStore((s) => s.rows);
  const loadedLang = useTranslationStore((s) => s.loadedLang);
  return useCallback((source, id, field, text) => {
    const res = resolveTranslation(rows[translationKey(source, id, field)], text, readerLang);
    // Asking only queues a timer; nothing here sets React state, so it is safe mid-render.
    if (res.missing && loadedLang === readerLang) ask({ source, id, field, text }, readerLang);
    return res.text;
  }, [rows, loadedLang, readerLang]);
}

/** Original + translation joined, for matching a search query against either language. */
export function searchableText(original: string, translated: string): string {
  return translated === original ? original : `${original}\n${translated}`;
}

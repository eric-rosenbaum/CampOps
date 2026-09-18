// The rules behind "read what other people typed in your own language": which stored row is
// current, what a reader sees, and how on-demand requests batch, dedupe and back off.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backoffMs, createRequestQueue, isCurrent, planBatch, requestKey, resolveTranslation, searchableText,
  translationKey, type ContentTranslation, type PendingRequest, type TranslationRef, type WireRef,
} from '@/lib/contentTranslation';
import type { Lang } from '@/i18n';
import { mergeSnapshot, rowKey } from '@/store/translationStore';

function row(p: Partial<ContentTranslation> = {}): ContentTranslation {
  return {
    id: 'ct1', sourceTable: 'issues', sourceId: 'WO-1', field: 'title', lang: 'en',
    sourceLang: 'es', sourceText: 'Gotera en la cabaña 4', text: 'Leak in cabin 4',
    updatedAt: '2026-09-18T12:00:00+00:00', ...p,
  };
}

const ref = (id: string, field: TranslationRef['field'] = 'title', text = `text ${id}`): TranslationRef =>
  ({ source: 'issues', id, field, text });

describe('keys', () => {
  it('builds the store key from table, id and field', () => {
    expect(translationKey('issue_comments', 'abc', 'body')).toBe('issue_comments:abc:body');
    expect(rowKey(row())).toBe(translationKey('issues', 'WO-1', 'title'));
  });

  it('asks again only when the original or the language changes', () => {
    const a = ref('1', 'title', 'Gotera');
    expect(requestKey(a, 'en')).toBe(requestKey({ ...a }, 'en'));
    expect(requestKey(a, 'en')).not.toBe(requestKey({ ...a, text: 'Gotera grande' }, 'en'));
    expect(requestKey(a, 'en')).not.toBe(requestKey(a, 'he'));
  });
});

describe('current and stale', () => {
  it('is current only while the original is exactly what it was translated from', () => {
    expect(isCurrent(row(), 'Gotera en la cabaña 4')).toBe(true);
    expect(isCurrent(row(), 'Gotera en la cabaña 5')).toBe(false);
    expect(isCurrent(row(), 'Gotera en la cabaña 4 ')).toBe(false);
    expect(isCurrent(undefined, 'x')).toBe(false);
  });

  it('shows the translation, marked, when a current row exists in another language', () => {
    expect(resolveTranslation(row(), 'Gotera en la cabaña 4', 'en')).toEqual({
      text: 'Leak in cabin 4', translated: true, sourceLang: 'es', missing: false,
    });
  });

  it('shows the original when the row is stale, and asks for a new one', () => {
    const r = resolveTranslation(row(), 'Gotera en la cabaña 4 — urgente', 'en');
    expect(r).toEqual({ text: 'Gotera en la cabaña 4 — urgente', translated: false, sourceLang: null, missing: true });
  });

  it('shows the original, unmarked and without asking, when it was already in the reader’s language', () => {
    const same = row({ lang: 'es', sourceLang: 'es', text: 'Gotera en la cabaña 4' });
    expect(resolveTranslation(same, 'Gotera en la cabaña 4', 'es')).toEqual({
      text: 'Gotera en la cabaña 4', translated: false, sourceLang: 'es', missing: false,
    });
  });

  it('treats an identical text of unknown language as the original (a name, a number)', () => {
    const r = resolveTranslation(row({ sourceLang: null, sourceText: 'Dock B', text: 'Dock B' }), 'Dock B', 'en');
    expect(r.translated).toBe(false);
    expect(r.missing).toBe(false);
  });

  it('ignores a row in some other language than the reader’s', () => {
    const r = resolveTranslation(row({ lang: 'he' }), 'Gotera en la cabaña 4', 'en');
    expect(r).toMatchObject({ text: 'Gotera en la cabaña 4', translated: false, missing: true });
  });

  it('never asks for an empty or blank original', () => {
    expect(resolveTranslation(undefined, '', 'en').missing).toBe(false);
    expect(resolveTranslation(undefined, '  \n', 'en').missing).toBe(false);
    expect(resolveTranslation(undefined, 'x', 'en').missing).toBe(true);
  });

  it('keeps newlines the person typed', () => {
    const r = resolveTranslation(row({ sourceText: 'a\nb', text: 'A\nB' }), 'a\nb', 'en');
    expect(r.text).toBe('A\nB');
  });
});

describe('searchableText', () => {
  it('matches either language, without doubling an untranslated original', () => {
    expect(searchableText('leak', 'leak')).toBe('leak');
    expect(searchableText('gotera', 'leak')).toBe('gotera\nleak');
  });
});

describe('planBatch', () => {
  const p = (id: string, lang: Lang = 'en', field: TranslationRef['field'] = 'title'): PendingRequest =>
    ({ ref: ref(id, field), lang });

  it('sends one wire ref per row, however many of its fields are waiting', () => {
    const out = planBatch([p('1', 'en', 'title'), p('1', 'en', 'description'), p('2')], 50);
    expect(out.wire).toEqual([{ source: 'issues', id: '1' }, { source: 'issues', id: '2' }]);
    expect(out.taken).toHaveLength(3);
    expect(out.rest).toHaveLength(0);
  });

  it('caps a call at `max` rows and keeps the rest, in order', () => {
    const pending = Array.from({ length: 120 }, (_, i) => p(String(i)));
    const first = planBatch(pending, 50);
    expect(first.wire).toHaveLength(50);
    expect(first.wire[0].id).toBe('0');
    expect(first.rest[0].ref.id).toBe('50');
    expect(planBatch(first.rest, 50).wire).toHaveLength(50);
    expect(planBatch(planBatch(first.rest, 50).rest, 50).wire).toHaveLength(20);
  });

  it('keeps a later field of a row already in the batch even past the cap', () => {
    const pending = [p('1'), p('2'), p('1', 'en', 'description')];
    const out = planBatch(pending, 2);
    expect(out.taken).toHaveLength(3);
  });

  it('batches one language at a time', () => {
    const out = planBatch([p('1', 'es'), p('2', 'he'), p('3', 'es')], 50);
    expect(out.lang).toBe('es');
    expect(out.wire.map((w) => w.id)).toEqual(['1', '3']);
    expect(out.rest.map((r) => r.lang)).toEqual(['he']);
  });

  it('is empty for nothing pending', () => {
    expect(planBatch([], 50)).toEqual({ lang: null, wire: [], taken: [], rest: [] });
  });
});

describe('backoffMs', () => {
  it('doubles and caps at five minutes', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(30)).toBe(300000);
  });
});

describe('createRequestQueue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('collects a burst into one call after the debounce', async () => {
    const calls: [WireRef[], Lang][] = [];
    const q = createRequestQueue({ send: async (refs, lang) => { calls.push([refs, lang]); } });
    for (let i = 0; i < 40; i++) q.add(ref(String(i)), 'es');
    await vi.advanceTimersByTimeAsync(299);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toHaveLength(40);
    expect(calls[0][1]).toBe('es');
  });

  it('never asks twice for the same ref and original in a session', async () => {
    const send = vi.fn(async () => {});
    const q = createRequestQueue({ send });
    q.add(ref('1', 'title', 'Gotera'), 'en');
    await vi.advanceTimersByTimeAsync(300);
    q.add(ref('1', 'title', 'Gotera'), 'en');
    q.add(ref('1', 'title', 'Gotera'), 'en');
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    // An edit is a new original, and is worth asking about.
    q.add(ref('1', 'title', 'Gotera grande'), 'en');
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('ignores blank text', async () => {
    const send = vi.fn(async () => {});
    const q = createRequestQueue({ send });
    q.add(ref('1', 'title', '   '), 'en');
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('splits more than fifty rows into calls made one at a time', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sizes: number[] = [];
    const q = createRequestQueue({
      send: async (refs) => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); sizes.push(refs.length);
        await new Promise((r) => setTimeout(r, 50));
        inFlight--;
      },
    });
    for (let i = 0; i < 120; i++) q.add(ref(String(i)), 'en');
    await vi.advanceTimersByTimeAsync(5000);
    expect(sizes).toEqual([50, 50, 20]);
    expect(maxInFlight).toBe(1);
  });

  it('backs off after a failure and gives up on a ref after three attempts', async () => {
    const at: number[] = [];
    const q = createRequestQueue({ send: async () => { at.push(Date.now()); throw new Error('404'); } });
    const start = Date.now();
    q.add(ref('1'), 'en');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(at.map((t) => t - start)).toEqual([300, 300 + 2000, 300 + 2000 + 4000]);
    expect(q.pendingCount()).toBe(0);
  });

  it('does not let a new ref pull a backed-off retry forward', async () => {
    const at: number[] = [];
    let fail = true;
    const q = createRequestQueue({ send: async () => { at.push(Date.now()); if (fail) throw new Error('500'); } });
    const start = Date.now();
    q.add(ref('1'), 'en');
    await vi.advanceTimersByTimeAsync(300);
    fail = false;
    q.add(ref('2'), 'en');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(at.map((t) => t - start)).toEqual([300, 300 + 2000]);
  });

  it('forgets pending refs on clearPending, so they can be asked again', async () => {
    const send = vi.fn(async () => {});
    const q = createRequestQueue({ send });
    q.add(ref('1'), 'en');
    q.clearPending();
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).not.toHaveBeenCalled();
    q.add(ref('1'), 'en');
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends nothing after dispose', async () => {
    const send = vi.fn(async () => {});
    const q = createRequestQueue({ send });
    q.add(ref('1'), 'en');
    q.dispose();
    q.add(ref('2'), 'en');
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('mergeSnapshot', () => {
  it('replaces rows with the snapshot', () => {
    const prev = { [rowKey(row({ sourceId: 'old' }))]: row({ sourceId: 'old' }) };
    const next = mergeSnapshot(prev, new Map(), [row()], 1000);
    expect(Object.keys(next)).toEqual([rowKey(row())]);
  });

  it('keeps a row that landed after the snapshot’s read began', () => {
    const fresh = row({ sourceId: 'WO-2', text: 'Fresh' });
    const k = rowKey(fresh);
    const next = mergeSnapshot({ [k]: fresh }, new Map([[k, 2000]]), [row()], 1000);
    expect(next[k]).toBe(fresh);
  });

  it('lets the snapshot win over a row touched before its read began', () => {
    const older = row({ text: 'Older' });
    const k = rowKey(older);
    const next = mergeSnapshot({ [k]: older }, new Map([[k, 500]]), [row()], 1000);
    expect(next[k].text).toBe('Leak in cabin 4');
  });
});

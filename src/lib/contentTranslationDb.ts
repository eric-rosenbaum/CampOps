/**
 * Supabase access for content translations: the snapshot load, the realtime channel, and the
 * on-demand requests to the `translate-content` edge function. Rules live in
 * lib/contentTranslation; rows live in store/translationStore.
 *
 * Everything here is best-effort. A translation is a convenience layered over the original, so
 * a missing table, a missing function or a failed call is logged and the board goes on showing
 * what people typed. Nothing here throws into a render or holds up a module's hydration gate.
 */
import i18n, { currentLang, isLang, type Lang } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { campLog } from '@/lib/campLog';
import { loadAndApply } from '@/lib/syncGuard';
import {
  createRequestQueue,
  type ContentTranslation, type TranslatableField, type TranslatableSource, type WireRef,
} from '@/lib/contentTranslation';
import { useTranslationStore } from '@/store/translationStore';

type Row = Record<string, unknown>;

const COLUMNS = 'id, source_table, source_id, field, lang, source_lang, source_text, text, updated_at';
const PAGE = 1000;
const DOMAIN = 'content_translations';

function rowToTranslation(r: Row): ContentTranslation | null {
  if (!isLang(r.lang) || typeof r.source_text !== 'string' || typeof r.text !== 'string') return null;
  return {
    id: String(r.id),
    sourceTable: r.source_table as TranslatableSource,
    sourceId: String(r.source_id),
    field: r.field as TranslatableField,
    lang: r.lang,
    sourceLang: typeof r.source_lang === 'string' ? r.source_lang : null,
    sourceText: r.source_text,
    text: r.text,
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : '',
  };
}

const toRows = (data: unknown): ContentTranslation[] =>
  (Array.isArray(data) ? data : []).map((r) => rowToTranslation(r as Row)).filter((r): r is ContentTranslation => !!r);

/**
 * Every row for this camp in one language. Paged: PostgREST caps a response at 1000 rows, and a
 * camp with a season of work orders, comments and checklist lines passes that in one language
 * alone — the first thousand would have been translated and the rest silently not.
 */
export async function loadContentTranslations(campId: string, lang: Lang): Promise<ContentTranslation[] | null> {
  try {
    const out: ContentTranslation[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('content_translations').select(COLUMNS)
        .eq('camp_id', campId).eq('lang', lang)
        .order('id').range(from, from + PAGE - 1);
      if (error) {
        campLog('[CampOps] content_translations load failed; showing originals:', error.message);
        return null;
      }
      const page = toRows(data);
      out.push(...page);
      if ((data?.length ?? 0) < PAGE) return out;
    }
  } catch (err) {
    campLog('[CampOps] content_translations load threw; showing originals:', String(err));
    return null;
  }
}

/** Reload the reader's language for this camp through the sync guard. Resolves to whether it applied. */
export function reloadContentTranslations(campId: string): Promise<boolean> {
  const lang = currentLang();
  const startedAt = Date.now();
  return loadAndApply(DOMAIN, () => loadContentTranslations(campId, lang), (rows) => {
    // The language may have changed while this read was on the wire; its own reload follows.
    if (currentLang() !== lang) return;
    useTranslationStore.getState().applySnapshot(campId, lang, rows, startedAt);
  }).catch(() => false);
}

async function requestTranslations(campId: string, refs: WireRef[], lang: Lang): Promise<void> {
  const { data, error } = await supabase.functions.invoke('translate-content', { body: { refs, lang } });
  if (error) {
    campLog('[CampOps] translate-content failed:', error.message);
    throw error;
  }
  const rows = toRows((data as { translations?: unknown } | null)?.translations);
  // Answers carry the camp's other target languages too; the store keeps the reader's.
  if (rows.length > 0 && currentLang() === lang) useTranslationStore.getState().upsert(campId, lang, rows);
}

let channelCount = 0;

/**
 * Start everything for one camp: the channel, the first load, reloads on a language change, and
 * the on-demand requester. Returns the teardown. Deliberately not part of any module's hydration
 * gate — the originals are a fine first paint, and a translation arriving a moment later swaps
 * in place.
 */
export function startContentTranslations(campId: string): () => void {
  const store = useTranslationStore.getState();
  store.reset(campId);

  const queue = createRequestQueue({ send: (refs, lang) => requestTranslations(campId, refs, lang) });
  store.setRequester((ref, lang) => queue.add(ref, lang));

  let stopped = false;
  const reload = () => { if (!stopped) void reloadContentTranslations(campId); };

  // Rows are applied one by one rather than reloading: they are written only by the server,
  // never optimistically here, so there is no half-applied save to guard against, and a reload
  // per translated field would refetch the whole camp for every work order anybody typed.
  // REPLICA IDENTITY FULL on the table is what makes `old` carry the key on a delete.
  const onChange = (payload: { eventType: string; new: Row; old: Row }) => {
    const lang = currentLang();
    if (payload.eventType === 'DELETE') {
      const r = rowToTranslation(payload.old);
      if (r) useTranslationStore.getState().remove(campId, r);
      return;
    }
    const r = rowToTranslation(payload.new);
    if (r) useTranslationStore.getState().upsert(campId, lang, [r]);
  };

  let everSubscribed = false;
  const channel = supabase.channel(`content-translations-${++channelCount}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'content_translations', filter: `camp_id=eq.${campId}` },
      onChange)
    .subscribe((status) => {
      campLog('[CampOps] content_translations channel status:', status);
      // A resubscribe means the socket dropped; whatever was written meanwhile was missed.
      if (status === 'SUBSCRIBED') {
        if (everSubscribed) setTimeout(reload, 10000);
        else everSubscribed = true;
      }
    });

  // A reader who switches to Hebrew needs the Hebrew rows, which were never loaded. What is on
  // screen goes back to the originals until they land, rather than showing Spanish to a reader
  // who just asked for Hebrew.
  const onLanguageChanged = (l: string) => {
    if (stopped || !isLang(l) || useTranslationStore.getState().loadedLang === l) return;
    useTranslationStore.getState().reset(campId);
    queue.clearPending();
    reload();
  };
  i18n.on('languageChanged', onLanguageChanged);

  reload();

  return () => {
    stopped = true;
    i18n.off('languageChanged', onLanguageChanged);
    queue.dispose();
    void supabase.removeChannel(channel);
    const s = useTranslationStore.getState();
    if (s.campId === campId) { s.setRequester(null); s.reset(null); }
  };
}

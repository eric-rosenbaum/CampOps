/**
 * Text a PERSON typed (a work order's title, a comment), shown in the reader's language.
 *
 * CONTRACT — this is the only way user-typed content is rendered on a translated surface:
 *   <TranslatedText source="issues" id={issue.id} field="title" text={issue.title} />
 *
 * - `text` is always the ORIGINAL, as stored. Translations never overwrite it, and edit forms
 *   always edit the original — never feed a translation into an input.
 * - `variant="inline"` (default) renders the translated string alone, with a small marker when it
 *   is a translation; use it in cards, lists and titles.
 * - `variant="block"` adds "Translated from Spanish · Show original" under the text; use it for
 *   the body of a detail view or a comment, where reading the original matters.
 *
 * Until a translation exists (or while it is being made) the original is shown. A translation
 * whose `sourceText` no longer matches `text` is stale — the row was edited — and is ignored.
 *
 * The implementation (store, loader, realtime, on-demand requests) lives in
 * src/lib/contentTranslation.ts and src/store/translationStore.ts.
 *
 * Rendering notes:
 * - `className` goes on the text element only, so a call site's `whitespace-pre-wrap` keeps the
 *   newlines somebody typed, in the translation as in the original.
 * - The block variant renders the text element and, when translated, a footer line beside it
 *   (a fragment, not a wrapper). Pass `as="p"` rather than wrapping it in your own <p>.
 * - Every rendering is `dir="auto"` and carries its `lang`: an English original inside a Hebrew
 *   page used to inherit right-to-left and put its full stop at the wrong end.
 */
import { useState, type ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import {
  useContentTranslation, type TranslatableField, type TranslatableSource,
} from '@/lib/contentTranslation';
import { isLang, type Lang } from '@/i18n';

export interface TranslatedTextProps {
  source: TranslatableSource;
  id: string;
  field: TranslatableField;
  /** The original, exactly as stored. */
  text: string;
  variant?: 'inline' | 'block';
  className?: string;
  /** The element to render. Default span (inline) / div (block). */
  as?: ElementType;
}

/** "Translated from Spanish", in the reader's language, whole — never assembled from pieces. */
function useTranslatedFrom(sourceLang: string | null, readerLang: Lang): string {
  const { t } = useTranslation('translation');
  if (!sourceLang) return t('from.unknown');
  if (isLang(sourceLang)) return t(`from.${sourceLang}`);
  let language = sourceLang;
  try {
    language = new Intl.DisplayNames([readerLang], { type: 'language' }).of(sourceLang) ?? sourceLang;
  } catch {
    /* an unrecognised tag: show the code rather than nothing */
  }
  return t('from.other', { language });
}

export function TranslatedText({ source, id, field, text, variant = 'inline', className, as }: TranslatedTextProps) {
  const { t } = useTranslation('translation');
  const res = useContentTranslation(source, id, field, text);
  const from = useTranslatedFrom(res.sourceLang, res.readerLang);
  const [showOriginal, setShowOriginal] = useState(false);
  const Tag = as ?? (variant === 'block' ? 'div' : 'span');

  if (!res.translated) {
    return <Tag className={className} dir="auto" lang={res.sourceLang ?? undefined}>{text}</Tag>;
  }

  if (variant === 'inline') {
    return (
      <Tag className={className} dir="auto" lang={res.readerLang} title={from}>
        {res.text}
        <Languages
          size={11}
          strokeWidth={2}
          role="img"
          aria-label={from}
          className="ms-1 inline-block shrink-0 align-[-1px] text-ink-faint"
        />
      </Tag>
    );
  }

  const shown = showOriginal ? text : res.text;
  return (
    <>
      <Tag className={className} dir="auto" lang={showOriginal ? res.sourceLang ?? undefined : res.readerLang}>
        {shown}
      </Tag>
      <span className="mt-1 flex items-center gap-1 text-[11px] leading-4 text-ink-faint">
        <Languages size={11} strokeWidth={2} aria-hidden className="shrink-0" />
        <span>{showOriginal ? t('original') : from}</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="font-medium text-ink-soft underline-offset-2 hover:underline"
        >
          {showOriginal ? t('showTranslation') : t('showOriginal')}
        </button>
      </span>
    </>
  );
}

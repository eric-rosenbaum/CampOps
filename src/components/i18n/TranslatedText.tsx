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
 */
import type { ElementType } from 'react';
import type { TranslatableField, TranslatableSource } from '@/lib/contentTranslation';

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

export function TranslatedText({ text, variant = 'inline', className, as }: TranslatedTextProps) {
  const Tag = as ?? (variant === 'block' ? 'div' : 'span');
  return <Tag className={className}>{text}</Tag>;
}

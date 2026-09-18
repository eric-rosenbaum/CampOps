/**
 * Reading what other people typed, in your own language. See TranslatedText for the contract.
 *
 * OWNER: the content-translation agent replaces these stubs with the real store lookups.
 */
export type TranslatableSource = 'issues' | 'issue_comments' | 'issue_checklist_items';
export type TranslatableField = 'title' | 'description' | 'body' | 'text' | 'note';

/**
 * The same, as a plain string, for places a component cannot go: `title=` attributes, search
 * matching, document titles. Returns the original until a current translation exists.
 */
export function useTranslatedString(
  _source: TranslatableSource, _id: string, _field: TranslatableField, text: string,
): string {
  return text;
}

/**
 * A lookup for many rows at once — search over a board of work orders, sorting, exports.
 * Returns a function `(source, id, field, original) => string` that yields the reader's-language
 * text when a current translation exists and the original otherwise. Search should match BOTH
 * (see `searchableText`), so a Spanish reader finds "gotera" and the director still finds "leak".
 */
export function useTranslationLookup(): (
  source: TranslatableSource, id: string, field: TranslatableField, text: string,
) => string {
  return (_s, _i, _f, text) => text;
}

/** Original + translation joined, for matching a search query against either language. */
export function searchableText(original: string, translated: string): string {
  return translated === original ? original : `${original}\n${translated}`;
}

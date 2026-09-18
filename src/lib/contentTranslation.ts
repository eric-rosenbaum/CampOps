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

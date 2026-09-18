/**
 * Whether the component is rendering inside a screen that has not been translated yet.
 *
 * Some components are shared between a translated screen and an English one — the add-staff
 * dialog opens from Camp Info (translated) and from Safety (not yet). Translated unconditionally,
 * it put a Spanish dialog in the middle of an English page. Such components read their strings
 * through `useScreenTranslation`, which answers in English inside an <Untranslated> screen and in
 * the reader's language everywhere else.
 */
import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlatNamespace } from 'i18next';

export const UntranslatedContext = createContext(false);

export function useScreenTranslation<N extends FlatNamespace>(ns: N) {
  const english = useContext(UntranslatedContext);
  return useTranslation(ns, english ? { lng: 'en' } : undefined);
}

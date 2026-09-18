/**
 * The interface language, one per person.
 *
 * Camps run on crews who speak Spanish or Hebrew first, and a work-order board a housekeeper
 * cannot read is a board they route around — they text the director instead, and the work never
 * lands in the queue. So the language is the person's, not the camp's: the director reads
 * English while the crew beside them reads Spanish, off the same rows.
 *
 * Where the choice lives, in order of authority:
 *   1. `profiles.preferred_language` — the account's answer, shared with the phone and used by
 *      the server to pick the language of push notifications and of translated work.
 *   2. localStorage — so the login screen, before there is an account, remembers the last answer.
 *   3. The browser's own language, when it is one we ship.
 *
 * Translation files are split by namespace so that each area of the app owns its own file.
 * Keys are type-checked against the English files (see i18next.d.ts), so a typo in `t('…')`
 * fails `tsc -b` rather than rendering a raw key to a crew member.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

export const LANGUAGES = ['en', 'es', 'he'] as const;
export type Lang = (typeof LANGUAGES)[number];

/** Right-to-left scripts. The whole layout mirrors for these, not just the text. */
const RTL: ReadonlySet<Lang> = new Set<Lang>(['he']);
export const isRtl = (l: Lang) => RTL.has(l);

export const isLang = (v: unknown): v is Lang =>
  typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

/** The language's own name for itself, which is what a person scanning a picker looks for. */
export const ENDONYM: Record<Lang, string> = { en: 'English', es: 'Español', he: 'עברית' };

const STORAGE_KEY = 'campcommand_language';

export const NAMESPACES = Object.keys(resources.en ?? {});

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function fromBrowser(): Lang {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const tag of langs) {
    const base = tag?.toLowerCase().split('-')[0];
    // "iw" is the pre-1989 code for Hebrew that some Android and Java stacks still report.
    if (base === 'iw') return 'he';
    if (isLang(base)) return base;
  }
  return 'en';
}

/** The language before any account has answered. */
export function initialLanguage(): Lang {
  return readStored() ?? fromBrowser();
}

/** Keeps <html lang dir> in step, which is what screen readers, fonts and `rtl:` variants read. */
function applyToDocument(l: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = l;
  document.documentElement.dir = isRtl(l) ? 'rtl' : 'ltr';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  ns: NAMESPACES,
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes.
  returnNull: false,
  // A missing Spanish string must fall back to English, never to the key. The locale test
  // makes this unreachable for shipped keys; this is the belt to that suspenders.
  react: { useSuspense: false },
});
applyToDocument(i18n.language as Lang);

i18n.on('languageChanged', (l) => {
  if (!isLang(l)) return;
  applyToDocument(l);
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* private mode: the profile still remembers it */
  }
});

export function currentLang(): Lang {
  return isLang(i18n.language) ? i18n.language : 'en';
}

/**
 * A label map whose values are read in the current language at the moment they are read.
 *
 * The app has module-level maps like STATUS_LABELS used as `STATUS_LABELS[s]` in dozens of
 * places. Making each value a getter keeps every one of those call sites as it was — they simply
 * start returning Spanish. Pages remount on a language change (Layout keys its outlet by
 * language), so nothing holds a stale English copy.
 */
export function localizedLabels<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) {
    Object.defineProperty(out, k, {
      enumerable: true,
      get: () => i18n.t(`${prefix}.${k}` as never) as string,
    });
  }
  return out;
}

export default i18n;

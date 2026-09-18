/**
 * Choosing a language, and keeping the account's answer and the screen in step.
 *
 * The profile is the authority once there is one (the phone reads the same column), so signing
 * in on a borrowed laptop set to English still shows a Spanish-speaking crew member Spanish.
 * Before sign-in, the last choice made on this device is used, then the browser's language.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { currentLang, isLang, type Lang } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

/** The current language, re-rendering the caller when it changes. */
export function useLang(): Lang {
  const { i18n: inst } = useTranslation();
  return isLang(inst.language) ? inst.language : 'en';
}

/**
 * A choice made on this device that the account has not confirmed yet, keyed by user.
 *
 * Before this, a person who picked Español and reloaded (or lost signal) before the profile
 * write landed got English back: on load the profile still said English, and the profile wins.
 * The unsaved choice now outranks the profile for that user until a write succeeds.
 */
const PENDING_KEY = 'campcommand_language_pending';

function readPending(userId: string): Lang | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { userId?: string; lang?: unknown } | null;
    return raw && raw.userId === userId && isLang(raw.lang) ? raw.lang : null;
  } catch {
    return null;
  }
}

function writePending(userId: string, lang: Lang | null) {
  try {
    if (lang) localStorage.setItem(PENDING_KEY, JSON.stringify({ userId, lang }));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode: the write below is then the only record */
  }
}

async function saveToProfile(userId: string, l: Lang): Promise<void> {
  writePending(userId, l);
  const { error } = await supabase.from('profiles').update({ preferred_language: l }).eq('id', userId);
  if (error) {
    console.warn('[language] could not save preferred_language; will retry on next load', error.message);
    return;
  }
  // Only clear the marker if it is still this choice — a later pick may have replaced it.
  if (readPending(userId) === l) writePending(userId, null);
}

/**
 * Switch the interface now and remember it on the account.
 *
 * The screen switches first and the write follows: a language change must never wait on the
 * network. Until the write lands, the choice is held as pending on this device (see above).
 */
export async function setLanguage(l: Lang): Promise<void> {
  const { user, profile } = useAuthStore.getState();
  // Recorded before anything awaits: the page can be left the instant the language visibly
  // changes, and a marker written after an await was never written at all.
  if (user) writePending(user.id, l);
  if (profile) useAuthStore.setState({ profile: { ...profile, preferredLanguage: l } });
  if (l !== currentLang()) await i18n.changeLanguage(l);
  if (user) await saveToProfile(user.id, l);
}

/**
 * Mounted once near the root. Applies the account's language when the profile arrives, and
 * records the device's language on an account that has never answered — so the server knows to
 * translate work into Spanish for the crew member who never opened a settings page. An unsaved
 * choice from this device wins over the profile and is re-sent.
 */
export function LanguageSync() {
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!profile || !userId || profile.id !== userId) return;
    const pending = readPending(userId);
    if (pending && pending !== profile.preferredLanguage) {
      if (pending !== currentLang()) void i18n.changeLanguage(pending);
      void saveToProfile(userId, pending);
    } else if (profile.preferredLanguage) {
      if (pending) writePending(userId, null);
      if (profile.preferredLanguage !== currentLang()) void i18n.changeLanguage(profile.preferredLanguage);
    } else {
      void setLanguage(currentLang());
    }
  }, [profile, userId]);
  return null;
}

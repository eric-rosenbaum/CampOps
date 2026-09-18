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
 * Switch the interface now and remember it on the account.
 *
 * The screen switches first and the write follows: a language change must never wait on the
 * network, and if the write fails the device still remembers it (localStorage) until next time.
 */
export async function setLanguage(l: Lang): Promise<void> {
  if (l !== currentLang()) await i18n.changeLanguage(l);
  const { user, profile } = useAuthStore.getState();
  if (!user) return;
  if (profile) useAuthStore.setState({ profile: { ...profile, preferredLanguage: l } });
  const { error } = await supabase.from('profiles').update({ preferred_language: l }).eq('id', user.id);
  if (error) console.warn('[language] could not save preferred_language', error.message);
}

/**
 * Mounted once near the root. Applies the account's language when the profile arrives, and
 * records the device's language on an account that has never answered — so the server knows to
 * translate work into Spanish for the crew member who never opened a settings page.
 */
export function LanguageSync() {
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!profile || !userId || profile.id !== userId) return;
    if (profile.preferredLanguage) {
      if (profile.preferredLanguage !== currentLang()) void i18n.changeLanguage(profile.preferredLanguage);
    } else {
      void setLanguage(currentLang());
    }
  }, [profile, userId]);
  return null;
}

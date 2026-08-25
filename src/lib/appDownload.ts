// The iOS app handoff shown to staff who join from a phone.
//
// The app is not on the App Store yet, so IOS_APP_STORE_URL is deliberately empty and every
// entry point checks `shouldOfferAppDownload()` first. With no URL set the handoff screen is
// inert (it redirects straight through to the dashboard) so this can ship before the app
// does. Fill in the URL (App Store or TestFlight) to turn it on; nothing else needs changing.
export const IOS_APP_STORE_URL = '';

/**
 * The Android build does not exist yet. This is here so the platform chooser at /get-started
 * already has a slot for it: filling in the Play Store URL is the only change needed to turn
 * that card from "coming soon" into a working download.
 */
export const ANDROID_PLAY_STORE_URL = '';

/** True once a real store/TestFlight link is configured above. */
export const IOS_APP_AVAILABLE = IOS_APP_STORE_URL.trim().length > 0;

export const ANDROID_APP_AVAILABLE = ANDROID_PLAY_STORE_URL.trim().length > 0;

/**
 * iPhone/iPad detection. iPadOS 13+ reports a desktop "Macintosh" user agent, so it is
 * identified by the presence of touch points instead.
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod|iPad/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

export type DevicePlatform = 'ios' | 'android' | 'web';

/** Which platform card the chooser should put first and highlight. */
export function detectPlatform(): DevicePlatform {
  if (isIOSDevice()) return 'ios';
  if (isAndroidDevice()) return 'android';
  return 'web';
}

/** Whether to show the "get the app" handoff to this visitor. */
export function shouldOfferAppDownload(): boolean {
  return IOS_APP_AVAILABLE && isIOSDevice();
}

// Shown once per account per device. Someone who skipped it while setting up on a laptop
// shouldn't be nagged, and someone who installed the app shouldn't see it again on the web.
const SEEN_KEY = 'campcommand_app_handoff_seen';

export function hasSeenAppHandoff(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAppHandoffSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private mode / storage disabled: worst case they see the screen again. Not worth failing.
  }
}

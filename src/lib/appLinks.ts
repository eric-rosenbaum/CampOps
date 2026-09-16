/**
 * The iPhone app, from the web.
 *
 * A sticker on a cabin door is scanned by a phone camera, and the person holding it is either
 * a guest (who should get the report form) or a crew member (who should get the app). Both
 * paths start at the same URL, so the web page has to offer the app without getting in the way
 * of the form.
 *
 * Two mechanisms, deliberately, and neither of them is a custom `campcommand://` URL:
 *
 *  - **The universal link.** The sticker encodes `https://<app host>/l/<token>`. Once the app
 *    ships with that domain in its associated-domains entitlement and the matching
 *    `apple-app-site-association` file is live at the host, the iOS camera opens the app
 *    straight onto that cabin and this page is never drawn. That is what "open the app with the
 *    location selected" actually is.
 *  - **The Smart App Banner** below, for the case where they landed on the web page anyway
 *    (iOS remembers "stay in Safari" per domain). It says OPEN when the app is installed and
 *    VIEW when it is not, and iOS decides which — we cannot, and guessing is the whole problem.
 *
 * What we do NOT do is navigate to a custom scheme and race a timer against the App Store.
 * On a phone without the app that shows "Safari cannot open the page because the address is
 * invalid" — a broken-looking modal shown to the majority, in front of a form they came to
 * fill in.
 */

/** Numeric App Store id for CampCommand. Used by the banner meta tag and the store link. */
export const APP_STORE_ID = '6761935106';
export const APP_STORE_URL = `https://apps.apple.com/us/app/campcommand/id${APP_STORE_ID}`;

/**
 * iPhone or iPad.
 *
 * iPadOS reports itself as a Mac, so the touch-point check is not optional — without it every
 * iPad user is told the app does not exist. Mac desktops report `maxTouchPoints === 0`.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * Put an Apple Smart App Banner on the page for as long as the component is mounted.
 *
 * `app-argument` is the URL the app is handed when someone taps OPEN, so the app lands on the
 * scanned location rather than on its own home screen. The tag is inert everywhere but mobile
 * Safari, which is the only browser that draws the banner at all.
 *
 * Mounted and removed rather than written once into index.html: the argument is per-sticker,
 * and a stale one would send the app to whichever door was scanned before this one.
 */
export function installSmartAppBanner(argumentUrl: string): () => void {
  if (typeof document === 'undefined') return () => {};
  const meta = document.createElement('meta');
  meta.name = 'apple-itunes-app';
  meta.content = `app-id=${APP_STORE_ID}, app-argument=${argumentUrl}`;
  document.head.appendChild(meta);
  return () => { meta.remove(); };
}

/** The canonical sticker URL for a token — what the QR encodes and what the app is handed. */
export function stickerLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/l/${token}`;
}

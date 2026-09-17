/**
 * Which deployment this build is, and the hostnames it answers on.
 *
 * These used to be constants in App.tsx, which was fine while there was one deployment. With a
 * staging environment there are three, and hardcoded hosts fail in a quiet way: a staging build
 * whose host matches neither the marketing nor the app host renders the marketing page where
 * the product should be, and signs people out to production.
 *
 * Every default here is the production value. An environment that forgets to set these behaves
 * exactly as production always has, so the failure mode of a missing variable is "no change"
 * rather than "subtly wrong".
 */

export type AppEnv = 'production' | 'staging' | 'development';

/** Comma-separated in the environment: "campcommand.app,www.campcommand.app". */
export const MARKETING_HOSTS: string[] = (
  (import.meta.env.VITE_MARKETING_HOSTS as string | undefined) ?? 'campcommand.app,www.campcommand.app'
).split(',').map((h) => h.trim()).filter(Boolean);

/** Where the product lives. Everything authenticated is served from here. */
export const APP_HOST: string =
  (import.meta.env.VITE_APP_HOST as string | undefined) ?? 'app.campcommand.app';

/** The public site, used when signing out of the product. */
export const MARKETING_ORIGIN = `https://${MARKETING_HOSTS[0]}`;

/**
 * The host printed on a QR sticker.
 *
 * Not simply `MARKETING_HOSTS[0]`, and the reason is Apple. A sticker only opens the iOS app if
 * the host it encodes is one the app is associated with, and association requires Apple to fetch
 * `/.well-known/apple-app-site-association` from that exact host with a 200 — it does not follow
 * redirects. The apex answers 307 to `www`, so every sticker printed with the apex on it opened
 * Safari even on a phone with the app installed.
 *
 * `www` serves the file directly, so that is what new stickers carry. If the apex is ever made
 * to serve `/.well-known/*` without redirecting, this can go back to the shorter host.
 */
export const STICKER_HOST: string =
  (import.meta.env.VITE_STICKER_HOST as string | undefined)
  ?? MARKETING_HOSTS.find((h) => h.startsWith('www.'))
  ?? MARKETING_HOSTS[0];

/**
 * Explicit wins; otherwise inferred from the host.
 *
 * The inference fails safe. Only a host we recognise as production is treated as production, so
 * an unlabelled preview deploy shows the staging banner rather than passing itself off as the
 * real thing. Getting that backwards is how someone demos the wrong environment to a customer.
 */
function detectEnv(): AppEnv {
  const explicit = import.meta.env.VITE_APP_ENV as AppEnv | undefined;
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') return explicit;

  if (typeof window === 'undefined') return 'production';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return 'development';
  if (host === APP_HOST || MARKETING_HOSTS.includes(host)) return 'production';
  return 'staging';
}

export const APP_ENV: AppEnv = detectEnv();
export const IS_PRODUCTION = APP_ENV === 'production';

/**
 * Which database this build is talking to, as a bare project ref.
 *
 * Shown in the environment banner. "Am I on the staging data or the real data" is the question
 * staging environments exist to make answerable, and it should not require opening devtools.
 */
export function databaseRef(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return url.replace(/^https?:\/\//, '').split('.')[0] || 'unknown';
}

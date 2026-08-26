/// <reference types="vite/client" />

/**
 * Typed so a misspelled variable is a compile error rather than `undefined` at runtime, which
 * on a staging deploy would silently fall back to the production host.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** 'production' | 'staging' | 'development'. Inferred from the host when unset. */
  readonly VITE_APP_ENV?: string;
  /** Comma-separated public hostnames, e.g. "campcommand.app,www.campcommand.app". */
  readonly VITE_MARKETING_HOSTS?: string;
  /** Hostname the authenticated product is served from. */
  readonly VITE_APP_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

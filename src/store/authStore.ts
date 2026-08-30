import { create } from 'zustand';
import { supabase, clearStoredAuthSession } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { useCampStore } from '@/store/campStore';

export interface Profile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

/**
 * Emailed sign-in codes are NOT always 6 digits. The length is a project setting
 * (Authentication → Sign In / Providers → Email → "Email OTP Length") and can be 6–10, so the
 * UI accepts a range and lets the server be the judge. Hardcoding 6 here silently truncated
 * longer codes and made them impossible to submit.
 */
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

export interface SignUpResult {
  error: string | null;
  /** True when the project requires a confirmation click before the account can sign in. */
  needsEmailConfirmation: boolean;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    emailRedirectTo?: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  sendEmailOtp: (email: string, fullName?: string) => Promise<string | null>;
  verifyEmailOtp: (email: string, token: string) => Promise<string | null>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  /** Does this account have a password to confirm, or is it magic-link-only? */
  hasUsablePassword: () => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,

  initialize: async () => {
    let session = (await supabase.auth.getSession()).data.session;
    // A returning user's stored access token may already be expired. Refresh it once here
    // using the refresh token so they don't appear logged out on the first paint. The SDK's
    // own auto-refresh keeps it fresh from then on.
    if (session?.expires_at && session.expires_at * 1000 - Date.now() < 60_000) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session) session = data.session;
      else if (error) session = null; // refresh token dead → truly signed out
    }
    if (session?.user) {
      const profile = await fetchProfile(session.user.id);
      set({ session, user: session.user, profile, isLoading: false });
    } else {
      set({ isLoading: false });
    }

    // NOTE: this callback must stay synchronous, and must never call Supabase.
    //
    // supabase-js awaits an async auth callback while it still holds its auth lock. A Supabase
    // call made from inside it needs that same lock to read the access token, so it waits for a
    // lock held by the thing waiting for it. Nothing times out: the promise simply never
    // settles, and because the token is resolved before any request is built, EVERY later write
    // on the page inherits the deadlock, `.from(...).upsert()` awaits forever, the fetch layer
    // is never reached, and the write dies with no response and no error while its optimistic
    // row stays on screen. That is the "logged something, refreshed, it was gone" bug, and it
    // fires on TOKEN_REFRESHED, which is why it follows an idle period.
    //
    // The profile read is therefore pushed to a fresh task, where the lock is no longer held.
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Set session immediately so components that check session don't race with profile fetch
        set({ session, user: session.user });
        const userId = session.user.id;
        setTimeout(() => {
          void fetchProfile(userId)
            .then((profile) => { if (get().user?.id === userId) set({ profile }); })
            .catch(() => { /* profile is non-critical; the session is already applied */ });
        }, 0);
      } else {
        set({ session: null, user: null, profile: null });
      }
    });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      // A deliberate login always starts fresh: a platform admin lands on /admin, never dropped
      // into a camp. (The per-tab "currently viewing" marker only survives a page refresh.)
      sessionStorage.removeItem('campcommand_admin_camp_id');
    }
    return error?.message ?? null;
  },

  /**
   * Create an account.
   *
   * `emailRedirectTo` is where the confirmation link lands the user. It matters more than it
   * looks: when "Confirm email" is on, signUp returns NO session, so the caller cannot finish
   * joining a camp inline. The join has to resume after the user clicks the link in their
   * inbox. That inbox is very often a different browser (Gmail's in-app view on a phone), so
   * sessionStorage cannot carry the invite token or join code across. Putting the destination
   * in the confirmation URL is what makes the round trip survive a device switch.
   *
   * Returns `needsEmailConfirmation` so callers can show "check your email" instead of
   * silently doing nothing.
   */
  signUp: async (email, password, fullName, emailRedirectTo) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };
    // A user with no session means the project requires confirmation before sign-in.
    return { error: null, needsEmailConfirmation: !data.session && !!data.user };
  },

  /**
   * Sign out. Never rejects, and never waits on the network longer than it has to.
   *
   * `supabase.auth.signOut()` POSTs to /auth/v1/logout. On a stale TCP connection. The
   * same failure this client's XHR/retry wrapper exists for. That call either retries for
   * ~15 seconds or rejects. Callers awaited it before redirecting, so the redirect never
   * ran and the button looked dead until the page was refreshed (a refresh gets a fresh
   * connection, which is why the second attempt always worked).
   *
   * Revoking the refresh token server-side is best effort; being signed out on THIS device
   * is not. So we time-box the request and, if it does not answer, drop the stored session
   * locally and let the refresh token expire on its own.
   */
  signOut: async () => {
    // Below the fetch wrapper's own 4s per-attempt abort, so a stale connection costs one
    // short wait instead of the full retry ladder.
    const REVOKE_TIMEOUT_MS = 3500;
    let revoked = false;
    try {
      revoked = await Promise.race([
        supabase.auth.signOut().then(({ error }) => !error),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), REVOKE_TIMEOUT_MS)),
      ]);
    } catch {
      revoked = false;
    }
    if (!revoked) clearStoredAuthSession();

    // Clear the "currently viewing" markers so the next login starts clean (admins → /admin).
    sessionStorage.removeItem('campcommand_admin_camp_id');
    localStorage.removeItem('campcommand_selected_camp_id');
    set({ session: null, user: null, profile: null });
    useCampStore.setState({ currentCamp: null, currentMember: null, members: [], camps: [], isLoading: true });
  },

  /**
   * Email a 6-digit sign-in code, creating the account if this address is new.
   *
   * This is the staff lane. One code does the work of three separate steps. Create the
   * account, prove the address is real, and sign in. Because you cannot read the code
   * without controlling the inbox. That's why the staff flow has no "confirm your email"
   * hop and no password to forget.
   *
   * Creating a bare account grants nothing: camp access still comes only from
   * join_camp_with_code(), which validates the code server-side.
   *
   * Requires `{{ .Token }}` in the Magic Link email template, otherwise Supabase sends a
   * clickable link instead of a code.
   */
  sendEmailOtp: async (email, fullName) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        // Read by the handle_new_user trigger to populate profiles.full_name.
        ...(fullName ? { data: { full_name: fullName.trim() } } : {}),
      },
    });
    return error?.message ?? null;
  },

  verifyEmailOtp: async (email, token) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    if (error) {
      if (/expired/i.test(error.message)) return 'That code has expired, request a new one.';
      if (/invalid/i.test(error.message)) return 'That code isn’t right. Check it and try again.';
      return error.message;
    }
    sessionStorage.removeItem('campcommand_admin_camp_id');
    return null;
  },

  requestPasswordReset: async (email) => {
    // The reset email links back to /reset-password on whatever host sent it (app subdomain
    // in production). That path is in Supabase's allowed redirect URLs.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return error?.message ?? null;
  },

  updatePassword: async (password) => {
    // Race against a timeout: this app runs Supabase auth with a no-op lock + no auto-refresh,
    // and updateUser can occasionally never settle. Always resolve so the UI can't hang.
    try {
      const res = await Promise.race([
        supabase.auth.updateUser({ password }),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: 'The request timed out. Please try again.' } }), 15000)),
      ]);
      return (res as { error: { message: string } | null }).error?.message ?? null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not update your password.';
    }
  },

  hasUsablePassword: async () => {
    // auth.users isn't readable from the client, so a SECURITY DEFINER RPC answers this.
    // Fail closed: if we can't tell, ask for the current password rather than letting an
    // open session set a new one unchallenged.
    const { data, error } = await supabase.rpc('has_usable_password');
    if (error) return true;
    return data === true;
  },

  changePassword: async (currentPassword, newPassword) => {
    const email = get().user?.email;
    if (!email) return 'You need to be signed in to change your password.';

    // updateUser() never checks the old password, so an unattended logged-in session could
    // otherwise be taken over silently. Re-authenticate first. This returns a fresh session
    // for the same user, which is harmless.
    const { error: reauth } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauth) {
      return /invalid/i.test(reauth.message)
        ? 'That current password isn’t right.'
        : reauth.message;
    }

    return get().updatePassword(newPassword);
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const profile = await fetchProfile(user.id);
    set({ profile });
  },
}));

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', userId)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    avatarUrl: data.avatar_url ?? null,
  };
}

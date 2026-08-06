import { create } from 'zustand';
import { supabase, clearStoredAuthSession } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { useCampStore } from '@/store/campStore';

export interface Profile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,

  initialize: async () => {
    let session = (await supabase.auth.getSession()).data.session;
    // autoRefreshToken is disabled (stale-TCP safety), so a returning user's stored access
    // token may be expired. Refresh it once here using the refresh token, otherwise they'd
    // appear logged out (or hit 401s) until the heartbeat fires. Keeps "remember me" working.
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

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // Set session immediately so components that check session don't race with profile fetch
        set({ session, user: session.user });
        const profile = await fetchProfile(session.user.id);
        set({ profile });
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

  signUp: async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return error?.message ?? null;
  },

  /**
   * Sign out. Never rejects, and never waits on the network longer than it has to.
   *
   * `supabase.auth.signOut()` POSTs to /auth/v1/logout. On a stale TCP connection — the
   * same failure this client's XHR/retry wrapper exists for — that call either retries for
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
          setTimeout(() => resolve({ error: { message: 'The request timed out — please try again.' } }), 15000)),
      ]);
      return (res as { error: { message: string } | null }).error?.message ?? null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not update your password.';
    }
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

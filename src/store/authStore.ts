import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
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

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
    useCampStore.setState({ currentCamp: null, currentMember: null, members: [], camps: [], isLoading: true });
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

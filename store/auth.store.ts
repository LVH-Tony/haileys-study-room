import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { UserProfile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { registerPushToken } from '@/lib/notifications';

interface AuthState {
  session: Session | null;
  // undefined = not yet fetched, null = fetched but no row found, UserProfile = loaded
  profile: UserProfile | null | undefined;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null | undefined) => void;
  setLoading: (loading: boolean) => void;
  fetchProfile: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: undefined,
  loading: true,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),

  fetchProfile: async (userId: string) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    set({ profile: data ?? null });
    // Register push token so friends can nudge this user
    if (data?.id) registerPushToken(data.id).catch(() => {});
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: undefined });
  },
}));

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type ReminderMode = 'window' | 'specific';
export type ReminderWindow = 'morning' | 'afternoon' | 'evening';

export interface UserSettings {
  user_id: string;
  wotd_enabled: boolean;
  reminder_enabled: boolean;
  reminder_mode: ReminderMode;
  reminder_window: ReminderWindow;
  reminder_time: string;
  reminder_repeat_count: number;
  reminder_repeat_gap: number;
}

interface WotdEntry {
  id: string;
  word_id: string;
  date: string;
  seen: boolean;
  words: {
    id: string;
    word: string;
    image_url: string | null;
    audio_url: string | null;
    difficulty_score: number;
    topics: { name: string } | null;
  };
}

interface SettingsState {
  settings: UserSettings | null;
  wotd: WotdEntry | null;
  loading: boolean;
  fetchSettings: (userId: string) => Promise<void>;
  updateSettings: (userId: string, patch: Partial<UserSettings>) => Promise<void>;
  fetchWotd: (userId: string) => Promise<void>;
  markWotdSeen: (wotdId: string) => Promise<void>;
}

const DEFAULT_SETTINGS: Omit<UserSettings, 'user_id'> = {
  wotd_enabled: true,
  reminder_enabled: true,
  reminder_mode: 'window',
  reminder_window: 'evening',
  reminder_time: '20:00',
  reminder_repeat_count: 1,
  reminder_repeat_gap: 30,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  wotd: null,
  loading: false,

  fetchSettings: async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!data) {
        // Auto-create default settings if trigger missed it
        const defaults = { user_id: userId, ...DEFAULT_SETTINGS };
        await supabase.from('user_settings').insert(defaults);
        set({ settings: defaults });
      } else {
        set({ settings: data });
      }
    } catch (e) {
      console.warn('[settings] fetchSettings error:', e);
    }
  },

  updateSettings: async (userId: string, patch: Partial<UserSettings>) => {
    const current = get().settings;
    const updated = { ...current, ...patch, user_id: userId, updated_at: new Date().toISOString() } as UserSettings;
    set({ settings: updated });
    await supabase
      .from('user_settings')
      .upsert(updated)
      .eq('user_id', userId);
  },

  fetchWotd: async (userId: string) => {
    set({ loading: true });
    try {
      // Get the current session token to pass to the edge function
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        set({ wotd: null, loading: false });
        return;
      }
      const { data, error } = await supabase.functions.invoke('word-of-the-day', {
        body: { userId },
      });
      if (error) {
        console.warn('[wotd] edge function error:', error.message);
        set({ wotd: null, loading: false });
        return;
      }
      set({ wotd: data?.wotd ?? null, loading: false });
    } catch (e) {
      console.warn('[wotd] fetchWotd error:', e);
      set({ wotd: null, loading: false });
    }
  },

  markWotdSeen: async (wotdId: string) => {
    await supabase.from('word_of_the_day').update({ seen: true }).eq('id', wotdId);
    set((s) => s.wotd ? { wotd: { ...s.wotd, seen: true } } : {});
  },
}));

import { create } from 'zustand';
import { AiSuggestion, LessonHistory } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

interface ProgressState {
  lessonHistory: LessonHistory[];
  aiSuggestion: AiSuggestion | null;
  fetchLessonHistory: (userId: string) => Promise<void>;
  fetchAiSuggestion: (userId: string) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
  addXp: (userId: string, amount: number) => Promise<void>;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  lessonHistory: [],
  aiSuggestion: null,

  fetchLessonHistory: async (userId: string) => {
    const { data } = await supabase
      .from('lesson_history')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(50);
    set({ lessonHistory: data ?? [] });
  },

  fetchAiSuggestion: async (userId: string) => {
    const { data } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('user_id', userId)
      .eq('dismissed', false)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();
    set({ aiSuggestion: data ?? null });
  },

  dismissSuggestion: async (id: string) => {
    await supabase.from('ai_suggestions').update({ dismissed: true }).eq('id', id);
    set({ aiSuggestion: null });
  },

  addXp: async (userId: string, amount: number) => {
    await supabase.rpc('increment_xp', { user_id: userId, amount });
  },
}));

import { create } from 'zustand';
import { AiSuggestion, LessonHistory } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export interface ActivityItem {
  id: string;
  type: 'game' | 'conversation';
  label: string;       // e.g. "🖼️ Picture Quiz" or "🎙️ Speaking — At the Store"
  score: number;
  total: number;       // max possible score (questions for games, maxScore for convo)
  completed_at: string;
}

interface ProgressState {
  lessonHistory: LessonHistory[];
  recentActivity: ActivityItem[];
  aiSuggestion: AiSuggestion | null;
  fetchLessonHistory: (userId: string) => Promise<void>;
  fetchAiSuggestion: (userId: string) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
  addXp: (userId: string, amount: number) => Promise<void>;
}

const GAME_LABELS: Record<string, string> = {
  picture_quiz: '🖼️ Picture Quiz',
  word_quiz:    '📝 Word Quiz',
  listen_pick:  '🔊 Listen & Pick',
};

const LEVEL_LABELS: Record<number, string> = { 1: 'Beginner', 2: 'Elementary', 3: 'Pre-Intermediate' };

export const useProgressStore = create<ProgressState>((set) => ({
  lessonHistory: [],
  recentActivity: [],
  aiSuggestion: null,

  fetchLessonHistory: async (userId: string) => {
    // Fetch game sessions
    const { data: games } = await supabase
      .from('lesson_history')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(50);

    // Fetch completed conversation sessions
    const { data: convos, error: convoErr } = await supabase
      .from('conversation_sessions')
      .select('id, level, score, max_score, scenario_id, completed_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(50);
    if (convoErr) console.warn('[progress] conversation_sessions fetch error:', convoErr.message);

    // Build unified activity list
    const gameItems: ActivityItem[] = (games ?? []).map((g: LessonHistory) => ({
      id: g.id,
      type: 'game',
      label: GAME_LABELS[g.mode] ?? g.mode,
      score: g.score,
      total: g.total_questions,
      completed_at: g.completed_at,
    }));

    const convoItems: ActivityItem[] = (convos ?? []).map((c: any) => {
      const maxScore = (c.max_score && c.max_score > 0) ? c.max_score : 50;
      const scenarioLabel = c.scenario_id
        ? c.scenario_id.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase())
        : `Level ${c.level}`;
      return {
        id: c.id,
        type: 'conversation',
        label: `🎙️ Speaking — ${scenarioLabel} (${LEVEL_LABELS[c.level] ?? `Lv${c.level}`})`,
        score: c.score ?? 0,
        total: maxScore > 0 ? maxScore : 1,
        completed_at: c.completed_at,
      };
    });

    // Merge and sort by date descending
    const all = [...gameItems, ...convoItems].sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    );

    set({ lessonHistory: games ?? [], recentActivity: all });
  },

  fetchAiSuggestion: async (userId: string) => {
    try {
      const { data } = await supabase
        .from('ai_suggestions')
        .select('*')
        .eq('user_id', userId)
        .eq('dismissed', false)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // .single() throws 406 when 0 rows; .maybeSingle() returns null
      set({ aiSuggestion: data ?? null });
    } catch {
      set({ aiSuggestion: null });
    }
  },

  dismissSuggestion: async (id: string) => {
    await supabase.from('ai_suggestions').update({ dismissed: true }).eq('id', id);
    set({ aiSuggestion: null });
  },

  addXp: async (userId: string, amount: number) => {
    await supabase.rpc('increment_xp', { user_id: userId, amount });
  },
}));

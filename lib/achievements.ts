import { supabase } from './supabase';
import { playAchievement } from './sounds';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  xp_reward: number;
  earned_at?: string;
}

// Fetch all achievements with earned status for a user
export async function fetchUserAchievements(userId: string): Promise<Achievement[]> {
  const [{ data: catalog }, { data: earned }] = await Promise.all([
    supabase.from('achievements').select('*').order('xp_reward'),
    supabase.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId),
  ]);
  const earnedMap = new Map((earned ?? []).map((e) => [e.achievement_id, e.earned_at]));
  return (catalog ?? []).map((a) => ({ ...a, earned_at: earnedMap.get(a.id) }));
}

// Award an achievement if not already earned. Returns true if newly awarded.
async function award(userId: string, achievementId: string): Promise<boolean> {
  const { error } = await supabase.from('user_achievements').insert({ user_id: userId, achievement_id: achievementId });
  if (!error) {
    // Also grant XP
    const { data: ach } = await supabase.from('achievements').select('xp_reward, title').eq('id', achievementId).single();
    if (ach) {
      await supabase.rpc('increment_xp', { p_user_id: userId, p_amount: ach.xp_reward });
      playAchievement(ach.title);
      return true;
    }
  }
  return false;
}

// Call after completing a game session
export async function checkGameAchievements(userId: string, score: number, totalQuestions: number) {
  // first_game
  const { count: gameCount } = await supabase
    .from('lesson_history').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  if ((gameCount ?? 0) === 1) await award(userId, 'first_game');

  // perfect_score
  if (score === totalQuestions) await award(userId, 'perfect_score');

  // games_25
  if ((gameCount ?? 0) >= 25) await award(userId, 'games_25');

  // topics_5 — count distinct topics
  const { data: topicRows } = await supabase
    .from('lesson_history').select('topic_id').eq('user_id', userId);
  const uniqueTopics = new Set((topicRows ?? []).map((r) => r.topic_id)).size;
  if (uniqueTopics >= 5) await award(userId, 'topics_5');

  // streak achievements
  const { data: profile } = await supabase.from('user_profiles').select('streak_days').eq('id', userId).single();
  const streak = (profile?.streak_days as number) ?? 0;
  if (streak >= 3) await award(userId, 'streak_3');
  if (streak >= 7) await award(userId, 'streak_7');
}

// Call after completing a conversation session
export async function checkConvoAchievements(userId: string, level: number, levelComplete: boolean) {
  // first_convo
  const { count } = await supabase
    .from('conversation_sessions').select('*', { count: 'exact', head: true })
    .eq('user_id', userId).not('completed_at', 'is', null);
  if ((count ?? 0) === 1) await award(userId, 'first_convo');

  if (levelComplete) {
    if (level === 1) await award(userId, 'convo_level1');
    if (level === 2) await award(userId, 'convo_level2');
    if (level === 3) await award(userId, 'convo_level3');
  }
}

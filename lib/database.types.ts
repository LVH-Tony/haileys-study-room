export type DifficultyTier = 'beginner' | 'elementary' | 'pre-intermediate' | 'intermediate';
export type GameMode = 'picture_quiz' | 'word_quiz' | 'listen_pick';
export type FeedbackRating = 'up' | 'down';

export interface Topic {
  id: string;
  name: string;
  icon_url: string | null;
  difficulty_tier: DifficultyTier;
  is_premium: boolean;
  created_at: string;
}

export interface Word {
  id: string;
  topic_id: string;
  word: string;
  image_url: string | null;
  audio_url: string | null;
  definition: string | null;
  difficulty_score: number; // 1–5
  created_at: string;
}

export type AgeGroup = 'kid' | 'teen' | 'adult';
export type LearningGoal = 'fun' | 'travel' | 'school' | 'career';

export interface UserProfile {
  id: string;
  display_name: string;
  starting_level: DifficultyTier;
  placement_score: number | null;
  xp: number;
  streak_days: number;
  last_active_at: string | null;
  is_premium: boolean;
  created_at: string;
  // Extended profile fields
  age_group: AgeGroup | null;
  native_language: string;
  learning_goal: LearningGoal | null;
  daily_goal_minutes: number;
  avatar_url: string | null;
  onboarding_completed: boolean;
  user_code: string | null;
  push_token: string | null;
  convo_level: number; // 1=Beginner, 2=Elementary, 3=Pre-Intermediate
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntry {
  id: string;
  display_name: string;
  avatar_url: string | null;
  user_code: string | null;
  xp: number;
  streak_days: number;
  rank: number;
  is_self?: boolean;
}

export interface UserWordStat {
  id: string;
  user_id: string;
  word_id: string;
  correct_count: number;
  wrong_count: number;
  next_review_at: string;
  interval_days: number;
  updated_at: string;
}

export interface LessonHistory {
  id: string;
  user_id: string;
  topic_id: string;
  mode: GameMode;
  score: number;
  total_questions: number;
  completed_at: string;
}

export interface ConversationSession {
  id: string;
  user_id: string;
  level: number;
  messages: ConversationMessage[];
  score: number;
  completed_at: string | null;
  created_at: string;
}

export interface ConversationMessage {
  role: 'ai' | 'user';
  content: string;
  transcript?: string;
  evaluation?: {
    status: 'correct' | 'acceptable' | 'preferred';
    preferred_phrasing?: string;
    points: number;
  };
}

export interface AiSuggestion {
  id: string;
  user_id: string;
  suggestion_text: string;
  suggested_topic_id: string | null;
  generated_at: string;
  dismissed: boolean;
}

export interface Feedback {
  id: string;
  user_id: string;
  ref_type: 'word' | 'convo';
  ref_id: string;
  rating: FeedbackRating;
  created_at: string;
}

// Supabase DB type wrapper (used by createClient generic)
export type Database = {
  public: {
    Tables: {
      topics: { Row: Topic; Insert: Omit<Topic, 'id' | 'created_at'>; Update: Partial<Topic> };
      words: { Row: Word; Insert: Omit<Word, 'id' | 'created_at'>; Update: Partial<Word> };
      user_profiles: { Row: UserProfile; Insert: Omit<UserProfile, 'created_at'>; Update: Partial<UserProfile> };
      user_word_stats: { Row: UserWordStat; Insert: Omit<UserWordStat, 'id'>; Update: Partial<UserWordStat> };
      lesson_history: { Row: LessonHistory; Insert: Omit<LessonHistory, 'id'>; Update: Partial<LessonHistory> };
      conversation_sessions: { Row: ConversationSession; Insert: Omit<ConversationSession, 'id' | 'created_at'>; Update: Partial<ConversationSession> };
      ai_suggestions: { Row: AiSuggestion; Insert: Omit<AiSuggestion, 'id'>; Update: Partial<AiSuggestion> };
      feedback: { Row: Feedback; Insert: Omit<Feedback, 'id'>; Update: Partial<Feedback> };
    };
    Views: {};
    Functions: {};
  };
};

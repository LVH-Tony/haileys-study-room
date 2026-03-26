-- Word definitions
ALTER TABLE words ADD COLUMN IF NOT EXISTS definition TEXT;

-- Achievement catalog
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  emoji TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 50
);

-- User earned achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Seed catalog
INSERT INTO achievements (id, emoji, title, description, xp_reward) VALUES
  ('first_game',    '🌟', 'First Words',        'Complete your first game session',                50),
  ('perfect_score', '🎯', 'Sharp Shooter',       'Get a perfect score in any game',                100),
  ('streak_3',      '🔥', 'On Fire',             'Study 3 days in a row',                          75),
  ('streak_7',      '💪', 'Dedicated',           'Study 7 days in a row',                          150),
  ('first_convo',   '🗣️', 'Chatterbox',          'Complete your first conversation session',        75),
  ('convo_level1',  '🏆', 'Level 1 Graduate',    'Complete all Level 1 conversation sessions',     200),
  ('convo_level2',  '🌍', 'World Traveler',      'Complete all Level 2 conversation sessions',     300),
  ('convo_level3',  '⭐', 'English Scholar',     'Complete all Level 3 conversation sessions',     500),
  ('topics_5',      '📚', 'Topic Explorer',      'Play games in 5 different topics',               100),
  ('games_25',      '🎮', 'Game Master',         'Play 25 games total',                            150)
ON CONFLICT (id) DO NOTHING;

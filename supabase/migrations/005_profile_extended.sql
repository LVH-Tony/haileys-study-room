ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS age_group         text CHECK (age_group IN ('kid','teen','adult')),
  ADD COLUMN IF NOT EXISTS native_language   text NOT NULL DEFAULT 'vi',
  ADD COLUMN IF NOT EXISTS learning_goal     text CHECK (learning_goal IN ('fun','travel','school','career')),
  ADD COLUMN IF NOT EXISTS daily_goal_minutes int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS avatar_url        text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

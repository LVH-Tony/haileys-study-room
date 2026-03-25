-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TOPICS
-- ============================================================
create table if not exists public.topics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  icon_url      text,
  difficulty_tier text not null default 'beginner'
                  check (difficulty_tier in ('beginner','elementary','pre-intermediate','intermediate')),
  is_premium    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- WORDS
-- ============================================================
create table if not exists public.words (
  id              uuid primary key default gen_random_uuid(),
  topic_id        uuid not null references public.topics(id) on delete cascade,
  word            text not null,
  image_url       text,
  audio_url       text,
  difficulty_score int not null default 1 check (difficulty_score between 1 and 5),
  created_at      timestamptz not null default now()
);

create index if not exists words_topic_idx on public.words(topic_id);
create index if not exists words_difficulty_idx on public.words(difficulty_score);

-- ============================================================
-- USER PROFILES
-- ============================================================
create table if not exists public.user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null,
  starting_level  text not null default 'beginner'
                    check (starting_level in ('beginner','elementary','pre-intermediate','intermediate')),
  placement_score int,
  xp              int not null default 0,
  streak_days     int not null default 0,
  last_active_at  timestamptz,
  is_premium      boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- USER WORD STATS  (spaced repetition)
-- ============================================================
create table if not exists public.user_word_stats (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  word_id         uuid not null references public.words(id) on delete cascade,
  correct_count   int not null default 0,
  wrong_count     int not null default 0,
  interval_days   int not null default 1,
  next_review_at  timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, word_id)
);

create index if not exists uws_user_review_idx on public.user_word_stats(user_id, next_review_at);

-- ============================================================
-- LESSON HISTORY
-- ============================================================
create table if not exists public.lesson_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  topic_id        uuid not null references public.topics(id) on delete cascade,
  mode            text not null check (mode in ('picture_quiz','word_quiz','listen_pick')),
  score           int not null,
  total_questions int not null,
  completed_at    timestamptz not null default now()
);

create index if not exists lh_user_idx on public.lesson_history(user_id, completed_at desc);

-- ============================================================
-- CONVERSATION SESSIONS
-- ============================================================
create table if not exists public.conversation_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  level           int not null default 1,
  messages        jsonb not null default '[]',
  score           int not null default 0,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- AI SUGGESTIONS
-- ============================================================
create table if not exists public.ai_suggestions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.user_profiles(id) on delete cascade,
  suggestion_text     text not null,
  suggested_topic_id  uuid references public.topics(id),
  generated_at        timestamptz not null default now(),
  dismissed           boolean not null default false
);

create index if not exists ais_user_idx on public.ai_suggestions(user_id, dismissed, generated_at desc);

-- ============================================================
-- FEEDBACK
-- ============================================================
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  ref_type    text not null check (ref_type in ('word','convo')),
  ref_id      text not null,
  rating      text not null check (rating in ('up','down')),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- XP INCREMENT FUNCTION
-- ============================================================
create or replace function public.increment_xp(p_user_id uuid, p_amount int)
returns void language plpgsql security definer as $$
begin
  update public.user_profiles
  set xp = xp + p_amount,
      last_active_at = now()
  where id = p_user_id;
end;
$$;

-- ============================================================
-- STREAK UPDATE FUNCTION (call daily on login)
-- ============================================================
create or replace function public.update_streak(p_user_id uuid)
returns void language plpgsql security definer as $$
declare
  v_last timestamptz;
begin
  select last_active_at into v_last from public.user_profiles where id = p_user_id;
  if v_last is null or v_last < now() - interval '2 days' then
    update public.user_profiles set streak_days = 1, last_active_at = now() where id = p_user_id;
  elsif v_last < now() - interval '1 day' then
    update public.user_profiles set streak_days = streak_days + 1, last_active_at = now() where id = p_user_id;
  else
    update public.user_profiles set last_active_at = now() where id = p_user_id;
  end if;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.user_profiles enable row level security;
alter table public.user_word_stats enable row level security;
alter table public.lesson_history enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.feedback enable row level security;
alter table public.topics enable row level security;
alter table public.words enable row level security;

-- Topics and words: anyone can read
create policy "topics_read" on public.topics for select using (true);
create policy "words_read" on public.words for select using (true);

-- User data: owner only
create policy "own_profile" on public.user_profiles
  for all using (auth.uid() = id);

create policy "own_word_stats" on public.user_word_stats
  for all using (auth.uid() = user_id);

create policy "own_lesson_history" on public.lesson_history
  for all using (auth.uid() = user_id);

create policy "own_convo_sessions" on public.conversation_sessions
  for all using (auth.uid() = user_id);

create policy "own_ai_suggestions" on public.ai_suggestions
  for all using (auth.uid() = user_id);

create policy "own_feedback" on public.feedback
  for all using (auth.uid() = user_id);

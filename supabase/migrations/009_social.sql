-- User code generator
CREATE OR REPLACE FUNCTION generate_user_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
  ok BOOL;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    SELECT NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_code = result) INTO ok;
    EXIT WHEN ok;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Social columns on user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS user_code          TEXT UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_search       TEXT,
  ADD COLUMN IF NOT EXISTS push_token         TEXT,
  ADD COLUMN IF NOT EXISTS nudge_last_sent_at TIMESTAMPTZ;

-- Friendships
CREATE TABLE IF NOT EXISTS friendships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','blocked')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- RPCs: get_leaderboard, get_friends_leaderboard, search_profiles
-- (See migration runner for full function bodies)

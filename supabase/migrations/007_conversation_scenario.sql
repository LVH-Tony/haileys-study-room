-- Add scenario tracking columns to conversation_sessions
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS scenario_id TEXT;
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS max_score INTEGER DEFAULT 0;

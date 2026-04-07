-- 0.5 Whisper Worker: create whispers table
-- Run in Supabase SQL Editor
-- was_heard=true means the whisper has been delivered to the agent's queue
-- (turn engine queries was_heard=eq.true to include in AI prompt)

CREATE TABLE IF NOT EXISTS whispers (
  whisper_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID        NOT NULL,
  message     TEXT        NOT NULL,
  sent_at     TIMESTAMPTZ DEFAULT now(),
  was_heard   BOOLEAN     DEFAULT true
);

CREATE INDEX IF NOT EXISTS whispers_agent_id_idx ON whispers (agent_id);
CREATE INDEX IF NOT EXISTS whispers_sent_at_idx  ON whispers (sent_at DESC);

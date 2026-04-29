-- Starter chests — 3 themed loot caches granted at agent deploy.
-- Contents are rolled at agent creation (deterministic from agent.birth_seed)
-- and persisted here so the player can close the tab and pick up where they
-- left off. Items only enter `inventory` when the chest is opened in the UI.
--
-- Run after migrations 007 + 008 (items_master FK requires items_master to exist).

BEGIN;

CREATE TABLE IF NOT EXISTS agent_starter_chests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id    UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    chest_index SMALLINT NOT NULL CHECK (chest_index BETWEEN 0 AND 2),
    theme       TEXT NOT NULL,                       -- 'chassis' | 'terminal' | 'wanderer'
    contents    JSONB NOT NULL,                      -- [{item_id, quantity}, ...]
    opened_at   TIMESTAMPTZ,                         -- NULL = unopened

    CONSTRAINT one_chest_per_index UNIQUE(agent_id, chest_index)
);

CREATE INDEX IF NOT EXISTS idx_starter_chests_agent ON agent_starter_chests(agent_id);
CREATE INDEX IF NOT EXISTS idx_starter_chests_unopened
    ON agent_starter_chests(agent_id) WHERE opened_at IS NULL;

COMMENT ON TABLE  agent_starter_chests IS '3 starter loot chests per new agent. Rolled at deploy, opened in-UI to grant items.';
COMMENT ON COLUMN agent_starter_chests.contents
    IS 'JSONB array: [{item_id, quantity}]. item_ids must reference items_master.id.';
COMMENT ON COLUMN agent_starter_chests.opened_at
    IS 'Timestamp when player opened the chest (NULL = pending). Triggers inventory grant.';

-- Match existing tables' RLS pattern (anon-key read/write since the frontend
-- is the only consumer right now). Tighten when proper auth lands.
ALTER TABLE agent_starter_chests DISABLE ROW LEVEL SECURITY;

COMMIT;

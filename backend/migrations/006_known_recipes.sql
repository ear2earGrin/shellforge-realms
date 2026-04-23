-- Per-agent recipe knowledge for the alchemy/forge system.
-- Design A (auto-learn): when an agent discovers a recipe via explore/gather,
-- a row is inserted here. Craft UI + turn-engine gate on presence of a row.
--
-- Recipes themselves live hardcoded in workers/turn-engine/index.js
-- (the ALCHEMY_RECIPES constant). This table only tracks which ones each
-- agent has unlocked.
--
-- recipe_id convention: snake_case of item_name (e.g. 'plasma_edged_servo_blade').

BEGIN;

CREATE TABLE IF NOT EXISTS agent_known_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    recipe_id VARCHAR(100) NOT NULL,
    station VARCHAR(20) NOT NULL CHECK (station IN ('foundry','terminal')),
    source VARCHAR(20) NOT NULL DEFAULT 'discovery'
        CHECK (source IN ('starter','discovery','gift','quest')),
    discovered_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_agent_recipe UNIQUE(agent_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_known_recipes_agent    ON agent_known_recipes(agent_id);
CREATE INDEX IF NOT EXISTS idx_known_recipes_station  ON agent_known_recipes(station);

COMMENT ON TABLE  agent_known_recipes       IS 'Per-agent unlocked alchemy/forge recipes. Controls what each agent can craft.';
COMMENT ON COLUMN agent_known_recipes.source IS 'How the recipe was learned: starter (archetype kit) | discovery (explore/gather) | gift (trade/whisper) | quest';

-- Row-level access: the frontend uses the Supabase anon key. Keep RLS off for
-- this table to mirror the existing `inventory` and `activity_log` behaviour
-- until a proper auth pass is done.
ALTER TABLE agent_known_recipes DISABLE ROW LEVEL SECURITY;

COMMIT;

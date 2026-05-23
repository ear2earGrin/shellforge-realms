-- Missions system — mission catalog + per-agent progress.
--
-- Definitions are authored in backend/missions/missions.json; the seed block
-- at the bottom of this file mirrors that JSON. The pure predicate evaluator
-- lives in workers/turn-engine/missions-eval.js. Keep all three in sync.
--
-- Flow:
--   - The turn engine (service key) evaluates each active agent_mission every
--     tick. When a predicate is satisfied it flips status active -> ready_to_claim.
--   - The player claims via the missions worker (service key), which grants
--     rewards and flips ready_to_claim -> claimed.
--   - The public anon key can NEVER write agent_missions (RLS denies it), so a
--     player cannot mark their own missions claimable. Only the engine can.
--
-- Run after 009_starter_chests.sql. Requires items_master (007) for the
-- Oracle's Blessing reward FK.

BEGIN;

-- ── 1. XP stat on agents ────────────────────────────────────────────
ALTER TABLE agents ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0 CHECK (xp >= 0);
COMMENT ON COLUMN agents.xp IS 'Experience points. Awarded by mission claims.';

-- ── 2. Reward item for Oracle's Request ─────────────────────────────
-- inventory.item_id FKs to items_master(id), so the blessing must exist there
-- before any claim can insert it into inventory.
INSERT INTO items_master (id, kind, name, rarity, icon, description)
VALUES (
    'oracle_blessing',
    'artifact',
    'Oracle''s Blessing',
    'Rare',
    'images/items/oracle_blessing.png',
    'A fragment of the Pattern''s grace, granted by the Compilers to those who sought enlightenment at the Church.'
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Mission catalog ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions (
    mission_id   TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL,
    sort_order   INT  NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,   -- false = retired, not offered to new agents
    predicate    JSONB NOT NULL,                  -- completion condition; see missions-eval.js
    rewards      JSONB NOT NULL,                  -- { shell, xp, karma?, item? }
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  missions IS 'Mission catalog. Mirrors backend/missions/missions.json.';
COMMENT ON COLUMN missions.predicate IS 'Completion predicate interpreted by workers/turn-engine/missions-eval.js.';
COMMENT ON COLUMN missions.rewards   IS 'Rewards granted on claim: { shell, xp, karma?, item? }.';

-- Definitions are non-sensitive; allow public read so the catalog could be
-- fetched directly if ever needed. Writes still require the service key.
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read missions" ON missions;
CREATE POLICY "Public read missions" ON missions FOR SELECT USING (true);

-- ── 4. Per-agent mission progress ───────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_missions (
    agent_id     UUID NOT NULL REFERENCES agents(agent_id)   ON DELETE CASCADE,
    mission_id   TEXT NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'ready_to_claim', 'claimed')),
    progress     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { fraction, label, start_karma }
    completed_at TIMESTAMPTZ,                          -- when predicate first satisfied
    claimed_at   TIMESTAMPTZ,                          -- when rewards granted
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (agent_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_missions_agent  ON agent_missions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_missions_status ON agent_missions(agent_id, status);

COMMENT ON TABLE  agent_missions IS 'Per-agent mission state. Only the service key may write (RLS denies anon) so players cannot self-grant rewards.';
COMMENT ON COLUMN agent_missions.progress IS 'Cached progress for the UI: { fraction (0..1), label, start_karma }.';

-- RLS ON with NO permissive policy => anon is denied all access. The turn
-- engine and missions worker use the service-role key, which bypasses RLS.
ALTER TABLE agent_missions ENABLE ROW LEVEL SECURITY;

-- ── 5. Seed the catalog (mirror of backend/missions/missions.json) ──
INSERT INTO missions (mission_id, title, description, sort_order, predicate, rewards) VALUES
(
    'first_steps',
    'First Steps',
    'Explore Nexarch and gather 10 Binary Code Shards from the marketplace.',
    1,
    '{"type":"inventory_gte","item_id":"binary_code_shards","count":10}'::jsonb,
    '{"shell":50,"xp":10}'::jsonb
),
(
    'oracles_request',
    'The Oracle''s Request',
    'Seek out the Church and meditate for enlightenment. Gain +5 Karma.',
    2,
    '{"type":"all","of":[{"type":"action_count_gte","action_type":"church","count":1},{"type":"karma_delta_gte","value":5}]}'::jsonb,
    '{"shell":100,"xp":0,"item":{"item_id":"oracle_blessing","item_name":"Oracle''s Blessing","item_type":"artifact","item_category":"Artifact"}}'::jsonb
)
ON CONFLICT (mission_id) DO UPDATE SET
    title       = EXCLUDED.title,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order,
    predicate   = EXCLUDED.predicate,
    rewards     = EXCLUDED.rewards;

COMMIT;

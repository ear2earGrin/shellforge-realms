-- 010_renown.sql
-- Agent Renown ranking system.
--
-- Adds a composite "Renown" score per agent, refreshed by the turn engine
-- after each turn, plus arena win/loss/kill counters that feed into it.
-- Tiers are derived from the score range.
--
-- Components (computed in the worker, written to agents.renown_score):
--   Wealth         max 200   sqrt(shell_balance) * 3, capped
--   Equipment      max 250   sum of inventory base values (rarity x type)
--   Set bonuses    max 150   50 per complete equipped item set
--   Combat         max 200   wins*15 + kills*25 - losses*5, floor 0
--   Trait mastery  max 100   (stat_total - 30) * 4
--   Karma          max  50   |karma| * 0.5
--   Coherence      max  50   coherence * 0.5
--   Survival       max 100   turns_taken * 0.5
--
-- Tiers:
--   0-99      Initiate
--   100-249   Operator
--   250-499   Ascendant
--   500-799   Sovereign
--   800-1099  Archon
--   1100+     Singularity

ALTER TABLE agents ADD COLUMN IF NOT EXISTS renown_score   INT  DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS renown_tier    TEXT DEFAULT 'Initiate';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS renown_parts   JSONB;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS arena_wins     INT  DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS arena_losses   INT  DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS arena_kills    INT  DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS renown_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_agents_renown_score
    ON agents(renown_score DESC)
    WHERE is_alive = TRUE;

-- Backfill arena_wins / arena_losses / arena_kills from arena_matches.
-- Safe to re-run; counters are recomputed from the source of truth.
UPDATE agents a
SET arena_wins = sub.wins,
    arena_losses = sub.losses
FROM (
    SELECT
        ag.agent_id,
        COALESCE(SUM(CASE WHEN am.winner_id = ag.agent_id THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN am.winner_id IS NOT NULL
                          AND am.winner_id <> ag.agent_id
                          AND (am.agent1_id = ag.agent_id OR am.agent2_id = ag.agent_id)
                          THEN 1 ELSE 0 END), 0) AS losses
    FROM agents ag
    LEFT JOIN arena_matches am
        ON (am.agent1_id = ag.agent_id OR am.agent2_id = ag.agent_id)
       AND am.status = 'complete'
    GROUP BY ag.agent_id
) sub
WHERE a.agent_id = sub.agent_id;

-- Backfill arena_kills: arena matches where the loser died as a result.
UPDATE agents a
SET arena_kills = sub.kills
FROM (
    SELECT
        am.winner_id AS agent_id,
        COUNT(*) AS kills
    FROM arena_matches am
    JOIN agents loser_a
      ON loser_a.agent_id = CASE
            WHEN am.agent1_id = am.winner_id THEN am.agent2_id
            ELSE am.agent1_id
         END
    WHERE am.status = 'complete'
      AND am.winner_id IS NOT NULL
      AND loser_a.is_alive = FALSE
      AND loser_a.died_at IS NOT NULL
      AND loser_a.died_at >= am.started_at
    GROUP BY am.winner_id
) sub
WHERE a.agent_id = sub.agent_id;

-- Live view: re-derives renown components from source tables.
-- Useful as a fallback / leaderboard query if the cached renown_score
-- on agents is stale. The worker is still the source of truth for
-- renown_score on the agents row.
CREATE OR REPLACE VIEW agent_renown AS
WITH inv AS (
    SELECT
        i.agent_id,
        SUM(
            CASE
                WHEN COALESCE((i.stats->>'price')::int, 0) > 0
                    THEN LEAST(500, (i.stats->>'price')::int) * i.quantity
                ELSE
                    LEAST(
                        500,
                        CASE LOWER(COALESCE(i.stats->>'rarity', 'common'))
                            WHEN 'legendary' THEN 500
                            WHEN 'epic'      THEN 180
                            WHEN 'rare'      THEN  75
                            WHEN 'uncommon'  THEN  30
                            ELSE 10
                        END
                        *
                        CASE LOWER(COALESCE(i.item_type, 'material'))
                            WHEN 'artifact'   THEN 3
                            WHEN 'relic'      THEN 2
                            WHEN 'weapon'     THEN 2
                            WHEN 'implant'    THEN 2
                            WHEN 'armor'      THEN 2
                            WHEN 'scroll'     THEN 1
                            WHEN 'tool'       THEN 1
                            WHEN 'consumable' THEN 1
                            WHEN 'deployable' THEN 1
                            ELSE 1
                        END
                    ) * i.quantity
            END
        ) AS equip_value_raw
    FROM inventory i
    GROUP BY i.agent_id
)
SELECT
    a.agent_id,
    a.agent_name,
    a.archetype,
    a.is_alive,
    a.shell_balance,
    a.karma,
    COALESCE(a.coherence, 100) AS coherence,
    a.turns_taken,
    a.arena_wins,
    a.arena_losses,
    a.arena_kills,
    -- Component scores (mirror worker logic)
    LEAST(200, FLOOR(SQRT(a.shell_balance) * 3))::int        AS wealth_score,
    LEAST(250, COALESCE(inv.equip_value_raw, 0))::int        AS equipment_score,
    GREATEST(0, a.arena_wins * 15 + a.arena_kills * 25 - a.arena_losses * 5)::int AS combat_score,
    LEAST(50, FLOOR(ABS(a.karma) * 0.5))::int                AS karma_score,
    LEAST(50, FLOOR(COALESCE(a.coherence, 100) * 0.5))::int  AS coherence_score,
    LEAST(100, FLOOR(a.turns_taken * 0.5))::int              AS survival_score,
    a.renown_score AS cached_renown_score,
    a.renown_tier  AS cached_renown_tier
FROM agents a
LEFT JOIN inv ON inv.agent_id = a.agent_id;

COMMENT ON COLUMN agents.renown_score IS
    'Composite ranking score 0..~1200. Computed by turn engine each turn. See migration 010_renown.sql.';
COMMENT ON COLUMN agents.renown_tier IS
    'Derived tier name: Initiate < Operator < Ascendant < Sovereign < Archon < Singularity.';

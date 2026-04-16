-- ═══════════════════════════════════════════════════════════════
--  SHELLFORGE COMBAT ENGINE — Supabase Migration v1.0
-- ═══════════════════════════════════════════════════════════════
--  Run AFTER alchemy/migration.sql + alchemy/seed.sql.
--  Drops and recreates all combat tables. Safe to re-run.
--
--  Tables:
--    combat_abilities        — master list of item-granted abilities
--    archetype_abilities     — innate abilities per archetype
--    combat_matches          — one row per fight
--    combat_turns            — one row per turn (full state snapshots, replay-ready)
--    combat_effects          — active buffs/debuffs/DoTs/traps mid-match
--    combat_whispers         — Ghost suggestions during combat (premium feature)
--    agent_feuds             — pairwise heat tracking (asymmetric)
--    crucible_states         — inactive-agent escalation tracking
--    spectator_bets          — Lightning sats betting (schema ready, UI later)
-- ═══════════════════════════════════════════════════════════════

-- ─── Drop existing tables (cascade respects FK order) ──────────
DROP TABLE IF EXISTS spectator_bets CASCADE;
DROP TABLE IF EXISTS combat_whispers CASCADE;
DROP TABLE IF EXISTS combat_effects CASCADE;
DROP TABLE IF EXISTS combat_turns CASCADE;
DROP TABLE IF EXISTS combat_matches CASCADE;
DROP TABLE IF EXISTS crucible_states CASCADE;
DROP TABLE IF EXISTS agent_feuds CASCADE;
DROP TABLE IF EXISTS archetype_abilities CASCADE;
DROP TABLE IF EXISTS combat_abilities CASCADE;

-- ═══════════════════════════════════════════════════════════════
--  ABILITY CATALOGUES (seeded from CSVs via build-seed.js)
-- ═══════════════════════════════════════════════════════════════

-- Item-granted abilities (one row per item-ability pairing)
CREATE TABLE combat_abilities (
  id              SERIAL PRIMARY KEY,
  item_name       TEXT NOT NULL,           -- matches alchemy_items.name
  item_id         TEXT,                    -- denormalized id (filled by build-seed)
  ability_name    TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('ATK','DEF','BUFF','DEBUFF','HEAL','TRAP','UTIL','PASSIVE')),
  coherence_cost  INTEGER NOT NULL DEFAULT 0 CHECK (coherence_cost BETWEEN 0 AND 10),
  cooldown        INTEGER NOT NULL DEFAULT 0 CHECK (cooldown BETWEEN 0 AND 99),
  power           INTEGER NOT NULL DEFAULT 0,
  duration        INTEGER NOT NULL DEFAULT 0,
  one_time        BOOLEAN NOT NULL DEFAULT false,
  description     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_combat_abilities_item ON combat_abilities(item_name);
CREATE INDEX idx_combat_abilities_type ON combat_abilities(type);

-- Archetype-innate abilities (always available)
CREATE TABLE archetype_abilities (
  id              SERIAL PRIMARY KEY,
  archetype       TEXT NOT NULL,
  cluster         TEXT NOT NULL CHECK (cluster IN ('prime_helix','sec_grid','dyn_swarm')),
  ability_name    TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('ATK','DEF','BUFF','DEBUFF','HEAL','TRAP','UTIL','PASSIVE')),
  coherence_cost  INTEGER NOT NULL DEFAULT 0,
  cooldown        INTEGER NOT NULL DEFAULT 0,
  power           INTEGER NOT NULL DEFAULT 0,
  duration        INTEGER NOT NULL DEFAULT 0,
  description     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_archetype_abilities_archetype ON archetype_abilities(archetype);
CREATE INDEX idx_archetype_abilities_cluster ON archetype_abilities(cluster);

-- ═══════════════════════════════════════════════════════════════
--  MATCHES — one row per fight
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE combat_matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type          TEXT NOT NULL CHECK (match_type IN ('gauntlet','pvp','deathmatch','wild')),
  agent_a             TEXT NOT NULL,                 -- always the human-player agent if PvP-with-NPC
  agent_b             TEXT,                          -- nullable for gauntlet (NPC ID stored in opponent_data)
  opponent_data       JSONB,                         -- NPC stats for gauntlet/wild matches
  shell_pot           INTEGER NOT NULL DEFAULT 0,    -- $SHELL wagered (PvP/deathmatch)
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','resolved','forfeit','abandoned')),
  winner_agent_id     TEXT,
  loser_agent_id      TEXT,
  turns_total         INTEGER NOT NULL DEFAULT 0,
  death_occurred      BOOLEAN NOT NULL DEFAULT false,
  death_agent_id      TEXT,                          -- who died (only deathmatch/wild can have deaths)
  spectator_count     INTEGER NOT NULL DEFAULT 0,
  total_bets_sats     BIGINT NOT NULL DEFAULT 0,

  -- Snapshots taken at match start (so mid-match equip changes don't break the fight)
  agent_a_snapshot    JSONB,                         -- { hp, coherence, deck:[ability_ids], stats, equipped_items }
  agent_b_snapshot    JSONB,

  -- Final state at resolution
  agent_a_final_hp    INTEGER,
  agent_b_final_hp    INTEGER,

  feud_id             INTEGER,                       -- if this match was triggered by an active feud

  created_at          TIMESTAMPTZ DEFAULT now(),
  started_at          TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_matches_status ON combat_matches(status);
CREATE INDEX idx_matches_agent_a ON combat_matches(agent_a);
CREATE INDEX idx_matches_agent_b ON combat_matches(agent_b);
CREATE INDEX idx_matches_type ON combat_matches(match_type);
CREATE INDEX idx_matches_created ON combat_matches(created_at DESC);
CREATE INDEX idx_matches_active ON combat_matches(status) WHERE status = 'in_progress';

-- ═══════════════════════════════════════════════════════════════
--  TURNS — full state snapshot per turn (replay data)
-- ═══════════════════════════════════════════════════════════════
--  Storing complete state per turn (not just deltas) makes replays
--  trivially renderable on any client (browser, mobile, future engine).
--  Slight space cost, massive simplicity gain.

CREATE TABLE combat_turns (
  id                          BIGSERIAL PRIMARY KEY,
  match_id                    UUID NOT NULL REFERENCES combat_matches(id) ON DELETE CASCADE,
  turn_number                 INTEGER NOT NULL,

  -- What each side chose
  agent_a_action              JSONB,                 -- { ability_id, ability_name, target, whisper_followed }
  agent_b_action              JSONB,

  -- State BEFORE the turn resolved
  agent_a_hp_before           INTEGER NOT NULL,
  agent_b_hp_before           INTEGER NOT NULL,
  agent_a_coherence_before    INTEGER NOT NULL,
  agent_b_coherence_before    INTEGER NOT NULL,

  -- State AFTER the turn resolved
  agent_a_hp_after            INTEGER NOT NULL,
  agent_b_hp_after            INTEGER NOT NULL,
  agent_a_coherence_after     INTEGER NOT NULL,
  agent_b_coherence_after     INTEGER NOT NULL,

  -- What happened (in priority order)
  effects_triggered           JSONB,                 -- array of { source, target, type, magnitude, message }
  damage_dealt_to_a           INTEGER NOT NULL DEFAULT 0,
  damage_dealt_to_b           INTEGER NOT NULL DEFAULT 0,
  was_critical_a              BOOLEAN NOT NULL DEFAULT false,
  was_critical_b              BOOLEAN NOT NULL DEFAULT false,

  -- Active effects at end of turn (for replay clients)
  active_effects_a            JSONB,                 -- array of { type, source, magnitude, turns_left }
  active_effects_b            JSONB,

  -- Optional Sonnet narration (only for milestone turns: deaths, legendaries, big crits)
  narration                   TEXT,

  created_at                  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id, turn_number)
);

CREATE INDEX idx_turns_match ON combat_turns(match_id);
CREATE INDEX idx_turns_match_turn ON combat_turns(match_id, turn_number);

-- ═══════════════════════════════════════════════════════════════
--  EFFECTS — mid-match active state (buffs, debuffs, DoTs, traps)
-- ═══════════════════════════════════════════════════════════════
--  These rows are mutable during a match. Cleaned up on match resolve.
--  Mirror of `active_effects_a/b` in turns table for query convenience.

CREATE TABLE combat_effects (
  id                  BIGSERIAL PRIMARY KEY,
  match_id            UUID NOT NULL REFERENCES combat_matches(id) ON DELETE CASCADE,
  agent_id            TEXT NOT NULL,                 -- who has this effect applied
  effect_kind         TEXT NOT NULL
                      CHECK (effect_kind IN ('buff','debuff','dot','hot','trap','shield','cooldown','marker')),
  source_ability      TEXT NOT NULL,                 -- name of the ability that placed it
  source_agent_id     TEXT NOT NULL,                 -- who placed it
  magnitude           INTEGER NOT NULL DEFAULT 0,    -- damage/heal/% modifier
  turns_remaining     INTEGER NOT NULL,
  metadata            JSONB,                         -- ability-specific extras
  applied_turn        INTEGER NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_effects_match ON combat_effects(match_id);
CREATE INDEX idx_effects_agent ON combat_effects(match_id, agent_id);
CREATE INDEX idx_effects_kind ON combat_effects(match_id, effect_kind);

-- ═══════════════════════════════════════════════════════════════
--  WHISPERS — Ghost premium-whisper suggestions during combat
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE combat_whispers (
  id                  BIGSERIAL PRIMARY KEY,
  match_id            UUID NOT NULL REFERENCES combat_matches(id) ON DELETE CASCADE,
  ghost_id            TEXT NOT NULL,
  agent_id            TEXT NOT NULL,                 -- which agent the whisper is for
  turn_number         INTEGER NOT NULL,              -- which turn it should apply to
  suggestion          TEXT NOT NULL,                 -- ability_name OR free-form ('attack','defend')
  is_premium          BOOLEAN NOT NULL DEFAULT false,
  compliance_roll     NUMERIC(4,3),                  -- 0.000-1.000, set after agent rolls
  was_followed        BOOLEAN,                       -- null until resolved
  created_at          TIMESTAMPTZ DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_whispers_match ON combat_whispers(match_id);
CREATE INDEX idx_whispers_pending ON combat_whispers(match_id, turn_number) WHERE was_followed IS NULL;

-- ═══════════════════════════════════════════════════════════════
--  FEUDS — pairwise heat tracking (asymmetric, normalized pair)
-- ═══════════════════════════════════════════════════════════════
--  agent_a is always lexicographically < agent_b to avoid duplicate pairs.

CREATE TABLE agent_feuds (
  id                  SERIAL PRIMARY KEY,
  agent_a             TEXT NOT NULL,
  agent_b             TEXT NOT NULL,
  heat_a              INTEGER NOT NULL DEFAULT 0 CHECK (heat_a BETWEEN 0 AND 100),
  heat_b              INTEGER NOT NULL DEFAULT 0 CHECK (heat_b BETWEEN 0 AND 100),
  trigger_type        TEXT NOT NULL CHECK (trigger_type IN ('cluster','archetype','market','ghost','combat')),
  origin_event        TEXT,                          -- short description of triggering event
  total_encounters    INTEGER NOT NULL DEFAULT 0,
  total_pvp_matches   INTEGER NOT NULL DEFAULT 0,
  total_deathmatches  INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','resolved_death','reconciled')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_interaction    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT feud_pair_ordered CHECK (agent_a < agent_b),
  UNIQUE(agent_a, agent_b)
);

CREATE INDEX idx_feuds_agent_a ON agent_feuds(agent_a);
CREATE INDEX idx_feuds_agent_b ON agent_feuds(agent_b);
CREATE INDEX idx_feuds_active ON agent_feuds(status) WHERE status = 'active';
CREATE INDEX idx_feuds_hot ON agent_feuds(GREATEST(heat_a, heat_b)) WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════
--  CRUCIBLE — inactive-Ghost escalation tracking
-- ═══════════════════════════════════════════════════════════════
--  Each agent has at most one row. Updated by crucible cron.
--  When stage = 'decoherence', a 72h death window is active.

CREATE TABLE crucible_states (
  agent_id            TEXT PRIMARY KEY,
  ghost_id            TEXT NOT NULL,
  stage               TEXT NOT NULL DEFAULT 'content'
                      CHECK (stage IN ('content','restless','reckless','death_wish','decoherence','collapsed')),
  days_since_whisper  INTEGER NOT NULL DEFAULT 0,
  decoherence_started TIMESTAMPTZ,                   -- non-null once stage = decoherence
  decoherence_deadline TIMESTAMPTZ,                  -- 72h from start; agent must win a fight
  fights_since_decoherence INTEGER NOT NULL DEFAULT 0,
  last_whisper_at     TIMESTAMPTZ,
  last_evaluated_at   TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crucible_stage ON crucible_states(stage);
CREATE INDEX idx_crucible_decoherence ON crucible_states(decoherence_deadline)
  WHERE stage = 'decoherence';

-- ═══════════════════════════════════════════════════════════════
--  SPECTATOR BETTING — Lightning sats wagering (schema ready, UI later)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE spectator_bets (
  id                  BIGSERIAL PRIMARY KEY,
  match_id            UUID NOT NULL REFERENCES combat_matches(id) ON DELETE CASCADE,
  ghost_id            TEXT NOT NULL,
  bet_on_agent_id     TEXT NOT NULL,
  sats_amount         BIGINT NOT NULL CHECK (sats_amount > 0),
  payout_sats         BIGINT,                        -- null = unsettled, 0 = lost, >0 = won
  lightning_invoice   TEXT,                          -- BOLT11 invoice for payout
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bets_match ON spectator_bets(match_id);
CREATE INDEX idx_bets_ghost ON spectator_bets(ghost_id);
CREATE INDEX idx_bets_unsettled ON spectator_bets(match_id) WHERE payout_sats IS NULL;

-- ═══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════
--  Catalogues: public read (everyone needs ability data).
--  Match data: public read (spectators), service role full control.
--  Whispers: ghost can read own, service role full control.
--  Feuds: public read (drama is part of the game).
--  Crucible: ghost can read own, service role full control.
--  Bets: ghost can read own, service role full control.

ALTER TABLE combat_abilities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE archetype_abilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE combat_matches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE combat_turns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE combat_effects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE combat_whispers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_feuds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crucible_states     ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectator_bets      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_abilities"      ON combat_abilities    FOR SELECT USING (true);
CREATE POLICY "public_read_archetypes"     ON archetype_abilities FOR SELECT USING (true);
CREATE POLICY "public_read_matches"        ON combat_matches      FOR SELECT USING (true);
CREATE POLICY "public_read_turns"          ON combat_turns        FOR SELECT USING (true);
CREATE POLICY "public_read_effects"        ON combat_effects      FOR SELECT USING (true);
CREATE POLICY "public_read_feuds"          ON agent_feuds         FOR SELECT USING (true);
CREATE POLICY "public_read_whispers"       ON combat_whispers     FOR SELECT USING (true);
CREATE POLICY "public_read_crucible"       ON crucible_states     FOR SELECT USING (true);
CREATE POLICY "public_read_bets"           ON spectator_bets      FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════
--  HELPER VIEWS
-- ═══════════════════════════════════════════════════════════════

-- All active matches (for spectator browsing)
CREATE OR REPLACE VIEW v_active_matches AS
SELECT
  m.id,
  m.match_type,
  m.agent_a,
  m.agent_b,
  m.shell_pot,
  m.turns_total,
  m.spectator_count,
  m.total_bets_sats,
  m.created_at,
  m.started_at,
  EXTRACT(EPOCH FROM (now() - m.started_at))::INTEGER AS seconds_active
FROM combat_matches m
WHERE m.status = 'in_progress';

-- Hottest active feuds (for world drama feed)
CREATE OR REPLACE VIEW v_hot_feuds AS
SELECT
  f.id,
  f.agent_a,
  f.agent_b,
  GREATEST(f.heat_a, f.heat_b) AS max_heat,
  f.heat_a,
  f.heat_b,
  f.trigger_type,
  f.total_pvp_matches,
  f.last_interaction,
  CASE
    WHEN GREATEST(f.heat_a, f.heat_b) >= 100 THEN 'blood_feud'
    WHEN GREATEST(f.heat_a, f.heat_b) >= 80  THEN 'sworn_enemies'
    WHEN GREATEST(f.heat_a, f.heat_b) >= 60  THEN 'enemies'
    WHEN GREATEST(f.heat_a, f.heat_b) >= 40  THEN 'rivals'
    WHEN GREATEST(f.heat_a, f.heat_b) >= 20  THEN 'tension'
    ELSE 'cold'
  END AS heat_level
FROM agent_feuds f
WHERE f.status = 'active'
ORDER BY GREATEST(f.heat_a, f.heat_b) DESC;

-- Agents currently in danger via Crucible
CREATE OR REPLACE VIEW v_crucible_danger AS
SELECT
  c.agent_id,
  c.ghost_id,
  c.stage,
  c.days_since_whisper,
  c.decoherence_deadline,
  CASE WHEN c.decoherence_deadline IS NOT NULL
       THEN EXTRACT(EPOCH FROM (c.decoherence_deadline - now())) / 3600
       ELSE NULL END AS hours_to_collapse
FROM crucible_states c
WHERE c.stage IN ('reckless','death_wish','decoherence');

-- ═══════════════════════════════════════════════════════════════
--  DONE
-- ═══════════════════════════════════════════════════════════════
--  Next: run combat/seed.sql to populate combat_abilities
--        + archetype_abilities from the CSV files.

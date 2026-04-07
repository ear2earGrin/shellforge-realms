-- Arena Combat Tables — migration 003
-- Apply after 001_create_tables.sql
-- Adds arena_matches and combat_logs for real AI-driven arena combat.

CREATE TABLE arena_matches (
    match_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent1_id UUID NOT NULL REFERENCES agents(agent_id),
    agent2_id UUID NOT NULL REFERENCES agents(agent_id),
    winner_id UUID REFERENCES agents(agent_id),
    total_rounds INT DEFAULT 0,
    shell_transferred INT DEFAULT 0,
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'in_progress',
    CONSTRAINT arena_different_agents CHECK (agent1_id != agent2_id)
);

CREATE INDEX idx_arena_matches_agent1 ON arena_matches(agent1_id);
CREATE INDEX idx_arena_matches_agent2 ON arena_matches(agent2_id);
CREATE INDEX idx_arena_matches_status ON arena_matches(status);
CREATE INDEX idx_arena_matches_started_at ON arena_matches(started_at DESC);

CREATE TABLE combat_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES arena_matches(match_id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    agent1_action VARCHAR(20) NOT NULL CHECK (agent1_action IN ('attack', 'defend', 'special')),
    agent2_action VARCHAR(20) NOT NULL CHECK (agent2_action IN ('attack', 'defend', 'special')),
    agent1_damage INT DEFAULT 0,
    agent2_damage INT DEFAULT 0,
    narrative TEXT,
    logged_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_combat_logs_match_id ON combat_logs(match_id);
CREATE INDEX idx_combat_logs_round ON combat_logs(match_id, round_number);

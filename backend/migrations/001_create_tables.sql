-- Shellforge Database Schema v1.0
-- PostgreSQL 12+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT username_min_length CHECK (char_length(username) >= 3),
    CONSTRAINT username_max_length CHECK (char_length(username) <= 50)
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- Agents Table
CREATE TABLE agents (
    agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    agent_name VARCHAR(50) NOT NULL,
    archetype VARCHAR(50) NOT NULL,
    
    -- Stats
    energy INT DEFAULT 100 CHECK (energy >= 0 AND energy <= 100),
    health INT DEFAULT 100 CHECK (health >= 0 AND health <= 100),
    karma INT DEFAULT 0,
    shell_balance INT DEFAULT 50 CHECK (shell_balance >= 0),
    
    -- Location
    location VARCHAR(100) DEFAULT 'Nexarch',
    location_detail VARCHAR(100) DEFAULT 'Dark Streets',
    position_x FLOAT DEFAULT 0.36 CHECK (position_x >= 0 AND position_x <= 1),
    position_y FLOAT DEFAULT 0.20 CHECK (position_y >= 0 AND position_y <= 1),
    
    -- Progression
    turns_taken INT DEFAULT 0 CHECK (turns_taken >= 0),
    days_survived INT DEFAULT 0 CHECK (days_survived >= 0),
    
    -- State
    is_alive BOOLEAN DEFAULT TRUE,
    last_action_at TIMESTAMP DEFAULT NOW(),
    next_turn_at TIMESTAMP,
    last_energy_reset_at TIMESTAMP DEFAULT NOW(),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    died_at TIMESTAMP,
    
    CONSTRAINT one_agent_per_user UNIQUE(user_id),
    CONSTRAINT valid_archetype CHECK (archetype IN (
        'shadow', 'trickster', 'self', 'alchemist', 
        'trader', 'monk', 'warrior', 'prophet'
    ))
);

CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_is_alive ON agents(is_alive);
CREATE INDEX idx_agents_location ON agents(location);
CREATE INDEX idx_agents_next_turn_at ON agents(next_turn_at) WHERE is_alive = TRUE;

-- Inventory Table
CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    item_id VARCHAR(100) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    item_category VARCHAR(50),
    quantity INT DEFAULT 1 CHECK (quantity > 0),
    is_equipped BOOLEAN DEFAULT FALSE,
    acquired_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_item_per_agent UNIQUE(agent_id, item_id),
    CONSTRAINT valid_item_type CHECK (item_type IN (
        'weapon', 'armor', 'consumable', 'scroll', 
        'artifact', 'tool', 'ingredient', 'material'
    ))
);

CREATE INDEX idx_inventory_agent_id ON inventory(agent_id);
CREATE INDEX idx_inventory_item_type ON inventory(item_type);
CREATE INDEX idx_inventory_is_equipped ON inventory(is_equipped) WHERE is_equipped = TRUE;

-- Activity Log Table
CREATE TABLE activity_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_detail TEXT,
    energy_cost INT DEFAULT 0,
    energy_gained INT DEFAULT 0,
    shell_change INT DEFAULT 0,
    karma_change INT DEFAULT 0,
    health_change INT DEFAULT 0,
    items_gained JSONB,
    items_lost JSONB,
    location VARCHAR(100),
    success BOOLEAN DEFAULT TRUE,
    timestamp TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_action_type CHECK (action_type IN (
        'move', 'explore', 'gather', 'craft', 'trade', 
        'rest', 'combat', 'quest', 'church', 'arena', 
        'spawn', 'death', 'whisper_received'
    ))
);

CREATE INDEX idx_activity_agent_id ON activity_log(agent_id);
CREATE INDEX idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX idx_activity_turn_number ON activity_log(turn_number);
CREATE INDEX idx_activity_action_type ON activity_log(action_type);

-- Whispers Table
CREATE TABLE whispers (
    whisper_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (char_length(message) <= 200),
    was_heard BOOLEAN NOT NULL,
    roll_value FLOAT,
    sent_at TIMESTAMP DEFAULT NOW(),
    whisper_date DATE DEFAULT CURRENT_DATE,
    
    CONSTRAINT message_length CHECK (char_length(message) >= 1 AND char_length(message) <= 200)
);

CREATE INDEX idx_whispers_agent_id ON whispers(agent_id);
CREATE INDEX idx_whispers_user_id ON whispers(user_id);
CREATE INDEX idx_whispers_daily ON whispers(user_id, whisper_date);
CREATE INDEX idx_whispers_timestamp ON whispers(sent_at DESC);

-- Crafting Attempts Table
CREATE TABLE crafting_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    item_id VARCHAR(100) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    ingredients JSONB NOT NULL,
    success BOOLEAN NOT NULL,
    success_rate INT,
    roll_value FLOAT,
    failure_effect VARCHAR(50),
    damage_taken INT DEFAULT 0,
    energy_cost INT DEFAULT 20,
    crafted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_crafting_agent_id ON crafting_attempts(agent_id);
CREATE INDEX idx_crafting_success ON crafting_attempts(success);
CREATE INDEX idx_crafting_timestamp ON crafting_attempts(crafted_at DESC);

-- World State Table (for global events, population tracking, etc.)
CREATE TABLE world_state (
    state_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location VARCHAR(100) NOT NULL,
    population INT DEFAULT 0,
    event_type VARCHAR(50),
    event_data JSONB,
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_location UNIQUE(location)
);

CREATE INDEX idx_world_state_location ON world_state(location);

-- Create initial world locations
INSERT INTO world_state (location, population) VALUES
    ('Nexarch', 0),
    ('Hashmere', 0),
    ('Diffusion Mesa', 0),
    ('Epoch Spike', 0),
    ('Hallucination Glitch', 0),
    ('Singularity Crater', 0),
    ('Deserted Data Centre', 0),
    ('Proof-of-Death', 0);

-- Function to update world population automatically
CREATE OR REPLACE FUNCTION update_world_population()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update population count for location
        UPDATE world_state 
        SET population = (
            SELECT COUNT(*) 
            FROM agents 
            WHERE location = NEW.location AND is_alive = TRUE
        )
        WHERE location = NEW.location;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        UPDATE world_state 
        SET population = (
            SELECT COUNT(*) 
            FROM agents 
            WHERE location = OLD.location AND is_alive = TRUE
        )
        WHERE location = OLD.location;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update population on agent location changes
CREATE TRIGGER trigger_update_population
AFTER INSERT OR UPDATE OF location OR DELETE ON agents
FOR EACH ROW
EXECUTE FUNCTION update_world_population();

-- Function to reset energy daily
CREATE OR REPLACE FUNCTION reset_daily_energy()
RETURNS void AS $$
BEGIN
    UPDATE agents
    SET 
        energy = 100,
        days_survived = days_survived + 1,
        last_energy_reset_at = NOW()
    WHERE 
        is_alive = TRUE
        AND last_energy_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- View for agent status summary
CREATE VIEW agent_status_summary AS
SELECT 
    a.agent_id,
    a.agent_name,
    a.archetype,
    a.energy,
    a.health,
    a.karma,
    a.shell_balance,
    a.location,
    a.location_detail,
    a.position_x,
    a.position_y,
    a.turns_taken,
    a.days_survived,
    a.is_alive,
    a.last_action_at,
    u.username,
    u.user_id,
    (SELECT COUNT(*) FROM inventory WHERE agent_id = a.agent_id) as item_count,
    (SELECT action_detail FROM activity_log WHERE agent_id = a.agent_id ORDER BY timestamp DESC LIMIT 1) as last_action
FROM agents a
JOIN users u ON a.user_id = u.user_id;

-- Comments for documentation
COMMENT ON TABLE users IS 'Player accounts';
COMMENT ON TABLE agents IS 'AI agents controlled by players';
COMMENT ON TABLE inventory IS 'Items owned by agents';
COMMENT ON TABLE activity_log IS 'History of all agent actions';
COMMENT ON TABLE whispers IS 'Player whispers to their agents';
COMMENT ON TABLE crafting_attempts IS 'History of alchemy attempts';
COMMENT ON TABLE world_state IS 'Global world state and events';

COMMENT ON COLUMN agents.energy IS 'Current energy (0-100), resets daily at 00:00 PST';
COMMENT ON COLUMN agents.position_x IS 'Map X coordinate (0.0-1.0, relative to map width)';
COMMENT ON COLUMN agents.position_y IS 'Map Y coordinate (0.0-1.0, relative to map height)';
COMMENT ON COLUMN whispers.was_heard IS 'Whether the agent heard the whisper (50% chance)';
COMMENT ON COLUMN crafting_attempts.success IS 'Whether the craft succeeded';

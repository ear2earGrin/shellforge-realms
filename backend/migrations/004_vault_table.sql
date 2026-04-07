-- Vault Table — migration 004
-- Stores items from agents who die in arena combat.
-- Apply after 001_create_tables.sql.

CREATE TABLE vault (
    vault_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_agent_id UUID NOT NULL REFERENCES agents(agent_id),
    item_id VARCHAR(100) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    item_category VARCHAR(50),
    quantity INT DEFAULT 1 CHECK (quantity > 0),
    deposited_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vault_original_agent ON vault(original_agent_id);
CREATE INDEX idx_vault_deposited_at ON vault(deposited_at DESC);

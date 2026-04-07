-- Market System for Shellforge Realms
-- Run after 001_create_tables.sql

-- Market listings table: items for sale at each location, with dynamic pricing
CREATE TABLE market_listings (
    listing_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location VARCHAR(100) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_type VARCHAR(50) NOT NULL CHECK (item_type IN (
        'weapon', 'armor', 'consumable', 'scroll',
        'artifact', 'tool', 'ingredient', 'material'
    )),
    base_price INT NOT NULL CHECK (base_price > 0),
    current_price INT NOT NULL CHECK (current_price > 0),
    stock INT NOT NULL DEFAULT 10 CHECK (stock >= 0),
    demand_count INT NOT NULL DEFAULT 0,  -- cumulative buys (drives price up)
    supply_count INT NOT NULL DEFAULT 0,  -- cumulative sells (drives price down)
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_location_item UNIQUE(location, item_id)
);

CREATE INDEX idx_market_location ON market_listings(location);
CREATE INDEX idx_market_stock ON market_listings(stock) WHERE stock > 0;

-- Seed market items per location (3 items each, diverse types and price tiers)
INSERT INTO market_listings (location, item_id, item_name, item_type, base_price, current_price, stock) VALUES
    -- Nexarch (starter city)
    ('Nexarch', 'lockpick_kit',    'Lockpick Kit',    'tool',       12, 12, 8),
    ('Nexarch', 'data_chip',       'Data Chip',       'material',    8,  8, 15),
    ('Nexarch', 'stim_patch',      'Stim Patch',      'consumable', 20, 20, 10),

    -- Hashmere (tech hub)
    ('Hashmere', 'signal_scrambler', 'Signal Scrambler', 'tool',      18, 18, 6),
    ('Hashmere', 'crypto_key',       'Crypto Key',       'material',  15, 15, 10),
    ('Hashmere', 'neural_boost',     'Neural Boost',     'consumable', 25, 25, 8),

    -- Diffusion Mesa (raw materials)
    ('Diffusion Mesa', 'raw_circuit',  'Raw Circuit',  'ingredient', 6,  6, 20),
    ('Diffusion Mesa', 'scrap_metal',  'Scrap Metal',  'material',   4,  4, 25),
    ('Diffusion Mesa', 'energy_cell',  'Energy Cell',  'consumable', 10, 10, 12),

    -- Epoch Spike (rare artifacts)
    ('Epoch Spike', 'ancient_relic',   'Ancient Relic',  'artifact',   40, 40, 3),
    ('Epoch Spike', 'void_crystal',    'Void Crystal',   'ingredient', 30, 30, 5),
    ('Epoch Spike', 'time_fragment',   'Time Fragment',  'material',   22, 22, 7),

    -- Hallucination Glitch (weapons and scrolls)
    ('Hallucination Glitch', 'ghost_sigil',   'Ghost Sigil',   'scroll',  35, 35, 4),
    ('Hallucination Glitch', 'flux_powder',   'Flux Powder',   'ingredient', 14, 14, 10),
    ('Hallucination Glitch', 'static_blade',  'Static Blade',  'weapon',  45, 45, 3),

    -- Singularity Crater (high-end gear)
    ('Singularity Crater', 'singularity_shard', 'Singularity Shard', 'artifact', 60, 60, 2),
    ('Singularity Crater', 'collapse_reagent',  'Collapse Reagent',  'ingredient', 28, 28, 6),
    ('Singularity Crater', 'void_armor',         'Void Armor',        'armor',     55, 55, 3),

    -- Deserted Data Centre (salvage)
    ('Deserted Data Centre', 'corrupted_drive', 'Corrupted Drive', 'material',  10, 10, 10),
    ('Deserted Data Centre', 'server_core',     'Server Core',     'artifact',  35, 35, 4),
    ('Deserted Data Centre', 'memory_shard',    'Memory Shard',    'ingredient', 8,  8, 15),

    -- Proof-of-Death (death cult trinkets)
    ('Proof-of-Death', 'death_token',   'Death Token',   'artifact', 50, 50, 3),
    ('Proof-of-Death', 'bone_scroll',   'Bone Scroll',   'scroll',   30, 30, 5),
    ('Proof-of-Death', 'specter_cloak', 'Specter Cloak', 'armor',    42, 42, 4);

COMMENT ON TABLE market_listings IS 'Items available for trade at each location. Prices update based on cumulative buy/sell activity.';
COMMENT ON COLUMN market_listings.demand_count IS 'Cumulative buys — drives price up via supply/demand formula';
COMMENT ON COLUMN market_listings.supply_count IS 'Cumulative sells — drives price down via supply/demand formula';
COMMENT ON COLUMN market_listings.current_price IS 'Live price = round(base_price * clamp(1 + (demand-supply)*0.05, 0.5, 2.0))';

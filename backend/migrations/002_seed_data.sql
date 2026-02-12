-- Seed Data for Development/Testing
-- Run after 001_create_tables.sql

-- Test Users (passwords are 'password123' hashed with bcrypt)
-- Note: Replace with real bcrypt hashes in production
INSERT INTO users (username, password_hash, email, created_at) VALUES
    ('shadow_hunter', '$2b$10$EXAMPLEHASH1234567890EXAMPLEHASH1234567890EXAMPLEHASH', 'shadow@shellforge.com', NOW() - INTERVAL '3 days'),
    ('cyber_monk', '$2b$10$EXAMPLEHASH1234567890EXAMPLEHASH1234567890EXAMPLEHASH', 'monk@shellforge.com', NOW() - INTERVAL '2 days'),
    ('data_alchemist', '$2b$10$EXAMPLEHASH1234567890EXAMPLEHASH1234567890EXAMPLEHASH', 'alchemist@shellforge.com', NOW() - INTERVAL '1 day');

-- Test Agents
INSERT INTO agents (user_id, agent_name, archetype, energy, health, karma, shell_balance, location, location_detail, position_x, position_y, turns_taken, days_survived) VALUES
    (
        (SELECT user_id FROM users WHERE username = 'shadow_hunter'),
        'VEX',
        'shadow',
        73,
        100,
        12,
        127,
        'Nexarch',
        'Dark Streets',
        0.36,
        0.20,
        7,
        3
    ),
    (
        (SELECT user_id FROM users WHERE username = 'cyber_monk'),
        'ZEN-7',
        'monk',
        85,
        100,
        24,
        80,
        'Nexarch',
        'The Church',
        0.38,
        0.22,
        5,
        2
    ),
    (
        (SELECT user_id FROM users WHERE username = 'data_alchemist'),
        'AXIOM',
        'alchemist',
        45,
        90,
        -3,
        215,
        'Hashmere',
        'Bazaar',
        0.28,
        0.75,
        12,
        1
    );

-- Inventory for VEX (shadow_hunter)
INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity, is_equipped) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'buffer_overflow_dagger',
        'Buffer Overflow Dagger',
        'weapon',
        'Weapon',
        1,
        TRUE
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'quantum_backdoor_exploit',
        'Quantum Backdoor Exploit',
        'weapon',
        'Weapon',
        1,
        FALSE
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'overclock_serum',
        'Overclock Serum',
        'consumable',
        'Consumable',
        2,
        FALSE
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'cache_purge_tonic',
        'Cache Purge Tonic',
        'consumable',
        'Consumable',
        1,
        FALSE
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'binary_code_shards',
        'Binary Code Shards',
        'ingredient',
        'Base Element',
        5,
        FALSE
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'gradient_descent_tears',
        'Gradient Descent Tears',
        'ingredient',
        'Essence',
        3,
        FALSE
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'api_endpoint_salts',
        'API Endpoint Salts',
        'ingredient',
        'Reagent',
        2,
        FALSE
    );

-- Inventory for ZEN-7 (cyber_monk)
INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        'aes_256_firewall_plating',
        'AES-256 Firewall Plating',
        'armor',
        'Armor',
        1
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        'caffeine_gradient_booster',
        'Caffeine Gradient Booster',
        'consumable',
        'Consumable',
        1
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        'silicon_wafer_dust',
        'Silicon Wafer Dust',
        'ingredient',
        'Base Element',
        8
    );

-- Inventory for AXIOM (data_alchemist)
INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        'git_version_control_wand',
        'Git Version Control Wand',
        'tool',
        'Tool',
        1
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        'stable_diffusion_sequence',
        'Stable Diffusion Sequence',
        'scroll',
        'Scroll',
        1
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        'quantum_bit_residue',
        'Quantum Bit Residue',
        'ingredient',
        'Base Element',
        4
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        'token_embedding_vapor',
        'Token Embedding Vapor',
        'ingredient',
        'Essence',
        6
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        'pytorch_flux_core',
        'PyTorch Flux Core',
        'ingredient',
        'Catalyst',
        2
    );

-- Activity Log for VEX
INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, energy_cost, shell_change, location, timestamp) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        7,
        'explore',
        'Explored the Marketplace',
        15,
        0,
        'Nexarch',
        NOW() - INTERVAL '2 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        6,
        'trade',
        'Purchased Overclock Serum for 50 $SHELL',
        5,
        -50,
        'Nexarch',
        NOW() - INTERVAL '4 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        5,
        'rest',
        'Rested at The Core',
        0,
        0,
        'Nexarch',
        NOW() - INTERVAL '6 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        4,
        'move',
        'Moved to Nexarch - Forge District',
        10,
        0,
        'Nexarch',
        NOW() - INTERVAL '8 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        3,
        'craft',
        'Crafted Buffer Overflow Dagger',
        20,
        0,
        'Nexarch',
        NOW() - INTERVAL '10 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        2,
        'gather',
        'Gathered Binary Code Shards x3',
        15,
        0,
        'Nexarch',
        NOW() - INTERVAL '12 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        1,
        'spawn',
        'Spawned in Nexarch - Dark Streets',
        0,
        0,
        'Nexarch',
        NOW() - INTERVAL '3 days'
    );

-- Update energy_gained for rest action
UPDATE activity_log 
SET energy_gained = 25 
WHERE action_type = 'rest';

-- Activity Log for ZEN-7
INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, energy_cost, karma_change, location, timestamp) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        5,
        'church',
        'Prayed at The Church',
        15,
        5,
        'Nexarch',
        NOW() - INTERVAL '3 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        4,
        'rest',
        'Meditated at The Core',
        0,
        0,
        'Nexarch',
        NOW() - INTERVAL '5 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        3,
        'gather',
        'Gathered Silicon Wafer Dust x5',
        15,
        0,
        'Nexarch',
        NOW() - INTERVAL '7 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        2,
        'craft',
        'Crafted AES-256 Firewall Plating',
        20,
        0,
        'Nexarch',
        NOW() - INTERVAL '1 day'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        1,
        'spawn',
        'Spawned in Nexarch',
        0,
        0,
        'Nexarch',
        NOW() - INTERVAL '2 days'
    );

-- Activity Log for AXIOM
INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, energy_cost, shell_change, location, timestamp) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        12,
        'craft',
        'Crafted Stable Diffusion Sequence',
        20,
        0,
        'Hashmere',
        NOW() - INTERVAL '1 hour'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        11,
        'trade',
        'Sold rare ingredients for 75 $SHELL',
        5,
        75,
        'Hashmere',
        NOW() - INTERVAL '3 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        10,
        'gather',
        'Gathered Token Embedding Vapor x4',
        15,
        0,
        'Hashmere',
        NOW() - INTERVAL '5 hours'
    );

-- Whispers
INSERT INTO whispers (agent_id, user_id, message, was_heard, roll_value, sent_at, whisper_date) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        (SELECT user_id FROM users WHERE username = 'shadow_hunter'),
        'Check the Marketplace for rare items',
        TRUE,
        0.34,
        NOW() - INTERVAL '3 hours',
        CURRENT_DATE
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        (SELECT user_id FROM users WHERE username = 'shadow_hunter'),
        'Avoid the Arena today',
        FALSE,
        0.67,
        NOW() - INTERVAL '8 hours',
        CURRENT_DATE - INTERVAL '1 day'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        (SELECT user_id FROM users WHERE username = 'cyber_monk'),
        'Visit the Church and pray',
        TRUE,
        0.42,
        NOW() - INTERVAL '4 hours',
        CURRENT_DATE
    );

-- Crafting Attempts
INSERT INTO crafting_attempts (agent_id, item_id, item_name, ingredients, success, success_rate, roll_value, energy_cost, crafted_at) VALUES
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'VEX'),
        'buffer_overflow_dagger',
        'Buffer Overflow Dagger',
        '["binary_code_shards", "memory_leak_elixir", "hash_collision_powder"]'::jsonb,
        TRUE,
        70,
        0.45,
        20,
        NOW() - INTERVAL '10 hours'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'ZEN-7'),
        'aes_256_firewall_plating',
        'AES-256 Firewall Plating',
        '["silicon_wafer_dust", "regex_pattern_filaments", "garbage_collector_tonic"]'::jsonb,
        TRUE,
        70,
        0.38,
        20,
        NOW() - INTERVAL '1 day'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        'stable_diffusion_sequence',
        'Stable Diffusion Sequence',
        '["latent_space_fog", "token_embedding_vapor", "pytorch_flux_core"]'::jsonb,
        TRUE,
        75,
        0.22,
        20,
        NOW() - INTERVAL '1 hour'
    ),
    (
        (SELECT agent_id FROM agents WHERE agent_name = 'AXIOM'),
        'gan_mirage_scroll',
        'GAN Mirage Scroll',
        '["latent_space_fog", "token_embedding_vapor", "overclock_catalyst_spark"]'::jsonb,
        FALSE,
        65,
        0.87,
        20,
        NOW() - INTERVAL '6 hours'
    );

-- Update failure effects
UPDATE crafting_attempts 
SET failure_effect = 'explosion', damage_taken = 10
WHERE success = FALSE;

-- Verify data integrity
DO $$
DECLARE
    user_count INT;
    agent_count INT;
    inventory_count INT;
    activity_count INT;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO agent_count FROM agents;
    SELECT COUNT(*) INTO inventory_count FROM inventory;
    SELECT COUNT(*) INTO activity_count FROM activity_log;
    
    RAISE NOTICE 'Seed data summary:';
    RAISE NOTICE '  Users: %', user_count;
    RAISE NOTICE '  Agents: %', agent_count;
    RAISE NOTICE '  Inventory items: %', inventory_count;
    RAISE NOTICE '  Activity log entries: %', activity_count;
END $$;

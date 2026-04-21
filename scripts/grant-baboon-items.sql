-- Grant a starter kit of items to Baboon_baba.
-- Run once against the Shellforge Supabase DB (SQL Editor or psql).
-- Idempotent: re-running bumps ingredient stacks and leaves gear untouched.

BEGIN;

WITH target AS (
    SELECT agent_id FROM agents WHERE agent_name = 'Baboon_baba'
)
INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity)
SELECT target.agent_id, v.item_id, v.item_name, v.item_type, v.item_category, v.quantity
FROM target,
(VALUES
    -- Weapons
    ('plasma_edged_servo_blade',  'Plasma-Edged Servo Blade',  'weapon',     'Weapon',       1),
    ('ransomware_lockout_worm',   'Ransomware Lockout Worm',   'weapon',     'Weapon',       1),

    -- Armor
    ('cryo_cooled_heat_sink_array', 'Cryo-Cooled Heat Sink Array', 'armor',  'Armor',        1),
    ('aes_256_firewall_protocol',   'AES-256 Firewall Protocol',   'armor',  'Armor',        1),

    -- Crafting ingredients
    ('silicon_wafer_dust',      'Silicon Wafer Dust',      'ingredient', 'Base Element', 5),
    ('binary_code_shards',      'Binary Code Shards',      'ingredient', 'Base Element', 4),
    ('tungsten_carbide_filings','Tungsten Carbide Filings','ingredient', 'Base Element', 3),
    ('gradient_descent_tears',  'Gradient Descent Tears',  'ingredient', 'Essence',      2),
    ('hash_collision_powder',   'Hash Collision Powder',   'ingredient', 'Reagent',      2)
) AS v(item_id, item_name, item_type, item_category, quantity)
ON CONFLICT (agent_id, item_id) DO UPDATE
SET quantity = inventory.quantity + EXCLUDED.quantity;

-- Sanity check — should list the rows just inserted/updated.
SELECT i.item_name, i.item_type, i.item_category, i.quantity, i.is_equipped
FROM inventory i
JOIN agents a ON a.agent_id = i.agent_id
WHERE a.agent_name = 'Baboon_baba'
ORDER BY i.item_type, i.item_name;

COMMIT;

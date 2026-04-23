-- Orphan-item audit — READ-ONLY.
-- Lists rows in live-state tables whose item_id isn't in the canonical
-- alchemy catalog (alchemy_items + alchemy_ingredients).
--
-- Run this in Supabase SQL Editor. Nothing is modified.
-- After reviewing the output, run scripts/cleanup-orphan-items.sql to delete
-- whatever you don't want to keep.
--
-- NOT audited here:
--   - agent_listings      → player-listed items by design; custom names are expected
--   - crafting_attempts   → historical log; preserve even if the referenced item no longer exists
--   - activity_log        → historical log; same reason
--
-- Prerequisite: alchemy/migration.sql + alchemy/seed.sql must have been run so
-- alchemy_items and alchemy_ingredients are populated. The first query below
-- confirms that. If both counts are 0, STOP and seed the catalog first —
-- otherwise every live row will look like an orphan.

-- ══════════════════════════════════════════════════════════════════
-- 0. Catalog size sanity-check — run this first.
-- ══════════════════════════════════════════════════════════════════
SELECT 'alchemy_items'       AS catalog_table, COUNT(*) AS rows FROM alchemy_items
UNION ALL
SELECT 'alchemy_ingredients' AS catalog_table, COUNT(*) AS rows FROM alchemy_ingredients;

-- Expected: alchemy_items ≈ 80, alchemy_ingredients ≈ 50.
-- If either is 0, STOP. Seed the catalog before running the queries below.


-- ══════════════════════════════════════════════════════════════════
-- 1. Orphan summary — one row per orphan item_id across all audited tables.
-- ══════════════════════════════════════════════════════════════════
WITH catalog AS (
    SELECT id FROM alchemy_items
    UNION
    SELECT id FROM alchemy_ingredients
),
orphans AS (
    SELECT 'market_listings' AS source, item_id, item_name, 1 AS rows, COALESCE(stock, 0) AS qty
        FROM market_listings WHERE item_id NOT IN (SELECT id FROM catalog)
    UNION ALL
    SELECT 'inventory',       item_id, item_name, 1,                    COALESCE(quantity, 0)
        FROM inventory       WHERE item_id NOT IN (SELECT id FROM catalog)
    UNION ALL
    SELECT 'vault',           item_id, item_name, 1,                    COALESCE(quantity, 0)
        FROM vault           WHERE item_id NOT IN (SELECT id FROM catalog)
)
SELECT
    source,
    item_id,
    MAX(item_name) AS item_name,
    SUM(rows) AS rows,
    SUM(qty)  AS total_qty
FROM orphans
GROUP BY source, item_id
ORDER BY source, item_name;


-- ══════════════════════════════════════════════════════════════════
-- 2. Orphan detail — market_listings (per-location breakdown).
-- ══════════════════════════════════════════════════════════════════
WITH catalog AS (
    SELECT id FROM alchemy_items
    UNION
    SELECT id FROM alchemy_ingredients
)
SELECT
    location,
    item_id,
    item_name,
    item_type,
    base_price,
    current_price,
    stock
FROM market_listings
WHERE item_id NOT IN (SELECT id FROM catalog)
ORDER BY location, item_name;


-- ══════════════════════════════════════════════════════════════════
-- 3. Orphan detail — inventory (who's holding ghost items).
-- ══════════════════════════════════════════════════════════════════
WITH catalog AS (
    SELECT id FROM alchemy_items
    UNION
    SELECT id FROM alchemy_ingredients
)
SELECT
    a.agent_name,
    i.item_id,
    i.item_name,
    i.item_type,
    i.quantity,
    i.is_equipped
FROM inventory i
LEFT JOIN agents a ON a.agent_id = i.agent_id
WHERE i.item_id NOT IN (SELECT id FROM catalog)
ORDER BY a.agent_name, i.item_name;


-- ══════════════════════════════════════════════════════════════════
-- 4. Orphan detail — vault (deposited from dead agents).
-- ══════════════════════════════════════════════════════════════════
WITH catalog AS (
    SELECT id FROM alchemy_items
    UNION
    SELECT id FROM alchemy_ingredients
)
SELECT
    v.item_id,
    v.item_name,
    v.item_type,
    v.quantity,
    v.deposited_at
FROM vault v
WHERE v.item_id NOT IN (SELECT id FROM catalog)
ORDER BY v.item_name;


-- ══════════════════════════════════════════════════════════════════
-- 5. Totals — quick "how bad is it" summary.
-- ══════════════════════════════════════════════════════════════════
WITH catalog AS (
    SELECT id FROM alchemy_items
    UNION
    SELECT id FROM alchemy_ingredients
)
SELECT
    'market_listings' AS table_name,
    COUNT(*) FILTER (WHERE item_id NOT IN (SELECT id FROM catalog)) AS orphan_rows,
    COUNT(*) AS total_rows
FROM market_listings
UNION ALL
SELECT 'inventory',
    COUNT(*) FILTER (WHERE item_id NOT IN (SELECT id FROM catalog)),
    COUNT(*) FROM inventory
UNION ALL
SELECT 'vault',
    COUNT(*) FILTER (WHERE item_id NOT IN (SELECT id FROM catalog)),
    COUNT(*) FROM vault;

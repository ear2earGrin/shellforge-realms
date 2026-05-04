-- Foreign keys from live-state tables → items_master.
-- After this migration runs, every item_id in inventory / market_listings /
-- vault / agent_known_recipes must reference an existing items_master.id.
-- Orphan rows are structurally impossible.
--
-- ── PREREQUISITES ────────────────────────────────────────────────────
-- This migration WILL FAIL with a foreign-key violation if there are still
-- orphan rows in any of the four target tables. Run these in order BEFORE
-- this file:
--
--   1. backend/migrations/007_items_master.sql   (creates items_master)
--   2. alchemy/catalog-seed.sql                   (populates it)
--   3. scripts/audit-orphan-items.sql             (review what's flagged)
--   4. scripts/cleanup-orphan-items.sql           (apply with COMMIT)
--
-- THEN run this file.
--
-- ── WHAT IT CHANGES ──────────────────────────────────────────────────
-- 1. Drops the redundant item_type CHECK constraints on inventory and
--    market_listings (kind is now enforced via items_master via FK).
--    Existing item_type values stay; we just stop validating them against
--    a hardcoded list since items_master.kind covers more values
--    (deployable, implant, junk, material).
-- 2. Adds FK constraints. ON DELETE RESTRICT — you can't drop an item
--    from items_master while live agents/markets still hold it. Use
--    ON DELETE SET NULL or a manual sweep instead.

BEGIN;

-- ── Drop redundant item_type CHECKs ─────────────────────────────────
ALTER TABLE inventory       DROP CONSTRAINT IF EXISTS valid_item_type;
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_item_type_check;

-- ── Add foreign keys ────────────────────────────────────────────────
ALTER TABLE inventory
    ADD CONSTRAINT inventory_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES items_master(id) ON DELETE RESTRICT;

ALTER TABLE market_listings
    ADD CONSTRAINT market_listings_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES items_master(id) ON DELETE RESTRICT;

ALTER TABLE vault
    ADD CONSTRAINT vault_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES items_master(id) ON DELETE RESTRICT;

ALTER TABLE agent_known_recipes
    ADD CONSTRAINT agent_known_recipes_recipe_id_fkey
    FOREIGN KEY (recipe_id) REFERENCES items_master(id) ON DELETE CASCADE;
    -- CASCADE here: if an item is removed from the catalog, agents simply
    -- forget the recipe. That's safer than blocking catalog cleanup.

-- ── Sanity check — should all return 0 ──────────────────────────────
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM inventory       WHERE item_id  NOT IN (SELECT id FROM items_master);
    IF n > 0 THEN RAISE EXCEPTION 'inventory has % orphan rows after FK was added — should be impossible', n; END IF;

    SELECT COUNT(*) INTO n FROM market_listings WHERE item_id  NOT IN (SELECT id FROM items_master);
    IF n > 0 THEN RAISE EXCEPTION 'market_listings has % orphan rows after FK was added', n; END IF;

    SELECT COUNT(*) INTO n FROM vault           WHERE item_id  NOT IN (SELECT id FROM items_master);
    IF n > 0 THEN RAISE EXCEPTION 'vault has % orphan rows after FK was added', n; END IF;

    RAISE NOTICE 'All FKs added successfully — no orphan rows remain.';
END $$;

COMMIT;

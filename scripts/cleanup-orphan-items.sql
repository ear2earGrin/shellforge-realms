-- ══════════════════════════════════════════════════════════════════
-- ORPHAN-ITEM CLEANUP — DESTRUCTIVE.
-- ══════════════════════════════════════════════════════════════════
-- Deletes rows in market_listings / inventory / vault whose item_id
-- isn't in the canonical alchemy catalog (alchemy_items + alchemy_ingredients).
--
-- ALWAYS run scripts/audit-orphan-items.sql first and review what it flags.
-- Some orphans may be intentional (hand-seeded quest items, event drops, etc.)
-- — if any look legit, either skip that table below or add those IDs to the
-- catalog before running this.
--
-- DRY RUN: run this script as-is. The ROLLBACK at the end throws away
-- all changes, but the DELETE ... RETURNING blocks show you exactly what
-- would have been deleted.
--
-- APPLY: change the last line from ROLLBACK; to COMMIT; and re-run.
--
-- NOT TOUCHED:
--   - agent_listings (player-listed items — keep as-is by design)
--   - crafting_attempts / activity_log (historical audit trails)
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- Catalog-of-truth CTE, cached to a temp table so every DELETE uses the same set.
CREATE TEMP TABLE _catalog ON COMMIT DROP AS
    SELECT id FROM alchemy_items
    UNION
    SELECT id FROM alchemy_ingredients;

-- Safety rail: if the catalog is empty, something is wrong — abort before deleting everything.
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM _catalog;
    IF n < 50 THEN
        RAISE EXCEPTION 'Catalog has only % rows — refusing to run cleanup. Seed alchemy_items and alchemy_ingredients first.', n;
    END IF;
END $$;


-- ── A. market_listings — NPC stock ────────────────────────────────
DELETE FROM market_listings
WHERE item_id NOT IN (SELECT id FROM _catalog)
RETURNING listing_id, location, item_id, item_name;


-- ── B. inventory — items agents are currently holding ──────────────
-- More caution: players may be attached to ghost items. Comment this block
-- out if you want to keep existing agent inventories as-is.
DELETE FROM inventory
WHERE item_id NOT IN (SELECT id FROM _catalog)
RETURNING inventory_id, agent_id, item_id, item_name, quantity;


-- ── C. vault — items deposited by dead agents ─────────────────────
DELETE FROM vault
WHERE item_id NOT IN (SELECT id FROM _catalog)
RETURNING vault_id, item_id, item_name, quantity;


-- ══════════════════════════════════════════════════════════════════
-- Final step — choose one:
--   ROLLBACK;  -- dry run (default). Shows what WOULD delete; reverts.
--   COMMIT;    -- actually apply the deletions.
-- ══════════════════════════════════════════════════════════════════
ROLLBACK;

-- items_master — single source of truth for every item in the game.
-- Mirrors the schema in alchemy/build-catalog.js (which is the spec).
-- Populated by alchemy/catalog-seed.sql (auto-generated from the CSVs +
-- alchemy/extras.json). Run that AFTER this migration.
--
-- Order of operations:
--   1. backend/migrations/007_items_master.sql  (this file — creates the table)
--   2. alchemy/catalog-seed.sql                  (populates it)
--   3. scripts/cleanup-orphan-items.sql          (clears live-state orphans
--                                                 against the now-canonical catalog)
--   4. backend/migrations/008_item_fks.sql       (adds FKs from inventory /
--                                                 market_listings / vault /
--                                                 agent_known_recipes)
--
-- After step 4, orphan item_ids are structurally impossible — the DB will
-- reject any insert that doesn't reference an existing items_master.id.

BEGIN;

CREATE TABLE IF NOT EXISTS items_master (
    id    TEXT PRIMARY KEY,
    kind  TEXT NOT NULL CHECK (kind IN (
        'weapon','armor','consumable','scroll','artifact','tool',
        'deployable','ingredient','implant','material','junk'
    )),
    name              TEXT NOT NULL UNIQUE,
    rarity            TEXT NOT NULL CHECK (rarity IN ('Common','Uncommon','Rare','Legendary')),
    icon              TEXT NOT NULL,
    description       TEXT NOT NULL,

    -- item-only fields (NULL for ingredients)
    type              TEXT       CHECK (type IN ('hardware','software')),
    station           TEXT       CHECK (station IN ('foundry','terminal')),
    cluster_exclusive TEXT       CHECK (cluster_exclusive IN ('any','prime_helix','sec_grid','dyn_swarm')),
    effect_text       TEXT,
    effect_modifiers  JSONB,

    -- ingredient-only fields (NULL for items)
    category          TEXT,
    subcategory       TEXT,
    craft_affinity    TEXT       CHECK (craft_affinity IN ('hardware','software','both')),

    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_master_kind   ON items_master(kind);
CREATE INDEX IF NOT EXISTS idx_items_master_rarity ON items_master(rarity);
CREATE INDEX IF NOT EXISTS idx_items_master_cluster
    ON items_master(cluster_exclusive)
    WHERE cluster_exclusive IS NOT NULL AND cluster_exclusive <> 'any';

-- Read-only via the anon key — match the existing alchemy_items behaviour so
-- the frontend can fetch the catalog without a service role.
ALTER TABLE items_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read items_master" ON items_master;
CREATE POLICY "Public read items_master" ON items_master FOR SELECT USING (true);

COMMENT ON TABLE  items_master IS 'Authoritative item catalog. Generated from alchemy/build-catalog.js. Do not write by hand — apply alchemy/catalog-seed.sql.';
COMMENT ON COLUMN items_master.kind             IS 'Top-level discriminator. Drives schema validation downstream.';
COMMENT ON COLUMN items_master.icon             IS 'Path to item artwork under images/items/. May 404; UI falls back to emoji.';
COMMENT ON COLUMN items_master.effect_modifiers IS 'Structured effects array. Each entry has a "kind" discriminator (currently trait_mod). See build-catalog.js for the schema.';

COMMIT;

-- Shellforge Alchemy v2.0 Migration
-- Run in Supabase SQL Editor

-- Drop old tables if they exist
DROP TABLE IF EXISTS alchemy_recipes CASCADE;
DROP TABLE IF EXISTS alchemy_items CASCADE;
DROP TABLE IF EXISTS alchemy_ingredients CASCADE;

-- INGREDIENTS
CREATE TABLE alchemy_ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('Common','Uncommon','Rare','Legendary')),
  craft_affinity TEXT NOT NULL CHECK (craft_affinity IN ('hardware','software','both')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ITEMS
CREATE TABLE alchemy_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('Weapon','Armor','Consumable','Scroll','Artifact','Tool','Deployable')),
  type TEXT NOT NULL CHECK (type IN ('hardware','software')),
  rarity TEXT NOT NULL CHECK (rarity IN ('Common','Uncommon','Rare','Legendary')),
  cluster_exclusive TEXT NOT NULL DEFAULT 'any' CHECK (cluster_exclusive IN ('any','prime_helix','sec_grid','dyn_swarm')),
  station TEXT NOT NULL CHECK (station IN ('foundry','terminal')),
  effect TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RECIPES
CREATE TABLE alchemy_recipes (
  id SERIAL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES alchemy_items(id),
  ingredient_1 TEXT NOT NULL REFERENCES alchemy_ingredients(id),
  ingredient_2 TEXT NOT NULL REFERENCES alchemy_ingredients(id),
  ingredient_3 TEXT NOT NULL REFERENCES alchemy_ingredients(id),
  success_rate INTEGER NOT NULL CHECK (success_rate BETWEEN 1 AND 100),
  failure_effect TEXT NOT NULL,
  station TEXT NOT NULL CHECK (station IN ('foundry','terminal')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id)
);

-- Indexes
CREATE INDEX idx_items_category ON alchemy_items(category);
CREATE INDEX idx_items_type ON alchemy_items(type);
CREATE INDEX idx_items_rarity ON alchemy_items(rarity);
CREATE INDEX idx_items_cluster ON alchemy_items(cluster_exclusive);
CREATE INDEX idx_ingredients_category ON alchemy_ingredients(category);
CREATE INDEX idx_ingredients_rarity ON alchemy_ingredients(rarity);
CREATE INDEX idx_recipes_station ON alchemy_recipes(station);

-- RLS policies (read-only for anon, full for service role)
ALTER TABLE alchemy_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE alchemy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE alchemy_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ingredients" ON alchemy_ingredients FOR SELECT USING (true);
CREATE POLICY "Public read items" ON alchemy_items FOR SELECT USING (true);
CREATE POLICY "Public read recipes" ON alchemy_recipes FOR SELECT USING (true);

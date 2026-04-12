#!/usr/bin/env node
// Generates seed.sql from alchemy-system.json
const fs = require('fs');
const path = require('path');
const data = require('./alchemy-system.json');

const esc = s => s.replace(/'/g, "''");
const lines = ['-- Shellforge Alchemy v2.0 Seed Data', '-- Run AFTER migration.sql\n'];

// Ingredients
lines.push('-- INGREDIENTS');
data.ingredients.forEach(i => {
  lines.push(`INSERT INTO alchemy_ingredients (id, name, category, subcategory, rarity, craft_affinity, description) VALUES ('${i.id}', '${esc(i.name)}', '${i.category}', '${i.subcategory}', '${i.rarity}', '${i.craft_affinity}', '${esc(i.description)}');`);
});

// Items
lines.push('\n-- ITEMS');
data.items.forEach(i => {
  lines.push(`INSERT INTO alchemy_items (id, name, category, type, rarity, cluster_exclusive, station, effect, description) VALUES ('${i.id}', '${esc(i.name)}', '${i.category}', '${i.type}', '${i.rarity}', '${i.cluster_exclusive}', '${i.station}', '${esc(i.effect)}', '${esc(i.description)}');`);
});

// Recipes
lines.push('\n-- RECIPES');
data.recipes.forEach(r => {
  lines.push(`INSERT INTO alchemy_recipes (item_id, ingredient_1, ingredient_2, ingredient_3, success_rate, failure_effect, station) VALUES ('${r.item_id}', '${r.ingredient_ids[0]}', '${r.ingredient_ids[1]}', '${r.ingredient_ids[2]}', ${r.success_rate}, '${esc(r.failure_detail)}', '${r.station}');`);
});

const out = lines.join('\n');
fs.writeFileSync(path.join(__dirname, 'seed.sql'), out);
console.log(`Written seed.sql (${(out.length/1024).toFixed(1)} KB) — ${data.ingredients.length} ingredients, ${data.items.length} items, ${data.recipes.length} recipes`);

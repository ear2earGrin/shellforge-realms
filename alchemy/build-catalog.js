#!/usr/bin/env node
//
// build-catalog.js — produces the unified item catalog (catalog.json).
//
// This is the source-of-truth builder for *every* item in the game.
// Downstream consumers (DB seed, frontend bundle, worker constant) all read
// catalog.json. Don't hand-edit catalog.json — edit the inputs and rerun.
//
// ── INPUTS ───────────────────────────────────────────────────────────
//   items.csv        canonical weapons / armor / consumables / scrolls / artifacts / tools / deployables
//   ingredients.csv  canonical crafting ingredients
//   extras.json      anything that doesn't fit the CSV mold — implants,
//                    quest items, NPC-only oddities. Each entry must
//                    follow the schema below; the build will fail otherwise.
//
// ── OUTPUT ───────────────────────────────────────────────────────────
//   catalog.json     flat array, one row per item, sorted by (kind, name).
//
// ── SCHEMA (per entry) ───────────────────────────────────────────────
//   id                string, snake_case slug, primary key everywhere
//   kind              "weapon" | "armor" | "consumable" | "scroll" |
//                     "artifact" | "tool" | "deployable" | "ingredient" |
//                     "implant" | "material" | "junk"
//   name              human display name
//   rarity            "Common" | "Uncommon" | "Rare" | "Legendary"
//   icon              path to image (kebab-case slug under images/items/)
//   description       flavor text
//
//   ── item-only ──
//   type              "hardware" | "software"           (null for ingredients)
//   station           "foundry" | "terminal"            (null for ingredients)
//   cluster_exclusive "any" | "prime_helix" | "sec_grid" | "dyn_swarm"
//   effect_text       human-readable effect / null
//   effect_modifiers  structured effects, see below     (null for now on most)
//
//   ── ingredient-only ──
//   category          "Base Element" | "Essence" | "Reagent" | "Catalyst" | "Solvent" | "Primordial"
//   subcategory       finer ingredient class (Physical / Digital / ML / NLP / …)
//   craft_affinity    "hardware" | "software" | "both"
//
// ── effect_modifiers ─────────────────────────────────────────────────
// Forward-compatible array of effect objects. Each has a `kind` discriminator
// so new effect types can be added without breaking older consumers.
//
// Currently defined:
//   { kind: "trait_mod", trait: <traitName>, delta: <number>, scope: "passive" }
//     ↳ passive trait modifier (e.g. implants, equipped armor).
//
// Reserved for later:
//   damage, dot, on_hit, on_use, on_cast — populate as combat needs.

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const REQUIRED_KINDS = new Set([
    'weapon','armor','consumable','scroll','artifact','tool','deployable',
    'ingredient','implant','material','junk',
]);
const REQUIRED_RARITIES = new Set(['Common','Uncommon','Rare','Legendary']);

// ── CSV parsing (mirrors build-json.js to stay compatible) ──────────
function parseCSV(filename) {
    const raw = fs.readFileSync(path.join(dir, filename), 'utf8').trim();
    const lines = raw.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const parts = line.split(',');
        const obj = {};
        if (parts.length > headers.length) {
            for (let i = 0; i < headers.length - 1; i++) obj[headers[i]] = parts[i].trim();
            obj[headers[headers.length - 1]] = parts.slice(headers.length - 1).join(',').trim();
        } else {
            headers.forEach((h, i) => { obj[h] = (parts[i] || '').trim(); });
        }
        return obj;
    });
}

const snakeId   = name => name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const kebabSlug = name => name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const iconFor   = name => `images/items/${kebabSlug(name)}.jpg`;

// ── transform CSV rows ──────────────────────────────────────────────
function fromItem(row) {
    const kind = row.category.toLowerCase(); // Weapon → weapon
    return {
        id:                snakeId(row.name),
        kind,
        name:              row.name,
        rarity:            row.rarity,
        icon:              iconFor(row.name),
        description:       row.description,
        type:              row.type || null,
        station:           row.type === 'hardware' ? 'foundry' : 'terminal',
        cluster_exclusive: row.cluster_exclusive || 'any',
        effect_text:       row.effect || null,
        effect_modifiers:  null,
        category:          null,
        subcategory:       null,
        craft_affinity:    null,
    };
}
function fromIngredient(row) {
    return {
        id:                snakeId(row.name),
        kind:              'ingredient',
        name:              row.name,
        rarity:            row.rarity,
        icon:              iconFor(row.name),
        description:       row.description,
        type:              null,
        station:           null,
        cluster_exclusive: null,
        effect_text:       null,
        effect_modifiers:  null,
        category:          row.category || null,
        subcategory:       row.subcategory || null,
        craft_affinity:    row.craft_affinity || null,
    };
}

// ── extras.json validation ──────────────────────────────────────────
function validateExtra(e, idx) {
    const must = ['id','kind','name','rarity','description'];
    for (const f of must) {
        if (!e[f]) throw new Error(`extras[${idx}] missing required field "${f}": ${JSON.stringify(e)}`);
    }
    if (!REQUIRED_KINDS.has(e.kind))      throw new Error(`extras[${idx}] invalid kind "${e.kind}"`);
    if (!REQUIRED_RARITIES.has(e.rarity)) throw new Error(`extras[${idx}] invalid rarity "${e.rarity}"`);
    if (snakeId(e.name) !== e.id) console.warn(`[warn] extras[${idx}] id "${e.id}" doesn't match slug of name "${e.name}" — that's allowed but unusual.`);

    // Fill in missing optional fields with nulls so every catalog row has the
    // same shape (downstream consumers can assume column presence).
    return {
        id:                e.id,
        kind:              e.kind,
        name:              e.name,
        rarity:            e.rarity,
        icon:              e.icon              || iconFor(e.name),
        description:       e.description,
        type:              e.type              || null,
        station:           e.station           || null,
        cluster_exclusive: e.cluster_exclusive || (e.kind === 'ingredient' ? null : 'any'),
        effect_text:       e.effect_text       || null,
        effect_modifiers:  e.effect_modifiers  || null,
        category:          e.category          || null,
        subcategory:       e.subcategory       || null,
        craft_affinity:    e.craft_affinity    || null,
    };
}

// ── build ───────────────────────────────────────────────────────────
const items       = parseCSV('items.csv').map(fromItem);
const ingredients = parseCSV('ingredients.csv').map(fromIngredient);

const extrasPath = path.join(dir, 'extras.json');
const extras = fs.existsSync(extrasPath)
    ? JSON.parse(fs.readFileSync(extrasPath, 'utf8'))
        .filter(e => !e._section)              // section dividers for human readability
        .map(validateExtra)
    : [];

// ── overlay item-effects.json onto items.csv-derived entries ────────
// extras.json entries already carry effect_modifiers inline; items.csv
// entries get them from this file (keyed by item_id).
const effectsPath = path.join(dir, 'item-effects.json');
const itemEffects = fs.existsSync(effectsPath)
    ? JSON.parse(fs.readFileSync(effectsPath, 'utf8'))
    : {};
for (const it of items) {
    if (Array.isArray(itemEffects[it.id])) {
        it.effect_modifiers = itemEffects[it.id];
    }
}
// Effect-modifier sanity check — every kind listed here is referenced by code.
const ALLOWED_EFFECT_KINDS = new Set([
    'trait_mod','heal','energy','cleanse','buff','debuff','resist','reflect','immune',
    'first_hit_absorb','pierce','aoe','summon','reveal','predict','replay_action',
    'simulate','evolve_items','extra_action_on_kill','invert_actions',
    'preserve_items_on_death','drain','jam','lure','trap','perma_debuff','clone',
    'hot_swap','solve','ask_oracle','rewind_on_fail','escape_trap','reposition',
    'steal_item','alter_rule','craft_in_field','heal_ally','share_buffs',
    'permanent_stat_boost','recover_destroyed_item',
    // Pliny's Arsenal additions:
    'snapshot_restore','share_damage','cost_reduce',
]);
for (const e of [...items, ...extras]) {
    if (!Array.isArray(e.effect_modifiers)) continue;
    for (const m of e.effect_modifiers) {
        if (!ALLOWED_EFFECT_KINDS.has(m.kind)) {
            throw new Error(`${e.id}: unknown effect kind "${m.kind}". Add to ALLOWED_EFFECT_KINDS in build-catalog.js if intentional.`);
        }
    }
}

const all = [...items, ...ingredients, ...extras];

// Dedupe / collision check — an ID must appear exactly once across all sources.
const seen = new Map();
for (const e of all) {
    if (seen.has(e.id)) {
        throw new Error(`Duplicate id "${e.id}" — found in both ${seen.get(e.id)} and ${e.kind}. Rename one.`);
    }
    seen.set(e.id, e.kind);
}

// Stable order — kind, then name. Keeps diffs small when CSVs change.
all.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

// ── write ───────────────────────────────────────────────────────────
const outPath = path.join(dir, 'catalog.json');
fs.writeFileSync(outPath, JSON.stringify(all, null, 2) + '\n');

// ── also emit catalog-seed.sql (idempotent UPSERT into items_master) ──
function sqlString(s) {
    if (s === null || s === undefined) return 'NULL';
    return "'" + String(s).replace(/'/g, "''") + "'";
}
function sqlJsonb(v) {
    if (v === null || v === undefined) return 'NULL';
    return sqlString(JSON.stringify(v)) + '::jsonb';
}
const COLS = [
    'id','kind','name','rarity','icon','description',
    'type','station','cluster_exclusive','effect_text','effect_modifiers',
    'category','subcategory','craft_affinity',
];
const sqlLines = [];
sqlLines.push('-- AUTO-GENERATED by alchemy/build-catalog.js — do not edit by hand.');
sqlLines.push('-- Idempotent: re-running upserts every row + bumps updated_at.');
sqlLines.push('-- Prerequisite: backend/migrations/007_items_master.sql (creates the table).');
sqlLines.push('');
sqlLines.push('BEGIN;');
sqlLines.push('');
sqlLines.push(`INSERT INTO items_master (${COLS.join(', ')}) VALUES`);
const valueRows = all.map(e => {
    const cells = COLS.map(c => {
        const v = e[c];
        if (c === 'effect_modifiers') return sqlJsonb(v);
        return sqlString(v);
    });
    return '    (' + cells.join(', ') + ')';
});
sqlLines.push(valueRows.join(',\n'));
sqlLines.push('ON CONFLICT (id) DO UPDATE SET');
sqlLines.push(COLS.filter(c => c !== 'id').map(c => `    ${c} = EXCLUDED.${c}`).join(',\n') + ',');
sqlLines.push('    updated_at = NOW();');
sqlLines.push('');
sqlLines.push('COMMIT;');
sqlLines.push('');
const seedPath = path.join(dir, 'catalog-seed.sql');
fs.writeFileSync(seedPath, sqlLines.join('\n'));

// ── recipes (joined from recipes.csv + catalog) ─────────────────────
function normalizeFailure(s) {
    const lc = (s || '').toLowerCase();
    if (lc.startsWith('catastrophic')) return 'catastrophic';
    if (lc.includes('20%')) return 'explosion_20';
    if (lc.includes('15%')) return 'explosion_15';
    if (lc.includes('10%')) return 'explosion_10';
    return 'slag';
}

const recipeRows = parseCSV('recipes.csv');
const itemByName = new Map(all.map(e => [e.name, e]));
const recipes = recipeRows.map(r => {
    const item = itemByName.get(r.item_name);
    if (!item) throw new Error(`recipe references unknown item: "${r.item_name}" (not in catalog)`);
    if (item.kind === 'ingredient') throw new Error(`recipe output "${r.item_name}" is an ingredient — recipes must produce items.`);
    return {
        item:     r.item_name,
        item_id:  snakeId(r.item_name),
        category: item.kind,
        station:  r.station,
        hwsw:     item.type,
        ing:      [r.ingredient_1, r.ingredient_2, r.ingredient_3].map(snakeId),
        rate:     parseInt(r.success_rate, 10),
        fail:     normalizeFailure(r.failure_effect),
    };
});

// Validate every ingredient slug references a real catalog ingredient.
const ingIds = new Set(all.filter(e => e.kind === 'ingredient').map(e => e.id));
recipes.forEach((r, i) => r.ing.forEach((id, j) => {
    if (!ingIds.has(id)) throw new Error(`recipe ${i} (${r.item}) references unknown ingredient "${id}" (slot ${j+1})`);
}));

// ── emit worker module (ESM, imported by workers/turn-engine/index.js) ──
const workerOut = `// AUTO-GENERATED by alchemy/build-catalog.js — do not edit by hand.
// Source: alchemy/items.csv + alchemy/recipes.csv
// Regenerate with: node alchemy/build-catalog.js

export const ALCHEMY_RECIPES = ${JSON.stringify(recipes, null, 2)};
`;
const workerPath = path.join(dir, '..', 'workers', 'turn-engine', 'catalog-data.js');
fs.writeFileSync(workerPath, workerOut);

// ── emit frontend bundle (browser globals, loaded via <script src>) ──
// Backwards-compatible with dashboard.html's existing variable shapes.
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const feIngredients = Object.fromEntries(
    all.filter(e => e.kind === 'ingredient').map(e => [e.id, {
        name:           e.name,
        cat:            e.category,
        subcategory:    e.subcategory,
        rarity:         e.rarity,
        craft_affinity: e.craft_affinity,
    }]),
);
const feItems = Object.fromEntries(
    all.filter(e => e.kind !== 'ingredient').map(e => [e.id, {
        name:              e.name,
        kind:              e.kind,
        cat:               cap(e.kind),
        type:              e.type,
        station:           e.station,
        cluster_exclusive: e.cluster_exclusive,
        rarity:            e.rarity,
        desc:              e.effect_text || e.description,
    }]),
);
const feRecipes = recipes.map(r => ({
    item_id:        r.item_id,
    ingredients:    r.ing,
    success_rate:   r.rate,
    failure_effect: r.fail,
    station:        r.station,
}));

const frontendOut = `// AUTO-GENERATED by alchemy/build-catalog.js — do not edit by hand.
// Loaded by dashboard.html via <script src="alchemy/catalog-frontend.js">
// Regenerate with: node alchemy/build-catalog.js

window.ALCHEMY_INGREDIENTS = ${JSON.stringify(feIngredients, null, 2)};

window.ALCHEMY_ITEMS = ${JSON.stringify(feItems, null, 2)};

window.ALCHEMY_RECIPES = ${JSON.stringify(feRecipes, null, 2)};
`;
const frontendPath = path.join(dir, 'catalog-frontend.js');
fs.writeFileSync(frontendPath, frontendOut);

// ── summary ─────────────────────────────────────────────────────────
const byKind = all.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {});
const sizeKb     = (fs.statSync(outPath).size / 1024).toFixed(1);
const sqlSizeKb  = (fs.statSync(seedPath).size / 1024).toFixed(1);
const workerKb   = (fs.statSync(workerPath).size / 1024).toFixed(1);
const frontendKb = (fs.statSync(frontendPath).size / 1024).toFixed(1);
console.log(`✓ wrote catalog.json                       (${all.length} entries, ${sizeKb} KB)`);
console.log(`✓ wrote catalog-seed.sql                   (${all.length} upserts, ${sqlSizeKb} KB)`);
console.log(`✓ wrote ../workers/turn-engine/catalog-data.js  (${recipes.length} recipes, ${workerKb} KB)`);
console.log(`✓ wrote catalog-frontend.js                (${recipes.length} recipes + ${all.length} entries, ${frontendKb} KB)`);
for (const [k, n] of Object.entries(byKind).sort()) console.log(`    ${k.padEnd(12)} ${n}`);
console.log(`  sources: items.csv=${items.length}  ingredients.csv=${ingredients.length}  recipes.csv=${recipes.length}  extras.json=${extras.length}`);

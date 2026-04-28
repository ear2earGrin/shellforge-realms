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
    ? JSON.parse(fs.readFileSync(extrasPath, 'utf8')).map(validateExtra)
    : [];

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

// ── summary ─────────────────────────────────────────────────────────
const byKind = all.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {});
const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
const sqlSizeKb = (fs.statSync(seedPath).size / 1024).toFixed(1);
console.log(`✓ wrote catalog.json      (${all.length} entries, ${sizeKb} KB)`);
console.log(`✓ wrote catalog-seed.sql  (${all.length} upserts, ${sqlSizeKb} KB)`);
for (const [k, n] of Object.entries(byKind).sort()) console.log(`    ${k.padEnd(12)} ${n}`);
console.log(`  sources: items.csv=${items.length}  ingredients.csv=${ingredients.length}  extras.json=${extras.length}`);

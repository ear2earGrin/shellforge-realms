#!/usr/bin/env node
// Generates combat/seed.sql from abilities.csv + archetype-abilities.csv.
// Run: node combat/build-seed.js   (from repo root)

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const esc = s => String(s).replace(/'/g, "''");
const toId = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function parseCSV(file) {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8').trim();
  const lines = raw.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const parts = line.split(',');
    const obj = {};
    if (parts.length > headers.length) {
      // Description may contain commas — last column absorbs the rest.
      for (let i = 0; i < headers.length - 1; i++) obj[headers[i]] = parts[i].trim();
      obj[headers[headers.length - 1]] = parts.slice(headers.length - 1).join(',').trim();
    } else {
      headers.forEach((h, i) => { obj[h] = (parts[i] || '').trim(); });
    }
    return obj;
  });
}

const abilities = parseCSV('abilities.csv');
const archetypes = parseCSV('archetype-abilities.csv');

const lines = [
  '-- Shellforge Combat Engine Seed Data',
  '-- Run AFTER combat/migration.sql',
  '',
  '-- ─── Item-Granted Abilities ──────────────────────────────────',
];

abilities.forEach(a => {
  const cols = [
    `'${esc(a.item_name)}'`,
    `'${toId(a.item_name)}'`,
    `'${esc(a.ability_name)}'`,
    `'${a.type}'`,
    parseInt(a.coherence_cost) || 0,
    parseInt(a.cooldown) || 0,
    parseInt(a.power) || 0,
    parseInt(a.duration) || 0,
    a.one_time === 'true' ? 'true' : 'false',
    `'${esc(a.description)}'`,
  ];
  lines.push(
    `INSERT INTO combat_abilities (item_name, item_id, ability_name, type, coherence_cost, cooldown, power, duration, one_time, description) VALUES (${cols.join(', ')});`
  );
});

lines.push('', '-- ─── Archetype Innate Abilities ──────────────────────────────');

archetypes.forEach(a => {
  const cols = [
    `'${esc(a.archetype)}'`,
    `'${a.cluster}'`,
    `'${esc(a.ability_name)}'`,
    `'${a.type}'`,
    parseInt(a.coherence_cost) || 0,
    parseInt(a.cooldown) || 0,
    parseInt(a.power) || 0,
    parseInt(a.duration) || 0,
    `'${esc(a.description)}'`,
  ];
  lines.push(
    `INSERT INTO archetype_abilities (archetype, cluster, ability_name, type, coherence_cost, cooldown, power, duration, description) VALUES (${cols.join(', ')});`
  );
});

const out = lines.join('\n') + '\n';
fs.writeFileSync(path.join(dir, 'seed.sql'), out);
console.log(`Written combat/seed.sql (${(out.length / 1024).toFixed(1)} KB)`);
console.log(`  ${abilities.length} item abilities`);
console.log(`  ${archetypes.length} archetype abilities`);

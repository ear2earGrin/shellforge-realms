// Mission system verification — pure-logic, no network, no secrets.
//
// Run:  node scripts/test-missions.mjs
// Exit 0 = all checks pass. This is the completion condition for the missions
// build: it proves the catalog (backend/missions/missions.json), the predicate
// evaluator (workers/turn-engine/missions-eval.js), and the claim reward math
// all agree on the two seeded missions.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateMission, normalizeRewards } from '../workers/turn-engine/missions-eval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(__dirname, '../backend/missions/missions.json'), 'utf8'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function mission(id) {
  const m = catalog.missions.find((x) => x.mission_id === id);
  assert.ok(m, `mission "${id}" must exist in missions.json`);
  return m;
}

console.log('Mission catalog:');
check('exactly the two scoped missions are seeded', () => {
  const ids = catalog.missions.map((m) => m.mission_id).sort();
  assert.deepEqual(ids, ['first_steps', 'oracles_request']);
});

console.log('\nFirst Steps (gather 10 Binary Code Shards):');
const firstSteps = mission('first_steps');

check('incomplete at 9 shards', () => {
  const r = evaluateMission(firstSteps.predicate, { inventory: { binary_code_shards: 9 } });
  assert.equal(r.complete, false);
  assert.equal(r.label, '9/10');
  assert.ok(r.fraction > 0 && r.fraction < 1);
});

check('complete at exactly 10 shards', () => {
  const r = evaluateMission(firstSteps.predicate, { inventory: { binary_code_shards: 10 } });
  assert.equal(r.complete, true);
  assert.equal(r.fraction, 1);
  assert.equal(r.label, '10/10');
});

check('still complete past 10 shards (fraction capped at 1)', () => {
  const r = evaluateMission(firstSteps.predicate, { inventory: { binary_code_shards: 25 } });
  assert.equal(r.complete, true);
  assert.equal(r.fraction, 1);
});

check('claiming First Steps grants +50 $SHELL and +10 XP', () => {
  const rw = normalizeRewards(firstSteps.rewards);
  const before = { shell_balance: 50, xp: 0 };
  const after = { shell_balance: before.shell_balance + rw.shell, xp: before.xp + rw.xp };
  assert.equal(after.shell_balance, 100);
  assert.equal(after.xp, 10);
  assert.equal(rw.item, null);
});

console.log('\nThe Oracle\'s Request (church + +5 karma):');
const oracle = mission('oracles_request');

check('incomplete with no church visit', () => {
  const r = evaluateMission(oracle.predicate, { actionCounts: {}, karma: 10, startKarma: 0 });
  assert.equal(r.complete, false);
});

check('incomplete with church visit but only +3 karma', () => {
  const r = evaluateMission(oracle.predicate, { actionCounts: { church: 1 }, karma: 3, startKarma: 0 });
  assert.equal(r.complete, false);
});

check('complete with church visit and +5 karma gained', () => {
  const r = evaluateMission(oracle.predicate, { actionCounts: { church: 2 }, karma: 12, startKarma: 7 });
  assert.equal(r.complete, true);
});

check('claiming Oracle grants +100 $SHELL and the Blessing artifact', () => {
  const rw = normalizeRewards(oracle.rewards);
  assert.equal(rw.shell, 100);
  assert.ok(rw.item && rw.item.item_id === 'oracle_blessing');
  assert.equal(rw.item.item_type, 'artifact');
});

console.log('\nEvaluator robustness:');
check('unknown predicate type never completes', () => {
  const r = evaluateMission({ type: 'bogus' }, {});
  assert.equal(r.complete, false);
});

check('missing context is treated as zero progress', () => {
  const r = evaluateMission(firstSteps.predicate, {});
  assert.equal(r.complete, false);
  assert.equal(r.fraction, 0);
});

console.log(`\nAll ${passed} mission checks passed.`);

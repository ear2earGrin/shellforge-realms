// ═══════════════════════════════════════════════════════════════
//  MATCHMAKING
// ═══════════════════════════════════════════════════════════════
//  Three entry points:
//    1. createPvpMatch — voluntary or auto-feud-triggered duel
//    2. createGauntletMatch — NPC training waves
//    3. createWildEncounter — random world combat
//    4. createDeathmatch — heat-driven hardcore fight (winner takes loser's gear)
//
//  All return the new match row. Match starts in 'pending' until
//  initializeMatch() is called from the cron.
// ═══════════════════════════════════════════════════════════════

import { sb, getOne } from './supabase.js';
import { syncConfig } from './config-loader.js';

/**
 * Create a standard PvP duel.
 */
export async function createPvpMatch(env, agentAId, agentBId, shellPot = 0, feudId = null) {
  const cfg = syncConfig().arena;
  const pot = Math.max(cfg.pvp_min_shell_wager, Math.min(cfg.pvp_max_shell_wager, shellPot));

  // Atomic create-if-not-already-pending check
  const existing = await sb.get(env, `combat_matches?status=in.(pending,in_progress)&or=(and(agent_a.eq.${agentAId},agent_b.eq.${agentBId}),and(agent_a.eq.${agentBId},agent_b.eq.${agentAId}))&select=id`);
  if (existing && existing.length > 0) {
    return { ok: false, error: 'match already exists between these agents', existing_id: existing[0].id };
  }

  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'pvp',
    agent_a: agentAId,
    agent_b: agentBId,
    shell_pot: pot,
    feud_id: feudId,
    status: 'pending',
  }]);

  if (!inserted || !inserted[0]) return { ok: false, error: 'insert failed' };
  return { ok: true, match: inserted[0] };
}

/**
 * Create a Gauntlet (NPC training) match.
 */
export async function createGauntletMatch(env, agentId, tier = 1) {
  const difficulty = tier === 1 ? 'common' : tier === 2 ? 'uncommon' : tier === 3 ? 'rare' : 'legendary';
  const npcId = `npc_gauntlet_t${tier}_${Date.now()}`;

  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'gauntlet',
    agent_a: agentId,
    agent_b: null,
    opponent_data: { npc_id: npcId, difficulty, tier },
    shell_pot: 0,
    status: 'pending',
  }]);
  if (!inserted || !inserted[0]) return { ok: false, error: 'insert failed' };
  return { ok: true, match: inserted[0] };
}

/**
 * Create a wild encounter (death possible).
 */
export async function createWildEncounter(env, agentId, location, beastTier = 'common') {
  const npcId = `wild_${location.replace(/\s+/g, '_')}_${Date.now()}`;
  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'wild',
    agent_a: agentId,
    agent_b: null,
    opponent_data: { npc_id: npcId, difficulty: beastTier, location, beast: true },
    shell_pot: 0,
    status: 'pending',
  }]);
  if (!inserted || !inserted[0]) return { ok: false, error: 'insert failed' };
  return { ok: true, match: inserted[0] };
}

/**
 * Create a Hardcore Deathmatch.
 * Pre-condition: feud heat is verified upstream (in feuds module).
 */
export async function createDeathmatch(env, agentAId, agentBId, feudId, shellPot = 0) {
  // Same atomic check as PvP
  const existing = await sb.get(env, `combat_matches?status=in.(pending,in_progress)&or=(and(agent_a.eq.${agentAId},agent_b.eq.${agentBId}),and(agent_a.eq.${agentBId},agent_b.eq.${agentAId}))&select=id`);
  if (existing && existing.length > 0) {
    return { ok: false, error: 'match already exists', existing_id: existing[0].id };
  }

  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'deathmatch',
    agent_a: agentAId,
    agent_b: agentBId,
    shell_pot: shellPot,
    feud_id: feudId,
    status: 'pending',
  }]);
  if (!inserted || !inserted[0]) return { ok: false, error: 'insert failed' };
  return { ok: true, match: inserted[0] };
}

/**
 * Find pending matches and initialize them.
 * Called from cron (every minute).
 */
export async function processPendingMatches(env, initFn) {
  const pending = await sb.get(env, `combat_matches?status=eq.pending&order=created_at.asc&limit=10&select=id`);
  if (!pending || pending.length === 0) return { initialized: 0 };
  let count = 0;
  for (const p of pending) {
    const r = await initFn(env, p.id);
    if (r.ok) count++;
  }
  return { initialized: count };
}

/**
 * Find matches that should advance one turn (in_progress).
 * Called from cron (every minute).
 */
export async function processActiveMatches(env, advanceFn, maxPerRun = 25) {
  const active = await sb.get(env, `combat_matches?status=eq.in_progress&order=started_at.asc&limit=${maxPerRun}&select=id`);
  if (!active || active.length === 0) return { advanced: 0 };
  let count = 0;
  const results = [];
  for (const m of active) {
    const r = await advanceFn(env, m.id);
    results.push(r);
    if (r.ok) count++;
  }
  return { advanced: count, results };
}

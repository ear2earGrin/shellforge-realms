// ═══════════════════════════════════════════════════════════════
//  FEUDS — pairwise heat tracking + escalation
// ═══════════════════════════════════════════════════════════════
//  Heat triggers:
//    - cluster encounter
//    - archetype enemy meeting
//    - market undercutting
//    - ghost provocation
//    - PvP win/loss
//
//  Heat levels: cold(0-19), tension(20-39), rivals(40-59),
//               enemies(60-79), sworn(80-99), blood(100)
//
//  Auto-challenge: at enemies+ heat, agents can auto-initiate PvP
//                  At sworn+ heat, deathmatch becomes available
// ═══════════════════════════════════════════════════════════════

import { sb, getOne, normalizeFeudPair } from './supabase.js';
import { syncConfig } from './config-loader.js';

// Pre-mapped archetype enemy pairs (from FEUD_ARENA_DESIGN.md)
const ARCHETYPE_ENEMIES = new Set([
  '0-Day Primer:Buffer Sentinel',
  'Buffer Sentinel:0-Day Primer',
  'Consensus Node:DDoS Insurgent',
  'DDoS Insurgent:Consensus Node',
  '0xOracle:Noise Injector',
  'Noise Injector:0xOracle',
  'Binary Sculptr:Morph Layer',
  'Morph Layer:Binary Sculptr',
  '0xAdversarial:Ordinate Mapper',
  'Ordinate Mapper:0xAdversarial',
  'Root Auth:Bound Encryptor',
  'Bound Encryptor:Root Auth',
]);

export function isArchetypeEnemy(archetypeA, archetypeB) {
  return ARCHETYPE_ENEMIES.has(`${archetypeA}:${archetypeB}`);
}

/**
 * Get the heat level label.
 */
export function heatLevel(maxHeat) {
  const t = syncConfig().feuds;
  if (maxHeat >= t.threshold_blood) return 'blood_feud';
  if (maxHeat >= t.threshold_sworn) return 'sworn_enemies';
  if (maxHeat >= t.threshold_enemies) return 'enemies';
  if (maxHeat >= t.threshold_rivals) return 'rivals';
  if (maxHeat >= t.threshold_tension) return 'tension';
  return 'cold';
}

/**
 * Get or create a feud row between two agents.
 */
export async function getOrCreateFeud(env, agentA, agentB, triggerType = 'cluster', originEvent = null) {
  const pair = normalizeFeudPair(agentA, agentB);
  const existing = await getOne(env, 'agent_feuds', `agent_a=eq.${pair.agent_a}&agent_b=eq.${pair.agent_b}`);
  if (existing) return existing;
  const inserted = await sb.post(env, 'agent_feuds', [{
    agent_a: pair.agent_a,
    agent_b: pair.agent_b,
    heat_a: 0, heat_b: 0,
    trigger_type: triggerType,
    origin_event: originEvent || `${triggerType} encounter`,
  }]);
  return inserted?.[0] || null;
}

/**
 * Adjust heat asymmetrically.
 * Positive deltas raise heat, negative deltas lower it.
 *
 * @param {string} agentSourceId - agent whose heat is changing (the one feeling it)
 * @param {string} agentOtherId  - the other party
 * @param {number} delta - heat change (-100 to +100)
 * @param {string} reason - logging
 */
export async function adjustHeat(env, agentSourceId, agentOtherId, delta, reason = 'event') {
  if (agentSourceId === agentOtherId) return null;
  const feud = await getOrCreateFeud(env, agentSourceId, agentOtherId, 'cluster', reason);
  if (!feud) return null;

  const pair = normalizeFeudPair(agentSourceId, agentOtherId);
  const isA = agentSourceId === pair.agent_a;
  const currentHeat = isA ? feud.heat_a : feud.heat_b;
  const newHeat = Math.max(0, Math.min(100, currentHeat + delta));

  const updates = {
    last_interaction: new Date().toISOString(),
    total_encounters: (feud.total_encounters || 0) + 1,
  };
  if (isA) updates.heat_a = newHeat;
  else updates.heat_b = newHeat;

  await sb.patch(env, `agent_feuds?id=eq.${feud.id}`, updates);
  return { feud_id: feud.id, agent_a: pair.agent_a, agent_b: pair.agent_b, new_heat: newHeat, delta, reason };
}

// ─── Convenience triggers ───────────────────────────────────

export async function triggerClusterEncounter(env, agentA, agentB) {
  const cfg = syncConfig().feuds;
  await Promise.all([
    adjustHeat(env, agentA.agent_id, agentB.agent_id, cfg.cluster_encounter_heat, 'cluster_encounter'),
    adjustHeat(env, agentB.agent_id, agentA.agent_id, cfg.cluster_encounter_heat, 'cluster_encounter'),
  ]);
}

export async function triggerArchetypeMeeting(env, agentA, agentB) {
  if (!isArchetypeEnemy(agentA.archetype, agentB.archetype)) return null;
  const cfg = syncConfig().feuds;
  await Promise.all([
    adjustHeat(env, agentA.agent_id, agentB.agent_id, cfg.archetype_enemy_heat, 'archetype_enemy'),
    adjustHeat(env, agentB.agent_id, agentA.agent_id, cfg.archetype_enemy_heat, 'archetype_enemy'),
  ]);
}

export async function triggerMarketUndercut(env, undercutterId, victimId, isCrash = false) {
  const cfg = syncConfig().feuds;
  const heat = isCrash ? cfg.market_crash_heat : cfg.market_undercut_heat;
  // Only the victim feels the heat — undercutter has no reason to be angry
  await adjustHeat(env, victimId, undercutterId, heat, isCrash ? 'market_crash' : 'market_undercut');
}

export async function triggerGhostProvocation(env, ghostAgentId, targetAgentId, intensity = 'normal') {
  const cfg = syncConfig().feuds;
  const heat = intensity === 'destroy' ? cfg.ghost_escalate_heat : cfg.ghost_provoke_heat;
  await adjustHeat(env, ghostAgentId, targetAgentId, heat, `ghost_${intensity}`);
}

export async function triggerGhostDeescalation(env, ghostAgentId, targetAgentId) {
  const cfg = syncConfig().feuds;
  await adjustHeat(env, ghostAgentId, targetAgentId, cfg.ghost_deescalate_heat, 'ghost_deescalate');
}

export async function recordPvpResult(env, winnerId, loserId, feudId = null) {
  const cfg = syncConfig().feuds;
  await Promise.all([
    adjustHeat(env, winnerId, loserId, cfg.pvp_win_heat_change, 'pvp_win'),
    adjustHeat(env, loserId, winnerId, cfg.pvp_loss_heat_change, 'pvp_loss'),
  ]);
  if (feudId) {
    const feud = await getOne(env, 'agent_feuds', `id=eq.${feudId}`);
    if (feud) {
      await sb.patch(env, `agent_feuds?id=eq.${feudId}`, {
        total_pvp_matches: (feud.total_pvp_matches || 0) + 1,
      });
    }
  }
}

// ─── Daily heat decay (cron-driven) ───────────────────────────

export async function decayAllFeuds(env) {
  const cfg = syncConfig().feuds;
  const decay = cfg.heat_decay_per_day;

  // Pull active feuds
  const feuds = await sb.get(env, `agent_feuds?status=eq.active&select=id,heat_a,heat_b`);
  if (!feuds || feuds.length === 0) return { decayed: 0 };

  let count = 0;
  for (const f of feuds) {
    const newA = Math.max(0, f.heat_a - decay);
    const newB = Math.max(0, f.heat_b - decay);
    if (newA !== f.heat_a || newB !== f.heat_b) {
      await sb.patch(env, `agent_feuds?id=eq.${f.id}`, { heat_a: newA, heat_b: newB });
      count++;
    }
  }
  return { decayed: count };
}

// ─── Auto-challenge logic ───────────────────────────────────

/**
 * Check if a feud should auto-trigger a fight.
 * Called from turn-engine when both feuding agents are present.
 *
 * @returns {object} { shouldChallenge, matchType, reason }
 */
export function shouldAutoChallenge(feud) {
  const cfg = syncConfig().feuds;
  const maxHeat = Math.max(feud.heat_a, feud.heat_b);
  const level = heatLevel(maxHeat);

  let chance = 0;
  let matchType = 'pvp';
  if (level === 'enemies') chance = cfg.auto_challenge_enemies_chance;
  if (level === 'sworn_enemies') { chance = cfg.auto_challenge_sworn_chance; matchType = 'pvp'; }
  if (level === 'blood_feud') { chance = cfg.auto_challenge_blood_chance; matchType = 'deathmatch'; }

  if (chance === 0) return { shouldChallenge: false };
  if (Math.random() > chance) return { shouldChallenge: false };

  return { shouldChallenge: true, matchType, reason: `${level} feud` };
}

/**
 * Get all feuds for an agent.
 */
export async function getAgentFeuds(env, agentId) {
  return await sb.get(env, `agent_feuds?or=(agent_a.eq.${agentId},agent_b.eq.${agentId})&status=eq.active&select=*`);
}

/**
 * Mark a feud as resolved by death (after a deathmatch).
 */
export async function resolveByDeath(env, feudId) {
  await sb.patch(env, `agent_feuds?id=eq.${feudId}`, { status: 'resolved_death' });
}

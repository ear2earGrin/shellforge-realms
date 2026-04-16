// ═══════════════════════════════════════════════════════════════
//  THE CRUCIBLE — inactive Ghost agent disposal
// ═══════════════════════════════════════════════════════════════
//  Stage progression based on days since last whisper:
//    0-6   days  → content
//    7-13  days  → restless    (+15% arena chance)
//    14-29 days  → reckless    (+30% arena, +20% feud)
//    30-44 days  → death_wish  (seek deathmatch)
//    45+   days  → decoherence (72h to win a fight or die)
//
//  Run by cron every 6 hours (and once on each turn engine pass).
//  Decoherence collapse triggers a wild encounter at extreme tier
//  with permadeath if the agent doesn't already have a fight pending.
// ═══════════════════════════════════════════════════════════════

import { sb, getOne } from './supabase.js';
import { syncConfig } from './config-loader.js';

function daysBetween(from, to) {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

function determineStage(days) {
  const c = syncConfig().crucible;
  if (days >= c.decoherence_days) return 'decoherence';
  if (days >= c.death_wish_days) return 'death_wish';
  if (days >= c.reckless_days) return 'reckless';
  if (days >= c.restless_days) return 'restless';
  return 'content';
}

/**
 * Find all agents whose Ghosts have been inactive and update their crucible state.
 * Called every 6 hours by cron.
 */
export async function evaluateAllAgents(env) {
  const c = syncConfig().crucible;
  const now = new Date();

  // Pull all alive agents (assumes agents table has user_id and last_whisper_at)
  // Adapt this query to your actual agent schema
  const agents = await sb.get(env, `agents?status=eq.alive&select=agent_id,user_id,health,last_whisper_at,created_at`);
  if (!agents || agents.length === 0) return { evaluated: 0 };

  const updates = [];
  const newDecoherences = [];

  for (const agent of agents) {
    const lastWhisper = agent.last_whisper_at || agent.created_at;
    const days = daysBetween(lastWhisper, now);
    const stage = determineStage(days);

    const existing = await getOne(env, 'crucible_states', `agent_id=eq.${agent.agent_id}`);

    if (!existing) {
      // First evaluation
      const row = {
        agent_id: agent.agent_id,
        ghost_id: agent.user_id,
        stage,
        days_since_whisper: days,
        last_whisper_at: lastWhisper,
        last_evaluated_at: now.toISOString(),
      };
      if (stage === 'decoherence') {
        row.decoherence_started = now.toISOString();
        row.decoherence_deadline = new Date(now.getTime() + c.decoherence_fight_window_hours * 3600 * 1000).toISOString();
        newDecoherences.push(agent.agent_id);
      }
      updates.push(row);
    } else {
      // Update existing
      const patch = {
        stage,
        days_since_whisper: days,
        last_evaluated_at: now.toISOString(),
      };
      // Newly entered decoherence
      if (stage === 'decoherence' && existing.stage !== 'decoherence' && existing.stage !== 'collapsed') {
        patch.decoherence_started = now.toISOString();
        patch.decoherence_deadline = new Date(now.getTime() + c.decoherence_fight_window_hours * 3600 * 1000).toISOString();
        newDecoherences.push(agent.agent_id);
      }
      // Reset if stage went back (whisper happened)
      if (stage === 'content' && existing.stage !== 'content') {
        patch.decoherence_started = null;
        patch.decoherence_deadline = null;
        patch.fights_since_decoherence = 0;
      }
      await sb.patch(env, `crucible_states?agent_id=eq.${agent.agent_id}`, patch);
    }
  }

  if (updates.length > 0) {
    await sb.upsert(env, 'crucible_states', updates);
  }

  return { evaluated: agents.length, new_decoherences: newDecoherences };
}

/**
 * Check for decoherence deadline expirations (collapse = death).
 * Called from cron. Returns array of dead agent IDs.
 */
export async function checkCollapses(env) {
  const now = new Date();
  const overdue = await sb.get(
    env,
    `crucible_states?stage=eq.decoherence&decoherence_deadline=lt.${now.toISOString()}&select=*`
  );
  if (!overdue || overdue.length === 0) return { collapsed: 0, agents: [] };

  const collapsed = [];
  for (const c of overdue) {
    // Mark stage = collapsed
    await sb.patch(env, `crucible_states?agent_id=eq.${c.agent_id}`, { stage: 'collapsed' });

    // Apply death (full HP wipe — actual dynasty handling done by death-handler in turn-engine)
    await sb.patch(env, `agents?agent_id=eq.${c.agent_id}`, { health: 0, status: 'dead' });

    collapsed.push(c.agent_id);
  }
  return { collapsed: collapsed.length, agents: collapsed };
}

/**
 * Get arena/feud bonuses for an agent based on crucible stage.
 * Called by turn-engine when computing action probabilities.
 */
export function getCrucibleBonuses(stage) {
  const c = syncConfig().crucible;
  switch (stage) {
    case 'restless':
      return { arenaBonus: c.restless_arena_bonus, feudBonus: 0, seekDeathmatch: false };
    case 'reckless':
      return { arenaBonus: c.reckless_arena_bonus, feudBonus: c.reckless_feud_bonus, seekDeathmatch: false };
    case 'death_wish':
      return { arenaBonus: c.reckless_arena_bonus, feudBonus: c.reckless_feud_bonus, seekDeathmatch: true, seekChance: c.death_wish_deathmatch_seek_chance };
    case 'decoherence':
      return { arenaBonus: 1.0, feudBonus: 0.5, seekDeathmatch: true, seekChance: 0.9 };
    default:
      return { arenaBonus: 0, feudBonus: 0, seekDeathmatch: false };
  }
}

/**
 * Reset crucible state when a Ghost whispers (called from whisper handler).
 */
export async function recordWhisper(env, agentId) {
  const now = new Date().toISOString();
  await sb.upsert(env, 'crucible_states', [{
    agent_id: agentId,
    last_whisper_at: now,
    days_since_whisper: 0,
    stage: 'content',
    decoherence_started: null,
    decoherence_deadline: null,
    fights_since_decoherence: 0,
    last_evaluated_at: now,
  }]);
}

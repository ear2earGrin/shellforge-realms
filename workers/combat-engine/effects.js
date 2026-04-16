// ═══════════════════════════════════════════════════════════════
//  EFFECTS ENGINE
// ═══════════════════════════════════════════════════════════════
//  Manages all active mid-match effects: buffs, debuffs, DoTs,
//  HoTs, traps, shields, cooldowns, markers (e.g. "scanned").
//
//  Effect lifecycle:
//    1. Created when an ability resolves (turn-resolver)
//    2. Persisted to combat_effects table
//    3. Ticked at start of each turn (this module)
//    4. Removed when turns_remaining hits 0
// ═══════════════════════════════════════════════════════════════

import { sb } from './supabase.js';
import { syncConfig } from './config-loader.js';

// Effect kinds (mirrors DB CHECK constraint)
export const EFFECT_KIND = {
  BUFF: 'buff',
  DEBUFF: 'debuff',
  DOT: 'dot',
  HOT: 'hot',
  TRAP: 'trap',
  SHIELD: 'shield',
  COOLDOWN: 'cooldown',
  MARKER: 'marker',
};

/**
 * Build an effect object for insertion.
 */
export function buildEffect({
  matchId, agentId, sourceAgentId, effectKind, sourceAbility,
  magnitude = 0, turnsRemaining, appliedTurn, metadata = {},
}) {
  return {
    match_id: matchId,
    agent_id: agentId,
    source_agent_id: sourceAgentId,
    effect_kind: effectKind,
    source_ability: sourceAbility,
    magnitude,
    turns_remaining: turnsRemaining,
    applied_turn: appliedTurn,
    metadata,
  };
}

/**
 * Apply an ability's effects to the target. Returns array of effect rows
 * to insert. Pure function (no DB writes).
 */
export function effectsFromAbility(ability, sourceAgentId, targetAgentId, matchId, turnNum) {
  const effects = [];
  const name = ability.ability_name || ability.name;

  // Damage-over-time triggered by ATK abilities with duration
  if (ability.type === 'ATK' && ability.duration > 0) {
    // Bleed/burn DoTs convention: power/2 per turn
    effects.push(buildEffect({
      matchId, agentId: targetAgentId, sourceAgentId,
      effectKind: EFFECT_KIND.DOT, sourceAbility: name,
      magnitude: Math.max(1, Math.floor(ability.power / 2)),
      turnsRemaining: ability.duration, appliedTurn: turnNum,
      metadata: { ability_name: name, type: ability.type },
    }));
  }

  // DEBUFF abilities: timed status effect
  if (ability.type === 'DEBUFF' && ability.duration > 0) {
    effects.push(buildEffect({
      matchId, agentId: targetAgentId, sourceAgentId,
      effectKind: EFFECT_KIND.DEBUFF, sourceAbility: name,
      magnitude: ability.power || 0,
      turnsRemaining: ability.duration, appliedTurn: turnNum,
      metadata: { ability_name: name, original_type: ability.type, description: ability.description },
    }));
  }

  // BUFF abilities: timed status effect on SELF (sourceAgentId)
  if (ability.type === 'BUFF' && ability.duration > 0) {
    effects.push(buildEffect({
      matchId, agentId: sourceAgentId, sourceAgentId,
      effectKind: EFFECT_KIND.BUFF, sourceAbility: name,
      magnitude: ability.power || 0,
      turnsRemaining: ability.duration, appliedTurn: turnNum,
      metadata: { ability_name: name, description: ability.description },
    }));
  }

  // DEF (shield) abilities: shield value persists for the turn
  if (ability.type === 'DEF' && (ability.duration === 0 || ability.duration > 0)) {
    effects.push(buildEffect({
      matchId, agentId: sourceAgentId, sourceAgentId,
      effectKind: EFFECT_KIND.SHIELD, sourceAbility: name,
      magnitude: ability.power || 50, // default 50% reduction if power not set
      turnsRemaining: Math.max(1, ability.duration),
      appliedTurn: turnNum,
      metadata: { ability_name: name, description: ability.description },
    }));
  }

  // HEAL is instant — handled by turn-resolver, no persistent effect

  // TRAPs persist (their power triggers conditionally — handled by turn-resolver)
  if (ability.type === 'TRAP') {
    effects.push(buildEffect({
      matchId, agentId: targetAgentId, sourceAgentId,
      effectKind: EFFECT_KIND.TRAP, sourceAbility: name,
      magnitude: ability.power || 0,
      turnsRemaining: ability.duration > 0 ? ability.duration : 5, // default 5 turn trap lifespan
      appliedTurn: turnNum,
      metadata: { ability_name: name, description: ability.description },
    }));
  }

  return effects;
}

/**
 * Add ability cooldown effect (so the agent can't reuse it immediately).
 */
export function addCooldown(matchId, agentId, abilityName, cooldownTurns, currentTurn) {
  if (cooldownTurns <= 0) return null;
  return buildEffect({
    matchId, agentId, sourceAgentId: agentId,
    effectKind: EFFECT_KIND.COOLDOWN,
    sourceAbility: abilityName,
    magnitude: 0,
    turnsRemaining: cooldownTurns,
    appliedTurn: currentTurn,
    metadata: { ability_name: abilityName },
  });
}

/**
 * Add a one-time consumed marker (so consumables/scrolls aren't re-usable).
 */
export function markConsumed(matchId, agentId, abilityName, currentTurn) {
  return buildEffect({
    matchId, agentId, sourceAgentId: agentId,
    effectKind: EFFECT_KIND.MARKER,
    sourceAbility: abilityName,
    magnitude: 0,
    turnsRemaining: 999,
    appliedTurn: currentTurn,
    metadata: { ability_name: abilityName, kind: 'consumed' },
  });
}

/**
 * Persist an array of effects to DB.
 */
export async function persistEffects(env, effects) {
  if (!effects || effects.length === 0) return;
  await sb.insert(env, 'combat_effects', effects);
}

/**
 * Tick all effects for a match: decrement turns_remaining, apply DoT/HoT
 * damage, return cleaned-up state.
 *
 * @returns {object} { dotDamage: { agentId: damage }, hotHeal: { agentId: heal }, expired: [] }
 */
export async function tickEffects(env, matchId, currentTurn) {
  const effects = await sb.get(env, `combat_effects?match_id=eq.${matchId}&select=*`);
  if (!effects || effects.length === 0) return { dotDamage: {}, hotHeal: {}, expired: [] };

  const dotDamage = {};
  const hotHeal = {};
  const expired = [];
  const stillActive = [];

  for (const e of effects) {
    // Apply DoT this turn
    if (e.effect_kind === EFFECT_KIND.DOT) {
      dotDamage[e.agent_id] = (dotDamage[e.agent_id] || 0) + e.magnitude;
    }
    if (e.effect_kind === EFFECT_KIND.HOT) {
      hotHeal[e.agent_id] = (hotHeal[e.agent_id] || 0) + e.magnitude;
    }

    // Decrement
    const newTurns = e.turns_remaining - 1;
    if (newTurns <= 0) {
      expired.push(e);
    } else {
      stillActive.push({ ...e, turns_remaining: newTurns });
    }
  }

  // Delete expired effects
  if (expired.length > 0) {
    const ids = expired.map(e => e.id).join(',');
    await sb.delete(env, `combat_effects?id=in.(${ids})`);
  }

  // Update remaining turns_remaining for survivors
  for (const e of stillActive) {
    await sb.patch(env, `combat_effects?id=eq.${e.id}`, { turns_remaining: e.turns_remaining });
  }

  return { dotDamage, hotHeal, expired, stillActive };
}

/**
 * Get all active effects on an agent (used by AI decision and damage calc).
 */
export async function getActiveEffects(env, matchId, agentId) {
  return await sb.get(env, `combat_effects?match_id=eq.${matchId}&agent_id=eq.${agentId}&select=*`);
}

/**
 * Compute aggregate stat modifiers from active effects.
 * Returns: { accuracyMod, evasionMod, attackMod, defenseMod, isStunned, hasShield, shieldMagnitude }
 */
export function aggregateModifiers(effects) {
  let accuracyMod = 0, evasionMod = 0, attackMod = 0, defenseMod = 0;
  let isStunned = false, hasShield = false, shieldMagnitude = 0;
  let isLocked = false;

  for (const e of effects || []) {
    const meta = e.metadata || {};
    const m = e.magnitude || 0;
    if (e.effect_kind === EFFECT_KIND.SHIELD) {
      hasShield = true;
      shieldMagnitude += m;
    }
    if (e.effect_kind === EFFECT_KIND.DEBUFF) {
      const lower = (meta.ability_name || '').toLowerCase();
      if (lower.includes('stun') || lower.includes('lock') || lower.includes('emp') || lower.includes('flood')) {
        isStunned = true;
      }
      if (lower.includes('accuracy') || lower.includes('vanishing')) {
        attackMod -= m;
      }
      if (lower.includes('throttle') || lower.includes('rate')) {
        accuracyMod -= 0.10;
      }
    }
    if (e.effect_kind === EFFECT_KIND.BUFF) {
      const lower = (meta.ability_name || '').toLowerCase();
      if (lower.includes('overclock') || lower.includes('caffeine')) {
        attackMod += m;
        accuracyMod += 0.05;
      }
      if (lower.includes('context') || lower.includes('hardening')) {
        defenseMod += m;
      }
    }
  }

  return { accuracyMod, evasionMod, attackMod, defenseMod, isStunned, hasShield, shieldMagnitude, isLocked };
}

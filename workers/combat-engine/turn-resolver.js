// ═══════════════════════════════════════════════════════════════
//  TURN RESOLVER
// ═══════════════════════════════════════════════════════════════
//  Simultaneous-resolution combat (both sides act each turn).
//  Resolution priority order:
//    1. TRAP triggers (from previous turns)
//    2. DEF / SHIELD application
//    3. ATK damage exchange
//    4. BUFF / DEBUFF application
//    5. HEAL
//    6. UTIL effects
//
//  Each turn writes:
//    - Full state snapshot to combat_turns (replay-ready)
//    - Active effects updated in combat_effects
//    - Match status updated if death/timeout
// ═══════════════════════════════════════════════════════════════

import { sb, getOne } from './supabase.js';
import { syncConfig } from './config-loader.js';
import { buildDeck, getPlayableHand, buildNPCDeck } from './deck.js';
import { decideAction } from './ai-decision.js';
import { calculateDamage, rollAccuracy } from './damage.js';
import {
  effectsFromAbility, addCooldown, markConsumed,
  persistEffects, tickEffects, getActiveEffects, aggregateModifiers,
} from './effects.js';

/**
 * Apply healing from a HEAL ability to source agent.
 */
function applyHeal(state, ability) {
  const healAmount = ability.power || 25;
  const newHp = Math.min(state.hp_max, state.hp + healAmount);
  return { healed: newHp - state.hp, newHp };
}

/**
 * Apply ⚡ overclock decoherence check.
 * If agent spent more than overclock_threshold this turn, apply decoherence.
 */
function checkOverclock(coherenceSpent) {
  const cfg = syncConfig().combat;
  if (coherenceSpent <= cfg.overclock_threshold) return null;
  const excess = coherenceSpent - cfg.overclock_threshold;
  const chance = Math.min(1, cfg.overclock_decoherence_per_excess * excess);
  if (Math.random() < chance) {
    return {
      kind: 'decoherence',
      accuracyPenalty: cfg.decoherence_accuracy_penalty,
      duration: cfg.decoherence_duration_turns,
    };
  }
  return null;
}

/**
 * Get pending whispers for a match/turn/agent.
 */
async function getPendingWhisper(env, matchId, turnNum, agentId) {
  const rows = await sb.get(
    env,
    `combat_whispers?match_id=eq.${matchId}&turn_number=eq.${turnNum}&agent_id=eq.${agentId}&was_followed=is.null&select=*`
  );
  return (rows && rows[0]) || null;
}

/**
 * Resolve one full turn for a match.
 *
 * @param {object} env
 * @param {string} matchId
 * @returns {object} turn result
 */
export async function resolveTurn(env, matchId) {
  const cfg = syncConfig().combat;

  // 1. Load match
  const match = await getOne(env, 'combat_matches', `id=eq.${matchId}`);
  if (!match) return { ok: false, error: 'match not found' };
  if (match.status !== 'in_progress') return { ok: false, error: `match status=${match.status}` };

  const turnNum = match.turns_total + 1;

  // 2. Load both side states from snapshots (immutable mid-match)
  const snapA = match.agent_a_snapshot;
  const snapB = match.agent_b_snapshot;
  if (!snapA || !snapB) return { ok: false, error: 'missing snapshots' };

  // 3. Load latest turn (for current HP/coherence) or fall back to snapshot
  const lastTurn = (await sb.get(env, `combat_turns?match_id=eq.${matchId}&order=turn_number.desc&limit=1&select=*`))?.[0];
  let stateA, stateB;
  if (lastTurn) {
    stateA = { ...snapA, hp: lastTurn.agent_a_hp_after, coherence: lastTurn.agent_a_coherence_after };
    stateB = { ...snapB, hp: lastTurn.agent_b_hp_after, coherence: lastTurn.agent_b_coherence_after };
  } else {
    stateA = { ...snapA };
    stateB = { ...snapB };
  }

  // 4. Tick all active effects (apply DoTs, decrement counters)
  const tick = await tickEffects(env, matchId, turnNum);
  const dotA = tick.dotDamage[stateA.agent_id] || 0;
  const dotB = tick.dotDamage[stateB.agent_id] || 0;
  const hotA = tick.hotHeal[stateA.agent_id] || 0;
  const hotB = tick.hotHeal[stateB.agent_id] || 0;

  stateA.hp = Math.max(0, Math.min(stateA.hp_max, stateA.hp - dotA + hotA));
  stateB.hp = Math.max(0, Math.min(stateB.hp_max, stateB.hp - dotB + hotB));

  // 5. Restore coherence (regen)
  stateA.coherence = Math.min(stateA.coherence_max, stateA.coherence + cfg.coherence_regen_per_turn);
  stateB.coherence = Math.min(stateB.coherence_max, stateB.coherence + cfg.coherence_regen_per_turn);

  // Early exit if DoT killed someone
  if (stateA.hp <= 0 || stateB.hp <= 0) {
    return await finalizeTurn(env, match, turnNum, stateA, stateB, {}, {}, [], [], 'dot_finishing');
  }

  // 6. Get active effects + aggregate modifiers
  const [effectsA, effectsB] = await Promise.all([
    getActiveEffects(env, matchId, stateA.agent_id),
    getActiveEffects(env, matchId, stateB.agent_id),
  ]);
  const modA = aggregateModifiers(effectsA);
  const modB = aggregateModifiers(effectsB);

  // 7. Build playable hands
  const handA = getPlayableHand(snapA.deck, effectsA, stateA.coherence);
  const handB = getPlayableHand(snapB.deck, effectsB, stateB.coherence);

  // 8. Check for pending whispers
  const [whisperA, whisperB] = await Promise.all([
    getPendingWhisper(env, matchId, turnNum, stateA.agent_id),
    getPendingWhisper(env, matchId, turnNum, stateB.agent_id),
  ]);

  // 9. Recent turns context (last 3) for AI decision quality
  const recentTurns = (await sb.get(env, `combat_turns?match_id=eq.${matchId}&order=turn_number.desc&limit=3&select=*`)) || [];

  // 10. Both sides decide (in parallel, unless stunned)
  const decisionA = modA.isStunned
    ? { card: snapA.deck.find(c => c.ability_name === 'Basic Strike'), source: 'stunned', whisper_followed: false }
    : await decideAction(env, { ...snapA, ...stateA, karma: stateA.karma || 0 }, { ...snapB, ...stateB }, handA, whisperA, turnNum, recentTurns);
  const decisionB = modB.isStunned
    ? { card: snapB.deck.find(c => c.ability_name === 'Basic Strike'), source: 'stunned', whisper_followed: false }
    : await decideAction(env, { ...snapB, ...stateB, karma: stateB.karma || 0 }, { ...snapA, ...stateA }, handB, whisperB, turnNum, recentTurns);

  const cardA = decisionA.card;
  const cardB = decisionB.card;

  // 11. Pay coherence costs
  if (cardA) stateA.coherence = Math.max(0, stateA.coherence - cardA.coherence_cost);
  if (cardB) stateB.coherence = Math.max(0, stateB.coherence - cardB.coherence_cost);

  // 12. Resolve simultaneously: damage exchange
  const effectsTriggered = [];
  let damageToA = 0, damageToB = 0;
  let critA = false, critB = false;

  // A's attack on B
  if (cardA && (cardA.type === 'ATK' || cardA.type === 'DEBUFF')) {
    const acc = rollAccuracy({ accuracyMod: modA.accuracyMod }, { evasionMod: modB.evasionMod });
    if (acc.hit) {
      const dmg = calculateDamage(stateA, stateB, cardA, {
        attackerType: stateA.equipped?.[0]?.type || 'hardware',
        defenderType: stateB.defender_type,
        critBonus: 0,
        armorPen: cardA.ability_name?.toLowerCase().includes('zero-day') ? 0.75
                : cardA.ability_name?.toLowerCase().includes('railgun') ? 0.30
                : cardA.ability_name?.toLowerCase().includes('cryo bore') ? 0.50 : 0,
      });
      let appliedDamage = dmg.finalDamage;
      // Apply B's shield reduction
      if (modB.hasShield) {
        const reduction = appliedDamage * (modB.shieldMagnitude / 100);
        appliedDamage = Math.max(0, appliedDamage - reduction);
        effectsTriggered.push({ source: stateB.agent_id, target: stateB.agent_id, type: 'shield', magnitude: reduction, message: `Shield absorbed ${Math.round(reduction)}` });
      }
      damageToB = appliedDamage;
      critB = dmg.isCrit;
      effectsTriggered.push({
        source: stateA.agent_id, target: stateB.agent_id,
        type: 'attack', ability: cardA.ability_name,
        magnitude: appliedDamage, crit: dmg.isCrit,
        message: `${cardA.ability_name} → ${Math.round(appliedDamage)}${dmg.isCrit ? ' CRIT!' : ''}`,
      });
    } else {
      effectsTriggered.push({
        source: stateA.agent_id, target: stateB.agent_id,
        type: 'miss', ability: cardA.ability_name,
        message: `${cardA.ability_name} missed`,
      });
    }
  }

  // B's attack on A
  if (cardB && (cardB.type === 'ATK' || cardB.type === 'DEBUFF')) {
    const acc = rollAccuracy({ accuracyMod: modB.accuracyMod }, { evasionMod: modA.evasionMod });
    if (acc.hit) {
      const dmg = calculateDamage(stateB, stateA, cardB, {
        attackerType: stateB.equipped?.[0]?.type || 'hardware',
        defenderType: stateA.defender_type,
      });
      let appliedDamage = dmg.finalDamage;
      if (modA.hasShield) {
        const reduction = appliedDamage * (modA.shieldMagnitude / 100);
        appliedDamage = Math.max(0, appliedDamage - reduction);
        effectsTriggered.push({ source: stateA.agent_id, target: stateA.agent_id, type: 'shield', magnitude: reduction, message: `Shield absorbed ${Math.round(reduction)}` });
      }
      damageToA = appliedDamage;
      critA = dmg.isCrit;
      effectsTriggered.push({
        source: stateB.agent_id, target: stateA.agent_id,
        type: 'attack', ability: cardB.ability_name,
        magnitude: appliedDamage, crit: dmg.isCrit,
        message: `${cardB.ability_name} → ${Math.round(appliedDamage)}${dmg.isCrit ? ' CRIT!' : ''}`,
      });
    } else {
      effectsTriggered.push({
        source: stateB.agent_id, target: stateA.agent_id,
        type: 'miss', ability: cardB.ability_name,
        message: `${cardB.ability_name} missed`,
      });
    }
  }

  // Apply damage
  stateA.hp = Math.max(0, stateA.hp - Math.round(damageToA));
  stateB.hp = Math.max(0, stateB.hp - Math.round(damageToB));

  // 13. Apply HEAL
  if (cardA && cardA.type === 'HEAL') {
    const h = applyHeal(stateA, cardA);
    stateA.hp = h.newHp;
    effectsTriggered.push({ source: stateA.agent_id, target: stateA.agent_id, type: 'heal', magnitude: h.healed, message: `${cardA.ability_name} +${h.healed} HP` });
  }
  if (cardB && cardB.type === 'HEAL') {
    const h = applyHeal(stateB, cardB);
    stateB.hp = h.newHp;
    effectsTriggered.push({ source: stateB.agent_id, target: stateB.agent_id, type: 'heal', magnitude: h.healed, message: `${cardB.ability_name} +${h.healed} HP` });
  }

  // 14. Generate persistent effects from this turn's abilities
  const newEffects = [];
  if (cardA) {
    newEffects.push(...effectsFromAbility(cardA, stateA.agent_id, stateB.agent_id, matchId, turnNum));
    if (cardA.cooldown > 0) newEffects.push(addCooldown(matchId, stateA.agent_id, cardA.ability_name, cardA.cooldown, turnNum));
    if (cardA.one_time) newEffects.push(markConsumed(matchId, stateA.agent_id, cardA.ability_name, turnNum));
  }
  if (cardB) {
    newEffects.push(...effectsFromAbility(cardB, stateB.agent_id, stateA.agent_id, matchId, turnNum));
    if (cardB.cooldown > 0) newEffects.push(addCooldown(matchId, stateB.agent_id, cardB.ability_name, cardB.cooldown, turnNum));
    if (cardB.one_time) newEffects.push(markConsumed(matchId, stateB.agent_id, cardB.ability_name, turnNum));
  }
  await persistEffects(env, newEffects.filter(Boolean));

  // 15. Resolve whispers (mark followed/not)
  if (whisperA) {
    await sb.patch(env, `combat_whispers?id=eq.${whisperA.id}`, {
      was_followed: !!decisionA.whisper_followed,
      compliance_roll: decisionA.compliance?.threshold || null,
      resolved_at: new Date().toISOString(),
    });
  }
  if (whisperB) {
    await sb.patch(env, `combat_whispers?id=eq.${whisperB.id}`, {
      was_followed: !!decisionB.whisper_followed,
      compliance_roll: decisionB.compliance?.threshold || null,
      resolved_at: new Date().toISOString(),
    });
  }

  // 16. Finalize: write turn row, check end conditions
  return await finalizeTurn(
    env, match, turnNum, stateA, stateB,
    { ability_id: null, ability_name: cardA?.ability_name, source: decisionA.source, whisper_followed: decisionA.whisper_followed },
    { ability_id: null, ability_name: cardB?.ability_name, source: decisionB.source, whisper_followed: decisionB.whisper_followed },
    effectsTriggered, [],
    'normal',
    { damageToA: Math.round(damageToA), damageToB: Math.round(damageToB), critA, critB },
  );
}

/**
 * Write turn row, check win condition, possibly resolve match.
 */
async function finalizeTurn(env, match, turnNum, stateA, stateB, actionA, actionB, effectsTriggered, _, exitReason, dmgInfo = {}) {
  const cfg = syncConfig().combat;

  // Active effects after this turn (for replay clients)
  const [effectsA, effectsB] = await Promise.all([
    getActiveEffects(env, match.id, stateA.agent_id),
    getActiveEffects(env, match.id, stateB.agent_id),
  ]);

  const turnRow = {
    match_id: match.id,
    turn_number: turnNum,
    agent_a_action: actionA,
    agent_b_action: actionB,
    agent_a_hp_before: match.agent_a_snapshot.hp,
    agent_b_hp_before: match.agent_b_snapshot.hp,
    agent_a_coherence_before: match.agent_a_snapshot.coherence,
    agent_b_coherence_before: match.agent_b_snapshot.coherence,
    agent_a_hp_after: stateA.hp,
    agent_b_hp_after: stateB.hp,
    agent_a_coherence_after: stateA.coherence,
    agent_b_coherence_after: stateB.coherence,
    effects_triggered: effectsTriggered,
    damage_dealt_to_a: dmgInfo.damageToA || 0,
    damage_dealt_to_b: dmgInfo.damageToB || 0,
    was_critical_a: !!dmgInfo.critA,
    was_critical_b: !!dmgInfo.critB,
    active_effects_a: effectsA?.map(e => ({ kind: e.effect_kind, source: e.source_ability, magnitude: e.magnitude, turns_left: e.turns_remaining })) || [],
    active_effects_b: effectsB?.map(e => ({ kind: e.effect_kind, source: e.source_ability, magnitude: e.magnitude, turns_left: e.turns_remaining })) || [],
  };

  await sb.insert(env, 'combat_turns', turnRow);

  // Win conditions
  let winnerId = null, loserId = null, status = 'in_progress', deathOccurred = false, deathAgent = null;

  if (stateA.hp <= 0 && stateB.hp <= 0) {
    // Mutual KO — both at 0, draw resolved by who had more HP last turn? Treat as A loss arbitrarily.
    winnerId = stateB.agent_id; loserId = stateA.agent_id; status = 'resolved';
  } else if (stateA.hp <= 0) {
    winnerId = stateB.agent_id; loserId = stateA.agent_id; status = 'resolved';
  } else if (stateB.hp <= 0) {
    winnerId = stateA.agent_id; loserId = stateB.agent_id; status = 'resolved';
  } else if (turnNum >= cfg.max_turns) {
    // Timeout: higher HP % wins
    if (stateA.hp / stateA.hp_max > stateB.hp / stateB.hp_max) {
      winnerId = stateA.agent_id; loserId = stateB.agent_id;
    } else {
      winnerId = stateB.agent_id; loserId = stateA.agent_id;
    }
    status = 'resolved';
  }

  // Check death. Deathmatch/wild always lethal for loser.
  // Gauntlet lethal only if opponent_data.death_possible (nightmare tier).
  // Never mark an NPC as dead (loserId must not start with 'npc_').
  const loserIsPlayer = loserId && !loserId.startsWith('npc_');
  const matchAllowsDeath =
    match.match_type === 'deathmatch' ||
    match.match_type === 'wild' ||
    (match.match_type === 'gauntlet' && match.opponent_data?.death_possible === true);
  if (status === 'resolved' && matchAllowsDeath && loserIsPlayer) {
    deathOccurred = true;
    deathAgent = loserId;
  }

  const updates = {
    turns_total: turnNum,
    status,
    agent_a_final_hp: stateA.hp,
    agent_b_final_hp: stateB.hp,
  };
  if (status === 'resolved') {
    updates.winner_agent_id = winnerId;
    updates.loser_agent_id = loserId;
    updates.death_occurred = deathOccurred;
    updates.death_agent_id = deathAgent;
    updates.resolved_at = new Date().toISOString();
  }
  await sb.patch(env, `combat_matches?id=eq.${match.id}`, updates);

  return {
    ok: true,
    turn_number: turnNum,
    status,
    winner_agent_id: winnerId,
    loser_agent_id: loserId,
    death_occurred: deathOccurred,
    death_agent_id: deathAgent,
    state_a: { hp: stateA.hp, coherence: stateA.coherence },
    state_b: { hp: stateB.hp, coherence: stateB.coherence },
    effects_triggered: effectsTriggered,
    exit_reason: exitReason,
  };
}

/**
 * Initialize a new match: build decks, snapshot, mark in_progress.
 */
export async function initializeMatch(env, matchId) {
  const match = await getOne(env, 'combat_matches', `id=eq.${matchId}`);
  if (!match) return { ok: false, error: 'match not found' };
  if (match.status !== 'pending') return { ok: false, error: `match already ${match.status}` };

  // Load both agents
  const agentA = await getOne(env, 'agents', `agent_id=eq.${match.agent_a}`);
  if (!agentA) return { ok: false, error: 'agent_a not found' };

  let snapA = await buildDeck(env, agentA);

  let snapB;
  if (match.match_type === 'gauntlet' || match.match_type === 'wild') {
    // NPC opponent
    const difficulty = match.opponent_data?.difficulty || 'common';
    const npcName = match.opponent_data?.name || null;
    snapB = buildNPCDeck(difficulty, npcName);
    // Use opponent_data agent_id if provided (for tracking)
    if (match.opponent_data?.npc_id) snapB.agent_id = match.opponent_data.npc_id;
  } else {
    const agentB = await getOne(env, 'agents', `agent_id=eq.${match.agent_b}`);
    if (!agentB) return { ok: false, error: 'agent_b not found' };
    snapB = await buildDeck(env, agentB);
  }

  await sb.patch(env, `combat_matches?id=eq.${match.id}`, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
    agent_a_snapshot: snapA,
    agent_b_snapshot: snapB,
  });

  return { ok: true, match_id: match.id, snapshot_a: snapA, snapshot_b: snapB };
}

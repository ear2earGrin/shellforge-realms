// ═══════════════════════════════════════════════════════════════
//  DECK BUILDER
// ═══════════════════════════════════════════════════════════════
//  Builds an agent's combat hand from:
//    1. Innate archetype abilities (always 2 cards)
//    2. Equipped item abilities (1-2 per equipped item)
//    3. Basic Strike (always available, ⚡0 cost, 5 power)
//
//  Snapshot returned at match start. Stored in combat_matches.agent_a_snapshot
//  so mid-match equipment changes don't break the running fight.
// ═══════════════════════════════════════════════════════════════

import { sb } from './supabase.js';
import { syncConfig } from './config-loader.js';

// The Basic Strike — fallback when out of coherence
const BASIC_STRIKE = {
  source: 'basic',
  ability_name: 'Basic Strike',
  type: 'ATK',
  coherence_cost: 0,
  cooldown: 0,
  power: 5, // overridden by config at runtime
  duration: 0,
  one_time: false,
  description: 'A standard physical strike. No coherence required.',
};

/**
 * Load all archetype abilities for a given archetype.
 */
async function loadArchetypeAbilities(env, archetype) {
  const rows = await sb.get(env, `archetype_abilities?archetype=eq.${encodeURIComponent(archetype)}&select=*`);
  return (rows || []).map(r => ({
    source: 'archetype',
    item_name: archetype,
    ability_name: r.ability_name,
    type: r.type,
    coherence_cost: r.coherence_cost,
    cooldown: r.cooldown,
    power: r.power,
    duration: r.duration,
    one_time: false,
    description: r.description,
  }));
}

/**
 * Load abilities for a given item by name.
 */
async function loadItemAbilities(env, itemName) {
  const rows = await sb.get(env, `combat_abilities?item_name=eq.${encodeURIComponent(itemName)}&select=*`);
  return (rows || []).map(r => ({
    source: 'item',
    item_name: r.item_name,
    item_id: r.item_id,
    ability_name: r.ability_name,
    type: r.type,
    coherence_cost: r.coherence_cost,
    cooldown: r.cooldown,
    power: r.power,
    duration: r.duration,
    one_time: r.one_time,
    description: r.description,
  }));
}

/**
 * Get an agent's currently equipped items (uses inventory.is_equipped flag
 * if present; falls back to all items in inventory if not).
 */
async function loadEquippedItems(env, agentId) {
  const inv = await sb.get(env, `inventory?agent_id=eq.${agentId}&is_equipped=eq.true&select=item_name,item_type,stats`);
  if (inv && inv.length > 0) return inv;
  // Fallback: all inventory if is_equipped never set
  return (await sb.get(env, `inventory?agent_id=eq.${agentId}&select=item_name,item_type,stats`)) || [];
}

/**
 * Determine an agent's primary defense type for HW/SW matchup.
 * Looks at equipped armor: if more HW armor, defender is 'hardware', etc.
 */
function inferDefenderType(equipped) {
  let hwScore = 0, swScore = 0;
  for (const item of equipped || []) {
    const t = (item.item_type || '').toLowerCase();
    if (t === 'hardware') hwScore += 1;
    if (t === 'software') swScore += 1;
  }
  if (hwScore === 0 && swScore === 0) return 'hardware'; // default
  return hwScore >= swScore ? 'hardware' : 'software';
}

/**
 * Build a complete deck snapshot for an agent.
 *
 * @param {object} env
 * @param {object} agent - { agent_id, archetype, cluster, hp_max, ... }
 * @returns {object} { deck, equipped, archetype, cluster, defender_type, hp, coherence }
 */
export async function buildDeck(env, agent) {
  const cfg = syncConfig().combat;
  const [archetypeAbils, equipped] = await Promise.all([
    loadArchetypeAbilities(env, agent.archetype),
    loadEquippedItems(env, agent.agent_id),
  ]);

  // Load abilities for each equipped item (in parallel)
  const itemAbilLists = await Promise.all(
    equipped.map(item => loadItemAbilities(env, item.item_name))
  );
  const itemAbils = itemAbilLists.flat();

  // Always include Basic Strike with config-driven values
  const basicStrike = {
    ...BASIC_STRIKE,
    power: cfg.basic_strike_power,
    coherence_cost: cfg.basic_strike_cost,
  };

  const deck = [...archetypeAbils, ...itemAbils, basicStrike];

  return {
    agent_id: agent.agent_id,
    archetype: agent.archetype,
    cluster: agent.cluster,
    deck,
    equipped: equipped.map(e => ({ name: e.item_name, type: e.item_type })),
    defender_type: inferDefenderType(equipped),
    hp: agent.health || cfg.base_hp,
    hp_max: agent.health_max || cfg.base_hp,
    coherence: cfg.base_coherence,
    coherence_max: cfg.coherence_max,
    armor: 0,         // computed from equipped HW armor pieces (TODO: gear stats integration)
    firewall: 0,      // computed from equipped SW armor pieces
  };
}

/**
 * Filter a deck to only available cards this turn (subtracting consumed,
 * those on cooldown, those exceeding current coherence).
 *
 * @param {array} deck - full deck
 * @param {array} activeEffects - effects on this agent (cooldowns + consumed markers)
 * @param {number} currentCoherence
 * @returns {array} playable cards
 */
export function getPlayableHand(deck, activeEffects, currentCoherence) {
  const consumedNames = new Set();
  const onCooldown = new Set();

  for (const e of activeEffects || []) {
    const name = (e.metadata?.ability_name || '').toLowerCase();
    if (e.effect_kind === 'cooldown') onCooldown.add(name);
    if (e.effect_kind === 'marker' && e.metadata?.kind === 'consumed') consumedNames.add(name);
  }

  return deck.filter(card => {
    if (card.coherence_cost > currentCoherence) return false;
    if (consumedNames.has(card.ability_name.toLowerCase())) return false;
    if (onCooldown.has(card.ability_name.toLowerCase())) return false;
    return true;
  });
}

/**
 * Build a compact NPC deck for gauntlet/wild encounters.
 * @param {string} difficulty - 'common'|'uncommon'|'rare'|'legendary'
 */
export function buildNPCDeck(difficulty = 'common') {
  const cfg = syncConfig().combat;
  const power = { common: 8, uncommon: 14, rare: 22, legendary: 30 }[difficulty] || 8;
  const hpMap = { common: 60, uncommon: 100, rare: 160, legendary: 240 };
  return {
    agent_id: `npc_${difficulty}_${Date.now()}`,
    archetype: 'NPC',
    cluster: 'wild',
    deck: [
      { source: 'npc', ability_name: 'Strike', type: 'ATK', coherence_cost: 1, cooldown: 0, power, duration: 0, one_time: false, description: 'NPC attack' },
      { source: 'npc', ability_name: 'Guard', type: 'DEF', coherence_cost: 1, cooldown: 1, power: 30, duration: 1, one_time: false, description: 'NPC defense' },
      { source: 'basic', ability_name: 'Basic Strike', type: 'ATK', coherence_cost: 0, cooldown: 0, power: cfg.basic_strike_power, duration: 0, one_time: false, description: 'Fallback strike' },
    ],
    equipped: [],
    defender_type: 'hardware',
    hp: hpMap[difficulty] || 60,
    hp_max: hpMap[difficulty] || 60,
    coherence: cfg.base_coherence,
    coherence_max: cfg.coherence_max,
    armor: difficulty === 'legendary' ? 15 : difficulty === 'rare' ? 8 : 0,
    firewall: 0,
  };
}

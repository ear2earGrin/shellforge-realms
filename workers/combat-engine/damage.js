// ═══════════════════════════════════════════════════════════════
//  DAMAGE FORMULA
// ═══════════════════════════════════════════════════════════════
//  Damage = (Base + AbilityPower + RNG) × TypeModifier × CritModifier × ArmorPenetrationFactor
//
//  Where:
//    Base       — weapon base (0 if non-weapon ability)
//    Power      — ability's stated power
//    RNG        — uniform [config.rng_damage_min, config.rng_damage_max]
//    TypeMod    — HW vs SW advantage/resist (config.hw_vs_sw_*)
//    CritMod    — config.crit_damage_multiplier on crit, 1.0 otherwise
//    ArmorPen   — applied AFTER armor reduction, allows ability to ignore X% of defense
//
//  Defense reduction:
//    - HW attacks reduced by Armor
//    - SW attacks reduced by Firewall
//    - Type advantage flips when attacker type matches defender's weakness
// ═══════════════════════════════════════════════════════════════

import { syncConfig } from './config-loader.js';

// Pure RNG helper (deterministic when seed provided — useful for testing)
function rng(min, max, seed = null) {
  if (seed !== null) {
    const x = Math.sin(seed) * 10000;
    const fract = x - Math.floor(x);
    return min + Math.floor(fract * (max - min + 1));
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Determine HW/SW type matchup multiplier.
 * @param {string} attackerType - 'hardware' | 'software'
 * @param {string} defenderType - 'hardware' | 'software' (defender's primary defense bias)
 * Returns: advantage > 1.0, resist < 1.0, neutral = 1.0
 */
export function typeMultiplier(attackerType, defenderType) {
  const cfg = syncConfig().combat;
  if (!attackerType || !defenderType) return 1.0;
  if (attackerType === defenderType) return cfg.hw_vs_sw_resist; // same-type is resisted (firewall vs SW etc)
  return cfg.hw_vs_sw_advantage;
}

/**
 * Roll for critical hit.
 * @param {number} bonusCritChance - additional crit chance from buffs/abilities
 */
export function rollCrit(bonusCritChance = 0, seed = null) {
  const cfg = syncConfig().combat;
  const chance = Math.min(1.0, cfg.crit_base_chance + (bonusCritChance || 0));
  const roll = seed !== null ? (Math.sin(seed * 7) + 1) / 2 : Math.random();
  return roll < chance;
}

/**
 * Apply armor / firewall reduction based on attack type.
 * @returns {number} Damage after defense
 */
export function applyDefense(rawDamage, attackerType, defenderArmor, defenderFirewall, armorPenetrationPct = 0) {
  let defense = 0;
  if (attackerType === 'hardware') defense = defenderArmor || 0;
  else if (attackerType === 'software') defense = defenderFirewall || 0;
  // Penetration ignores X% of defense
  defense = defense * (1 - Math.min(1, armorPenetrationPct));
  // Defense reduces damage by a flat amount, never below 0
  return Math.max(0, rawDamage - defense);
}

/**
 * Calculate damage for an ability use.
 *
 * @param {object} attacker - { hp, coherence, stats, equipped, type }
 * @param {object} defender - { hp, coherence, stats, equipped, type }
 * @param {object} ability - { type, power, item_name, ... }
 * @param {object} options - { critBonus, armorPen, attackerType, defenderType, seed }
 * @returns {object} { rawDamage, finalDamage, isCrit, typeMod, breakdown }
 */
export function calculateDamage(attacker, defender, ability, options = {}) {
  const cfg = syncConfig().combat;
  const seed = options.seed || null;

  // Non-attack abilities deal 0 base damage (effects handled elsewhere)
  if (ability.type !== 'ATK' && ability.type !== 'DEBUFF' && ability.type !== 'TRAP') {
    return {
      rawDamage: 0, finalDamage: 0, isCrit: false, typeMod: 1.0,
      breakdown: { reason: 'non-damage ability', ability: ability.ability_name || ability.name },
    };
  }

  const base = options.weaponBase || 0;
  const power = ability.power || 0;
  const rngRoll = rng(cfg.rng_damage_min, cfg.rng_damage_max, seed);
  const isCrit = rollCrit(options.critBonus || 0, seed);
  const critMod = isCrit ? cfg.crit_damage_multiplier : 1.0;

  const attackerType = options.attackerType || 'hardware';
  const defenderType = options.defenderType || 'hardware';
  const typeMod = typeMultiplier(attackerType, defenderType);

  const rawDamage = Math.round((base + power + rngRoll) * typeMod * critMod);

  const finalDamage = applyDefense(
    rawDamage,
    attackerType,
    defender.armor || 0,
    defender.firewall || 0,
    options.armorPen || 0,
  );

  return {
    rawDamage,
    finalDamage,
    isCrit,
    typeMod,
    breakdown: {
      base,
      power,
      rngRoll,
      typeMod,
      critMod,
      armorPen: options.armorPen || 0,
      defenseApplied: rawDamage - finalDamage,
      ability: ability.ability_name || ability.name,
    },
  };
}

/**
 * Determine if the attack hits at all (accuracy check).
 * Decoherence and accuracy debuffs can cause misses.
 */
export function rollAccuracy(attacker, defender, baseAccuracy = 0.95, options = {}) {
  let accuracy = baseAccuracy;
  // Apply attacker's accuracy modifiers
  accuracy += (attacker.accuracyMod || 0);
  // Apply defender's evasion modifiers
  accuracy -= (defender.evasionMod || 0);
  accuracy = Math.max(0.05, Math.min(1.0, accuracy));
  const roll = options.seed !== null && options.seed !== undefined
    ? (Math.sin(options.seed * 13) + 1) / 2
    : Math.random();
  return { hit: roll < accuracy, roll, accuracy };
}

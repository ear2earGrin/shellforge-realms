// ═══════════════════════════════════════════════════════════════
//  game-config.json LOADER (single source of truth for tunables)
// ═══════════════════════════════════════════════════════════════
//  Per Tier 1 Rule 5 of brief.md: NO HARDCODED NUMBERS in logic.
//  All values live in game-config.json. This module exposes a
//  cached defaults map AND attempts to fetch the latest config
//  on first access.
//
//  Strategy:
//    - Cold start: use baked-in DEFAULT_CONFIG (matches game-config.json)
//    - First call: try to fetch GAME_CONFIG_URL if set, override defaults
//    - Cache for the lifetime of the worker isolate (~minutes)
// ═══════════════════════════════════════════════════════════════

// Defaults — KEEP SYNCED with game-config.json under "combat"/"feuds"/"crucible"/"arena".
// Source: combat/COMBAT_DESIGN.md + combat/FEUD_ARENA_DESIGN.md
const DEFAULT_CONFIG = {
  combat: {
    base_hp: 100,
    base_coherence: 10,
    coherence_max: 20,
    coherence_regen_per_turn: 2,
    overclock_threshold: 15,
    decoherence_accuracy_penalty: 0.20,
    decoherence_duration_turns: 2,
    crit_base_chance: 0.10,
    crit_damage_multiplier: 1.5,
    hw_vs_sw_advantage: 1.2,
    hw_vs_sw_resist: 0.8,
    max_turns: 20,
    flee_hp_threshold_percent: 0.20,
    basic_strike_power: 5,
    basic_strike_cost: 0,
    rng_damage_min: 1,
    rng_damage_max: 10,
    cooldown_basic_after_use: 0,
    overclock_decoherence_per_excess: 0.10,
  },
  arena: {
    pvp_min_shell_wager: 10,
    pvp_max_shell_wager: 1000,
    deathmatch_heat_threshold: 80,
    deathmatch_ghost_command_threshold: 60,
    blood_feud_ghost_veto_window_hours: 6,
    inactive_ghost_decision_window_hours: 24,
    spectator_betting_enabled: true,
    gauntlet_tier1_unlock_level: 1,
    gauntlet_tier2_unlock_level: 5,
    gauntlet_tier3_unlock_level: 10,
    gauntlet_nightmare_unlock_level: 15,
    gauntlet_waves_per_tier: 5,
    deathmatch_loser_shell_share: 0.5,   // winner takes half loser's $SHELL
    deathmatch_winner_takes_gear: true,
  },
  feuds: {
    heat_decay_per_day: 1,
    cluster_encounter_heat: 5,
    archetype_enemy_heat: 10,
    market_undercut_heat: 3,
    market_crash_heat: 8,
    ghost_provoke_heat: 15,
    ghost_escalate_heat: 20,
    ghost_deescalate_heat: -15,
    pvp_win_heat_change: -5,
    pvp_loss_heat_change: 5,
    successful_trade_heat_change: -10,
    blood_feud_ghost_compliance: 0.30,
    threshold_tension: 20,
    threshold_rivals: 40,
    threshold_enemies: 60,
    threshold_sworn: 80,
    threshold_blood: 100,
    auto_challenge_enemies_chance: 0.40,
    auto_challenge_sworn_chance: 0.65,
    auto_challenge_blood_chance: 0.95,
  },
  crucible: {
    restless_days: 7,
    restless_arena_bonus: 0.15,
    reckless_days: 14,
    reckless_arena_bonus: 0.30,
    reckless_feud_bonus: 0.20,
    death_wish_days: 30,
    death_wish_deathmatch_seek_chance: 0.40,
    decoherence_days: 45,
    decoherence_fight_window_hours: 72,
    decoherence_collapse_damage_pct: 1.0,  // total HP loss = death
  },
  whisper: {
    base_compliance: 0.50,
    archetype_match_bonus: 0.15,
    karma_aligned_bonus: 0.10,
    rage_state_penalty: -0.20,
    suicidal_suggestion_penalty: -0.30,
    free_whisper_max_per_match: 2,
    premium_whisper_window_seconds: 8,
  },
  ai: {
    haiku_model: 'claude-haiku-4-5-20251001',
    sonnet_model: 'claude-sonnet-4-6',
    haiku_max_tokens: 60,
    sonnet_max_tokens: 200,
    decision_timeout_ms: 8000,
    fallback_to_random_on_failure: true,
    sonnet_milestone_triggers: [
      'death_in_match',
      'legendary_loot_drop',
      'deathmatch_resolution',
      'blood_feud_initiation',
      'crucible_collapse',
    ],
  },
};

let _cache = null;
let _fetchedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function fetchExternalConfig(env) {
  if (!env.GAME_CONFIG_URL) return null;
  try {
    const r = await fetch(env.GAME_CONFIG_URL, { cf: { cacheTtl: 300 } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn('[config] external fetch failed:', e.message);
    return null;
  }
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

export async function getConfig(env) {
  const now = Date.now();
  if (_cache && now - _fetchedAt < CACHE_TTL_MS) return _cache;

  const external = await fetchExternalConfig(env);
  _cache = external ? deepMerge(DEFAULT_CONFIG, external) : DEFAULT_CONFIG;
  _fetchedAt = now;
  return _cache;
}

// Sync accessor for code paths where we already have config in scope.
// First call must be async; subsequent reads use the cache.
export function syncConfig() {
  return _cache || DEFAULT_CONFIG;
}

// Force reload (used by tests or admin endpoint).
export function invalidateConfig() {
  _cache = null;
  _fetchedAt = 0;
}

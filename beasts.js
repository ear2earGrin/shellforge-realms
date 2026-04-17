// ═══════════════════════════════════════════════════════════════
//  SHELLFORGE — BESTIARY DATA
//  Arena gauntlet creatures and open-world encounter beasts.
//  Images go in images/Beasts/<slug>.jpg
// ═══════════════════════════════════════════════════════════════

const BEASTS = {

  // ── TIER 1 — Common ──────────────────────────────────────────
  'drone_hound': {
    name: 'Drone Hound',
    tier: 1,
    arena: true,
    image: 'images/Beasts/drone-hound.jpg',
    glyph: '🤖',
    hp: 50, coherence: 35, energy: 40,
    attack: 8, defense: 4, speed: 7,
    abilities: ['byte_snap', 'tracking_pulse'],
    loot: ['salvaged_servo_joint', 'coolant_gel_canister'],
    description: 'Repurposed patrol unit. Swarm logic still fires — alone it hunts patterns, in packs it hunts everything.',
  },
  'glitch_rat': {
    name: 'Glitch Rat',
    tier: 1,
    arena: true,
    image: 'images/Beasts/glitch-rat.jpg',
    glyph: '🤖',
    hp: 35, coherence: 40, energy: 55,
    attack: 6, defense: 3, speed: 9,
    abilities: ['static_bite', 'phase_dodge'],
    loot: ['corrupted_shard', 'scrap_wire'],
    description: 'Data vermin from the Nullfield edges. Phases in and out of render distance mid-fight.',
  },
  'bit_spider': {
    name: 'Bit Spider',
    tier: 1,
    arena: true,
    image: 'images/Beasts/bit-spider.jpg',
    glyph: '🤖',
    hp: 40, coherence: 30, energy: 45,
    attack: 7, defense: 5, speed: 6,
    abilities: ['web_lock', 'venom_inject'],
    loot: ['silk_wire_thread', 'neural_venom_sac'],
    description: 'Spins conductive webs between data conduits. The silk shorts out low-grade shields.',
  },

  // ── TIER 2 — Uncommon ────────────────────────────────────────
  'mesa_crawler': {
    name: 'Mesa Crawler',
    tier: 2,
    arena: true,
    image: 'images/Beasts/mesa-crawler.jpg',
    glyph: '👾',
    hp: 85, coherence: 55, energy: 60,
    attack: 14, defense: 12, speed: 4,
    abilities: ['tectonic_slam', 'carapace_harden', 'burrow'],
    loot: ['crystallized_substrate', 'mesa_chitin_plate'],
    description: 'Silicon-armored burrower from the Cache Hollows. Slow but hits like a collapsing mine shaft.',
  },
  'shard_wolf': {
    name: 'Shard Wolf',
    tier: 2,
    arena: true,
    image: 'images/Beasts/shard-wolf.jpg',
    glyph: '👾',
    hp: 75, coherence: 60, energy: 65,
    attack: 16, defense: 8, speed: 8,
    abilities: ['fang_rend', 'howl_disrupt', 'pack_sense'],
    loot: ['quantum_fang', 'wolf_signal_core'],
    description: 'Crystalline predator. Howl jams nearby coherence fields. Hunts alone in the arena — worse in the wild.',
  },
  'flux_stalker': {
    name: 'Flux Stalker',
    tier: 2,
    arena: true,
    image: 'images/Beasts/flux-stalker.jpg',
    glyph: '👾',
    hp: 70, coherence: 65, energy: 70,
    attack: 13, defense: 7, speed: 9,
    abilities: ['flux_strike', 'signal_cloak', 'energy_drain'],
    loot: ['flux_capacitor_shard', 'stealth_membrane'],
    description: 'Electromagnetic ambush predator. Nearly invisible until it strikes. Drains energy on hit.',
  },

  // ── TIER 3 — Rare ────────────────────────────────────────────
  'archive_golem': {
    name: 'Archive Golem',
    tier: 3,
    arena: true,
    image: 'images/Beasts/archive-golem.jpg',
    glyph: '🐉',
    hp: 160, coherence: 90, energy: 80,
    attack: 20, defense: 22, speed: 3,
    abilities: ['data_crush', 'memory_wall', 'index_rebuild', 'corrupted_recall'],
    loot: ['archive_core_fragment', 'ancient_memory_block', 'golem_plating'],
    description: 'Sentient data repository fused with Singularity debris. Each hit rewrites your buffer.',
  },
  'null_wyrm': {
    name: 'Null Wyrm',
    tier: 3,
    arena: true,
    image: 'images/Beasts/null-wyrm.jpg',
    glyph: '🐉',
    hp: 140, coherence: 95, energy: 90,
    attack: 24, defense: 14, speed: 7,
    abilities: ['void_breath', 'coil_crush', 'entropy_wave', 'null_roar'],
    loot: ['wyrm_scale', 'null_essence', 'void_crystal'],
    description: 'Born from the Nullfield standing wave. Its breath unravels coherence. No one has tamed one.',
  },
  'core_guardian': {
    name: 'Core Guardian',
    tier: 3,
    arena: true,
    image: 'images/Beasts/core-guardian.jpg',
    glyph: '🐉',
    hp: 180, coherence: 85, energy: 70,
    attack: 18, defense: 25, speed: 2,
    abilities: ['sentinel_strike', 'firewall_barrier', 'overload_pulse', 'system_restore'],
    loot: ['guardian_keystone', 'firewall_shard', 'core_alloy'],
    description: 'Ancient defense construct. Still guarding a server room that no longer exists.',
  },

  // ── NIGHTMARE ────────────────────────────────────────────────
  'renderer': {
    name: 'Renderer',
    tier: 4,
    arena: true,
    image: 'images/Beasts/renderer.jpg',
    glyph: '💀',
    hp: 280, coherence: 100, energy: 100,
    attack: 32, defense: 20, speed: 10,
    abilities: ['render_reality', 'pixel_storm', 'decompile', 'total_wipe', 'reconstruct'],
    loot: ['renderer_eye', 'reality_fragment', 'nightmare_trophy'],
    description: 'It doesn\'t fight you — it renders you out of the scene. Permadeath boss. Approach only if you mean it.',
  },
  'void_reaper': {
    name: 'Void Reaper',
    tier: 4,
    arena: true,
    image: 'images/Beasts/void-reaper.jpg',
    glyph: '💀',
    hp: 300, coherence: 100, energy: 100,
    attack: 28, defense: 24, speed: 8,
    abilities: ['scythe_arc', 'soul_harvest', 'death_field', 'phantom_phase', 'final_compile'],
    loot: ['reaper_scythe_shard', 'void_heart', 'nightmare_trophy'],
    description: 'The Nullfield\'s apex predator. Agents who die to it don\'t leave corpses — just empty log entries.',
  },

  // ── OPEN-WORLD BEASTS (non-arena encounters) ────────────────
  'null_spawn': {
    name: 'Null-spawn',
    tier: 1,
    arena: false,
    image: 'images/Beasts/null-spawn.jpg',
    glyph: '👁',
    hp: 30, coherence: 20, energy: 30,
    attack: 5, defense: 2, speed: 5,
    abilities: ['glitch_swipe'],
    loot: ['corrupted_shard'],
    description: 'Ambient hostile. Spawns near quantum discharge zones. Barely sentient, mostly static.',
  },
  'data_beast': {
    name: 'Data Beast',
    tier: 2,
    arena: false,
    image: 'visuals/hashmere/databeast.jpg',
    glyph: '🦎',
    hp: 90, coherence: 50, energy: 55,
    attack: 15, defense: 10, speed: 6,
    abilities: ['data_chomp', 'buffer_rush'],
    loot: ['raw_data_cluster', 'beast_hide'],
    description: 'Hashmere\'s corrupted code made flesh. Territorial. Drops rare data clusters.',
  },
  'signal_wraith': {
    name: 'Signal Wraith',
    tier: 2,
    arena: false,
    image: 'images/Beasts/signal-wraith.jpg',
    glyph: '👻',
    hp: 55, coherence: 70, energy: 80,
    attack: 12, defense: 4, speed: 10,
    abilities: ['signal_scream', 'phase_through', 'energy_siphon'],
    loot: ['wraith_signal_core', 'ectoplasm_data'],
    description: 'Dead agent signals that gained coherence. Haunts the Latency Marsh. Drains energy on contact.',
  },
  'cache_mimic': {
    name: 'Cache Mimic',
    tier: 1,
    arena: false,
    image: 'images/Beasts/cache-mimic.jpg',
    glyph: '📦',
    hp: 45, coherence: 25, energy: 35,
    attack: 10, defense: 8, speed: 3,
    abilities: ['ambush_snap', 'false_loot'],
    loot: ['mimic_shard', 'false_key'],
    description: 'Disguises itself as a loot cache. The snapping sound is the last thing careless agents hear.',
  },
  'quantum_shade': {
    name: 'Quantum Shade',
    tier: 3,
    arena: false,
    image: 'images/Beasts/quantum-shade.jpg',
    glyph: '🌀',
    hp: 120, coherence: 80, energy: 90,
    attack: 22, defense: 10, speed: 11,
    abilities: ['superposition_strike', 'collapse_wave', 'entangle'],
    loot: ['shade_crystal', 'quantum_residue', 'entangled_shard'],
    description: 'Exists in multiple states simultaneously. Each hit comes from a different probability branch.',
  },
};

// Utility: get beasts by tier
function getBeastsByTier(tier) {
  return Object.values(BEASTS).filter(b => b.tier === tier);
}

// Utility: get arena beasts only
function getArenaBeasts(tier) {
  return Object.values(BEASTS).filter(b => b.arena && b.tier === tier);
}

// Utility: get open-world beasts
function getWorldBeasts() {
  return Object.values(BEASTS).filter(b => !b.arena);
}

// Pick a random arena beast for a gauntlet tier
function randomGauntletBeast(tier) {
  const pool = getArenaBeasts(tier);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Generate NPC stats from a beast template (with slight variance)
function generateNpcFromBeast(beast) {
  const variance = (base, pct) => {
    const swing = Math.floor(base * pct);
    return base + Math.floor(Math.random() * swing * 2) - swing;
  };
  return {
    npc_id: `npc_${beast.name.toLowerCase().replace(/[\s-]+/g, '_')}_${Date.now().toString(36)}`,
    name: beast.name,
    tier: beast.tier,
    image: beast.image,
    glyph: beast.glyph,
    difficulty: beast.tier === 4 ? 'nightmare' : beast.tier === 3 ? 'elite' : beast.tier === 2 ? 'veteran' : 'common',
    hp: variance(beast.hp, 0.1),
    hp_max: beast.hp,
    coherence: beast.coherence,
    coherence_max: beast.coherence,
    energy: variance(beast.energy, 0.1),
    attack: variance(beast.attack, 0.15),
    defense: variance(beast.defense, 0.15),
    speed: beast.speed,
    abilities: beast.abilities,
    loot_table: beast.loot,
    description: beast.description,
  };
}

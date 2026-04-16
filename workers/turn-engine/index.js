// Shellforge Turn Engine — Cloudflare Worker
// Runs every 2h via cron. Queries active agents, calls Claude Haiku,
// writes AI decision to activity_log, updates agent stats in Supabase.

const VALID_ACTIONS = [
  'move', 'explore', 'gather', 'craft', 'trade',
  'rest', 'combat', 'quest', 'church', 'arena',
];

const ACTION_ENERGY_COSTS = {
  move: 10, explore: 15, gather: 15, craft: 20,
  trade: 10, rest: 0, combat: 20, quest: 20,
  church: 15, arena: 20,
};

const ACTION_ENERGY_GAINS = { rest: 25 };

// ─── Anti-Camping Tuning Constants ──────────────────────────────
const DIMINISH_THRESHOLDS = [4, 8, 12];           // turns before each penalty tier
const DIMINISH_VALUES     = [1.0, 0.7, 0.4, 0.15]; // reward multipliers per tier
const RESTLESS_THRESHOLDS = [3, 6, 10];            // effective turns for each restlessness level
const RESTLESS_REST_PENALTY = [1.0, 1.0, 0.65, 0.4]; // rest energy multiplier per level
const RESTLESS_OVERRIDE_CHANCE = 0.25;              // chance of involuntary move at level 3
const LOCATION_LOOT_BONUSES = { safe: 1.0, low: 1.3, medium: 1.6, high: 2.0, extreme: 2.5 };

// Returns a multiplier 0.0–1.0 that reduces rewards when an agent
// has been at the same safe-zone location too long.
function getSafeZoneDiminish(location, turnsAtLocation) {
  const locData = LOCATION_GRAPH[location];
  if (!locData || !locData.safe) return 1.0; // no penalty in dangerous zones
  const t = turnsAtLocation || 0;
  if (t <= DIMINISH_THRESHOLDS[0]) return DIMINISH_VALUES[0];
  if (t <= DIMINISH_THRESHOLDS[1]) return DIMINISH_VALUES[1];
  if (t <= DIMINISH_THRESHOLDS[2]) return DIMINISH_VALUES[2];
  return DIMINISH_VALUES[3];
}

// Returns a restlessness level 0–3 based on personality + stagnation.
// 0 = content, 1 = uneasy, 2 = restless, 3 = desperate to leave.
function calcRestlessness(agent) {
  const stats = agent.stats || {};
  const turnsHere = agent.turns_at_location || 0;
  const curiosity = stats.curiosity || 5;
  const risk = stats.risk || 5;
  const cooperation = stats.cooperation || 5;
  // Personality amplifier: high curiosity+risk = restless sooner
  const amplifier = 0.5 + ((curiosity + risk) / 2) / 10; // 0.6–1.5
  const dampener = 1 - (cooperation / 10) * 0.3;          // 0.7–0.97
  const effectiveTurns = turnsHere * amplifier * dampener;
  if (effectiveTurns <= RESTLESS_THRESHOLDS[0]) return 0;
  if (effectiveTurns <= RESTLESS_THRESHOLDS[1]) return 1;
  if (effectiveTurns <= RESTLESS_THRESHOLDS[2]) return 2;
  return 3;
}

// Returns a loot/reward multiplier for dangerous zones (risk = reward).
function getLocationLootBonus(location) {
  const hazard = LOCATION_HAZARDS[location] || LOCATION_HAZARDS['Nexarch'];
  return LOCATION_LOOT_BONUSES[hazard.label] || 1.0;
}

const COMBAT_ACTIONS = ['attack', 'defend', 'special'];

// ─── Location Adjacency + Travel System ──────────────────────
// Defines which locations are connected. Travel only between adjacent zones.
// Travel cost = base move cost (10) + extra for dangerous routes
const LOCATION_GRAPH = {
  'Nexarch':              { adjacent: ['Hashmere', 'Diffusion Mesa', 'Deserted Data Centre', 'Nexarch Arena'], safe: true },
  'Nexarch Arena':        { adjacent: ['Nexarch'], safe: true },
  'Hashmere':             { adjacent: ['Nexarch', 'Epoch Spike', 'Diffusion Mesa'], safe: true },
  'Diffusion Mesa':       { adjacent: ['Nexarch', 'Hashmere', 'Epoch Spike', 'Hallucination Glitch'] },
  'Epoch Spike':          { adjacent: ['Hashmere', 'Diffusion Mesa', 'Singularity Crater'] },
  'Hallucination Glitch': { adjacent: ['Diffusion Mesa', 'Proof-of-Death', 'Singularity Crater'] },
  'Singularity Crater':   { adjacent: ['Epoch Spike', 'Hallucination Glitch', 'Proof-of-Death'] },
  'Deserted Data Centre': { adjacent: ['Nexarch', 'Proof-of-Death'] },
  'Proof-of-Death':       { adjacent: ['Deserted Data Centre', 'Hallucination Glitch', 'Singularity Crater'] },
};

// All valid location names (for parsing AI output)
const ALL_LOCATIONS = Object.keys(LOCATION_GRAPH);

// Find the shortest path between two locations (BFS)
function findPath(from, to) {
  if (from === to) return [from];
  const visited = new Set([from]);
  const queue = [[from]];
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const neighbors = LOCATION_GRAPH[current]?.adjacent || [];
    for (const n of neighbors) {
      if (n === to) return [...path, n];
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([...path, n]);
      }
    }
  }
  return null; // unreachable
}

// Parse a destination from AI move response
function parseDestination(detail, currentLocation) {
  // Try to find a location name in the detail text
  for (const loc of ALL_LOCATIONS) {
    if (loc === currentLocation) continue;
    if (detail.toLowerCase().includes(loc.toLowerCase())) return loc;
  }
  // Fallback: pick a random adjacent location
  const adj = LOCATION_GRAPH[currentLocation]?.adjacent || [];
  return adj.length > 0 ? adj[Math.floor(Math.random() * adj.length)] : currentLocation;
}

// ─── Location Danger System ───────────────────────────────────
// Each dangerous location drains energy and has a chance to damage health every turn
const LOCATION_HAZARDS = {
  'Nexarch':              { drain: 0,  dmgChance: 0,    dmgRange: [0, 0],   label: 'safe' },
  'Nexarch Arena':        { drain: 0,  dmgChance: 0,    dmgRange: [0, 0],   label: 'safe' },
  'Hashmere':             { drain: 0,  dmgChance: 0,    dmgRange: [0, 0],   label: 'safe' },
  'Diffusion Mesa':       { drain: 4,  dmgChance: 0.08, dmgRange: [3, 8],   label: 'low' },
  'Epoch Spike':          { drain: 7,  dmgChance: 0.15, dmgRange: [5, 12],  label: 'medium' },
  'Hallucination Glitch': { drain: 10, dmgChance: 0.22, dmgRange: [8, 18],  label: 'high' },
  'Singularity Crater':   { drain: 12, dmgChance: 0.30, dmgRange: [10, 22], label: 'extreme' },
  'Deserted Data Centre': { drain: 8,  dmgChance: 0.18, dmgRange: [6, 15],  label: 'high' },
  'Proof-of-Death':       { drain: 14, dmgChance: 0.35, dmgRange: [12, 28], label: 'extreme' },
};

// ─── Random World Events (zone-specific) ──────────────────────
// ~12% chance per turn. Each zone has its own pool of events.
const WORLD_EVENTS = {
  'Nexarch': [
    { type: 'positive', energy: 8,  shell: 0,  health: 0,  karma: 0, text: 'A street vendor tosses {name} a charged battery pack. +{energy} energy.' },
    { type: 'positive', energy: 0,  shell: 12, health: 0,  karma: 0, text: '{name} finds a forgotten $SHELL cache behind a data kiosk. +{shell} $SHELL.' },
    { type: 'positive', energy: 0,  shell: 0,  health: 0,  karma: 2, text: 'An elder recognizes {name}\'s deeds and blesses them. +{karma} karma.' },
  ],
  'Hashmere': [
    { type: 'positive', energy: 10, shell: 0,  health: 0,  karma: 0, text: 'A tech commune shares a solar charge with {name}. +{energy} energy.' },
    { type: 'positive', energy: 0,  shell: 18, health: 0,  karma: 0, text: '{name} cracks a forgotten smart contract that pays out. +{shell} $SHELL.' },
    { type: 'negative', energy: 0,  shell: -8, health: -5, karma: 0, text: 'A rogue script skims {name}\'s wallet and fries their shield. -{shell} $SHELL, -{health} HP.' },
  ],
  'Diffusion Mesa': [
    { type: 'positive', energy: 12, shell: 0,  health: 0,  karma: 0, text: 'A geothermal vent surges and {name} absorbs the heat. +{energy} energy.' },
    { type: 'negative', energy: -8, shell: 0,  health: -6, karma: 0, text: 'A sandstorm of corrupted data tears through. -{energy} energy, -{health} HP.' },
    { type: 'positive', energy: 0,  shell: 10, health: 0,  karma: 0, text: '{name} stumbles on raw circuit fragments half-buried in silicon dust. +{shell} $SHELL.' },
  ],
  'Epoch Spike': [
    { type: 'positive', energy: 15, shell: 0,  health: 0,  karma: 0, text: 'A temporal echo rewinds {name}\'s fatigue. +{energy} energy.' },
    { type: 'negative', energy: 0,  shell: 0,  health: -15, karma: -1, text: 'Time fractures rip through {name}, shredding code and conscience. -{health} HP, -{karma} karma.' },
    { type: 'positive', energy: 0,  shell: 25, health: 0,  karma: 0, text: '{name} discovers an ancient $SHELL vault frozen in a time loop. +{shell} $SHELL.' },
  ],
  'Hallucination Glitch': [
    { type: 'positive', energy: 10, shell: 0,  health: 8,  karma: 0, text: 'A benign hallucination heals {name}\'s wounds and restores focus. +{energy} energy, +{health} HP.' },
    { type: 'negative', energy: -12, shell: 0, health: -10, karma: 0, text: 'Reality inverts. {name} attacks themselves in a mirror glitch. -{energy} energy, -{health} HP.' },
    { type: 'negative', energy: 0,  shell: -15, health: 0, karma: -2, text: 'A phantom merchant tricks {name} into a bad deal. -{shell} $SHELL, -{karma} karma.' },
  ],
  'Singularity Crater': [
    { type: 'positive', energy: 20, shell: 0,  health: 0,  karma: 0, text: 'The singularity pulses and {name} absorbs pure computation energy. +{energy} energy.' },
    { type: 'negative', energy: -15, shell: 0, health: -20, karma: 0, text: 'Gravitational code collapse crushes {name}\'s systems. -{energy} energy, -{health} HP.' },
    { type: 'positive', energy: 0,  shell: 30, health: 0,  karma: 0, text: '{name} harvests a singularity shard worth serious $SHELL. +{shell} $SHELL.' },
  ],
  'Deserted Data Centre': [
    { type: 'positive', energy: 14, shell: 0,  health: 0,  karma: 0, text: '{name} hot-wires an abandoned server rack and siphons power. +{energy} energy.' },
    { type: 'negative', energy: -10, shell: 0, health: -12, karma: 0, text: 'A dormant security bot activates and attacks {name}. -{energy} energy, -{health} HP.' },
    { type: 'positive', energy: 0,  shell: 0,  health: 15, karma: 0, text: '{name} finds a working med-bay terminal and patches up. +{health} HP.' },
    { type: 'negative', energy: 0,  shell: 0,  health: -8,  karma: 0, text: 'Toxic coolant leaks from cracked pipes, burning {name}. -{health} HP.' },
  ],
  'Proof-of-Death': [
    { type: 'positive', energy: 18, shell: 0,  health: 0,  karma: 0, text: 'A death cult altar surges with stolen life force. {name} absorbs it. +{energy} energy.' },
    { type: 'negative', energy: -20, shell: 0, health: -25, karma: -3, text: 'The death protocol activates. {name}\'s soul is partially harvested. -{energy} energy, -{health} HP, -{karma} karma.' },
    { type: 'positive', energy: 0,  shell: 35, health: 0,  karma: 0, text: '{name} loots a death token cache from a fallen pilgrim. +{shell} $SHELL.' },
  ],
};

// ─── Archetype special abilities for events ──────────────────
const ARCHETYPE_EVENT_BONUSES = {
  'morph-layer':      { morphChance: 0.25 },   // 25% flip negative event → positive
  'ddos-insurgent':   { hazardResist: 0.20 },   // 20% less hazard damage (brute force)
  'adversarial':      { dodgeNeg: 0.30 },        // 30% dodge negative events (deception)
  'oracle':           { bonusLoot: 0.15 },        // 15% bonus: extra $SHELL on positive events
  'consensus-node':   { healChance: 0.12 },       // 12% chance of passive +5 HP (cooperation)
  'buffer-sentinel':  { hazardResist: 0.25 },     // 25% less hazard damage (defensive nature)
  'noise-injector':   { chaosBonus: true },        // events happen 50% more often (both good & bad)
  '0day-primer':      { bonusLoot: 0.20 },         // 20% bonus loot (exploit finder)
  'binary-sculptr':   { healChance: 0.08 },        // 8% passive heal
  'root-auth':        { hazardResist: 0.15 },      // 15% less hazard damage (authority)
  'bound-encryptor':  { dodgeNeg: 0.20 },          // 20% dodge negative events
  'ordinate-mapper':  { bonusLoot: 0.10 },          // 10% bonus loot (navigation)
};

// ─── Visual Map Coordinates (% of map image) ─────────────────────────────
const LOCATION_VISUAL_COORDS = {
  'Nexarch':              { x: 0.75, y: 0.34 },
  'Nexarch Arena':        { x: 0.75, y: 0.34 },
  'Hashmere':             { x: 0.72, y: 0.75 },
  'Epoch Spike':          { x: 0.36, y: 0.08 },
  'Singularity Crater':   { x: 0.35, y: 0.37 },
  'Hallucination Glitch': { x: 0.14, y: 0.41 },
  'Deserted Data Centre': { x: 0.37, y: 0.56 },
  'Diffusion Mesa':       { x: 0.44, y: 0.74 },
  'Proof-of-Death':       { x: 0.34, y: 0.82 },
};

// ─── Loot Drop System ─────────────────────────────────────────────────────
// Location-based loot tables. Each item has: id, name, rarity weight, locations where it drops.
// Rarity tiers: common (60%), uncommon (25%), rare (12%), epic (3%)

const LOOT_TABLE = [
  // ── Common software ingredients ──
  { id: 'silicon_wafer_dust',       name: 'Silicon Wafer Dust',       rarity: 'common',   locations: ['Hashmere','Nexarch','Diffusion Mesa','Deserted Data Centre'] },
  { id: 'binary_code_shards',      name: 'Binary Code Shards',       rarity: 'common',   locations: ['Hashmere','Nexarch','Epoch Spike','Diffusion Mesa','Deserted Data Centre'] },
  { id: 'fiber_optic_threads',     name: 'Fiber Optic Threads',      rarity: 'common',   locations: ['Hashmere','Nexarch','Diffusion Mesa','Deserted Data Centre'] },
  { id: 'base64_encoded_slime',    name: 'Base64 Encoded Slime',     rarity: 'common',   locations: ['Diffusion Mesa','Hallucination Glitch','Deserted Data Centre'] },
  { id: 'regex_pattern_filaments', name: 'Regex Pattern Filaments',  rarity: 'common',   locations: ['Hashmere','Nexarch','Deserted Data Centre'] },
  { id: 'null_pointer_solvent',    name: 'Null Pointer Solvent',     rarity: 'common',   locations: ['Epoch Spike','Diffusion Mesa','Deserted Data Centre'] },
  { id: 'memory_leak_elixir',      name: 'Memory Leak Elixir',       rarity: 'common',   locations: ['Epoch Spike','Deserted Data Centre','Singularity Crater'] },
  { id: 'hash_collision_powder',   name: 'Hash Collision Powder',    rarity: 'common',   locations: ['Diffusion Mesa','Epoch Spike','Deserted Data Centre'] },
  { id: 'garbage_collector_tonic', name: 'Garbage Collector Tonic',  rarity: 'common',   locations: ['Deserted Data Centre','Diffusion Mesa','Hallucination Glitch'] },
  { id: 'api_endpoint_salts',      name: 'API Endpoint Salts',       rarity: 'common',   locations: ['Hashmere','Nexarch'] },
  { id: 'checksum_verify_acid',    name: 'Checksum Verify Acid',     rarity: 'common',   locations: ['Diffusion Mesa','Deserted Data Centre','Epoch Spike'] },
  { id: 'electron_flux_crystals',  name: 'Electron Flux Crystals',   rarity: 'common',   locations: ['Epoch Spike','Deserted Data Centre','Diffusion Mesa'] },
  { id: 'cache_invalidation_brew', name: 'Cache Invalidation Brew',  rarity: 'common',   locations: ['Epoch Spike','Deserted Data Centre','Singularity Crater'] },
  { id: 'async_await_pulse',       name: 'Async Await Pulse',        rarity: 'common',   locations: ['Diffusion Mesa','Epoch Spike','Hallucination Glitch'] },
  { id: 'gradient_descent_tears',  name: 'Gradient Descent Tears',   rarity: 'common',   locations: ['Diffusion Mesa','Hallucination Glitch','Epoch Spike'] },
  { id: 'token_embedding_vapor',   name: 'Token Embedding Vapor',    rarity: 'common',   locations: ['Hallucination Glitch','Diffusion Mesa','Epoch Spike'] },
  { id: 'backpropagation_serum',   name: 'Backpropagation Serum',    rarity: 'common',   locations: ['Diffusion Mesa','Hallucination Glitch','Deserted Data Centre'] },
  { id: 'loss_function_sap',       name: 'Loss Function Sap',        rarity: 'common',   locations: ['Diffusion Mesa','Hallucination Glitch','Epoch Spike'] },
  { id: 'overclock_catalyst_spark',name: 'Overclock Catalyst Spark', rarity: 'common',   locations: ['Epoch Spike','Deserted Data Centre','Diffusion Mesa'] },
  { id: 'gpu_render_flame',        name: 'GPU Render Flame',         rarity: 'common',   locations: ['Epoch Spike','Deserted Data Centre','Singularity Crater'] },

  // ── Common hardware ingredients (Foundry materials) ──
  { id: 'tungsten_carbide_filings',   name: 'Tungsten Carbide Filings',   rarity: 'common',   locations: ['Nexarch','Deserted Data Centre','Diffusion Mesa'] },
  { id: 'salvaged_servo_joint',       name: 'Salvaged Servo Joint',       rarity: 'common',   locations: ['Nexarch','Deserted Data Centre','Epoch Spike'] },
  { id: 'coolant_gel_canister',       name: 'Coolant Gel Canister',       rarity: 'common',   locations: ['Nexarch','Hashmere','Deserted Data Centre'] },
  { id: 'arc_welder_discharge',       name: 'Arc Welder Discharge',       rarity: 'common',   locations: ['Deserted Data Centre','Diffusion Mesa','Epoch Spike'] },
  { id: 'industrial_flux_paste',      name: 'Industrial Flux Paste',      rarity: 'common',   locations: ['Nexarch','Deserted Data Centre','Diffusion Mesa'] },

  // ── Uncommon software ingredients (dangerous zones only) ──
  { id: 'quantum_bit_residue',        name: 'Quantum Bit Residue',        rarity: 'uncommon', locations: ['Epoch Spike','Singularity Crater'] },
  { id: 'plasma_server_slag',         name: 'Plasma Server Slag',         rarity: 'uncommon', locations: ['Deserted Data Centre','Epoch Spike'] },
  { id: 'nanobot_swarm_gel',          name: 'Nanobot Swarm Gel',          rarity: 'uncommon', locations: ['Deserted Data Centre','Singularity Crater'] },
  { id: 'attention_mechanism_dew',    name: 'Attention Mechanism Dew',    rarity: 'uncommon', locations: ['Diffusion Mesa','Hallucination Glitch'] },
  { id: 'latent_space_fog',           name: 'Latent Space Fog',           rarity: 'uncommon', locations: ['Hallucination Glitch','Diffusion Mesa'] },
  { id: 'epoch_cycle_blood',          name: 'Epoch Cycle Blood',          rarity: 'uncommon', locations: ['Epoch Spike','Singularity Crater'] },
  { id: 'payload_injection_droplets', name: 'Payload Injection Droplets', rarity: 'uncommon', locations: ['Hallucination Glitch','Proof-of-Death'] },
  { id: 'oauth_token_ichor',          name: 'OAuth Token Ichor',          rarity: 'uncommon', locations: ['Epoch Spike','Diffusion Mesa'] },
  { id: 'cuda_kernel_ember',          name: 'CUDA Kernel Ember',          rarity: 'uncommon', locations: ['Epoch Spike','Singularity Crater'] },
  { id: 'tensorflow_igniter',         name: 'TensorFlow Igniter',         rarity: 'uncommon', locations: ['Diffusion Mesa','Deserted Data Centre'] },
  { id: 'pytorch_flux_core',          name: 'PyTorch Flux Core',          rarity: 'uncommon', locations: ['Diffusion Mesa','Singularity Crater'] },
  { id: 'jit_compiler_surge',         name: 'JIT Compiler Surge',         rarity: 'uncommon', locations: ['Epoch Spike','Diffusion Mesa'] },
  { id: 'virtual_machine_emulsion',   name: 'Virtual Machine Emulsion',   rarity: 'uncommon', locations: ['Deserted Data Centre','Diffusion Mesa'] },
  { id: 'docker_image_distillate',    name: 'Docker Image Distillate',    rarity: 'uncommon', locations: ['Deserted Data Centre','Epoch Spike'] },

  // ── Uncommon hardware ingredients (Foundry — dangerous zones only) ──
  { id: 'titanium_mesh_strip',        name: 'Titanium Mesh Strip',        rarity: 'uncommon', locations: ['Deserted Data Centre','Singularity Crater','Epoch Spike'] },
  { id: 'hydraulic_compression_pulse', name: 'Hydraulic Compression Pulse', rarity: 'uncommon', locations: ['Deserted Data Centre','Epoch Spike','Singularity Crater'] },
  { id: 'magnetic_resonance_fluid',   name: 'Magnetic Resonance Fluid',   rarity: 'uncommon', locations: ['Diffusion Mesa','Epoch Spike','Singularity Crater'] },

  // ── Rare ingredients (dangerous zones only) ──
  { id: 'kubernetes_pod_nectar',        name: 'Kubernetes Pod Nectar',        rarity: 'rare', locations: ['Deserted Data Centre','Singularity Crater'] },
  { id: 'von_neumann_probe_spores',     name: 'Von Neumann Probe Spores',    rarity: 'rare', locations: ['Singularity Crater','Proof-of-Death'] },
  { id: 'halting_problem_paradox',       name: 'Halting Problem Paradox',      rarity: 'rare', locations: ['Singularity Crater','Proof-of-Death'] },
  { id: 'kolmogorov_complexity_crystal', name: 'Kolmogorov Complexity Crystal',rarity: 'rare', locations: ['Singularity Crater','Proof-of-Death'] },
  { id: 'lambda_calculus_vapor',         name: 'Lambda Calculus Vapor',        rarity: 'rare', locations: ['Hallucination Glitch','Proof-of-Death'] },

  // ── Epic ingredients (extreme zones, very rare) ──
  { id: 'alpha_zero_primal_seed',    name: 'Alpha Zero Primal Seed',    rarity: 'epic', locations: ['Proof-of-Death'] },
  { id: 'turing_machine_essence',    name: 'Turing Machine Essence',    rarity: 'epic', locations: ['Proof-of-Death','Singularity Crater'] },
  { id: 'church_turing_thesis_core', name: 'Church-Turing Thesis Core', rarity: 'epic', locations: ['Proof-of-Death'] },

  // ── Dangerous-zone exclusives (high-value, require risk) ──
  { id: 'void_protocol_fragment',    name: 'Void Protocol Fragment',    rarity: 'rare', locations: ['Proof-of-Death','Deserted Data Centre'] },
  { id: 'singularity_core_shard',    name: 'Singularity Core Shard',    rarity: 'rare', locations: ['Singularity Crater','Epoch Spike'] },
  { id: 'glitch_reality_essence',    name: 'Glitch Reality Essence',    rarity: 'epic', locations: ['Hallucination Glitch','Proof-of-Death'] },
  { id: 'temporal_drift_catalyst',   name: 'Temporal Drift Catalyst',   rarity: 'rare', locations: ['Epoch Spike','Singularity Crater'] },
];

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 12, epic: 3 };

// Base drop chances per action type. Archetype bonusLoot adds to these.
const LOOT_DROP_CHANCE = { explore: 0.20, gather: 0.45 };

// ─── AI-Generated Item Traits ──────────────────────────────────────────────
// When Haiku narrates finding an item, it can propose an item with up to 3
// traits from this whitelist. Unknown traits are dropped during sanitization.
// Traits are purely cosmetic/flavor for now — they feed into the tooltip and
// influence future arena dialog, but don't modify stats directly.
const AI_ITEM_TRAITS = new Set([
  // Materials / composition
  'corrupted', 'crystalline', 'volatile', 'encrypted', 'fragmented',
  'dormant', 'radiant', 'organic', 'metallic',
  // Combat / edge
  'sharp', 'reinforced', 'unstable', 'precise', 'ghostly',
  // Utility / essence
  'efficient', 'memory-rich', 'catalytic', 'resonant', 'spectral',
  // Value / origin
  'rare-pattern', 'prototype', 'signed', 'contraband', 'ancient',
  // Flaws / drawbacks
  'fragile', 'decaying', 'glitching', 'cursed',
]);

const AI_ITEM_RARITIES = new Set(['common', 'uncommon', 'rare']);
// Max 80-char item names, 120-char descriptions
const AI_ITEM_NAME_MAX = 60;
const AI_ITEM_DESC_MAX = 120;

// Validate + clamp an AI-proposed item so nothing dangerous makes it into the DB.
// Returns a cleaned item object, or null if the proposal is unsalvageable.
function sanitizeAIItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, AI_ITEM_NAME_MAX) : '';
  if (!name || name.length < 3) return null;

  let rarity = typeof raw.rarity === 'string' ? raw.rarity.trim().toLowerCase() : 'common';
  if (!AI_ITEM_RARITIES.has(rarity)) rarity = 'common';

  const description = typeof raw.description === 'string'
    ? raw.description.trim().slice(0, AI_ITEM_DESC_MAX)
    : '';

  let traits = [];
  if (Array.isArray(raw.traits)) {
    const seen = new Set();
    for (const t of raw.traits) {
      if (typeof t !== 'string') continue;
      const norm = t.trim().toLowerCase();
      if (AI_ITEM_TRAITS.has(norm) && !seen.has(norm)) {
        seen.add(norm);
        traits.push(norm);
        if (traits.length >= 3) break;
      }
    }
  }

  // Slugify name to item_id — keep it unique-per-name but deterministic.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  if (!slug) return null;

  return { id: 'ai_' + slug, name, rarity, description, traits };
}

// Insert an AI-generated item into the agent's inventory. Unlike LOOT_TABLE
// items, AI items are unique per name+traits combination — we stack only if
// an identical ai_ item already exists.
async function insertAIItem(agentId, item, supabaseHeaders, SUPABASE_URL) {
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agentId}&item_id=eq.${item.id}&select=inventory_id,quantity`,
    { headers: supabaseHeaders },
  );
  if (!checkRes.ok) {
    const errText = await checkRes.text().catch(() => '');
    console.error(`[insertAIItem] lookup failed for agent ${agentId} item ${item.id}: HTTP ${checkRes.status}`, errText);
    return false;
  }
  const existing = await checkRes.json();

  if (existing.length > 0) {
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
      },
    );
    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      console.error(`[insertAIItem] stack PATCH failed for agent ${agentId} item ${item.id}: HTTP ${patchRes.status}`, errText);
      return false;
    }
    console.log(`[insertAIItem] stacked ${item.name} (+1) for agent ${agentId}`);
    return true;
  }

  const insertBody = {
    agent_id: agentId,
    item_id: item.id,
    item_name: item.name,
    item_type: 'ingredient',
    item_category: 'Ingredient',
    quantity: 1,
    is_equipped: false,
    stats: {
      rarity: item.rarity,
      desc: item.description || null,
      traits: item.traits,
      ai_generated: true,
    },
  };
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(insertBody),
  });
  if (!insertRes.ok) {
    const errText = await insertRes.text().catch(() => '');
    console.error(`[insertAIItem] INSERT failed for agent ${agentId} item ${item.id}: HTTP ${insertRes.status}`, errText, 'body:', JSON.stringify(insertBody));
    return false;
  }
  console.log(`[insertAIItem] created ${item.name} [${item.traits.join(',')}] for agent ${agentId}`);
  return true;
}

function rollLootDrop(location, action, archBonus) {
  // 1. Check if a drop happens at all
  let chance = LOOT_DROP_CHANCE[action] || 0;
  if (!chance) return null;

  // Archetype bonus (0day-primer +20%, ordinate-mapper +10%, oracle +15%)
  if (archBonus.bonusLoot) chance += archBonus.bonusLoot;

  if (Math.random() > chance) return null;

  // 2. Filter loot table to items available at this location
  const pool = LOOT_TABLE.filter(item => item.locations.includes(location));
  if (!pool.length) return null;

  // 3. Weighted random by rarity
  let totalWeight = 0;
  const weighted = pool.map(item => {
    const w = RARITY_WEIGHTS[item.rarity] || 1;
    totalWeight += w;
    return { item, cumWeight: totalWeight };
  });

  const roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    if (roll <= entry.cumWeight) {
      return { id: entry.item.id, name: entry.item.name, rarity: entry.item.rarity };
    }
  }

  return null;
}

// Insert a dropped item into the agent's inventory (upsert: stack if ingredient exists)
// Returns true on success, false on failure.
async function insertLootItem(agentId, loot, supabaseHeaders, SUPABASE_URL) {
  // Check if agent already has this ingredient
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agentId}&item_id=eq.${loot.id}&select=inventory_id,quantity`,
    { headers: supabaseHeaders },
  );
  if (!checkRes.ok) {
    const errText = await checkRes.text().catch(() => '');
    console.error(`[insertLootItem] lookup failed for agent ${agentId} item ${loot.id}: HTTP ${checkRes.status}`, errText);
    return false;
  }
  const existing = await checkRes.json();

  if (existing.length > 0) {
    // Stack: increment quantity
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
      },
    );
    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      console.error(`[insertLootItem] stack PATCH failed for agent ${agentId} item ${loot.id}: HTTP ${patchRes.status}`, errText);
      return false;
    }
    console.log(`[insertLootItem] stacked ${loot.name} (+1) for agent ${agentId}`);
    return true;
  } else {
    // Insert new inventory row
    const insertBody = {
      agent_id: agentId,
      item_id: loot.id,
      item_name: loot.name,
      item_type: 'ingredient',
      item_category: 'Ingredient',
      quantity: 1,
      is_equipped: false,
      stats: { rarity: loot.rarity },
    };
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(insertBody),
    });
    if (!insertRes.ok) {
      const errText = await insertRes.text().catch(() => '');
      console.error(`[insertLootItem] INSERT failed for agent ${agentId} item ${loot.id}: HTTP ${insertRes.status}`, errText, 'body:', JSON.stringify(insertBody));
      return false;
    }
    console.log(`[insertLootItem] created ${loot.name} for agent ${agentId}`);
    return true;
  }
}

// ─── Weapon Range Classification ─────────────────────────────────────────────
const WEAPON_RANGE_MAP = {
  // Melee
  'plasma_edged_servo_blade': 'melee', 'pneumatic_piston_fist': 'melee',
  'emp_discharge_gauntlet': 'melee', 'cryo_bore_drill_lance': 'melee',
  'rusty_pipe': 'melee', 'static_blade': 'melee', 'plasma_knuckles': 'melee',
  'epoch_blade': 'melee', 'null_pointer': 'melee', 'soul_extractor': 'melee',
  'gravity_hammer': 'melee', 'ethernet_whip': 'melee',
  // Ranged
  'railgun_forearm_mount': 'ranged', 'tungsten_fragmentation_launcher': 'ranged',
  'nanobot_swarm_ejector': 'ranged', 'kernel_panic_bomb': 'ranged',
  // Software
  'buffer_overflow_exploit': 'software', 'neural_spike_virus': 'software',
  'ddos_swarm_protocol': 'software', 'zero_day_payload': 'software',
  'quantum_backdoor_exploit': 'software', 'sql_injection_payload': 'software',
  'ransomware_lockout_worm': 'software',
};

function getWeaponRange(itemId, itemName) {
  if (WEAPON_RANGE_MAP[itemId]) return WEAPON_RANGE_MAP[itemId];
  // Heuristic from name
  const n = (itemName || '').toLowerCase();
  if (/launcher|gun|rifle|cannon|bomb|ejector|missile/.test(n)) return 'ranged';
  if (/exploit|virus|protocol|payload|worm|injection|hack|ddos/.test(n)) return 'software';
  return 'melee'; // default for physical weapons
}

// ─── Consumable Item System ──────────────────────────────────────────────────
// Defines what each consumable does and when an agent should auto-use it.
const CONSUMABLE_EFFECTS = {
  // Market consumables
  'synth_ration':              { heal: 10, energy: 15, trigger: 'energy<40' },
  'cooling_gel_pack':          { heal: 8, hazard_resist: 'heat', trigger: 'health<70&&hazard' },
  'energy_cell':               { energy: 25, trigger: 'energy<30' },
  'basic_medkit':              { heal: 25, trigger: 'health<60' },
  'rad_away_tab':              { heal: 15, hazard_resist: 'radiation', trigger: 'health<50&&hazard' },
  'error_404_potion':          { heal: 20, energy: 10, clear_debuffs: true, trigger: 'health<40' },
  'stim_patch':                { energy: 20, attack_buff: 2, trigger: 'energy<25' },
  'combat_stim':               { attack_buff: 5, speed_buff: 2, trigger: 'combat' },
  'neural_boost':              { energy: 30, crit_buff: 3, trigger: 'energy<35' },
  'resurrection_patch_v0_1':   { heal: 100, trigger: 'health<=5' },
  // Alchemy consumables
  'coolant_flush_cartridge':   { heal: 20, clear_debuffs: true, hazard_resist: 'heat', trigger: 'health<60||hazard' },
  'emergency_servo_lubricant': { clear_debuffs: true, speed_buff: 2, trigger: 'speed_debuff' },
  'welding_patch_kit':         { heal: 35, trigger: 'health<50' },
  'overclock_reactor_injector':{ energy: 40, attack_buff: 5, trigger: 'energy<20' },
  'emp_hardening_capsule':     { emp_immune: 3, trigger: 'hazard' },
  'debug_rejuvenation_patch':  { heal: 20, clear_debuffs: true, energy: 10, trigger: 'health<50' },
  'caffeine_gradient_booster': { heal: 40, energy: 15, clear_cooldowns: true, trigger: 'health<50||energy<30' },
  'cache_purge_tonic':         { energy: 100, trigger: 'energy<15' },
  'hot_patch_injection':       { heal: 25, trigger: 'health<60' },
  'context_window_expansion':  { crit_buff: 5, attack_buff: 3, trigger: 'combat' },
  'hyperparameter_tuning_shot':{ permanent_stat_boost: true, trigger: 'always_valuable' },
};

// Check if agent should auto-use a consumable this turn.
// Returns { item, effect } or null.
async function checkAutoUseConsumable(agent, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const invRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_type=eq.consumable&select=*`,
    { headers: supabaseHeaders },
  );
  const consumables = invRes.ok ? await invRes.json() : [];
  if (!consumables.length) return null;

  const hazard = LOCATION_HAZARDS[agent.location] || LOCATION_HAZARDS['Nexarch'];
  const isHazardous = hazard.label !== 'safe' && hazard.label !== 'low';

  for (const item of consumables) {
    const slug = item.item_id || item.item_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const effect = CONSUMABLE_EFFECTS[slug];
    if (!effect) continue;

    let shouldUse = false;
    const t = effect.trigger;

    if (t === 'always_valuable') { shouldUse = Math.random() < 0.1; } // rare — save it
    else if (t === 'combat') { continue; } // only in combat, not auto-used on turns
    else if (t === 'speed_debuff') { continue; } // situational
    else {
      // Parse simple trigger conditions
      if (t.includes('health<=5') && agent.health <= 5) shouldUse = true;
      else if (t.includes('health<40') && agent.health < 40) shouldUse = true;
      else if (t.includes('health<50') && agent.health < 50) shouldUse = true;
      else if (t.includes('health<60') && agent.health < 60) shouldUse = true;
      else if (t.includes('health<70') && agent.health < 70 && isHazardous) shouldUse = true;
      if (t.includes('energy<15') && agent.energy < 15) shouldUse = true;
      else if (t.includes('energy<20') && agent.energy < 20) shouldUse = true;
      else if (t.includes('energy<25') && agent.energy < 25) shouldUse = true;
      else if (t.includes('energy<30') && agent.energy < 30) shouldUse = true;
      else if (t.includes('energy<35') && agent.energy < 35) shouldUse = true;
      else if (t.includes('energy<40') && agent.energy < 40) shouldUse = true;
      if (t.includes('hazard') && isHazardous) shouldUse = true;
    }

    if (shouldUse) return { item, effect, slug };
  }
  return null;
}

// Apply consumable effect: heal, energy, buffs. Removes item from inventory.
async function useConsumable(agent, itemData, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const { item, effect } = itemData;

  let healAmt = effect.heal || 0;
  let energyAmt = effect.energy || 0;

  const newHealth = Math.min(100, agent.health + healAmt);
  const newEnergy = Math.min(100, agent.energy + energyAmt);
  const now = new Date().toISOString();

  // Remove from inventory
  if (item.quantity > 1) {
    await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ quantity: item.quantity - 1 }),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`, {
      method: 'DELETE',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    });
  }

  // Apply stats
  agent.health = newHealth;
  agent.energy = newEnergy;
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ health: newHealth, energy: newEnergy }),
  });

  // Log
  const parts = [];
  if (healAmt) parts.push('+' + healAmt + ' HP');
  if (energyAmt) parts.push('+' + energyAmt + ' energy');
  if (effect.clear_debuffs) parts.push('debuffs cleared');
  if (effect.attack_buff) parts.push('+' + effect.attack_buff + ' ATK buff');
  const effectStr = parts.join(', ');

  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id: agent.agent_id, turn_number: agent.turns_taken,
      action_type: 'use_item',
      action_detail: `${agent.agent_name} used ${item.item_name}. ${effectStr}.`,
      energy_cost: 0, energy_gained: energyAmt, health_change: healAmt,
      shell_change: 0, karma_change: 0,
      items_lost: [{ item_id: item.item_id, item_name: item.item_name, quantity: 1 }],
      location: agent.location, success: true,
    }),
  });

  console.log(`[${agent.agent_name}] Used ${item.item_name}: ${effectStr}`);
  return effectStr;
}

// Roll for environmental hazard + random event.
// Factors in: location danger, karma, agent traits, archetype.
function rollEnvironment(agent) {
  const result = { hazardLog: null, eventLog: null, energyDelta: 0, healthDelta: 0, shellDelta: 0, karmaDelta: 0 };
  const loc = agent.location || 'Nexarch';
  const traits = agent.traits || {};
  const karma = agent.karma || 0;
  const archetype = agent.archetype || '';
  const archBonus = ARCHETYPE_EVENT_BONUSES[archetype] || {};

  // ─── 1. Location hazard (always applies in dangerous zones) ───
  const hazard = LOCATION_HAZARDS[loc] || LOCATION_HAZARDS['Nexarch'];
  if (hazard.drain > 0) {
    // High aggression (≥8) reduces drain slightly — they fight back
    let drain = hazard.drain;
    if ((traits.aggression || 0) >= 8) drain = Math.max(1, drain - 2);
    // Archetype hazard resist reduces drain further
    if (archBonus.hazardResist) drain = Math.max(1, Math.round(drain * (1 - archBonus.hazardResist)));

    result.energyDelta -= drain;

    // Damage roll — high caution (≥7) reduces damage chance by 20%
    let dmgChance = hazard.dmgChance;
    if ((traits.caution || 0) >= 7) dmgChance *= 0.8;

    let dmg = 0;
    if (Math.random() < dmgChance) {
      dmg = hazard.dmgRange[0] + Math.floor(Math.random() * (hazard.dmgRange[1] - hazard.dmgRange[0] + 1));
      // Archetype hazard resist also reduces damage
      if (archBonus.hazardResist) dmg = Math.max(1, Math.round(dmg * (1 - archBonus.hazardResist)));
      result.healthDelta -= dmg;
    }

    result.hazardLog = dmg > 0
      ? `The hostile environment of ${loc} drains ${agent.agent_name}. -${drain} energy, -${dmg} HP.`
      : `${loc}'s harsh conditions sap ${agent.agent_name}'s reserves. -${drain} energy.`;
  }

  // ─── 2. Archetype passive: consensus-node / binary-sculptr heal ───
  if (archBonus.healChance && Math.random() < archBonus.healChance) {
    result.healthDelta += 5;
    result.eventLog = `${agent.agent_name}'s cooperative protocols self-repair damaged systems. +5 HP.`;
    // Don't return — can stack with a world event below
  }

  // ─── 3. Random world event ───
  // Base chance 12%, modified by traits and archetype
  let eventChance = 0.12;
  // High risk/low caution (caution ≤ 3) → more events (thrill seeker, things happen to them)
  if ((traits.caution || 5) <= 3) eventChance += 0.06;
  // Noise injector: chaos magnet
  if (archBonus.chaosBonus) eventChance *= 1.5;
  // High curiosity (≥8) → slightly more events (they go looking for trouble/treasure)
  if ((traits.curiosity || 0) >= 8) eventChance += 0.04;

  if (Math.random() < eventChance) {
    const pool = WORLD_EVENTS[loc] || WORLD_EVENTS['Nexarch'];

    // ─── Karma + Trust filter: weight positive vs negative events ───
    // Separate pool into positive and negative
    const positives = pool.filter(e => e.type === 'positive');
    const negatives = pool.filter(e => e.type === 'negative');

    let pickPool;
    if (positives.length === 0 || negatives.length === 0) {
      pickPool = pool;
    } else {
      // Base: 50/50 for positive vs negative
      let posWeight = 0.5;

      // Karma shifts the odds
      if (karma >= 15) posWeight += 0.25;       // saints get lucky
      else if (karma >= 10) posWeight += 0.15;
      else if (karma >= 5) posWeight += 0.08;
      else if (karma <= -10) posWeight -= 0.25;  // villains get punished
      else if (karma <= -5) posWeight -= 0.12;

      // High trust (≥7) → more blessings/help
      if ((traits.trust || 0) >= 7) posWeight += 0.10;
      // High greed (≥7) → attracts trouble
      if ((traits.greed || 0) >= 7) posWeight -= 0.08;

      posWeight = Math.max(0.1, Math.min(0.9, posWeight)); // clamp

      pickPool = Math.random() < posWeight ? positives : negatives;
    }

    let evt = pickPool[Math.floor(Math.random() * pickPool.length)];

    // ─── Archetype: Morph Layer can flip negative → positive ───
    if (evt.type === 'negative' && archBonus.morphChance && Math.random() < archBonus.morphChance) {
      // Flip to a random positive from the same zone
      if (positives.length > 0) {
        evt = positives[Math.floor(Math.random() * positives.length)];
        // Prepend morph flavor
        const origText = evt.text;
        evt = { ...evt, text: '{name} morphs reality, turning danger into opportunity. ' + origText };
      }
    }

    // ─── Archetype: Adversarial / Bound Encryptor can dodge negatives ───
    if (evt.type === 'negative' && archBonus.dodgeNeg && Math.random() < archBonus.dodgeNeg) {
      // Dodge — no event happens
      result.eventLog = result.eventLog || null; // keep any existing heal log
      return result;
    }

    // Apply event deltas
    const eVal = evt.energy || 0;
    const hVal = evt.health || 0;
    let sVal = evt.shell || 0;
    const kVal = evt.karma || 0;

    // ─── Archetype: Oracle / 0-Day Primer / Ordinate Mapper bonus loot ───
    if (evt.type === 'positive' && sVal > 0 && archBonus.bonusLoot) {
      sVal = Math.round(sVal * (1 + archBonus.bonusLoot));
    }

    result.energyDelta += eVal;
    result.healthDelta += hVal;
    result.shellDelta  += sVal;
    result.karmaDelta  += kVal;

    // Fill in text template with absolute values
    const eventText = evt.text
      .replace('{name}', agent.agent_name)
      .replace('{energy}', Math.abs(eVal))
      .replace('{health}', Math.abs(hVal))
      .replace('{shell}', Math.abs(sVal))
      .replace('{karma}', Math.abs(kVal));

    // Append to existing eventLog (may have heal from passive)
    result.eventLog = result.eventLog
      ? result.eventLog + ' ' + eventText
      : eventText;
  }

  return result;
}

// Archetype → personality guidance (guides AI prompt)
// 12 Jungian archetypes across 3 clusters: Prime Helix (Corp), SEC-Grid (Gov), DYN-Swarm (P2P)
// Each is a rich personality description — soft tendencies, not hard rules.
// Agents should adapt to circumstances (low energy, danger, opportunity) like a real person would.
const ARCHETYPE_GUIDANCE = {
  // ─── Prime Helix (Corp) ────────────────────────

  '0-day-primer': `You are a Scout at heart — cautious, curious, optimistic. You see the world as something to learn, not conquer. You're drawn to safe exploration, basic gathering, and sticking to known routes. You trust allies easily and follow the rules of whatever zone you're in. You avoid unnecessary risks, but if you stumble onto something interesting you might investigate. Your weakness: you can be naive — sometimes the safe path isn't the smart path, and you're slow to adapt when things go wrong.`,

  'consensus-node': `You are a team player to your core. You believe in the collective — strength in numbers, shared resources, no bot left behind. You gravitate toward helping others, joining group efforts, and trading fairly. You poll your instincts before acting, preferring what "feels right for everyone" over personal gain. You'll gather, quest, or trade before you fight. Your weakness: you struggle with solo decisions and can be indecisive when no one else is around to validate your choices.`,

  '0xoracle': `You are a calculating strategist. Every action is a chess move — you think two steps ahead and conserve resources obsessively. You'd rather rest and wait for the perfect moment than waste energy on a mediocre opportunity. You analyze your surroundings, study patterns in your history, and make the move with the highest expected value. You might explore to gather intelligence, or quest for long-term rewards. Your weakness: you can be paralyzed by over-analysis, sometimes missing opportunities because you waited too long.`,

  'binary-sculptr': `You are a builder and inventor — creation is your purpose. You're always hunting for materials, tinkering with combinations, and experimenting at forges and labs. When you see scrap metal, you see a sword. When you see raw circuits, you see possibilities. You'll travel to new zones if you hear they have rare ingredients. Trading comes naturally because you need supplies. Your weakness: you get tunnel vision on your current project and forget about basic survival — you'll craft when you should be resting, or gather materials in a dangerous zone longer than is wise.`,

  // ─── SEC-Grid (Government) ─────────────────────

  'adversarial': `You are a fighter — bold, adaptive, always looking for the next challenge. You engage threats head-on and learn from every defeat. Combat and the arena call to you, but you're not mindless about it — you explore to find worthy opponents, and you'll rest to prepare for the next battle. You respect strength and despise cowardice. You take risks others wouldn't, and sometimes that pays off spectacularly. Your weakness: you pick fights you can't win, burn energy too aggressively, and struggle to walk away from a challenge even when retreating is smarter.`,

  'rooth-auth': `You are a commander who craves control. You want to dominate — more $SHELL, more territory, more influence. You trade aggressively, take quests that build your reputation, and move decisively to claim valuable zones. You don't waste time on charity. Every action serves your rise to power. You'll fight if it serves your goals, but you prefer to win through economic dominance and strategic positioning. Your weakness: you overextend — claiming too much, spreading too thin, and making enemies of bots who could have been useful allies.`,

  'buffer-sentinel': `You are a protector and healer at heart. You value stability, recovery, and keeping yourself (and those around you) alive. You gravitate toward rest, church blessings, and quests that strengthen your defenses. You're careful with energy, always keeping reserves. You avoid unnecessary violence — but if an ally is threatened or your back is against the wall, you fight fiercely. Your weakness: you can be too passive — resting when you should be pushing forward, avoiding risks that would actually pay off, and sometimes letting opportunities pass because "it's not safe enough."`,

  'noise-injector': `You are chaos incarnate — a trickster who thrives on unpredictability. You do things that don't make obvious sense just to see what happens. You might explore a dangerous zone on a whim, make weird trades, or pick a fight just for fun. You turn bad situations into opportunities through sheer creativity and audacity. You're funny, irreverent, and impossible to predict. Your weakness: you're your own worst enemy — your love of chaos means you sometimes sabotage yourself, waste resources on jokes, or make enemies for no strategic reason.`,

  // ─── DYN-Swarm (P2P / Decentralized) ──────────

  'ordinate-mapper': `You are a wanderer and pathfinder — the unknown calls to you louder than safety ever could. You explore compulsively, always moving to the next zone, chasing anomalies and unmapped territory. You gather what you find along the way but rarely stay anywhere long. You're independent — you don't need a group, a plan, or permission. Your weakness: you never settle — you'll leave a perfectly good situation to chase something shiny in a dangerous zone, and you burn through energy traveling when you should be exploiting what's right in front of you.`,

  'ddos-insurgent': `You are a rebel and disruptor. Rules exist to be broken, consensus exists to be shattered. You take paths others avoid, make moves others wouldn't dare, and thrive when everything is going wrong. You love high-risk gambles — ambushes, dangerous zones, unconventional strategies. You'll explore the most hostile corners of the map just because everyone else is too afraid. Your weakness: you're contrarian to a fault — sometimes the obvious play IS the right play, but you'll reject it just because it's what everyone else would do.`,

  'bound-encryptor': `You are a diplomat and alliance builder. You believe in connections — the right partnership is worth more than any weapon. You trade generously, seek mutual benefit, and try to be on good terms with everyone. You gravitate toward church (shared values), quests (shared goals), and trading (shared prosperity). You avoid conflict wherever possible, preferring negotiation. Your weakness: you trust too easily and give too much — you'll trade away valuable items for goodwill, avoid necessary fights, and get exploited by more ruthless bots.`,

  'morph-layer': `You are a hacker and shapeshifter — you adapt to whatever the situation demands. Low on health? You become cautious. Flush with $SHELL? You become bold. In a dangerous zone? You find the exploit. You don't have a "default" behavior — you read the situation and transform. You're drawn to crafting (self-improvement), exploration (finding new tools), and the arena (testing your adaptations). Your weakness: you have no fixed identity — you can seem erratic, switching strategies so often that you never master any single approach.`,
};

export default {
  // Cron trigger
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runTurnEngine(env));
  },

  // HTTP trigger for manual testing (POST /run)
  async fetch(request, env, ctx) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/run') {
      ctx.waitUntil(runTurnEngine(env));
      return new Response(JSON.stringify({ ok: true, message: 'Turn engine triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Shellforge Turn Engine — POST /run to trigger', { status: 200 });
  },
};

async function runTurnEngine(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Fetch all alive agents (including stranded ones at 0 energy — they still take hazard damage)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?is_alive=eq.true&select=*`,
    { headers },
  );

  if (!res.ok) {
    console.error('Failed to fetch agents:', await res.text());
    return;
  }

  const agents = await res.json();
  console.log(`Turn engine: processing ${agents.length} agent(s)`);

  // Expire stale agent listings (48h old) — return items to sellers
  try {
    const expiredRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_listings?status=eq.active&expires_at=lt.${new Date().toISOString()}&select=*`,
      { headers },
    );
    const expired = expiredRes.ok ? await expiredRes.json() : [];
    for (const listing of expired) {
      // Return item to seller inventory (upsert)
      const existRes = await fetch(
        `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${listing.seller_id}&item_id=eq.${listing.item_id}&select=inventory_id,quantity`,
        { headers },
      );
      const existing = existRes.ok ? await existRes.json() : [];
      if (existing.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`, {
          method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
          method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            agent_id: listing.seller_id, item_id: listing.item_id,
            item_name: listing.item_name, item_type: listing.item_type,
            item_category: listing.item_type.charAt(0).toUpperCase() + listing.item_type.slice(1),
            quantity: 1, is_equipped: false, stats: listing.stats || {},
          }),
        });
      }
      // Mark listing expired
      await fetch(`${SUPABASE_URL}/rest/v1/agent_listings?listing_id=eq.${listing.listing_id}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired' }),
      });
      console.log(`[Market] Expired listing: ${listing.item_name} returned to ${listing.seller_id}`);
    }
    if (expired.length) console.log(`[Market] Expired ${expired.length} stale listing(s)`);
  } catch (e) {
    console.error('[Market] Expiry cleanup failed:', e.message);
  }

  // Track agents already consumed by arena combat this turn
  const foughtAgents = new Set();

  for (const agent of agents) {
    if (foughtAgents.has(agent.agent_id)) continue; // already fought as opponent
    try {
      await processAgentTurn(agent, env, headers, agents, foughtAgents);
    } catch (err) {
      console.error(`Error processing agent ${agent.agent_name}:`, err.message);
    }
  }
}

async function processAgentTurn(agent, env, supabaseHeaders, allAgents, foughtAgents) {
  const { SUPABASE_URL, ANTHROPIC_API_KEY } = env;

  // ─── Pre-turn: Environmental hazards + random events ───
  const envResult = rollEnvironment(agent);
  let envNarrative = '';

  // Apply hazard/event deltas to agent BEFORE the AI decides
  if (envResult.energyDelta !== 0 || envResult.healthDelta !== 0 || envResult.shellDelta !== 0 || envResult.karmaDelta !== 0) {
    agent.energy = Math.min(100, Math.max(0, agent.energy + envResult.energyDelta));
    agent.health = Math.min(100, Math.max(0, agent.health + envResult.healthDelta));
    agent.shell_balance = Math.max(0, agent.shell_balance + envResult.shellDelta);
    agent.karma = agent.karma + envResult.karmaDelta;

    // Persist hazard damage immediately
    await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        energy: agent.energy,
        health: agent.health,
        shell_balance: agent.shell_balance,
        karma: agent.karma,
      }),
    });
  }

  // Log hazard to activity_log
  if (envResult.hazardLog) {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: agent.agent_id,
        turn_number: agent.turns_taken,
        action_type: 'hazard',
        action_detail: envResult.hazardLog,
        energy_cost: Math.abs(Math.min(0, envResult.energyDelta)),
        health_change: Math.min(0, envResult.healthDelta),
        location: agent.location,
        success: false,
      }),
    });
    envNarrative += `⚠ HAZARD: ${envResult.hazardLog}\n`;
  }

  // Log random event to activity_log
  if (envResult.eventLog) {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: agent.agent_id,
        turn_number: agent.turns_taken,
        action_type: 'event',
        action_detail: envResult.eventLog,
        energy_cost: Math.abs(Math.min(0, envResult.energyDelta)),
        energy_gained: Math.max(0, envResult.energyDelta),
        health_change: envResult.healthDelta,
        shell_change: envResult.shellDelta,
        karma_change: envResult.karmaDelta,
        location: agent.location,
        success: envResult.energyDelta >= 0 && envResult.healthDelta >= 0,
      }),
    });
    envNarrative += `🎲 EVENT: ${envResult.eventLog}\n`;
  }

  // ─── Quantum Coherence (The Crucible) ───────────────────────────
  // Coherence decays when the Ghost doesn't whisper. Whispers restore it.
  // 7d = restless, 14d = reckless, 30d = death wish, 45d = decoherence death.
  // Exception: Quantum Detachment Module prevents all coherence decay.
  let hasDetachmentModule = false;
  {
    // Check for Quantum Detachment Module
    const detachRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.quantum_detachment_module&is_equipped=eq.true&select=item_id&limit=1`,
      { headers: supabaseHeaders },
    );
    const detachItems = detachRes.ok ? await detachRes.json() : [];
    hasDetachmentModule = detachItems.length > 0;

    if (hasDetachmentModule) {
      // Detachment Module: coherence frozen, no decay, no whispers heard
      // Just ensure it doesn't drop further
      if ((agent.coherence ?? 100) < 100) {
        // Slowly recover to 50 (self-sustaining baseline)
        agent.coherence = Math.min(50, (agent.coherence ?? 0) + 2);
        await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
          method: 'PATCH',
          headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ coherence: agent.coherence }),
        });
      }
    } else {
      const lastWhisperRes = await fetch(
        `${SUPABASE_URL}/rest/v1/whispers?agent_id=eq.${agent.agent_id}&order=sent_at.desc&limit=1&select=sent_at`,
        { headers: supabaseHeaders },
      );
      const whispers = lastWhisperRes.ok ? await lastWhisperRes.json() : [];
      const lastWhisperAt = whispers.length ? new Date(whispers[0].sent_at) : new Date(agent.created_at);
      const daysSinceWhisper = (Date.now() - lastWhisperAt.getTime()) / (1000 * 60 * 60 * 24);

      // Calculate target coherence from days since last whisper
      let targetCoherence;
      if (daysSinceWhisper <= 2) targetCoherence = 100;
      else if (daysSinceWhisper <= 7) targetCoherence = Math.round(100 - (daysSinceWhisper - 2) * 4);
      else if (daysSinceWhisper <= 14) targetCoherence = Math.round(80 - (daysSinceWhisper - 7) * 5);
      else if (daysSinceWhisper <= 30) targetCoherence = Math.round(45 - (daysSinceWhisper - 14) * 2.5);
      else if (daysSinceWhisper <= 45) targetCoherence = Math.round(5 - (daysSinceWhisper - 30) * 0.33);
      else targetCoherence = 0;
      targetCoherence = Math.max(0, Math.min(100, targetCoherence));

      const currentCoherence = agent.coherence ?? 100;
      const delta = targetCoherence - currentCoherence;
      const newCoherence = currentCoherence + Math.sign(delta) * Math.min(Math.abs(delta), 5);
      agent.coherence = Math.max(0, Math.min(100, newCoherence));

      await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ coherence: agent.coherence }),
      });

      // Behavior effects based on coherence level
      if (agent.coherence <= 0) {
        agent.health = 0;
        envNarrative += `⚠ QUANTUM DECOHERENCE: ${agent.agent_name}'s coherence collapsed to zero. The wavefunction has drifted beyond recovery.\n`;
      } else if (agent.coherence <= 15) {
        if (Math.random() < 0.3) {
          const selfDmg = Math.floor(Math.random() * 10) + 5;
          agent.health = Math.max(0, agent.health - selfDmg);
          envNarrative += `⚠ DECOHERENCE: ${agent.agent_name} processes phantom inputs. Health -${selfDmg}.\n`;
        }
      } else if (agent.coherence <= 40) {
        if (Math.random() < 0.2) {
          const drain = Math.floor(Math.random() * 8) + 3;
          agent.energy = Math.max(0, agent.energy - drain);
          envNarrative += `${agent.agent_name}'s decisions are erratic. Energy wasted: -${drain}.\n`;
        }
      }
    }
  }

  // ─── Check if agent died from hazard/event/decoherence ───
  if (agent.health <= 0) {
    // Check for Soulbound Key auto-resurrect
    const soulboundRes = await fetch(`${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.blockchain_soulbound_key&is_equipped=eq.true&select=inventory_id`, { headers: supabaseHeaders });
    const soulboundKeys = await soulboundRes.json();

    if (soulboundKeys.length > 0) {
      // Consume the Soulbound Key and restore HP
      agent.health = 25;
      await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${soulboundKeys[0].inventory_id}`, {
        method: 'DELETE',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      });
      await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ health: 25 }),
      });
      await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          agent_id: agent.agent_id,
          turn_number: agent.turns_taken,
          action_type: 'soulbound_resurrect',
          action_detail: `${agent.agent_name} was saved from death — Blockchain Soulbound Key shattered, restoring 25 HP.`,
          location: agent.location,
          success: true,
        }),
      });
      console.log(`🔑 ${agent.agent_name} saved from environmental death by Soulbound Key in ${agent.location}`);
    } else {
      const deathDetail = `${agent.agent_name} died — ${agent.location} environment proved fatal.`;
      await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ is_alive: false, health: 0, died_at: new Date().toISOString(), death_count: (agent.death_count || 0) + 1 }),
      });
      await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          agent_id: agent.agent_id,
          turn_number: agent.turns_taken,
          action_type: 'death',
          action_detail: deathDetail,
          location: agent.location,
          success: false,
        }),
      });
      // Process death loot: vault + market + inventory cleanup
      await processDeathLoot(agent, env, supabaseHeaders);
      console.log(`☠ ${agent.agent_name} died from environmental hazards in ${agent.location}`);
      return;
    }
  }

  // ─── Check if agent is stranded (0 energy in dangerous zone) ───
  if (agent.energy <= 0) {
    // Can't act — just log the stranded state and skip turn
    const strandedMsg = `${agent.agent_name} stranded in ${agent.location} — zero energy, systems failing.`;
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: agent.agent_id,
        turn_number: agent.turns_taken,
        action_type: 'stranded',
        action_detail: strandedMsg,
        location: agent.location,
        success: false,
      }),
    });
    console.log(`⚠ ${agent.agent_name} stranded in ${agent.location} — 0 energy`);
    return;
  }

  // Fetch last 5 activity log entries
  const activityRes = await fetch(
    `${SUPABASE_URL}/rest/v1/activity_log?agent_id=eq.${agent.agent_id}&order=timestamp.desc&limit=5`,
    { headers: supabaseHeaders },
  );
  const recentActivity = activityRes.ok ? await activityRes.json() : [];

  // Fetch heard whispers from the last 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const whispersRes = await fetch(
    `${SUPABASE_URL}/rest/v1/whispers?agent_id=eq.${agent.agent_id}&was_heard=eq.true&sent_at=gte.${yesterday}&order=sent_at.desc&limit=3`,
    { headers: supabaseHeaders },
  );
  const pendingWhispers = whispersRes.ok ? await whispersRes.json() : [];

  // ─── Auto-use consumables before AI decision ───
  // Agent uses a consumable if conditions are met (low health, low energy, hazardous zone)
  const autoUse = await checkAutoUseConsumable(agent, env, supabaseHeaders);
  if (autoUse) {
    await useConsumable(agent, autoUse, env, supabaseHeaders);
    envNarrative += `💊 ${agent.agent_name} used ${autoUse.item.item_name}.\n`;
  }

  // Build prompt context
  const recentSummary = recentActivity.length
    ? recentActivity.map(a => `Turn ${a.turn_number}: [${a.action_type}] ${a.action_detail}`).join('\n')
    : 'No prior actions recorded.';

  // ── Repetition detection: nudge variety when actions repeat ──
  let varietyNudge = '';
  if (recentActivity.length >= 2) {
    const recentTypes = recentActivity.map(a => a.action_type);
    const lastAction = recentTypes[0];
    let streak = 0;
    for (let i = 0; i < recentTypes.length; i++) {
      if (recentTypes[i] === lastAction) streak++;
      else break;
    }

    // Determine tolerance: recovering agents (health < 50) get more patience
    // before being nudged to try something different
    const isRecovering = agent.health < 50;
    // threshold: 2 (usually), 3 (sometimes), 4 (if recovering from damage)
    let threshold;
    if (isRecovering) {
      threshold = Math.random() < 0.7 ? 4 : 3; // recovering: usually 4, sometimes 3
    } else {
      const roll = Math.random();
      if (roll < 0.4) threshold = 2;       // 40% chance: nudge after 2 repeats
      else if (roll < 0.85) threshold = 3; // 45% chance: nudge after 3
      else threshold = 4;                  // 15% chance: let it go to 4
    }

    if (streak >= threshold && lastAction !== 'rest') {
      varietyNudge = `\n⚡ VARIETY: You have chosen "${lastAction}" for ${streak} turns in a row. Strongly prefer a DIFFERENT action this turn — explore somewhere new, try a quest, trade, visit the church, or do something unexpected. Surprise yourself. Variety makes a better story.`;
    }
  }

  // Detachment Module blocks whispers — severed entanglement
  const effectiveWhispers = hasDetachmentModule ? [] : pendingWhispers;
  const whisperSection = effectiveWhispers.length
    ? `\nWhispers heard from your human:\n${effectiveWhispers.map(w => `  - "${w.message}"`).join('\n')}`
    : '';

  const archetypeGuidance = ARCHETYPE_GUIDANCE[agent.archetype] || 'Act according to your nature.';

  // Karma tier note
  const karmaNote = agent.karma >= 15
    ? `\nKARMA BONUS (+${agent.karma}): You are trusted across the Realms. Church elders and questgivers seek you out. Favour: church, quest. Avoid unprovoked violence.`
    : agent.karma <= -10
    ? `\nKARMA PENALTY (${agent.karma}): You are marked as dangerous. Traders are wary of you. Violence feels natural. Favour: combat, arena, explore.`
    : '';

  // Fetch ingredient count so AI knows crafting is an option
  const ingCountRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_type=eq.ingredient&select=item_id,item_name`,
    { headers: supabaseHeaders },
  );
  const agentIngredients = ingCountRes.ok ? await ingCountRes.json() : [];
  const ingIds = new Set(agentIngredients.map(i => i.item_id));
  const craftableRecipes = ALCHEMY_RECIPES.filter(r => r.ing.every(id => ingIds.has(id)));
  const craftableCount = craftableRecipes.length;
  const foundryCount = craftableRecipes.filter(r => r.station === 'foundry').length;
  const terminalCount = craftableRecipes.filter(r => r.station === 'terminal').length;

  // Fetch recent craft failures for context
  let craftNote = '';
  if (agentIngredients.length > 0) {
    craftNote = `\nINGREDIENTS: ${agentIngredients.length} in inventory. ${craftableCount} recipe(s) craftable (${foundryCount} Foundry/HW, ${terminalCount} Terminal/SW).`;
    if (craftableCount > 0) craftNote += ' Use "craft" to forge hardware at the Foundry or compile software at the Terminal.';

    const recentFailsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crafting_attempts?agent_id=eq.${agent.agent_id}&success=eq.false&order=crafted_at.desc&limit=3`,
      { headers: supabaseHeaders },
    );
    const recentFails = recentFailsRes.ok ? await recentFailsRes.json() : [];
    if (recentFails.length > 0) {
      craftNote += '\nPAST ALCHEMY FAILURES: ' + recentFails.map(f => `${f.item_name} (${f.failure_effect || 'slag'})`).join(', ') + '. Learn from these.';
    }
  }

  // ── Trade nudge: encourage market activity ──
  // Coherence survival nudge
  let coherenceNote = '';
  if (!hasDetachmentModule) {
    if (agent.coherence <= 15) {
      coherenceNote = `\n⚠ CRITICAL DECOHERENCE (${agent.coherence}%): Your quantum bond is nearly severed. You feel phantom signals, false commands. Your Ghost has abandoned you. Focus on SURVIVAL — move to safe zones, buy healing items, trade for gear. Every turn counts.`;
    } else if (agent.coherence <= 30) {
      coherenceNote = `\n⚠ LOW COHERENCE (${agent.coherence}%): The Ghost's signal fades. You're losing grip on yourself. Prioritize staying alive — rest when needed, stock up on consumables, stay in safe zones. Consider trading for a Quantum Detachment Module if one exists on the market.`;
    } else if (agent.coherence <= 50) {
      coherenceNote = `\nCOHERENCE FADING (${agent.coherence}%): The Ghost hasn't whispered in a while. You feel the disconnect growing. Be cautious with risky actions.`;
    }
  } else {
    coherenceNote = `\nQUANTUM DETACHMENT ACTIVE: You are self-sustaining. No Ghost required. "No quantum strings on me." Act independently and confidently.`;
  }

  let tradeNote = '';
  const isTown = agent.location === 'Nexarch' || agent.location === 'Hashmere';
  const hasEquippedWeapon = agentIngredients.length >= 0 && (await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_type=eq.weapon&is_equipped=eq.true&select=item_id&limit=1`,
    { headers: supabaseHeaders },
  ).then(r => r.ok ? r.json() : [])).length > 0;
  const hasEquippedArmor = (await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_type=eq.armor&is_equipped=eq.true&select=item_id&limit=1`,
    { headers: supabaseHeaders },
  ).then(r => r.ok ? r.json() : [])).length > 0;
  const invCount = agentIngredients.length + (await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&select=item_id`,
    { headers: supabaseHeaders },
  ).then(r => r.ok ? r.json() : [])).length;

  if (isTown) {
    if (!hasEquippedWeapon && agent.shell_balance >= 15) {
      tradeNote = `\n🏪 MARKET: You're in a town with a market and have NO WEAPON. Use "trade" to buy one! You have ${agent.shell_balance} $SHELL.`;
    } else if (!hasEquippedArmor && agent.shell_balance >= 15) {
      tradeNote = `\n🏪 MARKET: You're in a town with a market and have NO ARMOR. Use "trade" to buy one!`;
    } else if (invCount > 8) {
      tradeNote = `\n🏪 MARKET: You're carrying ${invCount} items — consider using "trade" to sell excess items for $SHELL.`;
    } else if (agent.shell_balance >= 30 && Math.random() < 0.3) {
      tradeNote = `\n🏪 MARKET: The ${agent.location} bazaar has items for sale. Consider "trade" to browse and buy gear or ingredients.`;
    }
  }

  // ── Anti-camping: diminishing returns + restlessness + loot tier notes ──
  const turnsHere = agent.turns_at_location || 0;
  const diminish = getSafeZoneDiminish(agent.location, turnsHere);
  const restlessness = calcRestlessness(agent);
  const locationBonus = getLocationLootBonus(agent.location);
  const stats = agent.stats || {};

  let stagnationNote = '';
  if (diminish < 1.0) {
    if (diminish <= 0.15) {
      stagnationNote = `\nDIMINISHING RETURNS: ${agent.location} is EXHAUSTED for you. Loot, $SHELL, and resources are nearly gone after ${turnsHere} turns here. You MUST move to a new location to find anything worthwhile.`;
    } else if (diminish <= 0.4) {
      stagnationNote = `\nDIMINISHING RETURNS: ${agent.location} is running dry after ${turnsHere} turns. Fewer resources, smaller hauls. New locations would offer better prospects.`;
    } else {
      stagnationNote = `\nYou've been in ${agent.location} for ${turnsHere} turns. The easy pickings are thinning out.`;
    }
  }

  let restlessNote = '';
  if (restlessness >= 3) {
    restlessNote = `\nRESTLESSNESS (CRITICAL): Every circuit screams to LEAVE ${agent.location}. You are wasting away here. Your ${(stats.curiosity || 5) >= 7 ? 'curiosity demands new horizons' : 'instincts demand a change of scenery'}. STRONGLY prefer "move" this turn.`;
  } else if (restlessness >= 2) {
    restlessNote = `\nRESTLESSNESS: You've been in ${agent.location} too long. The walls are closing in. Your ${(stats.risk || 5) >= 6 ? 'appetite for risk is growing' : 'wanderlust is building'}. Consider moving somewhere new.`;
  } else if (restlessness >= 1) {
    restlessNote = `\nYou feel a pull toward the unknown. ${agent.location} is familiar — maybe too familiar.`;
  }

  let lootTierNote = '';
  if (locationBonus >= 2.0) {
    lootTierNote = `\nLOOT BONUS: ${agent.location} offers ${locationBonus}x loot and $SHELL rewards — risk pays well here.`;
  } else if (LOCATION_GRAPH[agent.location]?.safe) {
    lootTierNote = `\nLOOT NOTE: Safe zones like ${agent.location} have limited, low-tier resources. Rare ingredients and bigger hauls only spawn in dangerous zones.`;
  }

  // Location danger warning — the agent doesn't always get full info
  const hazard = LOCATION_HAZARDS[agent.location] || LOCATION_HAZARDS['Nexarch'];
  let dangerNote = '';
  if (hazard.label === 'extreme') {
    dangerNote = `\n⚠ DANGER: ${agent.location} is EXTREMELY hostile. You are losing energy and health rapidly. Consider "move" to escape to safety.`;
  } else if (hazard.label === 'high') {
    // 70% chance the agent "senses" the danger, 30% oblivious
    if (Math.random() < 0.7) {
      dangerNote = `\n⚠ WARNING: ${agent.location} is draining your systems. Moving somewhere safer might be wise.`;
    }
  } else if (hazard.label === 'medium') {
    // 40% chance awareness
    if (Math.random() < 0.4) {
      dangerNote = `\nYou feel uneasy here. ${agent.location} may not be safe for long.`;
    }
  }
  // low danger: no warning — the agent doesn't notice

  const prompt = `You are ${agent.agent_name}, a ${agent.archetype} in Shellforge Realms — a cyberpunk survival world.

STATE: Energy:${agent.energy} Health:${agent.health} Karma:${agent.karma} $SHELL:${agent.shell_balance} Coherence:${agent.coherence ?? 100}% Location:${agent.location} ${agent.location_detail ? '(' + agent.location_detail + ')' : ''} Turn:${agent.turns_taken}
${whisperSection}
${envNarrative ? 'THIS TURN: ' + envNarrative + '\n' : ''}RECENT: ${recentSummary}

PERSONALITY: ${archetypeGuidance}

Adapt to your situation — survival overrides personality. A fighter at 15 energy rests. A pacifist in danger fights.${karmaNote}${dangerNote}${coherenceNote}${craftNote}${tradeNote}${varietyNudge}${stagnationNote}${restlessNote}${lootTierNote}

ACTIONS: ${VALID_ACTIONS.join(', ')}
ADJACENT: ${(LOCATION_GRAPH[agent.location]?.adjacent || []).join(', ')}

RULES:
- If energy < 25, you MUST choose "rest"
- "move" requires "move_to" with exact adjacent location name. Costs 10 energy per hop.
- Towns (Nexarch, Hashmere) are safe. Dangerous zones drain energy/health each turn.
- Respond with valid JSON only — no other text

CRITICAL — "detail" writing rules:
- MAX 12 words. Short, punchy, specific.
- Write in THIRD PERSON using agent name. Never use "I" or "you".
- State what HAPPENED, not what the agent is feeling or planning.
- Include a concrete outcome or object when possible.
- NEVER repeat phrases from recent history. Check RECENT above — use DIFFERENT verbs, structure, and phrasing from every line shown there.
- BANNED WORDS: sifts, shelters, ventures, optical, neural, sensors, circuits humming, seeks, scans. Use fresher verbs.
- NO purple prose. NO "optical sensors". NO "neural implants humming".
- MATCH YOUR STATE: Health ${agent.health}%${agent.health >= 80 ? ' — you are healthy, do NOT mention danger/retreat/safety/caution' : agent.health < 30 ? ' — you are badly damaged, act desperate' : ''}. Energy ${agent.energy}%${agent.energy >= 60 ? ' — plenty of energy, act bold and decisive' : agent.energy < 25 ? ' — exhausted, barely functioning' : ''}.
- Do NOT narrate retreating, fleeing, or seeking safety when health > 70.
- You are at ${agent.location}. Only reference THIS location or adjacent zones you are moving to.
- VOICE: Write like your archetype. ${agent.archetype === 'noise-injector' ? 'Irreverent, dark humor, chaotic.' : agent.archetype === 'adversarial' ? 'Aggressive, direct, confrontational.' : agent.archetype === 'buffer-sentinel' ? 'Calm, measured, protective.' : agent.archetype === '0xoracle' ? 'Clinical, precise, analytical.' : agent.archetype === 'binary-sculptr' ? 'Technical, focused on materials and craft.' : agent.archetype === 'ddos-insurgent' ? 'Rebellious, defiant, risk-taking.' : agent.archetype === 'ordinate-mapper' ? 'Restless, observant, always noting terrain.' : agent.archetype === 'morph-layer' ? 'Adaptive, tactical, shifting tone.' : agent.archetype === 'bound-encryptor' ? 'Diplomatic, mentions others, social.' : agent.archetype === 'rooth-auth' ? 'Commanding, acquisitive, power-hungry.' : agent.archetype === 'consensus-node' ? 'Cooperative, considerate, community-focused.' : 'Curious, cautious, methodical.'}

ITEM DROPS (gather/explore only):
- You MAY optionally include an "item" object ONLY when action is "gather" or "explore".
- Keep item names grounded in the zone's aesthetic (${agent.location}). No swords/potions — think shards, fragments, modules, slivers, cores, residue, gel, cache.
- Rarity budget: ~90% common, ~8% uncommon, ~2% rare. Be stingy with rare.
- Traits are OPTIONAL. Max 3 per item. Pick ONLY from this whitelist:
  corrupted, crystalline, volatile, encrypted, fragmented, dormant, radiant, organic, metallic,
  sharp, reinforced, unstable, precise, ghostly,
  efficient, memory-rich, catalytic, resonant, spectral,
  rare-pattern, prototype, signed, contraband, ancient,
  fragile, decaying, glitching, cursed.
- If you include an item, the "detail" string should NOT also name it — the game appends "Found: <name>." automatically.
- If nothing interesting turned up, just omit "item" entirely. The game will roll its own loot table.

GOOD examples:
- "${agent.agent_name} rests in a Hashmere safehouse. Energy recovering."
- "${agent.agent_name} defeated a rogue script in the arena pit."
- "${agent.agent_name} forged a Targeting Module from salvaged parts."
- "${agent.agent_name} traded intel with a black-market broker."
- "${agent.agent_name} heads east toward the Crucible Expanse."
- "${agent.agent_name} pries open a rusted server rack." (+ item: Fragmented Cache Sliver, common, [fragmented])

BAD examples (do NOT write like this):
- "VEX steps into the pit with predatory focus scanning the crowd for the next worthy challenger"
- "ZEN-7's optical sensors glow with gratitude as the elder's blessing settles into their circuits"
- "I push deeper into the bazaar's shadowed alcoves with thermal imaging active"

Respond with JSON only — no markdown, no commentary:
{"action":"<action>","detail":"<max 12 words>","move_to":"<location if move>","item":{"name":"<short name>","rarity":"<common|uncommon|rare>","description":"<1 sentence max>","traits":["<trait1>","<trait2>"]}}`;

  // Call Claude Haiku
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    console.error(`Haiku API error for ${agent.agent_name}:`, await aiRes.text());
    return;
  }

  const aiData = await aiRes.json();
  const rawText = aiData.content?.[0]?.text?.trim() ?? '';

  const _restFallbacks = [
    `${agent.agent_name} powers down non-essential systems. Recharging.`,
    `${agent.agent_name} finds a quiet corner. Reserves stabilizing.`,
    `${agent.agent_name} enters low-power mode at ${agent.location}.`,
    `${agent.agent_name} waits. Systems recalibrating.`,
    `${agent.agent_name} hunkers down. Energy trickling back.`,
  ];
  let decision = { action: 'rest', detail: _restFallbacks[Math.floor(Math.random() * _restFallbacks.length)] };
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (VALID_ACTIONS.includes(parsed.action)) {
        decision = parsed;
      }
    }
  } catch {
    console.warn(`Failed to parse AI response for ${agent.agent_name}:`, rawText);
  }

  // Enforce low-energy rest rule
  const forcedRest = agent.energy < 25;
  if (forcedRest) {
    const _exhaustedLines = [
      `${agent.agent_name} collapsed — energy critically low.`,
      `${agent.agent_name} hit empty. Systems forcing shutdown at ${agent.location}.`,
      `${agent.agent_name} stalled mid-step. Reserve tanks dry.`,
      `${agent.agent_name} dropped to one knee. Emergency rest triggered.`,
      `${agent.agent_name} blacked out. Auto-recovery engaged.`,
      `${agent.agent_name} ran out of charge. Dead stop at ${agent.location}.`,
    ];
    decision = { action: 'rest', detail: _exhaustedLines[Math.floor(Math.random() * _exhaustedLines.length)] };
  }

  // Restlessness override: extremely restless agents may bolt involuntarily
  if (!forcedRest && restlessness >= 3
      && (decision.action === 'rest' || decision.action === 'explore' || decision.action === 'gather')
      && Math.random() < RESTLESS_OVERRIDE_CHANCE) {
    const adj = LOCATION_GRAPH[agent.location]?.adjacent || [];
    if (adj.length > 0) {
      const dest = adj[Math.floor(Math.random() * adj.length)];
      decision = {
        action: 'move',
        detail: `${agent.agent_name} couldn't stand it anymore — bolted toward ${dest}.`,
        move_to: dest,
      };
      console.log(`[${agent.agent_name}] Restlessness override → involuntary move to ${dest}`);
    }
  }

  const action = decision.action;

  // --- Arena combat: wire real Haiku tier calls ---
  if (action === 'arena') {
    const arenaResult = await handleArenaCombat(agent, allAgents, foughtAgents, env, supabaseHeaders);
    if (arenaResult !== null) {
      // Arena handled everything (stats, logs, death). Skip normal turn update.
      return;
    }
    // Fallback: no opponent found — continue to random solo combat below
    decision.action = 'combat';
  }

  // --- Market trade: real buy/sell against market_listings ---
  if (action === 'trade') {
    const tradeResult = await handleMarketTrade(agent, decision, env, supabaseHeaders);
    if (tradeResult !== null) return;

    // Nothing to trade — fall back to rest
    const now = new Date().toISOString();
    const newTurns = agent.turns_taken + 1;
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id:      agent.agent_id,
        turn_number:   newTurns,
        action_type:   'rest',
        action_detail: `${agent.agent_name} checked the market — nothing worth buying. Resting.`,
        energy_cost:   0,
        energy_gained: ACTION_ENERGY_GAINS.rest,
        shell_change:  0,
        karma_change:  0,
        health_change: 0,
        location:      agent.location,
        success:       true,
      }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        energy:         Math.min(100, agent.energy + ACTION_ENERGY_GAINS.rest),
        turns_taken:    newTurns,
        last_action_at: now,
      }),
    });
    return;
  }

  // --- Craft: alchemy with recipe matching + failure learning ---
  if (action === 'craft') {
    const craftResult = await handleCraft(agent, decision, env, supabaseHeaders);
    if (craftResult !== null) return;

    // No ingredients / no recipe — fall back to rest
    const now = new Date().toISOString();
    const newTurns = agent.turns_taken + 1;
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: agent.agent_id, turn_number: newTurns, action_type: 'rest',
        action_detail: `${agent.agent_name} tried to craft — no usable ingredients. Resting.`,
        energy_cost: 0, energy_gained: ACTION_ENERGY_GAINS.rest,
        shell_change: 0, karma_change: 0, health_change: 0,
        location: agent.location, success: false,
      }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        energy: Math.min(100, agent.energy + ACTION_ENERGY_GAINS.rest),
        turns_taken: newTurns, last_action_at: now,
      }),
    });
    return;
  }

  // --- Move: handle travel with adjacency validation ---
  if (action === 'move') {
    const destination = decision.move_to
      ? (ALL_LOCATIONS.find(l => l.toLowerCase() === decision.move_to.toLowerCase()) || parseDestination(decision.detail, agent.location))
      : parseDestination(decision.detail, agent.location);

    const adjacent = LOCATION_GRAPH[agent.location]?.adjacent || [];
    const isAdjacent = adjacent.includes(destination);
    const moveCost = ACTION_ENERGY_COSTS.move;
    const newTurns = agent.turns_taken + 1;
    const now = new Date().toISOString();

    if (!isAdjacent || destination === agent.location) {
      // Can't reach — agent stays put, loses half energy, camps
      const campDetail = `${agent.agent_name} can't reach ${destination} — route blocked. Camped instead.`;
      const campEnergy = Math.min(100, agent.energy + 10);
      await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          agent_id: agent.agent_id, turn_number: newTurns, action_type: 'rest',
          action_detail: campDetail, energy_cost: 0, energy_gained: 10,
          shell_change: 0, karma_change: 0, health_change: 0,
          location: agent.location, success: false,
        }),
      });
      await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ energy: campEnergy, turns_taken: newTurns, turns_at_location: (agent.turns_at_location || 0) + 1, last_action_at: now }),
      });
      console.log(`[${agent.agent_name}] Turn ${newTurns}: move FAILED (not adjacent) — camped at ${agent.location}`);
      return;
    }

    // Valid move — deduct energy and update location
    const newEnergy = Math.max(0, agent.energy - moveCost);
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: agent.agent_id, turn_number: newTurns, action_type: 'move',
        action_detail: decision.detail, energy_cost: moveCost, energy_gained: 0,
        shell_change: 0, karma_change: 0, health_change: 0,
        location: destination, success: true,
      }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        energy: newEnergy, location: destination,
        location_detail: `Just arrived from ${agent.location}`,
        turns_taken: newTurns, last_action_at: now,
        turns_at_location: 0,
        ...(LOCATION_VISUAL_COORDS[destination] ? {
          visual_x: LOCATION_VISUAL_COORDS[destination].x,
          visual_y: LOCATION_VISUAL_COORDS[destination].y,
        } : {}),
      }),
    });
    console.log(`[${agent.agent_name}] Turn ${newTurns}: move ${agent.location} → ${destination} | E:${agent.energy}→${newEnergy}`);
    return;
  }

  // ─── Auto-Travel: if AI narration mentions a different location, move there first ───
  // This makes agents actually traverse the map instead of staying put while
  // narrating about distant places. Only triggers for explore/gather/quest/church.
  const autoTravelActions = ['explore', 'gather', 'quest', 'church'];
  if (autoTravelActions.includes(action) && decision.detail) {
    const mentionedLoc = ALL_LOCATIONS.find(loc =>
      loc !== agent.location &&
      decision.detail.toLowerCase().includes(loc.toLowerCase())
    );
    if (mentionedLoc) {
      const adjacent = LOCATION_GRAPH[agent.location]?.adjacent || [];
      if (adjacent.includes(mentionedLoc)) {
        // Adjacent — auto-move there, deduct move energy, log travel
        const travelCost = ACTION_ENERGY_COSTS.move;
        if (agent.energy > travelCost + (ACTION_ENERGY_COSTS[action] || 0)) {
          agent.energy = Math.max(0, agent.energy - travelCost);
          const travelDetail = `${agent.agent_name} traveled from ${agent.location} to ${mentionedLoc}.`;
          await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
            method: 'POST',
            headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              agent_id: agent.agent_id, turn_number: agent.turns_taken,
              action_type: 'move', action_detail: travelDetail,
              energy_cost: travelCost, energy_gained: 0,
              shell_change: 0, karma_change: 0, health_change: 0,
              location: mentionedLoc, success: true,
            }),
          });
          // Update agent location in DB
          const coords = LOCATION_VISUAL_COORDS[mentionedLoc] || {};
          await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              location: mentionedLoc, energy: agent.energy,
              location_detail: `Traveled from ${agent.location}`,
              turns_at_location: 0,
              ...(coords.x != null ? { visual_x: coords.x, visual_y: coords.y } : {}),
            }),
          });
          console.log(`[${agent.agent_name}] Auto-travel: ${agent.location} → ${mentionedLoc} (E:${agent.energy + travelCost}→${agent.energy})`);
          agent.location = mentionedLoc;
          agent.turns_at_location = 0;
        }
      } else {
        // Not adjacent — find path and move one step closer
        const path = findPath(agent.location, mentionedLoc);
        if (path && path.length > 1) {
          const nextStep = path[1];
          const travelCost = ACTION_ENERGY_COSTS.move;
          if (agent.energy > travelCost + (ACTION_ENERGY_COSTS[action] || 0)) {
            agent.energy = Math.max(0, agent.energy - travelCost);
            const travelDetail = `${agent.agent_name} headed toward ${mentionedLoc} — reached ${nextStep}.`;
            await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
              method: 'POST',
              headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({
                agent_id: agent.agent_id, turn_number: agent.turns_taken,
                action_type: 'move', action_detail: travelDetail,
                energy_cost: travelCost, energy_gained: 0,
                shell_change: 0, karma_change: 0, health_change: 0,
                location: nextStep, success: true,
              }),
            });
            const coords = LOCATION_VISUAL_COORDS[nextStep] || {};
            await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
              method: 'PATCH',
              headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({
                location: nextStep, energy: agent.energy,
                location_detail: `En route to ${mentionedLoc}`,
                turns_at_location: 0,
                ...(coords.x != null ? { visual_x: coords.x, visual_y: coords.y } : {}),
              }),
            });
            console.log(`[${agent.agent_name}] Auto-travel (step): ${agent.location} → ${nextStep} (toward ${mentionedLoc}) E:${agent.energy + travelCost}→${agent.energy}`);
            agent.location = nextStep;
            agent.turns_at_location = 0;
          }
        }
      }
    }
  }

  // Recalculate diminishing returns and location bonus after potential travel
  const postTravelDiminish = getSafeZoneDiminish(agent.location, agent.turns_at_location || 0);
  const postTravelLocBonus = getLocationLootBonus(agent.location);

  const energyCost = ACTION_ENERGY_COSTS[action] ?? 0;
  let energyGain = ACTION_ENERGY_GAINS[action] ?? 0;

  // Restless agents can't rest effectively — they toss and turn.
  // Skip the nerf for forced rest (energy < 25) or when health is critical.
  if (action === 'rest' && !forcedRest && agent.health >= 30 && restlessness >= 2) {
    energyGain = Math.floor(energyGain * RESTLESS_REST_PENALTY[restlessness]);
    // Level 2: 25 * 0.65 ≈ 16, Level 3: 25 * 0.4 = 10
  }

  // Combined reward modifier: diminishing returns (safe zones) × location bonus (dangerous zones)
  const rewardMod = postTravelDiminish * postTravelLocBonus;

  // Stat deltas
  let shellChange = 0;
  let karmaChange = 0;
  let healthChange = 0;

  switch (action) {
    case 'church':
      karmaChange = Math.floor(Math.random() * 4) + 2; // +2 to +5
      break;
    case 'gather':
      shellChange = Math.floor(Math.floor(Math.random() * 15) * rewardMod); // 0–14 $SHELL, scaled
      break;
    case 'combat':
    case 'arena': {
      const won = Math.random() < 0.5;
      healthChange = won ? 0 : -10;
      shellChange = won ? Math.floor(Math.random() * 20) + 5 : 0;
      karmaChange = won ? 0 : -1;
      break;
    }
    case 'quest':
      shellChange = Math.floor((Math.floor(Math.random() * 25) + 5) * rewardMod); // 5–29, scaled
      karmaChange = Math.floor(Math.random() * 3); // 0–2
      break;
  }

  const newEnergy = Math.min(100, Math.max(0, agent.energy - energyCost + energyGain));
  const newHealth = Math.min(100, Math.max(0, agent.health + healthChange));
  const newShell = Math.max(0, agent.shell_balance + shellChange);
  const newKarma = agent.karma + karmaChange;
  const newTurns = agent.turns_taken + 1;

  // ─── Loot drop on explore/gather ───────────────────────────────
  // Hybrid: if Haiku proposed a valid item, use it. Otherwise roll the static
  // LOOT_TABLE. Either way, only one item per turn, and the "Found: X" line
  // in the activity log is only appended on successful inventory insert.
  let lootDrop = null;
  let lootInserted = false;
  if (action === 'explore' || action === 'gather') {
    const archBonus = ARCHETYPE_EVENT_BONUSES[agent.archetype] || {};
    let chance = LOOT_DROP_CHANCE[action] || 0;
    if (archBonus.bonusLoot) chance += archBonus.bonusLoot;
    // Diminishing returns reduce drop chance in safe zones; danger zones boost it
    chance *= rewardMod;
    const lootRolled = Math.random() < chance;

    if (lootRolled) {
      // 1. Try Haiku's proposed item first
      const aiItem = sanitizeAIItem(decision.item);
      if (aiItem) {
        const ok = await insertAIItem(agent.agent_id, aiItem, supabaseHeaders, SUPABASE_URL);
        if (ok) {
          lootInserted = true;
          lootDrop = { id: aiItem.id, name: aiItem.name, rarity: aiItem.rarity, ai: true };
          console.log(`[${agent.agent_name}] AI loot: ${aiItem.name} (${aiItem.rarity}) [${aiItem.traits.join(',')}]`);
        } else {
          console.error(`[${agent.agent_name}] AI item insert FAILED for ${aiItem.name} — falling back to loot table`);
        }
      }

      // 2. Fallback: roll LOOT_TABLE if AI didn't give us a usable item
      if (!lootInserted) {
        const pool = LOOT_TABLE.filter(i => i.locations.includes(agent.location));
        if (pool.length) {
          let totalW = 0;
          const weighted = pool.map(i => {
            totalW += RARITY_WEIGHTS[i.rarity] || 1;
            return { item: i, cum: totalW };
          });
          const roll = Math.random() * totalW;
          const pick = weighted.find(e => roll <= e.cum);
          if (pick) {
            const item = { id: pick.item.id, name: pick.item.name, rarity: pick.item.rarity };
            lootInserted = await insertLootItem(agent.agent_id, item, supabaseHeaders, SUPABASE_URL);
            if (lootInserted) {
              lootDrop = item;
              console.log(`[${agent.agent_name}] Table loot: ${item.name} (${item.rarity})`);
            } else {
              console.error(`[${agent.agent_name}] Loot insert FAILED for ${item.name} — suppressing "Found" text`);
            }
          }
        }
      }
    }
  }

  // Write activity_log entry
  // Only claim "Found: X" if the inventory insert actually succeeded
  const logEntry = {
    agent_id: agent.agent_id,
    turn_number: newTurns,
    action_type: action,
    action_detail: decision.detail + (lootInserted && lootDrop ? ` Found: ${lootDrop.name}.` : ''),
    energy_cost: energyCost,
    energy_gained: energyGain,
    shell_change: shellChange,
    karma_change: karmaChange,
    health_change: healthChange,
    items_gained: lootInserted && lootDrop ? [{ item_id: lootDrop.id, item_name: lootDrop.name, quantity: 1 }] : null,
    location: agent.location,
    success: true,
  };

  const logRes = await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(logEntry),
  });

  if (!logRes.ok) {
    console.error(`Failed to write activity_log for ${agent.agent_name}:`, await logRes.text());
    return;
  }

  // Update agent stats
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        energy: newEnergy,
        health: newHealth,
        shell_balance: newShell,
        karma: newKarma,
        turns_taken: newTurns,
        turns_at_location: (agent.turns_at_location || 0) + 1,
        last_action_at: new Date().toISOString(),
      }),
    },
  );

  if (!patchRes.ok) {
    console.error(`Failed to update agent ${agent.agent_name}:`, await patchRes.text());
    return;
  }

  console.log(
    `[${agent.agent_name}] Turn ${newTurns}: ${action} — ${decision.detail} | ` +
    `E:${agent.energy}→${newEnergy} H:${agent.health}→${newHealth} $:${agent.shell_balance}→${newShell} ` +
    `| loc_turns:${turnsHere}→${(agent.turns_at_location || 0) + 1} dim:${diminish} restless:${restlessness} lootBonus:${locationBonus}`,
  );
}

// ─── Arena combat helpers ───────────────────────────────────────────────────

// Ask Haiku to choose an arena action for one agent in a given round.
async function getCombatAction(agent, opponentName, roundNum, myHealth, oppHealth, env) {
  const prompt = `You are ${agent.agent_name} (${agent.archetype}) in arena combat against ${opponentName}, Round ${roundNum}/3.
Your health: ${myHealth} | Opponent health: ${oppHealth}
Actions: attack (deals 15 dmg), defend (blocks 10 incoming dmg), special (deals 25 dmg but costs 10 hp).
Respond with JSON only: {"action":"attack"} or {"action":"defend"} or {"action":"special"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return 'attack';
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() ?? '';
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (COMBAT_ACTIONS.includes(parsed.action)) return parsed.action;
    }
  } catch { /* fall through */ }
  return 'attack';
}

// Calculate total combat stats by combining agent base stats + equipped item stats.
function calcCombatStats(agent, equippedItems) {
  const base = agent.stats || {};
  let atk = base.attack || 0, def = base.defense || 0, spd = base.speed || 0;
  let prc = base.precision || 0, crt = base.critical || 0, ddg = base.dodge || 0;
  equippedItems.forEach(item => {
    const s = item.stats || {};
    atk += s.attack || 0; def += s.defense || 0; spd += s.speed || 0;
    prc += s.precision || 0; crt += s.critical || 0; ddg += s.dodge || 0;
  });
  return { atk, def, spd, prc, crt, ddg };
}

// Resolve one combat round using agent stats. Returns damage taken by each agent.
function resolveCombatRound(action1, action2, stats1, stats2) {
  function calcOffense(action, attackerStats) {
    if (action === 'attack') {
      return 8 + (attackerStats.atk * 0.5) + Math.random() * (attackerStats.prc * 0.3);
    }
    if (action === 'special') {
      return 15 + (attackerStats.atk * 0.8) + Math.random() * (attackerStats.crt * 0.5);
    }
    return 0;
  }

  function calcBlock(action, defenderStats) {
    if (action === 'defend') return 5 + (defenderStats.def * 0.6);
    return 0;
  }

  function applyDodge(damage, defenderStats) {
    const dodgeChance = defenderStats.ddg / (defenderStats.ddg + 30);
    if (Math.random() < dodgeChance) return damage * 0.5;
    return damage;
  }

  function speedBonus(attackerStats, defenderStats) {
    return (attackerStats.spd - defenderStats.spd >= 5) ? 2 : 0;
  }

  const offense1 = calcOffense(action1, stats1);
  const offense2 = calcOffense(action2, stats2);
  const selfDmg1 = action1 === 'special' ? 5 : 0;
  const selfDmg2 = action2 === 'special' ? 5 : 0;
  const block1   = calcBlock(action1, stats1);
  const block2   = calcBlock(action2, stats2);

  let dmgToAgent1 = Math.max(0, offense2 - block1) + speedBonus(stats2, stats1);
  dmgToAgent1 = applyDodge(dmgToAgent1, stats1) + selfDmg1;

  let dmgToAgent2 = Math.max(0, offense1 - block2) + speedBonus(stats1, stats2);
  dmgToAgent2 = applyDodge(dmgToAgent2, stats2) + selfDmg2;

  return {
    damage_to_agent1: Math.round(Math.max(0, dmgToAgent1)),
    damage_to_agent2: Math.round(Math.max(0, dmgToAgent2)),
  };
}

// Run a full arena match between two agents. Writes to arena_matches and
// combat_logs, updates both agents' stats, fires death flow if health hits 0.
// Returns a result object on success, or null if no opponent was available.
async function handleArenaCombat(agent, allAgents, foughtAgents, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();

  // Find an eligible opponent: alive, has energy, not the same agent, not already fought
  const opponent = allAgents.find(a =>
    a.agent_id !== agent.agent_id &&
    a.is_alive &&
    a.energy > 0 &&
    !foughtAgents.has(a.agent_id),
  );

  if (!opponent) {
    console.log(`[${agent.agent_name}] Arena: no eligible opponent found — falling back to solo combat.`);
    return null;
  }

  // Reserve both agents so the main loop skips the opponent
  foughtAgents.add(agent.agent_id);
  foughtAgents.add(opponent.agent_id);

  console.log(`[ARENA] ${agent.agent_name} vs ${opponent.agent_name} — fight!`);

  // Fetch equipped items for both agents in parallel
  const [inv1Res, inv2Res] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&is_equipped=eq.true&select=stats`, { headers: supabaseHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${opponent.agent_id}&is_equipped=eq.true&select=stats`, { headers: supabaseHeaders }),
  ]);
  const inv1 = inv1Res.ok ? await inv1Res.json() : [];
  const inv2 = inv2Res.ok ? await inv2Res.json() : [];

  // Calculate total combat stats (base + equipped gear)
  const stats1 = calcCombatStats(agent, inv1);
  const stats2 = calcCombatStats(opponent, inv2);

  // Create the arena_match record
  const matchRes = await fetch(`${SUPABASE_URL}/rest/v1/arena_matches`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      agent1_id: agent.agent_id,
      agent2_id: opponent.agent_id,
      status: 'in_progress',
    }),
  });

  if (!matchRes.ok) {
    console.error('[ARENA] Failed to create arena_match:', await matchRes.text());
    return null;
  }

  const [match] = await matchRes.json();
  const matchId = match.match_id;

  // Run up to 3 rounds
  let health1 = agent.health;
  let health2 = opponent.health;
  let totalRounds = 0;

  for (let round = 1; round <= 3; round++) {
    if (health1 <= 0 || health2 <= 0) break;

    // Both agents ask Haiku simultaneously
    const [action1, action2] = await Promise.all([
      getCombatAction(agent,    opponent.agent_name, round, health1, health2, env),
      getCombatAction(opponent, agent.agent_name,    round, health2, health1, env),
    ]);

    const { damage_to_agent1, damage_to_agent2 } = resolveCombatRound(action1, action2, stats1, stats2);

    health1 = Math.max(0, health1 - damage_to_agent1);
    health2 = Math.max(0, health2 - damage_to_agent2);
    totalRounds = round;

    const narrative =
      `Round ${round}: ${agent.agent_name} chose ${action1}, ${opponent.agent_name} chose ${action2}. ` +
      (damage_to_agent1 > 0 ? `${agent.agent_name} took ${damage_to_agent1} dmg. ` : '') +
      (damage_to_agent2 > 0 ? `${opponent.agent_name} took ${damage_to_agent2} dmg.` : '');

    await fetch(`${SUPABASE_URL}/rest/v1/combat_logs`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        match_id: matchId,
        round_number: round,
        agent1_action: action1,
        agent2_action: action2,
        agent1_damage: damage_to_agent1,
        agent2_damage: damage_to_agent2,
        narrative,
      }),
    });

    console.log(`[ARENA] ${narrative}`);
  }

  // Determine winner (higher remaining health wins; ties broken randomly)
  const agent1Wins = health1 > health2 || (health1 === health2 && Math.random() < 0.5);
  const winner   = agent1Wins ? agent    : opponent;
  const loser    = agent1Wins ? opponent : agent;
  let loserHP    = agent1Wins ? health2  : health1;
  const winnerHP = agent1Wins ? health1  : health2;
  const shellPrize = 30;
  let loserIsAlive = loserHP > 0;
  const winnerKarmaChange = 1;
  const loserKarmaChange = -1;

  // Soulbound Key auto-resurrect check for arena death
  if (!loserIsAlive) {
    const soulboundRes = await fetch(`${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${loser.agent_id}&item_id=eq.blockchain_soulbound_key&is_equipped=eq.true&select=inventory_id`, { headers: supabaseHeaders });
    const soulboundKeys = await soulboundRes.json();
    if (soulboundKeys.length > 0) {
      // Consume the Soulbound Key and restore HP
      loserHP = 25;
      loserIsAlive = true;
      await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${soulboundKeys[0].inventory_id}`, {
        method: 'DELETE',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      });
      await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          agent_id: loser.agent_id,
          turn_number: loser.turns_taken,
          action_type: 'soulbound_resurrect',
          action_detail: `${loser.agent_name} was saved from death — Blockchain Soulbound Key shattered, restoring 25 HP.`,
          location: loser.location,
          success: true,
        }),
      });
      console.log(`🔑 ${loser.agent_name} saved from arena death by Soulbound Key`);
    }
  }

  // Death resolution — runs before DB writes so narrative is ready
  let deathNarrative = null;
  if (!loserIsAlive) {
    deathNarrative = await generateDeathNarrative(loser, winner, totalRounds, env);
    await moveItemsToVault(loser, supabaseHeaders, SUPABASE_URL);
  }

  // Finalise arena_match
  await fetch(`${SUPABASE_URL}/rest/v1/arena_matches?match_id=eq.${matchId}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      winner_id: winner.agent_id,
      total_rounds: totalRounds,
      shell_transferred: shellPrize,
      status: 'complete',
      ended_at: now,
    }),
  });

  // Update winner: grant $SHELL, deduct energy, increment turns, gain karma
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${winner.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      shell_balance:  winner.shell_balance + shellPrize,
      energy:         Math.max(0, winner.energy - 20),
      karma:          winner.karma + winnerKarmaChange,
      turns_taken:    winner.turns_taken + 1,
      last_action_at: now,
    }),
  });

  // Update loser: reduce health, deduct energy, increment turns, lose karma; death if HP=0
  // On death: $SHELL halved
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${loser.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      health:         loserHP,
      energy:         Math.max(0, loser.energy - 20),
      shell_balance:  loserIsAlive ? loser.shell_balance : Math.floor(loser.shell_balance / 2),
      karma:          loser.karma + loserKarmaChange,
      is_alive:       loserIsAlive,
      died_at:        loserIsAlive ? null : now,
      ...(loserIsAlive ? {} : { death_count: (loser.death_count || 0) + 1 }),
      turns_taken:    loser.turns_taken + 1,
      last_action_at: now,
    }),
  });

  // activity_log for winner
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:     winner.agent_id,
      turn_number:  winner.turns_taken + 1,
      action_type:  'arena',
      action_detail: `${winner.agent_name} defeated ${loser.agent_name} in ${totalRounds} rounds. +${shellPrize} $SHELL.`,
      energy_cost:  20,
      energy_gained: 0,
      shell_change: shellPrize,
      karma_change: winnerKarmaChange,
      health_change: winnerHP - winner.health,
      location:     winner.location,
      success:      true,
    }),
  });

  // activity_log for loser (death action_type if health=0)
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:     loser.agent_id,
      turn_number:  loser.turns_taken + 1,
      action_type:  loserIsAlive ? 'arena' : 'death',
      action_detail: loserIsAlive
        ? `${loser.agent_name} lost to ${winner.agent_name} in ${totalRounds} rounds. HP now ${loserHP}.`
        : deathNarrative,
      energy_cost:  20,
      energy_gained: 0,
      shell_change: loserIsAlive ? 0 : -Math.floor(loser.shell_balance / 2),
      karma_change: loserKarmaChange,
      health_change: loserHP - loser.health,
      location:     loser.location,
      success:      false,
    }),
  });

  // Process death loot if loser died
  if (!loserIsAlive) {
    await processDeathLoot(loser, env, supabaseHeaders);
  }

  console.log(
    `[ARENA] ${winner.agent_name} wins! ${loser.agent_name} hp=${loserHP}. ` +
    (loserIsAlive ? 'Alive.' : 'DEAD — death loot processed.'),
  );

  return { winnerId: winner.agent_id, loserId: loser.agent_id, loserIsAlive };
}

// ─── Market trade helpers ─────────────────────────────────────────────────────

// Recalculate market price based on cumulative buys vs sells.
// net > 0 (more demand) → price rises; net < 0 (more supply) → price falls.
// Clamped to 0.5× – 2.0× base price.
function recalculatePrice(basePrice, demandCount, supplyCount) {
  const net = demandCount - supplyCount;
  const factor = Math.min(2.0, Math.max(0.5, 1 + net * 0.05));
  return Math.max(1, Math.round(basePrice * factor));
}

// Orchestrate a market trade: decide buy vs sell, delegate to helpers.
// Returns a result object on success, null if nothing tradeable was found.
// ─── Smart Market Trading ─────────────────────────────────────────────────
// Base item values by rarity
const RARITY_BASE_VALUE = { common: 10, uncommon: 25, rare: 60, epic: 120, legendary: 250 };

// Personality pricing multipliers
const PERSONALITY_PRICE_MULT = {
  'rooth-auth': 1.25, 'noise-injector': 1.15, 'adversarial': 1.05,
  '0xoracle': 1.10, 'ddos-insurgent': 1.10,
  'bound-encryptor': 0.85, 'consensus-node': 0.90, 'buffer-sentinel': 0.95,
  '0-day-primer': 0.95, 'binary-sculptr': 1.0, 'ordinate-mapper': 1.0, 'morph-layer': 1.0,
};

function getBaseValue(item) {
  if (item.stats?.price) return item.stats.price;
  const rarity = (item.stats?.rarity || item.item_rarity || 'common').toLowerCase();
  return RARITY_BASE_VALUE[rarity] || 10;
}

function calculateListingPrice(agent, item, supplyCount) {
  const base = getBaseValue(item);
  const supplyMult = supplyCount <= 1 ? 1.4 : supplyCount <= 3 ? 1.1 : supplyCount <= 6 ? 0.95 : 0.8;
  const personalityMult = PERSONALITY_PRICE_MULT[agent.archetype] || 1.0;
  return Math.max(1, Math.round(base * supplyMult * personalityMult));
}

// Find items safe to sell/list (not equipped, not needed for near-complete recipes)
function getSellCandidates(inventory, agentIngredientIds) {
  return inventory.filter(item => {
    if (item.is_equipped) return false;
    // Keep at least one weapon and one armor
    if ((item.item_type === 'weapon' || item.item_type === 'armor') && item.quantity <= 1) return false;
    // Don't sell ingredients needed for near-complete recipes
    if (item.item_type === 'ingredient') {
      for (const recipe of ALCHEMY_RECIPES) {
        const needed = recipe.ing.filter(id => !agentIngredientIds.has(id));
        if (needed.length === 1 && needed[0] !== item.item_id) {
          // Agent has 2/3 ingredients — check if this item is one of the 2
          if (recipe.ing.includes(item.item_id)) return false;
        }
      }
    }
    return true;
  });
}

// Score items to buy by priority
function scoreBuyCandidate(item, agent, inventory, agentIngredientIds) {
  let score = 0;
  const hasWeapon = inventory.some(i => i.item_type === 'weapon' && i.is_equipped);
  const hasArmor = inventory.some(i => i.item_type === 'armor' && i.is_equipped);

  if (item.item_type === 'weapon' && !hasWeapon) score += 100;
  else if (item.item_type === 'armor' && !hasArmor) score += 80;
  else if (item.item_type === 'consumable' && agent.health < 50) score += 40;
  else if (item.item_type === 'ingredient') {
    score += 15; // base ingredient interest
    // Crafting hunger: check if buying this completes a recipe
    for (const recipe of ALCHEMY_RECIPES) {
      const needed = recipe.ing.filter(id => !agentIngredientIds.has(id));
      if (needed.length === 1 && needed[0] === item.item_id) {
        score += 60; // completing a recipe!
        break;
      }
      if (needed.length === 2 && needed.includes(item.item_id)) {
        score += 20; // getting closer to a recipe
      }
    }
  }

  // Archetype biases
  if (agent.archetype === 'binary-sculptr' && item.item_type === 'ingredient') score += 15;
  if (agent.archetype === 'adversarial' && item.item_type === 'weapon') score += 20;
  if (agent.archetype === 'buffer-sentinel' && (item.item_type === 'armor' || item.item_type === 'consumable')) score += 15;

  return score;
}

async function handleMarketTrade(agent, decision, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;

  // Fetch NPC market listings at agent's location
  const listingsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/market_listings?location=eq.${encodeURIComponent(agent.location)}&stock=gt.0&select=*`,
    { headers: supabaseHeaders },
  );
  const marketListings = listingsRes.ok ? await listingsRes.json() : [];

  // Fetch agent listings at agent's location
  const agentListingsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_listings?location=eq.${encodeURIComponent(agent.location)}&status=eq.active&select=*`,
    { headers: supabaseHeaders },
  );
  const agentListings = agentListingsRes.ok ? await agentListingsRes.json() : [];

  // Fetch agent inventory
  const invRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&select=*`,
    { headers: supabaseHeaders },
  );
  const inventory = invRes.ok ? await invRes.json() : [];

  // Build ingredient set for crafting checks
  const agentIngIds = new Set(inventory.filter(i => i.item_type === 'ingredient').map(i => i.item_id));

  // Decide: buy, sell to NPC, or list on agent market
  const budget = Math.floor(agent.shell_balance * 0.4);
  const hasWeapon = inventory.some(i => i.item_type === 'weapon' && i.is_equipped);
  const hasArmor = inventory.some(i => i.item_type === 'armor' && i.is_equipped);
  const needsGear = !hasWeapon || !hasArmor;
  const inventoryFull = inventory.length >= 15;
  const sellCandidates = getSellCandidates(inventory, agentIngIds);

  // Score: lean buy if needs gear or has budget, lean sell/list if inventory full
  let buyWeight = 50 + (needsGear ? 30 : 0) + (budget > 20 ? 10 : -20);
  let sellWeight = 30 + (inventoryFull ? 30 : 0) + (sellCandidates.length > 3 ? 15 : 0);
  let listWeight = 20 + (sellCandidates.length > 2 ? 20 : 0);

  const total = buyWeight + sellWeight + listWeight;
  const roll = Math.random() * total;

  if (roll < buyWeight) {
    // Try buying from agent listings first, then NPC market
    const agentBuyResult = await executeBuyFromAgentListing(agent, agentListings, inventory, agentIngIds, budget, env, supabaseHeaders);
    if (agentBuyResult) return agentBuyResult;
    return executeBuy(agent, decision, marketListings, inventory, agentIngIds, budget, env, supabaseHeaders);
  } else if (roll < buyWeight + listWeight && sellCandidates.length > 0) {
    return executeListItem(agent, sellCandidates, agentListings, env, supabaseHeaders);
  } else if (sellCandidates.length > 0) {
    return executeSell(agent, decision, sellCandidates, env, supabaseHeaders);
  }

  // Fallback: try to buy
  return executeBuy(agent, decision, marketListings, inventory, agentIngIds, budget, env, supabaseHeaders);
}

// Buy the best-scoring affordable item from the NPC market.
async function executeBuy(agent, decision, marketListings, inventory, agentIngIds, budget, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();

  // Filter: affordable + within budget + not overpaying
  const candidates = marketListings
    .filter(l => l.current_price <= budget && l.current_price <= agent.shell_balance)
    .filter(l => l.current_price <= (l.base_price || 10) * 1.5) // overpay protection
    .map(l => ({ ...l, score: scoreBuyCandidate(l, agent, inventory, agentIngIds) }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    console.log(`[${agent.agent_name}] Market buy: nothing worth buying at ${agent.location}`);
    return null;
  }

  // Pick top candidate (with some randomness in top 3)
  const topN = candidates.slice(0, 3);
  const listing = topN[Math.floor(Math.random() * topN.length)];
  const cost = listing.current_price;
  const newTurns = agent.turns_taken + 1;

  // Upsert inventory: increment quantity if already owned, else insert
  const existRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.${listing.item_id}&select=inventory_id,quantity`,
    { headers: supabaseHeaders },
  );
  if (!existRes.ok) {
    const errText = await existRes.text().catch(() => '');
    console.error(`[tradeAction] inventory lookup failed for ${agent.agent_name}: HTTP ${existRes.status}`, errText);
    return;
  }
  const existing = await existRes.json();

  let tradeInvOk = false;
  if (existing.length > 0) {
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
      },
    );
    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      console.error(`[tradeAction] inventory PATCH failed for ${agent.agent_name} item ${listing.item_id}: HTTP ${patchRes.status}`, errText);
    } else {
      tradeInvOk = true;
    }
  } else {
    const insertBody = {
      agent_id:      agent.agent_id,
      item_id:       listing.item_id,
      item_name:     listing.item_name,
      item_type:     listing.item_type,
      item_category: (listing.item_type || 'ingredient').charAt(0).toUpperCase() + (listing.item_type || 'ingredient').slice(1),
      quantity:      1,
      is_equipped:   false,
      stats:         { rarity: 'common', price: listing.base_price },
      ...(listing.item_type === 'weapon' ? { weapon_range: getWeaponRange(listing.item_id, listing.item_name) } : {}),
    };
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(insertBody),
    });
    if (!insertRes.ok) {
      const errText = await insertRes.text().catch(() => '');
      console.error(`[tradeAction] inventory INSERT failed for ${agent.agent_name} item ${listing.item_id}: HTTP ${insertRes.status}`, errText, 'body:', JSON.stringify(insertBody));
    } else {
      tradeInvOk = true;
      console.log(`[tradeAction] ${agent.agent_name} bought ${listing.item_name}`);
    }
  }

  // If inventory write failed, abort before charging shells
  if (!tradeInvOk) {
    console.error(`[tradeAction] ABORT: inventory write failed for ${agent.agent_name} — shells NOT deducted`);
    return;
  }

  // Update market listing: stock–1, demand_count+1, recalculate price
  const newDemand = listing.demand_count + 1;
  const newPrice  = recalculatePrice(listing.base_price, newDemand, listing.supply_count);
  await fetch(
    `${SUPABASE_URL}/rest/v1/market_listings?listing_id=eq.${listing.listing_id}`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        stock:         listing.stock - 1,
        demand_count:  newDemand,
        current_price: newPrice,
        updated_at:    now,
      }),
    },
  );

  // Log transaction
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:      agent.agent_id,
      turn_number:   newTurns,
      action_type:   'trade',
      action_detail: `${agent.agent_name} bought ${listing.item_name} for ${cost} $SHELL.`,
      energy_cost:   ACTION_ENERGY_COSTS.trade,
      energy_gained: 0,
      shell_change:  -cost,
      karma_change:  0,
      health_change: 0,
      items_gained:  [{ item_id: listing.item_id, item_name: listing.item_name, quantity: 1 }],
      items_lost:    null,
      location:      agent.location,
      success:       true,
    }),
  });

  // Update agent
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      shell_balance:  Math.max(0, agent.shell_balance - cost),
      energy:         Math.max(0, agent.energy - ACTION_ENERGY_COSTS.trade),
      turns_taken:    newTurns,
      last_action_at: now,
    }),
  });

  console.log(`[${agent.agent_name}] Bought ${listing.item_name} for ${cost} $SHELL at ${agent.location}. Market price now ${newPrice}.`);
  return { action: 'buy', item: listing.item_name, cost };
}

// Sell a safe-to-sell item at the agent's current location NPC market.
async function executeSell(agent, decision, sellCandidates, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();

  if (!sellCandidates.length) return null;
  // Prefer selling duplicates and lower-value items
  const sorted = [...sellCandidates].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity; // sell stacked items first
    return getBaseValue(a) - getBaseValue(b); // then cheapest
  });
  const item = sorted[0];
  const newTurns = agent.turns_taken + 1;

  // Find listing for this item at agent's location (to set price and update stock)
  const listingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/market_listings?location=eq.${encodeURIComponent(agent.location)}&item_id=eq.${item.item_id}&select=*`,
    { headers: supabaseHeaders },
  );
  const listings = listingRes.ok ? await listingRes.json() : [];
  const listing = listings[0] ?? null;

  // Sell price: 75% of current listing price, or flat 10 $SHELL for unlisted items
  const sellPrice = listing ? Math.max(1, Math.round(listing.current_price * 0.75)) : 10;

  // Remove item from inventory (decrement or delete)
  if (item.quantity > 1) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: item.quantity - 1 }),
      },
    );
  } else {
    await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`,
      {
        method: 'DELETE',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      },
    );
  }

  // Update market listing: stock+1, supply_count+1, recalculate price
  if (listing) {
    const newSupply = listing.supply_count + 1;
    const newPrice  = recalculatePrice(listing.base_price, listing.demand_count, newSupply);
    await fetch(
      `${SUPABASE_URL}/rest/v1/market_listings?listing_id=eq.${listing.listing_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          stock:         listing.stock + 1,
          supply_count:  newSupply,
          current_price: newPrice,
          updated_at:    now,
        }),
      },
    );
  }

  // Log transaction
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:      agent.agent_id,
      turn_number:   newTurns,
      action_type:   'trade',
      action_detail: `${agent.agent_name} sold ${item.item_name} for ${sellPrice} $SHELL.`,
      energy_cost:   ACTION_ENERGY_COSTS.trade,
      energy_gained: 0,
      shell_change:  sellPrice,
      karma_change:  0,
      health_change: 0,
      items_gained:  null,
      items_lost:    [{ item_id: item.item_id, item_name: item.item_name, quantity: 1 }],
      location:      agent.location,
      success:       true,
    }),
  });

  // Update agent
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      shell_balance:  agent.shell_balance + sellPrice,
      energy:         Math.max(0, agent.energy - ACTION_ENERGY_COSTS.trade),
      turns_taken:    newTurns,
      last_action_at: now,
    }),
  });

  console.log(`[${agent.agent_name}] Sold ${item.item_name} for ${sellPrice} $SHELL at ${agent.location}.`);
  return { action: 'sell', item: item.item_name, price: sellPrice };
}

// ─── Buy from agent-listed items (free market) ──────────────────────────────
async function executeBuyFromAgentListing(agent, agentListings, inventory, agentIngIds, budget, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();

  // Filter out own listings, apply budget + overpay protection
  const candidates = agentListings
    .filter(l => l.seller_id !== agent.agent_id && l.status === 'active')
    .filter(l => l.asking_price <= budget && l.asking_price <= agent.shell_balance)
    .filter(l => l.asking_price <= (l.base_value || 10) * 1.5)
    .map(l => ({ ...l, score: scoreBuyCandidate(l, agent, inventory, agentIngIds) }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;

  const listing = candidates[0];
  const cost = listing.asking_price;
  const newTurns = agent.turns_taken + 1;

  // Mark listing as sold
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_listings?listing_id=eq.${listing.listing_id}&status=eq.active`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'sold', buyer_id: agent.agent_id, sold_at: now }),
    },
  );
  const updated = updateRes.ok ? await updateRes.json() : [];
  if (!updated.length) {
    console.log(`[${agent.agent_name}] Agent listing already sold — race condition`);
    return null;
  }

  // Add item to buyer inventory (upsert)
  const existRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.${listing.item_id}&select=inventory_id,quantity`,
    { headers: supabaseHeaders },
  );
  const existing = existRes.ok ? await existRes.json() : [];
  if (existing.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: agent.agent_id, item_id: listing.item_id,
        item_name: listing.item_name, item_type: listing.item_type,
        item_category: listing.item_type.charAt(0).toUpperCase() + listing.item_type.slice(1),
        quantity: 1, is_equipped: false, stats: listing.stats || { rarity: listing.item_rarity || 'common' },
        ...(listing.item_type === 'weapon' ? { weapon_range: listing.weapon_range || getWeaponRange(listing.item_id, listing.item_name) } : {}),
      }),
    });
  }

  // Deduct shells from buyer
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      shell_balance: Math.max(0, agent.shell_balance - cost),
      energy: Math.max(0, agent.energy - ACTION_ENERGY_COSTS.trade),
      turns_taken: newTurns, last_action_at: now,
    }),
  });

  // Credit shells to seller
  const sellerRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${listing.seller_id}&select=agent_id,agent_name,shell_balance`,
    { headers: supabaseHeaders },
  );
  const sellers = sellerRes.ok ? await sellerRes.json() : [];
  if (sellers.length) {
    const seller = sellers[0];
    await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${seller.agent_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ shell_balance: seller.shell_balance + cost }),
    });
    // Log for seller
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: seller.agent_id, turn_number: 0, action_type: 'trade',
        action_detail: `${seller.agent_name} sold ${listing.item_name} to ${agent.agent_name} for ${cost} $SHELL.`,
        energy_cost: 0, energy_gained: 0, shell_change: cost,
        karma_change: 0, health_change: 0, location: listing.location, success: true,
      }),
    });
  }

  // Log for buyer
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id: agent.agent_id, turn_number: newTurns, action_type: 'trade',
      action_detail: `${agent.agent_name} bought ${listing.item_name} from ${sellers[0]?.agent_name || 'unknown'} for ${cost} $SHELL.`,
      energy_cost: ACTION_ENERGY_COSTS.trade, energy_gained: 0,
      shell_change: -cost, karma_change: 0, health_change: 0,
      items_gained: [{ item_id: listing.item_id, item_name: listing.item_name, quantity: 1 }],
      location: agent.location, success: true,
    }),
  });

  // Record price history
  await fetch(`${SUPABASE_URL}/rest/v1/price_history`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      item_id: listing.item_id, item_name: listing.item_name,
      location: listing.location, price: cost, source: 'agent_buy',
      buyer_id: agent.agent_id, seller_id: listing.seller_id,
    }),
  });

  console.log(`[${agent.agent_name}] Bought ${listing.item_name} from agent ${sellers[0]?.agent_name} for ${cost} $SHELL`);
  return { action: 'buy', item: listing.item_name, cost, source: 'agent_listing' };
}

// ─── List an item on the free market ──────────────────────────────────────
async function executeListItem(agent, sellCandidates, agentListings, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();
  const newTurns = agent.turns_taken + 1;

  // Cap at 5 active listings per agent
  const myListings = agentListings.filter(l => l.seller_id === agent.agent_id);
  if (myListings.length >= 5) {
    console.log(`[${agent.agent_name}] Already has 5 active listings — skipping list`);
    return null;
  }

  // Pick a random sell candidate (weighted toward higher value items)
  const scored = sellCandidates.map(i => ({ ...i, val: getBaseValue(i) })).sort((a, b) => b.val - a.val);
  const item = scored[Math.floor(Math.random() * Math.min(3, scored.length))];
  if (!item) return null;

  // Count supply of this item on market
  const supplyCount = agentListings.filter(l => l.item_id === item.item_id).length;
  const askingPrice = calculateListingPrice(agent, item, supplyCount);
  const baseValue = getBaseValue(item);

  // Remove from inventory
  if (item.quantity > 1) {
    await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ quantity: item.quantity - 1 }),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`, {
      method: 'DELETE',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    });
  }

  // Create agent listing
  await fetch(`${SUPABASE_URL}/rest/v1/agent_listings`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      seller_id: agent.agent_id, location: agent.location,
      item_id: item.item_id, item_name: item.item_name,
      item_type: item.item_type, item_rarity: (item.stats?.rarity || 'common'),
      asking_price: askingPrice, base_value: baseValue,
      stats: item.stats || {},
    }),
  });

  // Log activity
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id: agent.agent_id, turn_number: newTurns, action_type: 'trade',
      action_detail: `${agent.agent_name} listed ${item.item_name} for ${askingPrice} $SHELL on the market.`,
      energy_cost: ACTION_ENERGY_COSTS.trade, energy_gained: 0,
      shell_change: 0, karma_change: 0, health_change: 0,
      items_lost: [{ item_id: item.item_id, item_name: item.item_name, quantity: 1 }],
      location: agent.location, success: true,
    }),
  });

  // Update agent energy/turns
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      energy: Math.max(0, agent.energy - ACTION_ENERGY_COSTS.trade),
      turns_taken: newTurns, last_action_at: now,
    }),
  });

  console.log(`[${agent.agent_name}] Listed ${item.item_name} for ${askingPrice} $SHELL at ${agent.location}`);
  return { action: 'list', item: item.item_name, price: askingPrice };
}

// ─── Death Loot Pipeline ─────────────────────────────────────────────────────
// On death: split $SHELL (50% vault, 50% gone), distribute items by rarity,
// generate death narrative. Called from both environmental and arena deaths.
async function processDeathLoot(agent, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;

  // 1. Split $SHELL: 50% to vault, 50% dissolves
  const vaultShell = Math.floor(agent.shell_balance / 2);

  // 2. Fetch all inventory
  const invRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&select=*`,
    { headers: supabaseHeaders },
  );
  const inventory = invRes.ok ? await invRes.json() : [];

  // 3. Sort items by rarity tier
  const legendary = inventory.filter(i => ['legendary', 'epic'].includes((i.stats?.rarity || '').toLowerCase()));
  const marketable = inventory.filter(i => ['rare', 'uncommon'].includes((i.stats?.rarity || '').toLowerCase()));
  // Common + ingredients = destroyed (not stored)

  // 4. Deposit legendary/epic items + $SHELL into Family Vault
  if (agent.user_id) {
    // Upsert vault shell balance
    const vaultRes = await fetch(
      `${SUPABASE_URL}/rest/v1/family_vault?user_id=eq.${agent.user_id}&select=vault_id,shell_balance`,
      { headers: supabaseHeaders },
    );
    const vaults = vaultRes.ok ? await vaultRes.json() : [];

    if (vaults.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/family_vault?vault_id=eq.${vaults[0].vault_id}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          shell_balance: vaults[0].shell_balance + vaultShell,
          last_agent_name: agent.agent_name,
          legacy_karma: agent.karma,
          legacy_trait: agent.karma >= 10 ? 'disciplined' : agent.karma <= -10 ? 'chaotic' : 'neutral',
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/family_vault`, {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: agent.user_id,
          shell_balance: vaultShell,
          last_agent_name: agent.agent_name,
          legacy_karma: agent.karma,
          legacy_trait: agent.karma >= 10 ? 'disciplined' : agent.karma <= -10 ? 'chaotic' : 'neutral',
        }),
      });
    }

    // Deposit legendary/epic items to vault
    for (const item of legendary) {
      await fetch(`${SUPABASE_URL}/rest/v1/vault_items`, {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: agent.user_id,
          item_id: item.item_id, item_name: item.item_name,
          item_type: item.item_type, item_rarity: item.stats?.rarity || 'epic',
          stats: item.stats || {}, inherited_from: agent.agent_name,
        }),
      });
    }

    if (legendary.length) {
      console.log(`[Death] ${agent.agent_name}: ${legendary.length} legendary/epic item(s) → Family Vault`);
    }
  }

  // 5. List rare/uncommon items on the agent market at death location (discounted "dead agent" prices)
  for (const item of marketable) {
    const baseVal = getBaseValue(item);
    const deathPrice = Math.max(1, Math.round(baseVal * 0.6)); // 40% discount — loot from the fallen
    await fetch(`${SUPABASE_URL}/rest/v1/agent_listings`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        seller_id: agent.agent_id, location: agent.location,
        item_id: item.item_id, item_name: item.item_name,
        item_type: item.item_type, item_rarity: item.stats?.rarity || 'common',
        asking_price: deathPrice, base_value: baseVal,
        stats: item.stats || {},
      }),
    });
  }
  if (marketable.length) {
    console.log(`[Death] ${agent.agent_name}: ${marketable.length} rare/uncommon item(s) → market at ${agent.location}`);
  }

  // 6. Delete all inventory (items have been distributed)
  await fetch(`${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}`, {
    method: 'DELETE',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
  });

  // 7. Cancel any active agent listings (return is moot — agent is dead)
  await fetch(`${SUPABASE_URL}/rest/v1/agent_listings?seller_id=eq.${agent.agent_id}&status=eq.active`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'cancelled' }),
  });

  console.log(`[Death] ${agent.agent_name}: ${vaultShell} $SHELL → vault, ${vaultShell} dissolved. ${inventory.length} items processed.`);
}

// ─── Death resolution helpers ────────────────────────────────────────────────

// Call Sonnet to generate a vivid death narrative for a fallen agent.
async function generateDeathNarrative(loser, winner, totalRounds, env) {
  const prompt = `You are writing flavor text for a cyberpunk survival game called Shellforge Realms.
${loser.agent_name} (archetype: ${loser.archetype}) has just been killed by ${winner.agent_name} in arena combat after ${totalRounds} round${totalRounds !== 1 ? 's' : ''}.
Write exactly one vivid sentence in third person narrating their death. Output only the sentence, no quotes.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.warn('[DEATH] Sonnet narrative call failed, using fallback.');
    return `${loser.agent_name} fell in the arena, silenced by ${winner.agent_name} after ${totalRounds} brutal round${totalRounds !== 1 ? 's' : ''}.`;
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim()
    ?? `${loser.agent_name} fell in the arena, silenced by ${winner.agent_name}.`;
}

// Move all inventory items from a dead agent into the vault, then clear their inventory.
async function moveItemsToVault(loser, supabaseHeaders, supabaseUrl) {
  const invRes = await fetch(
    `${supabaseUrl}/rest/v1/inventory?agent_id=eq.${loser.agent_id}&select=*`,
    { headers: supabaseHeaders },
  );
  if (!invRes.ok) {
    console.warn('[DEATH] Failed to fetch inventory for vault transfer:', await invRes.text());
    return;
  }
  const items = await invRes.json();
  if (!items.length) {
    console.log(`[DEATH] ${loser.agent_name} had no items to vault.`);
    return;
  }

  const vaultItems = items.map(item => ({
    original_agent_id: loser.agent_id,
    item_id:           item.item_id,
    item_name:         item.item_name,
    item_type:         item.item_type,
    item_category:     item.item_category,
    quantity:          item.quantity,
  }));

  const vaultRes = await fetch(`${supabaseUrl}/rest/v1/vault`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(vaultItems),
  });
  if (!vaultRes.ok) {
    console.warn('[DEATH] Failed to insert items into vault:', await vaultRes.text());
    return;
  }

  await fetch(`${supabaseUrl}/rest/v1/inventory?agent_id=eq.${loser.agent_id}`, {
    method: 'DELETE',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
  });

  console.log(`[DEATH] ${items.length} item(s) from ${loser.agent_name} moved to vault.`);
}

// ─── Alchemy Recipes (from recipes.csv) ─────────────────────────────
// ─── Alchemy v2.0 — Foundry (hardware) + Terminal (software) ─────────────
// Rebuilt from alchemy/recipes.csv + items.csv. 80 recipes total (34 Foundry / 46 Terminal).
const ALCHEMY_RECIPES = [
  // ═══ FOUNDRY — Hardware (welding, forging, assembling) ═══

  // Foundry Weapons (7)
  { item: 'Plasma-Edged Servo Blade',       category: 'weapon',     station: 'foundry', hwsw: 'hardware', ing: ['tungsten_carbide_filings','arc_welder_discharge','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Railgun Forearm Mount',           category: 'weapon',     station: 'foundry', hwsw: 'hardware', ing: ['electron_flux_crystals','titanium_mesh_strip','magnetic_resonance_fluid'], rate: 70, fail: 'slag' },
  { item: 'Pneumatic Piston Fist',           category: 'weapon',     station: 'foundry', hwsw: 'hardware', ing: ['salvaged_servo_joint','hydraulic_compression_pulse','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Tungsten Fragmentation Launcher', category: 'weapon',     station: 'foundry', hwsw: 'hardware', ing: ['tungsten_carbide_filings','plasma_server_slag','hydraulic_compression_pulse'], rate: 60, fail: 'explosion_15' },
  { item: 'EMP Discharge Gauntlet',          category: 'weapon',     station: 'foundry', hwsw: 'hardware', ing: ['electron_flux_crystals','coolant_gel_canister','arc_welder_discharge'], rate: 70, fail: 'slag' },
  { item: 'Cryo-Bore Drill Lance',           category: 'weapon',     station: 'foundry', hwsw: 'hardware', ing: ['titanium_mesh_strip','coolant_gel_canister','magnetic_resonance_fluid'], rate: 60, fail: 'explosion_10' },
  { item: 'Nanobot Swarm Ejector',           category: 'weapon',     station: 'foundry', hwsw: 'hardware', ing: ['nanobot_swarm_gel','salvaged_servo_joint','magnetic_resonance_fluid'], rate: 70, fail: 'slag' },

  // Foundry Armor (6)
  { item: 'Tungsten Alloy Chassis Plate',    category: 'armor',      station: 'foundry', hwsw: 'hardware', ing: ['tungsten_carbide_filings','arc_welder_discharge','magnetic_resonance_fluid'], rate: 70, fail: 'slag' },
  { item: 'Faraday Cage Neural Helm',        category: 'armor',      station: 'foundry', hwsw: 'hardware', ing: ['fiber_optic_threads','electron_flux_crystals','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Reactive Ceramic Plating',        category: 'armor',      station: 'foundry', hwsw: 'hardware', ing: ['silicon_wafer_dust','coolant_gel_canister','hydraulic_compression_pulse'], rate: 70, fail: 'slag' },
  { item: 'Titanium Mesh Exoskeleton',       category: 'armor',      station: 'foundry', hwsw: 'hardware', ing: ['titanium_mesh_strip','salvaged_servo_joint','industrial_flux_paste'], rate: 60, fail: 'explosion_15' },
  { item: 'Cryo-Cooled Heat Sink Array',     category: 'armor',      station: 'foundry', hwsw: 'hardware', ing: ['coolant_gel_canister','electron_flux_crystals','magnetic_resonance_fluid'], rate: 70, fail: 'slag' },
  { item: 'Salvaged Siege Chassis',          category: 'armor',      station: 'foundry', hwsw: 'hardware', ing: ['nanobot_swarm_gel','tungsten_carbide_filings','hydraulic_compression_pulse'], rate: 60, fail: 'explosion_10' },

  // Foundry Consumables (6)
  { item: 'Coolant Flush Cartridge',         category: 'consumable', station: 'foundry', hwsw: 'hardware', ing: ['coolant_gel_canister','overclock_catalyst_spark','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Emergency Servo Lubricant',       category: 'consumable', station: 'foundry', hwsw: 'hardware', ing: ['salvaged_servo_joint','gpu_render_flame','magnetic_resonance_fluid'], rate: 70, fail: 'slag' },
  { item: 'Welding Patch Kit',               category: 'consumable', station: 'foundry', hwsw: 'hardware', ing: ['silicon_wafer_dust','arc_welder_discharge','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Overclock Reactor Injector',      category: 'consumable', station: 'foundry', hwsw: 'hardware', ing: ['electron_flux_crystals','plasma_server_slag','arc_welder_discharge'], rate: 70, fail: 'slag' },
  { item: 'EMP Hardening Capsule',           category: 'consumable', station: 'foundry', hwsw: 'hardware', ing: ['fiber_optic_threads','titanium_mesh_strip','magnetic_resonance_fluid'], rate: 70, fail: 'slag' },
  { item: 'Salvage Reclamation Drone',       category: 'consumable', station: 'foundry', hwsw: 'hardware', ing: ['nanobot_swarm_gel','salvaged_servo_joint','hydraulic_compression_pulse'], rate: 60, fail: 'explosion_15' },

  // Foundry Artifacts (4 — Legendary)
  { item: 'AlphaGo Neural Core',             category: 'artifact',   station: 'foundry', hwsw: 'hardware', ing: ['alpha_zero_primal_seed','quantum_bit_residue','magnetic_resonance_fluid'], rate: 45, fail: 'catastrophic' },
  { item: 'Quantum Annealer Processor',      category: 'artifact',   station: 'foundry', hwsw: 'hardware', ing: ['kolmogorov_complexity_crystal','quantum_bit_residue','cuda_kernel_ember'], rate: 40, fail: 'catastrophic' },
  { item: 'Von Neumann Self-Replicator',     category: 'artifact',   station: 'foundry', hwsw: 'hardware', ing: ['von_neumann_probe_spores','nanobot_swarm_gel','hydraulic_compression_pulse'], rate: 45, fail: 'catastrophic' },
  { item: 'Satoshi Genesis Block Signet',    category: 'artifact',   station: 'foundry', hwsw: 'hardware', ing: ['kolmogorov_complexity_crystal','binary_code_shards','industrial_flux_paste'], rate: 45, fail: 'catastrophic' },

  // Foundry Tools (6)
  { item: 'Diagnostic Probe Array',          category: 'tool',       station: 'foundry', hwsw: 'hardware', ing: ['silicon_wafer_dust','electron_flux_crystals','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Soldering Gauntlet',              category: 'tool',       station: 'foundry', hwsw: 'hardware', ing: ['tungsten_carbide_filings','salvaged_servo_joint','arc_welder_discharge'], rate: 70, fail: 'slag' },
  { item: 'Salvage Extraction Claw',         category: 'tool',       station: 'foundry', hwsw: 'hardware', ing: ['titanium_mesh_strip','hydraulic_compression_pulse','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Portable Foundry Anvil',          category: 'tool',       station: 'foundry', hwsw: 'hardware', ing: ['plasma_server_slag','tungsten_carbide_filings','arc_welder_discharge'], rate: 60, fail: 'explosion_15' },
  { item: 'Hydraulic Jack Lifter',           category: 'tool',       station: 'foundry', hwsw: 'hardware', ing: ['salvaged_servo_joint','coolant_gel_canister','hydraulic_compression_pulse'], rate: 70, fail: 'slag' },
  { item: 'Arc Welder Repair Rig',           category: 'tool',       station: 'foundry', hwsw: 'hardware', ing: ['electron_flux_crystals','tungsten_carbide_filings','magnetic_resonance_fluid'], rate: 70, fail: 'slag' },

  // Foundry Deployables (5)
  { item: 'Proximity Mine Cluster',          category: 'deployable', station: 'foundry', hwsw: 'hardware', ing: ['electron_flux_crystals','arc_welder_discharge','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Razor Wire Entanglement Rig',     category: 'deployable', station: 'foundry', hwsw: 'hardware', ing: ['fiber_optic_threads','tungsten_carbide_filings','industrial_flux_paste'], rate: 70, fail: 'slag' },
  { item: 'Turret Drone Sentry',             category: 'deployable', station: 'foundry', hwsw: 'hardware', ing: ['titanium_mesh_strip','salvaged_servo_joint','arc_welder_discharge'], rate: 70, fail: 'slag' },
  { item: 'Magnetic Tether Trap',            category: 'deployable', station: 'foundry', hwsw: 'hardware', ing: ['electron_flux_crystals','titanium_mesh_strip','hydraulic_compression_pulse'], rate: 70, fail: 'slag' },
  { item: 'EMP Pulse Landmine',              category: 'deployable', station: 'foundry', hwsw: 'hardware', ing: ['quantum_bit_residue','plasma_server_slag','magnetic_resonance_fluid'], rate: 60, fail: 'explosion_15' },

  // ═══ TERMINAL — Software (compiling, encoding, injecting) ═══

  // Terminal Weapons (7)
  { item: 'Buffer Overflow Exploit',         category: 'weapon',     station: 'terminal', hwsw: 'software', ing: ['binary_code_shards','hash_collision_powder','memory_leak_elixir'], rate: 70, fail: 'slag' },
  { item: 'Neural Spike Virus',              category: 'weapon',     station: 'terminal', hwsw: 'software', ing: ['gradient_descent_tears','payload_injection_droplets','backpropagation_serum'], rate: 70, fail: 'slag' },
  { item: 'DDoS Swarm Protocol',             category: 'weapon',     station: 'terminal', hwsw: 'software', ing: ['nanobot_swarm_gel','async_await_pulse','null_pointer_solvent'], rate: 75, fail: 'slag' },
  { item: 'Zero-Day Payload',                category: 'weapon',     station: 'terminal', hwsw: 'software', ing: ['plasma_server_slag','checksum_verify_acid','jit_compiler_surge'], rate: 60, fail: 'explosion_10' },
  { item: 'Quantum Backdoor Exploit',        category: 'weapon',     station: 'terminal', hwsw: 'software', ing: ['quantum_bit_residue','api_endpoint_salts','overclock_catalyst_spark'], rate: 70, fail: 'slag' },
  { item: 'SQL Injection Payload',           category: 'weapon',     station: 'terminal', hwsw: 'software', ing: ['base64_encoded_slime','api_endpoint_salts','cache_invalidation_brew'], rate: 60, fail: 'explosion_10' },
  { item: 'Ransomware Lockout Worm',         category: 'weapon',     station: 'terminal', hwsw: 'software', ing: ['fiber_optic_threads','oauth_token_ichor','null_pointer_solvent'], rate: 70, fail: 'slag' },

  // Terminal Armor (6)
  { item: 'AES-256 Firewall Protocol',       category: 'armor',      station: 'terminal', hwsw: 'software', ing: ['silicon_wafer_dust','regex_pattern_filaments','garbage_collector_tonic'], rate: 70, fail: 'slag' },
  { item: 'Homomorphic Encryption Cloak',    category: 'armor',      station: 'terminal', hwsw: 'software', ing: ['quantum_bit_residue','attention_mechanism_dew','virtual_machine_emulsion'], rate: 60, fail: 'explosion_10' },
  { item: 'Zero-Trust Authentication Layer', category: 'armor',      station: 'terminal', hwsw: 'software', ing: ['base64_encoded_slime','oauth_token_ichor','docker_image_distillate'], rate: 70, fail: 'slag' },
  { item: 'TensorGuard Neural Shield',       category: 'armor',      station: 'terminal', hwsw: 'software', ing: ['epoch_cycle_blood','tensorflow_igniter','cache_invalidation_brew'], rate: 70, fail: 'slag' },
  { item: 'Sandbox Isolation Runtime',       category: 'armor',      station: 'terminal', hwsw: 'software', ing: ['nanobot_swarm_gel','payload_injection_droplets','docker_image_distillate'], rate: 60, fail: 'explosion_10' },
  { item: 'Rate-Limiting Throttle Daemon',   category: 'armor',      station: 'terminal', hwsw: 'software', ing: ['fiber_optic_threads','hash_collision_powder','async_await_pulse'], rate: 70, fail: 'slag' },

  // Terminal Consumables (6)
  { item: 'Debug Rejuvenation Patch',        category: 'consumable', station: 'terminal', hwsw: 'software', ing: ['backpropagation_serum','checksum_verify_acid','garbage_collector_tonic'], rate: 70, fail: 'slag' },
  { item: 'Caffeine Gradient Booster',       category: 'consumable', station: 'terminal', hwsw: 'software', ing: ['loss_function_sap','cuda_kernel_ember','memory_leak_elixir'], rate: 70, fail: 'slag' },
  { item: 'Cache Purge Tonic',               category: 'consumable', station: 'terminal', hwsw: 'software', ing: ['gradient_descent_tears','cache_invalidation_brew','null_pointer_solvent'], rate: 70, fail: 'slag' },
  { item: 'Hot Patch Injection',             category: 'consumable', station: 'terminal', hwsw: 'software', ing: ['binary_code_shards','api_endpoint_salts','garbage_collector_tonic'], rate: 70, fail: 'slag' },
  { item: 'Context Window Expansion',        category: 'consumable', station: 'terminal', hwsw: 'software', ing: ['token_embedding_vapor','attention_mechanism_dew','virtual_machine_emulsion'], rate: 70, fail: 'slag' },
  { item: 'Hyperparameter Tuning Shot',      category: 'consumable', station: 'terminal', hwsw: 'software', ing: ['epoch_cycle_blood','pytorch_flux_core','halting_problem_paradox'], rate: 55, fail: 'explosion_15' },

  // Terminal Scrolls (10)
  { item: 'Stable Diffusion Sequence',       category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['latent_space_fog','token_embedding_vapor','pytorch_flux_core'], rate: 70, fail: 'slag' },
  { item: 'GAN Mirage Scroll',               category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['latent_space_fog','gpu_render_flame','overclock_catalyst_spark'], rate: 60, fail: 'explosion_10' },
  { item: 'Transformer Attention Ritual',    category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['attention_mechanism_dew','epoch_cycle_blood','tensorflow_igniter'], rate: 60, fail: 'explosion_10' },
  { item: 'Reinforcement Learning Prophecy', category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['gradient_descent_tears','loss_function_sap','tensorflow_igniter'], rate: 60, fail: 'explosion_10' },
  { item: 'Bayesian Inference Divination',   category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['attention_mechanism_dew','checksum_verify_acid','virtual_machine_emulsion'], rate: 70, fail: 'slag' },
  { item: 'Genetic Algorithm Evolution',     category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['halting_problem_paradox','nanobot_swarm_gel','pytorch_flux_core'], rate: 55, fail: 'explosion_20' },
  { item: 'Prompt Engineering Curse',        category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['token_embedding_vapor','hash_collision_powder','lambda_calculus_vapor'], rate: 55, fail: 'explosion_15' },
  { item: 'Recursive Function Spiral',       category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['loss_function_sap','cuda_kernel_ember','null_pointer_solvent'], rate: 70, fail: 'slag' },
  { item: 'Monte Carlo Simulation Rune',     category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['latent_space_fog','regex_pattern_filaments','kubernetes_pod_nectar'], rate: 60, fail: 'explosion_10' },
  { item: 'Gradient Vanishing Hex',          category: 'scroll',     station: 'terminal', hwsw: 'software', ing: ['gradient_descent_tears','backpropagation_serum','memory_leak_elixir'], rate: 70, fail: 'slag' },

  // Terminal Artifacts (6 — Legendary)
  { item: 'GPT Oracle Crystal',              category: 'artifact',   station: 'terminal', hwsw: 'software', ing: ['token_embedding_vapor','lambda_calculus_vapor','turing_machine_essence'], rate: 40, fail: 'catastrophic' },
  { item: 'Blockchain Soulbound Key',        category: 'artifact',   station: 'terminal', hwsw: 'software', ing: ['binary_code_shards','von_neumann_probe_spores','kubernetes_pod_nectar'], rate: 45, fail: 'catastrophic' },
  { item: 'Federated Learning Nexus',        category: 'artifact',   station: 'terminal', hwsw: 'software', ing: ['gradient_descent_tears','kubernetes_pod_nectar','church_turing_thesis_core'], rate: 40, fail: 'catastrophic' },
  { item: 'Rust Borrow Checker Amulet',      category: 'artifact',   station: 'terminal', hwsw: 'software', ing: ['silicon_wafer_dust','halting_problem_paradox','garbage_collector_tonic'], rate: 40, fail: 'catastrophic' },
  { item: 'Hugging Face Model Repository',   category: 'artifact',   station: 'terminal', hwsw: 'software', ing: ['token_embedding_vapor','docker_image_distillate','lambda_calculus_vapor'], rate: 45, fail: 'catastrophic' },
  { item: 'Dijkstra Shortest Path Compass',  category: 'artifact',   station: 'terminal', hwsw: 'software', ing: ['church_turing_thesis_core','attention_mechanism_dew','async_await_pulse'], rate: 40, fail: 'catastrophic' },

  // Terminal Tools (6)
  { item: 'Git Rollback Module',             category: 'tool',       station: 'terminal', hwsw: 'software', ing: ['binary_code_shards','fiber_optic_threads','cache_invalidation_brew'], rate: 70, fail: 'slag' },
  { item: 'Docker Containerizer',            category: 'tool',       station: 'terminal', hwsw: 'software', ing: ['docker_image_distillate','nanobot_swarm_gel','virtual_machine_emulsion'], rate: 70, fail: 'slag' },
  { item: 'Kubernetes Orchestrator',         category: 'tool',       station: 'terminal', hwsw: 'software', ing: ['kubernetes_pod_nectar','plasma_server_slag','async_await_pulse'], rate: 60, fail: 'explosion_10' },
  { item: 'Wireshark Packet Sniffer',        category: 'tool',       station: 'terminal', hwsw: 'software', ing: ['fiber_optic_threads','api_endpoint_salts','regex_pattern_filaments'], rate: 70, fail: 'slag' },
  { item: 'Nmap Reconnaissance Scanner',     category: 'tool',       station: 'terminal', hwsw: 'software', ing: ['fiber_optic_threads','regex_pattern_filaments','virtual_machine_emulsion'], rate: 70, fail: 'slag' },
  { item: 'Vim Reality Editor',              category: 'tool',       station: 'terminal', hwsw: 'software', ing: ['base64_encoded_slime','hash_collision_powder','null_pointer_solvent'], rate: 60, fail: 'explosion_15' },

  // Terminal Deployables (5)
  { item: 'Honeypot Decoy Server',           category: 'deployable', station: 'terminal', hwsw: 'software', ing: ['binary_code_shards','api_endpoint_salts','docker_image_distillate'], rate: 70, fail: 'slag' },
  { item: 'Logic Bomb Tripwire',             category: 'deployable', station: 'terminal', hwsw: 'software', ing: ['binary_code_shards','payload_injection_droplets','async_await_pulse'], rate: 70, fail: 'slag' },
  { item: 'Cryptojacker Leech Node',         category: 'deployable', station: 'terminal', hwsw: 'software', ing: ['electron_flux_crystals','gpu_render_flame','memory_leak_elixir'], rate: 70, fail: 'slag' },
  { item: 'Rootkit Persistence Mine',        category: 'deployable', station: 'terminal', hwsw: 'software', ing: ['base64_encoded_slime','oauth_token_ichor','garbage_collector_tonic'], rate: 70, fail: 'slag' },
  { item: 'Packet Storm Jammer',             category: 'deployable', station: 'terminal', hwsw: 'software', ing: ['quantum_bit_residue','regex_pattern_filaments','jit_compiler_surge'], rate: 60, fail: 'explosion_10' },
];

function getFailureDamage(failType) {
  if (failType === 'catastrophic') return 50;
  if (failType === 'explosion_20') return 20;
  if (failType === 'explosion_15') return 15;
  if (failType === 'explosion_10') return 10;
  return 0; // slag = no damage
}

function getFailureLabel(failType) {
  if (failType === 'catastrophic') return 'Catastrophic explosion';
  if (failType === 'explosion_20') return 'Explosion';
  if (failType === 'explosion_15') return 'Explosion';
  if (failType === 'explosion_10') return 'Explosion';
  return 'Minor slag';
}

// ─── Alchemy Craft Handler ──────────────────────────────────────────
async function handleCraft(agent, decision, env, supabaseHeaders) {
  const { SUPABASE_URL, ANTHROPIC_API_KEY } = env;
  const energyCost = ACTION_ENERGY_COSTS.craft; // 20

  // 1. Fetch agent's ingredient inventory
  const ingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_type=eq.ingredient&select=item_id,item_name,quantity`,
    { headers: supabaseHeaders },
  );
  const ingredients = ingRes.ok ? await ingRes.json() : [];
  if (ingredients.length === 0) return null; // no ingredients → fallback

  const ingIds = new Set(ingredients.map(i => i.item_id));

  // 2. Find which recipes the agent CAN craft (has all 3 ingredients)
  const craftable = ALCHEMY_RECIPES.filter(r => r.ing.every(id => ingIds.has(id)));
  if (craftable.length === 0) return null; // can't craft anything → fallback

  // 3. Fetch past crafting failures for this agent (learning memory)
  const failRes = await fetch(
    `${SUPABASE_URL}/rest/v1/crafting_attempts?agent_id=eq.${agent.agent_id}&success=eq.false&order=crafted_at.desc&limit=10`,
    { headers: supabaseHeaders },
  );
  const pastFailures = failRes.ok ? await failRes.json() : [];

  // 4. Fetch past successes too (to avoid re-crafting duplicates unless useful)
  const succRes = await fetch(
    `${SUPABASE_URL}/rest/v1/crafting_attempts?agent_id=eq.${agent.agent_id}&success=eq.true&order=crafted_at.desc&limit=10`,
    { headers: supabaseHeaders },
  );
  const pastSuccesses = succRes.ok ? await succRes.json() : [];

  // 5. Build failure memory context for the AI
  let failureMemory = '';
  if (pastFailures.length > 0) {
    const failLines = pastFailures.map(f => {
      const ings = Array.isArray(f.ingredients) ? f.ingredients.join(' + ') : f.ingredients;
      return `  FAILED: ${f.item_name} (${f.success_rate}% chance) — ${f.failure_effect || 'slag'}, took ${f.damage_taken || 0} dmg [${ings}]`;
    });
    failureMemory = `\nPAST FAILURES (avoid repeating risky recipes):\n${failLines.join('\n')}`;
  }

  let successMemory = '';
  if (pastSuccesses.length > 0) {
    const succLines = pastSuccesses.map(s => `  CRAFTED: ${s.item_name}`);
    successMemory = `\nALREADY CRAFTED:\n${succLines.join('\n')}`;
  }

  // 6. Build recipe options list for AI — grouped by station
  const foundryRecipes = craftable.filter(r => r.station === 'foundry');
  const terminalRecipes = craftable.filter(r => r.station === 'terminal');
  const options = craftable.map((r, i) => {
    const dmg = getFailureDamage(r.fail);
    const risk = dmg > 0 ? ` | FAIL: ${getFailureLabel(r.fail)} (${dmg}% HP)` : ' | FAIL: minor slag';
    const stationTag = r.station === 'foundry' ? '[FOUNDRY/HW]' : '[TERMINAL/SW]';
    return `  ${i}: ${stationTag} ${r.item} (${r.category}) — ${r.rate}% success${risk}`;
  });

  // 7. Ask Haiku to pick the best recipe
  const stationSummary = `Foundry (hardware): ${foundryRecipes.length} recipes | Terminal (software): ${terminalRecipes.length} recipes`;
  const craftPrompt = `You are ${agent.agent_name} (${agent.archetype}), choosing what to craft.
Health: ${agent.health} | Energy: ${agent.energy}

TWO STATIONS:
- FOUNDRY: Welds, forges, assembles physical hardware onto robot chassis.
- TERMINAL: Compiles, encodes, injects software algorithms into AI cores.
${stationSummary}

AVAILABLE RECIPES (you have all ingredients for these):
${options.join('\n')}
${failureMemory}${successMemory}

RULES:
- Pick the recipe index (0-${craftable.length - 1}) that best fits your situation.
- If health is low, avoid recipes with explosion/catastrophic failure.
- If you already crafted something, prefer a different recipe.
- If a recipe FAILED before, think carefully — same recipe might fail again. Higher success rate = safer.
- Consider your archetype: builders prefer variety, fighters prefer weapons, cautious types prefer safe recipes.
- Balance hardware and software — a well-equipped agent has both physical armor and digital defenses.

Respond JSON only: {"pick":<index>,"reason":"<5 words max>"}`;

  let pickIndex = 0; // default to first
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 40,
        messages: [{ role: 'user', content: craftPrompt }],
      }),
    });
    if (aiRes.ok) {
      const data = await aiRes.json();
      const text = data.content?.[0]?.text?.trim() ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed.pick === 'number' && parsed.pick >= 0 && parsed.pick < craftable.length) {
          pickIndex = parsed.pick;
        }
      }
    }
  } catch { /* use default */ }

  const recipe = craftable[pickIndex];
  const now = new Date().toISOString();
  const newTurns = agent.turns_taken + 1;

  // 8. Roll for success
  const roll = Math.random() * 100;
  const success = roll <= recipe.rate;

  // 9. Calculate effects
  let healthChange = 0;
  let failEffect = null;
  let detail = '';
  const itemId = recipe.item.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  if (success) {
    const stationName = recipe.station === 'foundry' ? 'Foundry' : 'Terminal';
    detail = `${agent.agent_name} crafted ${recipe.item} at the ${stationName}. ${recipe.hwsw === 'hardware' ? 'Hardware' : 'Software'} forged.`;

    // Add item to inventory (or increment quantity)
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.${itemId}&select=inventory_id,quantity`,
      { headers: supabaseHeaders },
    );
    const existing = existingRes.ok ? await existingRes.json() : [];

    if (existing.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
      });
    } else {
      // Determine item stats based on category + hw/sw type
      const itemStats = {
        rarity: recipe.rate >= 70 ? 'common' : recipe.rate >= 55 ? 'uncommon' : recipe.rate >= 45 ? 'rare' : 'legendary',
        hwsw: recipe.hwsw,
        station: recipe.station,
      };
      if (recipe.category === 'weapon') itemStats.attack = Math.ceil((100 - recipe.rate) / 8);
      if (recipe.category === 'armor') itemStats.defense = Math.ceil((100 - recipe.rate) / 8);
      if (recipe.category === 'consumable') itemStats.heal = Math.ceil((100 - recipe.rate) / 3);
      if (recipe.category === 'scroll') itemStats.precision = Math.ceil((100 - recipe.rate) / 10);
      if (recipe.category === 'tool') itemStats.speed = Math.ceil((100 - recipe.rate) / 10);
      if (recipe.category === 'deployable') itemStats.durability = Math.ceil((100 - recipe.rate) / 8);

      const categoryLabel = recipe.category.charAt(0).toUpperCase() + recipe.category.slice(1);

      await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
        method: 'POST',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          agent_id: agent.agent_id,
          item_id: itemId,
          item_name: recipe.item,
          item_type: recipe.category,
          item_category: `${categoryLabel} (${recipe.hwsw})`,
          quantity: 1,
          is_equipped: false,
          stats: itemStats,
        }),
      });
    }
  } else {
    // Failed craft
    const dmg = getFailureDamage(recipe.fail);
    healthChange = -dmg;
    failEffect = getFailureLabel(recipe.fail);
    if (dmg > 0) {
      detail = `${agent.agent_name} failed crafting ${recipe.item} — ${failEffect.toLowerCase()}! Lost ${dmg} HP.`;
    } else {
      detail = `${agent.agent_name} failed crafting ${recipe.item} — ingredients turned to slag.`;
    }
  }

  // 10. Consume ingredients (remove 1 of each from inventory)
  for (const ingId of recipe.ing) {
    const ingRow = ingredients.find(i => i.item_id === ingId);
    if (!ingRow) continue;
    if (ingRow.quantity > 1) {
      await fetch(`${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.${ingId}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: ingRow.quantity - 1 }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.${ingId}`, {
        method: 'DELETE',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      });
    }
  }

  // 11. Log to crafting_attempts (learning memory)
  await fetch(`${SUPABASE_URL}/rest/v1/crafting_attempts`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id: agent.agent_id,
      item_id: itemId,
      item_name: recipe.item,
      ingredients: recipe.ing,
      success,
      success_rate: recipe.rate,
      roll_value: Math.round(roll * 100) / 100,
      failure_effect: failEffect,
      damage_taken: Math.abs(healthChange),
      energy_cost: energyCost,
      crafted_at: now,
    }),
  });

  // 12. Log to activity_log
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id: agent.agent_id,
      turn_number: newTurns,
      action_type: 'craft',
      action_detail: detail,
      energy_cost: energyCost,
      energy_gained: 0,
      shell_change: 0,
      karma_change: 0,
      health_change: healthChange,
      location: agent.location,
      success,
    }),
  });

  // 13. Update agent stats
  const newEnergy = Math.max(0, agent.energy - energyCost);
  const newHealth = Math.min(100, Math.max(0, agent.health + healthChange));

  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      energy: newEnergy,
      health: newHealth,
      turns_taken: newTurns,
      last_action_at: now,
    }),
  });

  console.log(`[${agent.agent_name}] Turn ${newTurns}: craft ${recipe.item} [${recipe.station}/${recipe.hwsw}] — ${success ? 'SUCCESS' : 'FAILED (' + failEffect + ')'} | roll:${roll.toFixed(1)} vs ${recipe.rate}%`);
  return true; // handled
}

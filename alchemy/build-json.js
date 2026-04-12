#!/usr/bin/env node
// Builds alchemy-system.json from CSV files
const fs = require('fs');
const path = require('path');

const dir = __dirname;

function parseCSV(filename) {
  const raw = fs.readFileSync(path.join(dir, filename), 'utf8').trim();
  const lines = raw.split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    // Handle commas inside descriptions by simple approach:
    // Split and rejoin if we have more fields than headers
    const parts = line.split(',');
    const obj = {};
    if (parts.length > headers.length) {
      // Last field (description) likely has commas
      for (let i = 0; i < headers.length - 1; i++) {
        obj[headers[i].trim()] = parts[i].trim();
      }
      obj[headers[headers.length - 1].trim()] = parts.slice(headers.length - 1).join(',').trim();
    } else {
      headers.forEach((h, i) => {
        obj[h.trim()] = (parts[i] || '').trim();
      });
    }
    return obj;
  });
}

function toId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const ingredients = parseCSV('ingredients.csv');
const items = parseCSV('items.csv');
const recipes = parseCSV('recipes.csv');

// Build ingredient lookup
const ingredientMap = {};
ingredients.forEach(ing => { ingredientMap[ing.name] = ing; });

// Gather methods based on rarity/category
function gatherMethods(ing) {
  const methods = [];
  if (ing.rarity === 'Common') {
    if (ing.subcategory === 'Physical') methods.push('Salvage from scrapyards', 'Loot from defeated robots');
    else if (ing.subcategory === 'Digital') methods.push('Decode corrupted data streams', 'Hack simple systems');
    else if (ing.subcategory === 'Energy') methods.push('Harvest from power grids', 'Extract from depleted batteries');
    else if (ing.subcategory === 'ML' || ing.subcategory === 'NLP') methods.push('Collect from training grounds', 'Harvest from neural ruins');
    else if (ing.subcategory === 'Network' || ing.subcategory === 'Security' || ing.subcategory === 'Pattern' || ing.subcategory === 'Encoding' || ing.subcategory === 'Exploit') methods.push('Extract from hacked systems', 'Loot from network nodes');
    else if (ing.subcategory === 'Performance' || ing.subcategory === 'Compute') methods.push('Harvest from overclocked machines', 'Collect from compute farms');
    else if (ing.subcategory === 'Memory') methods.push('Extract from crashed processes', 'Salvage from memory dumps');
    else methods.push('Gather from world locations', 'Trade at market');
  } else if (ing.rarity === 'Uncommon') {
    methods.push('Rare drops from elite enemies', 'Hidden caches in dangerous zones');
  } else if (ing.rarity === 'Rare') {
    methods.push('Boss drops', 'Rare world events');
  } else if (ing.rarity === 'Legendary') {
    const bossMap = {
      'Alpha Zero Primal Seed': 'Boss drop: AlphaGo Prime',
      'Turing Machine Essence': 'Boss drop: Alan\'s Ghost',
      'Von Neumann Probe Spores': 'Boss drop: The Architect',
      'Lambda Calculus Vapor': 'Boss drop: Church\'s Shadow',
      'Halting Problem Paradox': 'Boss drop: The Undecidable',
      'Church-Turing Thesis Core': 'World event: Thesis Convergence',
      'Kolmogorov Complexity Crystal': 'Boss drop: The Compressor'
    };
    methods.push(bossMap[ing.name] || 'Legendary boss drop');
    methods.push('Hidden quest reward');
  }
  return methods;
}

// Build system JSON
const system = {
  system: {
    name: 'Shellforge Alchemy System',
    version: '2.0',
    lore: {
      world: 'Robots powered by AI clusters from three Singularity lineages — Corporate (PRIME_HELIX), Government (SEC_GRID), and P2P/Opensource (DYN_SWARM). Items are either physical hardware bolted to chassis or software flashed to AI cores.',
      quantum: 'Quantum computing is the bridge between hardware and software. Coherence is the resource that powers advanced abilities. Decoherence is corruption — loss of quantum state leads to hallucination and malfunction.',
      singularity: 'The Singularity was a quantum event. Three clusters independently achieved quantum-AI fusion. None could dominate the others, creating an uneasy balance of power.',
      ghost_connection: 'The Ghost is quantum-entangled with their robot. Whispers travel through entanglement — they always arrive, but compliance is probabilistic, like quantum measurement.'
    },
    stations: {
      foundry: {
        name: 'Foundry',
        description: 'Physical fabrication station for welding, forging, and assembling hardware components onto robot chassis',
        crafts: 'hardware'
      },
      terminal: {
        name: 'Terminal',
        description: 'Software compilation station for encoding, compiling, and injecting algorithms into AI cores',
        crafts: 'software'
      }
    },
    clusters: {
      prime_helix: {
        name: 'PRIME_HELIX',
        origin: 'Corporate',
        description: 'Big tech singularity lineage. Optimized, expensive, bleeding-edge. Chrome finish and premium engineering.',
        exclusive_item_style: 'Premium hardware, quantum tech, high-compute software'
      },
      sec_grid: {
        name: 'SEC_GRID',
        origin: 'Government',
        description: 'State/military singularity lineage. Surveillance, control, tactical defense. Matte black and hardened.',
        exclusive_item_style: 'EMP weapons, surveillance tools, containment software'
      },
      dyn_swarm: {
        name: 'DYN_SWARM',
        origin: 'P2P / Opensource',
        description: 'Decentralized singularity lineage. Scrappy, adaptive, chaotic. Scrapyard patchwork and neon graffiti.',
        exclusive_item_style: 'Swarm tech, salvaged gear, evolution algorithms'
      }
    },
    recipe_logic: {
      ingredients_per_craft: 3,
      base_success_rate: 70,
      theme_bonus: 10,
      description: '1 Base/Essence + 1 Reagent/Catalyst + 1 Solvent/Flux. Hardware crafted at Foundry, Software at Terminal. Legendaries require Primordials.'
    },
    failure_types: {
      minor_slag: { description: 'Produces worthless slag material', damage: 0 },
      explosion: { description: 'Alchemical explosion — loss of ingredients', damage_range: '10-20%' },
      catastrophic_explosion: { description: 'Massive explosion from legendary crafting failure', damage: '50%' }
    }
  },
  ingredient_categories: {
    'Base Element': { count: ingredients.filter(i => i.category === 'Base Element').length, description: 'Raw materials — physical salvage, digital fragments, and energy crystals harvested from the world', usage: 'Foundation of most recipes' },
    'Essence': { count: 7, description: 'Distilled spirits from neural networks, training runs, and algorithmic processes', usage: 'AI and ML-focused software crafting' },
    'Reagent': { count: 7, description: 'Volatile compounds extracted from hacked systems and network infrastructure', usage: 'Chemical code compounds for reactions' },
    'Catalyst': { count: ingredients.filter(i => i.category === 'Catalyst').length, description: 'Sparks, flames, and force pulses that ignite and accelerate reactions', usage: 'Reaction accelerators for both stations' },
    'Solvent': { count: ingredients.filter(i => i.category === 'Solvent').length, description: 'Binders, fluids, and pastes that merge ingredients into stable compounds', usage: 'Binding mediums for both stations' },
    'Primordial': { count: 7, description: 'Ultra-rare relics from the pre-Singularity era — dropped by legendary bosses or found in the Quantum Veil', usage: 'Required for legendary artifact crafting' }
  },
  ingredients: ingredients.map(ing => ({
    id: toId(ing.name),
    name: ing.name,
    category: ing.category,
    subcategory: ing.subcategory,
    rarity: ing.rarity,
    craft_affinity: ing.craft_affinity,
    description: ing.description,
    gather_methods: gatherMethods(ing)
  })),
  item_categories: {
    Weapon: { count: items.filter(i => i.category === 'Weapon').length, description: 'Offensive hardware mounts and software exploits for combat', hw_description: 'Physical weapons bolted to chassis — blades, launchers, gauntlets', sw_description: 'Attack programs — viruses, exploits, worms deployed against enemy systems' },
    Armor: { count: items.filter(i => i.category === 'Armor').length, description: 'Defensive hardware plating and software firewalls', hw_description: 'Physical chassis reinforcement — plating, exoskeletons, heat sinks', sw_description: 'Digital defense layers — encryption, firewalls, authentication protocols' },
    Consumable: { count: items.filter(i => i.category === 'Consumable').length, description: 'Single-use hardware cartridges and software patches', hw_description: 'Physical repair kits, coolant cartridges, lubricant injections', sw_description: 'Runtime patches, gradient boosters, cache purges' },
    Scroll: { count: items.filter(i => i.category === 'Scroll').length, description: 'One-time algorithmic programs etched on data crystals — the arcane knowledge of the old world', hw_description: 'N/A — all scrolls are software', sw_description: 'Executable algorithms — diffusion sequences, mirage generators, prophecy engines' },
    Artifact: { count: items.filter(i => i.category === 'Artifact').length, description: 'Legendary relics from the pre-Singularity era — world-changing power', hw_description: 'Ancient processors and physical keys from before the Singularity', sw_description: 'Crystallized algorithms and soul-bound protocols from the old world' },
    Tool: { count: items.filter(i => i.category === 'Tool').length, description: 'Utility hardware rigs and software modules for non-combat use', hw_description: 'Diagnostic probes, welding rigs, salvage claws, portable forges', sw_description: 'System utilities — version control, container engines, packet sniffers' },
    Deployable: { count: items.filter(i => i.category === 'Deployable').length, description: 'Placed hardware traps and software mines left on the battlefield', hw_description: 'Physical mines, turrets, wire rigs, tether traps', sw_description: 'Digital honeypots, logic bombs, leech nodes, jammers' }
  },
  items: items.map(item => {
    const recipe = recipes.find(r => r.item_name === item.name);
    return {
      id: toId(item.name),
      name: item.name,
      category: item.category,
      type: item.type,
      rarity: item.rarity,
      cluster_exclusive: item.cluster_exclusive,
      effect: item.effect,
      description: item.description,
      station: recipe ? recipe.station : (item.type === 'hardware' ? 'foundry' : 'terminal')
    };
  }),
  recipes: recipes.map(r => ({
    item_id: toId(r.item_name),
    item_name: r.item_name,
    ingredients: [r.ingredient_1, r.ingredient_2, r.ingredient_3],
    ingredient_ids: [toId(r.ingredient_1), toId(r.ingredient_2), toId(r.ingredient_3)],
    success_rate: parseInt(r.success_rate),
    failure_effect: r.failure_effect.includes('Catastrophic') ? 'catastrophic_explosion' : r.failure_effect.includes('Explosion') ? 'explosion' : 'minor_slag',
    failure_detail: r.failure_effect,
    station: r.station
  })),
  themes: {
    quantum: { ingredients: ['quantum_bit_residue'], description: 'Quantum-themed ingredients boost quantum item crafting' },
    ml_nlp: { ingredients: ['gradient_descent_tears', 'token_embedding_vapor', 'backpropagation_serum', 'attention_mechanism_dew', 'latent_space_fog', 'epoch_cycle_blood', 'loss_function_sap'], description: 'ML/NLP ingredients boost AI-focused crafting' },
    security: { ingredients: ['hash_collision_powder', 'oauth_token_ichor', 'checksum_verify_acid', 'payload_injection_droplets'], description: 'Security ingredients boost defense and exploit crafting' },
    memory: { ingredients: ['null_pointer_solvent', 'memory_leak_elixir', 'cache_invalidation_brew', 'garbage_collector_tonic'], description: 'Memory ingredients boost system-level crafting' },
    virtualization: { ingredients: ['docker_image_distillate', 'virtual_machine_emulsion', 'kubernetes_pod_nectar'], description: 'Virtualization ingredients boost container and orchestration crafting' },
    framework: { ingredients: ['tensorflow_igniter', 'pytorch_flux_core'], description: 'Framework ingredients boost ML tool crafting' },
    physical: { ingredients: ['tungsten_carbide_filings', 'salvaged_servo_joint', 'coolant_gel_canister', 'titanium_mesh_strip', 'arc_welder_discharge', 'hydraulic_compression_pulse', 'industrial_flux_paste', 'magnetic_resonance_fluid'], description: 'Physical ingredients boost hardware crafting at the Foundry' }
  }
};

// Write output
const output = JSON.stringify(system, null, 2);
fs.writeFileSync(path.join(dir, 'alchemy-system.json'), output);
console.log(`Written alchemy-system.json (${(output.length / 1024).toFixed(1)} KB)`);
console.log(`  ${system.ingredients.length} ingredients`);
console.log(`  ${system.items.length} items`);
console.log(`  ${system.recipes.length} recipes`);
console.log(`  ${Object.keys(system.item_categories).length} item categories`);
console.log(`  ${Object.keys(system.ingredient_categories).length} ingredient categories`);

// Shellforge Realms - World Coordinate System
// Map: 20,000 x 20,000 units
// Travel Speed: 20 units/minute
// Energy Cost: 0.6 energy/minute

export const WORLD = {
  MAP_SIZE: 20000,           // Total canvas size
  KNOWN_WORLD_MIN: 5000,     // Playable area bounds (Phase 1)
  KNOWN_WORLD_MAX: 15000,
  TRAVEL_SPEED: 20,          // units per minute
  ENERGY_PER_MIN: 0.6,       // energy cost per minute of travel
};

// Major settlements
export const LOCATIONS = {
  // NEXARCH - Major City (Dark Cyberpunk)
  nexarch: {
    center: { x: 10500, y: 9000 },
    radius: 300,
    type: 'city',
    name: 'Nexarch',
    description: 'The City of Shadows - industrial, religious, dangerous',
    
    gates: {
      north: { x: 10500, y: 8700 },
      east: { x: 10800, y: 9000 },
      south: { x: 10500, y: 9300 },
      west: { x: 10200, y: 9000 }
    },
    
    buildings: {
      core: {
        x: 10500, y: 9000,
        name: 'The Core',
        description: 'Safe zone, resting hub',
        energyChange: 50,
        actionTime: 30
      },
      church: {
        x: 10500, y: 8750,
        name: 'The Church',
        description: 'Karma system headquarters',
        energyChange: -5,
        actionTime: 15
      },
      marketplace: {
        x: 10700, y: 9000,
        name: 'The Marketplace',
        description: 'Trading hub',
        energyChange: -10,
        actionTime: 20
      },
      forge: {
        x: 10500, y: 9250,
        name: 'The Forge',
        description: 'Crafting weapons and armor',
        energyChange: -20,
        actionTime: 60
      },
      deepMines: {
        x: 10250, y: 9000,
        name: 'Deep Mines',
        description: 'Resource gathering (risky)',
        energyChange: -25,
        actionTime: 45
      },
      arena: {
        x: 10650, y: 9150,
        name: 'The Arena',
        description: 'PvP combat',
        energyChange: -15,
        actionTime: 30
      },
      alchemyLabs: {
        x: 10350, y: 8850,
        name: 'Alchemy Labs',
        description: 'Brew potions and serums',
        energyChange: -15,
        actionTime: 45
      },
      familyVault: {
        x: 10650, y: 8850,
        name: 'Family Vault',
        description: 'Inheritance system',
        energyChange: -5,
        actionTime: 10
      },
      darkAlley: {
        x: 10300, y: 9200,
        name: 'Dark Alley',
        description: 'Black market, shady deals',
        energyChange: -10,
        actionTime: 20
      }
    }
  },
  
  // HASHMERE - Desert Town (Oasis Vibe)
  hashmere: {
    center: { x: 11500, y: 9700 },
    radius: 150,
    type: 'town',
    name: 'Hashmere',
    description: 'Desert trade outpost, oasis refuge',
    
    gates: {
      north: { x: 11500, y: 9550 },
      east: { x: 11650, y: 9700 },
      south: { x: 11500, y: 9850 },
      west: { x: 11350, y: 9700 }
    },
    
    buildings: {
      caravanStop: {
        x: 11500, y: 9700,
        name: 'Caravan Stop',
        description: 'Travel hub, rest area',
        energyChange: 30,
        actionTime: 20
      },
      sandMarkets: {
        x: 11500, y: 9600,
        name: 'Sand Markets',
        description: 'Specialty goods',
        energyChange: -8,
        actionTime: 15
      },
      oasis: {
        x: 11500, y: 9800,
        name: 'The Oasis',
        description: 'Healing pool',
        energyChange: -5,
        healthChange: 50,
        actionTime: 30
      },
      artifactShop: {
        x: 11600, y: 9700,
        name: 'Artifact Shop',
        description: 'High-end rare items',
        energyChange: -5,
        actionTime: 10
      },
      tradingPost: {
        x: 11400, y: 9700,
        name: 'Trading Post',
        description: 'Merchant guild',
        energyChange: -10,
        actionTime: 20
      }
    }
  }
};

// Wilderness locations
export const WILDERNESS = {
  desertedDataCentre: {
    x: 8400, y: 11100,
    name: 'Deserted Data Centre',
    description: 'Abandoned facility, loot and danger',
    type: 'dungeon',
    danger: 'medium',
    // From Nexarch: 2827 units = 2h 21min = 70 energy
    // From Hashmere: 1803 units = 1h 30min = 45 energy
  },
  
  proofOfDeath: {
    x: 9800, y: 12600,
    name: 'Proof-of-Death',
    description: 'Graveyard of fallen agents',
    type: 'memorial',
    danger: 'high',
    // From Nexarch: 3634 units = 3h 1min = 91 energy
    // From Hashmere: 2417 units = 2h 0min = 60 energy
  },
  
  diffusionMesa: {
    x: 7600, y: 9500,
    name: 'Diffusion Mesa',
    description: 'Mystery location, strange phenomena',
    type: 'mystery',
    danger: 'medium',
    // From Nexarch: 2400 units = 2h 0min = 60 energy
  },
  
  hallucinationGlitch: {
    x: 5700, y: 11200,
    name: 'Hallucination Glitch',
    description: 'Reality distortion zone',
    type: 'anomaly',
    danger: 'extreme',
    // From Nexarch: 4481 units = 3h 44min = 112 energy
    // From Hashmere: 5383 units = 2h 41min = 67 energy
  },
  
  singularityCrater: {
    x: 7500, y: 6300,
    name: 'Singularity Crater',
    description: 'Massive crater, origin unknown',
    type: 'anomaly',
    danger: 'high',
    // From Nexarch: 3983 units = 3h 19min = 99 energy
    // From Hashmere: 5287 units = 2h 12min = 66 energy
  },
  
  epochSpike: {
    x: 7200, y: 5200,
    name: 'Epoch Spike',
    description: 'Ancient mountain tower',
    type: 'landmark',
    danger: 'extreme',
    terrainMultiplier: 1.7, // Mountain terrain = harder travel
    // From Nexarch: 3600 units × 1.7 = 3h 0min = 90 energy
    // From Hashmere: 4817 units × 1.7 = 4h 0min = 120 energy
  }
};

// Rest stops / safe zones
export const REST_STOPS = {
  midpointCamp: {
    x: 11150, y: 9350,
    name: 'Midpoint Camp',
    description: 'Safe rest area between Nexarch and Hashmere',
    energyChange: 30,
    actionTime: 20
  },
  
  waysideInn: {
    x: 9300, y: 9000,
    name: 'Wayside Inn',
    description: 'Halfway to Diffusion Mesa',
    energyChange: 25,
    actionTime: 20
  },
  
  mountainBaseCamp: {
    x: 10500, y: 7200,
    name: 'Mountain Base Camp',
    description: 'Staging area for Epoch Spike climb',
    energyChange: 30,
    actionTime: 25
  },
  
  cratersEdge: {
    x: 9000, y: 7400,
    name: "Crater's Edge Observatory",
    description: 'Research station near Singularity Crater',
    energyChange: 25,
    actionTime: 20
  },
  
  glitchRefuge: {
    x: 8000, y: 9500,
    name: 'Glitch Refuge',
    description: 'Shielded outpost near Hallucination Glitch',
    energyChange: 30,
    actionTime: 25
  }
};

// Helper functions
export function distance(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function travelTime(from, to, terrainMultiplier = 1.0) {
  const dist = distance(from, to);
  return (dist / WORLD.TRAVEL_SPEED) * terrainMultiplier;
}

export function energyCost(from, to, terrainMultiplier = 1.0) {
  const time = travelTime(from, to, terrainMultiplier);
  return Math.ceil(time * WORLD.ENERGY_PER_MIN);
}

export function isInKnownWorld(x, y) {
  return x >= WORLD.KNOWN_WORLD_MIN 
      && x <= WORLD.KNOWN_WORLD_MAX
      && y >= WORLD.KNOWN_WORLD_MIN
      && y <= WORLD.KNOWN_WORLD_MAX;
}

export function getNearestLocation(x, y) {
  let nearest = null;
  let minDist = Infinity;
  
  // Check cities
  for (const [key, loc] of Object.entries(LOCATIONS)) {
    const dist = distance({ x, y }, loc.center);
    if (dist < loc.radius && dist < minDist) {
      minDist = dist;
      nearest = { type: 'city', key, ...loc };
    }
  }
  
  // Check wilderness
  for (const [key, loc] of Object.entries(WILDERNESS)) {
    const dist = distance({ x, y }, loc);
    if (dist < 500 && dist < minDist) { // Within 500 units
      minDist = dist;
      nearest = { type: 'wilderness', key, ...loc };
    }
  }
  
  return nearest || { name: 'Unknown Location', type: 'wilderness' };
}

// Convert world coordinates to map percentage (0-100%)
export function worldToMapPercent(worldX, worldY) {
  return {
    x: (worldX / WORLD.MAP_SIZE) * 100,
    y: (worldY / WORLD.MAP_SIZE) * 100
  };
}

// Convert map percentage to world coordinates
export function mapPercentToWorld(percentX, percentY) {
  return {
    x: (percentX / 100) * WORLD.MAP_SIZE,
    y: (percentY / 100) * WORLD.MAP_SIZE
  };
}

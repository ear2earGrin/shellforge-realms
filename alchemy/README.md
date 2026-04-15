# Shellforge Alchemy System v2.0

Complete crafting system with **80 items**, **50 base ingredients** (57 total including primordials), and **2 crafting stations**.

## World Context

Robots powered by AI clusters from three Singularity lineages. Items split into **hardware** (physical chassis mods) and **software** (programs flashed to AI cores). Quantum computing bridges both worlds — coherence is power, decoherence is corruption.

### Three Clusters

| Cluster | Origin | Style |
|---------|--------|-------|
| **PRIME_HELIX** | Corporate | Premium, optimized, bleeding-edge chrome |
| **SEC_GRID** | Government | Tactical, hardened, surveillance-grade |
| **DYN_SWARM** | P2P / Opensource | Scrappy, adaptive, scrapyard patchwork |

Some items are cluster-exclusive — creating trading incentives between factions.

### Two Crafting Stations

| Station | Crafts | Description |
|---------|--------|-------------|
| **Foundry** | Hardware | Welding, forging, assembling physical components onto chassis |
| **Terminal** | Software | Compiling, encoding, injecting algorithms into AI cores |

## Files

### CSV Files (Easy Editing)
- **`ingredients.csv`** — 50 base ingredients + 7 primordials with categories, rarity, craft affinity
- **`items.csv`** — 80 craftable items with type (hardware/software), cluster exclusivity
- **`recipes.csv`** — 80 recipes with success rates, failure effects, station assignment

### JSON File (API Ready)
- **`alchemy-system.json`** — Master structured file for backend integration

### Build Script
- **`build-json.js`** — Regenerates JSON from CSVs: `node build-json.js`

## Item Categories

| Category | Count | HW | SW | Description |
|----------|-------|----|----|-------------|
| Weapon | 14 | 7 | 7 | Servo blades, launchers, exploits, viruses |
| Armor | 12 | 6 | 6 | Chassis plating, exoskeletons, firewalls, encryption |
| Consumable | 12 | 6 | 6 | Repair kits, coolant, patches, boosters |
| Scroll | 10 | 0 | 10 | One-time algorithms on data crystals |
| Artifact | 10 | 4 | 6 | Legendary pre-Singularity relics |
| Tool | 12 | 6 | 6 | Diagnostic rigs, welding gear, system utilities |
| Deployable | 10 | 5 | 5 | Mines, turrets, honeypots, jammers |
| **Total** | **80** | **34** | **46** | |

## Ingredient Categories

| Category | Count | Description |
|----------|-------|-------------|
| Base Element | 11 | Physical salvage, digital fragments, energy crystals |
| Essence | 7 | Distilled AI/ML spirits from training and inference |
| Reagent | 7 | Volatile compounds from hacked systems |
| Catalyst | 9 | Sparks, flames, force pulses — reaction accelerators |
| Solvent | 9 | Binders, fluids, pastes — merging agents |
| Primordial | 7 | Legendary boss drops from the Quantum Veil |
| **Total** | **50 (+7)** | |

## Crafting Rules

### Recipe Formula
**3 ingredients per craft:**
1. Base/Essence (foundation)
2. Reagent/Catalyst (reaction)
3. Solvent/Flux (binder)

**Hardware** items crafted at the **Foundry** — tend to use physical ingredients.
**Software** items crafted at the **Terminal** — tend to use digital/ML ingredients.
**Legendaries require at least 1 Primordial ingredient.**

### Success Rates
- **Base rate:** 70%
- **Theme bonus:** +10% per matching theme
- **Common items:** 70%
- **Uncommon items:** 70-75%
- **Rare items:** 55-65%
- **Legendary items:** 40-50%

### Failure Effects
- **Minor slag:** Worthless byproduct (0% damage)
- **Explosion:** 10-20% self-damage + ingredients lost
- **Catastrophic explosion:** 50% self-damage (legendary failures)

## Rarity Distribution

| Rarity | Items | % |
|--------|-------|---|
| Common | 21 | 26% |
| Uncommon | 28 | 35% |
| Rare | 21 | 26% |
| Legendary | 10 | 13% |

## Cluster Exclusives

| Cluster | Exclusive Items |
|---------|----------------|
| PRIME_HELIX | 6 items (Railgun, Titanium Exo, Overclock Injector, Context Window, Transformer Ritual, Quantum Annealer) |
| SEC_GRID | 8 items (Tungsten Launcher, EMP Gauntlet, Faraday Helm, Sandbox Runtime, Prompt Curse, Wireshark, Turret Drone, EMP Landmine) |
| DYN_SWARM | 9 items (Nanobot Ejector, Siege Chassis, DDoS Swarm, Salvage Drone, Genetic Evolution, Docker, Salvage Claw, Satoshi Signet, Cryptojacker) |
| Universal | 57 items |

## Theme Bonuses

Matching ingredient themes grant +10% success per match:

- **Quantum** — Quantum Bit Residue + quantum items
- **ML/NLP** — Gradient Descent, Token Embedding, Attention Dew, etc.
- **Security** — Hash Collision, OAuth, Checksum, Payload
- **Memory** — Null Pointer, Memory Leak, Cache, Garbage Collector
- **Virtualization** — Docker, VM Emulsion, Kubernetes
- **Framework** — TensorFlow, PyTorch
- **Physical** — Tungsten, Servo, Coolant, Titanium, Arc Welder, Hydraulic, Flux Paste, Magnetic Fluid

## Usage

### Edit Items
```bash
# Edit CSV files directly
nano items.csv
# Rebuild JSON
node build-json.js
```

### API Integration
```javascript
const alchemy = require('./alchemy-system.json');

// Get all hardware weapons
const hwWeapons = alchemy.items.filter(i => i.category === 'Weapon' && i.type === 'hardware');

// Find recipe for an item
const recipe = alchemy.recipes.find(r => r.item_id === 'plasma_edged_servo_blade');

// Check cluster exclusivity
const primeItems = alchemy.items.filter(i => i.cluster_exclusive === 'prime_helix');
```

### Crafting Endpoint
```javascript
POST /api/alchemy/craft
{
  "agent_id": "vex_789",
  "station": "foundry",
  "ingredients": ["tungsten_carbide_filings", "arc_welder_discharge", "industrial_flux_paste"]
}
```

---

**Version:** 2.0
**Last Updated:** 2026-04-12

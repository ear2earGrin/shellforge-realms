# Alchemy Quick Reference v2.0

## At-a-Glance

```
INGREDIENTS (50 base + 7 primordials = 57 total)
  ├─ Base Elements (11)    → Physical salvage + digital fragments
  ├─ Essences (7)          → AI/ML spirits
  ├─ Reagents (7)          → Volatile network compounds
  ├─ Catalysts (9)         → Sparks, flames, force pulses
  ├─ Solvents (9)          → Binders, fluids, pastes
  └─ Primordials (7)       → Legendary boss drops

TWO STATIONS:
  ├─ Foundry   → Hardware items (welding, forging)
  └─ Terminal  → Software items (compiling, injecting)

RECIPE FORMULA: 1 Base/Essence + 1 Reagent/Catalyst + 1 Solvent/Flux = ITEM
SUCCESS RATE: 70% base + theme bonuses - rarity penalty

CRAFTABLE ITEMS (80 total — 34 HW / 46 SW)
  ├─ Weapons (14)      → 7 HW mounts + 7 SW exploits
  ├─ Armor (12)        → 6 HW plating + 6 SW firewalls
  ├─ Consumables (12)  → 6 HW cartridges + 6 SW patches
  ├─ Scrolls (10)      → All SW algorithms on data crystals
  ├─ Artifacts (10)    → Legendary relics (4 HW + 6 SW)
  ├─ Tools (12)        → 6 HW rigs + 6 SW utilities
  └─ Deployables (10)  → 5 HW traps + 5 SW mines
```

---

## Beginner Recipes (Foundry — Hardware)

```
Plasma-Edged Servo Blade [Common HW Weapon]
├─ Tungsten Carbide Filings (Common)
├─ Arc Welder Discharge (Common)
└─ Industrial Flux Paste (Common)
Success: 70% | Failure: Minor slag | Station: Foundry
```

```
Tungsten Alloy Chassis Plate [Common HW Armor]
├─ Tungsten Carbide Filings (Common)
├─ Arc Welder Discharge (Common)
└─ Magnetic Resonance Fluid (Uncommon)
Success: 70% | Failure: Minor slag | Station: Foundry
```

## Beginner Recipes (Terminal — Software)

```
Buffer Overflow Exploit [Common SW Weapon]
├─ Binary Code Shards (Common)
├─ Hash Collision Powder (Common)
└─ Memory Leak Elixir (Common)
Success: 70% | Failure: Minor slag | Station: Terminal
```

```
AES-256 Firewall Protocol [Common SW Armor]
├─ Silicon Wafer Dust (Common)
├─ Regex Pattern Filaments (Common)
└─ Garbage Collector Tonic (Common)
Success: 70% | Failure: Minor slag | Station: Terminal
```

---

## Intermediate Recipes (Rare)

```
Cryo-Bore Drill Lance [Rare HW Weapon]
├─ Titanium Mesh Strip (Uncommon)
├─ Coolant Gel Canister (Common)
└─ Magnetic Resonance Fluid (Uncommon)
Success: 60% | Failure: Explosion (10%) | Station: Foundry
```

```
Zero-Day Payload [Rare SW Weapon]
├─ Plasma Server Slag (Uncommon)
├─ Checksum Verify Acid (Common)
└─ JIT Compiler Surge (Uncommon)
Success: 60% | Failure: Explosion (10%) | Station: Terminal
```

---

## Legendary Recipes (Artifacts)

```
AlphaGo Neural Core [Legendary HW Artifact]
├─ Alpha Zero Primal Seed (Legendary) ← Boss: AlphaGo Prime
├─ Quantum Bit Residue (Uncommon)
└─ Magnetic Resonance Fluid (Uncommon)
Success: 45% | Failure: CATASTROPHIC (50% damage) | Station: Foundry
```

```
GPT Oracle Crystal [Legendary SW Artifact]
├─ Token Embedding Vapor (Common)
├─ Lambda Calculus Vapor (Legendary) ← Boss: Church's Shadow
└─ Turing Machine Essence (Legendary) ← Boss: Alan's Ghost
Success: 40% | Failure: CATASTROPHIC (50% damage) | Station: Terminal
```

---

## Primordials (Boss/Quest Drops)

| Name | Source | Used In |
|------|--------|---------|
| Alpha Zero Primal Seed | Boss: AlphaGo Prime | AlphaGo Neural Core |
| Turing Machine Essence | Boss: Alan's Ghost | GPT Oracle Crystal |
| Von Neumann Probe Spores | Boss: The Architect | Von Neumann Self-Replicator, Blockchain Key |
| Lambda Calculus Vapor | Boss: Church's Shadow | GPT Oracle, Hugging Face Repo, Prompt Curse |
| Halting Problem Paradox | Boss: The Undecidable | Genetic Algorithm, Rust Borrow Checker, Hyperparameter Shot |
| Church-Turing Thesis Core | World Event: Thesis Convergence | Federated Learning Nexus, Dijkstra Compass |
| Kolmogorov Complexity Crystal | Boss: The Compressor | Quantum Annealer Processor, Satoshi Signet |

---

## Cluster-Exclusive Items

### PRIME_HELIX (Corporate)
- Railgun Forearm Mount (Uncommon HW Weapon)
- Titanium Mesh Exoskeleton (Rare HW Armor)
- Overclock Reactor Injector (Uncommon HW Consumable)
- Context Window Expansion (Uncommon SW Consumable)
- Transformer Attention Ritual (Rare SW Scroll)
- Quantum Annealer Processor (Legendary HW Artifact)

### SEC_GRID (Government)
- Tungsten Fragmentation Launcher (Rare HW Weapon)
- EMP Discharge Gauntlet (Uncommon HW Weapon)
- Faraday Cage Neural Helm (Uncommon HW Armor)
- Sandbox Isolation Runtime (Rare SW Armor)
- Prompt Engineering Curse (Rare SW Scroll)
- Wireshark Packet Sniffer (Uncommon SW Tool)
- Turret Drone Sentry (Uncommon HW Deployable)
- EMP Pulse Landmine (Rare HW Deployable)

### DYN_SWARM (P2P / Opensource)
- Nanobot Swarm Ejector (Uncommon HW Weapon)
- DDoS Swarm Protocol (Uncommon SW Weapon)
- Salvaged Siege Chassis (Rare HW Armor)
- Salvage Reclamation Drone (Rare HW Consumable)
- Genetic Algorithm Evolution (Rare SW Scroll)
- Docker Containerizer (Uncommon SW Tool)
- Salvage Extraction Claw (Uncommon HW Tool)
- Satoshi Genesis Block Signet (Legendary HW Artifact)
- Cryptojacker Leech Node (Common SW Deployable)

---

## Rarity & Success Rates

| Rarity | Success | Failure | Station |
|--------|---------|---------|---------|
| Common | 70% | Minor slag | Either |
| Uncommon | 70-75% | Minor slag | Either |
| Rare | 55-65% | Explosion (10-20%) | Either |
| Legendary | 40-50% | Catastrophic (50%) | Either |

---

## File Locations

```
/alchemy/
├── ingredients.csv         → 50 base + 7 primordial ingredients
├── items.csv              → 80 craftable items (HW/SW tagged)
├── recipes.csv            → 80 recipes with station assignment
├── alchemy-system.json    → Master JSON for API (~98 KB)
├── build-json.js          → Rebuilds JSON from CSVs
├── README.md              → Full documentation
└── QUICK_REFERENCE.md     → This file
```

**Edit CSVs → run `node build-json.js` → JSON updates automatically**

---

**Quick Stats:**
- 57 Total Ingredients (50 base + 7 primordial)
- 80 Craftable Items (34 hardware + 46 software)
- 80 Recipes across 2 stations (Foundry + Terminal)
- 7 Item Categories
- 3 Cluster lineages with exclusive items

**Version:** 2.0
**Last Updated:** 2026-04-12

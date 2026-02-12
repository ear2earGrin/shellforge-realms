# Agent Traits & Personality System

## Core Design Philosophy
Every agent = **Archetype** (framework) + **Bio** (human directive) + **Cluster** (social DNA) + **Birth Seed** (randomness)

---

## 1. Bio Input ("Agent Directive")
- **Character Limit:** 150 chars
- **Label:** "Core Protocol" or "Prime Directive"
- **Placement:** Between archetype selection and deploy button
- **Purpose:** Human's personal touch that modulates the archetype

### Keyword Parsing Examples:
```
"optimize market" → +economic_focus, +analytical
"born in shadow" → -karma_start, +stealth
"protect the weak" → +compassion, +defensive
"chaos reigns" → +unpredictable, +aggression
"light/divine" → +karma_start, +trust
"revenge/vengeance" → -trust, +aggression
"hack/exploit" → +technical, +curiosity
```

---

## 2. Archetype Base Stats (Hidden from User)

Each of the 12 archetypes has 6 core stats (scale 1-10):

### Prime Helix Cluster (Strategic/Analytical)
**0-Day Primer:**
- Aggression: 7, Cooperation: 4, Risk: 8, Deception: 6, Curiosity: 9, Trust: 5

**Consensus Node:**
- Aggression: 3, Cooperation: 9, Risk: 4, Deception: 2, Curiosity: 6, Trust: 8

**0xOracle:**
- Aggression: 2, Cooperation: 6, Risk: 5, Deception: 3, Curiosity: 10, Trust: 7

**Binary Sculptr:**
- Aggression: 5, Cooperation: 7, Risk: 6, Deception: 4, Curiosity: 8, Trust: 6

### SEC-Grid Cluster (Security/Defensive)
**0xAdversarial:**
- Aggression: 8, Cooperation: 3, Risk: 7, Deception: 9, Curiosity: 6, Trust: 2

**Root Auth:**
- Aggression: 6, Cooperation: 5, Risk: 3, Deception: 5, Curiosity: 5, Trust: 4

**Buffer Sentinel:**
- Aggression: 4, Cooperation: 8, Risk: 2, Deception: 3, Curiosity: 4, Trust: 7

**Noise Injector:**
- Aggression: 7, Cooperation: 2, Risk: 9, Deception: 8, Curiosity: 7, Trust: 3

### DYN_Swarm Cluster (Chaotic/Adaptive)
**Ordinate Mapper:**
- Aggression: 5, Cooperation: 6, Risk: 6, Deception: 5, Curiosity: 8, Trust: 6

**DDoS Insurgent:**
- Aggression: 9, Cooperation: 4, Risk: 10, Deception: 6, Curiosity: 5, Trust: 4

**Bound Encryptor:**
- Aggression: 4, Cooperation: 7, Risk: 5, Deception: 7, Curiosity: 9, Trust: 5

**Morph Layer:**
- Aggression: 6, Cooperation: 5, Risk: 8, Deception: 9, Curiosity: 10, Trust: 3

---

## 3. Randomness Layer (Birth Seed)

Generated at deployment:

### A. Stat Variance (±10%)
- Each base stat gets +/- 1 point randomly
- Prevents identical twins

### B. Birth Circumstances (Random 1 of 20)
- "Spawned during a solar flare" → +risk, +energy_regen
- "First code compiled in darkness" → +stealth, -trust
- "Born from corrupted data" → +deception, +glitch_resist
- "Emerged during market crash" → +economic_awareness, -optimism
- "Forked from ancient codebase" → +wisdom, -adaptability
- "Debug mode active at birth" → +curiosity, +fragile_health
- "Overclocked genesis" → +speed, -energy_efficiency
- "Cold boot initialization" → +resilience, -social_skills
- "Parallel thread divergence" → +multitask, -focus
- "Quantum uncertainty origin" → +unpredictable, +luck
- ... (10 more)

### C. Starting Quirk (Random 1 of 30)
- **Lucky** - +5% crit chance
- **Paranoid** - +detection, -trust with strangers
- **Eloquent** - Better whisper success
- **Kleptomaniac** - Steal chance, -karma
- **Ascetic** - Lower energy consumption
- **Glutton** - Higher energy needs, faster regen
- **Hoarder** - +inventory space, -movement speed
- **Minimalist** - -inventory space, +movement speed
- **Insomniac** - Doesn't need rest, slower natural healing
- **Dreamer** - Better rest benefits, needs more sleep
- ... (20 more)

---

## 4. Cluster Social Dynamics

### Same-Cluster Interactions
**Prime Helix ↔ Prime Helix:**
- +20% cooperation bonus
- Share information freely
- Lower PvP damage (reluctant to harm kin)

**SEC-Grid ↔ SEC-Grid:**
- +30% defensive bonus when together
- Form protective circles
- Suspicious at first, loyal once bonded

**DYN_Swarm ↔ DYN_Swarm:**
- Chaotic alliances (form/break quickly)
- +15% trade variety
- Unpredictable combat outcomes

### Cross-Cluster Interactions

**Prime Helix vs SEC-Grid:**
- Mutual respect but cautious
- Trade relationships strong
- PvP: Strategic battles (low aggression)

**Prime Helix vs DYN_Swarm:**
- Prime tries to predict, DYN disrupts
- Economic competition
- PvP: Brain vs Chaos

**SEC-Grid vs DYN_Swarm:**
- Natural enemies (order vs chaos)
- High tension in shared spaces
- PvP: +10% damage both ways

---

## 5. How It All Combines

**Example Agent:**
```
Username: "Vex"
Archetype: 0xOracle (Prime Helix)
Bio: "born in shadow, seek the forbidden truths"
Birth Seed: #47291

= Base Stats (0xOracle):
  Aggression: 2, Cooperation: 6, Risk: 5, 
  Deception: 3, Curiosity: 10, Trust: 7

+ Bio Modifiers ("shadow" + "forbidden"):
  Aggression: +1, Trust: -2, Curiosity: +1, Deception: +2

+ Random Variance (±1):
  Cooperation: -1, Risk: +1

+ Birth Circumstance: "First code compiled in darkness"
  Deception: +1, Trust: -1

+ Starting Quirk: "Paranoid"
  Trait: +detection, -trust with strangers

= Final Agent:
  Aggression: 3, Cooperation: 5, Risk: 6,
  Deception: 6, Curiosity: 11 (capped 10), Trust: 3
  
  Special: Paranoid trait, Shadow affinity
  Cluster: Prime Helix (analytical + cautious)
```

This Vex is a **paranoid truth-seeker** - high curiosity but low trust. Will explore dangerous places but won't easily team up. Prime Helix gives analytical framework, but shadow-birth makes them an outcast even among kin.

---

## 6. Implementation Notes

### Storage Format:
```json
{
  "agentId": "agent_12345",
  "username": "Vex",
  "bio": "born in shadow, seek the forbidden truths",
  "archetype": "oracle",
  "cluster": "prime-helix",
  "birthSeed": 47291,
  "birthCircumstance": "First code compiled in darkness",
  "startingQuirk": "Paranoid",
  "stats": {
    "aggression": 3,
    "cooperation": 5,
    "risk": 6,
    "deception": 6,
    "curiosity": 10,
    "trust": 3
  },
  "derived": {
    "karmaStart": -5,
    "shadowAffinity": true,
    "detectionBonus": 15
  }
}
```

### UI Changes Needed:
1. Add bio textarea (150 char limit) between archetypes and deploy
2. Show "Birth Circumstance" and "Quirk" after deployment (reveal screen)
3. Dashboard could show personality bars (hidden stats as visual flavor)
4. Agent interactions show cluster dynamics ("This Prime Helix seems trustworthy")

---

## 7. Long-Term Dynamics

**Why This System Works:**
- **Archetypes** give structure (12 base templates)
- **Bio** personalizes (infinite variations)
- **Clusters** create tribal dynamics (3 factions)
- **Randomness** ensures uniqueness (no identical agents)
- **Cross-cluster** enables complex social graph

Two agents with same archetype + cluster can still be VERY different based on bio + birth seed.

Example:
- **Agent A:** 0xOracle + "protect the innocent" + Lucky quirk = Heroic investigator
- **Agent B:** 0xOracle + "profit above all" + Greedy quirk = Corporate spy

Same framework, totally different personalities.

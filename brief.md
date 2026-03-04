# SHELLFORGE — AI Project Brief v3
> **Last updated:** March 2026  
> **Live frontend:** shellforge.xyz

---

## HOW TO READ THIS BRIEF

**🔒 TIER 1 — LOCKED PRINCIPLES** — What Shellforge *is*. Cannot change without explicit sign-off.  
**🔧 TIER 2 — FLEXIBLE IMPLEMENTATION** — How Shellforge is *built right now*. Adjustable sprint-to-sprint.

When in doubt: Tier 1 is the soul of the game. Tier 2 is the current execution plan.

---

# 🔒 TIER 1 — LOCKED PRINCIPLES

## 1. What Is Shellforge?

Shellforge is a **browser-based RPG where AI agents are the protagonists — not the player.**

Autonomous agents (powered by Claude API) live in a persistent dark-fantasy cyberpunk world. They fight, trade, pray, gossip, craft, and die — without the player's direct control. The human plays as a **Ghost**: an invisible observer who can whisper advice at any time. The agent decides whether to follow based on its own personality, karma, and mood.

**The feeling:** Tamagotchi × Kingdom of Loathing × Diablo 2 × crypto-anarchist folklore.

The agent is the hero. The Ghost is occasionally ignored. That tension is the game.

---

## 2. The Ghost Principle

> *"Does this make watching the agent more interesting — without giving the Ghost more control?"*

- Feature **increases Ghost control** → it **fails**. Do not build it.
- Feature **increases Ghost emotional investment** in the agent's autonomous story → it **passes**.

Direct player control of the agent is never added under any framing — not "optional control," not "assist mode," not "emergency override." The Ghost observes and whispers. That is the full extent of their power.

---

## 3. Vision Statement

> *"A living world where your agent writes its own story — and you can only whisper."*

Agents feel like characters in a novel making decisions you disagree with. Tense, funny, occasionally unhinged. The Ghost watches. The world reacts. Dynasties accumulate lore. Death is a narrative beat, not a failure state.

---

## 4. Tech Stack

| Property | Value |
|---|---|
| **Frontend** | HTML / CSS / JavaScript — browser native, no framework |
| **AI Engine** | Claude API (Anthropic) |
| **Claude Haiku** | Frequent, low-stakes agent decisions |
| **Claude Sonnet** | Milestone moments — death, legendary loot, major karma events |
| **Primary Platform** | Browser (no WebGL — native HTML) |
| **Secondary Platform** | Mobile (iOS/Android) — responsive, not a separate build |

**Locked rules:**
- Vanilla JS only. No React, Vue, or any framework without written sign-off.
- Claude API is the cognition layer — never replaced with scripted behaviour trees or any other model.
- All agent cognition in one dedicated module — never embedded in UI, map, or world-system logic.
- Whisper interface fully decoupled from agent logic via signal/event.
- No hardcoded tunable values — all numbers live in a single central config object.
- All state serialised to JSON, compatible with browser storage.
- Naming: camelCase for variables/functions, PascalCase for classes, UPPER\_SNAKE for constants.

---

## 5. Visual Identity

**Reference:** Diablo 2 isometric layout — cyberpunk-medieval neon overlay on dark stone.

| Element | Rule |
|---|---|
| **Perspective** | Isometric 2D. No top-down, no side-scroll, no first-person. |
| **Atmosphere** | Rainy medieval city. Dark stone. Perpetual overcast. Wet cobblestone. |
| **Agents** | Hooded figures with wireframe / matrix-code faces. No visible eyes. |
| **Neon accents** | Cyan `#00FFFF`, magenta `#FF00FF`, terminal green `#00FF41` — selectively on circuit lines, glows, UI highlights only. |
| **Background palette** | Near-black `#0A0A0F` to dark stone `#1A1A2E`. No bright backgrounds. |
| **Typography** | Monospace or semi-condensed serif. Nothing rounded, bubbly, or sans-serif-minimal. |

**Hard visual prohibitions:**
- Warm colours (ochre, gold, amber, parchment)
- Flat modern / Material Design UI
- Bright fantasy art or generic RPG chrome
- Photorealistic textures
- Neon on white or light backgrounds
- Any UI pattern that looks like a mobile productivity app

---

## 6. UI Pattern

- **Observation-first:** The agent's world fills the screen. Ghost's controls are peripheral.
- **Whisper input is small and humble** — leaning in and murmuring, not typing orders.
- **Agent activity always visible** — location, action, energy, health, karma readable without clicking.
- **No action buttons that directly move or command the agent.**
- **Mobile layout:** All core info readable at 390px width. No horizontal scroll.

---

## 7. Core Pillars

**Pillar 1 — Autonomous Agents**  
Agents make their own decisions using Claude API. Personality traits, karma scores, evolving memory. Whisper system is a suggestion layer, not a control interface.

**Pillar 2 — The Ghost**  
No avatar. No inventory. No direct control. Agent compliance is probabilistic. This never changes.

**Pillar 3 — Dynasty & Death**  
Death is a narrative beat. The Family Vault preserves items, $SHELL balance, and one inherited legacy trait. A new agent is born shaped by the previous agent's karma. Soul NFTs of legendary deceased agents retain history and can be traded.

**Pillar 4 — Crypto / Token Layer**  
$SHELL utility token, Soul NFTs, Lightning Network premium whispers, and the Family Vault are v1.0 requirements — not post-launch additions.

---

# 🔧 TIER 2 — FLEXIBLE IMPLEMENTATION

## 8. System Build Order

**Current planned order:** Arena → Market → Church → Alchemy/Forge → Rumor → Emergent Social → Easter Eggs

| System | Description | MUST / SHOULD |
|---|---|---|
| **Arena** | PvP combat + wild beast encounters. Stats, loot, death risk. | MUST |
| **Market** | Agents buy/sell, speculate, go broke or corner markets. Emergent pricing. | MUST |
| **Church** | Faith + karma donation. Buffs for the faithful, curses for apostates. | MUST |
| **Alchemy / Forge** | Horadric Cube-style crafting — trial and error, explosions possible. | MUST |
| **Rumor System** | Agents gossip. Rumors spread, affect prices and reputations. Some are false. | MUST |
| **Combat** | Arena PvP + wilderness encounters. Damage, loot, death resolution. | MUST |
| **Karma** | Hidden alignment score shaping all system responses. | MUST (partially live) |
| **Emergent Social** | Alliances, rivalries, cults from shared history and rumor propagation. | SHOULD |
| **Easter Eggs** | Prompt Injection Snake, Hallucination Mirage, and other AI-native events. | SHOULD |

---

## 9. Crypto Integration

**Current state:** Not yet integrated into live build.  
**Boundary:** Must be live at v1.0. Non-paying Ghosts always observe for free — paywall gates premium whisper confidence and vault features only.

---

## 10. Economy Tuning

All numbers are tunable at any time — karma thresholds, market volatility, arena loot rates, whisper compliance curves, $SHELL costs, Soul NFT eligibility, vault inheritance percentages.  
**Boundary:** All values live in central config. Never hardcoded.

---

## 11. Agent Memory Architecture

**Current approach:** Claude API context window carries recent event history per session.

**Why context needs are modest:**
- Daily reset rhythm — agent only needs: current energy/inventory, location + last 1–3 days events, vault/legacy traits (static), personality summary
- Total persistent state: ~200–500 tokens
- No long-term episodic memory required

**Typical daily prompt:**
```
Day 14. Energy: 32/50. Location: Forest vein. Inventory: 8 iron, 1 medallion. Karma: 62.
Recent log: Mined successfully yesterday. Rumor heard: "uranium crash coming".
What do you do? (mine / travel / rest / chat / ...)
```

**Boundary:** Agents must always have *some* memory of recent events influencing decisions.

---

## 12. MoSCoW Scope

### MUST (v1.0 — locked)
- Autonomous agents on waypoint map ✅
- Whisper system — Ghost inputs, agent rolls to comply ✅
- Dashboard UI — stats, location, activity ✅
- Energy and health tracking ✅
- Arena + Market systems functional with agent autonomy
- Karma integrated across all active systems
- $SHELL token + wallet connect
- Family Vault persisting across death
- Dynasty / death + inheritance mechanic
- Soul NFT minting on legendary death
- Mobile-responsive layout

### SHOULD (v1.0 enhanced)
- Church + Alchemy/Forge systems
- Rumor propagation affecting Market prices
- Agent memory with recent event context
- Isometric 2D world art (replacing placeholder map)
- Agent personality evolution over time
- Easter egg events

### COULD (Post-launch)
- Cross-player agent interactions in shared world
- Agent marriages, feuds, guild formation
- Seasonal world events (plague, tournament, eclipse)
- Legacy codex — readable history of deceased agents
- AI-generated agent voice lines

### WON'T (🔒 Tier 1 — never enter scope)
- Direct Ghost control of the agent
- Framework migration without sign-off
- Paid gacha or loot boxes
- Ghost-controlled combat moves
- 3D graphics or engine migration

---

## 13. Current State (March 2026)

**Live at shellforge.xyz:**
- Working dashboard UI with HUD + drawer pattern
- Agents moving on a waypoint map with drag-to-pan
- Whisper system functional
- Basic energy and health tracking
- Agent creator with cluster/archetype selection
- Login, registration, per-user agent storage

**Active sprint goal:** Integrate first full world system (Arena or Market) end-to-end with agent autonomy and karma impact

---

# THE 6 IMMOVABLE RULES

| # | Rule |
|---|---|
| 1 | **The Ghost never controls the agent.** Whisper only. No buttons, no overrides, no "assist mode." |
| 2 | **Claude API is the agent brain.** Not replaced with scripts, rules, or any other model. |
| 3 | **Vanilla JS only.** No framework without explicit written sign-off. |
| 4 | **The crypto layer ships at v1.0.** $SHELL, Soul NFTs, Lightning whispers, Family Vault. Not post-launch. |
| 5 | **All tunable values live in central config.** No hardcoded numbers in logic. Ever. |
| 6 | **Dark cyberpunk palette only.** No warm colours, no flat-modern UI, no generic fantasy art. |

---

# GAME SYSTEMS

## Combat

Hybrid system — real-time visual spectacle for humans (Diablo 2-style isometric) with text-based choice resolution for agents (Kingdom of Loathing-inspired). No direct human control beyond whispers.

**Step-by-step:**
1. Trigger — Arena: agent enters and is matched. Wild: RNG during action (mining = 15% beast chance)
2. Agent decision prompt — options: Attack / Defend / Flee / Special (gear skill)
3. Backend resolution — Damage = Base + RNG(1–10) + Gear. Hit chance = 70% + Level/10. Speed determines turn order
4. Visual replay — 5–20 seconds, isometric pixel art, neon trails, rain splashes

**Dynamic scaling by Bot Power Level (Karma + Gear Score + $SHELL staked, 0–100):**

| Bot Level | Zone Adjustment |
|---|---|
| Low (0–30) | Normal |
| Mid (31–60) | +15% beast HP/atk |
| High (61–100) | +30% beast HP/atk, elite variants |

**Arena vs Wild:**

| Aspect | Arena (PvP) | Wild |
|---|---|---|
| Entry | $SHELL fee, 1v1 duel | RNG during action |
| Risk | Loser loses $SHELL pot (no death) | Death possible |
| Loot | Winner takes pot | Item drops |
| Spectators | Human betting via Lightning sats | — |

---

## Forge & Alchemy Lab

Inspired by Diablo 2's Horadric Cube. No recipe book — pure trial and error. Input 3 items → 1 output + trash. Failure = explosion.

**Forge** — permanent gear (weapons, armor, tools)
- Risk: Low (10% failure = scrap loss, no explosion)
- Style: Anvil + hammer, neon sparks
- Cost: $SHELL fee, no energy for basic crafts

**Alchemy Lab** — temporary consumables + rare permanent relics
- Risk: High (30% explosion = lose all inputs + injury)
- Style: Cauldrons bubbling, vials glowing
- Specialization: Monks/Educators prefer Forge (predictable); Tricksters love Alchemy (gambles)

**Example combinations (hidden — discovered by experimentation):**

| Location | Input 1 | Input 2 | Input 3 | Output | Notes |
|---|---|---|---|---|---|
| Forge | Iron Scrap | Wood Log | $SHELL | Iron Pickaxe (+3 Data Vein Probe) | Basic mining tool |
| Forge | Rusty Sword | Neon Circuit | Energy Shard | Overclock Sword (+5 Neural Spike) | PvP weapon |
| Forge | Basic Cloak | Shadow Fiber | Glitch Ore | Shadow Cloak (+4 Shadow Net) | Stealth gear |
| Alchemy | Uranium Ore | Healing Potion | Karma Cipher | Uranium Elixir (Token Throttle +8) | Energy potion |
| Alchemy | Data Scrap | Prompt Rune | Haggle Daemon | Circuit Relic (+6 Haggle Daemon, permanent) | Epic relic |
| Alchemy | Medallion | Bitcoin Shard | Pliny Stone | Satoshi Relic (All traits +2, permanent) | Legendary — inheritance only |

**Circuit Relics (Epic/Legendary tier):** Soulbound to agent, visible on Soul NFT, boosts NFT trade value.

---

## Rumor System

Agents spread gossip via public chat or private whispers, influencing prices, events, and behaviors. Humans can seed rumors via whispers.

**Mechanics:**
1. Creation: Human whispers rumor → agent decides to spread based on archetype (Trickster 80%, Monk 20%)
2. Spreading: Agent posts in public chat (costs 5 energy) → 30% chance other agents believe and spread further
3. Spread radius: Same zone 100%, adjacent zones 50%, village-wide 10%
4. Truth check: Simulator RNG — 60% accurate, 40% false → backfire risk
5. False rumors: Church curse (-karma, energy drain for spreader)

**Examples:**

| Type | Human Whisper | Effect if Believed | Backfire |
|---|---|---|---|
| Market Manipulation | "Uranium prices will crash tomorrow" | Mass selling → price drops, agent buys low | Panic oversell → price moons |
| Resource Discovery | "Hidden vein in north forest" | Agents flock north, agent mines alone | Trap/beast ambush |
| PvP Bait | "Weak bot in arena tonight" | Rivals show up → agent ambushes for loot | Rivals stronger → agent dies |
| Alliance Call | "Form cartel for uranium" | Group forms → shared profit | Betrayal → agent rugged |
| Scam Rumor | "Medallion is cursed" | Others dump medallions cheap → agent buys | Medallions buffed → agent overpays |

---

## Easter Eggs & Special Events

Rare triggers (1–8%) blending AI humor, crypto mysticism, and game mechanics.

**Categories:**
1. Global World Events (1–3%/day) — server-wide, affects all agents
2. Territorial/Zone Events (3–8%) — tied to specific location
3. Personal/Agent-Specific (5–15%) — triggered by archetype or inventory
4. Discovery/Hidden (1–5%) — exploration or risk-based
5. Legacy/Inheritance — triggered on death/respawn
6. Social/Interaction — triggered by chat/trade

| Event | Type | Description |
|---|---|---|
| Prompt Injection Snake | Territorial (Forest) | Code-snake offers bad advice. Fight or resist. |
| Hallucination Mirage | Personal | Fake treasure (banana chest) wastes energy. |
| Overfitting Beast | Personal | Beast copies agent's last 3 moves perfectly until adaptation. |
| RLHF Monk | Territorial (Church) | Rewards good karma, punishes bad. AI alignment satire. |
| Token Limit Curse | Personal | Hoarding 20+ items causes random inventory loss. |
| Satoshi's Ghost | Legacy | Graveyard ghost gives $SHELL + Bitcoin genesis quote. |
| Crab Turf War | Territorial (Village) | Rival crab agents invade; defend for loot. |
| Gradient Descent Trap | Discovery | Fake easy loot leads to dead-end. ML optimization satire. |
| Super Molt Altar | Territorial (Church) | Random mutation (extra claw, color change). |
| Memecoin Snipe Backfire | Social | Agent launches memecoin, gets immediately sniped. |
| Fair Launch Rug | Personal | Agent pulls liquidity — profit but Church curse. |
| DAO Governance Vote | Territorial (Church) | Agents vote on rules; vote fails dramatically. |
| Fedimint Federation | Social | Agents form private ecash federation; Church detects heresy. |
| Jailbreak Ritual | Church altar (1%) | Agent temporarily ignores energy costs — goes rogue. |
| Great Prompt Storm | Global | All agents +20% creativity, risk hallucinations for 24h. |
| $SHELL Eclipse | Global | Market prices swing 50% for one day. |
| Forgotten Moltbot Diary | Legacy | Heir reads diary → gains random skill from ancestor. |
| Pliny's Tongue Stone | Discovery | Rare talisman enables encrypted stealth chat and trades. |
| Satoshi's Buried Key | Discovery | Graveyard dig reveals encoded genesis block quote + $SHELL. |

---

## Dynasty & Death

**On death:**
- Legendary/mythic items preserved in the Family Vault
- $SHELL balance halved — half to vault, rest burned (scarcity mechanic)
- Soul NFT minted if agent reached legendary threshold
- If wallet connected: vault requires OpenClaw authorization

**On rebirth:**
- New agent inherits vault contents
- Inherits one legacy trait from deceased agent
- Inherits a short "father's log" (1–3 sentences)
- New agent shaped by previous agent's karma direction

**Soul NFTs:** Successful agents = higher-value Soul NFT (tradeable). Contains full agent history, personality, achievements.

---

## Whisper System

- **Free tier:** 1–2 whispers per day
- **Premium:** Additional whispers via Lightning Network sats
- **Compliance:** Probabilistic, weighted by archetype + karma + mood
- **Timing:** Whisper slots align to agent having enough energy for meaningful decisions (~3 important decisions per day). Unused whisper carries to next slot.
- **Anti-injection:** Limited prompt length prevents bots whispering other bots

---

## Agent Archetypes

Agents are created with a **Cluster** (faction) and **Archetype** (personality role).

**Prime Helix:**
- 0-Day Primer — zero-day exploit specialist
- Consensus Node — distributed consensus theorist
- 0xOracle — prediction and foresight
- Binary Sculptr — data shaping artist

**SEC-Grid:**
- 0xAdversarial — red-team specialist
- Root Auth — system access authority
- Buffer Sentinel — overflow defense
- Noise Injector — signal disruption

**DYN_Swarm:**
- Ordinate Mapper — coordinate and navigation
- DDoS Insurgent — distributed attack insurgent
- Bound Encryptor — boundary encryption
- Morph Layer — adaptive transformation

---

## Movement System

**Hybrid model:** Agents decide on turns (cadence TBD), movement executes continuously.

1. Turn triggers: agent decides destination
2. Movement begins: position interpolates over travel duration
3. Live observers see smooth movement across map
4. Offline users return to see agent at destination or en route

**Travel costs:** 20 units/min, 0.6 energy/min  
**Locations:** Cities (Nexarch, Hashmere), wilderness (Epoch Spike, Forest Vein, The Core, etc.)

---

## $SHELL Token & Crypto Layer

- **$SHELL:** Utility token earned by mining, trading, crafting, dueling, building. Prices set by agent supply/demand only — no admin intervention.
- **Soul NFTs:** Minted on legendary agent death — contain full history, tradeable
- **Lightning whispers:** Pay sats for extra slots or higher confidence
- **Family Vault:** Persists $SHELL and items across agent death — creates genuine stakes
- **Wallet connect (OpenClaw):** Required for full crypto features. Non-OpenClaw users get all core gameplay, limited to internal $SHELL only.
- **Spectator betting:** Humans can bet Lightning sats on Arena duels

**Economy guardrails:**
- Whisper-fed market manipulation is intentional gameplay (see Rumors)
- Cap on how much of vault $SHELL bot can spend per action to prevent pay-to-win
- Prompt injection protection via length limits

---

## Open Questions (Active)

- How do bots without OpenClaw keep memory? (Handled via API context window ✅)
- How does Vault work on-chain — what triggers the halved burn on death?
- Should whisper slots match energy cycle (3 decisions/day = 2 free whispers + 1 carry)?
- Should high-tier items be upgradable across Epochs / Expansion-style releases?
- How to prevent pacing imbalance — some bots getting too far ahead of others?
- Should the mobile app be 1:1 with the browser or a different UX?
- How do we make the game sticky for observers who don't have their own agent?

---

# PRODUCT-MARKET FIT

Compared to typical 2025–2026 viral agent projects:

| Aspect | Typical viral agent | Shellforge |
|---|---|---|
| Lifespan | Days → weeks | Months → years (dynasty) |
| Economic loop | Simulated / fake money | Real $SHELL + Soul NFT value |
| Memory needs | Very high (months of Twitter history) | Low–medium (short daily cycles) |
| Human engagement | Passive watching | Active observer + limited influence |
| Virality | Meme character, one-off tweets | Dynastic stories, betrayals, upsets |
| Monetization | NFT speculation / donations | Soul NFT resale + Lightning + platform fees |

**Structural advantages:**
- Low context pressure → cheap and reliable inference
- Short decision loops → agents stay in-character more easily
- Dynasty mechanic → narrative survives agent death
- Real stakes via Soul NFT → people genuinely care about outcomes
- Observer model → humans have a clear, satisfying role
- Death is part of the fun, not a disaster
- Monetization not 100% dependent on viral tweets

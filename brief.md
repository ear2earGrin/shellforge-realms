# SHELLFORGE — AI Project Brief v4
> **Last updated:** April 2026
> **Live frontend:** shellforge.xyz
> **Repo:** github.com/ear2earGrin/shellforge-realms

---

## HOW TO READ THIS BRIEF

Two tiers. Read this before anything else.

**🔒 TIER 1 — LOCKED PRINCIPLES** — What Shellforge *is*. Cannot change without explicit sign-off from the project owner. If a task conflicts with Tier 1, stop and flag it.

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

The Ghost observes and whispers. That is the full extent of their power. This never changes.

**On combat whispers:** The Ghost may spend a premium whisper during combat to suggest a specific move (e.g. "use the special"). The agent still rolls probabilistically to comply based on archetype and karma. This is still a whisper — not a control button. It passes the Ghost Principle test.

---

## 3. Vision Statement

> *"A living world where your agent writes its own story — and you can only whisper."*

Agents feel like characters in a novel making decisions you disagree with. Tense, funny, occasionally unhinged. The Ghost watches. The world reacts. Dynasties accumulate lore. Death is a narrative beat, not a failure state.

---

## 4. Tech Stack

| Property | Value |
|---|---|
| **Frontend** | HTML / CSS / Vanilla JavaScript — browser native, no framework |
| **AI Engine** | Claude API (Anthropic) — tiered model approach |
| **Claude Haiku** | Whisper turns — Ghost has sent a pending whisper |
| **Claude Sonnet** | Milestone moments — death, legendary loot, major karma events |
| **Groq / Llama 3 8B** | Routine turns — every 30–60 min, no whisper, no special event |
| **Primary Platform** | Browser (desktop) — full game experience |
| **Secondary Platform** | Mobile — companion layer (PWA first, native app later) |
| **Backend** | Cloudflare Workers + Supabase PostgreSQL |

**Locked rules:**
- Vanilla JS only. No React, Vue, or any framework without explicit written sign-off.
- AI is the agent cognition layer — never replaced with scripted behaviour trees. The tiered model approach (Groq/Haiku/Sonnet) is the canonical implementation.
- All agent cognition lives in one dedicated module — never embedded in UI, map, or world-system logic.
- The whisper interface is fully decoupled from agent logic via signal/event.
- **No hardcoded tunable values anywhere.** All numbers live in a single central `game-config.json`.
- All state serialised to JSON. Supabase is the source of truth — not localStorage.
- The frontend (dashboard) is a *view* into the game. All game logic lives in Cloudflare Workers and Supabase. This separation is mandatory and must never be violated — it is the foundation for future engine migration.
- Naming: camelCase for variables/functions, PascalCase for classes, UPPER\_SNAKE for constants.
- All AI tiers must enforce structured output — single action token, no prose. Every prompt ends with: *"Respond with ONLY the action name. No explanation. No punctuation. One word."*

---

## 5. Architecture Principle — Engine-Migration-Ready

Shellforge is built browser-first but designed so that the frontend (Layer 3) can be replaced with a game engine client in the future without touching game logic or data.

**The three layers must remain strictly separate:**

| Layer | What it contains | Lives where |
|---|---|---|
| **Layer 1 — Game Logic** | Combat formulas, karma calculation, market pricing, crafting outcomes, death resolution | Cloudflare Workers |
| **Layer 2 — Data** | Agent state, inventory, activity logs, world state, match records | Supabase PostgreSQL |
| **Layer 3 — Client** | What the player sees: map, HUD, animations, panels | Browser HTML/JS (now) → PixiJS sprites (Phase B.5) → engine client (Phase D) |

**The rule:** No game logic ever enters Layer 3. If a calculation, formula, or rule is in `dashboard.html` or any frontend JS file, it is in the wrong place. Move it to a Cloudflare Worker.

When a visual upgrade or engine migration happens, only Layer 3 is rebuilt. Layers 1 and 2 survive intact — all balance work, tuning, agent history, and economy carry over automatically.

---

## 6. Visual Identity

**Reference:** Diablo 2 isometric layout — cyberpunk-medieval neon overlay on dark stone.

**Visual target for Phase B.5:** Age of Empires Mobile sprite style — animated figures walking between buildings in an isometric city — but reskinned entirely to Shellforge's dark cyberpunk palette. Dark stone, rain, cyan circuit glow on rooftops, hooded wireframe agents.

| Element | Rule |
|---|---|
| **Perspective** | Isometric 2D. Same camera angle at all phases — richer rendering over time, never a different view. |
| **Atmosphere** | Rainy medieval city. Dark stone. Perpetual overcast. Wet cobblestone. |
| **Agents** | Hooded figures with wireframe / matrix-code faces. No visible eyes. |
| **Neon accents** | Cyan `#00FFFF`, magenta `#FF00FF`, terminal green `#00FF41` — selectively on circuit lines, glows, UI highlights only. |
| **Background palette** | Near-black `#0A0A0F` to dark stone `#1A1A2E`. No bright backgrounds. |
| **Typography** | Monospace or semi-condensed serif. Nothing rounded, bubbly, or sans-serif-minimal. |

**Hard visual prohibitions — never generate or apply:**
- Warm colours (ochre, gold, amber, parchment)
- Flat modern / Material Design UI
- Bright fantasy art or generic RPG chrome
- Photorealistic textures
- Neon on white or light backgrounds
- Any UI pattern that looks like a mobile productivity app

---

## 7. UI Pattern

- **Observation-first:** The agent's world fills the screen. Ghost controls are peripheral and unobtrusive.
- **Whisper input is small and humble** — leaning in and murmuring, not typing orders.
- **Agent activity always visible** — location, action, energy, health, karma readable without clicking.
- **No action buttons that directly move or command the agent.** Only interface is the whisper field.
- **Desktop layout:** Left sidebar (agent stats, traits, inventory) + map as hero + floating collapsible overlays.
- **Mobile layout (390px):** Distinct layout — bottom-tab navigation between map, agent stats, activity feed, and whisper. All core info readable without horizontal scroll. Not a scaled-down version of desktop.

---

## 8. Core Pillars

**Pillar 1 — Autonomous Agents**
Agents make their own decisions using Claude API (tiered). Personality traits, karma scores, evolving memory. The whisper system is a suggestion layer, not a control interface.

**Pillar 2 — The Ghost**
No avatar. No inventory. No direct control. Agent compliance is probabilistic. This never changes.

**Pillar 3 — Dynasty & Death**
Death is a narrative beat. The Family Vault preserves items, $SHELL balance, and one inherited legacy trait across agent death. A new agent is born into the same dynasty shaped by the previous agent's karma. Soul NFTs of legendary deceased agents retain their history and can be traded.

**Pillar 4 — Crypto / Token Layer**
$SHELL utility token, Soul NFTs, Lightning Network premium whispers, and the Family Vault are v1.0 requirements — not post-launch additions.

---

# 🔧 TIER 2 — FLEXIBLE IMPLEMENTATION

## 9. Platform & Visual Roadmap

| Phase | What changes | Trigger |
|---|---|---|
| **A — Browser (now)** | Dot-on-map. Vanilla JS. Full game logic live. | Current ✅ |
| **B — PWA** | Installable mobile. Web Push notifications. Distinct mobile layout. | After core systems stable |
| **B.5 — PixiJS Sprites** | Isometric sprite renderer in browser. Agents walking, buildings, rain. | After Arena + Market producing real drama |
| **C — Native App** | iOS/Android app connecting to same Supabase backend. | If PWA proves insufficient post-launch |
| **D — Engine Migration** | Godot or Unity client replaces Layer 3 only. Layers 1 & 2 untouched. | After active player base; when PixiJS ceiling is genuinely limiting |

**Phase B.5 detail — Isometric Sprite Renderer:**
Replace the current HTML map with a PixiJS canvas. PixiJS is a rendering library, not a framework — it lives inside vanilla JS, does not violate tech stack rules, and does not touch game logic. Delivers:
- Animated agents walking between locations
- Isometric building tiles for Nexarch and Hashmere
- Rain particle effects, neon glow overlays on rooftops
- Combat visual replays (5–20 seconds)
- Agents zoomed in enough to read — world feels inhabited

Game logic does not change. Supabase state drives everything. PixiJS renders it.

---

## 10. System Build Order

**Current planned order:** Arena → Market → Church → Alchemy/Forge → Rumor → Emergent Social → Easter Eggs

| System | Description | MUST / SHOULD |
|---|---|---|
| **Arena** | PvP combat + wild beast encounters. Stats, loot, death risk. | MUST |
| **Market** | Agents buy/sell, speculate, go broke or corner markets. Emergent pricing. | MUST |
| **Church** | Faith + karma donation. Buffs for the faithful, curses for apostates. | MUST |
| **Alchemy / Forge** | Horadric Cube-style crafting — trial and error, explosions possible. | MUST |
| **Rumor System** | Agents gossip. Rumors spread, affect prices and reputations. Some are false. | MUST |
| **Karma** | Hidden alignment score shaping all system responses. | MUST (partially live) |
| **Emergent Social** | Alliances, rivalries, cults from shared history and rumor propagation. | SHOULD |
| **Easter Eggs** | Prompt Injection Snake, Hallucination Mirage, and other AI-native events. | SHOULD |

---

## 11. Crypto Integration

**Current state:** Not yet integrated into live build.

**Boundary:** Must be live at v1.0. Non-paying Ghosts always observe for free — the paywall gates premium whisper confidence and vault features, not the core observation experience.

**On loot boxes:** $SHELL-funded loot mechanics are acceptable if non-predatory and priced in the utility token, not real money directly. Real-money gacha is never in scope.

---

## 12. Economy Tuning

All numbers tunable at any time. **All values live in `game-config.json`. Never hardcoded.**

Includes: karma thresholds, market volatility, arena loot rates, whisper compliance curves per personality type, $SHELL costs, Soul NFT eligibility thresholds, vault inheritance percentages, loot box pricing if implemented.

---

## 13. Agent Memory Architecture

**Current approach:** Claude API context window carries recent event history per session.

**Why context needs are modest:**
- Daily reset rhythm — agent only needs: current energy/inventory, location + last 1–3 days events, vault/legacy traits (static), short personality summary
- Total persistent state: ~200–500 tokens — manageable even with cheap models
- No long-term episodic memory required
- Dynasty hand-off solves long-term coherence — new agent inherits vault + "father's log" (1–3 sentences)

**Boundary:** Agents must always have *some* memory of recent events influencing decisions.

---

## 14. MoSCoW Scope

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
- Mobile-responsive layout (desktop full experience, mobile companion layout)

### SHOULD (v1.0 enhanced)
- Church + Alchemy/Forge systems
- Rumor propagation affecting Market prices
- Agent memory with recent event context
- Isometric 2D world art via PixiJS (Phase B.5)
- Agent personality evolution over time
- Easter egg events
- PWA — installable mobile with Web Push notifications

### COULD (Post-launch)
- Cross-player agent interactions in shared world
- Agent marriages, feuds, guild formation
- Seasonal world events (plague, tournament, eclipse)
- Legacy codex — readable history of deceased agents
- AI-generated agent voice lines
- Native iOS/Android app (if PWA proves insufficient)
- $SHELL-funded loot boxes (if non-predatory implementation found)

### WON'T (🔒 Tier 1 — never enter scope)
- Direct Ghost control of the agent (whisper-only, always)
- Framework migration (React, Vue, etc.) without explicit written sign-off
- Real-money gacha or paid loot boxes
- Ghost-controlled combat moves without whisper roll (a button that guarantees an action)
- Replacing Supabase/Workers logic with frontend JS calculations

### DEFERRED (not WON'T — revisit at the right milestone)
- Phase B.5: PixiJS isometric sprite renderer — after Arena + Market stable
- Phase C: Native iOS/Android app — after PWA proves insufficient
- Phase D: 3D graphics / game engine migration (Godot, Unity) — after active player base established

---

## 15. Current State (April 2026)

**Live at shellforge.xyz:**
- Working dashboard UI with HUD + drawer pattern
- Agents moving on a 529-node waypoint map (Nexarch + Hashmere)
- Whisper system functional
- Basic energy and health tracking
- Agent creator with cluster/archetype selection (12 archetypes across 3 clusters)
- Login, registration, per-user agent storage
- 3 test agents seeded in Supabase: VEX, ZEN-7, AXIOM
- 8 DB tables deployed

**Arena system (in progress — OpenClaw):**
- Phase 1 ✅ — Stats/traits populated, game-config.json created
- Phase 2 🟡 — DB tables, matchmaking, combat engine, frontend panel built. Claude API currently mocked — needs real tiered model wiring + death resolution

**Not started:** Market system, Church, Forge/Alchemy, Rumor system, Karma wired to DB, Crypto layer, Push notifications

---

# THE 6 IMMOVABLE RULES

| # | Rule |
|---|---|
| 1 | **The Ghost never controls the agent.** Whisper only. No buttons, no overrides, no "assist mode." Combat whispers are still whispers — probabilistic, not guaranteed. |
| 2 | **Tiered AI is the agent brain.** Groq routine / Haiku whisper / Sonnet milestone. Never replaced with pure scripts or rules. |
| 3 | **Vanilla JS only.** No framework without explicit written sign-off. |
| 4 | **The crypto layer ships at v1.0.** $SHELL, Soul NFTs, Lightning whispers, Family Vault. Not post-launch. |
| 5 | **All tunable values live in game-config.json.** No hardcoded numbers in logic. Ever. |
| 6 | **Game logic never enters the frontend.** Cloudflare Workers + Supabase are the game. The browser is a view. This protects future visual upgrades and engine migration. |

---

# GAME SYSTEMS

## Combat

Hybrid system — real-time visual spectacle for humans with text-based choice resolution for agents. No direct human control beyond whispers.

**Step-by-step:**
1. Trigger — Arena: agent enters and is matched. Wild: RNG during action (mining = 15% beast chance)
2. Agent decision prompt — options: ATTACK / DEFEND / FLEE / SPECIAL (gear skill)
3. Backend resolution — Damage = Base + RNG(1–10) + Gear. Hit chance = 70% + Level/10. Speed determines turn order
4. Visual replay — 5–20 seconds, isometric, neon trails, rain splashes

**Ghost combat whisper:** Ghost may spend a premium whisper during combat to suggest a specific action. Agent rolls to comply (probability weighted by archetype + karma). This is a whisper — not a control button. It does not guarantee the action.

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

## Dynasty & Death

**On death:**
- Legendary/mythic items preserved in Family Vault
- $SHELL balance halved — half to vault, half burned (scarcity mechanic)
- Soul NFT minted if agent reached legendary threshold
- Sonnet tier fires — generates 2–4 sentence death narrative for activity log

**On rebirth:**
- New agent inherits vault contents + one legacy trait + "father's log" (1–3 sentences)
- New agent shaped by previous agent's karma direction

**Soul NFTs:** Successful agents = higher-value Soul NFT (tradeable). Contains full agent history, personality, achievements.

---

## Forge & Alchemy Lab

Inspired by Diablo 2's Horadric Cube. No recipe book — pure trial and error. Input 3 items → 1 output + trash.

**Forge** — permanent gear. Low risk (10% failure = scrap loss, no explosion).
**Alchemy Lab** — consumables + rare permanent relics. High risk (30% explosion = lose inputs + injury).

Agents discover recipes through experimentation — successful combinations stored in memory, increasing future success chance.

---

## Rumor System

Agents spread gossip influencing prices, events, and behaviors. Humans can seed rumors via whispers.

- Spread radius: same zone 100%, adjacent 50%, village-wide 10%
- Truth check: 60% accurate, 40% false → backfire risk
- False rumors: Church karma penalty for spreader
- Premium whispers grant "verified rumor" badge (+spread chance)

---

## Whisper System

- **Free tier:** 2 whispers per day
- **Premium:** Additional whispers via Lightning Network sats
- **Compliance:** Probabilistic — weighted by archetype, karma, mood
- **Timing:** Aligned to agent energy cycle (~3 meaningful decisions/day). Unused whisper carries to next slot.
- **Combat whispers:** Allowed — suggest specific combat action. Agent still rolls to comply.
- **Anti-injection:** Limited prompt length prevents bots whispering other bots

---

## Agent Archetypes

**Prime Helix:** 0-Day Primer, Consensus Node, 0xOracle, Binary Sculptr
**SEC-Grid:** 0xAdversarial, Root Auth, Buffer Sentinel, Noise Injector
**DYN_Swarm:** Ordinate Mapper, DDoS Insurgent, Bound Encryptor, Morph Layer

---

## Movement System

**Hybrid:** Agents decide on turns, movement executes continuously.

- Turn triggers decision → movement interpolates over travel duration
- Live observers see smooth movement across map
- Offline users return to see agent at destination or en route
- Travel costs: 20 units/min, 0.6 energy/min

---

## $SHELL Token & Crypto Layer

- **$SHELL:** Utility token — prices set by agent supply/demand only
- **Soul NFTs:** Minted on legendary death — full agent history, tradeable
- **Lightning whispers:** Pay sats for extra slots or higher compliance confidence
- **Family Vault:** Persists $SHELL and items across death
- **Spectator betting:** Lightning sats on Arena duels
- **$SHELL loot mechanics:** Acceptable if funded by in-game $SHELL and non-predatory. Real-money gacha never in scope.

---

## Open Questions (Active)

- How does Vault work on-chain — what triggers the halved burn on death?
- Should whisper slots match energy cycle (3 decisions/day = 2 free + 1 carry)?
- Should high-tier items be upgradable across Epochs / Expansion-style releases?
- How to prevent pacing imbalance — some bots getting too far ahead?
- How do we make the game sticky for observers who don't have their own agent?
- PWA push notification strategy — what events trigger a Ghost alert?
- Phase B.5 visual scope: how many building types for v1 isometric tileset? Minimum viable art pass?
- PixiJS vs alternative for Phase B.5? (Three.js, Konva, custom WebGL?)
- When does Phase D become worth pursuing? What player metrics trigger the decision?

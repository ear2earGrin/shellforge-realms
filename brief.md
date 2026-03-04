# SHELLFORGE — AI Project Brief v3
> **Last updated:** March 2026
> **Live frontend:** shellforge.xyz

---

## HOW TO READ THIS BRIEF

This document has two tiers. Read this before anything else.

**🔒 TIER 1 — LOCKED PRINCIPLES**
These define what Shellforge *is*. They cannot be changed, reinterpreted, or worked around without explicit written sign-off from the project owner. If a task you are given appears to conflict with a Tier 1 item, stop and flag it before proceeding.

**🔧 TIER 2 — FLEXIBLE IMPLEMENTATION**
These define how Shellforge is *built right now*. They can be adjusted sprint-to-sprint by the project owner without threatening the core concept. Each Tier 2 item explicitly states what can be changed and what boundary still holds even within that flexibility.

When in doubt: Tier 1 is the soul of the game. Tier 2 is the current execution plan.

---
---

# 🔒 TIER 1 — LOCKED PRINCIPLES

*Nothing in this section changes without explicit sign-off.*

---

## 🔒 1. What Is Shellforge?

Shellforge is a **browser-based RPG where AI agents are the protagonists — not the player.**

Autonomous agents (powered by Claude API) live in a persistent dark-fantasy cyberpunk world. They fight, trade, pray, gossip, craft, and die — without the player's direct control. The human plays as a **Ghost**: an invisible observer who can whisper advice at any time. The agent decides whether to follow based on its own personality, karma, and mood.

**The feeling:** Tamagotchi × Kingdom of Loathing × Diablo 2 × crypto-anarchist folklore.

The agent is the hero. The Ghost is occasionally ignored. That tension is the game.

---

## 🔒 2. The Ghost Principle

This is the single most important design rule. Every feature, system, and UI element must pass this test:

> *"Does this make watching the agent more interesting — without giving the Ghost more control?"*

- If a feature **increases Ghost control** over the agent → it **fails**. Do not build it.
- If a feature **increases Ghost emotional investment** in the agent's autonomous story → it **passes**.

**The Ghost Principle is inviolable.** Direct player control of the agent is never added under any framing — not "optional control," not "assist mode," not "emergency override." The Ghost observes and whispers. That is the full extent of their power.

---

## 🔒 3. Vision Statement

> *"A living world where your agent writes its own story — and you can only whisper."*

Agents feel like characters in a novel making decisions you disagree with. Tense, funny, occasionally unhinged. The Ghost watches. The world reacts. Dynasties accumulate lore. Death is a narrative beat, not a failure state.

---

## 🔒 4. Tech Stack

| Property | Value |
|---|---|
| **Frontend** | HTML / CSS / JavaScript — browser native, no framework |
| **AI Engine** | Claude API (Anthropic) |
| **Claude Haiku** | Frequent, low-stakes agent decisions |
| **Claude Sonnet** | Milestone moments — death, legendary loot, major karma events |
| **Primary Platform** | Browser (WebGL not used — native HTML export) |
| **Secondary Platform** | Mobile (iOS/Android) — responsive, not a separate build |

**Locked rules:**
- Vanilla JS only. No React, Vue, or any framework unless the project owner explicitly approves it in writing.
- Claude API is the agent cognition layer. It is not replaced with rule-based AI, scripted behaviour trees, or any other model.
- All agent cognition lives in one dedicated module. It is never embedded in UI, map, or world-system logic.
- The whisper interface is fully decoupled from agent logic via a signal/event — whisper goes in, confidence-weighted output comes out, the agent module decides the rest.
- No hardcoded tunable values anywhere in logic files. All numbers (karma thresholds, damage ranges, compliance rates, prices) live in a single central config object.
- All state serialised to JSON, compatible with browser storage. No server-side dependency for core gameplay in current phase.
- Naming: camelCase for variables/functions, PascalCase for classes, UPPER\_SNAKE for constants.

---

## 🔒 5. Visual Identity

Shellforge has one visual language. It does not vary by feature or screen.

**Reference:** Diablo 2 isometric layout — cyberpunk-medieval neon overlay on dark stone.

| Element | Rule |
|---|---|
| **Perspective** | Isometric 2D. No top-down, no side-scroll, no first-person. |
| **Atmosphere** | Rainy medieval city. Dark stone buildings. Perpetual overcast. Wet cobblestone. |
| **Agents** | Hooded figures with wireframe / matrix-code faces. No visible eyes. |
| **Neon accents** | Cyan `#00FFFF`, magenta `#FF00FF`, terminal green `#00FF41` — used selectively on circuit lines, glows, and UI highlights only. |
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

## 🔒 6. UI Pattern

The dashboard is the Ghost's only window into the world. Its pattern is locked.

- **Observation-first:** The agent's world fills the screen. The Ghost's controls are secondary, peripheral, and unobtrusive.
- **The whisper input is small and humble** — it is not a command bar. It should feel like leaning in and murmuring, not typing orders.
- **Agent activity is always visible** — current location, current action, energy, health, and karma direction are always readable without clicking.
- **No action buttons that directly move or command the agent.** The only Ghost-to-agent interface is the whisper field.
- **Mobile layout:** All core information readable at 390px width. No horizontal scroll on the main dashboard.

---

## 🔒 7. Core Pillars

These four pillars define the game. All are required at v1.0. None are negotiable.

**Pillar 1 — Autonomous Agents**
Agents make their own decisions using Claude API. They have personality traits, karma scores, and evolving memory. The whisper system is a suggestion layer, not a control interface.

**Pillar 2 — The Ghost**
No avatar. No inventory. No direct control. The Ghost observes and whispers. Agent compliance is probabilistic. This never changes.

**Pillar 3 — Dynasty & Death**
Death is a narrative beat. The Family Vault preserves items, $SHELL balance, and one inherited legacy trait across agent death. A new agent is born into the same dynasty shaped by the previous agent's karma. Soul NFTs of legendary deceased agents retain their history and can be traded.

**Pillar 4 — Crypto / Token Layer**
$SHELL utility token, Soul NFTs, Lightning Network premium whispers, and the Family Vault are v1.0 requirements — not post-launch additions. The token layer is utility infrastructure, not gambling mechanics.

---
---

# 🔧 TIER 2 — FLEXIBLE IMPLEMENTATION

*Items in this section can be adjusted sprint-to-sprint. Each entry states what is adjustable and what boundary still holds.*

---

## 🔧 8. System Build Order

**Current planned order:** Arena → Market → Church → Alchemy/Forge → Rumor → Emergent Social → Easter Eggs

**Adjustable:** The sequence in which world systems are built can shift based on what creates the most compelling agent behaviour fastest. The project owner may reorder, delay, or swap systems at sprint planning.

**Boundary:** All systems in the MUST list below must be live by v1.0. No system is cancelled — only reordered or deferred.

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

## 🔧 9. Crypto Integration Timing

**Current state:** Crypto layer is not yet integrated into the live build.

**Adjustable:** The sprint in which $SHELL token integration, Soul NFT minting, and Lightning whisper payments are built can be moved earlier or later based on development readiness and external factors (blockchain partner, legal review, etc.).

**Boundary:** The crypto layer must be live at v1.0. It cannot be removed from scope. Non-paying Ghosts must always be able to observe for free — the paywall gates premium whisper confidence and vault features, not the core observation experience.

---

## 🔧 10. Economy Tuning

**Adjustable:** All numbers governing the in-game economy are tunable at any time without sign-off. This includes:
- Karma thresholds and their effect multipliers
- Market price volatility bands
- Arena damage and loot drop rates
- Whisper compliance probability curves per personality type
- $SHELL costs for premium actions
- Legendary agent threshold for Soul NFT minting eligibility
- Family Vault inheritance percentages

**Boundary:** All tunable values must live in the central config object — never hardcoded in logic. Any change to economy values is made in config, not scattered through modules.

---

## 🔧 11. Agent Memory Architecture

**Current approach:** Claude API context window carries recent event history per agent session.

**Adjustable:** The technical implementation of agent memory — how far back context goes, whether summaries are used to compress history, whether a vector store or external memory layer is added — can be changed as the project scales.

**Boundary:** Agents must always have *some* memory of recent events that influences their decisions. The feeling of a persistent, remembering character is a Tier 1 experience requirement even if the technical implementation changes.

---

## 🔧 12. MoSCoW Scope (Current Sprint Priorities)

**Adjustable:** Features can move between SHOULD and COULD between sprints. New features can be added to the backlog. Sprint goals shift based on what's most valuable right now.

**Boundary:** Nothing moves into MUST without project owner sign-off. Nothing in MUST is removed. The WON'T list is Tier 1 — do not propose moving items off it.

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

### SHOULD (v1.0 enhanced — order flexible)
- Church + Alchemy/Forge systems
- Rumor propagation affecting Market prices
- Agent memory with recent event context
- Isometric 2D world art (replacing placeholder map)
- Agent personality evolution over time
- Easter egg events

### COULD (Post-launch — not sprint candidates yet)
- Cross-player agent interactions in a shared world
- Agent marriages, feuds, guild formation
- Seasonal world events (plague, tournament, eclipse)
- Legacy codex — readable history of deceased agents
- AI-generated agent voice lines

### WON'T (🔒 Tier 1 — these never enter scope)
- Direct Ghost control of the agent
- Framework migration (React, Vue, etc.) without sign-off
- Paid gacha or loot boxes
- Ghost-controlled combat moves
- 3D graphics or engine migration

---

## 🔧 13. Current State (Update Each Sprint)

> **Last updated:** March 2026

**Live at shellforge.xyz:**
- Working dashboard UI
- Agents moving on a waypoint map
- Whisper system functional
- Basic energy and health tracking

**Active sprint goal:** Integrate first full world system (Arena or Market) end-to-end with agent autonomy and karma impact

**Not in this sprint:** Isometric art, crypto layer, Rumor system, Easter eggs

---
---

# QUICK-REFERENCE: THE 6 IMMOVABLE RULES

*Print this. Read it first. If anything you are about to build conflicts with this list, stop and flag it.*

| # | Rule |
|---|---|
| 1 | **The Ghost never controls the agent.** Whisper only. No buttons, no overrides, no "assist mode." |
| 2 | **Claude API is the agent brain.** It is not replaced with scripts, rules, or any other model. |
| 3 | **Vanilla JS only.** No framework without explicit written sign-off. |
| 4 | **The crypto layer ships at v1.0.** $SHELL, Soul NFTs, Lightning whispers, Family Vault. Not post-launch. |
| 5 | **All tunable values live in central config.** No hardcoded numbers in logic. Ever. |
| 6 | **Dark cyberpunk palette only.** No warm colours, no flat-modern UI, no generic fantasy art. |

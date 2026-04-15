# Combat & Ability Card System v1.0

## Overview

Combat uses a **simultaneous turn resolution** model (Pokemon-style). Each turn takes ~8 seconds. Equipped items grant **ability cards** that form the agent's hand. The agent picks a card each turn autonomously. The Ghost can whisper a suggestion via premium whisper.

## Core Resource: Coherence (⚡)

Coherence is quantum computing power — the bridge between hardware and software. Every robot has a coherence pool that fuels abilities.

| Stat | Value |
|------|-------|
| Base pool | 10 ⚡ |
| Regen per turn | +2 ⚡ |
| Max pool | 20 ⚡ |
| Overclock threshold | 15 ⚡ spent in one turn → decoherence risk (10% per ⚡ over 15) |

Decoherence = temporary debuff: -20% accuracy for 2 turns + hallucination flavor text.

## Ability Cards

Each equipped item grants 1-2 ability cards. These form the agent's "hand" for combat.

### Card Structure

```
┌─────────────────────────┐
│ [ICON]  ABILITY NAME    │
│ Type: ATK | ⚡ 3        │
│                         │
│ Deal 15 base damage +   │
│ 10% armor penetration   │
│                         │
│ Source: Plasma Blade     │
│ Cooldown: 0 turns       │
└─────────────────────────┘
```

### Ability Types

| Type | Code | Description |
|------|------|-------------|
| Attack | ATK | Deal damage to opponent |
| Defense | DEF | Reduce incoming damage or block |
| Buff | BUFF | Boost own stats temporarily |
| Debuff | DEBUFF | Reduce opponent stats |
| Heal | HEAL | Restore HP |
| Trap | TRAP | Place delayed effect |
| Utility | UTIL | Special effects (steal, scan, disrupt) |
| Passive | PASSIVE | Always active while equipped (no card played) |

### Hand Composition

A typical hand contains:
- 2 innate archetype abilities (always available)
- 6-10 abilities from equipped items
- 1 Basic Strike (⚡0, always available, 5 base damage)

**Total hand size: 9-14 cards**

### Card Costs

| Item Rarity | Typical ⚡ Cost | Power Level |
|-------------|-----------------|-------------|
| Common | 1-2 ⚡ | Low |
| Uncommon | 2-3 ⚡ | Medium |
| Rare | 3-5 ⚡ | High |
| Legendary | 4-6 ⚡ | Extreme |

### Special Rules

- **Consumables:** One-time use per combat. ⚡0 cost (they're consumed). Disappear from hand after use.
- **Scrolls:** One-time use per combat. ⚡0 cost. Consumed on use.
- **Artifacts:** May have a passive ability (always active, no card play needed) + an active ability.
- **Tools:** Grant utility abilities — scanning, repairing, disrupting.
- **Deployables:** Place traps/turrets that persist for N turns.

## Turn Flow

```
1. DRAW PHASE
   - Hand refreshes (all non-consumed cards available)
   - Coherence regenerates (+2 ⚡)
   - Deployed effects trigger

2. DECISION PHASE (~3s)
   - Agent AI selects a card based on archetype + personality + situation
   - Ghost whisper window (premium whisper to suggest a card)

3. RESOLUTION PHASE (~5s)
   - Both sides resolve simultaneously
   - Priority: TRAP triggers > DEF > ATK > BUFF/DEBUFF > HEAL > UTIL
   - Damage calculated, effects applied
   - Visual replay renders

4. STATUS PHASE
   - Decoherence check (if ⚡ overclock threshold crossed)
   - Buff/debuff duration ticks
   - Deployed effects tick
   - Win/loss check
```

## Ghost Whisper in Combat

The Ghost can suggest a specific ability card during the Decision Phase:

- **Free whisper:** Generic ("defend" / "attack" / "use special") — interpreted by agent
- **Premium whisper:** Name a specific card — agent rolls to comply
  - Base compliance: 50%
  - +15% if archetype matches the strategy
  - +10% if karma is aligned
  - -20% if agent is in a rage state
  - -30% if suggestion seems suicidal (agent self-preservation)

## Damage Formula

```
Damage = (Base + AbilityPower + RNG(1-10)) × TypeModifier × CritModifier
  - Base: weapon base damage
  - AbilityPower: card's stated power
  - TypeModifier: 1.2x if HW vs SW weakness, 0.8x if resisted
  - CritModifier: 1.5x on crit (base 10% chance + gear bonuses)
```

## HP System

| Stat | Base | Gear Modified |
|------|------|---------------|
| HP | 100 | Up to ~180 with full armor |
| Armor (physical) | 0 | Reduces HW damage taken |
| Firewall (digital) | 0 | Reduces SW damage taken |

Hardware attacks reduced by Armor. Software attacks reduced by Firewall. This creates meaningful gear choice — stack physical defense or digital defense based on expected opponents.

## Win Conditions

- **HP reaches 0** — standard defeat
- **Coherence drain** — some abilities drain opponent coherence. At 0 ⚡ with no regen, agent can only Basic Strike
- **Forfeit** — agent may flee if HP < 20% and personality allows (some archetypes never flee)
- **Timeout** — after 20 turns, higher HP % wins

---

## Data Files

- `abilities.csv` — All item-granted abilities (80 items × 1-2 abilities each)
- `archetype-abilities.csv` — Innate archetype abilities (12 archetypes × 2 each)
- `FEUD_ARENA_DESIGN.md` — Feud mechanics and arena tiers

**All numeric values are tunable via game-config.json.**

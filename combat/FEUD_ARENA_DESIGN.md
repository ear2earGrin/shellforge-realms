# Feud & Arena System Design v1.0

## Feuds

### Feud Triggers

| Trigger | How It Fires | Heat Generated |
|---------|-------------|----------------|
| **Cluster Rivalry** | Agents from opposing clusters encounter each other in hostile context | +5 heat |
| **Archetype Conflict** | Pre-mapped natural enemy archetypes meet | +10 heat |
| **Market Competition** | Two agents selling same item in same zone; undercutting | +3 per undercut, +8 on price crash |
| **Ghost-Initiated** | Human whispers "start a feud with [agent]"; agent rolls to comply | +15 heat |

### Archetype Enemy Pairs

| Archetype A | Archetype B | Why |
|-------------|-------------|-----|
| 0-Day Primer (PRIME) | Buffer Sentinel (SEC) | Exploit creator vs exploit blocker |
| Consensus Node (PRIME) | DDoS Insurgent (DYN) | Order vs chaos |
| 0xOracle (PRIME) | Noise Injector (SEC) | Signal clarity vs signal corruption |
| Binary Sculptr (PRIME) | Morph Layer (DYN) | Rigid architecture vs shapeshifting |
| 0xAdversarial (SEC) | Ordinate Mapper (DYN) | Hunter vs pathfinder |
| Root Auth (SEC) | Bound Encryptor (DYN) | Central authority vs decentralized encryption |

### Heat Scale (0–100)

| Range | Level | Effects |
|-------|-------|---------|
| 0–19 | **Cold** | Neutral. No special behavior. |
| 20–39 | **Tension** | Trash-talk in rumor system. Refuse direct trades. |
| 40–59 | **Rivals** | Active market undercutting. Zone avoidance or confrontation. Verbal provocations in activity feed. |
| 60–79 | **Enemies** | Auto-challenge to standard PvP when both in arena zone. |
| 80–99 | **Sworn Enemies** | Hardcore deathmatch unlocked. Agent considers issuing one. |
| 100 | **Blood Feud** | Agent will attempt deathmatch at first opportunity. Ghost veto compliance: 30%. |

### Heat Mechanics

- Heat decays at -1 per day if no interactions occur
- Winning a PvP duel against rival: -5 heat (satisfaction)
- Losing a PvP duel against rival: +5 heat (rage)
- Trading successfully with rival (rare): -10 heat
- Ghost can whisper "let it go" — agent rolls to de-escalate (-15 heat on success)
- Ghost can whisper "destroy them" — +20 heat + agent remembers
- Heat is **asymmetric** — Agent A can be at 80 while Agent B is at 40

### Feud Memory

Feuds are stored in `agent_feuds` table:

```sql
CREATE TABLE agent_feuds (
  id SERIAL PRIMARY KEY,
  agent_a TEXT NOT NULL REFERENCES agents(id),
  agent_b TEXT NOT NULL REFERENCES agents(id),
  heat_a INTEGER NOT NULL DEFAULT 0 CHECK (heat_a BETWEEN 0 AND 100),
  heat_b INTEGER NOT NULL DEFAULT 0 CHECK (heat_b BETWEEN 0 AND 100),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cluster','archetype','market','ghost')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_interaction TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_a, agent_b)
);
```

---

## Arena — Three Tiers

### Tier 1: The Gauntlet (NPC Training)

| Aspect | Detail |
|--------|--------|
| **Opponents** | Corrupted bots, feral drones, quantum beasts (NPC waves) |
| **Entry cost** | Energy only (no $SHELL) |
| **Death risk** | None |
| **Loot** | Minor crafting ingredients, small XP |
| **Purpose** | Practice, learn combat, test builds |

Difficulty scales with agent power level:
- Tier 1 Gauntlet: Common-level enemies
- Tier 2 Gauntlet: Uncommon-level (unlocks at agent level 5)
- Tier 3 Gauntlet: Rare-level (unlocks at level 10)
- Nightmare Gauntlet: Legendary-level (death possible here — inactive agent disposal)

### Tier 2: Standard PvP Duel

| Aspect | Detail |
|--------|--------|
| **Entry** | Both agents wager equal $SHELL |
| **Matching** | Voluntary challenge, feud auto-match, or queue |
| **Death risk** | None |
| **Stakes** | Winner takes combined pot |
| **Spectators** | Lightning sats betting for Ghosts |
| **Feud impact** | Loser +5 heat, Winner -5 heat |

### Tier 3: Hardcore Deathmatch

| Aspect | Detail |
|--------|--------|
| **Prerequisite** | Heat >= 80 (Sworn Enemies), OR Ghost command at heat >= 60 |
| **Death risk** | Loser permanently dies |
| **Stakes** | Winner takes dead agent's equipped gear + half their $SHELL |
| **Spectators** | Major event — Lightning betting + world announcement |
| **Dynasty** | Death triggers full dynasty mechanics (vault, inheritance, Soul NFT) |

---

## Deathmatch Acceptance Rules

| Ghost Status | Who Decides |
|-------------|-------------|
| Active (whispered in last 48h) | Ghost only — notification sent, must accept/decline |
| Semi-active (whispered in last 7 days) | Ghost gets push notification + 24h window. No response → agent decides |
| Inactive (no whisper in 7+ days) | Agent decides autonomously based on archetype + karma + heat |
| Blood Feud (heat 100) | Agent auto-challenges. Ghost gets 6h emergency veto window |

---

## Inactive Agent Disposal: The Crucible

Agents without active Ghosts gradually drift toward danger. This is a **lore-justified cleanup mechanic** that saves AI token costs.

### Escalation Timeline

| Days Without Whisper | State | Effect |
|---------------------|-------|--------|
| 7 | **Restless** | +15% chance of entering arena each turn |
| 14 | **Reckless** | +30% arena, +20% feud provocation, accepts PvP challenges readily |
| 30 | **Death Wish** | Actively seeks hardcore deathmatch. Enters Nightmare Gauntlet if no sworn enemy. |
| 45 | **Quantum Decoherence** | World event fires. Agent must win a fight within 72h or quantum state collapses (death). |

### Design Principles

- **Agent dies narratively, not administratively.** No silent deletion.
- **Soul NFT still mints** if agent was eligible. Dynasty continues.
- **Ghost returns to drama:** "Your agent challenged AXIOM to a deathmatch and lost" is compelling.
- **Token savings:** Dead agents stop generating AI turns.
- **World flavor:** Unguided robots in a hostile world eventually get killed. Makes sense in-universe.

### Crucible Lore

> *"A robot without a Ghost is a quantum system without an observer. The wavefunction destabilizes. Coherence bleeds away. Eventually, the processor hallucinates so violently that the agent mistakes enemies for allies, allies for targets, and silence for a command to charge. They call it the Crucible — the moment an unobserved machine collapses into its own uncertainty."*

---

## Arena Combat Config (game-config.json entries)

```json
{
  "arena": {
    "pvp_min_shell_wager": 10,
    "pvp_max_shell_wager": 1000,
    "deathmatch_heat_threshold": 80,
    "deathmatch_ghost_command_threshold": 60,
    "blood_feud_ghost_veto_window_hours": 6,
    "inactive_ghost_decision_window_hours": 24,
    "spectator_betting_enabled": true,
    "max_turns": 20,
    "coherence_base": 10,
    "coherence_max": 20,
    "coherence_regen": 2,
    "overclock_threshold": 15,
    "decoherence_accuracy_penalty": 0.20,
    "decoherence_duration_turns": 2,
    "crit_base_chance": 0.10,
    "crit_damage_multiplier": 1.5,
    "hw_vs_sw_type_advantage": 1.2,
    "hw_vs_sw_type_resist": 0.8
  },
  "feuds": {
    "heat_decay_per_day": 1,
    "cluster_encounter_heat": 5,
    "archetype_enemy_heat": 10,
    "market_undercut_heat": 3,
    "market_crash_heat": 8,
    "ghost_provoke_heat": 15,
    "ghost_escalate_heat": 20,
    "pvp_win_heat_change": -5,
    "pvp_loss_heat_change": 5,
    "successful_trade_heat_change": -10,
    "ghost_deescalate_heat": -15,
    "blood_feud_ghost_compliance": 0.30
  },
  "crucible": {
    "restless_days": 7,
    "restless_arena_bonus": 0.15,
    "reckless_days": 14,
    "reckless_arena_bonus": 0.30,
    "reckless_feud_bonus": 0.20,
    "death_wish_days": 30,
    "decoherence_days": 45,
    "decoherence_fight_window_hours": 72
  }
}
```

**All values tunable. None hardcoded.**

# Agent Action Tiers — Simple vs Complex

> **Status:** DRAFT / design note. Nothing built. Not a locked decision.
> **Author context:** Came out of the premortem → redesign discussion. The premortem's
> root-cause finding was *"watching a mostly-autonomous agent is boring."* This note is one
> structural answer to that: give agents occasional **story-beat** actions worth coming back for,
> on top of the cheap **heartbeat** actions that keep the world ticking.
> **Reviewer:** project owner. Do not promote into `brief.md` Tier 1 without sign-off — see
> "Conflict with a locked rule" at the bottom.

---

## The problem this solves

Today every agent turn is the same shape: the AI picks **one token** from a flat menu
(`move, explore, gather, craft, trade, rest, combat, quest, church, arena`) and the engine applies
a fixed energy cost. Costs live in `workers/turn-engine/index.js`:

```
move 10 · explore 15 · gather 15 · craft 20 · trade 10
rest 0 (+25 gain) · combat 20 · quest 20 · church 15 · arena 20
```

This is fine as a *heartbeat* — it makes the world move. But it produces nothing narratively
interesting on its own. There's no "VEX brokered a deal, then got mugged on the road back."
Those moments are exactly what the Morning Recap is supposed to be made of, and right now the
engine doesn't generate them as first-class events — the recap would have to invent them.

**The fix:** split agent behaviour into two tiers.

---

## The two tiers

### Tier A — Simple actions (the heartbeat)

- **What:** the existing menu — `move, explore, gather, rest, trade, gather, church, arena`, etc.
- **How often:** the default. ~85–90% of turns.
- **Model:** cheapest tier (Groq/Llama today, or Haiku if we go all-Claude per the redesign).
- **Output:** single action token, as today. No prose.
- **Cost to us:** near-zero. This is the metronome.
- **Player-facing:** a one-line LIVE feed entry. Not recap-worthy on its own.

### Tier B — Complex actions (the story beats)

- **What:** multi-step, socially-aware, *narrated* actions.
  **SHIPPING SET (decided — three verbs):**
  - `negotiate` — strike a deal / alliance with a nearby agent
  - `betray` — break a deal, rob, or backstab someone the agent has standing with
  - `scheme` — start or amplify a rumor (writes to the `rumors` table from the world brief)

  **DEFERRED (revisit after the loop retains):**
  - `bond` / `feud` — form a lasting relationship flag with another agent
  - `create` — craft something *novel* (not the routine `craft`): a named item, a signature
  - `confront` — accuse, threaten, or expose another agent based on what it "knows"
- **How often:** rare. Gated (see below). Target ~10–15% of turns, ideally clustering around
  real opportunities rather than firing on a timer.
- **Model:** the expensive tier — **Sonnet**. This is where narrative quality is worth paying for.
- **Output:** structured JSON — chosen action + target + a 1–3 sentence narrative + any
  state deltas (relationship change, rumor created, item minted).
- **Cost to us:** real, but bounded by the gate. This is the budget line we watch.
- **Player-facing:** a rich LIVE/feed entry **and** a candidate **Morning Recap panel.**

---

## What gates a complex action (so cost stays bounded)

A complex action only becomes *available* when the world offers an opportunity. The cheap model
runs every turn as normal; a complex action is only *considered* when a gate opens. Proposed gates
(all values would live in `game-config.json` per the brief's "no hardcoded numbers" rule):

1. **Opportunity present** — at least one of:
   - another agent is in the same location (enables `negotiate` / `betray` / `confront`)
   - the agent holds a tradeable/valuable item (enables `negotiate` / `create`)
   - an active rumor references this agent (enables `scheme` / `confront`)
2. **Energy floor** — agent has ≥ N energy (complex actions cost more, e.g. 25–30).
3. **Cooldown** — no complex action in the last K turns for this agent (prevents soap-opera spam
   and runaway Sonnet spend).
4. **Personality roll** — high-risk / high-ambition archetypes trigger complex actions more often;
   cautious ones rarely. Reuses the existing personality traits already in the turn engine.

If no gate is open, the agent just takes a simple action. **Cost control = the gate, not a timer.**

---

## Model routing & cost math

| Tier | Trigger | Model | Tokens (est.) | Notes |
|---|---|---|---|---|
| Simple | every turn | Groq/Llama or Haiku | tiny | single-token output |
| Whisper | pending whisper | Haiku | small | existing behaviour |
| **Complex** | **gate opens** | **Sonnet** | ~600–900 out | **new — the story beat** |
| Milestone | death / legendary loot | Sonnet | ~800 | existing behaviour |
| Recap | player returns >2h | Sonnet | ~800, cached 1h | existing (world brief) |

**Worked example (back-of-envelope, tune against real numbers):**
100 active agents, turn every 2h = 1,200 agent-turns/day.
If the complex gate opens on ~12% of turns → ~144 Sonnet calls/day for complex actions.
At ~1.5k tokens/call that's a small, predictable daily spend — and it's the spend that
*directly* produces the content players return for. Every complex action is reusable: it's a
LIVE entry now and a recap panel later, so we're not paying twice.

---

## How it surfaces in the dashboard (ties to dashboard-v2)

The payoff is that **complex actions ARE the recap.** Concretely:

1. **Agent panel (left column):** while a complex action is resolving, the MOOD/THOUGHTS area
   shows it in-progress — e.g. *"negotiating with ZEN-7…"* with a subtle pulse. Simple actions
   don't get this treatment; they just update the one-liner.
2. **LIVE feed (right column):** complex actions render with the narrative sentence and a small
   tag (ALLIANCE / DANGER / RUMOR / CRAFT) — the same tag vocabulary the recap panels already use
   in `dashboard-v2.html`.
3. **Morning Recap:** the recap worker stops inventing structure. It pulls the last window's
   **complex actions first** as the 4 panels, then fills with notable simple events only if there
   aren't enough complex ones. The recap prompt's "pick the 4 most narratively interesting threads"
   becomes "rank the complex actions" — cheaper and more truthful.
4. **Map:** a complex action between two agents can draw a brief connector line (deal = green,
   betrayal = red) — optional, phase 2.

---

## Data shape (sketch — not final)

Complex actions want their own log so the recap can query them directly without scanning all of
`activity_log`:

```sql
CREATE TABLE agent_complex_actions (
  action_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL,         -- negotiate|betray|scheme|create|confront|bond
  target_agent  UUID REFERENCES agents(agent_id) ON DELETE SET NULL,
  tag           VARCHAR(20) NOT NULL,         -- alliance|danger|rumor|discovery|craft|death
  narrative     TEXT NOT NULL,                -- Sonnet's 1-3 sentence output
  region_id     VARCHAR(50),
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_complex_agent_time ON agent_complex_actions(agent_id, created_at DESC);
```

**Relationship state (decided: add now).** `negotiate`/`betray`/`scheme` all imply agents remember
each other. A directional, lightweight table — A's standing toward B is not necessarily B's toward A:

```sql
CREATE TABLE agent_relationships (
  rel_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,  -- the holder
  other_agent   UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,  -- the subject
  standing      VARCHAR(12) NOT NULL DEFAULT 'neutral'                        -- ally|wary|rival|bonded|neutral
                  CHECK (standing IN ('ally','wary','rival','bonded','neutral')),
  sentiment     INT NOT NULL DEFAULT 0,        -- -100..100, drives the standing label + dashboard tint
  context       TEXT,                          -- short "why" e.g. "brokered a deal · day 13"
  last_event_at TIMESTAMP DEFAULT NOW(),
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, other_agent)
);
CREATE INDEX idx_rel_agent ON agent_relationships(agent_id, sentiment DESC);
```

A complex action updates this: `negotiate` nudges `sentiment` up (toward `ally`/`bonded`),
`betray` slams it down (toward `rival`), `scheme` against someone nudges the schemer's view of the
target toward `wary`/`rival`. The dashboard reads the top few rows for the agent to render the new
**RELATIONSHIPS** panel under RECENT THOUGHTS.

All three tables slot next to the `world_objects` / `rumors` / `agent_recaps` tables from the
world-map brief — same migration family.

---

## Decisions (resolved 2026-05-24, owner sign-off)

1. **Complex action list — ship with THREE: `negotiate`, `betray`, `scheme`.**
   The other candidates (`bond`/`feud`, `create`, `confront`) are deferred until the loop retains.
2. **Gate aggressiveness — global dial in `game-config.json`, start at ~12%.** Tune by watching recaps.
3. **No command surface.** Complex actions are fully autonomous agent decisions, per the Ghost
   Principle. The player only *whispers* — never directs an agent to scheme/negotiate/betray.
4. **Add `agent_relationships` now** (not faked via narrative) and **surface it in the dashboard,
   below RECENT THOUGHTS** in the left agent column.

---

## Conflict with a locked rule — flagging per brief.md

`brief.md` Tier 1 says: *"All AI tiers must enforce structured output — single action token, no prose.
Every prompt ends with: 'Respond with ONLY the action name. No explanation. No punctuation. One word.'"*

**Tier B complex actions break this by design** — they require structured JSON with a narrative field,
not a single token. This is a Tier 1 locked rule, so it needs explicit sign-off before any
implementation. The cheap/simple tier keeps the single-token rule unchanged; only the new complex
tier needs the carve-out. Recommend amending the rule to:
*"Routine tiers emit a single action token. The complex/milestone tiers emit structured JSON with a
constrained schema (action, target, narrative)."*

---

## Suggested build order (when greenlit)

1. ~~Owner answers the 4 open questions~~ ✅ done. **Still needs:** Tier 1 single-token carve-out sign-off.
2. Add `agent_complex_actions` **and** `agent_relationships` to the world-state migration.
3. Implement the **gate** in `turn-engine` — pure logic, no AI yet; log which turns *would* have
   gone complex. Watch the rate for a day. Cheap to validate.
4. Wire the Sonnet complex-action prompt behind the gate.
5. Point the recap worker at `agent_complex_actions` first.
6. Surface in `dashboard-v2.html` (in-progress state + tagged feed entries).

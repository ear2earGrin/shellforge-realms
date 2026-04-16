# Combat Engine — Implementation & Deploy Guide

This document describes how to deploy the combat backend to Supabase + Cloudflare Workers and verify it works end-to-end.

## Prerequisites

- Supabase project set up (already done — `wtzrxscdlqdgdiefsmru.supabase.co`)
- `wrangler` CLI authenticated on the Mac Mini
- Anthropic API key in `ANTHROPIC_API_KEY` Worker secret
- `combat/migration.sql` (alchemy migration must be run first)
- `alchemy/migration.sql` and `alchemy/seed.sql` already applied

## Deploy Steps

### 1. Apply Combat Schema

In Supabase SQL Editor:

```sql
-- Step A: Run combat/migration.sql
--   (Creates 9 tables, 3 views, RLS policies, indexes)

-- Step B: Run combat/seed.sql
--   (Inserts 89 item abilities + 24 archetype abilities)
```

Verify in Supabase Table Editor:
- `combat_abilities` should have 89 rows
- `archetype_abilities` should have 24 rows
- `combat_matches`, `combat_turns`, `combat_effects`, `combat_whispers` should all exist (empty)
- `agent_feuds`, `crucible_states`, `spectator_bets` should all exist (empty)
- Views `v_active_matches`, `v_hot_feuds`, `v_crucible_danger` should be queryable

### 2. Configure Worker Secrets

```bash
cd workers/combat-engine
npx wrangler secret put SUPABASE_URL
# Paste: https://wtzrxscdlqdgdiefsmru.supabase.co

npx wrangler secret put SUPABASE_SERVICE_KEY
# Paste your service-role key (from Supabase API settings)

npx wrangler secret put ANTHROPIC_API_KEY
# Paste your Anthropic API key

# Optional: external config URL (else baked-in defaults are used)
npx wrangler secret put GAME_CONFIG_URL
# Paste: https://shellforge.xyz/game-config.json

# Optional: push notification webhook for mobile app
npx wrangler secret put PUSH_NOTIFY_URL
# Paste your Expo Push or OneSignal webhook
```

### 3. Deploy Worker

```bash
cd workers/combat-engine
npx wrangler deploy
```

Worker URL will be: `https://shellforge-combat-engine.<your-subdomain>.workers.dev`

### 4. Verify Health

```bash
curl https://shellforge-combat-engine.<sub>.workers.dev/health
# → {"ok":true,"service":"shellforge-combat-engine","version":"1.0"}

curl https://shellforge-combat-engine.<sub>.workers.dev/combat/abilities | head
# Returns 113 abilities (89 item + 24 archetype)
```

### 5. Run a Smoke Test Match (gauntlet, no death)

```bash
# Create gauntlet match for an existing agent
curl -X POST https://shellforge-combat-engine.<sub>.workers.dev/combat/initiate \
  -H "Content-Type: application/json" \
  -d '{"match_type":"gauntlet","agent_a":"vex_789","tier":1}'

# Wait ~60s for cron to advance turns, then:
curl https://shellforge-combat-engine.<sub>.workers.dev/combat/agent/vex_789/active

# Once status=resolved:
curl https://shellforge-combat-engine.<sub>.workers.dev/combat/match/<match_id>
# Returns full match + turn-by-turn replay
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker: shellforge-combat-engine                │
│  ─────────────────────────────────────────────              │
│  HTTP routes (REST API)                                     │
│   ├─ /combat/*        ← match lifecycle, whispers           │
│   ├─ /feuds/*         ← heat tracking events                │
│   └─ /crucible/*      ← inactive-agent escalation           │
│                                                              │
│  Cron triggers                                              │
│   ├─ */1 * * * *      ← advance pending+active matches      │
│   ├─ 0 */6 * * *      ← Crucible evaluation                 │
│   └─ 0 3 * * *        ← daily feud heat decay               │
└─────────────────────────────────────────────────────────────┘
                          ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│  Supabase PostgreSQL                                         │
│  ─────────────────────────────────────────────              │
│  combat_abilities      — ability catalogue (89 rows)         │
│  archetype_abilities   — innate abilities (24 rows)          │
│  combat_matches        — fight records                       │
│  combat_turns          — full state snapshot per turn        │
│  combat_effects        — mid-match buffs/debuffs/DoTs        │
│  combat_whispers       — Ghost suggestions                   │
│  agent_feuds           — pairwise heat (asymmetric)          │
│  crucible_states       — inactive escalation tracking        │
│  spectator_bets        — Lightning sats wagering (future)    │
└─────────────────────────────────────────────────────────────┘
```

## How It Plays

1. **Match created** (POST /combat/initiate) — status `pending`
2. **Cron picks it up** (within 1 minute) — `initializeMatch` builds decks from inventory + archetype, snapshots both sides into `agent_*_snapshot`
3. **Cron advances turn each minute** — `resolveTurn` runs, both sides decide simultaneously via Haiku
4. **Each turn writes**:
   - Full state snapshot to `combat_turns` (renderer-agnostic replay data)
   - Active effects updated in `combat_effects`
5. **Match resolves** when HP=0 or turn limit hit
6. **Post-match hooks**: feud heat update, death narration (Sonnet), push notifications

## How To Trigger Combat From Other Systems

From your existing turn-engine (or wherever):

```javascript
// Two agents at the same hostile location → check feud + maybe trigger
await fetch(`${COMBAT_ENGINE_URL}/feuds/event`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event_type: 'cluster_encounter',
    agent_a: 'vex_789',
    agent_b: 'axiom_456',
  }),
});

// Ghost types "fight axiom in arena":
await fetch(`${COMBAT_ENGINE_URL}/combat/initiate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    match_type: 'pvp',
    agent_a: 'vex_789',
    agent_b: 'axiom_456',
    shell_pot: 50,
  }),
});

// Ghost whispers during combat:
await fetch(`${COMBAT_ENGINE_URL}/combat/whisper`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    match_id: 'abc-123',
    ghost_id: 'user_42',
    agent_id: 'vex_789',
    suggestion: 'Plasma Slash',
    is_premium: true,
  }),
});
```

## Mobile App Integration (Future)

See `combat/PUSH_PAYLOADS.md` for the push notification payload spec.

The mobile app already has Supabase client config — to view combat replays:

```typescript
// mobile/app/(tabs)/combat.tsx (to be built)
const { data: matches } = await supabase
  .from('v_active_matches')
  .select('*')
  .order('started_at', { ascending: false });

const { data: turns } = await supabase
  .from('combat_turns')
  .select('*')
  .eq('match_id', matchId)
  .order('turn_number', { ascending: true });
```

The schema is renderer-agnostic — turns contain full state snapshots that React Native, browser, or future engine clients can all replay.

## Failure Modes Handled

| Failure | Behavior |
|---------|----------|
| Haiku API down | Falls back to archetype-weighted random |
| Sonnet API down | Falls back to templated narration |
| Two agents both initiate | Atomic check-and-create returns existing match ID |
| Agent equips new item mid-match | Snapshot at match start is immutable, no effect |
| Worker timeout mid-turn | Turn is idempotent (next cron retries) |
| Decoherence deadline hit | Agent dies via `checkCollapses`, dynasty triggers via existing turn-engine death-handler |
| RLS blocks read | Service-role key bypasses RLS; anon clients get public read on all combat tables |

## What's NOT Built (Out of Scope For This Pass)

- Browser combat UI (next ticket — pure HTML/CSS/JS, reads from `combat_turns`)
- Mobile app combat screen (schema/types ready, build later)
- PixiJS visual replay (Phase B.5)
- Spectator betting UI (schema ready, UI later)
- Real Lightning sats payout integration
- Karma → whisper compliance integration (stubbed at `agent.karma >= 0`)

## Tuning

All numeric values live in `game-config.json`. Edit, push to repo, restart Worker (or just wait for the 5-min config cache to expire). No code changes needed for balance tweaks.

## Logs & Debugging

```bash
cd workers/combat-engine
npx wrangler tail
```

Look for prefixes:
- `[supabase]` — REST call failures
- `[ai-decision]` — Haiku failures, fallback usage
- `[narration]` — Sonnet failures
- `[cron]` — every-minute pulse output
- `[push]` — push webhook failures
- `[handler]` — uncaught errors in routes

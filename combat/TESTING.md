# Combat Engine — Testing Guide

Manual test scenarios. The engine runs on a real Cloudflare Worker + Supabase, so unit tests aren't included here — every test is end-to-end.

## Prerequisites

- Combat engine deployed (`shellforge-combat-engine.<sub>.workers.dev`)
- All migrations applied
- At least 2 test agents in the `agents` table with archetypes set
- `ANTHROPIC_API_KEY` configured (else AI decision falls back to random)

Set these env vars in your terminal:

```bash
export COMBAT_URL="https://shellforge-combat-engine.<sub>.workers.dev"
export AGENT_A="vex_789"
export AGENT_B="axiom_456"
```

---

## Test 1: Health Check

```bash
curl $COMBAT_URL/health
```

**Expected:** `{"ok":true,"service":"shellforge-combat-engine","version":"1.0"}`

---

## Test 2: Ability Catalogue

```bash
curl $COMBAT_URL/combat/abilities | jq '.item_abilities | length, .archetype_abilities | length'
```

**Expected:** `89` and `24`

---

## Test 3: Gauntlet Match (no death possible)

```bash
# Create
MATCH_ID=$(curl -s -X POST $COMBAT_URL/combat/initiate \
  -H "Content-Type: application/json" \
  -d "{\"match_type\":\"gauntlet\",\"agent_a\":\"$AGENT_A\",\"tier\":1}" \
  | jq -r '.match.id')

echo "Match: $MATCH_ID"

# Wait 2 minutes for cron to advance
sleep 120

# Check status
curl -s $COMBAT_URL/combat/match/$MATCH_ID | jq '.match.status, .match.turns_total'
```

**Expected after 2 min:** status `in_progress` with 1-2 turns OR `resolved` if it advanced fast enough.

If you want faster testing, manually advance turns:

```bash
curl -s -X POST $COMBAT_URL/combat/turn \
  -H "Content-Type: application/json" \
  -d "{\"match_id\":\"$MATCH_ID\"}"
```

Repeat until status = `resolved`.

---

## Test 4: PvP Match Between Two Real Agents

```bash
MATCH_ID=$(curl -s -X POST $COMBAT_URL/combat/initiate \
  -H "Content-Type: application/json" \
  -d "{\"match_type\":\"pvp\",\"agent_a\":\"$AGENT_A\",\"agent_b\":\"$AGENT_B\",\"shell_pot\":50}" \
  | jq -r '.match.id')

# Both agents pick cards via Haiku, simultaneously resolved
# Advance turns manually for faster testing:
for i in {1..10}; do
  curl -s -X POST $COMBAT_URL/combat/turn -H "Content-Type: application/json" \
    -d "{\"match_id\":\"$MATCH_ID\"}" | jq '.status, .state_a.hp, .state_b.hp'
  sleep 1
done
```

**Expected:** Each turn shows simultaneous HP changes. Match resolves when one HP hits 0 or turn 20 reached.

Get full replay:

```bash
curl -s $COMBAT_URL/combat/match/$MATCH_ID | jq '.turns[] | {turn:.turn_number, action_a:.agent_a_action.ability_name, action_b:.agent_b_action.ability_name, hp_a:.agent_a_hp_after, hp_b:.agent_b_hp_after, dmg_a:.damage_dealt_to_a, dmg_b:.damage_dealt_to_b}'
```

---

## Test 5: Whisper During Combat

```bash
# Start a PvP match (steps from Test 4)

# Whisper a specific card to AGENT_A
curl -X POST $COMBAT_URL/combat/whisper \
  -H "Content-Type: application/json" \
  -d "{\"match_id\":\"$MATCH_ID\",\"ghost_id\":\"user_42\",\"agent_id\":\"$AGENT_A\",\"suggestion\":\"Plasma Slash\",\"is_premium\":true}"

# Advance one turn
curl -X POST $COMBAT_URL/combat/turn -H "Content-Type: application/json" \
  -d "{\"match_id\":\"$MATCH_ID\"}" | jq '.effects_triggered'

# Check whether agent followed
psql $DATABASE_URL -c "SELECT suggestion, was_followed, compliance_roll FROM combat_whispers WHERE match_id = '$MATCH_ID';"
```

**Expected:** Whisper row has `was_followed = true|false` based on the compliance roll. If `true`, the agent's action that turn is `Plasma Slash`.

---

## Test 6: Feud Heat Tracking

```bash
# Trigger a cluster encounter
curl -X POST $COMBAT_URL/feuds/event \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"cluster_encounter\",\"agent_a\":\"$AGENT_A\",\"agent_b\":\"$AGENT_B\"}"

# Check feud
curl -s $COMBAT_URL/feuds/agent/$AGENT_A | jq '.feuds[] | {agent_a, agent_b, heat_a, heat_b}'
```

**Expected:** Both heat_a and heat_b = 5.

Trigger an archetype-enemy meeting (only works if archetypes are pre-mapped enemies):

```bash
curl -X POST $COMBAT_URL/feuds/event \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"archetype_meeting\",\"agent_a\":\"$AGENT_A\",\"agent_b\":\"$AGENT_B\"}"
```

Trigger a Ghost provocation:

```bash
curl -X POST $COMBAT_URL/feuds/event \
  -H "Content-Type: application/json" \
  -d "{\"event_type\":\"ghost_provoke\",\"agent_a\":\"$AGENT_A\",\"agent_b\":\"$AGENT_B\",\"intensity\":\"destroy\"}"
```

Heat goes up by 20.

---

## Test 7: Deathmatch (PERMADEATH)

⚠️ **This will permanently kill the loser.** Only run with test agents.

```bash
# Set heat to >= 80 first (use direct DB or trigger many feud events)
psql $DATABASE_URL -c "UPDATE agent_feuds SET heat_a = 85, heat_b = 85 WHERE agent_a = '$AGENT_A' AND agent_b = '$AGENT_B';"

FEUD_ID=$(psql $DATABASE_URL -t -c "SELECT id FROM agent_feuds WHERE agent_a = '$AGENT_A' AND agent_b = '$AGENT_B';" | xargs)

MATCH_ID=$(curl -s -X POST $COMBAT_URL/combat/initiate \
  -H "Content-Type: application/json" \
  -d "{\"match_type\":\"deathmatch\",\"agent_a\":\"$AGENT_A\",\"agent_b\":\"$AGENT_B\",\"feud_id\":$FEUD_ID,\"shell_pot\":100}" \
  | jq -r '.match.id')

# Run to completion
while true; do
  STATUS=$(curl -s -X POST $COMBAT_URL/combat/turn -H "Content-Type: application/json" \
    -d "{\"match_id\":\"$MATCH_ID\"}" | jq -r '.status')
  echo "Status: $STATUS"
  [[ "$STATUS" == "resolved" ]] && break
  sleep 1
done

# Check death narration
curl -s $COMBAT_URL/combat/match/$MATCH_ID | jq '.match | {death_occurred, death_agent_id, winner_agent_id}'

# Check loser's status
psql $DATABASE_URL -c "SELECT username, status, health FROM agents WHERE agent_id IN ('$AGENT_A', '$AGENT_B');"
```

**Expected:** Loser has `status = 'dead'`, `health = 0`. Activity log has a death narration entry.

---

## Test 8: Crucible Manual Trigger

```bash
# Force-set an agent's last_whisper_at to 50 days ago
psql $DATABASE_URL -c "UPDATE agents SET last_whisper_at = now() - interval '50 days' WHERE agent_id = '$AGENT_A';"

# Run crucible eval
curl -X POST $COMBAT_URL/crucible/check

# Check state
curl -s $COMBAT_URL/crucible/agent/$AGENT_A | jq
```

**Expected:** stage = `decoherence`, `decoherence_started` and `decoherence_deadline` set.

To test collapse:

```bash
# Force deadline to past
psql $DATABASE_URL -c "UPDATE crucible_states SET decoherence_deadline = now() - interval '1 hour' WHERE agent_id = '$AGENT_A';"

curl -X POST $COMBAT_URL/crucible/check
```

**Expected:** Agent dies (status = dead, health = 0). Stage = `collapsed`. Activity log has Sonnet narration.

---

## Test 9: Verify Replay Data Integrity

```bash
curl -s $COMBAT_URL/combat/match/$MATCH_ID | jq '.turns | length, .turns[0]'
```

**Expected:** Each turn has all fields:
- `turn_number`
- `agent_*_action.ability_name`
- `agent_*_hp_before/after`
- `agent_*_coherence_before/after`
- `effects_triggered` (array)
- `damage_dealt_to_*`
- `was_critical_*`
- `active_effects_*` (array — for client to render buff/debuff icons)

This is the data structure mobile/web/Pixi/Godot clients consume to replay matches.

---

## Test 10: Concurrency — Two Simultaneous Initiates

```bash
# Both should attempt to create the same match
curl -X POST $COMBAT_URL/combat/initiate -H "Content-Type: application/json" \
  -d "{\"match_type\":\"pvp\",\"agent_a\":\"$AGENT_A\",\"agent_b\":\"$AGENT_B\",\"shell_pot\":50}" &
curl -X POST $COMBAT_URL/combat/initiate -H "Content-Type: application/json" \
  -d "{\"match_type\":\"pvp\",\"agent_a\":\"$AGENT_A\",\"agent_b\":\"$AGENT_B\",\"shell_pot\":50}" &
wait
```

**Expected:** First call succeeds, second returns `{"ok":false,"error":"match already exists ..."}` with the existing match_id. Only one match in DB.

---

## Common Issues

### "match not found" after creation
- Check Supabase RLS — service-role key bypasses it, but if the Worker is using anon key by mistake, reads fail silently.

### Haiku always falls back to random
- Verify `ANTHROPIC_API_KEY` is set: `npx wrangler secret list`
- Check Worker logs for `[ai-decision]` errors: `npx wrangler tail`

### Cron not advancing matches
- Cron triggers are enabled by default but check Cloudflare dashboard → Workers → Triggers
- Manually trigger: `POST /combat/turn` for an in-progress match

### Decks empty / Basic Strike only
- Agent has no equipped items AND archetype query returns nothing
- Check `archetype_abilities` table is seeded
- Check agent's `archetype` field matches what's in `archetype_abilities.archetype` (case-sensitive)

### Effects accumulate forever
- `tickEffects` runs at start of each turn — if turns aren't advancing, effects pile up
- Manually clean up: `DELETE FROM combat_effects WHERE match_id = '<id>';`

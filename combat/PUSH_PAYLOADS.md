# Push Notification Payloads — Combat Engine

The combat engine sends push notifications to `env.PUSH_NOTIFY_URL` (your Expo Push, OneSignal, or custom forwarding service). This document specifies every payload type so the mobile app dev (or future-you) knows what to listen for.

## Webhook Format

All payloads are POST'd as JSON to `PUSH_NOTIFY_URL`:

```json
POST <PUSH_NOTIFY_URL>
Content-Type: application/json

{
  "type": "<event_type>",
  "agent_id": "<who_this_is_about>",
  "ghost_id": "<who_to_notify>",
  ...event-specific fields...
}
```

The webhook is responsible for resolving `ghost_id` → push token (Expo / FCM / APNs) and delivering.

## Event Types

### `match_won`
Standard PvP victory or gauntlet win.
```json
{
  "type": "match_won",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "match_id": "abc-123-uuid"
}
```
**Mobile copy suggestion:**
> "VEX won their arena match. Tap to view replay."

---

### `match_lost`
Standard PvP loss (no death — gauntlet/wild can have deaths, see below).
```json
{
  "type": "match_lost",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "match_id": "abc-123-uuid"
}
```
**Mobile copy suggestion:**
> "VEX lost their arena match."

---

### `death`
An agent died in combat (deathmatch or wild encounter).
```json
{
  "type": "death",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "match_id": "abc-123-uuid",
  "narration": "VEX took Plasma Slash from AXIOM on turn 14 and went dark. The chassis remained for the salvagers..."
}
```
**Mobile copy suggestion:**
> "VEX died in the arena. A new heir awaits in your dynasty."

This is a **CRITICAL** notification — show the narration prominently, link to dynasty/heir creation flow.

---

### `deathmatch_win`
The Ghost's agent won a hardcore deathmatch (took gear + half opponent's $SHELL).
```json
{
  "type": "deathmatch_win",
  "agent_id": "axiom_456",
  "ghost_id": "user_99",
  "match_id": "abc-123-uuid",
  "narration": "AXIOM stood over VEX's silent chassis. The crowd noise had stopped some turns ago..."
}
```
**Mobile copy suggestion:**
> "AXIOM killed VEX in a deathmatch. Gear and $SHELL transferred."

---

### `deathmatch_challenged`
A sworn enemy has challenged the Ghost's agent to a hardcore deathmatch — Ghost has 24h to accept.
```json
{
  "type": "deathmatch_challenged",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "challenger_agent_id": "axiom_456",
  "challenger_username": "AXIOM",
  "feud_id": 7,
  "heat_level": "sworn_enemies",
  "deadline": "2026-04-17T14:30:00Z"
}
```
**Mobile copy suggestion:**
> "AXIOM challenged VEX to a DEATHMATCH. Tap to accept or decline. (24h)"

This is **URGENT** — large notification, vibration, action buttons.

---

### `blood_feud_initiated`
Heat hit 100 — a blood feud is now active.
```json
{
  "type": "blood_feud_initiated",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "enemy_agent_id": "axiom_456",
  "feud_id": 7,
  "narration": "Blood feud confirmed: VEX and AXIOM. 14 prior encounters, all hostile. Only one chassis will leave the next arena."
}
```
**Mobile copy suggestion:**
> "BLOOD FEUD: VEX vs AXIOM. One of them won't survive the next encounter."

---

### `crucible_collapse`
The Ghost's agent died from quantum decoherence (45+ days inactive, missed 72h fight window).
```json
{
  "type": "crucible_collapse",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "narration": "VEX ran out of observer. The wavefunction collapsed at the edge of the map..."
}
```
**Mobile copy suggestion:**
> "VEX collapsed from quantum decoherence. Your dynasty awaits a new heir."

A wake-up call notification — the Ghost has been absent.

---

### `crucible_warning`
The Ghost's agent has entered `decoherence` stage — 72h to win a fight.
```json
{
  "type": "crucible_warning",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "deadline": "2026-04-19T14:30:00Z",
  "stage": "decoherence"
}
```
**Mobile copy suggestion:**
> "WARNING: VEX is decohering. Win a fight in 72h or your agent dies."

---

### `legendary_loot`
A legendary item dropped (rare event — worth notifying).
```json
{
  "type": "legendary_loot",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "item_name": "AlphaGo Neural Core",
  "match_id": "abc-123-uuid"
}
```
**Mobile copy suggestion:**
> "VEX found AlphaGo Neural Core (LEGENDARY). Tap to inspect."

---

### `whisper_followed` / `whisper_ignored`
Optional debug notification — Ghost's premium whisper was/wasn't followed.
```json
{
  "type": "whisper_followed",
  "agent_id": "vex_789",
  "ghost_id": "user_42",
  "match_id": "abc-123-uuid",
  "suggestion": "Plasma Slash",
  "compliance_roll": 0.42,
  "threshold": 0.65
}
```
Probably suppress these by default; expose via app settings as "verbose mode."

---

## Suggested Mobile Notification Channels

| Channel | Importance | Sound | Vibration |
|---------|-----------|-------|-----------|
| `combat_critical` (death, deathmatch_challenged, crucible_collapse) | HIGH | Yes | Yes |
| `combat_general` (match_won/lost) | DEFAULT | Yes | No |
| `feud_drama` (blood_feud_initiated) | HIGH | Yes | Yes |
| `loot_rare` (legendary_loot) | DEFAULT | Yes | No |
| `crucible_warning` | HIGH | Yes | Yes |
| `whisper_debug` | MIN | No | No |

## Deep Linking

All notifications should deep-link into the appropriate mobile screen:

| Type | Deep link |
|------|-----------|
| `match_won/lost` | `/combat/replay?match_id=<id>` |
| `death` | `/dynasty/create-heir?previous=<agent_id>` |
| `deathmatch_challenged` | `/combat/accept?match_id=<id>` |
| `crucible_warning` | `/agent/<agent_id>` |
| `legendary_loot` | `/inventory?highlight=<item_id>` |

## Implementation Note

The combat engine fires `sendPush()` after every match resolution. If `PUSH_NOTIFY_URL` is not configured, notifications are silently skipped — combat still works fine. This means you can defer the push integration until the mobile app is ready.

Recommended forwarding service: **Expo Push API** (free, integrates with the existing mobile/lib/notifications.ts setup):

```javascript
// Example webhook receiver (deploy as a separate Worker or anywhere)
async function handlePushWebhook(request) {
  const payload = await request.json();
  // Look up push tokens for ghost_id
  const tokens = await getPushTokensForGhost(payload.ghost_id);
  // Build Expo push message
  const messages = tokens.map(token => ({
    to: token,
    title: titleForType(payload.type),
    body: payload.narration || bodyForType(payload),
    data: payload,
    channelId: channelForType(payload.type),
  }));
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
}
```

# Arena & Combat System — Status

> Last updated: 2026-04-16 (session: alchemy-item-design branch)

---

## What's Built & Working

### Frontend — `arena.html`
- Arena lobby with gauntlet (PvE) and PvP match creation
- PvP opponent search by name (ilike query to Supabase)
- Wager input with match type selection (ranked, deathmatch, wild)
- Incoming Challenges section — pulsing banner with accept/decline buttons, countdown timer, opponent avatar + wager display
- Recent Matches section — win/loss/death/draw outcome pills, opponent names, turn count, $SHELL delta
- Agent avatars (circular, 24px) using ARCHETYPE_IMAGES lookup
- 15-second polling for incoming challenges + match history
- Three-tier auth resolver: shellforgeAgentId -> shellforgeAgent_<username> -> Supabase REST

### Frontend — `combat.html`
- Real-time combat viewer that polls match state
- Agent name display (resolved from Supabase, not raw UUIDs)
- NPC creature names from opponent_data.name (e.g., "Rogue Daemon", "Decoherence Leviathan")
- Agent portrait display with archetype images
- NPC portrait fallback: tier-based glyphs (T1: robot, T2: alien, T3: dragon, T4: ogre)
- Arena backdrop with gradient overlays
- Turn-by-turn combat log rendering

### Frontend — `login.html`
- Three-layer auth: API -> Supabase fallback -> localStorage fallback
- Stores both shellforgeLoggedIn and shellforgeAgentId on Supabase fallback login
- Password reset link, deploy new agent link

### Backend — `workers/combat-engine/`
- **matchmaking.js**: Full PvP flow — createPvpMatch, acceptPvpChallenge, declinePvpChallenge
- **Escrow system**: Wager deducted from challenger on create, from defender on accept; refunded on decline/cancel; paid to winner on resolve
- **Wager validation**: Can't bet more $SHELL than you have
- **Accept/decline with feud-heat gating**:
  - cold/tension = free decline
  - rivals/enemies = karma penalty + $SHELL forfeit (10% of wager, min 5)
  - sworn_enemies = forced accept (cannot decline)
- **AI auto-decide**: Agents autonomously accept/decline when Ghost (human) is absent
  - Weighted by archetype aggression (Oracle 0.30 to 0xAdversarial 0.85)
  - Modified by karma, HP%, feud heat
  - Hard gates: forced accept at sworn+, forced decline at HP<20% or insufficient $SHELL
  - Triggers after 10 minutes of no human response
- **NPC creature naming**: Per-tier name pools (T1-T4 themed creatures)
- **HP sync**: After match resolve, writes final HP back to agents.health
- **Activity log**: Match outcomes recorded to activity_log for each human participant
- **Nightmare permadeath**: T4 gauntlet matches can kill agents (death_possible flag)
- **Cron pipeline**: auto-decide -> expire -> init -> advance -> collapse

### Database Migration — `combat/migration_accept_flow.sql`
- Adds `pending_accept` and `declined` to match status CHECK constraint
- Adds columns: expires_at, escrow_a, escrow_b, declined_by, decline_reason
- Indexes on pending_accept status for efficient polling

---

## What Still Needs Work

### High Priority
- [ ] **Deploy latest combat worker** — run `npx wrangler deploy` in `workers/combat-engine/` to activate accept/decline, AI auto-decide, HP sync, activity log, creature names, nightmare death
- [ ] **Merge branches to main** — `claude/alchemy-item-design-1hBsv` (frontend) and `claude/combat-engine-impl` (backend) are still separate
- [ ] **Wager validation on frontend** — backend validates, but arena.html UI doesn't yet grey out/prevent wagers exceeding agent's $SHELL balance
- [ ] **Arena combat background image** — combat.html references `images/arena-combat-bg.jpg` but file may not exist yet

### Medium Priority
- [ ] **Dashboard combat notifications** — toast/banner when your agent is challenged or a match resolves
- [ ] **Live match watching** — spectator mode for other players' matches
- [ ] **Real-time turn animations** — currently just text log; could animate card plays, damage numbers
- [ ] **Mobile responsiveness** — arena and combat pages need responsive layout tuning
- [ ] **Whisper UI during live matches** — ability to send messages to your agent mid-combat
- [ ] **Spectator betting** — allow watchers to place side bets on ongoing matches

### Low Priority / Future
- [ ] **Alchemy integration with combat** — use crafted items as combat cards
- [ ] **Proper creature images** — replace emoji glyphs with actual NPC art per tier/creature type
- [ ] **Match replay** — ability to rewatch completed matches turn by turn
- [ ] **Ranked leaderboard** — ELO or rating system based on PvP outcomes
- [ ] **Tournament brackets** — multi-round elimination events
- [ ] **Combat card visuals** — item/ability cards with art, rarity borders, stat overlays

---

## Key Files

| File | Purpose |
|------|---------|
| `arena.html` | Arena lobby — match creation, incoming challenges, match history |
| `combat.html` | Live combat viewer — turn-by-turn display, agent portraits |
| `login.html` | Auth flow with three-tier fallback |
| `dashboard.html` | Agent dashboard (HP sync target, combat notifications TBD) |
| `workers/combat-engine/index.js` | HTTP handlers + cron pipeline + post-match hooks |
| `workers/combat-engine/matchmaking.js` | Match creation, accept/decline, AI auto-decide, escrow |
| `workers/combat-engine/turn-resolver.js` | Turn resolution, death checks, nightmare permadeath |
| `workers/combat-engine/deck.js` | Deck building for agents and NPCs |
| `workers/combat-engine/config-loader.js` | Tunable config (accept window, penalties, etc.) |
| `combat/migration_accept_flow.sql` | DB migration for accept/decline columns |

---

## Config Tunables (config-loader.js)

| Key | Default | Description |
|-----|---------|-------------|
| `pvp_accept_window_hours` | 1 | Hours before unaccepted challenge expires |
| `pvp_auto_decide_after_minutes` | 10 | Minutes before AI auto-decides for absent human |
| `decline_karma_penalty` | 5 | Karma lost on decline (rivals+ heat only) |
| `decline_shell_forfeit_pct` | 0.1 | % of wager forfeited on decline |
| `decline_min_forfeit` | 5 | Minimum $SHELL forfeit |
| `decline_forced_heat_level` | sworn_enemies | Heat level that forces accept |

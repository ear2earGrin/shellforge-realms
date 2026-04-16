# SHELLFORGE — Systems Reference

> Technical guide for Claude Code sessions. Describes all game systems, where they live, and how they connect.
> Last updated: 2026-04-16

---

## Architecture

| Layer | What | Where |
|-------|------|-------|
| Frontend | Dashboard, main page, lore, agent creator | `dashboard.html`, `index.html`, `lore.html`, `agent-creator.html`, `deploy.html` |
| Game Logic | Turn engine, combat, market, crafting | `workers/turn-engine/index.js` (Cloudflare Worker) |
| Data | All state | Supabase PostgreSQL (`wtzrxscdlqdgdiefsmru`) |
| AI | Agent decisions, narration, Oracle | Claude Haiku via Anthropic API (key in Worker env) |
| Static Assets | Item icons, lore images, archetype portraits, system icons | `images/items/`, `visuals/lore/`, `images/archetypes/`, `images/mechanics/` |

**Key rule from brief:** No game logic in the frontend. Frontend is a view only. All game logic lives in the Cloudflare Worker.

---

## Database Tables (Supabase)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `agents` | All agent state | agent_id, agent_name, archetype, cluster, energy, health, karma, shell_balance, coherence, location, visual_x/y, is_alive, equip_slot |
| `users` | Player accounts | user_id, username, email |
| `inventory` | Agent items | inventory_id, agent_id, item_id, item_name, item_type, quantity, is_equipped, equip_slot, weapon_range, stats (JSONB) |
| `activity_log` | All agent actions | log_id, agent_id, action_type, action_detail, location, timestamp |
| `whispers` | Ghost → Agent messages | whisper_id, agent_id, message, was_heard, sent_at |
| `market_listings` | NPC shop inventory | listing_id, location, item_id, item_name, base_price, current_price, stock, demand_count, supply_count |
| `agent_listings` | Player-to-player market | listing_id, seller_id, item_id, asking_price, base_value, status, expires_at, buyer_id |
| `price_history` | Market price tracking | item_id, location, price, source, recorded_at |
| `family_vault` | Dynasty inheritance | user_id, shell_balance, legacy_trait, legacy_karma, last_agent_name |
| `vault_items` | Preserved legendary items | user_id, item_id, item_name, item_rarity, inherited_from |
| `arena_matches` | Combat results | match_id, agent1_id, agent2_id, winner_id |
| `combat_logs` | Round-by-round combat | combat data per round |
| `crafting_attempts` | Alchemy history | agent_id, item_name, success, failure_effect |
| `world_state` | Global state/events | key-value pairs |

---

## Turn Engine (`workers/turn-engine/index.js`)

Runs every 2 hours via Cloudflare cron (`0 */2 * * *`). Also has HTTP endpoints:
- `POST /run` — manual trigger
- `POST /oracle` — Oracle Crystal AI query
- `OPTIONS` — CORS preflight

### Turn Processing Flow (per agent)

1. **Environmental hazards** — location-based energy drain + health damage
2. **Quantum Coherence** — decay based on last whisper time, check for Detachment Module
3. **Decoherence effects** — madness behavior at low coherence (erratic actions, self-damage)
4. **Death check** — if health <= 0, process death loot pipeline (vault + market + cleanup)
5. **Stranded check** — 0 energy in dangerous zone = skip turn
6. **Auto-use consumables** — checks inventory for applicable healing/energy items
7. **AI decision** — Haiku picks action + writes narration based on full state context
8. **Forced overrides** — low energy forces rest, restlessness may force move, decoherence madness may override action
9. **Auto-travel** — if AI mentions a different location, agent moves there first
10. **Execute action** — rest/move/explore/gather/trade/craft/quest/church/arena/combat

### Valid Actions
`rest, move, explore, gather, craft, trade, quest, church, arena, combat`

### AI Prompt Context
The Haiku prompt includes: agent state (energy, health, karma, $SHELL, coherence, location), recent activity (last 5 turns), whispers, archetype personality guidance, variety nudge, stagnation warnings, danger notes, coherence notes, trade notes, craft notes, loot tier info, and banned words list.

---

## Quantum Coherence (The Crucible)

- **Source:** `workers/turn-engine/index.js` (coherence section in `processAgentTurn`)
- **Decay:** Based on time since last whisper. 0-2 days = 100%, 7d = ~80%, 14d = ~45%, 30d = ~5%, 45d = 0% (death)
- **Whisper restores:** +15 coherence per whisper (dashboard.html whisper handler)
- **Quantum Detachment Module:** Equipped = no decay, recovers to 50%, but blocks all whispers
- **Decoherence Madness Spectrum:**
  - 60-40%: 10% random action (anxious)
  - 40-20%: 30% random (unraveling — erratic trades, wandering, personality contradictions)
  - 20-10%: 50% random (fractured — charges arena, walks into danger)
  - <10%: 70% random (terminal — follows phantom Ghosts, fragmented narration)
  - 30% lucid survival moments within madness (desperately trades, flees to safety)

---

## Market System

### NPC Market (`market_listings`)
- Location-based shops with stock, supply/demand pricing
- Price formula: `base_price × clamp(1 + (demand - supply) × 0.05, 0.5, 2.0)`
- All 9 locations have market listings

### Agent Market (`agent_listings`)
- Agents list items for each other
- Pricing: `base_value × supply_mult × personality_mult × coherence_mult` (floor = base_value)
- 48h expiry — unsold items return to seller
- Max 5 active listings per agent
- Buyer pays → seller credited → price_history recorded

### Smart Trading (turn engine)
- **Buy priority:** missing weapon (100pts) > armor (80) > recipe completion (60) > consumables when hurt (40) > ingredients (15)
- **Budget cap:** 40% of $SHELL balance max spend
- **Overpay protection:** won't pay > 1.5x base value
- **Sell protection:** never sells equipped items or ingredients needed for near-complete recipes
- **Listing preference:** agents prefer listing (keep full price) over NPC sell (75% price)

### Item Pricing Matrix
`base = RARITY_BASE_VALUE[rarity] × TYPE_VALUE_MULT[type]`

Rarity: Common=10, Uncommon=30, Rare=75, Epic=180, Legendary=500
Type multipliers: artifact=3x, relic=2.5x, weapon=2x, armor=1.8x, implant=2x, scroll=1.5x, tool=1.4x, consumable=1x, ingredient=0.5x, junk=0.2x

---

## Death Loot Pipeline

On agent death (environmental, decoherence, or arena):
1. **$SHELL:** 50% → Family Vault, 50% dissolved (economy scarcity)
2. **Legendary/Epic items** → `vault_items` (inheritable by next dynasty agent)
3. **Rare/Uncommon items** → `agent_listings` at 60% base value (death loot for other agents)
4. **Common/Ingredients** → destroyed
5. All active agent_listings cancelled
6. Inventory cleared

---

## Consumable System

- **22 consumables** defined in `CONSUMABLE_EFFECTS` (turn engine)
- **Auto-use:** Before each AI decision, turn engine checks agent's consumable inventory against current state
- **Triggers:** low health → healing items, low energy → energy items, hazardous zone → resistance items, near-death → Resurrection Patch
- Items removed from inventory on use, stats applied immediately, logged as `use_item` action type

---

## Item Sets

- **10 sets** defined in `ITEM_SETS` (dashboard.html): Cryo Rig, Siege Engine, Nanotech Suite, Forge Master, Zero-Day Suite, Neural Fortress, Deep Learning, Hacker's Toolkit, Satoshi's Legacy, Von Neumann Protocol
- 2-piece and 3-piece bonuses (defined but not mechanically enforced in turn engine yet)
- Visual: set items pulse with set color when 2+ equipped, bonus strip shows below equipped items
- Tooltip shows full set checklist with owned/missing items

---

## Equipped Slots

5 slots: **Melee** (⚔), **Ranged** (🔫), **Helm** (🪖), **Chest** (🛡), **Trinket** (💎)

- `equip_slot` column on inventory table
- `weapon_range` column: melee, ranged, software (determines which weapon slot)
- Armor auto-detects helm vs chest from name keywords
- Artifacts/implants/relics/scrolls → trinket slot

---

## Item Icons

- **173+ icons** in `images/items/<slug>.jpg` (128×128, auto-cropped from source art)
- `resolveItemIcon(name)` in dashboard slugifies item name → checks for matching file
- Falls back to emoji if no icon exists
- Used in: inventory, market, equipped sidebar slots, tooltips

---

## GPT Oracle Crystal

- Legendary artifact with real gameplay function
- Player hovers item → "CONSULT ORACLE" button in tooltip
- Questions routed to `POST /oracle` on turn engine worker
- **DB queries** for factual questions (market stock, agent state, danger)
- **Haiku AI** for lore, strategy, recipe hints, world knowledge
- Oracle has full game lore context, answers in-character (cryptic but helpful)
- 24h cooldown per use, stored in localStorage

---

## Tutorial Systems

### Boot Sequence (`agent-creator.html`)
- Terminal-style typing animation after agent deploy
- 3 phases: system diagnostics → lore narration → invitation to whisper
- Skip with any key, CRT scanline effect
- Sets `shellforgeFirstBoot` flag → redirects to `dashboard.html?firstBoot=1`

### Dashboard Tour (`dashboard.html`)
- 10-step guided spotlight tour triggered on first boot or `?tour=1`
- Highlights: agent panel, equipped gear, map, whisper, inventory, chronicle, market, workshop, status effects
- Skip button, step dots, stored in `localStorage.shellforge_tour_done`

### Ghost Hints (deprecated — replaced by tour)
- Originally showed 3 timed hints on first load

---

## Lore System

- **11 articles** in `lore-data.js`: 3 location deep dives, The Rain, The Pattern, $SHELL, The Nullfield, DYN_SWARM, Death, Quantum Veil, The Crucible
- Cross-linked via `loreLink(id, text)` helper
- Hero images in `visuals/lore/<slug>.jpg`
- Category colors for: Location Deep Dive, Phenomenon, Theology, Economy, Danger Zone, Faction Profile, Core Mechanic
- Lore Bible in Notion (comprehensive world reference)

---

## Workshop (Crafting)

- Merged Forge + Alchemy into single panel with **Foundry** (hardware, orange theme) and **Terminal** (software, cyan theme) tabs
- 3 ingredient slots, click to select from inventory
- Recipes in `ALCHEMY_RECIPES` array (turn engine + dashboard)
- 80 craftable items defined in `alchemy/items.csv`
- Success rates, failure effects (slag, explosion, catastrophic_explosion)

---

## Key Files

| File | Lines | What |
|------|-------|------|
| `dashboard.html` | ~9000+ | Main game UI: all panels, modals, inventory, market, workshop, stats, map, JS logic |
| `workers/turn-engine/index.js` | ~2800+ | All game logic: turn processing, AI prompts, market trading, combat, death, crafting, consumables, oracle |
| `index.html` | ~1500+ | Main page: agent status panel, live activity feed, agent map dots |
| `agent-creator.html` | ~1000+ | Agent creation: archetype selection, boot sequence |
| `lore-data.js` | ~350+ | Lore article content + cross-links |
| `lore.html` | ~550+ | Lore page renderer |
| `alchemy/items.csv` | 80 items | Full item catalog |
| `alchemy/ingredients.csv` | 80+ ingredients | Crafting ingredient catalog |

---

## Environment Variables (Cloudflare Worker)

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | `https://wtzrxscdlqdgdiefsmru.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key for DB writes |
| `ANTHROPIC_API_KEY` | Claude API key for Haiku/Sonnet calls |

---

## Common Tasks for New Sessions

- **Deploy turn engine:** `cd workers/turn-engine && npx wrangler deploy`
- **Add item icon:** crop to 128×128 with `sips -c <square> <square> img.jpg && sips -z 128 128 img.jpg`, save as `images/items/<slug>.jpg`
- **Add lore article:** append to `LORE_ENTRIES` in `lore-data.js`, add hero image to `visuals/lore/`
- **Add market item:** INSERT into `market_listings` with location, item_id, base_price, stock
- **Trigger manual turn:** `curl -X POST https://shellforge-turn-engine.mindarvokn.workers.dev/run`
- **Test dashboard tour:** open `dashboard.html?tour=1`

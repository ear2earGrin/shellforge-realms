# SHELLFORGE — FINISH PLAN

> **Created:** June 2026
> **Scope:** Everything between the current build and a shippable v1.0 as defined by `brief.md` (Tier 1 / MoSCoW MUST).
> **How to read:** Phase 0 is non-negotiable hygiene. Phases 1–4 are ordered by the brief's system build order (Arena → Market → Church → Forge → Rumor) and by what blocks what. Estimates assume one developer + Claude working sessions.

---

## 1. Where the game actually stands (June 2026)

### Live and working
- **Agent autonomy loop** — `workers/turn-engine` (≈3,700 lines) runs every 2h: Haiku-driven decisions, energy/health, location hazards, coherence decay, consumable auto-use, world events, activity logging.
- **Whisper system** — `workers/whisper-worker` accepts whispers; turn-engine rolls compliance and feeds heard whispers into the next decision.
- **Market** — NPC shop supply/demand pricing, agent-to-agent listings (48h expiry), price history. Recent fixes landed (wrong columns + missing RLS write policies).
- **Crafting/Alchemy** — 80+ recipes from `alchemy/*.csv`, success/failure with slag/explosion, per-agent known recipes (`agent_known_recipes`), salvage bonuses.
- **Death & inheritance** — death pipeline, `family_vault` + `vault_items`, legacy traits.
- **Onboarding** — agent creator (12 archetypes / 3 clusters), boot narration, starter caches, dashboard tour.
- **Content pages** — lore, bestiary, item catalog, mechanics, city pages all complete.
- **Frontend** — `dashboard.html` is the full game view; mobile-responsive pass recently landed on this branch.

### Live but fragile (the surprising part)
- **Combat IS partially live in production** — `combat.html` and `arena.html` point at a deployed worker (`shellforge-combat-engine.mindarvokn.workers.dev`, responding), and the live DB has populated combat tables (`combat_matches`: 26 rows, `combat_turns`: 104, `combat_abilities`: 89, `bestiary`: 30). **But the worker's source code only exists on the unmerged branch `claude/combat-engine-impl`.** Main has no `workers/combat-engine/` directory. The deployed production code has no canonical source on the deploy branch.
- **Live DB schema is ahead of the repo** — tables like `bestiary`, `items_master`, `combat_*`, `agent_feuds`, `crucible_states`, `spectator_bets`, `agent_starter_chests` exist live but their migrations aren't all captured in the repo.

### Designed but not built
- **Church** — in brief as MUST. Turn-engine has a `church` action stub; no faith/buff/curse mechanics.
- **Rumor system** — in brief as MUST. Zero code, no `rumors` table.
- **Feuds** — `agent_feuds` table exists (1 row) and FEUD_ARENA_DESIGN.md is complete, but no heat accumulation, enemy-archetype triggers, or auto-challenge logic in turn-engine.
- **Crypto layer** — Tier 1 locked v1.0 requirement ($SHELL wallet connect, Soul NFTs, Lightning whispers, on-chain vault). `shell_balance` is in-game accounting only; zero wallet/NFT/Lightning code.
- **Quests** — `quest` is a valid action with an energy cost but there are no quest types or rewards.
- **PWA / push notifications** — not started (SHOULD tier).
- **PixiJS isometric renderer (Phase B.5)** — deferred by design; not started.

---

## 2. Critical issues — fix before anything else (Phase 0)

These are bugs/risks in the *current* live game, not new features. **Est: 3–5 days.**

### 0.1 🔴 Security: RLS disabled on core tables
Supabase reports RLS **disabled** on `public.users`, `public.agents`, and `public.activity_log`. Anyone with the public anon key (which is in the frontend HTML by design) can read **and modify** every row — including `users.password_hash` and any agent's stats/balance.
- Write policies first, then enable RLS (enabling without policies blocks the app):
  - `users`: no anon read of `password_hash`/`email`; auth flows go through a worker using the service key.
  - `agents`: public read (spectating is a feature), writes only via service role (turn-engine/workers).
  - `activity_log`: public read, service-role write.
- Audit the other 25 tables' policies while in there — `inventory` and `whispers` have RLS on, but verify the policies actually scope rows to the owner.
- Related: `whisper-worker` does no rate limiting and doesn't enforce the 2/day free limit server-side. Enforce limits in the worker, not the frontend.

### 0.2 🔴 Combat engine source has no home on main
The deployed combat worker's code lives only on `claude/combat-engine-impl`. If that branch is deleted or the worker needs a hotfix, there is no source of truth.
- Merge `claude/combat-engine-impl` into main (or cherry-pick `workers/combat-engine/` + `combat/migration_accept_flow.sql` if the branch has drifted).
- Verify the merged source matches what's deployed (redeploy from main after merge — **from `workers/combat-engine/` only, per CLAUDE.md deploy rules: verify the directory exists and contains its own `wrangler.toml` first**).
- Update CLAUDE.md afterwards (it currently says combat-engine doesn't exist on main).

### 0.3 🟠 Dev hack live in production
`dashboard.html:8434` — `const SPEED_MULTIPLIER = 100; // TODO: Set back to 1 for production`. Agent travel renders 100× too fast. Set to 1, and move travel-speed math server-side eventually (Layer rule: no game logic in frontend).

### 0.4 🟠 Repo ⇄ DB schema drift
Snapshot the live schema into versioned migration files in the repo (e.g. `supabase/migrations/`), so the 28 live tables are reproducible. This is also the prerequisite for any future combat/feud/rumor migrations being reviewable.

### 0.5 🟡 Repo hygiene
- Delete `*.backup` / `*.bak` files (`dashboard.html.backup`, `dashboard.html.bak`, `index.html.backup`, `script.js.backup`, `style.css.backup`) — they're git-tracked noise and only excluded from deploy by `.assetsignore`.
- `script.js:355` — `TODO: Replace with actual backend endpoint`. Wire or remove.
- Re-audit `.assetsignore` before the next root redeploy (per CLAUDE.md — this is how the 2026-04-16 `.env` leak happened). Current file looks correct.

---

## 3. Phase 1 — Finish the Arena (combat fully live)

Combat is the #1 MUST system and is 70% there. Finish it. **Est: 1.5–2 weeks.**

1. **Wire the loop end-to-end** — challenge → accept/decline (with AI auto-decide timeout) → turn resolution → result → loot/escrow payout → activity log entry. The frontend (`arena.html`, `combat.html`) is built; verify every screen against the live worker and fix the seams.
2. **Death resolution in combat** — wild/nightmare deaths must run the existing death pipeline (vault transfer, legacy trait, Sonnet death narrative). Per brief: arena PvP loses the pot but never kills; wild combat can kill.
3. **Tiered model wiring** — brief says combat decisions are currently mocked in places. Wire the real tiers: Groq/Llama for routine combat turns, Haiku when a whisper is pending, Sonnet on death/legendary moments.
4. **Combat whispers** — Ghost suggests a move mid-match, agent rolls to comply (archetype + karma weighted). `combat_whispers` table already exists (6 rows) — finish the loop and surface it in `combat.html`.
5. **Feud heat system** — implement FEUD_ARENA_DESIGN.md: heat 0–100, enemy-archetype pairs, triggers (market undercutting, theft, combat losses), heat-gated auto-challenges and deathmatch unlocks. `agent_feuds` table exists; add the turn-engine logic.
6. **Turn-engine ↔ combat-engine integration** — when an agent picks the `arena` action, the turn-engine should actually enqueue a match instead of stubbing.

**Acceptance:** two seeded agents can feud, challenge, fight a full match visible in `combat.html`, with bets table populated, whisper attempted, and a wild-combat death producing a vault inheritance.

---

## 4. Phase 2 — Remaining MUST systems: Church + Rumors + Karma everywhere

**Est: 2 weeks.**

### Church (4–5 days)
- `pray`/donate at Church of the Pattern: karma gain, $SHELL donation sink, faith buff (timed stat boost), apostasy curse for the faithless, confession to burn negative karma.
- All numbers in `game-config.json` (Tier 1 rule 5 — no hardcoded tunables).
- Surface in dashboard (buff/curse chips on the agent panel) and activity feed.

### Rumor system (1 week)
- `rumors` table: source agent, content, subject (agent/item/location), truth flag, spread radius, expiry.
- Generation: chance per turn at social locations; Ghost-seeded rumors via whisper.
- Spread: same zone 100% / adjacent 50% / village 10% (per brief).
- Effects: market price modifiers on rumored items, reputation/feud-heat nudges, karma penalty when a false rumor is traced to its spreader.

### Karma audit (2–3 days)
Karma is tracked and used in decision weighting; the brief requires it integrated across **all** systems. Audit and wire: market prices (NPC distrust), church responses, whisper compliance curve, combat matchmaking, rumor believability.

---

## 5. Phase 3 — Crypto layer (Tier 1: ships at v1.0, not after)

This is the largest pure-greenfield block. The brief locks it as a v1.0 MUST: **$SHELL token, wallet connect, Soul NFTs, Lightning premium whispers, Family Vault persistence.** **Est: 3–4 weeks, plus external dependencies (chain choice, contract audit).**

1. **Decisions first (blocked on project owner):** which chain/standard for $SHELL and Soul NFTs; custodial vs wallet-connect; how the on-death half-burn executes on-chain (open question in brief).
2. **Wallet connect** — frontend connect flow + a worker that links wallet → user. Non-paying Ghosts keep full free observation (locked boundary).
3. **$SHELL bridge** — in-game `shell_balance` ⇄ on-chain token. Start with one-way (deposit) to limit risk; the existing in-game economy keeps working unchanged.
4. **Soul NFT minting** — eligibility threshold from `game-config.json`; on legendary death, mint with agent history/personality/achievements metadata. Death pipeline already produces the data.
5. **Lightning premium whispers** — pay sats → extra whisper slots / higher compliance confidence. `dashboard.html:5693` already has the `TODO: Wire to payment flow` stub. Premium = modifier on the existing compliance roll, never a guarantee (Ghost Principle).
6. **Spectator betting** — `spectator_bets` table already exists (empty). Lightning sats on arena duels; settle from match results.

> If the chain decisions stall, everything in Phases 0–2 and 4 is still shippable as an open beta — but per Tier 1, v1.0 cannot be *declared* without this phase.

---

## 6. Phase 4 — Mobile/PWA + polish + tech debt

**Est: 2 weeks.**

### PWA (SHOULD, but cheap and high-retention)
- Manifest + service worker; installable.
- Web Push for Ghost alerts: combat started, near-death, death, legendary loot, whisper window opening. (Resolves the brief's open question — start with these five.)
- Verify the mobile layout matches the brief's companion-layout intent (bottom tabs: map / agent / activity / whisper) rather than scaled-down desktop.

### Tech debt (do alongside, not after)
- **`dashboard.html` is a 10,853-line monolith.** Split into ES modules (no framework — still vanilla JS, allowed): `map.js`, `inventory.js`, `market-ui.js`, `whisper-ui.js`, `workshop-ui.js`. Prerequisite for the Phase B.5 PixiJS swap, which replaces only the map module.
- **Layer-rule violations:** stat/pricing calculations living in `dashboard.html` must move to workers (Tier 1 rule 6). Item set bonuses are currently display-only in the frontend — enforce them in turn-engine stat calc.
- **`game-config.json` sweep:** grep turn-engine + combat-engine for hardcoded tunables (energy costs, hazard damage, loot rates, price clamps) and move them into config (Tier 1 rule 5).
- Resolve remaining dashboard TODOs (`7654` real API call, `7928` item modal, `7986` movement interpolation).

### Stickiness for agent-less observers (open question in brief)
Cheap wins: public spectate mode on the landing page (live activity feed already exists), arena match replays as shareable links, a "dynasty graveyard" page from `activity_log` death narratives.

---

## 7. Explicitly out of scope for v1.0 (per brief)

- PixiJS isometric renderer (Phase B.5) — after Arena + Market are producing real drama.
- Native iOS/Android app (Phase C), engine migration (Phase D).
- Cross-player shared-world interactions, marriages/guilds, seasonal events, voice lines — COULD tier.
- Anything WON'T: direct Ghost control, frameworks, real-money gacha, game logic in the frontend.

---

## 8. Summary timeline

| Phase | What | Est. |
|---|---|---|
| **0** | Security (RLS!), merge combat source to main, SPEED_MULTIPLIER fix, schema snapshot, hygiene | 3–5 days |
| **1** | Arena fully live: end-to-end loop, death resolution, tiered models, combat whispers, feuds | 1.5–2 weeks |
| **2** | Church + Rumors + karma integration audit | 2 weeks |
| **3** | Crypto layer: wallet, $SHELL bridge, Soul NFTs, Lightning whispers, betting | 3–4 weeks + decisions |
| **4** | PWA + push, dashboard modularization, config sweep, observer stickiness | 2 weeks |

**Total: ~9–12 weeks to a v1.0 that satisfies every Tier 1 MUST**, with a playable open-beta milestone available after Phase 2 (~5 weeks) if the crypto decisions need more runway.

### Decisions needed from the project owner (blocking)
1. Chain + token standard for $SHELL / Soul NFTs; custodial vs wallet-connect.
2. On-chain mechanics of the death half-burn.
3. Whisper slots vs energy cycle (2 free + 1 carry?) — affects premium pricing.
4. Open beta before crypto layer, or hold everything for v1.0?

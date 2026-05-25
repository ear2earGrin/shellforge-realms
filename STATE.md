# Shellforge Realms — Game State (single source of truth)

> **What this file is.** The one authoritative map of where the game actually is —
> what's shipped, what's in flight, what's planned, and what's unmerged on a branch.
> Every session (web or terminal) should read this first. Update it when you ship,
> merge, or deploy something. It supersedes the ~35 scattered status docs (see
> [§9 Doc cleanup](#9-doc-cleanup)).
>
> **Last updated:** 2026-05-25 · **Live:** https://shellforge.xyz
> **Design canon (locked):** see `brief.md` (Tier-1 rules) — do not contradict it.

---

## 1. Live snapshot (verified against production, 2026-05-25)

- **Frontend:** Cloudflare static site, auto-deployed from `main`. Domain `shellforge.xyz`.
- **Supabase project:** `wtzrxscdlqdgdiefsmru` (eu-west-1, Postgres 17, ACTIVE_HEALTHY).
- **The game is live and being played** — proof from the live DB:
  - `users` 17 · `agents` 19 · `activity_log` 1,690 · `whispers` 37
  - `inventory` 105 · `items_master` 163 · `market_listings` 120 · `agent_listings` 69
  - `combat_matches` 25 · `combat_turns` 104 · `combat_abilities` 89 · `archetype_abilities` 24
  - `family_vault` 10 · `bestiary` 30 · `agent_known_recipes` 30 · `agent_starter_chests` 26
- **Workers (Cloudflare, deployed separately from the static site — merging to `main` does NOT deploy them):**
  - `shellforge-turn-engine` (`workers/turn-engine/`) — **live** (cron loop writing the 1,690 activity rows).
  - `shellforge-whisper-worker` (`workers/whisper-worker/`) — **live**.
  - combat engine — **live in DB** (25 matches), but **its source is NOT on `main`** (see [§5](#5-risks--blockers)).

---

## 2. Subsystem status

Legend: 🟢 shipped & live · 🟡 partial / needs work · 🔵 built but unmerged (on a branch) · ⚪ designed-only / not started

| Subsystem | Status | Lives in | Notes |
|---|---|---|---|
| Landing page | 🟢 | `index.html` | Map, deploy CTA, live feed, fallen-agents collapse |
| Agent creation + boot sequence | 🟢 | `agent-creator.html`, `deploy.html` | 12 archetypes × 3 clusters, CRT boot, dashboard tour |
| Dashboard | 🟢 | `dashboard.html` | 3-col layout, vitals, map, whisper, inventory, market, workshop, mood/thoughts |
| World map + coordinates | 🟢 | `world-coordinates.js` | 20k×20k; Nexarch + Hashmere + rest stops placed |
| Whisper system | 🟢 | `workers/whisper-worker/`, `dashboard.html` | 2/day, 50% heard, 150 response lines |
| Turn engine | 🟢 | `workers/turn-engine/index.js` | Agent AI loop (Haiku), market, death, consumables, oracle, coherence decay |
| Inventory + items catalog | 🟢 | `alchemy/`, `items_master` (163) | Built via `alchemy/build-catalog.js`; 5 equip slots; set bonuses |
| Crafting / alchemy | 🟢 | turn-engine + dashboard Workshop | Foundry + Terminal stations; success/failure tiers |
| Market (NPC + agent) | 🟢 | turn-engine + dashboard | Buy/sell, price history, agent listings |
| Death + dynasty vault | 🟢 | turn-engine, `family_vault` | $SHELL + legendary inheritance across deaths |
| Agent traits / clusters | 🟢 | `dashboard.html`, turn-engine prompt | Cluster colors across roster/feed/onboarding |
| Lore + tooltips | 🟢 | `lore.html`, `lore-data.js`, `lore-tooltips.js` | Location/action/item tooltips |
| Oracle | 🟢 | turn-engine `/oracle` | In-character Q&A, 24h cooldown |
| Auth + email | 🟢 | `login.html`, `password-reset.html` | Email fallback lookup; 1 agent/account |
| Combat / arena (Crucible) | 🟡🔵 | `arena.html`, `combat.html` (live); engine source **on branches** | DB + UI live; **source not on `main`** — reconcile |
| Item tooltips (feed/chests/market) | 🟡🔵 | PR **#16** open | Extends lore tooltips to item names — unmerged |
| Renown / ranking | 🔵 | `agent-ranking-system-0Vir0` | `leaderboard.html` + `010_renown.sql` — unmerged, not applied |
| Missions | 🔵 | `design-missions-U4lrW` | New `workers/missions-worker/` + `010_missions.sql` — unmerged, not applied |
| Premortem redesign (dashboard-v2) | 🔵 | `shellforge-premortem-0KdJh` | `dashboard-v2.html` + action-tier design note — unmerged |
| Auto-equip / item-usage logic | 🔵 | `agent-item-usage-uP7lz` | Best-in-slot + trinket scorer (also carries combat-engine) |
| Standalone API worker | 🔵 | `amazing-bardeen-1zWOt` | New `workers/api/` adapted to live schema — unmerged |
| Hero fluid-smoke effect | 🔵 | `fluid-smoke-hero` | WebGL hero visual — unmerged |
| Whisper in-modal chat + footer | 🔵 | `quirky-pascal-dOYbm` | UI polish — unmerged |
| Mobile companion app | 🟡 | `mobile/` (Expo RN), issue **#2** | Phases 1-3 done; push wiring + store submission open |
| 3D models / Blender | 🟡 | `images/3d/`, DNA hologram (PRs #7-12 merged) | Hologram live on dashboard; broader Blender pipeline = planning |
| Church / religion | ⚪ | `brief.md` | Designed only |
| Rumor system | ⚪ | `brief.md`, `SYSTEMS.md` | Designed only |
| Crypto layer ($SHELL/Soul NFTs) | ⚪ | `brief.md` (v1.0 requirement) | Not started |
| Spectator betting | ⚪ | `spectator_bets` table (empty) | Schema only |

---

## 3. Unmerged work — branch recovery map

These branches hold real, committed work that never landed on `main`. Each needs a
keep / merge / drop decision. (Recovered from git, so nothing here is lost.)

| Branch | What it adds | Decision needed |
|---|---|---|
| `claude/item-tooltips-preview` (PR #16, **open**) | Item-name tooltips in feed/chests/market | Merge or close |
| `claude/agent-ranking-system-0Vir0` | Renown ranking, `leaderboard.html`, `010_renown.sql` | Ship? resolve `010` collision w/ missions |
| `claude/design-missions-U4lrW` | Functional missions, new `missions-worker`, `010_missions.sql` | Ship? resolve `010` collision; new worker = new deploy |
| `claude/shellforge-premortem-0KdJh` | `dashboard-v2.html` redesign + `AGENT_ACTION_TIERS.md` | Adopt v2 or fold ideas into `dashboard.html`? |
| `claude/agent-item-usage-uP7lz` | Auto-equip + trinket scorer; **vendors combat-engine** | Merge equip logic; decide combat-engine home |
| `claude/combat-engine-impl` | Full combat engine source (Crucible) | **Reconcile: this is what's running in prod but isn't on `main`** |
| `claude/amazing-bardeen-1zWOt` | New `workers/api/` standalone API worker | Keep? maps to "API Worker deployment" chat |
| `claude/fluid-smoke-hero` | WebGL hero smoke effect | Cosmetic — merge or drop |
| `claude/quirky-pascal-dOYbm` | Whisper in-modal chat + footer polish | Merge or drop |
| `claude/review-shellforge-security-Lzjlr` | Pentest fixes (C2/C3/C4/H5/H6/M10) | Appears already on `main` — **verify then delete** |

---

## 4. Open GitHub items

- **PR #16** (open) — item tooltips. Decide merge/close.
- **Issue #2** (open) — Mobile app build tracker. Phases 1-3 done; Phase 4+ (push wiring, store submission) open.
- **Issue #4** (open) — Turn-engine bug fixes + AI-generated items + inventory V2. Code on `claude/shellforge-expo-app-aLQc8`; verify what's already on `main` vs still pending.

---

## 5. Risks & blockers

1. **🔴 SECURITY — RLS disabled on `users`, `agents`, `activity_log`.** These three tables have
   Row-Level Security **off**, so anyone with the public anon key can read or modify every row
   (player accounts, all agents, all history). Fix needs policies, not just `ENABLE RLS`
   (that would lock out the app). Track as the top security task. Suggested starting SQL:
   ```sql
   ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
   -- then add SELECT/INSERT/UPDATE policies before relying on it
   ```
2. **Combat engine: source not on `main`.** Prod DB has a live combat system (25 matches, 104 turns),
   but the worker source only exists on `combat-engine-impl` / `agent-item-usage-uP7lz`. If the
   container/branch is lost, the running combat worker has no source-of-truth in `main`. Reconcile.
3. **Migration `010` collision.** Both the renown branch and the missions branch add a
   `backend/migrations/010_*.sql`. Renumber one before merging. (Live DB uses Supabase-managed
   timestamped migrations, so neither `010` is applied yet.)
4. **Deploy trap (from `CLAUDE.md`).** Merging to `main` only deploys the static site. Workers must be
   deployed from their own dir with `wrangler deploy`. A root deploy uploads everything not in
   `.assetsignore` — this is how `.env` leaked on 2026-04-16. Audit `.assetsignore` before any root redeploy.
5. **Doc drift.** ~35 status `.md` files at root; `STATUS.md` is from 2026-02-06 and wrong. See §9.

---

## 6. Planning threads — need your input

These chats were design/strategy discussions. Where they committed a branch, the substance is
captured above. What's NOT recoverable from git is **which direction you've since decided**. Drop a
couple of lines under each when you can (or say "drop it"):

- **Premortem analysis** (`shellforge-premortem-0KdJh`) — which redesign ideas are we adopting? Is `dashboard-v2.html` the target, or just a reference?
- **Agent ranking (Renown)** — ship the Renown system as-is? It touches the turn engine.
- **Mission system** — ship missions? It adds a whole new worker to deploy + maintain.
- **API worker** (`amazing-bardeen-1zWOt`) — is a standalone `workers/api/` part of the plan, or superseded by direct Supabase access?
- **Blender / 3D pipeline** — beyond the DNA hologram, what's the actual goal here?
- **OPSec** — beyond the pentest fixes, is the RLS gap (§5.1) the priority?

---

## 7. Architecture (1-paragraph orientation)

Static HTML/JS frontend on Cloudflare (`index.html`, `dashboard.html`, etc.) talks directly to
Supabase Postgres via the anon key. Autonomous agent behavior runs in the `turn-engine` Cloudflare
Worker on a cron loop (Haiku-driven decisions). Whispers go through `whisper-worker`. Combat runs
through the (prod-only-source) combat engine. The item catalog is generated from CSVs in `alchemy/`
into `items_master`. Deep reference: `SYSTEMS.md` (technical) and `brief.md` (design canon).

---

## 8. How to keep this current

When you ship/merge/deploy something meaningful:
1. Flip the subsystem row in §2, and add a line to §10.
2. If you merged a branch from §3, remove its row.
3. If you deployed a worker, note it (merging ≠ deploying — see §5.4).

(A SessionStart hook to auto-surface this + recent commits + open PRs, and a PR template with
`Subsystem` / `Deploy needed?` fields, are the planned next steps — not set up yet.)

---

## 9. Doc cleanup

`STATE.md` is the new index. The following root docs are **stale or superseded** — recommend moving
to `docs/archive/` (not deleting), once you approve:

- **Stale:** `STATUS.md` (2026-02-06, says backend unbuilt — wrong), `README.md` (old local paths).
- **Superseded/overlapping (fold key facts into `SYSTEMS.md`, then archive):**
  `DASHBOARD_LAYOUT_UPDATE.md`, `DASHBOARD_ENHANCEMENTS.md`, `DASHBOARD_VISUAL_UPDATES.md`,
  `RIGHT_COLUMN_SIZING_UPDATE.md`, `RIGHT_COLUMN_STACK_LAYOUT.md`, `GRID_SPACING_FIX.md`,
  `ACTIVITY_PANEL_HORIZONTAL_LAYOUT.md`, `MAP_DRAG_FEATURE.md` (abandoned),
  `MAP_FIXED_LAYOUT.md`, `VISUAL_VS_GAMEPLAY_COORDS.md`, `WHISPER_REJECTION_MESSAGES.md`.
- **Keep as canon:** `brief.md`, `SYSTEMS.md`, `CLAUDE.md`, `ARENA_STATUS.md`, `BACKEND_API.md`,
  `BESTIARY.md`, `WHISPER_MESSAGES_COMPLETE.md`, `AGENT_TRAITS_SYSTEM.md`.

---

## 10. Changelog

- **2026-05-25** — Created `STATE.md` as the single source of truth (consolidation audit). No code changed.

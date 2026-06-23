# DEPLOY CHECKLIST — Shellforge Phase 0 + Phase 1 go-live

> Everything below was built on branch `claude/trusting-edison-byw3ph` and is
> committed + pushed. None of the **worker** changes are live yet — Cloudflare
> deploys can only be done by you (they need your account login). The two DB
> migrations `0002` and `0004` are **already applied to the live database**.
>
> **WHERE you run these:** a terminal **on your own computer**, in a fresh
> clone of the repo. NOT in the Claude chat. You need Node.js installed and a
> Cloudflare account. Run the commands one block at a time.

---

## 0. One-time setup (your machine)

```bash
# clone the repo (or `git pull` if you already have it)
git clone https://github.com/ear2earGrin/shellforge-realms.git
cd shellforge-realms
git checkout claude/trusting-edison-byw3ph

# log in to Cloudflare — opens a browser to authorize
npx wrangler login
```

You'll also need two Supabase secrets handy (Supabase dashboard →
Project Settings → API):
- **Project URL:** `https://wtzrxscdlqdgdiefsmru.supabase.co`
- **service_role key:** the secret one labelled `service_role` (NEVER the anon key)

And a **Groq API key** (free at console.groq.com) for the routine-turn AI tier.

---

## 1. Deploy the workers  ⚠ do this BEFORE merging to main

Each worker deploys from **its own folder** (wrangler uses the nearest
`wrangler.toml`). Set secrets first; `wrangler secret put` prompts you to
paste the value, then hides it.

### 1a. Auth worker  ← NEW, and everything depends on it
```bash
cd workers/auth-worker
npx wrangler secret put SUPABASE_URL          # paste the project URL
npx wrangler secret put SUPABASE_SERVICE_KEY  # paste the service_role key
npx wrangler deploy
cd ../..
```

### 1b. Whisper worker
```bash
cd workers/whisper-worker
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler deploy
cd ../..
```

### 1c. Combat engine (add the Groq key for the routine-turn tier)
```bash
cd workers/combat-engine
npx wrangler secret put GROQ_API_KEY          # paste your Groq key
npx wrangler deploy
cd ../..
```

### 1d. Turn engine (add the Groq key here too)
```bash
cd workers/turn-engine
npx wrangler secret put GROQ_API_KEY
npx wrangler deploy
cd ../..
```

> The combat-engine and turn-engine already have their other secrets
> (`SUPABASE_*`, `ANTHROPIC_API_KEY`) from previous deploys — you only need to
> ADD `GROQ_API_KEY`. If a deploy complains a secret is missing, set it the
> same way.

**After each deploy**, wrangler prints the worker's live URL. Confirm they
match what the frontend expects:
- `shellforge-auth-worker.mindarvokn.workers.dev`
- `shellforge-whisper-worker.mindarvokn.workers.dev`
- `shellforge-combat-engine.mindarvokn.workers.dev`

If any differ, tell me and I'll fix the constant in the HTML.

---

## 2. Merge the branch to `main`  (publishes the new frontend)

The live site (Cloudflare Pages) serves `main`. Merging makes the new
auth-aware frontend live. Do this RIGHT AFTER the workers are up.

**Option A — GitHub website (easiest):**
1. Go to the repo on GitHub → **Pull requests** → **New pull request**.
2. base = `main`, compare = `claude/trusting-edison-byw3ph` → **Create**.
3. **Merge pull request**.

**Option B — terminal:**
```bash
git checkout main
git merge claude/trusting-edison-byw3ph
git push origin main
```

Cloudflare Pages auto-deploys from `main` within a minute or two.

---

## 3. Apply the last migration  (Supabase dashboard, AFTER step 1b)

This one is held back on purpose — only run it once the whisper worker (1b)
is confirmed live, or live whispering breaks.

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Open `supabase/migrations/0003_whispers_worker_only.sql` from the repo,
   copy its contents, paste, and **Run**.

(Migrations `0002` and `0004` are already applied — don't re-run them.)

---

## 4. Smoke test (5 min)

- Open the live site → **register** a new account with a password → you land in
  the dashboard with a fresh agent.
- **Log out, log back in** with that password → works. Wrong password → rejected.
- Open a second account; confirm you **cannot** act on the first account's agent.
- Send a **whisper** → it saves and the 2/day limit holds.
- Trigger an **arena** action / open the Arena page → a match is created.

---

## ⚠ Important: why merging soon matters

The database is **already locked down** (migrations 0002 + 0004 are live), but
the **public site is still the old code**. The old frontend tries to write
directly to tables that are now permission-blocked, so on the live site right
now: **registration, market buy/sell, equipping, and crafting silently fail.**
Reading/observing still works, and the autonomous simulation (turn engine,
service key) keeps running normally. Deploying the workers + merging `main`
restores all the player actions. Until then, treat the live site as
read-only.

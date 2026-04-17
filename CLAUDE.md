# Shellforge Realms — notes for Claude

## Repo layout

- Root `/` is a Cloudflare Workers static-site deploy. Its `wrangler.toml` has `[assets] directory = "."` so deploying from root uploads **every file** in the repo unless filtered by `.assetsignore`.
- Separate workers live in `workers/turn-engine/` and `workers/whisper-worker/`. Each must be deployed from its own directory.
- There is NO `workers/combat-engine/` on main — the combat-engine code was developed on a separate branch (`claude/combat-engine-impl`) that was never merged. Do not assume it exists.

## Deploy rules — read before suggesting any `wrangler deploy`

1. **Never suggest `npx wrangler deploy` without first verifying the target directory exists AND contains its own `wrangler.toml`.** Wrangler walks up the directory tree looking for the nearest config — running it from a non-existent or empty subdirectory silently deploys the ROOT static-site config instead. This is how `.env` got leaked on 2026-04-16.
2. Verify which worker will actually deploy by checking the `name = "..."` in the nearest `wrangler.toml`.
3. The root deploy includes everything unless `.assetsignore` excludes it. `.assetsignore` must always exclude: `.env`, `.env.*`, `.wrangler`, `workers`, `.git`, `node_modules`, `*.sql`, `*.md`. Audit before every root redeploy.
4. Never suggest deploying without first listing what will be uploaded (check with `ls -a` or run wrangler with `--dry-run` if available).

## Past incidents

- **2026-04-16 — `.env` leaked to worker URL.** Suggested `cd workers/combat-engine && npx wrangler deploy` without verifying the directory existed. Wrangler walked up, found the root `wrangler.toml`, and uploaded `.env` as a static asset. Had to redeploy with `.env` added to `.assetsignore` and rotate Anthropic + Supabase keys.

## Branches

- `main` is the deploy branch (Cloudflare auto-deploys the static site from here).
- `claude/alchemy-item-design-1hBsv` — current feature branch. Keep merged into main via fast-forward only.
- Worker code changes need `npx wrangler deploy` from the worker's own directory — pushing to main does not deploy workers.

## Secret handling

- API keys (Anthropic, Supabase service role) live in worker environment variables via `wrangler secret put`, not in `.env` files committed to the repo.
- The Supabase anon key in frontend HTML is public by design — don't treat that as a leak.
- If a secret is ever uploaded to an assets deploy, assume public exposure and rotate immediately.

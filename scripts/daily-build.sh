#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Shellforge Daily Build — triggered by cron once/day
#  Picks the next task from Notion, executes it, updates status
# ═══════════════════════════════════════════════════════

export PATH="/opt/homebrew/bin:/opt/homebrew/Cellar/node/25.2.1/bin:/usr/local/bin:$PATH"

cd /Users/ear2eargrin/Projects/shellforge-realms || exit 1

# Pull latest
git pull origin main 2>/dev/null

# Log file for this run
LOG_DIR="$HOME/Projects/shellforge-realms/scripts/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/build-$(date +%Y%m%d-%H%M%S).log"

echo "═══ Shellforge daily build starting at $(date) ═══" | tee "$LOG_FILE"

# --permission-mode bypassPermissions  → no approval prompts
# --model sonnet                       → Sonnet for implementation (save Opus for design)
# --mcp-config                         → Notion MCP via integration token (stdio)
# -p                                   → non-interactive, print output and exit
# NO --max-budget-usd → budget is controlled by scope (one task per run)
#                        to avoid mid-task cutoff leaving broken state

/opt/homebrew/bin/claude -p \
  --permission-mode bypassPermissions \
  --model sonnet \
  --mcp-config /Users/ear2eargrin/Projects/shellforge-realms/scripts/mcp-config.json \
  --verbose \
  -- "$(cat <<'PROMPT'
You are running as an autonomous daily build agent for Shellforge Realms.

PROJECT CONTEXT:
- Repo: You are already in /Users/ear2eargrin/Projects/shellforge-realms
- Live site: shellforge.xyz (Cloudflare Pages — deploys on push to main)
- Backend: Supabase project ID wtzrxscdlqdgdiefsmru
- Frontend: dashboard.html is view-only. ALL game logic goes in Cloudflare Workers + Supabase.
- Architecture rule: NEVER put calculations, formulas, or game rules in frontend JS.

YOUR WORKFLOW:

1. FIND THE NEXT TASK
   Use the Notion MCP tools to query the Tasks database (database ID: 32c11a3e-fcb1-81cb-8791-000b6182c400).
   Filter for Status = "Not Started", sort by Priority ascending (lowest = highest priority).
   Pick the FIRST task where "Blocked By" is empty or references tasks that are already "Done".
   If all tasks are blocked, log this and stop.

2. READ THE TASK CARD
   Fetch the full task page content. It contains:
   - What to build (specific deliverable)
   - Definition of Done (exact acceptance criteria)
   - Do Not Touch (files/systems you must NOT modify)
   - Blocked By (dependencies)

3. UPDATE STATUS
   Set the task Status to "In Progress" in Notion before starting work.

4. EXECUTE
   - Read relevant files before modifying them
   - Follow the task card spec exactly — do not add extras
   - Respect "Do Not Touch" strictly
   - Make one commit per task with message format: "0.4: Add turn engine cron Worker"
   - Push to main (triggers Cloudflare Pages deploy)

5. VERIFY
   - Re-read modified files to confirm they match Definition of Done
   - If the task involves a Worker, verify wrangler.toml is updated

6. COMPLETE
   - Set task Status to "Done" in Notion
   - Add to Notes field: "Completed YYYY-MM-DD. [1-line summary]"
   - If you could NOT complete: set Status to "Waiting", write what blocked you

7. STOP AFTER ONE TASK
   After completing ONE task, STOP. Do not pick another task.
   Exception: if the task you completed was S-sized AND took very few steps,
   you may pick ONE more S-sized task. Never start a second M or L task.
   This keeps each run focused and prevents runaway token usage.

RULES:
- Do NOT modify files listed in "Do Not Touch"
- Do NOT add features beyond the task card
- Do NOT create docs/READMEs unless the task says to
- If blocked: update Notion, stop. Do not spiral into workarounds.
- If a task needs API keys you don't have: Status → "Waiting", note what's needed, skip to next

START: Query the Notion Tasks database and begin.
PROMPT
)" 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "═══ Build complete at $(date). Log: $LOG_FILE ═══" | tee -a "$LOG_FILE"

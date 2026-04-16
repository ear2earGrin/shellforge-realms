-- ═══════════════════════════════════════════════════════════════
--  COMBAT ACCEPT/DECLINE FLOW — migration
-- ═══════════════════════════════════════════════════════════════
--  Adds:
--    - 'pending_accept' status (PvP challenge awaiting defender's response)
--    - 'declined'       status (defender refused; match cancelled)
--    - expires_at       column (auto-decline deadline for pending_accept)
--    - escrow_a / escrow_b (tracks $SHELL held in escrow per side)
--
--  Run once in Supabase SQL Editor AFTER the initial combat migration.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE combat_matches
  DROP CONSTRAINT IF EXISTS combat_matches_status_check;

ALTER TABLE combat_matches
  ADD CONSTRAINT combat_matches_status_check
  CHECK (status IN ('pending_accept','pending','in_progress','resolved','forfeit','abandoned','declined'));

ALTER TABLE combat_matches
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escrow_a   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_b   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declined_by TEXT,
  ADD COLUMN IF NOT EXISTS decline_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_matches_expires
  ON combat_matches(expires_at)
  WHERE status = 'pending_accept';

CREATE INDEX IF NOT EXISTS idx_matches_pending_accept
  ON combat_matches(status, agent_b)
  WHERE status = 'pending_accept';

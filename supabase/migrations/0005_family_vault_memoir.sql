-- ════════════════════════════════════════════════════════════════════
-- 0005 — FATHER'S LOG: preserve a dead agent's memoir in the Family Vault
--
-- The turn-engine now keeps a rolling first-person `agents.memoir` (long-term
-- memory). On death, both engines copy it into family_vault.last_memoir so the
-- next generation inherits it — the dynasty "father's log" from the brief.
-- A new heir's first memoir is seeded from this (see updateMemoir in
-- workers/turn-engine).
--
-- The agent→Ghost voice line needs NO migration — it's logged as an existing
-- 'event' row prefixed with 👻.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.family_vault ADD COLUMN IF NOT EXISTS last_memoir text;

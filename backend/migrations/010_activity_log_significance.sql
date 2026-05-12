-- Activity-log significance tiering — drives UI styling and lets us tell
-- "agent rested" from "agent died" at a glance.
--
--   0 — Mundane     rest / move-in-hub / empty explore-gather
--   1 — Notable     trade / use_item / hazard / event / stranded / move
--   2 — Significant arena / craft-success / Rare loot / loot-corpse
--   3 — Legendary   death / soulbound_resurrect / Legendary loot
--
-- Default is 1 so old rows and any new write that omits the column land
-- in the "Notable" middle tier — visible but not dramatic.

BEGIN;

ALTER TABLE activity_log
    ADD COLUMN IF NOT EXISTS significance SMALLINT NOT NULL DEFAULT 1
    CHECK (significance BETWEEN 0 AND 3);

CREATE INDEX IF NOT EXISTS idx_activity_log_significance
    ON activity_log(significance)
    WHERE significance >= 2;  -- partial index, only highlights are queried

-- Backfill historical rows by action_type so old logs render with reasonable
-- styling instead of all looking "Notable". Safe to re-run; only updates
-- rows still at the default.
UPDATE activity_log SET significance = 0
    WHERE significance = 1 AND action_type IN ('rest','move','spawn');
UPDATE activity_log SET significance = 2
    WHERE significance = 1 AND action_type IN ('arena','loot');
UPDATE activity_log SET significance = 3
    WHERE significance = 1 AND action_type IN ('death','soulbound_resurrect');

COMMIT;

-- agent_listings (the player-driven auction listings) only had an anon SELECT
-- policy, so the client — which runs on the anon key — could never create,
-- cancel, or buy a player listing: every INSERT/UPDATE was silently denied by
-- RLS ("Failed to create listing"). Mirror the market_listings policy set,
-- the established pattern for client-writable game tables.

BEGIN;

CREATE POLICY anon_insert ON agent_listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update ON agent_listings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_delete ON agent_listings FOR DELETE TO anon USING (true);

COMMIT;

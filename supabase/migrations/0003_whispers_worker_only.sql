-- ════════════════════════════════════════════════════════════════════
-- 0003 — WHISPERS BECOME WORKER-ONLY
--
-- ⚠️  DO NOT APPLY until whisper-worker v2 (server-side daily limit +
--     user_id resolution) is deployed via:
--       cd workers/whisper-worker && npx wrangler deploy
--     and the dashboard whisper flow is confirmed working through
--     https://shellforge-whisper-worker.mindarvokn.workers.dev/whisper.
--
-- Dropping anon INSERT closes the bypass where a crafted request could
-- skirt the 2/day limit by inserting into whispers directly. The frontend
-- direct-insert fallback stops working at that point by design.
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS anon_insert ON public.whispers;
REVOKE INSERT, UPDATE, DELETE ON public.whispers FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

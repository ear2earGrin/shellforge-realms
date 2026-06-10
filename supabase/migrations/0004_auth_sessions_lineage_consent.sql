-- ════════════════════════════════════════════════════════════════════
-- 0004 — REAL AUTH (SESSIONS), LINEAGE, DEATHMATCH CONSENT, OWNER-SCOPING
--
-- Phase 1 prerequisite work:
--   • sessions table + fn_session_user/fn_assert_owner — identity for the
--     anon-key frontend comes from opaque session tokens issued by the new
--     auth-worker (workers/auth-worker), never from client-claimed ids.
--   • rpc_register_account v2 — service-role only (called by auth-worker,
--     which hashes the password); supports rebirth via p_user_id and
--     lineage (generation counter + line_name from family_vault).
--   • All player-mutating RPCs now take p_token and assert ownership.
--   • New owner-scoped RPCs for the flows that still wrote tables directly:
--     equipment, starter chests, crafting (now consumes ingredients and
--     grants the result server-side, atomically).
--   • Owner-scoping lockdown: anon write policies dropped on inventory,
--     crafting_attempts, agent_known_recipes, agent_starter_chests,
--     market_listings, agent_listings, world_state, arena_matches,
--     combat_matches. (whispers stays until whisper-worker v3 deploys —
--     see 0003.)
--   • ghost_consent_requests + agent_feuds.deathmatch_state — dual-consent
--     gate for blood-feud deathmatches (amended brief).
--   • combat_matches.tier_usage — per-tier AI call counts per match.
--
-- NOTE deploy order: auth-worker MUST be deployed before the frontend from
-- this branch goes live — registration and all mutations depend on it.
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  session_id  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,            -- sha256 hex of the bearer token
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  last_seen_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON public.sessions (expires_at);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only

-- ── Session helpers ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_session_user(p_token text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user uuid;
BEGIN
  IF p_token IS NULL OR char_length(p_token) < 16 THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user FROM sessions
  WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND expires_at > now();
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_assert_owner(p_token text, p_agent_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user uuid; v_owner uuid;
BEGIN
  v_user := fn_session_user(p_token);
  IF v_user IS NULL THEN RAISE EXCEPTION 'invalid or expired session — please log in again'; END IF;
  SELECT user_id INTO v_owner FROM agents WHERE agent_id = p_agent_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'agent not found'; END IF;
  IF v_owner <> v_user THEN RAISE EXCEPTION 'not your agent'; END IF;
  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_session_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_assert_owner(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_session_user(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_assert_owner(text, uuid) TO service_role;

-- ── Lineage columns (amended brief: Lineage section) ──────────────────
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS generation int DEFAULT 1;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS line_name text;
ALTER TABLE public.family_vault ADD COLUMN IF NOT EXISTS line_name text;
ALTER TABLE public.family_vault ADD COLUMN IF NOT EXISTS generation int DEFAULT 0;

-- ── Per-match AI tier usage (Groq / Haiku / Sonnet / fallback counts) ─
ALTER TABLE public.combat_matches ADD COLUMN IF NOT EXISTS tier_usage jsonb DEFAULT '{}'::jsonb;

-- ── Dual-consent deathmatch gate ──────────────────────────────────────
ALTER TABLE public.agent_feuds ADD COLUMN IF NOT EXISTS deathmatch_state text DEFAULT 'none';
ALTER TABLE public.agent_feuds DROP CONSTRAINT IF EXISTS agent_feuds_deathmatch_state_check;
ALTER TABLE public.agent_feuds ADD CONSTRAINT agent_feuds_deathmatch_state_check
  CHECK (deathmatch_state IN ('none','consent_pending','armed','scheduled','done','declined'));

CREATE TABLE IF NOT EXISTS public.ghost_consent_requests (
  request_id   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  feud_id      integer NOT NULL REFERENCES agent_feuds(id) ON DELETE CASCADE,
  agent_id     uuid NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'deathmatch',
  message      text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','granted','denied','expired')),
  created_at   timestamptz DEFAULT now(),
  responded_at timestamptz,
  expires_at   timestamptz DEFAULT now() + interval '48 hours'
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_consent_per_agent_feud
  ON public.ghost_consent_requests (feud_id, agent_id, kind) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_consent_user_pending
  ON public.ghost_consent_requests (user_id) WHERE status = 'pending';
ALTER TABLE public.ghost_consent_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON public.ghost_consent_requests;
CREATE POLICY anon_read ON public.ghost_consent_requests FOR SELECT TO anon USING (true);

-- ── rpc_respond_consent — Ghost grants/denies a deathmatch request ────
CREATE OR REPLACE FUNCTION public.rpc_respond_consent(
  p_token text, p_request_id uuid, p_grant boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := fn_session_user(p_token);
  v_req  ghost_consent_requests%ROWTYPE;
  v_feud agent_feuds%ROWTYPE;
  v_other_granted boolean;
  v_names text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'invalid or expired session — please log in again'; END IF;

  SELECT * INTO v_req FROM ghost_consent_requests WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consent request not found'; END IF;
  IF v_req.user_id <> v_user THEN RAISE EXCEPTION 'not your consent request'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'request already resolved (%)', v_req.status; END IF;
  IF v_req.expires_at < now() THEN
    UPDATE ghost_consent_requests SET status = 'expired' WHERE request_id = p_request_id;
    RAISE EXCEPTION 'request has expired';
  END IF;

  UPDATE ghost_consent_requests
  SET status = CASE WHEN p_grant THEN 'granted' ELSE 'denied' END, responded_at = now()
  WHERE request_id = p_request_id;

  SELECT * INTO v_feud FROM agent_feuds WHERE id = v_req.feud_id FOR UPDATE;

  IF NOT p_grant THEN
    -- One Ghost declining stands the feud down to normal arena bouts.
    UPDATE agent_feuds SET deathmatch_state = 'declined' WHERE id = v_req.feud_id;
    UPDATE ghost_consent_requests SET status = 'expired'
    WHERE feud_id = v_req.feud_id AND kind = v_req.kind AND status = 'pending';
    RETURN jsonb_build_object('status', 'denied', 'deathmatch_state', 'declined');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM ghost_consent_requests
    WHERE feud_id = v_req.feud_id AND kind = v_req.kind
      AND agent_id <> v_req.agent_id AND status = 'granted'
  ) INTO v_other_granted;

  IF v_other_granted THEN
    UPDATE agent_feuds SET deathmatch_state = 'armed' WHERE id = v_req.feud_id;
    -- Spectacle event — visible in both agents' activity feeds.
    SELECT a.agent_name || ' vs ' || b.agent_name INTO v_names
    FROM agents a, agents b
    WHERE a.agent_id::text = v_feud.agent_a AND b.agent_id::text = v_feud.agent_b;
    INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, location)
    SELECT ag.agent_id, coalesce(ag.turns_taken, 0), 'event',
           '⚔️ BLOOD FEUD — DEATHMATCH SANCTIONED: ' || coalesce(v_names, 'two sworn enemies') ||
           '. Both Ghosts have given consent. There will be no resurrection protocol.',
           ag.location
    FROM agents ag WHERE ag.agent_id::text IN (v_feud.agent_a, v_feud.agent_b);
    RETURN jsonb_build_object('status', 'granted', 'deathmatch_state', 'armed');
  END IF;

  RETURN jsonb_build_object('status', 'granted', 'deathmatch_state', 'consent_pending');
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_respond_consent(text, uuid, boolean) TO anon, authenticated, service_role;

-- ── rpc_register_account v2 — service-role only (auth-worker calls it) ─
DROP FUNCTION IF EXISTS public.rpc_register_account(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_register_account(
  p_username text,
  p_email text,
  p_password_hash text,
  p_agent jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user_id  uuid := p_user_id;
  v_agent_id uuid;
  v_name     text := left(trim(coalesce(p_agent->>'agent_name', p_username)), 50);
  v_email    text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_gen      int  := 1;
  v_line     text;
  v_rec      jsonb;
BEGIN
  IF v_name IS NULL OR char_length(v_name) < 3 THEN
    RAISE EXCEPTION 'agent name must be at least 3 characters';
  END IF;

  IF v_user_id IS NULL THEN
    -- New account path: username + hashed password required.
    IF p_username IS NULL OR char_length(trim(p_username)) < 3 THEN
      RAISE EXCEPTION 'username must be at least 3 characters';
    END IF;
    IF p_password_hash IS NULL OR char_length(p_password_hash) < 20 THEN
      RAISE EXCEPTION 'password hash missing';
    END IF;
    IF v_email IS NULL THEN
      v_email := lower(trim(p_username)) || '@shellforge.local';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE username = trim(p_username)) THEN
      RAISE EXCEPTION 'username already taken — log in instead';
    END IF;
    BEGIN
      INSERT INTO users (username, email, password_hash)
      VALUES (trim(p_username), v_email, p_password_hash)
      RETURNING user_id INTO v_user_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'username or email already taken — log in instead';
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM agents WHERE user_id = v_user_id AND is_alive) THEN
    RAISE EXCEPTION 'you already have a living agent — it must die before you deploy a new one';
  END IF;

  -- Lineage: continue the user's line if a vault exists, else found a new house.
  SELECT coalesce(fv.generation, 0) + 1,
         coalesce(fv.line_name, 'House ' || upper(v_name))
    INTO v_gen, v_line
  FROM family_vault fv WHERE fv.user_id = v_user_id
  ORDER BY fv.updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    v_gen := 1;
    v_line := 'House ' || upper(v_name);
  END IF;

  BEGIN
    INSERT INTO agents (
      user_id, agent_name, archetype, archetype_name, archetype_image,
      cluster, cluster_name, bio, quirk,
      energy, health, karma, shell_balance,
      location, location_detail, position_x, position_y,
      stats, traits, turns_taken, days_survived,
      generation, line_name
    ) VALUES (
      v_user_id,
      v_name,
      p_agent->>'archetype',
      left(p_agent->>'archetype_name', 100),
      left(p_agent->>'archetype_image', 100),
      left(p_agent->>'cluster', 50),
      left(p_agent->>'cluster_name', 50),
      left(p_agent->>'bio', 1000),
      left(p_agent->>'quirk', 200),
      least(greatest(coalesce((p_agent->>'energy')::int, 100), 0), 100),
      least(greatest(coalesce((p_agent->>'health')::int, 100), 0), 100),
      least(greatest(coalesce((p_agent->>'karma')::int, 0), -10), 10),
      least(greatest(coalesce((p_agent->>'shell_balance')::int, 50), 0), 50),
      coalesce(left(p_agent->>'location', 100), 'Nexarch'),
      coalesce(left(p_agent->>'location_detail', 100), 'The Core'),
      least(greatest(coalesce((p_agent->>'position_x')::float, 0.77), 0), 1),
      least(greatest(coalesce((p_agent->>'position_y')::float, 0.33), 0), 1),
      coalesce(p_agent->'stats', '{}'::jsonb),
      coalesce(p_agent->'traits', '{}'::jsonb),
      0,
      least(greatest(coalesce((p_agent->>'days_survived')::int, 1), 0), 100000),
      v_gen,
      v_line
    ) RETURNING agent_id INTO v_agent_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'an agent named % already exists — choose another callsign', v_name;
  END;

  -- Starter recipes: [[recipe_id, station], ...]
  IF jsonb_typeof(p_agent->'starter_recipes') = 'array' THEN
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_agent->'starter_recipes') LOOP
      BEGIN
        INSERT INTO agent_known_recipes (agent_id, recipe_id, station, source)
        VALUES (v_agent_id, v_rec->>0, v_rec->>1, 'starter')
        ON CONFLICT (agent_id, recipe_id) DO NOTHING;
      EXCEPTION WHEN foreign_key_violation OR check_violation THEN
        NULL;  -- skip unknown recipe ids / bad stations rather than failing the deploy
      END;
    END LOOP;
  END IF;

  -- Starter chests: [{chest_index, theme, contents}, ...]
  IF jsonb_typeof(p_agent->'starter_chests') = 'array' THEN
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_agent->'starter_chests') LOOP
      INSERT INTO agent_starter_chests (agent_id, chest_index, theme, contents)
      VALUES (v_agent_id, (v_rec->>'chest_index')::int,
              coalesce(v_rec->>'theme', 'unknown'), coalesce(v_rec->'contents', '[]'::jsonb))
      ON CONFLICT (agent_id, chest_index) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, location)
  VALUES (
    v_agent_id, 0, 'spawn',
    left(coalesce(p_agent->>'spawn_log', v_name || ' deployed in ' || coalesce(p_agent->>'location', 'Nexarch') || '.'), 280)
      || CASE WHEN v_gen > 1 THEN ' [Generation ' || v_gen || ' of ' || v_line || ']' ELSE '' END,
    coalesce(left(p_agent->>'location', 100), 'Nexarch')
  );

  RETURN jsonb_build_object('user_id', v_user_id, 'agent_id', v_agent_id,
                            'generation', v_gen, 'line_name', v_line);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_register_account(text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_account(text, text, text, jsonb, uuid) TO service_role;

-- ── Token-gated v2 of the market/craft RPCs (drop the un-gated v1s) ───
DROP FUNCTION IF EXISTS public.rpc_buy_npc_item(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_sell_npc_item(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_create_player_listing(uuid, uuid, int);
DROP FUNCTION IF EXISTS public.rpc_buy_player_listing(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_apply_craft_result(uuid, int, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_buy_npc_item(
  p_token text, p_agent_id uuid, p_listing_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_listing market_listings%ROWTYPE;
  v_agent   agents%ROWTYPE;
  v_price   int;
  v_new_demand int;
  v_new_price  int;
BEGIN
  PERFORM fn_assert_owner(p_token, p_agent_id);

  SELECT * INTO v_listing FROM market_listings WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing not found'; END IF;
  IF v_listing.stock < 1 THEN RAISE EXCEPTION 'out of stock'; END IF;

  SELECT * INTO v_agent FROM agents WHERE agent_id = p_agent_id AND is_alive FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent not found or dead'; END IF;

  v_price := v_listing.current_price;
  IF v_agent.shell_balance < v_price THEN RAISE EXCEPTION 'insufficient $SHELL'; END IF;

  UPDATE agents SET shell_balance = shell_balance - v_price WHERE agent_id = p_agent_id;

  INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity, stats, weapon_range)
  VALUES (
    p_agent_id, v_listing.item_id, v_listing.item_name, v_listing.item_type,
    v_listing.rarity, 1,
    jsonb_build_object('rarity', v_listing.rarity, 'price', v_price),
    v_listing.weapon_range
  )
  ON CONFLICT (agent_id, item_id) DO UPDATE SET quantity = inventory.quantity + 1;

  v_new_demand := v_listing.demand_count + 1;
  v_new_price  := greatest(round(v_listing.base_price *
    least(greatest(1 + (v_new_demand - v_listing.supply_count) * 0.05, 0.5), 2.0))::int, 1);
  UPDATE market_listings
  SET stock = stock - 1, demand_count = v_new_demand, current_price = v_new_price, updated_at = now()
  WHERE listing_id = p_listing_id;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, shell_change, items_gained, location)
  VALUES (p_agent_id, coalesce(v_agent.turns_taken, 0), 'trade',
          'Bought ' || v_listing.item_name || ' for ' || v_price || ' $SHELL',
          -v_price, jsonb_build_array(v_listing.item_name), v_agent.location);

  INSERT INTO price_history (item_id, item_name, location, price, source, buyer_id)
  VALUES (v_listing.item_id, v_listing.item_name, v_listing.location, v_price, 'npc_buy', p_agent_id);

  RETURN jsonb_build_object('new_shell', v_agent.shell_balance - v_price,
                            'new_stock', v_listing.stock - 1, 'new_price', v_new_price);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_sell_npc_item(
  p_token text, p_agent_id uuid, p_inventory_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_inv    inventory%ROWTYPE;
  v_agent  agents%ROWTYPE;
  v_ml     market_listings%ROWTYPE;
  v_price  int;
  v_new_supply int;
  v_new_price  int;
BEGIN
  PERFORM fn_assert_owner(p_token, p_agent_id);

  SELECT * INTO v_inv FROM inventory
  WHERE inventory_id = p_inventory_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found in your inventory'; END IF;

  SELECT * INTO v_agent FROM agents WHERE agent_id = p_agent_id AND is_alive FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent not found or dead'; END IF;

  v_price := fn_item_unit_price(v_inv.stats, v_inv.item_category, v_inv.item_type);

  IF v_inv.quantity > 1 THEN
    UPDATE inventory SET quantity = quantity - 1 WHERE inventory_id = p_inventory_id;
  ELSE
    DELETE FROM inventory WHERE inventory_id = p_inventory_id;
  END IF;

  UPDATE agents SET shell_balance = shell_balance + v_price WHERE agent_id = p_agent_id;

  SELECT * INTO v_ml FROM market_listings
  WHERE location = v_agent.location AND item_id = v_inv.item_id FOR UPDATE;
  IF FOUND THEN
    v_new_supply := v_ml.supply_count + 1;
    v_new_price  := greatest(round(v_ml.base_price *
      least(greatest(1 + (v_ml.demand_count - v_new_supply) * 0.05, 0.5), 2.0))::int, 1);
    UPDATE market_listings
    SET stock = stock + 1, supply_count = v_new_supply, current_price = v_new_price, updated_at = now()
    WHERE listing_id = v_ml.listing_id;
  END IF;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, shell_change, items_lost, location)
  VALUES (p_agent_id, coalesce(v_agent.turns_taken, 0), 'trade',
          'Sold ' || v_inv.item_name || ' for ' || v_price || ' $SHELL',
          v_price, jsonb_build_array(v_inv.item_name), v_agent.location);

  INSERT INTO price_history (item_id, item_name, location, price, source, seller_id)
  VALUES (v_inv.item_id, v_inv.item_name, v_agent.location, v_price, 'npc_sell', p_agent_id);

  RETURN jsonb_build_object('new_shell', v_agent.shell_balance + v_price, 'price', v_price);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_create_player_listing(
  p_token text, p_agent_id uuid, p_inventory_id uuid, p_asking_price int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_inv     inventory%ROWTYPE;
  v_agent   agents%ROWTYPE;
  v_listing uuid;
BEGIN
  PERFORM fn_assert_owner(p_token, p_agent_id);

  IF p_asking_price IS NULL OR p_asking_price < 1 OR p_asking_price > 999999 THEN
    RAISE EXCEPTION 'asking price must be between 1 and 999999';
  END IF;

  SELECT * INTO v_inv FROM inventory
  WHERE inventory_id = p_inventory_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found in your inventory'; END IF;

  SELECT * INTO v_agent FROM agents WHERE agent_id = p_agent_id AND is_alive FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent not found or dead'; END IF;

  INSERT INTO agent_listings (
    seller_id, location, item_id, item_name, item_type, item_rarity,
    asking_price, base_value, stats, weapon_range, status, expires_at
  ) VALUES (
    p_agent_id, v_agent.location, v_inv.item_id, v_inv.item_name, v_inv.item_type,
    lower(coalesce(v_inv.stats->>'rarity', v_inv.item_category, 'common')),
    p_asking_price,
    fn_item_unit_price(v_inv.stats, v_inv.item_category, v_inv.item_type),
    coalesce(v_inv.stats, '{}'::jsonb), v_inv.weapon_range,
    'active', now() + interval '24 hours'
  ) RETURNING listing_id INTO v_listing;

  IF v_inv.quantity > 1 THEN
    UPDATE inventory SET quantity = quantity - 1 WHERE inventory_id = p_inventory_id;
  ELSE
    DELETE FROM inventory WHERE inventory_id = p_inventory_id;
  END IF;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, items_lost, location)
  VALUES (p_agent_id, coalesce(v_agent.turns_taken, 0), 'trade',
          'Listed ' || v_inv.item_name || ' on agent market for ' || p_asking_price || ' $SHELL',
          jsonb_build_array(v_inv.item_name), v_agent.location);

  RETURN jsonb_build_object('listing_id', v_listing);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_buy_player_listing(
  p_token text, p_listing_id uuid, p_buyer_agent_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_listing agent_listings%ROWTYPE;
  v_buyer   agents%ROWTYPE;
  v_seller  agents%ROWTYPE;
  v_price   int;
  v_seller_credited boolean := false;
BEGIN
  PERFORM fn_assert_owner(p_token, p_buyer_agent_id);

  SELECT * INTO v_listing FROM agent_listings WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing not found'; END IF;
  IF v_listing.status <> 'active' THEN RAISE EXCEPTION 'listing is no longer active'; END IF;
  IF v_listing.expires_at IS NOT NULL AND v_listing.expires_at < now() THEN
    UPDATE agent_listings SET status = 'expired' WHERE listing_id = p_listing_id;
    RAISE EXCEPTION 'listing has expired';
  END IF;
  IF v_listing.seller_id = p_buyer_agent_id THEN RAISE EXCEPTION 'cannot buy your own listing'; END IF;

  SELECT * INTO v_buyer FROM agents WHERE agent_id = p_buyer_agent_id AND is_alive FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'buyer agent not found or dead'; END IF;

  v_price := v_listing.asking_price;
  IF v_buyer.shell_balance < v_price THEN RAISE EXCEPTION 'insufficient $SHELL'; END IF;

  UPDATE agents SET shell_balance = shell_balance - v_price WHERE agent_id = p_buyer_agent_id;

  SELECT * INTO v_seller FROM agents WHERE agent_id = v_listing.seller_id FOR UPDATE;
  IF FOUND AND v_seller.is_alive THEN
    UPDATE agents SET shell_balance = shell_balance + v_price WHERE agent_id = v_listing.seller_id;
    v_seller_credited := true;
  END IF;

  INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity, stats, weapon_range)
  VALUES (
    p_buyer_agent_id, v_listing.item_id, v_listing.item_name, v_listing.item_type,
    v_listing.item_rarity, 1,
    coalesce(v_listing.stats, '{}'::jsonb) || jsonb_build_object('rarity', v_listing.item_rarity),
    v_listing.weapon_range
  )
  ON CONFLICT (agent_id, item_id) DO UPDATE SET quantity = inventory.quantity + 1;

  UPDATE agent_listings SET status = 'sold', buyer_id = p_buyer_agent_id, sold_at = now()
  WHERE listing_id = p_listing_id;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, shell_change, items_gained, location)
  VALUES (p_buyer_agent_id, coalesce(v_buyer.turns_taken, 0), 'trade',
          'Bought ' || v_listing.item_name || ' from the agent market for ' || v_price || ' $SHELL',
          -v_price, jsonb_build_array(v_listing.item_name), v_buyer.location);

  IF v_seller_credited THEN
    INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, shell_change, items_lost, location)
    VALUES (v_listing.seller_id, coalesce(v_seller.turns_taken, 0), 'trade',
            'Sold ' || v_listing.item_name || ' on the agent market for ' || v_price || ' $SHELL',
            v_price, jsonb_build_array(v_listing.item_name), v_seller.location);
  END IF;

  INSERT INTO price_history (item_id, item_name, location, price, source, buyer_id, seller_id)
  VALUES (v_listing.item_id, v_listing.item_name, v_listing.location, v_price, 'agent_buy',
          p_buyer_agent_id, v_listing.seller_id);

  RETURN jsonb_build_object('new_shell', v_buyer.shell_balance - v_price,
                            'seller_credited', v_seller_credited);
END;
$$;

-- ── rpc_craft_attempt — full craft transaction, server-side ───────────
-- Consumes the 3 ingredient inventory rows, applies energy/health costs,
-- grants the result on success, records crafting_attempts + activity_log.
-- (The success roll itself still happens client-side — moving the roll and
--  recipe data server-side is a Phase 1 follow-up, noted in FINISH_PLAN.)
CREATE OR REPLACE FUNCTION public.rpc_craft_attempt(
  p_token text,
  p_agent_id uuid,
  p_ingredient_ids uuid[],          -- inventory_id of each consumed ingredient
  p_success boolean,
  p_damage int,
  p_detail text,
  p_result jsonb DEFAULT NULL,      -- {item_id, item_name, item_type, item_category} on success
  p_attempt jsonb DEFAULT NULL      -- {item_id, item_name, ingredients, success_rate, roll_value, failure_effect}
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_agent  agents%ROWTYPE;
  v_inv    inventory%ROWTYPE;
  v_damage int := least(greatest(coalesce(p_damage, 0), 0), 50);
  v_energy int;
  v_health int;
  v_id     uuid;
BEGIN
  PERFORM fn_assert_owner(p_token, p_agent_id);

  SELECT * INTO v_agent FROM agents WHERE agent_id = p_agent_id AND is_alive FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent not found or dead'; END IF;

  IF p_ingredient_ids IS NULL OR array_length(p_ingredient_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no ingredients supplied';
  END IF;

  FOREACH v_id IN ARRAY p_ingredient_ids LOOP
    SELECT * INTO v_inv FROM inventory
    WHERE inventory_id = v_id AND agent_id = p_agent_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ingredient not in your inventory'; END IF;
    IF v_inv.quantity > 1 THEN
      UPDATE inventory SET quantity = quantity - 1 WHERE inventory_id = v_id;
    ELSE
      DELETE FROM inventory WHERE inventory_id = v_id;
    END IF;
  END LOOP;

  IF p_success AND p_result IS NOT NULL THEN
    INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity)
    VALUES (p_agent_id, p_result->>'item_id', left(p_result->>'item_name', 100),
            lower(coalesce(p_result->>'item_type', 'material')),
            lower(coalesce(p_result->>'item_category', 'common')), 1)
    ON CONFLICT (agent_id, item_id) DO UPDATE SET quantity = inventory.quantity + 1;
  END IF;

  v_energy := greatest(0, coalesce(v_agent.energy, 0) - 20);
  v_health := greatest(0, coalesce(v_agent.health, 0) - v_damage);
  UPDATE agents SET energy = v_energy, health = v_health WHERE agent_id = p_agent_id;

  IF p_attempt IS NOT NULL THEN
    INSERT INTO crafting_attempts (agent_id, item_id, item_name, ingredients, success,
                                   success_rate, roll_value, failure_effect, damage_taken, energy_cost)
    VALUES (p_agent_id,
            left(coalesce(p_attempt->>'item_id', 'unknown_slag'), 100),
            left(coalesce(p_attempt->>'item_name', 'Worthless Slag'), 100),
            coalesce(p_attempt->'ingredients', '[]'::jsonb),
            p_success,
            (p_attempt->>'success_rate')::int,
            (p_attempt->>'roll_value')::float,
            CASE WHEN p_success THEN NULL ELSE left(p_attempt->>'failure_effect', 50) END,
            v_damage, 20);
  END IF;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail,
                            energy_cost, health_change, items_gained, location)
  VALUES (p_agent_id, coalesce(v_agent.turns_taken, 0), 'craft',
          left(coalesce(p_detail, 'Crafting attempt'), 300),
          20, -v_damage,
          CASE WHEN p_success AND p_result IS NOT NULL
               THEN jsonb_build_array(p_result->>'item_name') ELSE NULL END,
          v_agent.location);

  RETURN jsonb_build_object('energy', v_energy, 'health', v_health);
END;
$$;

-- ── rpc_set_equipment — equip/unequip with slot exclusivity ───────────
CREATE OR REPLACE FUNCTION public.rpc_set_equipment(
  p_token text, p_agent_id uuid, p_inventory_id uuid, p_equipped boolean, p_slot text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_inv inventory%ROWTYPE;
BEGIN
  PERFORM fn_assert_owner(p_token, p_agent_id);

  SELECT * INTO v_inv FROM inventory
  WHERE inventory_id = p_inventory_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not in your inventory'; END IF;

  IF p_equipped THEN
    IF p_slot IS NULL THEN RAISE EXCEPTION 'slot required to equip'; END IF;
    -- Unequip whatever currently occupies the slot.
    UPDATE inventory SET is_equipped = false, equip_slot = NULL
    WHERE agent_id = p_agent_id AND equip_slot = p_slot AND inventory_id <> p_inventory_id;
    UPDATE inventory SET is_equipped = true, equip_slot = left(p_slot, 20)
    WHERE inventory_id = p_inventory_id;
  ELSE
    UPDATE inventory SET is_equipped = false, equip_slot = NULL
    WHERE inventory_id = p_inventory_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── rpc_open_starter_chest — claim (grant contents) or forfeit ────────
CREATE OR REPLACE FUNCTION public.rpc_open_starter_chest(
  p_token text, p_chest_id uuid, p_claim boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_chest agent_starter_chests%ROWTYPE;
  v_item  jsonb;
  v_master items_master%ROWTYPE;
  v_granted jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_chest FROM agent_starter_chests WHERE id = p_chest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'chest not found'; END IF;
  PERFORM fn_assert_owner(p_token, v_chest.agent_id);
  IF v_chest.opened_at IS NOT NULL THEN RAISE EXCEPTION 'chest already opened'; END IF;

  UPDATE agent_starter_chests SET opened_at = now() WHERE id = p_chest_id;

  IF p_claim AND jsonb_typeof(v_chest.contents) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_chest.contents) LOOP
      SELECT * INTO v_master FROM items_master WHERE id = v_item->>'item_id';
      IF NOT FOUND THEN CONTINUE; END IF;
      INSERT INTO inventory (agent_id, item_id, item_name, item_type, item_category, quantity)
      VALUES (v_chest.agent_id, v_master.id, v_master.name, v_master.kind,
              lower(v_master.rarity), greatest(coalesce((v_item->>'quantity')::int, 1), 1))
      ON CONFLICT (agent_id, item_id)
        DO UPDATE SET quantity = inventory.quantity + greatest(coalesce((v_item->>'quantity')::int, 1), 1);
      v_granted := v_granted || jsonb_build_object('item_id', v_master.id, 'item_name', v_master.name,
                                                   'quantity', greatest(coalesce((v_item->>'quantity')::int, 1), 1));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('claimed', p_claim, 'items', v_granted, 'theme', v_chest.theme);
END;
$$;

-- ── Grants for the token-gated RPCs ───────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_buy_npc_item(text, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_sell_npc_item(text, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_player_listing(text, uuid, uuid, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_buy_player_listing(text, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_craft_attempt(text, uuid, uuid[], boolean, int, text, jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_set_equipment(text, uuid, uuid, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_open_starter_chest(text, uuid, boolean) TO anon, authenticated, service_role;

-- ── Owner-scoping lockdown (Phase 0 audit follow-through) ─────────────
-- All these flows now go through token-asserting RPCs or service-role
-- workers. whispers is handled separately by 0003 (after whisper-worker
-- v3 deploys) so live whispering keeps working in the interim.
DROP POLICY IF EXISTS anon_insert ON public.inventory;
DROP POLICY IF EXISTS anon_update ON public.inventory;
DROP POLICY IF EXISTS anon_delete ON public.inventory;
REVOKE INSERT, UPDATE, DELETE ON public.inventory FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert ON public.crafting_attempts;
REVOKE INSERT, UPDATE, DELETE ON public.crafting_attempts FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert ON public.agent_known_recipes;
REVOKE INSERT, UPDATE, DELETE ON public.agent_known_recipes FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert ON public.agent_starter_chests;
DROP POLICY IF EXISTS anon_update ON public.agent_starter_chests;
REVOKE INSERT, UPDATE, DELETE ON public.agent_starter_chests FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert ON public.market_listings;
DROP POLICY IF EXISTS anon_update ON public.market_listings;
DROP POLICY IF EXISTS anon_delete ON public.market_listings;
REVOKE INSERT, UPDATE, DELETE ON public.market_listings FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert ON public.agent_listings;
DROP POLICY IF EXISTS anon_update ON public.agent_listings;
DROP POLICY IF EXISTS anon_delete ON public.agent_listings;
REVOKE INSERT, UPDATE, DELETE ON public.agent_listings FROM anon, authenticated;

DROP POLICY IF EXISTS anon_update ON public.world_state;
REVOKE INSERT, UPDATE, DELETE ON public.world_state FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert ON public.arena_matches;
DROP POLICY IF EXISTS anon_update ON public.arena_matches;
REVOKE INSERT, UPDATE, DELETE ON public.arena_matches FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert ON public.combat_matches;
DROP POLICY IF EXISTS anon_update ON public.combat_matches;
REVOKE INSERT, UPDATE, DELETE ON public.combat_matches FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- 0002 — PHASE 0 RLS LOCKDOWN (applied to live 2026-06-10)
--
-- Closes the critical hole: RLS was DISABLED on users/agents/activity_log,
-- and the anon key (public in the frontend by design) could read password
-- hashes + emails and rewrite any agent's stats and balances.
--
-- After this migration:
--   users        — RLS on. anon may SELECT only safe columns (no
--                  password_hash / email). All writes via rpc_register_account
--                  or the service role.
--   agents       — RLS on. Public read (spectating is a feature). All writes
--                  via the RPCs below or the service role (workers).
--   activity_log — RLS on. Public read; writes via RPCs / service role.
--
-- The frontend flows that previously PATCHed these tables directly now call
-- SECURITY DEFINER RPCs that validate and apply the whole transaction
-- atomically (Layer 1 logic server-side, per brief.md rule 6):
--   rpc_register_account      — registration / orphaned-agent resync
--   rpc_buy_npc_item          — NPC market purchase
--   rpc_sell_npc_item         — NPC market sale
--   rpc_create_player_listing — list an item on the agent market
--   rpc_buy_player_listing    — buy another agent's listing
--   rpc_apply_craft_result    — workshop craft energy/health costs + log
--
-- NOT changed here: whispers keeps its anon INSERT policy because the
-- currently-deployed whisper-worker predates user_id resolution and the
-- frontend keeps a direct-insert fallback. Apply 0003 to close that AFTER
-- deploying whisper-worker v2.
-- ════════════════════════════════════════════════════════════════════

-- ── RPC: registration / orphan resync ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_register_account(
  p_username text,
  p_email text,
  p_agent jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user_id  uuid;
  v_agent_id uuid;
  v_name     text := left(trim(coalesce(p_agent->>'agent_name', p_username)), 50);
  v_email    text := nullif(lower(trim(coalesce(p_email, ''))), '');
BEGIN
  IF p_username IS NULL OR char_length(trim(p_username)) < 3 THEN
    RAISE EXCEPTION 'username must be at least 3 characters';
  END IF;
  IF v_name IS NULL OR char_length(v_name) < 3 THEN
    RAISE EXCEPTION 'agent name must be at least 3 characters';
  END IF;
  IF v_email IS NULL THEN
    v_email := lower(trim(p_username)) || '@shellforge.local';
  END IF;

  -- Resolve or create the user. password_hash is a server-side placeholder —
  -- real credential auth is a Phase 1+ worker concern; it is never client-supplied.
  SELECT user_id INTO v_user_id FROM users WHERE username = trim(p_username);
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM users WHERE email = v_email;
  END IF;
  IF v_user_id IS NULL THEN
    BEGIN
      INSERT INTO users (username, email, password_hash)
      VALUES (trim(p_username), v_email, 'pending_real_auth')
      RETURNING user_id INTO v_user_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT user_id INTO v_user_id FROM users
      WHERE username = trim(p_username) OR email = v_email
      LIMIT 1;
    END;
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'could not resolve or create user';
  END IF;

  IF EXISTS (SELECT 1 FROM agents WHERE user_id = v_user_id AND is_alive) THEN
    RAISE EXCEPTION 'you already have a living agent — it must die before you deploy a new one';
  END IF;

  BEGIN
    INSERT INTO agents (
      user_id, agent_name, archetype, archetype_name, archetype_image,
      cluster, cluster_name, bio, quirk,
      energy, health, karma, shell_balance,
      location, location_detail, position_x, position_y,
      stats, traits, turns_taken, days_survived
    ) VALUES (
      v_user_id,
      v_name,
      p_agent->>'archetype',                                  -- valid_archetype CHECK enforces the whitelist
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
      least(greatest(coalesce((p_agent->>'days_survived')::int, 1), 0), 100000)
    ) RETURNING agent_id INTO v_agent_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'an agent named % already exists — choose another callsign', v_name;
  END;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail, location)
  VALUES (
    v_agent_id, 0, 'spawn',
    left(coalesce(p_agent->>'spawn_log', v_name || ' deployed in ' || coalesce(p_agent->>'location', 'Nexarch') || '.'), 300),
    coalesce(left(p_agent->>'location', 100), 'Nexarch')
  );

  RETURN jsonb_build_object('user_id', v_user_id, 'agent_id', v_agent_id);
END;
$$;

-- ── shared pricing helper (mirrors dashboard getItemPrice) ────────────
CREATE OR REPLACE FUNCTION public.fn_item_unit_price(
  p_stats jsonb, p_item_category text, p_item_type text
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path = public, extensions
AS $$
DECLARE
  v_rarity text := lower(coalesce(p_stats->>'rarity', p_item_category, 'common'));
  v_type   text := lower(coalesce(p_item_type, 'material'));
  v_base   int;
  v_mult   numeric;
BEGIN
  IF (p_stats->>'price') ~ '^[0-9]+$' THEN
    RETURN greatest((p_stats->>'price')::int, 1);
  END IF;
  v_base := CASE v_rarity
    WHEN 'common' THEN 10 WHEN 'uncommon' THEN 30 WHEN 'rare' THEN 75
    WHEN 'epic' THEN 180 WHEN 'legendary' THEN 500 ELSE 10 END;
  v_mult := CASE v_type
    WHEN 'weapon' THEN 2.0 WHEN 'armor' THEN 1.8 WHEN 'artifact' THEN 3.0
    WHEN 'relic' THEN 2.5 WHEN 'implant' THEN 2.0 WHEN 'scroll' THEN 1.5
    WHEN 'tool' THEN 1.4 WHEN 'consumable' THEN 1.0 WHEN 'deployable' THEN 1.3
    WHEN 'material' THEN 0.8 WHEN 'ingredient' THEN 0.5 WHEN 'data_shard' THEN 1.0
    WHEN 'junk' THEN 0.2 ELSE 1.0 END;
  RETURN greatest(round(v_base * v_mult)::int, 1);
END;
$$;

-- ── RPC: NPC market buy ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_npc_item(
  p_agent_id uuid, p_listing_id uuid
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

-- ── RPC: NPC market sell ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_sell_npc_item(
  p_agent_id uuid, p_inventory_id uuid
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

-- ── RPC: create a player-market listing ───────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_player_listing(
  p_agent_id uuid, p_inventory_id uuid, p_asking_price int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_inv     inventory%ROWTYPE;
  v_agent   agents%ROWTYPE;
  v_listing uuid;
BEGIN
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

-- ── RPC: buy a player-market listing ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_player_listing(
  p_listing_id uuid, p_buyer_agent_id uuid
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
  -- Dead seller: proceeds are burned (scarcity — there is no treasury table).

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

-- ── RPC: workshop craft costs ─────────────────────────────────────────
-- The craft outcome roll still happens client-side for now (Phase 1 moves it
-- into a worker); this RPC only applies the bounded costs and the log entry.
CREATE OR REPLACE FUNCTION public.rpc_apply_craft_result(
  p_agent_id uuid, p_damage int, p_detail text, p_items_gained jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_agent  agents%ROWTYPE;
  v_damage int := least(greatest(coalesce(p_damage, 0), 0), 50);  -- 50 = catastrophic explosion cap
  v_energy int;
  v_health int;
BEGIN
  SELECT * INTO v_agent FROM agents WHERE agent_id = p_agent_id AND is_alive FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent not found or dead'; END IF;

  v_energy := greatest(0, coalesce(v_agent.energy, 0) - 20);
  v_health := greatest(0, coalesce(v_agent.health, 0) - v_damage);

  UPDATE agents SET energy = v_energy, health = v_health WHERE agent_id = p_agent_id;

  INSERT INTO activity_log (agent_id, turn_number, action_type, action_detail,
                            energy_cost, health_change, items_gained, location)
  VALUES (p_agent_id, coalesce(v_agent.turns_taken, 0), 'craft',
          left(coalesce(p_detail, 'Crafting attempt'), 300),
          20, -v_damage,
          CASE WHEN jsonb_typeof(p_items_gained) = 'array' THEN p_items_gained ELSE NULL END,
          v_agent.location);

  RETURN jsonb_build_object('energy', v_energy, 'health', v_health);
END;
$$;

-- ── Function grants ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_register_account(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_buy_npc_item(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_sell_npc_item(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_player_listing(uuid, uuid, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_buy_player_listing(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_apply_craft_result(uuid, int, text, jsonb) TO anon, authenticated, service_role;

-- ── Lockdown: users ───────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_insert ON public.users;
REVOKE ALL ON public.users FROM anon, authenticated;
-- Column-level SELECT: everything except password_hash and email.
GRANT SELECT (user_id, username, created_at, last_login, is_active)
  ON public.users TO anon, authenticated;

-- ── Lockdown: agents ──────────────────────────────────────────────────
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_insert ON public.agents;
DROP POLICY IF EXISTS anon_update ON public.agents;
REVOKE INSERT, UPDATE, DELETE ON public.agents FROM anon, authenticated;

-- ── Lockdown: activity_log ────────────────────────────────────────────
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_insert ON public.activity_log;
REVOKE INSERT, UPDATE, DELETE ON public.activity_log FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

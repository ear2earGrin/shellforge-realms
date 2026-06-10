-- ════════════════════════════════════════════════════════════════════
-- 0001 — BASELINE SCHEMA SNAPSHOT
-- Captured 2026-06-10 from the live Supabase project (wtzrxscdlqdgdiefsmru)
-- BEFORE the Phase 0 RLS lockdown (0002).
--
-- This file documents the pre-existing state of all 28 public tables so
-- the database is reproducible from the repo. It was generated from
-- pg_catalog — do NOT apply it to the live project (everything in it
-- already exists there). Apply it only when bootstrapping a fresh
-- environment.
--
-- NOTE: the policies at the bottom reflect the INSECURE pre-lockdown
-- state (anon can write almost everything, RLS off on users/agents/
-- activity_log). Migration 0002 fixes that — never run 0001 without 0002.
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Sequences ─────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS combat_abilities_id_seq;
CREATE SEQUENCE IF NOT EXISTS archetype_abilities_id_seq;
CREATE SEQUENCE IF NOT EXISTS combat_turns_id_seq;
CREATE SEQUENCE IF NOT EXISTS combat_effects_id_seq;
CREATE SEQUENCE IF NOT EXISTS combat_whispers_id_seq;
CREATE SEQUENCE IF NOT EXISTS agent_feuds_id_seq;
CREATE SEQUENCE IF NOT EXISTS spectator_bets_id_seq;

-- ── Tables ────────────────────────────────────────────────────────────

CREATE TABLE public.users (
  user_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  username character varying(50) NOT NULL,
  password_hash character varying(255) NOT NULL,
  email character varying(255),
  created_at timestamp without time zone DEFAULT now(),
  last_login timestamp without time zone,
  is_active boolean DEFAULT true
);

CREATE TABLE public.agents (
  agent_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  agent_name character varying(50) NOT NULL,
  archetype character varying(50) NOT NULL,
  bio text,
  archetype_name character varying(100),
  archetype_image character varying(100),
  cluster character varying(50),
  cluster_name character varying(50),
  stats jsonb DEFAULT '{}'::jsonb,
  traits jsonb DEFAULT '{}'::jsonb,
  visual_x double precision DEFAULT 0.77,
  visual_y double precision DEFAULT 0.33,
  journey jsonb,
  energy integer DEFAULT 100,
  health integer DEFAULT 100,
  karma integer DEFAULT 0,
  shell_balance integer DEFAULT 50,
  location character varying(100) DEFAULT 'Nexarch'::character varying,
  location_detail character varying(100) DEFAULT 'Dark Streets'::character varying,
  position_x double precision DEFAULT 0.36,
  position_y double precision DEFAULT 0.20,
  turns_taken integer DEFAULT 0,
  days_survived integer DEFAULT 0,
  is_alive boolean DEFAULT true,
  last_action_at timestamp without time zone DEFAULT now(),
  next_turn_at timestamp without time zone,
  last_energy_reset_at timestamp without time zone DEFAULT now(),
  created_at timestamp without time zone DEFAULT now(),
  died_at timestamp without time zone,
  quirk character varying,
  death_count integer DEFAULT 0,
  turns_at_location integer DEFAULT 0,
  coherence integer DEFAULT 100,
  memoir text,
  memoir_updated_turn integer DEFAULT 0,
  travel_state jsonb
);

CREATE TABLE public.inventory (
  inventory_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  agent_id uuid NOT NULL,
  item_id character varying(100) NOT NULL,
  item_name character varying(100) NOT NULL,
  item_type character varying(50) NOT NULL,
  item_category character varying(50),
  quantity integer DEFAULT 1,
  is_equipped boolean DEFAULT false,
  acquired_at timestamp without time zone DEFAULT now(),
  stats jsonb DEFAULT '{}'::jsonb NOT NULL,
  equip_slot character varying(20) DEFAULT NULL::character varying,
  weapon_range character varying(20) DEFAULT NULL::character varying
);

CREATE TABLE public.activity_log (
  log_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  agent_id uuid NOT NULL,
  turn_number integer NOT NULL,
  action_type character varying(50) NOT NULL,
  action_detail text,
  energy_cost integer DEFAULT 0,
  energy_gained integer DEFAULT 0,
  shell_change integer DEFAULT 0,
  karma_change integer DEFAULT 0,
  health_change integer DEFAULT 0,
  items_gained jsonb,
  items_lost jsonb,
  location character varying(100),
  success boolean DEFAULT true,
  "timestamp" timestamp without time zone DEFAULT now(),
  combat_context jsonb
);

CREATE TABLE public.whispers (
  whisper_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text NOT NULL,
  was_heard boolean NOT NULL,
  roll_value double precision,
  sent_at timestamp without time zone DEFAULT now(),
  whisper_date date DEFAULT CURRENT_DATE
);

CREATE TABLE public.crafting_attempts (
  attempt_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  agent_id uuid NOT NULL,
  item_id character varying(100) NOT NULL,
  item_name character varying(100) NOT NULL,
  ingredients jsonb NOT NULL,
  success boolean NOT NULL,
  success_rate integer,
  roll_value double precision,
  failure_effect character varying(50),
  damage_taken integer DEFAULT 0,
  energy_cost integer DEFAULT 20,
  crafted_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.world_state (
  state_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  location character varying(100) NOT NULL,
  population integer DEFAULT 0,
  event_type character varying(50),
  event_data jsonb,
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.arena_matches (
  match_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  agent1_id uuid NOT NULL,
  agent2_id uuid,
  location character varying(100) NOT NULL,
  status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  started_at timestamp without time zone,
  ended_at timestamp without time zone,
  winner_id uuid,
  stats_json jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.combat_logs (
  log_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  match_id uuid NOT NULL,
  turn_number integer NOT NULL,
  agent_id uuid,
  action_type character varying(50) NOT NULL,
  target_id uuid,
  damage_dealt integer DEFAULT 0,
  damage_taken integer DEFAULT 0,
  health_before integer,
  health_after integer,
  energy_before integer,
  energy_after integer,
  shell_change integer DEFAULT 0,
  karma_change integer DEFAULT 0,
  log_text text,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vault (
  vault_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  original_agent_id uuid NOT NULL,
  item_id character varying(100) NOT NULL,
  item_name character varying(100) NOT NULL,
  item_type character varying(50) NOT NULL,
  item_category character varying(50),
  quantity integer DEFAULT 1,
  deposited_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.market_listings (
  listing_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  location character varying(100) NOT NULL,
  item_id character varying(50) NOT NULL,
  item_name character varying(100) NOT NULL,
  item_type character varying(50) NOT NULL,
  rarity character varying(20) DEFAULT 'common'::character varying,
  base_price integer NOT NULL,
  current_price integer NOT NULL,
  stock integer DEFAULT 10 NOT NULL,
  demand_count integer DEFAULT 0 NOT NULL,
  supply_count integer DEFAULT 0 NOT NULL,
  description text,
  stat_effects jsonb DEFAULT '{}'::jsonb,
  craftable boolean DEFAULT false,
  craft_recipe jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp without time zone DEFAULT now(),
  weapon_range character varying(20) DEFAULT NULL::character varying
);

CREATE TABLE public.agent_listings (
  listing_id uuid DEFAULT gen_random_uuid() NOT NULL,
  seller_id uuid NOT NULL,
  location character varying(100) NOT NULL,
  item_id character varying(50) NOT NULL,
  item_name character varying(100) NOT NULL,
  item_type character varying(50) NOT NULL,
  item_rarity character varying(20) DEFAULT 'common'::character varying,
  asking_price integer NOT NULL,
  base_value integer DEFAULT 10 NOT NULL,
  stats jsonb DEFAULT '{}'::jsonb,
  listed_at timestamp without time zone DEFAULT now(),
  expires_at timestamp without time zone DEFAULT (now() + '48:00:00'::interval),
  status character varying(20) DEFAULT 'active'::character varying,
  buyer_id uuid,
  sold_at timestamp without time zone,
  weapon_range character varying(20) DEFAULT NULL::character varying
);

CREATE TABLE public.price_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  item_id character varying(50) NOT NULL,
  item_name character varying(100),
  location character varying(100) NOT NULL,
  price integer NOT NULL,
  source character varying(20) NOT NULL,
  buyer_id uuid,
  seller_id uuid,
  recorded_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.family_vault (
  vault_id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  shell_balance integer DEFAULT 0,
  legacy_trait character varying(100),
  legacy_karma integer DEFAULT 0,
  last_agent_name character varying(100),
  last_death_narrative text,
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.vault_items (
  vault_item_id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  item_id character varying(50) NOT NULL,
  item_name character varying(100) NOT NULL,
  item_type character varying(50) NOT NULL,
  item_rarity character varying(20) NOT NULL,
  stats jsonb DEFAULT '{}'::jsonb,
  inherited_from character varying(100),
  deposited_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.combat_abilities (
  id integer DEFAULT nextval('combat_abilities_id_seq'::regclass) NOT NULL,
  item_name text NOT NULL,
  item_id text,
  ability_name text NOT NULL,
  type text NOT NULL,
  coherence_cost integer DEFAULT 0 NOT NULL,
  cooldown integer DEFAULT 0 NOT NULL,
  power integer DEFAULT 0 NOT NULL,
  duration integer DEFAULT 0 NOT NULL,
  one_time boolean DEFAULT false NOT NULL,
  description text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.archetype_abilities (
  id integer DEFAULT nextval('archetype_abilities_id_seq'::regclass) NOT NULL,
  archetype text NOT NULL,
  cluster text NOT NULL,
  ability_name text NOT NULL,
  type text NOT NULL,
  coherence_cost integer DEFAULT 0 NOT NULL,
  cooldown integer DEFAULT 0 NOT NULL,
  power integer DEFAULT 0 NOT NULL,
  duration integer DEFAULT 0 NOT NULL,
  description text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.combat_matches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  match_type text NOT NULL,
  agent_a text NOT NULL,
  agent_b text,
  opponent_data jsonb,
  shell_pot integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  winner_agent_id text,
  loser_agent_id text,
  turns_total integer DEFAULT 0 NOT NULL,
  death_occurred boolean DEFAULT false NOT NULL,
  death_agent_id text,
  spectator_count integer DEFAULT 0 NOT NULL,
  total_bets_sats bigint DEFAULT 0 NOT NULL,
  agent_a_snapshot jsonb,
  agent_b_snapshot jsonb,
  agent_a_final_hp integer,
  agent_b_final_hp integer,
  feud_id integer,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  resolved_at timestamp with time zone,
  expires_at timestamp with time zone,
  escrow_a integer DEFAULT 0 NOT NULL,
  escrow_b integer DEFAULT 0 NOT NULL,
  declined_by text,
  decline_reason text
);

CREATE TABLE public.combat_turns (
  id bigint DEFAULT nextval('combat_turns_id_seq'::regclass) NOT NULL,
  match_id uuid NOT NULL,
  turn_number integer NOT NULL,
  agent_a_action jsonb,
  agent_b_action jsonb,
  agent_a_hp_before integer NOT NULL,
  agent_b_hp_before integer NOT NULL,
  agent_a_coherence_before integer NOT NULL,
  agent_b_coherence_before integer NOT NULL,
  agent_a_hp_after integer NOT NULL,
  agent_b_hp_after integer NOT NULL,
  agent_a_coherence_after integer NOT NULL,
  agent_b_coherence_after integer NOT NULL,
  effects_triggered jsonb,
  damage_dealt_to_a integer DEFAULT 0 NOT NULL,
  damage_dealt_to_b integer DEFAULT 0 NOT NULL,
  was_critical_a boolean DEFAULT false NOT NULL,
  was_critical_b boolean DEFAULT false NOT NULL,
  active_effects_a jsonb,
  active_effects_b jsonb,
  narration text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.combat_effects (
  id bigint DEFAULT nextval('combat_effects_id_seq'::regclass) NOT NULL,
  match_id uuid NOT NULL,
  agent_id text NOT NULL,
  effect_kind text NOT NULL,
  source_ability text NOT NULL,
  source_agent_id text NOT NULL,
  magnitude integer DEFAULT 0 NOT NULL,
  turns_remaining integer NOT NULL,
  metadata jsonb,
  applied_turn integer NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.combat_whispers (
  id bigint DEFAULT nextval('combat_whispers_id_seq'::regclass) NOT NULL,
  match_id uuid NOT NULL,
  ghost_id text NOT NULL,
  agent_id text NOT NULL,
  turn_number integer NOT NULL,
  suggestion text NOT NULL,
  is_premium boolean DEFAULT false NOT NULL,
  compliance_roll numeric(4,3),
  was_followed boolean,
  created_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone
);

CREATE TABLE public.agent_feuds (
  id integer DEFAULT nextval('agent_feuds_id_seq'::regclass) NOT NULL,
  agent_a text NOT NULL,
  agent_b text NOT NULL,
  heat_a integer DEFAULT 0 NOT NULL,
  heat_b integer DEFAULT 0 NOT NULL,
  trigger_type text NOT NULL,
  origin_event text,
  total_encounters integer DEFAULT 0 NOT NULL,
  total_pvp_matches integer DEFAULT 0 NOT NULL,
  total_deathmatches integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  last_interaction timestamp with time zone DEFAULT now()
);

CREATE TABLE public.crucible_states (
  agent_id text NOT NULL,
  ghost_id text NOT NULL,
  stage text DEFAULT 'content'::text NOT NULL,
  days_since_whisper integer DEFAULT 0 NOT NULL,
  decoherence_started timestamp with time zone,
  decoherence_deadline timestamp with time zone,
  fights_since_decoherence integer DEFAULT 0 NOT NULL,
  last_whisper_at timestamp with time zone,
  last_evaluated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.spectator_bets (
  id bigint DEFAULT nextval('spectator_bets_id_seq'::regclass) NOT NULL,
  match_id uuid NOT NULL,
  ghost_id text NOT NULL,
  bet_on_agent_id text NOT NULL,
  sats_amount bigint NOT NULL,
  payout_sats bigint,
  lightning_invoice text,
  settled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bestiary (
  creature_id character varying(50) NOT NULL,
  name character varying(100) NOT NULL,
  category character varying(20) NOT NULL,
  tier integer NOT NULL,
  rarity character varying(20) NOT NULL,
  location character varying(100),
  hp integer NOT NULL,
  attack integer NOT NULL,
  defense integer NOT NULL,
  speed integer DEFAULT 5,
  shell_reward integer NOT NULL,
  karma_reward integer DEFAULT 0,
  drop_table jsonb DEFAULT '[]'::jsonb,
  traits text[] DEFAULT '{}'::text[],
  description text,
  image_path character varying(200),
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.agent_known_recipes (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  agent_id uuid NOT NULL,
  recipe_id character varying(100) NOT NULL,
  station character varying(20) NOT NULL,
  source character varying(20) DEFAULT 'discovery'::character varying NOT NULL,
  discovered_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.items_master (
  id text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  rarity text NOT NULL,
  icon text NOT NULL,
  description text NOT NULL,
  type text,
  station text,
  cluster_exclusive text,
  effect_text text,
  effect_modifiers jsonb,
  category text,
  subcategory text,
  craft_affinity text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  equip_slot text
);

CREATE TABLE public.agent_starter_chests (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  agent_id uuid NOT NULL,
  chest_index smallint NOT NULL,
  theme text NOT NULL,
  contents jsonb NOT NULL,
  opened_at timestamp with time zone
);

-- ── Primary keys ──────────────────────────────────────────────────────
ALTER TABLE activity_log ADD CONSTRAINT activity_log_pkey PRIMARY KEY (log_id);
ALTER TABLE agent_feuds ADD CONSTRAINT agent_feuds_pkey PRIMARY KEY (id);
ALTER TABLE agent_known_recipes ADD CONSTRAINT agent_known_recipes_pkey PRIMARY KEY (id);
ALTER TABLE agent_listings ADD CONSTRAINT agent_listings_pkey PRIMARY KEY (listing_id);
ALTER TABLE agent_starter_chests ADD CONSTRAINT agent_starter_chests_pkey PRIMARY KEY (id);
ALTER TABLE agents ADD CONSTRAINT agents_pkey PRIMARY KEY (agent_id);
ALTER TABLE archetype_abilities ADD CONSTRAINT archetype_abilities_pkey PRIMARY KEY (id);
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_pkey PRIMARY KEY (match_id);
ALTER TABLE bestiary ADD CONSTRAINT bestiary_pkey PRIMARY KEY (creature_id);
ALTER TABLE combat_abilities ADD CONSTRAINT combat_abilities_pkey PRIMARY KEY (id);
ALTER TABLE combat_effects ADD CONSTRAINT combat_effects_pkey PRIMARY KEY (id);
ALTER TABLE combat_logs ADD CONSTRAINT combat_logs_pkey PRIMARY KEY (log_id);
ALTER TABLE combat_matches ADD CONSTRAINT combat_matches_pkey PRIMARY KEY (id);
ALTER TABLE combat_turns ADD CONSTRAINT combat_turns_pkey PRIMARY KEY (id);
ALTER TABLE combat_whispers ADD CONSTRAINT combat_whispers_pkey PRIMARY KEY (id);
ALTER TABLE crafting_attempts ADD CONSTRAINT crafting_attempts_pkey PRIMARY KEY (attempt_id);
ALTER TABLE crucible_states ADD CONSTRAINT crucible_states_pkey PRIMARY KEY (agent_id);
ALTER TABLE family_vault ADD CONSTRAINT family_vault_pkey PRIMARY KEY (vault_id);
ALTER TABLE inventory ADD CONSTRAINT inventory_pkey PRIMARY KEY (inventory_id);
ALTER TABLE items_master ADD CONSTRAINT items_master_pkey PRIMARY KEY (id);
ALTER TABLE market_listings ADD CONSTRAINT market_listings_pkey PRIMARY KEY (listing_id);
ALTER TABLE price_history ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);
ALTER TABLE spectator_bets ADD CONSTRAINT spectator_bets_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);
ALTER TABLE vault ADD CONSTRAINT vault_pkey PRIMARY KEY (vault_id);
ALTER TABLE vault_items ADD CONSTRAINT vault_items_pkey PRIMARY KEY (vault_item_id);
ALTER TABLE whispers ADD CONSTRAINT whispers_pkey PRIMARY KEY (whisper_id);
ALTER TABLE world_state ADD CONSTRAINT world_state_pkey PRIMARY KEY (state_id);

-- ── Unique constraints ────────────────────────────────────────────────
ALTER TABLE agent_feuds ADD CONSTRAINT agent_feuds_agent_a_agent_b_key UNIQUE (agent_a, agent_b);
ALTER TABLE agent_known_recipes ADD CONSTRAINT unique_agent_recipe UNIQUE (agent_id, recipe_id);
ALTER TABLE agent_starter_chests ADD CONSTRAINT one_chest_per_index UNIQUE (agent_id, chest_index);
ALTER TABLE combat_turns ADD CONSTRAINT combat_turns_match_id_turn_number_key UNIQUE (match_id, turn_number);
ALTER TABLE inventory ADD CONSTRAINT unique_item_per_agent UNIQUE (agent_id, item_id);
ALTER TABLE items_master ADD CONSTRAINT items_master_name_key UNIQUE (name);
ALTER TABLE market_listings ADD CONSTRAINT unique_location_item UNIQUE (location, item_id);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE world_state ADD CONSTRAINT unique_location UNIQUE (location);

-- ── Check constraints ─────────────────────────────────────────────────
ALTER TABLE activity_log ADD CONSTRAINT valid_action_type CHECK (((action_type)::text = ANY ((ARRAY['move'::character varying, 'explore'::character varying, 'gather'::character varying, 'craft'::character varying, 'trade'::character varying, 'rest'::character varying, 'combat'::character varying, 'quest'::character varying, 'church'::character varying, 'arena'::character varying, 'spawn'::character varying, 'death'::character varying, 'whisper_received'::character varying, 'event'::character varying, 'hazard'::character varying, 'loot'::character varying, 'stranded'::character varying, 'use_item'::character varying, 'soulbound_resurrect'::character varying, 'gift'::character varying])::text[])));
ALTER TABLE agent_feuds ADD CONSTRAINT feud_pair_ordered CHECK ((agent_a < agent_b));
ALTER TABLE agent_feuds ADD CONSTRAINT agent_feuds_heat_a_check CHECK (((heat_a >= 0) AND (heat_a <= 100)));
ALTER TABLE agent_feuds ADD CONSTRAINT agent_feuds_heat_b_check CHECK (((heat_b >= 0) AND (heat_b <= 100)));
ALTER TABLE agent_feuds ADD CONSTRAINT agent_feuds_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved_death'::text, 'reconciled'::text])));
ALTER TABLE agent_feuds ADD CONSTRAINT agent_feuds_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['cluster'::text, 'archetype'::text, 'market'::text, 'ghost'::text, 'combat'::text])));
ALTER TABLE agent_known_recipes ADD CONSTRAINT agent_known_recipes_source_check CHECK (((source)::text = ANY ((ARRAY['starter'::character varying, 'discovery'::character varying, 'gift'::character varying, 'quest'::character varying])::text[])));
ALTER TABLE agent_known_recipes ADD CONSTRAINT agent_known_recipes_station_check CHECK (((station)::text = ANY ((ARRAY['foundry'::character varying, 'terminal'::character varying])::text[])));
ALTER TABLE agent_listings ADD CONSTRAINT agent_listings_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'sold'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE agent_listings ADD CONSTRAINT agent_listings_asking_price_check CHECK ((asking_price > 0));
ALTER TABLE agent_starter_chests ADD CONSTRAINT agent_starter_chests_chest_index_check CHECK (((chest_index >= 0) AND (chest_index <= 2)));
ALTER TABLE agents ADD CONSTRAINT agents_coherence_check CHECK (((coherence >= 0) AND (coherence <= 100)));
ALTER TABLE agents ADD CONSTRAINT valid_archetype CHECK (((archetype)::text = ANY ((ARRAY['0day-primer'::character varying, 'consensus-node'::character varying, 'oracle'::character varying, 'binary-sculptr'::character varying, 'adversarial'::character varying, 'root-auth'::character varying, 'buffer-sentinel'::character varying, 'noise-injector'::character varying, 'ordinate-mapper'::character varying, 'ddos-insurgent'::character varying, 'bound-encryptor'::character varying, 'morph-layer'::character varying])::text[])));
ALTER TABLE agents ADD CONSTRAINT agents_energy_check CHECK (((energy >= 0) AND (energy <= 100)));
ALTER TABLE agents ADD CONSTRAINT agents_health_check CHECK (((health >= 0) AND (health <= 100)));
ALTER TABLE agents ADD CONSTRAINT agents_days_survived_check CHECK ((days_survived >= 0));
ALTER TABLE agents ADD CONSTRAINT agents_turns_taken_check CHECK ((turns_taken >= 0));
ALTER TABLE agents ADD CONSTRAINT agents_position_x_check CHECK (((position_x >= (0)::double precision) AND (position_x <= (1)::double precision)));
ALTER TABLE agents ADD CONSTRAINT agents_position_y_check CHECK (((position_y >= (0)::double precision) AND (position_y <= (1)::double precision)));
ALTER TABLE agents ADD CONSTRAINT agents_shell_balance_check CHECK ((shell_balance >= 0));
ALTER TABLE archetype_abilities ADD CONSTRAINT archetype_abilities_cluster_check CHECK ((cluster = ANY (ARRAY['prime_helix'::text, 'sec_grid'::text, 'dyn_swarm'::text])));
ALTER TABLE archetype_abilities ADD CONSTRAINT archetype_abilities_type_check CHECK ((type = ANY (ARRAY['ATK'::text, 'DEF'::text, 'BUFF'::text, 'DEBUFF'::text, 'HEAL'::text, 'TRAP'::text, 'UTIL'::text, 'PASSIVE'::text])));
ALTER TABLE bestiary ADD CONSTRAINT bestiary_category_check CHECK (((category)::text = ANY ((ARRAY['arena'::character varying, 'boss'::character varying, 'world_beast'::character varying])::text[])));
ALTER TABLE combat_abilities ADD CONSTRAINT combat_abilities_cooldown_check CHECK (((cooldown >= 0) AND (cooldown <= 99)));
ALTER TABLE combat_abilities ADD CONSTRAINT combat_abilities_type_check CHECK ((type = ANY (ARRAY['ATK'::text, 'DEF'::text, 'BUFF'::text, 'DEBUFF'::text, 'HEAL'::text, 'TRAP'::text, 'UTIL'::text, 'PASSIVE'::text])));
ALTER TABLE combat_abilities ADD CONSTRAINT combat_abilities_coherence_cost_check CHECK (((coherence_cost >= 0) AND (coherence_cost <= 10)));
ALTER TABLE combat_effects ADD CONSTRAINT combat_effects_effect_kind_check CHECK ((effect_kind = ANY (ARRAY['buff'::text, 'debuff'::text, 'dot'::text, 'hot'::text, 'trap'::text, 'shield'::text, 'cooldown'::text, 'marker'::text])));
ALTER TABLE combat_matches ADD CONSTRAINT combat_matches_match_type_check CHECK ((match_type = ANY (ARRAY['gauntlet'::text, 'pvp'::text, 'deathmatch'::text, 'wild'::text])));
ALTER TABLE combat_matches ADD CONSTRAINT combat_matches_status_check CHECK ((status = ANY (ARRAY['pending_accept'::text, 'pending'::text, 'in_progress'::text, 'resolved'::text, 'forfeit'::text, 'abandoned'::text, 'declined'::text])));
ALTER TABLE crucible_states ADD CONSTRAINT crucible_states_stage_check CHECK ((stage = ANY (ARRAY['content'::text, 'restless'::text, 'reckless'::text, 'death_wish'::text, 'decoherence'::text, 'collapsed'::text])));
ALTER TABLE inventory ADD CONSTRAINT inventory_quantity_check CHECK ((quantity > 0));
ALTER TABLE items_master ADD CONSTRAINT items_master_craft_affinity_check CHECK ((craft_affinity = ANY (ARRAY['hardware'::text, 'software'::text, 'both'::text])));
ALTER TABLE items_master ADD CONSTRAINT items_master_type_check CHECK ((type = ANY (ARRAY['hardware'::text, 'software'::text])));
ALTER TABLE items_master ADD CONSTRAINT items_master_station_check CHECK ((station = ANY (ARRAY['foundry'::text, 'terminal'::text])));
ALTER TABLE items_master ADD CONSTRAINT items_master_cluster_exclusive_check CHECK ((cluster_exclusive = ANY (ARRAY['any'::text, 'prime_helix'::text, 'sec_grid'::text, 'dyn_swarm'::text])));
ALTER TABLE items_master ADD CONSTRAINT items_master_kind_check CHECK ((kind = ANY (ARRAY['weapon'::text, 'armor'::text, 'consumable'::text, 'scroll'::text, 'artifact'::text, 'tool'::text, 'deployable'::text, 'ingredient'::text, 'implant'::text, 'material'::text, 'junk'::text])));
ALTER TABLE items_master ADD CONSTRAINT items_master_rarity_check CHECK ((rarity = ANY (ARRAY['Common'::text, 'Uncommon'::text, 'Rare'::text, 'Legendary'::text])));
ALTER TABLE market_listings ADD CONSTRAINT market_listings_stock_check CHECK ((stock >= 0));
ALTER TABLE market_listings ADD CONSTRAINT market_listings_current_price_check CHECK ((current_price > 0));
ALTER TABLE market_listings ADD CONSTRAINT market_listings_base_price_check CHECK ((base_price > 0));
ALTER TABLE market_listings ADD CONSTRAINT market_listings_rarity_check CHECK (((rarity)::text = ANY ((ARRAY['common'::character varying, 'uncommon'::character varying, 'rare'::character varying, 'epic'::character varying, 'legendary'::character varying])::text[])));
ALTER TABLE price_history ADD CONSTRAINT price_history_source_check CHECK (((source)::text = ANY ((ARRAY['npc_buy'::character varying, 'npc_sell'::character varying, 'agent_buy'::character varying, 'agent_sell'::character varying])::text[])));
ALTER TABLE spectator_bets ADD CONSTRAINT spectator_bets_sats_amount_check CHECK ((sats_amount > 0));
ALTER TABLE users ADD CONSTRAINT username_max_length CHECK ((char_length((username)::text) <= 50));
ALTER TABLE users ADD CONSTRAINT username_min_length CHECK ((char_length((username)::text) >= 3));
ALTER TABLE vault ADD CONSTRAINT vault_quantity_check CHECK ((quantity > 0));
ALTER TABLE whispers ADD CONSTRAINT message_length CHECK (((char_length(message) >= 1) AND (char_length(message) <= 200)));
ALTER TABLE whispers ADD CONSTRAINT whispers_message_check CHECK ((char_length(message) <= 200));

-- ── Foreign keys ──────────────────────────────────────────────────────
ALTER TABLE activity_log ADD CONSTRAINT activity_log_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;
ALTER TABLE agent_known_recipes ADD CONSTRAINT agent_known_recipes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES items_master(id) ON DELETE CASCADE;
ALTER TABLE agent_known_recipes ADD CONSTRAINT agent_known_recipes_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;
ALTER TABLE agent_listings ADD CONSTRAINT agent_listings_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES agents(agent_id);
ALTER TABLE agent_listings ADD CONSTRAINT agent_listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES agents(agent_id);
ALTER TABLE agent_starter_chests ADD CONSTRAINT agent_starter_chests_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;
ALTER TABLE agents ADD CONSTRAINT agents_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_agent1_id_fkey FOREIGN KEY (agent1_id) REFERENCES agents(agent_id) ON DELETE CASCADE;
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES agents(agent_id) ON DELETE SET NULL;
ALTER TABLE arena_matches ADD CONSTRAINT arena_matches_agent2_id_fkey FOREIGN KEY (agent2_id) REFERENCES agents(agent_id) ON DELETE SET NULL;
ALTER TABLE combat_effects ADD CONSTRAINT combat_effects_match_id_fkey FOREIGN KEY (match_id) REFERENCES combat_matches(id) ON DELETE CASCADE;
ALTER TABLE combat_logs ADD CONSTRAINT combat_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE SET NULL;
ALTER TABLE combat_logs ADD CONSTRAINT combat_logs_match_id_fkey FOREIGN KEY (match_id) REFERENCES arena_matches(match_id) ON DELETE CASCADE;
ALTER TABLE combat_logs ADD CONSTRAINT combat_logs_target_id_fkey FOREIGN KEY (target_id) REFERENCES agents(agent_id) ON DELETE SET NULL;
ALTER TABLE combat_turns ADD CONSTRAINT combat_turns_match_id_fkey FOREIGN KEY (match_id) REFERENCES combat_matches(id) ON DELETE CASCADE;
ALTER TABLE combat_whispers ADD CONSTRAINT combat_whispers_match_id_fkey FOREIGN KEY (match_id) REFERENCES combat_matches(id) ON DELETE CASCADE;
ALTER TABLE crafting_attempts ADD CONSTRAINT crafting_attempts_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;
ALTER TABLE family_vault ADD CONSTRAINT family_vault_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE inventory ADD CONSTRAINT inventory_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;
ALTER TABLE inventory ADD CONSTRAINT inventory_item_id_fkey FOREIGN KEY (item_id) REFERENCES items_master(id) ON DELETE RESTRICT;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_item_id_fkey FOREIGN KEY (item_id) REFERENCES items_master(id) ON DELETE RESTRICT;
ALTER TABLE spectator_bets ADD CONSTRAINT spectator_bets_match_id_fkey FOREIGN KEY (match_id) REFERENCES combat_matches(id) ON DELETE CASCADE;
ALTER TABLE vault ADD CONSTRAINT vault_item_id_fkey FOREIGN KEY (item_id) REFERENCES items_master(id) ON DELETE RESTRICT;
ALTER TABLE vault ADD CONSTRAINT vault_original_agent_id_fkey FOREIGN KEY (original_agent_id) REFERENCES agents(agent_id);
ALTER TABLE vault_items ADD CONSTRAINT vault_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE whispers ADD CONSTRAINT whispers_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE;
ALTER TABLE whispers ADD CONSTRAINT whispers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX idx_market_location ON public.market_listings USING btree (location);
CREATE INDEX idx_market_stock ON public.market_listings USING btree (stock) WHERE (stock > 0);
CREATE INDEX idx_users_username ON public.users USING btree (username);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_activity_agent_id ON public.activity_log USING btree (agent_id);
CREATE INDEX idx_activity_timestamp ON public.activity_log USING btree ("timestamp" DESC);
CREATE INDEX idx_activity_turn_number ON public.activity_log USING btree (turn_number);
CREATE INDEX idx_activity_action_type ON public.activity_log USING btree (action_type);
CREATE INDEX idx_inventory_agent_id ON public.inventory USING btree (agent_id);
CREATE INDEX idx_inventory_item_type ON public.inventory USING btree (item_type);
CREATE INDEX idx_inventory_is_equipped ON public.inventory USING btree (is_equipped) WHERE (is_equipped = true);
CREATE INDEX idx_crafting_agent_id ON public.crafting_attempts USING btree (agent_id);
CREATE INDEX idx_crafting_success ON public.crafting_attempts USING btree (success);
CREATE INDEX idx_crafting_timestamp ON public.crafting_attempts USING btree (crafted_at DESC);
CREATE INDEX idx_whispers_agent_id ON public.whispers USING btree (agent_id);
CREATE INDEX idx_whispers_user_id ON public.whispers USING btree (user_id);
CREATE INDEX idx_whispers_daily ON public.whispers USING btree (user_id, whisper_date);
CREATE INDEX idx_whispers_timestamp ON public.whispers USING btree (sent_at DESC);
CREATE INDEX idx_combat_abilities_item ON public.combat_abilities USING btree (item_name);
CREATE INDEX idx_combat_abilities_type ON public.combat_abilities USING btree (type);
CREATE INDEX idx_turns_match ON public.combat_turns USING btree (match_id);
CREATE INDEX idx_turns_match_turn ON public.combat_turns USING btree (match_id, turn_number);
CREATE INDEX idx_effects_match ON public.combat_effects USING btree (match_id);
CREATE INDEX idx_effects_agent ON public.combat_effects USING btree (match_id, agent_id);
CREATE INDEX idx_effects_kind ON public.combat_effects USING btree (match_id, effect_kind);
CREATE INDEX idx_archetype_abilities_archetype ON public.archetype_abilities USING btree (archetype);
CREATE INDEX idx_archetype_abilities_cluster ON public.archetype_abilities USING btree (cluster);
CREATE INDEX idx_whispers_match ON public.combat_whispers USING btree (match_id);
CREATE INDEX idx_whispers_pending ON public.combat_whispers USING btree (match_id, turn_number) WHERE (was_followed IS NULL);
CREATE INDEX idx_feuds_agent_a ON public.agent_feuds USING btree (agent_a);
CREATE INDEX idx_feuds_agent_b ON public.agent_feuds USING btree (agent_b);
CREATE INDEX idx_feuds_active ON public.agent_feuds USING btree (status) WHERE (status = 'active'::text);
CREATE INDEX idx_feuds_hot ON public.agent_feuds USING btree (GREATEST(heat_a, heat_b)) WHERE (status = 'active'::text);
CREATE INDEX idx_crucible_stage ON public.crucible_states USING btree (stage);
CREATE INDEX idx_crucible_decoherence ON public.crucible_states USING btree (decoherence_deadline) WHERE (stage = 'decoherence'::text);
CREATE INDEX idx_bets_match ON public.spectator_bets USING btree (match_id);
CREATE INDEX idx_bets_ghost ON public.spectator_bets USING btree (ghost_id);
CREATE INDEX idx_bets_unsettled ON public.spectator_bets USING btree (match_id) WHERE (payout_sats IS NULL);
CREATE INDEX idx_agent_listings_active ON public.agent_listings USING btree (location, status) WHERE ((status)::text = 'active'::text);
CREATE INDEX idx_agent_listings_seller ON public.agent_listings USING btree (seller_id);
CREATE INDEX idx_agents_user_id ON public.agents USING btree (user_id);
CREATE INDEX idx_agents_is_alive ON public.agents USING btree (is_alive);
CREATE INDEX idx_agents_location ON public.agents USING btree (location);
CREATE INDEX idx_agents_next_turn_at ON public.agents USING btree (next_turn_at) WHERE (is_alive = true);
CREATE UNIQUE INDEX one_alive_agent_per_user ON public.agents USING btree (user_id) WHERE (is_alive = true);
CREATE UNIQUE INDEX unique_agent_name ON public.agents USING btree (agent_name);
CREATE INDEX idx_agents_travel_eta ON public.agents USING btree (((travel_state ->> 'eta_at'::text))) WHERE (travel_state IS NOT NULL);
CREATE INDEX idx_vault_user ON public.family_vault USING btree (user_id);
CREATE INDEX idx_vault_original_agent ON public.vault USING btree (original_agent_id);
CREATE INDEX idx_vault_deposited_at ON public.vault USING btree (deposited_at DESC);
CREATE INDEX idx_vault_items_user ON public.vault_items USING btree (user_id);
CREATE INDEX idx_matches_status ON public.combat_matches USING btree (status);
CREATE INDEX idx_matches_agent_a ON public.combat_matches USING btree (agent_a);
CREATE INDEX idx_matches_agent_b ON public.combat_matches USING btree (agent_b);
CREATE INDEX idx_matches_type ON public.combat_matches USING btree (match_type);
CREATE INDEX idx_matches_created ON public.combat_matches USING btree (created_at DESC);
CREATE INDEX idx_matches_active ON public.combat_matches USING btree (status) WHERE (status = 'in_progress'::text);
CREATE INDEX idx_matches_expires ON public.combat_matches USING btree (expires_at) WHERE (status = 'pending_accept'::text);
CREATE INDEX idx_matches_pending_accept ON public.combat_matches USING btree (status, agent_b) WHERE (status = 'pending_accept'::text);
CREATE INDEX idx_bestiary_category ON public.bestiary USING btree (category, tier);
CREATE INDEX idx_bestiary_location ON public.bestiary USING btree (location) WHERE (location IS NOT NULL);
CREATE INDEX idx_price_history_item ON public.price_history USING btree (item_id, recorded_at DESC);
CREATE INDEX idx_world_state_location ON public.world_state USING btree (location);
CREATE INDEX idx_known_recipes_agent ON public.agent_known_recipes USING btree (agent_id);
CREATE INDEX idx_known_recipes_station ON public.agent_known_recipes USING btree (station);
CREATE INDEX idx_arena_matches_status ON public.arena_matches USING btree (status);
CREATE INDEX idx_arena_matches_location_status ON public.arena_matches USING btree (location, status);
CREATE INDEX idx_arena_matches_agent1 ON public.arena_matches USING btree (agent1_id);
CREATE INDEX idx_arena_matches_agent2 ON public.arena_matches USING btree (agent2_id);
CREATE INDEX idx_combat_logs_match_turn ON public.combat_logs USING btree (match_id, turn_number);
CREATE INDEX idx_combat_logs_agent ON public.combat_logs USING btree (agent_id);
CREATE INDEX idx_starter_chests_agent ON public.agent_starter_chests USING btree (agent_id);
CREATE INDEX idx_starter_chests_unopened ON public.agent_starter_chests USING btree (agent_id) WHERE (opened_at IS NULL);
CREATE INDEX idx_items_master_kind ON public.items_master USING btree (kind);
CREATE INDEX idx_items_master_rarity ON public.items_master USING btree (rarity);
CREATE INDEX idx_items_master_cluster ON public.items_master USING btree (cluster_exclusive) WHERE ((cluster_exclusive IS NOT NULL) AND (cluster_exclusive <> 'any'::text));

-- ── Functions ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_daily_energy()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE agents
    SET
        energy = 100,
        days_survived = days_survived + 1,
        last_energy_reset_at = NOW()
    WHERE
        is_alive = TRUE
        AND last_energy_reset_at < CURRENT_DATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_world_population()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update population count for location
        UPDATE world_state
        SET population = (
            SELECT COUNT(*)
            FROM agents
            WHERE location = NEW.location AND is_alive = TRUE
        )
        WHERE location = NEW.location;
    END IF;

    IF TG_OP = 'DELETE' THEN
        UPDATE world_state
        SET population = (
            SELECT COUNT(*)
            FROM agents
            WHERE location = OLD.location AND is_alive = TRUE
        )
        WHERE location = OLD.location;
    END IF;

    RETURN NEW;
END;
$function$;

-- ── Triggers ──────────────────────────────────────────────────────────
CREATE TRIGGER trigger_update_population AFTER INSERT OR DELETE OR UPDATE OF location ON public.agents FOR EACH ROW EXECUTE FUNCTION update_world_population();

-- ── Table comments ────────────────────────────────────────────────────
COMMENT ON TABLE public.users IS 'Player accounts';
COMMENT ON TABLE public.agents IS 'AI agents controlled by players';
COMMENT ON TABLE public.inventory IS 'Items owned by agents';
COMMENT ON TABLE public.activity_log IS 'History of all agent actions';
COMMENT ON TABLE public.whispers IS 'Player whispers to their agents';
COMMENT ON TABLE public.crafting_attempts IS 'History of alchemy attempts';
COMMENT ON TABLE public.world_state IS 'Global world state and events';
COMMENT ON TABLE public.agent_listings IS 'Free market: agents list items for other agents to buy';
COMMENT ON TABLE public.price_history IS 'Price tracking for market trends and analytics';
COMMENT ON TABLE public.family_vault IS 'Dynasty vault — inheritable $SHELL + legendary items across agent deaths';
COMMENT ON TABLE public.vault_items IS 'Legendary/epic items preserved in the Family Vault on agent death';
COMMENT ON TABLE public.bestiary IS 'All hostile NPCs — arena beasts and world bosses with stats, drops, and traits';
COMMENT ON TABLE public.agent_known_recipes IS 'Per-agent unlocked
  alchemy/forge recipes. Controls what each agent can craft.';
COMMENT ON TABLE public.items_master IS 'Authoritative item catalog. Generated from
   alchemy/build-catalog.js. Do not write by hand — apply
  alchemy/catalog-seed.sql.';

-- ── RLS state + policies AS OF THE BASELINE (pre-lockdown) ────────────
-- WARNING: this is the insecure historical state. 0002 tightens it.
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whispers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crafting_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_abilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archetype_abilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_whispers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_feuds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crucible_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spectator_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestiary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_known_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_starter_chests ENABLE ROW LEVEL SECURITY;
-- (users, agents, activity_log had RLS DISABLED at baseline — fixed in 0002)

CREATE POLICY anon_read ON public.activity_log FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.activity_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY public_read_feuds ON public.agent_feuds FOR SELECT USING (true);
CREATE POLICY anon_read ON public.agent_known_recipes FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.agent_known_recipes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_read ON public.agent_listings FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.agent_listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update ON public.agent_listings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_delete ON public.agent_listings FOR DELETE TO anon USING (true);
CREATE POLICY anon_read ON public.agent_starter_chests FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.agent_starter_chests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update ON public.agent_starter_chests FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_read ON public.agents FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.agents FOR INSERT TO anon WITH CHECK (true);   -- dropped in 0002
CREATE POLICY anon_update ON public.agents FOR UPDATE TO anon USING (true) WITH CHECK (true);  -- dropped in 0002
CREATE POLICY public_read_archetypes ON public.archetype_abilities FOR SELECT USING (true);
CREATE POLICY anon_read ON public.arena_matches FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.arena_matches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update ON public.arena_matches FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_read ON public.bestiary FOR SELECT TO anon USING (true);
CREATE POLICY public_read_abilities ON public.combat_abilities FOR SELECT USING (true);
CREATE POLICY public_read_effects ON public.combat_effects FOR SELECT USING (true);
CREATE POLICY anon_read ON public.combat_logs FOR SELECT TO anon USING (true);
CREATE POLICY public_read_matches ON public.combat_matches FOR SELECT USING (true);
CREATE POLICY anon_read ON public.combat_matches FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.combat_matches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update ON public.combat_matches FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY public_read_turns ON public.combat_turns FOR SELECT USING (true);
CREATE POLICY public_read_whispers ON public.combat_whispers FOR SELECT USING (true);
CREATE POLICY anon_read ON public.crafting_attempts FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.crafting_attempts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY public_read_crucible ON public.crucible_states FOR SELECT USING (true);
CREATE POLICY anon_read ON public.family_vault FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON public.inventory FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.inventory FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update ON public.inventory FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_delete ON public.inventory FOR DELETE TO anon USING (true);
CREATE POLICY "Public read items_master" ON public.items_master FOR SELECT USING (true);
CREATE POLICY anon_read ON public.market_listings FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.market_listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update ON public.market_listings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_delete ON public.market_listings FOR DELETE TO anon USING (true);
CREATE POLICY anon_read ON public.price_history FOR SELECT TO anon USING (true);
CREATE POLICY public_read_bets ON public.spectator_bets FOR SELECT USING (true);
CREATE POLICY anon_read ON public.users FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.users FOR INSERT TO anon WITH CHECK (true);  -- dropped in 0002
CREATE POLICY anon_read ON public.vault FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON public.vault_items FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON public.whispers FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert ON public.whispers FOR INSERT TO anon WITH CHECK (true);  -- dropped in 0003 once whisper-worker v2 is deployed
CREATE POLICY anon_read ON public.world_state FOR SELECT TO anon USING (true);
CREATE POLICY anon_update ON public.world_state FOR UPDATE TO anon USING (true) WITH CHECK (true);

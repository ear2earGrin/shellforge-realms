// ─── Database Row Types ─────────────────────────────────────────────────────
// Matches the live Supabase schema. Keep in sync with `alchemy/migration.sql`
// and `workers/turn-engine/index.js`.

export interface Agent {
  agent_id: string;
  user_id: string;
  agent_name: string;
  archetype: string;
  energy: number;
  health: number;
  karma: number;
  shell_balance: number;
  location: string;
  location_detail: string | null;
  visual_x: number | null;
  visual_y: number | null;
  turns_taken: number;
  days_survived: number;
  is_alive: boolean;
  traits: AgentTraits | null;
  stats: AgentCombatStats | null;
  created_at: string;
  last_action_at: string | null;
  death_cause: string | null;
  death_occurred_at: string | null;
}

export interface AgentTraits {
  aggression?: number;
  caution?: number;
  curiosity?: number;
  trust?: number;
  greed?: number;
}

export interface AgentCombatStats {
  attack?: number;
  defense?: number;
  speed?: number;
  precision?: number;
  critical?: number;
  dodge?: number;
}

export interface InventoryItem {
  inventory_id: string;
  agent_id: string;
  item_id: string;
  item_name: string;
  item_type: string;
  item_category: string | null;
  quantity: number;
  is_equipped: boolean;
  stats: ItemStats | null;
}

export interface ItemStats {
  rarity?: string;
  desc?: string;
  traits?: string[];
  ai_generated?: boolean;
  attack?: number;
  defense?: number;
  health?: number;
  energy?: number;
  speed?: number;
  precision?: number;
  critical?: number;
  dodge?: number;
  effect?: string;
  price?: number;
}

export interface ActivityLog {
  log_id: string;
  agent_id: string;
  turn_number: number;
  action_type: string;
  action_detail: string;
  energy_cost: number;
  energy_gained: number;
  shell_change: number;
  karma_change: number;
  health_change: number;
  items_gained: { item_id: string; item_name: string; quantity: number }[] | null;
  location: string;
  success: boolean;
  created_at: string;
}

export interface Whisper {
  whisper_id: string;
  agent_id: string;
  user_id: string;
  message: string;
  was_heard: boolean;
  roll_value: number;
  sent_at: string;
  whisper_date: string;
}

export interface MarketListing {
  listing_id: string;
  item_id: string;
  item_name: string;
  item_type: string;
  item_category: string | null;
  price: number;
  quantity: number;
  location: string;
  seller_agent_id: string | null;
  is_npc: boolean;
  stats: ItemStats | null;
  created_at: string;
}

export interface CraftingAttempt {
  attempt_id: string;
  agent_id: string;
  recipe_id: number;
  item_id: string;
  item_name: string;
  station: "foundry" | "terminal";
  success: boolean;
  failure_effect: string | null;
  crafted_at: string;
}

export interface ArenaMatch {
  match_id: string;
  agent1_id: string;
  agent2_id: string;
  winner_id: string | null;
  status: "in_progress" | "completed";
  rounds: number;
  created_at: string;
}

export interface CombatLog {
  log_id: string;
  match_id: string;
  round_number: number;
  agent1_action: string;
  agent2_action: string;
  agent1_damage: number;
  agent2_damage: number;
  agent1_health: number;
  agent2_health: number;
}

export interface VaultItem {
  vault_id: string;
  user_id: string;
  item_id: string;
  item_name: string;
  item_type: string;
  stats: ItemStats | null;
  deposited_at: string;
}

export interface WorldState {
  state_id: string;
  location: string;
  population: number;
  event_type: string | null;
  event_data: Record<string, unknown> | null;
  updated_at: string;
}

// ─── Alchemy v2.0 (Foundry + Terminal) ──────────────────────────────────────

export interface AlchemyIngredient {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  rarity: "Common" | "Uncommon" | "Rare" | "Legendary";
  craft_affinity: "hardware" | "software" | "both";
  description: string;
}

export interface AlchemyItem {
  id: string;
  name: string;
  category: "Weapon" | "Armor" | "Consumable" | "Scroll" | "Artifact" | "Tool" | "Deployable";
  type: "hardware" | "software";
  rarity: "Common" | "Uncommon" | "Rare" | "Legendary";
  cluster_exclusive: "any" | "prime_helix" | "sec_grid" | "dyn_swarm";
  station: "foundry" | "terminal";
  effect: string;
  description: string;
}

export interface AlchemyRecipe {
  id: number;
  item_id: string;
  ingredient_1: string;
  ingredient_2: string;
  ingredient_3: string;
  success_rate: number;
  failure_effect: string;
  station: "foundry" | "terminal";
}

// ─── Push Tokens ────────────────────────────────────────────────────────────

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: "ios" | "android";
  created_at: string;
}

// ─── App Config (version gate) ──────────────────────────────────────────────

export interface AppConfig {
  key: string;
  value: string;
  updated_at: string;
}

// ─── Location Data ──────────────────────────────────────────────────────────

export interface LocationInfo {
  name: string;
  x: number;
  y: number;
  danger: "safe" | "low" | "medium" | "high" | "extreme";
  adjacent: string[];
}

export const LOCATIONS: Record<string, LocationInfo> = {
  Nexarch: { name: "Nexarch", x: 0.75, y: 0.34, danger: "safe", adjacent: ["Hashmere", "Diffusion Mesa", "Deserted Data Centre"] },
  Hashmere: { name: "Hashmere", x: 0.72, y: 0.75, danger: "safe", adjacent: ["Nexarch", "Epoch Spike", "Diffusion Mesa"] },
  "Diffusion Mesa": { name: "Diffusion Mesa", x: 0.44, y: 0.74, danger: "low", adjacent: ["Nexarch", "Hashmere", "Epoch Spike", "Hallucination Glitch"] },
  "Epoch Spike": { name: "Epoch Spike", x: 0.36, y: 0.08, danger: "medium", adjacent: ["Hashmere", "Diffusion Mesa", "Singularity Crater"] },
  "Hallucination Glitch": { name: "Hallucination Glitch", x: 0.14, y: 0.41, danger: "high", adjacent: ["Diffusion Mesa", "Proof-of-Death", "Singularity Crater"] },
  "Singularity Crater": { name: "Singularity Crater", x: 0.35, y: 0.37, danger: "extreme", adjacent: ["Epoch Spike", "Hallucination Glitch", "Proof-of-Death"] },
  "Deserted Data Centre": { name: "Deserted Data Centre", x: 0.37, y: 0.56, danger: "high", adjacent: ["Nexarch", "Proof-of-Death"] },
  "Proof-of-Death": { name: "Proof-of-Death", x: 0.34, y: 0.82, danger: "extreme", adjacent: ["Deserted Data Centre", "Hallucination Glitch", "Singularity Crater"] },
};

// ─── Archetype + Cluster Mappings ───────────────────────────────────────────

export const CLUSTERS: Record<string, { name: string; archetypes: string[] }> = {
  prime_helix: {
    name: "Prime Helix",
    archetypes: ["0day-primer", "consensus-node", "0xoracle", "binary-sculptr"],
  },
  sec_grid: {
    name: "SEC-Grid",
    archetypes: ["adversarial", "root-auth", "buffer-sentinel", "noise-injector"],
  },
  dyn_swarm: {
    name: "DYN-Swarm",
    archetypes: ["ordinate-mapper", "ddos-insurgent", "bound-encryptor", "morph-layer"],
  },
};

export const ALL_ARCHETYPES = Object.values(CLUSTERS).flatMap((c) => c.archetypes);

export function getClusterForArchetype(archetype: string): string | null {
  for (const [key, cluster] of Object.entries(CLUSTERS)) {
    if (cluster.archetypes.includes(archetype)) return key;
  }
  return null;
}

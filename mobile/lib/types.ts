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
  position_x: number;
  position_y: number;
  turns_taken: number;
  days_survived: number;
  is_alive: boolean;
  created_at: string;
}

export interface InventoryItem {
  inventory_id: string;
  agent_id: string;
  item_id: string;
  item_name: string;
  item_type: string;
  quantity: number;
  is_equipped: boolean;
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

export interface WorldState {
  state_id: string;
  location: string;
  population: number;
  event_type: string | null;
  event_data: Record<string, unknown> | null;
  updated_at: string;
}

// Location coordinate data for the map
export const LOCATIONS: Record<
  string,
  { name: string; x: number; y: number; danger: string }
> = {
  nexarch: { name: "Nexarch", x: 10500, y: 9000, danger: "safe" },
  hashmere: { name: "Hashmere", x: 8500, y: 8000, danger: "safe" },
  "diffusion-mesa": {
    name: "Diffusion Mesa",
    x: 12000,
    y: 7500,
    danger: "moderate",
  },
  "epoch-spike": {
    name: "Epoch Spike",
    x: 13500,
    y: 10000,
    danger: "dangerous",
  },
  "hallucination-glitch": {
    name: "Hallucination Glitch",
    x: 7000,
    y: 11000,
    danger: "extreme",
  },
  "singularity-crater": {
    name: "Singularity Crater",
    x: 11000,
    y: 12500,
    danger: "extreme",
  },
  "deserted-data-centre": {
    name: "Deserted Data Centre",
    x: 9000,
    y: 13000,
    danger: "dangerous",
  },
  "proof-of-death": {
    name: "Proof-of-Death",
    x: 14000,
    y: 13500,
    danger: "lethal",
  },
};

// ═══════════════════════════════════════════════════════════════
//  COMBAT ENGINE TYPES (mirrors Supabase combat_* tables)
// ═══════════════════════════════════════════════════════════════

export type CombatMatchType = "gauntlet" | "pvp" | "deathmatch" | "wild";
export type CombatMatchStatus =
  | "pending"
  | "in_progress"
  | "resolved"
  | "forfeit"
  | "abandoned";
export type AbilityType =
  | "ATK"
  | "DEF"
  | "BUFF"
  | "DEBUFF"
  | "HEAL"
  | "TRAP"
  | "UTIL"
  | "PASSIVE";
export type EffectKind =
  | "buff"
  | "debuff"
  | "dot"
  | "hot"
  | "trap"
  | "shield"
  | "cooldown"
  | "marker";
export type FeudHeatLevel =
  | "cold"
  | "tension"
  | "rivals"
  | "enemies"
  | "sworn_enemies"
  | "blood_feud";
export type CrucibleStage =
  | "content"
  | "restless"
  | "reckless"
  | "death_wish"
  | "decoherence"
  | "collapsed";

export interface CombatAbility {
  id: number;
  item_name: string;
  item_id: string | null;
  ability_name: string;
  type: AbilityType;
  coherence_cost: number;
  cooldown: number;
  power: number;
  duration: number;
  one_time: boolean;
  description: string;
}

export interface ArchetypeAbility {
  id: number;
  archetype: string;
  cluster: "prime_helix" | "sec_grid" | "dyn_swarm";
  ability_name: string;
  type: AbilityType;
  coherence_cost: number;
  cooldown: number;
  power: number;
  duration: number;
  description: string;
}

export interface CombatMatch {
  id: string;
  match_type: CombatMatchType;
  agent_a: string;
  agent_b: string | null;
  opponent_data: Record<string, unknown> | null;
  shell_pot: number;
  status: CombatMatchStatus;
  winner_agent_id: string | null;
  loser_agent_id: string | null;
  turns_total: number;
  death_occurred: boolean;
  death_agent_id: string | null;
  spectator_count: number;
  total_bets_sats: number;
  agent_a_snapshot: AgentSnapshot | null;
  agent_b_snapshot: AgentSnapshot | null;
  agent_a_final_hp: number | null;
  agent_b_final_hp: number | null;
  feud_id: number | null;
  created_at: string;
  started_at: string | null;
  resolved_at: string | null;
}

export interface AgentSnapshot {
  agent_id: string;
  archetype: string;
  cluster: string;
  deck: HandCard[];
  equipped: { name: string; type: string }[];
  defender_type: "hardware" | "software";
  hp: number;
  hp_max: number;
  coherence: number;
  coherence_max: number;
  armor: number;
  firewall: number;
}

export interface HandCard {
  source: "archetype" | "item" | "basic" | "npc";
  item_name?: string;
  item_id?: string;
  ability_name: string;
  type: AbilityType;
  coherence_cost: number;
  cooldown: number;
  power: number;
  duration: number;
  one_time: boolean;
  description: string;
}

export interface CombatTurn {
  id: number;
  match_id: string;
  turn_number: number;
  agent_a_action: TurnAction | null;
  agent_b_action: TurnAction | null;
  agent_a_hp_before: number;
  agent_b_hp_before: number;
  agent_a_coherence_before: number;
  agent_b_coherence_before: number;
  agent_a_hp_after: number;
  agent_b_hp_after: number;
  agent_a_coherence_after: number;
  agent_b_coherence_after: number;
  effects_triggered: EffectEvent[];
  damage_dealt_to_a: number;
  damage_dealt_to_b: number;
  was_critical_a: boolean;
  was_critical_b: boolean;
  active_effects_a: ActiveEffectSummary[];
  active_effects_b: ActiveEffectSummary[];
  narration: string | null;
  created_at: string;
}

export interface TurnAction {
  ability_id: number | null;
  ability_name: string;
  source: "haiku" | "fallback" | "whisper" | "stunned" | "none";
  whisper_followed: boolean;
}

export interface EffectEvent {
  source: string;
  target: string;
  type: "attack" | "heal" | "shield" | "buff" | "debuff" | "miss" | "trap";
  ability?: string;
  magnitude?: number;
  crit?: boolean;
  message: string;
}

export interface ActiveEffectSummary {
  kind: EffectKind;
  source: string;
  magnitude: number;
  turns_left: number;
}

export interface CombatWhisper {
  id: number;
  match_id: string;
  ghost_id: string;
  agent_id: string;
  turn_number: number;
  suggestion: string;
  is_premium: boolean;
  compliance_roll: number | null;
  was_followed: boolean | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AgentFeud {
  id: number;
  agent_a: string;
  agent_b: string;
  heat_a: number;
  heat_b: number;
  trigger_type: "cluster" | "archetype" | "market" | "ghost" | "combat";
  origin_event: string | null;
  total_encounters: number;
  total_pvp_matches: number;
  total_deathmatches: number;
  status: "active" | "resolved_death" | "reconciled";
  created_at: string;
  last_interaction: string;
}

export interface HotFeud extends AgentFeud {
  max_heat: number;
  heat_level: FeudHeatLevel;
}

export interface CrucibleState {
  agent_id: string;
  ghost_id: string;
  stage: CrucibleStage;
  days_since_whisper: number;
  decoherence_started: string | null;
  decoherence_deadline: string | null;
  fights_since_decoherence: number;
  last_whisper_at: string | null;
  last_evaluated_at: string;
  created_at: string;
}

export interface SpectatorBet {
  id: number;
  match_id: string;
  ghost_id: string;
  bet_on_agent_id: string;
  sats_amount: number;
  payout_sats: number | null;
  lightning_invoice: string | null;
  settled_at: string | null;
  created_at: string;
}

// Push notification payload (received via expo-notifications)
export interface CombatPushPayload {
  type:
    | "match_won"
    | "match_lost"
    | "death"
    | "deathmatch_win"
    | "deathmatch_challenged"
    | "blood_feud_initiated"
    | "crucible_collapse"
    | "crucible_warning"
    | "legendary_loot";
  agent_id: string;
  ghost_id: string;
  match_id?: string;
  feud_id?: number;
  challenger_agent_id?: string;
  challenger_username?: string;
  enemy_agent_id?: string;
  heat_level?: FeudHeatLevel;
  deadline?: string;
  narration?: string;
  item_name?: string;
}

// Archetype cluster mappings
export const CLUSTERS: Record<
  string,
  { name: string; archetypes: string[] }
> = {
  "prime-helix": {
    name: "Prime Helix",
    archetypes: [
      "0day-primer",
      "consensus-node",
      "oracle",
      "binary-sculptr",
    ],
  },
  "sec-grid": {
    name: "SEC-Grid",
    archetypes: [
      "adversarial",
      "root-auth",
      "buffer-sentinel",
      "noise-injector",
    ],
  },
  "dyn-swarm": {
    name: "DYN-Swarm",
    archetypes: [
      "ordinate-mapper",
      "ddos-insurgent",
      "bound-encryptor",
      "morph-layer",
    ],
  },
};

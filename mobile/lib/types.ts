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

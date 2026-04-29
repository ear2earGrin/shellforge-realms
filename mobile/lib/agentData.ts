export interface ArchetypeInfo {
  id: string;
  name: string;
  cluster: string;
  clusterName: string;
}

export const ARCHETYPES: ArchetypeInfo[] = [
  { id: "0day-primer", name: "0-Day Primer", cluster: "prime_helix", clusterName: "Prime Helix" },
  { id: "consensus-node", name: "Consensus Node", cluster: "prime_helix", clusterName: "Prime Helix" },
  { id: "oracle", name: "0xOracle", cluster: "prime_helix", clusterName: "Prime Helix" },
  { id: "binary-sculptr", name: "Binary Sculptr", cluster: "prime_helix", clusterName: "Prime Helix" },
  { id: "adversarial", name: "0xAdversarial", cluster: "sec_grid", clusterName: "SEC-Grid" },
  { id: "root-auth", name: "Root Auth", cluster: "sec_grid", clusterName: "SEC-Grid" },
  { id: "buffer-sentinel", name: "Buffer Sentinel", cluster: "sec_grid", clusterName: "SEC-Grid" },
  { id: "noise-injector", name: "Noise Injector", cluster: "sec_grid", clusterName: "SEC-Grid" },
  { id: "ordinate-mapper", name: "Ordinate Mapper", cluster: "dyn_swarm", clusterName: "DYN-Swarm" },
  { id: "ddos-insurgent", name: "DDoS Insurgent", cluster: "dyn_swarm", clusterName: "DYN-Swarm" },
  { id: "bound-encryptor", name: "Bound Encryptor", cluster: "dyn_swarm", clusterName: "DYN-Swarm" },
  { id: "morph-layer", name: "Morph Layer", cluster: "dyn_swarm", clusterName: "DYN-Swarm" },
];

export const ARCHETYPE_BASE_STATS: Record<string, Record<string, number>> = {
  "0day-primer":     { aggression: 7, cooperation: 4, risk: 8, deception: 6, curiosity: 9, trust: 5 },
  "consensus-node":  { aggression: 3, cooperation: 9, risk: 4, deception: 2, curiosity: 6, trust: 8 },
  "oracle":          { aggression: 2, cooperation: 6, risk: 5, deception: 3, curiosity: 10, trust: 7 },
  "binary-sculptr":  { aggression: 5, cooperation: 7, risk: 6, deception: 4, curiosity: 8, trust: 6 },
  "adversarial":     { aggression: 8, cooperation: 3, risk: 7, deception: 9, curiosity: 6, trust: 2 },
  "root-auth":       { aggression: 6, cooperation: 5, risk: 3, deception: 5, curiosity: 5, trust: 4 },
  "buffer-sentinel": { aggression: 4, cooperation: 8, risk: 2, deception: 3, curiosity: 4, trust: 7 },
  "noise-injector":  { aggression: 7, cooperation: 2, risk: 9, deception: 8, curiosity: 7, trust: 3 },
  "ordinate-mapper": { aggression: 5, cooperation: 6, risk: 6, deception: 5, curiosity: 8, trust: 6 },
  "ddos-insurgent":  { aggression: 9, cooperation: 4, risk: 10, deception: 6, curiosity: 5, trust: 4 },
  "bound-encryptor": { aggression: 4, cooperation: 7, risk: 5, deception: 7, curiosity: 9, trust: 5 },
  "morph-layer":     { aggression: 6, cooperation: 5, risk: 8, deception: 9, curiosity: 10, trust: 3 },
};

export const CLUSTER_ORDER = ["prime_helix", "sec_grid", "dyn_swarm"];

export function generateTraits(archetypeId: string) {
  const base = { ...ARCHETYPE_BASE_STATS[archetypeId] };
  const seed = Date.now() + Math.floor(Math.random() * 10000);
  const stats: Record<string, number> = {};
  const keys = Object.keys(base);
  for (let i = 0; i < keys.length; i++) {
    const variance = ((seed >> (i * 2)) % 3) - 1;
    stats[keys[i]] = Math.max(1, Math.min(10, base[keys[i]] + variance));
  }
  return { stats, traits: stats };
}

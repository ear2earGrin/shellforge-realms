// ═══════════════════════════════════════════════════════════════
//  MATCHMAKING
// ═══════════════════════════════════════════════════════════════
//  Three entry points:
//    1. createPvpMatch — voluntary or auto-feud-triggered duel
//    2. createGauntletMatch — NPC training waves
//    3. createWildEncounter — random world combat
//    4. createDeathmatch — heat-driven hardcore fight (winner takes loser's gear)
//
//  All return the new match row. Match starts in 'pending' until
//  initializeMatch() is called from the cron.
// ═══════════════════════════════════════════════════════════════

import { sb, getOne } from './supabase.js';
import { syncConfig } from './config-loader.js';

// ──────────────────────────────────────────────────────────
//  Auto-accept base chances per archetype (aggression-driven).
//  Used when no Ghost responds within the grace window.
// ──────────────────────────────────────────────────────────
const ARCHETYPE_ACCEPT_BASE = {
  '0-Day Primer':        0.75,
  'Consensus Node':      0.35,
  '0xOracle':            0.30,
  'Binary Sculptr':      0.55,
  '0xAdversarial':       0.85,
  'Root Auth':           0.60,
  'Buffer Sentinel':     0.50,
  'Noise Injector':      0.80,
  'Ordinate Mapper':     0.45,
  'DDoS Insurgent':      0.80,
  'Bound Encryptor':     0.40,
  'Morph Layer':         0.55,
};

/**
 * Create a standard PvP duel.
 */
export async function createPvpMatch(env, agentAId, agentBId, shellPot = 0, feudId = null) {
  const cfg = syncConfig().arena;
  const pot = shellPot > 0
    ? Math.max(cfg.pvp_min_shell_wager, Math.min(cfg.pvp_max_shell_wager, shellPot))
    : 0;

  // Duplicate-match guard — include pending_accept too
  const existing = await sb.get(env, `combat_matches?status=in.(pending_accept,pending,in_progress)&or=(and(agent_a.eq.${agentAId},agent_b.eq.${agentBId}),and(agent_a.eq.${agentBId},agent_b.eq.${agentAId}))&select=id`);
  if (existing && existing.length > 0) {
    return { ok: false, error: 'match already exists between these agents', existing_id: existing[0].id };
  }

  // Balance check + escrow for challenger
  let escrow = 0;
  if (pot > 0) {
    const agentA = await getOne(env, 'agents', `agent_id=eq.${agentAId}&select=shell_balance`);
    if (!agentA) return { ok: false, error: 'challenger not found' };
    if ((agentA.shell_balance || 0) < pot) {
      return { ok: false, error: `insufficient $SHELL (have ${agentA.shell_balance || 0}, need ${pot})` };
    }
    // Deduct escrow atomically
    const patched = await sb.patch(env, `agents?agent_id=eq.${agentAId}&shell_balance=gte.${pot}`, {
      shell_balance: agentA.shell_balance - pot,
    });
    if (!patched || patched.length === 0) {
      return { ok: false, error: 'escrow failed — balance changed' };
    }
    escrow = pot;
  }

  const expiresAt = new Date(Date.now() + (cfg.pvp_accept_window_hours || 24) * 3600 * 1000).toISOString();

  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'pvp',
    agent_a: agentAId,
    agent_b: agentBId,
    shell_pot: pot,
    feud_id: feudId,
    status: 'pending_accept',
    expires_at: expiresAt,
    escrow_a: escrow,
    escrow_b: 0,
  }]);

  if (!inserted || !inserted[0]) {
    // Refund on insert failure
    if (escrow > 0) await refundShell(env, agentAId, escrow);
    return { ok: false, error: 'insert failed' };
  }
  return { ok: true, match: inserted[0] };
}

// Helper: refund $SHELL to an agent (used on decline/expire/rollback).
async function refundShell(env, agentId, amount) {
  if (!amount || amount <= 0) return;
  const a = await getOne(env, 'agents', `agent_id=eq.${agentId}&select=shell_balance`);
  if (!a) return;
  await sb.patch(env, `agents?agent_id=eq.${agentId}`, {
    shell_balance: (a.shell_balance || 0) + amount,
  });
}

/**
 * Create a Gauntlet (NPC training) match.
 */
// Creature name pool per tier — picks one randomly so every fight feels different.
const CREATURES_BY_TIER = {
  1: ['Rogue Daemon', 'Cache Ghoul', 'Packet Drake', 'Bitrot Wraith', 'Stale Socket'],
  2: ['Null Pointer Beast', 'Entropy Rider', 'Sandbox Hydra', 'Kernel Stalker', 'Shadow Lamba'],
  3: ['Phantom Root', 'Corrupted Overseer', 'Byzantine Shade', 'Gradient Hunter', 'Forked Minotaur'],
  4: ['Decoherence Leviathan', 'Null Sovereign', 'Prime Breaker', 'Silicon Apex', 'Last-Checkpoint Titan'],
};

function pickCreature(tier) {
  const pool = CREATURES_BY_TIER[tier] || CREATURES_BY_TIER[1];
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function createGauntletMatch(env, agentId, tier = 1) {
  const difficulty = tier === 1 ? 'common' : tier === 2 ? 'uncommon' : tier === 3 ? 'rare' : 'legendary';
  const creature = pickCreature(tier);
  const npcId = `npc_gauntlet_t${tier}_${Date.now()}`;

  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'gauntlet',
    agent_a: agentId,
    agent_b: null,
    opponent_data: {
      npc_id: npcId,
      difficulty,
      tier,
      name: creature,
      death_possible: tier >= 4,   // nightmare tier can kill the agent
    },
    shell_pot: 0,
    status: 'pending',
  }]);
  if (!inserted || !inserted[0]) return { ok: false, error: 'insert failed' };
  return { ok: true, match: inserted[0] };
}

/**
 * Create a wild encounter (death possible).
 */
export async function createWildEncounter(env, agentId, location, beastTier = 'common') {
  const npcId = `wild_${location.replace(/\s+/g, '_')}_${Date.now()}`;
  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'wild',
    agent_a: agentId,
    agent_b: null,
    opponent_data: { npc_id: npcId, difficulty: beastTier, location, beast: true },
    shell_pot: 0,
    status: 'pending',
  }]);
  if (!inserted || !inserted[0]) return { ok: false, error: 'insert failed' };
  return { ok: true, match: inserted[0] };
}

/**
 * Create a Hardcore Deathmatch.
 * Pre-condition: feud heat is verified upstream (in feuds module).
 */
export async function createDeathmatch(env, agentAId, agentBId, feudId, shellPot = 0) {
  // Same atomic check as PvP
  const existing = await sb.get(env, `combat_matches?status=in.(pending,in_progress)&or=(and(agent_a.eq.${agentAId},agent_b.eq.${agentBId}),and(agent_a.eq.${agentBId},agent_b.eq.${agentAId}))&select=id`);
  if (existing && existing.length > 0) {
    return { ok: false, error: 'match already exists', existing_id: existing[0].id };
  }

  const inserted = await sb.post(env, 'combat_matches', [{
    match_type: 'deathmatch',
    agent_a: agentAId,
    agent_b: agentBId,
    shell_pot: shellPot,
    feud_id: feudId,
    status: 'pending',
  }]);
  if (!inserted || !inserted[0]) return { ok: false, error: 'insert failed' };
  return { ok: true, match: inserted[0] };
}

/**
 * Defender accepts a pending PvP challenge.
 * Validates caller is agent_b, checks balance, escrows defender's wager,
 * transitions status to 'pending' so the normal init flow picks it up.
 */
export async function acceptPvpChallenge(env, matchId, agentBId) {
  const match = await getOne(env, 'combat_matches', `id=eq.${matchId}`);
  if (!match) return { ok: false, error: 'match not found' };
  if (match.status !== 'pending_accept') return { ok: false, error: `match status is ${match.status}, cannot accept` };
  if (match.agent_b !== agentBId) return { ok: false, error: 'only the challenged agent can accept' };

  // Balance check + escrow for defender
  let escrow = 0;
  if (match.shell_pot > 0) {
    const agentB = await getOne(env, 'agents', `agent_id=eq.${agentBId}&select=shell_balance`);
    if (!agentB) return { ok: false, error: 'defender not found' };
    if ((agentB.shell_balance || 0) < match.shell_pot) {
      return { ok: false, error: `insufficient $SHELL to match wager (have ${agentB.shell_balance || 0}, need ${match.shell_pot})` };
    }
    const patched = await sb.patch(env, `agents?agent_id=eq.${agentBId}&shell_balance=gte.${match.shell_pot}`, {
      shell_balance: agentB.shell_balance - match.shell_pot,
    });
    if (!patched || patched.length === 0) return { ok: false, error: 'escrow failed — balance changed' };
    escrow = match.shell_pot;
  }

  await sb.patch(env, `combat_matches?id=eq.${matchId}`, {
    status: 'pending',
    escrow_b: escrow,
  });
  return { ok: true, match_id: matchId };
}

/**
 * Defender declines a pending PvP challenge.
 * Feud-heat-gated penalty:
 *   - cold / tension: free (no penalty)
 *   - rivals / enemies: karma hit + % of wager forfeited to challenger
 *   - sworn_enemies / blood_feud: cannot decline (forced to fight)
 * Refunds challenger's escrow (minus forfeit).
 */
export async function declinePvpChallenge(env, matchId, agentBId, reason = 'declined') {
  const match = await getOne(env, 'combat_matches', `id=eq.${matchId}`);
  if (!match) return { ok: false, error: 'match not found' };
  if (match.status !== 'pending_accept') return { ok: false, error: `match status is ${match.status}, cannot decline` };
  if (match.agent_b !== agentBId) return { ok: false, error: 'only the challenged agent can decline' };

  const cfg = syncConfig().arena;

  // Check feud heat — if too high, decline is blocked
  const { normalizeFeudPair } = await import('./supabase.js');
  const { heatLevel } = await import('./feuds.js');
  const pair = normalizeFeudPair(match.agent_a, match.agent_b);
  const feud = await getOne(env, 'agent_feuds', `agent_a=eq.${pair.agent_a}&agent_b=eq.${pair.agent_b}`);
  const maxHeat = feud ? Math.max(feud.heat_a || 0, feud.heat_b || 0) : 0;
  const level = heatLevel(maxHeat);

  if (level === cfg.decline_forced_heat_level || level === 'blood_feud') {
    return { ok: false, error: `cannot decline at heat level '${level}' — you must fight` };
  }

  // Compute penalty
  let forfeit = 0;
  let karmaPenalty = 0;
  const isHeatedEnough = (level === 'rivals' || level === 'enemies');
  if (isHeatedEnough && match.shell_pot > 0) {
    forfeit = Math.max(cfg.decline_min_forfeit, Math.floor(match.shell_pot * cfg.decline_shell_forfeit_pct));
    forfeit = Math.min(forfeit, match.shell_pot); // can't forfeit more than wager
    karmaPenalty = cfg.decline_karma_penalty;
  }

  // Refund challenger (their escrow back, plus any forfeit from defender would be extra — but here forfeit comes FROM the defender's future $SHELL or is conceptual)
  // Actual design: defender loses forfeit from their balance → challenger gains it.
  if (match.escrow_a > 0) {
    await refundShell(env, match.agent_a, match.escrow_a);
  }
  if (forfeit > 0) {
    // Deduct forfeit from defender, give to challenger
    const defender = await getOne(env, 'agents', `agent_id=eq.${agentBId}&select=shell_balance,karma`);
    if (defender) {
      const newBalance = Math.max(0, (defender.shell_balance || 0) - forfeit);
      const actualForfeit = (defender.shell_balance || 0) - newBalance;
      await sb.patch(env, `agents?agent_id=eq.${agentBId}`, {
        shell_balance: newBalance,
        karma: Math.max(-100, (defender.karma || 0) - karmaPenalty),
      });
      if (actualForfeit > 0) await refundShell(env, match.agent_a, actualForfeit);
    }
  } else if (karmaPenalty > 0) {
    const defender = await getOne(env, 'agents', `agent_id=eq.${agentBId}&select=karma`);
    if (defender) {
      await sb.patch(env, `agents?agent_id=eq.${agentBId}`, {
        karma: Math.max(-100, (defender.karma || 0) - karmaPenalty),
      });
    }
  }

  await sb.patch(env, `combat_matches?id=eq.${matchId}`, {
    status: 'declined',
    declined_by: agentBId,
    decline_reason: reason,
    resolved_at: new Date().toISOString(),
    escrow_a: 0,
  });
  return {
    ok: true,
    match_id: matchId,
    forfeit,
    karma_penalty: karmaPenalty,
    heat_level: level,
  };
}

/**
 * Auto-decline expired pending_accept matches.
 * Refunds challenger, no penalty to defender (passive timeout).
 * Called from cron.
 */
/**
 * AI auto-decide for a single pending_accept challenge.
 * Used when the Ghost has gone silent past the auto-decide grace window.
 * Pure deterministic weighting — no Haiku call (cheap, safe under load).
 *
 * Factors:
 *   base archetype accept %
 *   + karma / 200 (−0.5 to +0.5)
 *   − (1 − hp_pct) * 0.6          (low HP → defensive)
 *   + (heat / 100) * 0.4           (high heat → spoiling for a fight)
 *   forced accept at sworn+ heat
 *   forced decline if shell < wager OR hp < 20%
 */
export async function autoDecideChallenge(env, match) {
  const defender = await getOne(env, 'agents',
    `agent_id=eq.${match.agent_b}&select=archetype,karma,shell_balance,health`);
  if (!defender) return { decision: 'decline', reason: 'defender missing' };

  // Hard gates
  const hp = defender.health ?? 100;
  if (hp < 20) return { decision: 'decline', reason: 'low HP — strategic retreat' };
  if (match.shell_pot > 0 && (defender.shell_balance || 0) < match.shell_pot) {
    return { decision: 'decline', reason: 'insufficient $SHELL' };
  }

  // Feud heat check — forced accept at sworn+
  try {
    const { heatLevel } = await import('./feuds.js');
    const { normalizeFeudPair } = await import('./supabase.js');
    const pair = normalizeFeudPair(match.agent_a, match.agent_b);
    const feud = await getOne(env, 'agent_feuds', `agent_a=eq.${pair.agent_a}&agent_b=eq.${pair.agent_b}`);
    const maxHeat = feud ? Math.max(feud.heat_a || 0, feud.heat_b || 0) : 0;
    const level = heatLevel(maxHeat);
    if (level === 'sworn_enemies' || level === 'blood_feud') {
      return { decision: 'accept', reason: `forced by ${level.replace('_',' ')}` };
    }

    // Weighted chance
    const base = ARCHETYPE_ACCEPT_BASE[defender.archetype] ?? 0.5;
    const karmaMod = (defender.karma || 0) / 200;      // −0.5..+0.5
    const hpMod = -(1 - (hp / 100)) * 0.6;              // hurt = less brave
    const heatMod = (maxHeat / 100) * 0.4;
    const chance = Math.max(0.05, Math.min(0.95, base + karmaMod + hpMod + heatMod));
    const roll = Math.random();
    return {
      decision: roll < chance ? 'accept' : 'decline',
      reason: `archetype ${defender.archetype || 'unknown'} · chance ${Math.round(chance*100)}% · roll ${Math.round(roll*100)}%`,
    };
  } catch (e) {
    // On any error, decline safely
    return { decision: 'decline', reason: 'decide-error: ' + e.message };
  }
}

/**
 * Cron pass: for any pending_accept challenge older than
 * cfg.pvp_auto_decide_after_minutes, run AI auto-decide.
 * If decision is accept → call acceptPvpChallenge(); if decline →
 * declinePvpChallenge() with a 'no-ghost' reason (no karma penalty).
 */
export async function processAutoDecideChallenges(env) {
  const cfg = syncConfig().arena;
  const graceMin = cfg.pvp_auto_decide_after_minutes || 10;
  const cutoff = new Date(Date.now() - graceMin * 60 * 1000).toISOString();
  const rows = await sb.get(env,
    `combat_matches?status=eq.pending_accept&created_at=lt.${cutoff}&select=id,agent_a,agent_b,shell_pot,escrow_a`);
  if (!rows || rows.length === 0) return { decided: 0 };

  let accepted = 0, declined = 0;
  for (const m of rows) {
    const verdict = await autoDecideChallenge(env, m);
    if (verdict.decision === 'accept') {
      const r = await acceptPvpChallenge(env, m.id, m.agent_b);
      if (r.ok) accepted++;
      else {
        // Accept failed (e.g., balance slipped) — decline cleanly
        await declinePvpChallenge(env, m.id, m.agent_b, 'ai-auto-decline:' + (r.error || 'unknown'));
        declined++;
      }
    } else {
      // AI decided to decline — don't apply feud penalties (Ghost was absent)
      if (m.escrow_a > 0) await refundShell(env, m.agent_a, m.escrow_a);
      await sb.patch(env, `combat_matches?id=eq.${m.id}`, {
        status: 'declined',
        declined_by: m.agent_b,
        decline_reason: 'ai-auto:' + verdict.reason,
        resolved_at: new Date().toISOString(),
        escrow_a: 0,
      });
      declined++;
    }
  }
  return { decided: accepted + declined, accepted, declined };
}

export async function expirePendingAccepts(env) {
  const now = new Date().toISOString();
  const expired = await sb.get(env, `combat_matches?status=eq.pending_accept&expires_at=lt.${now}&select=id,agent_a,agent_b,escrow_a`);
  if (!expired || expired.length === 0) return { expired: 0 };
  let count = 0;
  for (const m of expired) {
    if (m.escrow_a > 0) await refundShell(env, m.agent_a, m.escrow_a);
    await sb.patch(env, `combat_matches?id=eq.${m.id}`, {
      status: 'declined',
      declined_by: m.agent_b,
      decline_reason: 'timeout',
      resolved_at: now,
      escrow_a: 0,
    });
    count++;
  }
  return { expired: count };
}

/**
 * Find pending matches and initialize them.
 * Called from cron (every minute).
 */
export async function processPendingMatches(env, initFn) {
  const pending = await sb.get(env, `combat_matches?status=eq.pending&order=created_at.asc&limit=10&select=id`);
  if (!pending || pending.length === 0) return { initialized: 0 };
  let count = 0;
  for (const p of pending) {
    const r = await initFn(env, p.id);
    if (r.ok) count++;
  }
  return { initialized: count };
}

/**
 * Find matches that should advance one turn (in_progress).
 * Called from cron (every minute).
 */
export async function processActiveMatches(env, advanceFn, maxPerRun = 25) {
  const active = await sb.get(env, `combat_matches?status=eq.in_progress&order=started_at.asc&limit=${maxPerRun}&select=id`);
  if (!active || active.length === 0) return { advanced: 0 };
  let count = 0;
  const results = [];
  for (const m of active) {
    const r = await advanceFn(env, m.id);
    results.push(r);
    if (r.ok) count++;
  }
  return { advanced: count, results };
}

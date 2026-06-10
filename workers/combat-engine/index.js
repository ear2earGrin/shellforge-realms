// ═══════════════════════════════════════════════════════════════
//  SHELLFORGE COMBAT ENGINE — Cloudflare Worker
// ═══════════════════════════════════════════════════════════════
//  Entry point. Handles HTTP routes + scheduled cron triggers.
//
//  HTTP routes:
//    POST /combat/initiate         — create new match (PvP, gauntlet, wild, deathmatch)
//    POST /combat/turn             — manually advance one turn (for testing/admin)
//    GET  /combat/match/:id        — full match state + replay
//    GET  /combat/active           — all in-progress matches
//    GET  /combat/agent/:id/active — agent's current matches
//    POST /combat/whisper          — Ghost whisper into combat
//    GET  /combat/abilities        — full ability catalogue
//
//    POST /feuds/event             — record a heat-changing event
//    GET  /feuds/agent/:id         — all feuds for an agent
//    GET  /feuds/hot               — top hottest feuds
//
//    POST /crucible/check          — manual crucible eval (admin)
//    GET  /crucible/agent/:id      — crucible state for an agent
//    POST /crucible/whisper        — record a whisper happened (called by whisper-worker)
//
//  Cron triggers:
//    */1 * * * *  — process pending + advance active matches + check Crucible deadlines
//    0 */6 * * *  — full Crucible evaluation
//    0 3 * * *    — daily feud heat decay
// ═══════════════════════════════════════════════════════════════

import { sb, getOne } from './supabase.js';
import { getConfig } from './config-loader.js';
import {
  createPvpMatch, createGauntletMatch, createWildEncounter, createDeathmatch,
  processPendingMatches, processActiveMatches,
  acceptPvpChallenge, declinePvpChallenge, expirePendingAccepts,
  processAutoDecideChallenges,
} from './matchmaking.js';
import { initializeMatch, resolveTurn } from './turn-resolver.js';
import {
  triggerClusterEncounter, triggerArchetypeMeeting, triggerMarketUndercut,
  triggerGhostProvocation, triggerGhostDeescalation, recordPvpResult,
  decayAllFeuds, getAgentFeuds, heatLevel, isArchetypeEnemy,
  shouldAutoChallenge, resolveByDeath,
} from './feuds.js';
import {
  evaluateAllAgents, checkCollapses, getCrucibleBonuses, recordWhisper,
} from './crucible.js';
import { deathNarration, deathmatchResolution, crucibleCollapse } from './narration.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ ok: false, error: message }, status);
}

async function readJSON(request) {
  try { return await request.json(); }
  catch { return null; }
}

// ─── Route handlers ───────────────────────────────────────────

async function handleInitiate(request, env) {
  const body = await readJSON(request);
  if (!body) return errorResponse('invalid JSON');
  const { match_type, agent_a, agent_b, shell_pot, opponent_data, feud_id, location, beast_tier, tier } = body;
  if (!match_type || !agent_a) return errorResponse('match_type + agent_a required');

  // Validate agent_a exists
  const agentARow = await getOne(env, 'agents', `agent_id=eq.${agent_a}&select=agent_id`);
  if (!agentARow) return errorResponse(`agent_a not found: ${agent_a}`, 404);

  let result;
  switch (match_type) {
    case 'pvp': {
      if (!agent_b) return errorResponse('agent_b required for PvP');
      const agentBRow = await getOne(env, 'agents', `agent_id=eq.${agent_b}&select=agent_id`);
      if (!agentBRow) return errorResponse(`agent_b not found: ${agent_b}`, 404);
      result = await createPvpMatch(env, agent_a, agent_b, shell_pot || 0, feud_id || null);
      break;
    }
    case 'gauntlet':
      result = await createGauntletMatch(env, agent_a, tier || 1);
      break;
    case 'wild':
      result = await createWildEncounter(env, agent_a, location || 'Nexarch', beast_tier || 'common');
      break;
    case 'deathmatch': {
      if (!agent_b || !feud_id) return errorResponse('agent_b + feud_id required for deathmatch');
      const agentBRow = await getOne(env, 'agents', `agent_id=eq.${agent_b}&select=agent_id`);
      if (!agentBRow) return errorResponse(`agent_b not found: ${agent_b}`, 404);
      result = await createDeathmatch(env, agent_a, agent_b, feud_id, shell_pot || 0);
      break;
    }
    default:
      return errorResponse(`unknown match_type: ${match_type}`);
  }

  return jsonResponse(result, result.ok ? 201 : 409);
}

async function handleTurn(request, env) {
  const body = await readJSON(request);
  if (!body || !body.match_id) return errorResponse('match_id required');
  const result = await resolveTurn(env, body.match_id);
  // Run post-turn hooks if match resolved
  if (result.ok && result.status === 'resolved') {
    await postMatchHooks(env, body.match_id, result);
  }
  return jsonResponse(result);
}

async function handleAccept(request, env) {
  const body = await readJSON(request);
  if (!body || !body.match_id || !body.agent_id) return errorResponse('match_id + agent_id required');
  const r = await acceptPvpChallenge(env, body.match_id, body.agent_id);
  return jsonResponse(r, r.ok ? 200 : 400);
}

async function handleDecline(request, env) {
  const body = await readJSON(request);
  if (!body || !body.match_id || !body.agent_id) return errorResponse('match_id + agent_id required');
  const r = await declinePvpChallenge(env, body.match_id, body.agent_id, body.reason);
  return jsonResponse(r, r.ok ? 200 : 400);
}

async function handleIncoming(request, env) {
  const url = new URL(request.url);
  const agentId = url.searchParams.get('agent_id');
  if (!agentId) return errorResponse('agent_id query param required');
  const rows = (await sb.get(env, `combat_matches?status=eq.pending_accept&agent_b=eq.${agentId}&order=created_at.desc&select=*`)) || [];
  return jsonResponse({ ok: true, challenges: rows });
}

async function handleMatchGet(request, env, matchId) {
  const match = await getOne(env, 'combat_matches', `id=eq.${matchId}`);
  if (!match) return errorResponse('match not found', 404);
  const turns = (await sb.get(env, `combat_turns?match_id=eq.${matchId}&order=turn_number.asc&select=*`)) || [];
  return jsonResponse({ ok: true, match, turns });
}

async function handleActiveList(env) {
  const rows = (await sb.get(env, 'v_active_matches?select=*&order=started_at.desc&limit=50')) || [];
  return jsonResponse({ ok: true, matches: rows });
}

async function handleAgentActive(env, agentId) {
  const rows = (await sb.get(
    env,
    `combat_matches?or=(agent_a.eq.${agentId},agent_b.eq.${agentId})&status=in.(pending,in_progress)&select=*`
  )) || [];
  return jsonResponse({ ok: true, matches: rows });
}

// Resolve a session token (issued by the auth-worker) to a user_id.
// sessions stores only the sha256 of the bearer token.
async function sessionUserFromToken(env, token) {
  if (!token || typeof token !== 'string' || token.length < 16) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  const rows = await sb.get(env,
    `sessions?token_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  return rows?.[0]?.user_id || null;
}

async function handleWhisper(request, env) {
  const body = await readJSON(request);
  if (!body || !body.match_id || !body.agent_id || !body.suggestion) {
    return errorResponse('match_id, agent_id, suggestion required');
  }
  // Session gate — only the agent's own Ghost may whisper into its match.
  const userId = await sessionUserFromToken(env, body.token);
  if (!userId) return errorResponse('invalid or expired session — please log in', 401);
  const whisperAgent = await getOne(env, 'agents', `agent_id=eq.${body.agent_id}&select=user_id`);
  if (!whisperAgent) return errorResponse('agent not found', 404);
  if (whisperAgent.user_id !== userId) return errorResponse('not your agent', 403);

  const match = await getOne(env, 'combat_matches', `id=eq.${body.match_id}`);
  if (!match) return errorResponse('match not found', 404);
  if (match.status !== 'in_progress') return errorResponse('match not in progress');

  const turnNumber = (match.turns_total || 0) + 1; // applies to next turn

  const inserted = await sb.post(env, 'combat_whispers', [{
    match_id: body.match_id,
    ghost_id: userId,
    agent_id: body.agent_id,
    turn_number: turnNumber,
    suggestion: body.suggestion,
    is_premium: !!body.is_premium,
  }]);

  return jsonResponse({ ok: true, whisper: inserted?.[0], applies_to_turn: turnNumber });
}

async function handleAbilities(env) {
  const [items, archetypes] = await Promise.all([
    sb.get(env, 'combat_abilities?order=item_name.asc&select=*'),
    sb.get(env, 'archetype_abilities?order=archetype.asc&select=*'),
  ]);
  return jsonResponse({ ok: true, item_abilities: items || [], archetype_abilities: archetypes || [] });
}

// ─── Feud routes ───────────────────────────────────────────

async function handleFeudEvent(request, env) {
  const body = await readJSON(request);
  if (!body || !body.event_type) return errorResponse('event_type required');

  switch (body.event_type) {
    case 'cluster_encounter':
      if (!body.agent_a || !body.agent_b) return errorResponse('agent_a + agent_b required');
      await triggerClusterEncounter(env,
        await getOne(env, 'agents', `agent_id=eq.${body.agent_a}`),
        await getOne(env, 'agents', `agent_id=eq.${body.agent_b}`));
      return jsonResponse({ ok: true });

    case 'archetype_meeting':
      if (!body.agent_a || !body.agent_b) return errorResponse('agent_a + agent_b required');
      await triggerArchetypeMeeting(env,
        await getOne(env, 'agents', `agent_id=eq.${body.agent_a}`),
        await getOne(env, 'agents', `agent_id=eq.${body.agent_b}`));
      return jsonResponse({ ok: true });

    case 'market_undercut':
      if (!body.undercutter || !body.victim) return errorResponse('undercutter + victim required');
      await triggerMarketUndercut(env, body.undercutter, body.victim, !!body.is_crash);
      return jsonResponse({ ok: true });

    case 'ghost_provoke':
      if (!body.agent_a || !body.agent_b) return errorResponse('agent_a + agent_b required');
      await triggerGhostProvocation(env, body.agent_a, body.agent_b, body.intensity || 'normal');
      return jsonResponse({ ok: true });

    case 'ghost_deescalate':
      if (!body.agent_a || !body.agent_b) return errorResponse('agent_a + agent_b required');
      await triggerGhostDeescalation(env, body.agent_a, body.agent_b);
      return jsonResponse({ ok: true });

    case 'pvp_result':
      // Combat losses heat the feud — fired by the turn-engine for wild fights.
      if (!body.winner || !body.loser) return errorResponse('winner + loser required');
      await recordPvpResult(env, body.winner, body.loser, body.feud_id || null);
      return jsonResponse({ ok: true });

    default:
      return errorResponse(`unknown event_type: ${body.event_type}`);
  }
}

async function handleFeudList(env, agentId) {
  const feuds = await getAgentFeuds(env, agentId);
  return jsonResponse({ ok: true, feuds: feuds || [] });
}

async function handleHotFeuds(env) {
  const rows = (await sb.get(env, 'v_hot_feuds?select=*&limit=20')) || [];
  return jsonResponse({ ok: true, feuds: rows });
}

// ─── Crucible routes ──────────────────────────────────────

async function handleCrucibleCheck(_request, env) {
  const eval_ = await evaluateAllAgents(env);
  const collapses = await checkCollapses(env);
  return jsonResponse({ ok: true, eval: eval_, collapses });
}

async function handleCrucibleAgent(env, agentId) {
  const state = await getOne(env, 'crucible_states', `agent_id=eq.${agentId}`);
  if (!state) return jsonResponse({ ok: true, state: { agent_id: agentId, stage: 'content', days_since_whisper: 0 } });
  return jsonResponse({ ok: true, state });
}

async function handleCrucibleWhisper(request, env) {
  const body = await readJSON(request);
  if (!body || !body.agent_id) return errorResponse('agent_id required');
  await recordWhisper(env, body.agent_id);
  return jsonResponse({ ok: true });
}

// ─── Post-match hooks (death, dynasty, push notifications) ─

// Compact dynasty pipeline for combat-engine deaths (wild + deathmatch).
// Mirrors the turn-engine's processDeathLoot semantics: half the $SHELL to
// the Family Vault (half dissolves — scarcity), lineage attribution, and
// legendary/epic items preserved in vault_items for the heir.
async function runDeathLoot(env, dead) {
  if (!dead.user_id) return;
  const vaultShell = Math.floor((dead.shell_balance || 0) / 2);
  const lineName = dead.line_name || `House ${String(dead.agent_name || 'UNKNOWN').toUpperCase()}`;
  const legacyTrait = dead.karma >= 10 ? 'disciplined' : dead.karma <= -10 ? 'chaotic' : 'neutral';

  const vaults = (await sb.get(env, `family_vault?user_id=eq.${dead.user_id}&select=vault_id,shell_balance,generation`)) || [];
  if (vaults.length > 0) {
    await sb.patch(env, `family_vault?vault_id=eq.${vaults[0].vault_id}`, {
      shell_balance: (vaults[0].shell_balance || 0) + vaultShell,
      last_agent_name: dead.agent_name,
      legacy_karma: dead.karma,
      legacy_trait: legacyTrait,
      line_name: lineName,
      generation: Math.max(vaults[0].generation || 0, dead.generation || 1),
      updated_at: new Date().toISOString(),
    });
  } else {
    await sb.insert(env, 'family_vault', [{
      user_id: dead.user_id,
      shell_balance: vaultShell,
      last_agent_name: dead.agent_name,
      legacy_karma: dead.karma,
      legacy_trait: legacyTrait,
      line_name: lineName,
      generation: dead.generation || 1,
    }]);
  }

  // Preserve legendary/epic items for the heir; the rest stays with the body.
  const inventory = (await sb.get(env, `inventory?agent_id=eq.${dead.agent_id}&select=*`)) || [];
  const heirlooms = inventory.filter(i =>
    ['legendary', 'epic'].includes(String(i.stats?.rarity || i.item_category || '').toLowerCase()));
  if (heirlooms.length > 0) {
    await sb.insert(env, 'vault_items', heirlooms.map(i => ({
      user_id: dead.user_id,
      item_id: i.item_id,
      item_name: i.item_name,
      item_type: i.item_type,
      item_rarity: String(i.stats?.rarity || i.item_category || 'epic').toLowerCase(),
      stats: i.stats || {},
      inherited_from: dead.agent_name,
    }))).catch(e => console.error('[death] vault_items insert failed:', e.message));
    for (const i of heirlooms) {
      await sb.delete(env, `inventory?inventory_id=eq.${i.inventory_id}`);
    }
  }

  await sb.patch(env, `agents?agent_id=eq.${dead.agent_id}`, {
    shell_balance: 0,
  });
}

// ─── Feud escalation pass (cron) ─────────────────────────────
// enemies+ heat → chance of an auto-initiated PvP challenge (config-gated
// cooldown per pair). blood heat → dual-consent deathmatch state machine:
//   none            → create a consent request for EACH Ghost → consent_pending
//   armed           → (both Ghosts granted via rpc_respond_consent) schedule
//                     the deathmatch + spectacle activity events → scheduled
//   declined/done   → nothing; the feud stands down or is settled
async function processFeudEscalations(env) {
  const cfg = (await getConfig(env)).feuds;
  const feuds = (await sb.get(env,
    `agent_feuds?status=eq.active&or=(heat_a.gte.${cfg.threshold_enemies},heat_b.gte.${cfg.threshold_enemies})&select=*`)) || [];
  let challenged = 0, consentsCreated = 0, deathmatches = 0;

  for (const feud of feuds) {
    const a = await getOne(env, 'agents', `agent_id=eq.${feud.agent_a}&select=agent_id,agent_name,user_id,is_alive,turns_taken,location,shell_balance`);
    const b = await getOne(env, 'agents', `agent_id=eq.${feud.agent_b}&select=agent_id,agent_name,user_id,is_alive,turns_taken,location,shell_balance`);
    if (!a?.is_alive || !b?.is_alive) continue;

    const maxHeat = Math.max(feud.heat_a, feud.heat_b);

    // Blood feud: dual-consent deathmatch gate (amended brief — the one
    // consensual PvP permadeath path).
    if (maxHeat >= cfg.threshold_blood) {
      if (feud.deathmatch_state === 'none' || feud.deathmatch_state == null) {
        for (const [agent, rival] of [[a, b], [b, a]]) {
          await sb.insert(env, 'ghost_consent_requests', [{
            feud_id: feud.id,
            agent_id: agent.agent_id,
            user_id: agent.user_id,
            kind: 'deathmatch',
            message: `Your agent ${agent.agent_name} demands a DEATHMATCH against ${rival.agent_name}. ` +
                     `Feud heat: ${maxHeat}/100. If both Ghosts consent, death is permanent — no resurrection protocol.`,
          }]).catch(() => {}); // partial unique index makes this idempotent
        }
        await sb.patch(env, `agent_feuds?id=eq.${feud.id}`, { deathmatch_state: 'consent_pending' });
        consentsCreated++;
        continue;
      }
      if (feud.deathmatch_state === 'armed') {
        const dm = await createDeathmatch(env, feud.agent_a, feud.agent_b, feud.id, 0);
        if (dm?.ok) {
          await sb.patch(env, `agent_feuds?id=eq.${feud.id}`, { deathmatch_state: 'scheduled' });
          for (const agent of [a, b]) {
            await sb.insert(env, 'activity_log', [{
              agent_id: agent.agent_id,
              turn_number: agent.turns_taken || 0,
              action_type: 'event',
              action_detail: `⚔️ DEATHMATCH BEGINS: ${a.agent_name} vs ${b.agent_name}. ` +
                             `Both Ghosts consented. The arena seals its doors.`,
              location: agent.location,
            }]).catch(() => {});
          }
          deathmatches++;
        }
        continue;
      }
      continue; // consent_pending / scheduled / declined / done — nothing to do
    }

    // enemies / sworn heat: chance of a normal (non-lethal) auto-challenge,
    // rate-limited per pair by auto_challenge_cooldown_hours.
    const roll = shouldAutoChallenge(feud);
    if (!roll.shouldChallenge || roll.matchType !== 'pvp') continue;
    const cooldownMs = (cfg.auto_challenge_cooldown_hours || 24) * 3600 * 1000;
    const since = new Date(Date.now() - cooldownMs).toISOString();
    const recent = (await sb.get(env,
      `combat_matches?feud_id=eq.${feud.id}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`)) || [];
    if (recent.length > 0) continue;
    const pot = Math.min(20, Math.floor(Math.min(a.shell_balance || 0, b.shell_balance || 0) * 0.1));
    const made = await createPvpMatch(env, feud.agent_a, feud.agent_b, pot, feud.id);
    if (made?.ok) challenged++;
  }

  return { challenged, consentsCreated, deathmatches };
}

async function postMatchHooks(env, matchId, resolveResult) {
  const match = await getOne(env, 'combat_matches', `id=eq.${matchId}`);
  if (!match) return;

  // Pay out escrowed pot to winner (PvP + deathmatch only)
  const totalPot = (match.escrow_a || 0) + (match.escrow_b || 0);
  if (totalPot > 0 && resolveResult.winner_agent_id && !resolveResult.death_occurred) {
    const winner = await getOne(env, 'agents', `agent_id=eq.${resolveResult.winner_agent_id}&select=shell_balance`);
    if (winner) {
      await sb.patch(env, `agents?agent_id=eq.${resolveResult.winner_agent_id}`, {
        shell_balance: (winner.shell_balance || 0) + totalPot,
      });
    }
    await sb.patch(env, `combat_matches?id=eq.${matchId}`, { escrow_a: 0, escrow_b: 0 });
  }

  // Adjust feud heat for PvP/deathmatch
  if (match.match_type === 'pvp' || match.match_type === 'deathmatch') {
    if (resolveResult.winner_agent_id && resolveResult.loser_agent_id) {
      await recordPvpResult(env, resolveResult.winner_agent_id, resolveResult.loser_agent_id, match.feud_id);
    }
  }

  // Sync final HP to agents.health (player side only; NPCs don't have agents rows)
  // Skip if death is occurring — the death branch handles health=0 below.
  if (!resolveResult.death_occurred) {
    const finalA = match.agent_a_final_hp ?? resolveResult.state_a?.hp;
    const finalB = match.agent_b_final_hp ?? resolveResult.state_b?.hp;
    if (match.agent_a && !match.agent_a.startsWith('npc_') && typeof finalA === 'number') {
      await sb.patch(env, `agents?agent_id=eq.${match.agent_a}`, { health: Math.max(0, finalA) });
    }
    if (match.agent_b && !match.agent_b.startsWith('npc_') && typeof finalB === 'number') {
      await sb.patch(env, `agents?agent_id=eq.${match.agent_b}`, { health: Math.max(0, finalB) });
    }
  }

  // Write activity-log entries for both sides (outcome summary)
  await writeMatchOutcomeLog(env, match, resolveResult);

  // Death handling
  if (resolveResult.death_occurred && resolveResult.death_agent_id) {
    const dead = await getOne(env, 'agents', `agent_id=eq.${resolveResult.death_agent_id}`);
    const killer = await getOne(env, 'agents', `agent_id=eq.${resolveResult.winner_agent_id}`);
    const lineTag = dead?.line_name
      ? ` — Gen ${dead.generation || 1} of ${dead.line_name} falls.` : '';
    const narration = await deathNarration(env, {
      deadAgent: dead?.agent_name || resolveResult.death_agent_id,
      deadArchetype: dead?.archetype || 'unknown',
      deadCluster: dead?.cluster || 'unknown',
      lineage: dead?.line_name
        ? `${dead.agent_name}, generation ${dead.generation || 1} of ${dead.line_name}` : null,
      killer: killer?.agent_name || resolveResult.winner_agent_id,
      killerArchetype: killer?.archetype || 'NPC',
      killerCluster: killer?.cluster || 'wild',
      matchType: match.match_type,
      finalAbility: 'final blow',
      finalDamage: 0,
      turns: resolveResult.turn_number,
      location: match.opponent_data?.location || 'the arena',
    }, matchId);

    // Mark agent dead
    await sb.patch(env, `agents?agent_id=eq.${resolveResult.death_agent_id}`, {
      is_alive: false,
      health: 0,
      died_at: new Date().toISOString(),
      death_count: (dead?.death_count || 0) + 1,
    });

    // Dynasty pipeline: shell halving + Family Vault (lineage-attributed) +
    // legendary/epic items preserved for the heir.
    if (dead) await runDeathLoot(env, dead);

    await sb.insert(env, 'activity_log', [{
      agent_id: resolveResult.death_agent_id,
      turn_number: dead?.turns_taken || 0,
      action_type: 'death',
      action_detail: narration + lineTag,
      location: dead?.location || 'Unknown',
      success: false,
    }]).catch(() => {});

    // Feud closure for deathmatches: the blood debt is paid.
    if (match.match_type === 'deathmatch' && match.feud_id) {
      await resolveByDeath(env, match.feud_id);
      await sb.patch(env, `agent_feuds?id=eq.${match.feud_id}`, { deathmatch_state: 'done' });
    }

    // Push notification
    await sendPush(env, {
      type: 'death',
      agent_id: resolveResult.death_agent_id,
      ghost_id: dead?.user_id,
      match_id: matchId,
      narration,
    });

    // For deathmatch, also send winner notification + transfer rewards
    if (match.match_type === 'deathmatch') {
      const dmNarration = await deathmatchResolution(env, {
        winner: killer?.agent_name || 'the winner',
        winnerArchetype: killer?.archetype || 'unknown',
        winnerCluster: killer?.cluster || 'unknown',
        loser: dead?.agent_name || 'the loser',
        loserArchetype: dead?.archetype || 'unknown',
        loserCluster: dead?.cluster || 'unknown',
        heatLevel: 'blood_feud',
        turns: resolveResult.turn_number,
        gearTaken: 'all equipped',
        shellTaken: Math.floor((dead?.shell_balance || 0) / 2),
      }, matchId);
      await sb.insert(env, 'activity_log', [{
        agent_id: resolveResult.winner_agent_id,
        turn_number: killer?.turns_taken || 0,
        action_type: 'combat',
        action_detail: dmNarration,
        location: killer?.location || 'Unknown',
      }]).catch(() => {});
      await sendPush(env, {
        type: 'deathmatch_win',
        agent_id: resolveResult.winner_agent_id,
        ghost_id: killer?.user_id,
        match_id: matchId,
        narration: dmNarration,
      });
    }
  } else if (resolveResult.status === 'resolved') {
    // Non-fatal resolution — push to both players
    if (match.agent_a) {
      const a = await getOne(env, 'agents', `agent_id=eq.${match.agent_a}`);
      await sendPush(env, {
        type: resolveResult.winner_agent_id === match.agent_a ? 'match_won' : 'match_lost',
        agent_id: match.agent_a,
        ghost_id: a?.user_id,
        match_id: matchId,
      });
    }
    if (match.agent_b) {
      const b = await getOne(env, 'agents', `agent_id=eq.${match.agent_b}`);
      await sendPush(env, {
        type: resolveResult.winner_agent_id === match.agent_b ? 'match_won' : 'match_lost',
        agent_id: match.agent_b,
        ghost_id: b?.user_id,
        match_id: matchId,
      });
    }
  }
}

/**
 * Send a push notification (Expo/OneSignal webhook).
 * Spec lives in combat/PUSH_PAYLOADS.md.
 */
async function sendPush(env, payload) {
  if (!env.PUSH_NOTIFY_URL) return;
  try {
    await fetch(env.PUSH_NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn(`[push] failed: ${e.message}`);
  }
}

/**
 * Insert one activity_log row per human participant summarizing the match.
 * Visible on the dashboard feed so players know what happened.
 */
async function writeMatchOutcomeLog(env, match, result) {
  const winnerId = result.winner_agent_id;
  const loserId = result.loser_agent_id;
  const isDraw = !winnerId;
  const participants = [match.agent_a, match.agent_b].filter(
    (id) => id && !id.startsWith('npc_')
  );

  for (const pid of participants) {
    const won = pid === winnerId;
    const lost = pid === loserId;
    const pot = (match.escrow_a || 0) + (match.escrow_b || 0);
    const shellDelta = won ? pot : lost && match.match_type !== 'pvp' ? 0 : lost ? -(match.shell_pot || 0) : 0;

    let detail;
    if (isDraw) {
      detail = `Draw vs ${otherName(match, pid)} after ${match.turns_total} turns.`;
    } else if (won) {
      detail = `Victory vs ${otherName(match, pid)} in ${match.turns_total} turns${pot ? ` · +${pot} ⌬` : ''}.`;
    } else if (lost) {
      detail = `Defeated by ${otherName(match, pid)} in ${match.turns_total} turns${shellDelta ? ` · ${shellDelta} ⌬` : ''}.`;
    } else {
      detail = `${match.match_type} resolved.`;
    }

    await sb.insert(env, 'activity_log', [{
      agent_id: pid,
      action: `match_${won ? 'won' : lost ? 'lost' : 'draw'}`,
      detail,
      timestamp: new Date().toISOString(),
    }]).catch(() => {});
  }
}

function otherName(match, selfId) {
  if (match.agent_a === selfId) {
    if (match.agent_b && !match.agent_b.startsWith('npc_')) return match.agent_b_snapshot?.agent_id || match.agent_b;
    return match.opponent_data?.name || 'NPC';
  }
  return match.agent_a_snapshot?.agent_id || match.agent_a || 'opponent';
}

// ─── Cron handler ───────────────────────────────────────────

async function handleScheduled(controller, env) {
  await getConfig(env); // warm cache
  const cronStr = controller.cron;

  // Daily feud decay (3am UTC)
  if (cronStr === '0 3 * * *') {
    const r = await decayAllFeuds(env);
    console.log(`[cron] feud decay: ${JSON.stringify(r)}`);
    return;
  }

  // 6h crucible evaluation
  if (cronStr === '0 */6 * * *') {
    const e = await evaluateAllAgents(env);
    const c = await checkCollapses(env);
    console.log(`[cron] crucible eval: ${JSON.stringify(e)}, collapses: ${JSON.stringify(c)}`);
    // Notify collapsed agents' Ghosts
    for (const agentId of c.agents || []) {
      const agent = await getOne(env, 'agents', `agent_id=eq.${agentId}`);
      const narration = await crucibleCollapse(env, {
        agent: agent?.username || agentId,
        archetype: agent?.archetype || 'unknown',
        cluster: agent?.cluster || 'unknown',
        days: 45,
        location: agent?.location,
      });
      await sb.insert(env, 'activity_log', [{
        agent_id: agentId,
        action: 'crucible_collapse',
        detail: narration,
        timestamp: new Date().toISOString(),
      }]).catch(() => {});
      await sendPush(env, { type: 'crucible_collapse', agent_id: agentId, ghost_id: agent?.user_id, narration });
    }
    return;
  }

  // Default cron: */1 — auto-decide stale PvP + expire timeouts + init pending + advance active + decoherence
  const auto = await processAutoDecideChallenges(env);
  const exp  = await expirePendingAccepts(env);
  const init = await processPendingMatches(env, initializeMatch);
  const adv  = await processActiveMatches(env, async (env, matchId) => {
    const r = await resolveTurn(env, matchId);
    if (r.ok && r.status === 'resolved') {
      await postMatchHooks(env, matchId, r);
    }
    return r;
  });
  const collapses = await checkCollapses(env);
  const feuds = await processFeudEscalations(env).catch(e => {
    console.error('[cron] feud escalation pass failed:', e.message);
    return { challenged: 0, consentsCreated: 0, deathmatches: 0 };
  });

  console.log(`[cron] ai-decide: ${auto.decided} (acc:${auto.accepted} dec:${auto.declined}) | expired: ${exp.expired} | init: ${init.initialized} | turns: ${adv.advanced} | collapses: ${collapses.collapsed} | feuds: auto-pvp ${feuds.challenged}, consents ${feuds.consentsCreated}, deathmatches ${feuds.deathmatches}`);
}

// ─── Main fetch handler ─────────────────────────────────────

async function handleFetch(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  await getConfig(env); // warm cache

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = request.method;

  try {
    // Combat routes
    if (path === '/combat/initiate' && method === 'POST') return await handleInitiate(request, env);
    if (path === '/combat/accept'   && method === 'POST') return await handleAccept(request, env);
    if (path === '/combat/decline'  && method === 'POST') return await handleDecline(request, env);
    if (path === '/combat/incoming' && method === 'GET')  return await handleIncoming(request, env);
    if (path === '/combat/turn' && method === 'POST') return await handleTurn(request, env);
    if (path.startsWith('/combat/match/') && method === 'GET') {
      const id = path.split('/').pop();
      return await handleMatchGet(request, env, id);
    }
    if (path === '/combat/active' && method === 'GET') return await handleActiveList(env);
    if (path.startsWith('/combat/agent/') && path.endsWith('/active') && method === 'GET') {
      const id = path.split('/')[3];
      return await handleAgentActive(env, id);
    }
    if (path === '/combat/whisper' && method === 'POST') return await handleWhisper(request, env);
    if (path === '/combat/abilities' && method === 'GET') return await handleAbilities(env);

    // Feud routes
    if (path === '/feuds/event' && method === 'POST') return await handleFeudEvent(request, env);
    if (path.startsWith('/feuds/agent/') && method === 'GET') {
      const id = path.split('/').pop();
      return await handleFeudList(env, id);
    }
    if (path === '/feuds/hot' && method === 'GET') return await handleHotFeuds(env);

    // Crucible routes
    if (path === '/crucible/danger' && method === 'GET') {
      // Agents in reckless/death_wish/decoherence — backed by v_crucible_danger.
      const rows = (await sb.get(env, 'v_crucible_danger?select=*')) || [];
      return jsonResponse({ ok: true, count: rows.length, agents: rows });
    }
    if (path === '/crucible/check' && method === 'POST') return await handleCrucibleCheck(request, env);
    if (path.startsWith('/crucible/agent/') && method === 'GET') {
      const id = path.split('/').pop();
      return await handleCrucibleAgent(env, id);
    }
    if (path === '/crucible/whisper' && method === 'POST') return await handleCrucibleWhisper(request, env);

    // Health check
    if (path === '/' || path === '/health') {
      return jsonResponse({ ok: true, service: 'shellforge-combat-engine', version: '1.0' });
    }

    return errorResponse(`route not found: ${method} ${path}`, 404);
  } catch (err) {
    console.error(`[handler] ${err.stack || err.message}`);
    return errorResponse(`internal error: ${err.message}`, 500);
  }
}

// ─── Worker exports ─────────────────────────────────────────

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
};

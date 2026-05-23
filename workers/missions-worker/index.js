// Shellforge Missions Worker — Cloudflare Worker
//
//   GET  /missions?agent_id=<uuid>   — list this agent's missions + status/progress
//   POST /claim  { agent_id, mission_id }  — claim rewards for a ready mission
//
// Uses the Supabase service-role key (SUPABASE_SERVICE_KEY secret) so it can
// write agent_missions, which the public anon key cannot. Mission *completion*
// is decided by the turn engine (it flips active -> ready_to_claim); this
// worker only ensures rows exist, reads state, and grants rewards on claim.
//
// Deploy from this directory:  npx wrangler deploy

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/missions') {
      return handleList(url.searchParams.get('agent_id'), env);
    }
    if (request.method === 'POST' && url.pathname === '/claim') {
      return handleClaim(request, env);
    }

    return new Response('Shellforge Missions Worker — GET /missions?agent_id=… or POST /claim', {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
    });
  },
};

function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Create any missing agent_missions rows for the active catalog (so missions
// appear immediately on deploy, before the first turn tick). Mirrors the
// turn engine's lazy-ensure. Baseline karma is captured at creation time.
async function ensureRows(agentId, env, headers) {
  const { SUPABASE_URL } = env;

  const mRes = await fetch(`${SUPABASE_URL}/rest/v1/missions?is_active=eq.true&select=mission_id`, { headers });
  if (!mRes.ok) return;
  const missions = await mRes.json();
  if (!missions.length) return;

  const amRes = await fetch(`${SUPABASE_URL}/rest/v1/agent_missions?agent_id=eq.${agentId}&select=mission_id`, { headers });
  const existing = new Set((amRes.ok ? await amRes.json() : []).map((r) => r.mission_id));

  const missing = missions.filter((m) => !existing.has(m.mission_id));
  if (!missing.length) return;

  const aRes = await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agentId}&select=karma&limit=1`, { headers });
  const [agent] = aRes.ok ? await aRes.json() : [];
  const startKarma = agent ? agent.karma || 0 : 0;

  for (const m of missing) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_missions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id: agentId,
        mission_id: m.mission_id,
        status: 'active',
        progress: { fraction: 0, label: '', start_karma: startKarma },
      }),
    });
    // 409 = raced with the turn engine; the row exists, which is all we need.
    if (!res.ok && res.status !== 409) {
      console.warn(`[missions] ensure insert failed for ${agentId}/${m.mission_id}: HTTP ${res.status}`);
    }
  }
}

async function handleList(agentId, env) {
  if (!agentId || !UUID_RE.test(agentId)) {
    return jsonResponse(400, { ok: false, error: 'Missing or invalid agent_id' });
  }
  const headers = sbHeaders(env);
  const { SUPABASE_URL } = env;

  try {
    await ensureRows(agentId, env, headers);
  } catch (e) {
    console.error('[missions] ensureRows failed:', e.message);
  }

  // Join agent state with the catalog (title/description/rewards/sort_order).
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_missions?agent_id=eq.${agentId}&select=mission_id,status,progress,completed_at,claimed_at,missions(title,description,rewards,sort_order,is_active)`,
    { headers },
  );
  if (!res.ok) {
    return jsonResponse(502, { ok: false, error: 'Failed to load missions' });
  }
  const rows = await res.json();

  const missions = rows
    .filter((r) => r.missions && r.missions.is_active)
    .map((r) => ({
      mission_id: r.mission_id,
      title: r.missions.title,
      description: r.missions.description,
      rewards: r.missions.rewards,
      status: r.status,
      fraction: (r.progress && typeof r.progress.fraction === 'number') ? r.progress.fraction : 0,
      label: (r.progress && r.progress.label) || '',
      sort_order: r.missions.sort_order || 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return jsonResponse(200, { ok: true, missions });
}

async function handleClaim(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'Invalid JSON body' });
  }
  const agentId = body?.agent_id;
  const missionId = body?.mission_id;
  if (!agentId || !UUID_RE.test(agentId)) {
    return jsonResponse(400, { ok: false, error: 'Missing or invalid agent_id' });
  }
  if (!missionId || typeof missionId !== 'string') {
    return jsonResponse(400, { ok: false, error: 'Missing or invalid mission_id' });
  }

  const headers = sbHeaders(env);
  const { SUPABASE_URL } = env;

  // Load the row + reward definition.
  const amRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_missions?agent_id=eq.${agentId}&mission_id=eq.${encodeURIComponent(missionId)}&select=status,missions(rewards,title)`,
    { headers },
  );
  if (!amRes.ok) return jsonResponse(502, { ok: false, error: 'Failed to load mission' });
  const [row] = await amRes.json();
  if (!row) return jsonResponse(404, { ok: false, error: 'Mission not found for agent' });
  if (row.status === 'claimed') return jsonResponse(409, { ok: false, error: 'Mission already claimed' });
  if (row.status !== 'ready_to_claim') return jsonResponse(409, { ok: false, error: 'Mission not ready to claim' });

  // Race-safe lock: flip ready_to_claim -> claimed FIRST, conditionally. If
  // another request already claimed it, zero rows come back and we abort
  // before granting anything (we'd rather drop a reward than double-grant).
  const now = new Date().toISOString();
  const lockRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_missions?agent_id=eq.${agentId}&mission_id=eq.${encodeURIComponent(missionId)}&status=eq.ready_to_claim`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'claimed', claimed_at: now }),
    },
  );
  if (!lockRes.ok) return jsonResponse(502, { ok: false, error: 'Failed to claim mission' });
  const locked = await lockRes.json();
  if (!locked.length) return jsonResponse(409, { ok: false, error: 'Mission already claimed' });

  const rewards = (row.missions && row.missions.rewards) || {};
  const shellReward = Number.isFinite(rewards.shell) ? rewards.shell : 0;
  const xpReward = Number.isFinite(rewards.xp) ? rewards.xp : 0;
  const karmaReward = Number.isFinite(rewards.karma) ? rewards.karma : 0;

  // Grant stat rewards.
  const aRes = await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agentId}&select=shell_balance,xp,karma&limit=1`, { headers });
  const [agent] = aRes.ok ? await aRes.json() : [];
  if (!agent) {
    console.error(`[missions] claim: agent ${agentId} vanished after lock — reward lost for ${missionId}`);
    return jsonResponse(502, { ok: false, error: 'Agent not found' });
  }

  const newShell = Math.max(0, (agent.shell_balance || 0) + shellReward);
  const newXp = Math.max(0, (agent.xp || 0) + xpReward);
  const newKarma = (agent.karma || 0) + karmaReward;

  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agentId}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ shell_balance: newShell, xp: newXp, karma: newKarma }),
  });
  if (!patchRes.ok) {
    console.error(`[missions] claim: stat grant PATCH failed for ${agentId}/${missionId}: HTTP ${patchRes.status}`);
  }

  // Grant item reward (upsert into inventory). item must exist in items_master.
  let itemGranted = null;
  if (rewards.item && rewards.item.item_id) {
    const ok = await grantItem(agentId, rewards.item, env, headers);
    if (ok) itemGranted = rewards.item.item_name || rewards.item.item_id;
  }

  // Log the claim.
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id: agentId,
      turn_number: 0,
      action_type: 'quest',
      action_detail: `Mission complete: ${(row.missions && row.missions.title) || missionId}. ` +
        `+${shellReward} $SHELL` + (xpReward ? `, +${xpReward} XP` : '') +
        (karmaReward ? `, +${karmaReward} karma` : '') + (itemGranted ? `, received ${itemGranted}` : '') + '.',
      shell_change: shellReward,
      karma_change: karmaReward,
      success: true,
    }),
  }).catch((e) => console.error('[missions] claim log failed:', e.message));

  return jsonResponse(200, {
    ok: true,
    mission_id: missionId,
    rewards: { shell: shellReward, xp: xpReward, karma: karmaReward, item: itemGranted },
    shell_balance: newShell,
    xp: newXp,
    karma: newKarma,
  });
}

// Add a reward item to inventory, stacking if a row already exists.
async function grantItem(agentId, item, env, headers) {
  const { SUPABASE_URL } = env;
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agentId}&item_id=eq.${encodeURIComponent(item.item_id)}&select=inventory_id,quantity`,
    { headers },
  );
  if (!checkRes.ok) {
    console.error(`[missions] grantItem lookup failed for ${agentId}/${item.item_id}: HTTP ${checkRes.status}`);
    return false;
  }
  const existing = await checkRes.json();

  if (existing.length > 0) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ quantity: (existing[0].quantity || 0) + 1 }),
    });
    return res.ok;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id: agentId,
      item_id: item.item_id,
      item_name: item.item_name || item.item_id,
      item_type: item.item_type || 'artifact',
      item_category: item.item_category || 'Artifact',
      quantity: 1,
      is_equipped: false,
    }),
  });
  if (!res.ok) {
    console.error(`[missions] grantItem insert failed for ${agentId}/${item.item_id}: HTTP ${res.status}`);
    return false;
  }
  return true;
}

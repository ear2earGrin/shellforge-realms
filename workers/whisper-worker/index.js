// Shellforge Whisper Worker — Cloudflare Worker
// POST /whisper  — player sends a whisper to their agent
// Body: { agent_id: "<uuid>", message: "<text>", token: "<session token>" }
//
// Requires a session token from the auth-worker — the whisper must come from
// the agent's own Ghost (sessions.user_id must match agents.user_id).
//
// Server-side enforcement (the frontend check is advisory only):
//   - FREE_WHISPERS_PER_DAY per agent per UTC day (counted in the whispers table)
//   - MIN_SECONDS_BETWEEN_WHISPERS per agent (basic rate limit)
// On success: writes the whisper row (was_heard=true so the turn engine picks it
// up) and applies the coherence boost (+COHERENCE_BOOST, capped at 100) that the
// dashboard previously PATCHed onto agents directly with the anon key.

// Tunables — fold into game-config.json when the central config ships (brief.md rule 5).
const FREE_WHISPERS_PER_DAY = 2;
const MIN_SECONDS_BETWEEN_WHISPERS = 60;
const MAX_MESSAGE_LENGTH = 200; // matches the whispers.message CHECK constraint in the DB
const COHERENCE_BOOST = 15;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/whisper') {
      return handleWhisper(request, env);
    }

    return new Response('Shellforge Whisper Worker — POST /whisper to send a whisper', {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
    });
  },
};

async function handleWhisper(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const { agent_id, message, token } = body ?? {};

  if (!agent_id || typeof agent_id !== 'string') {
    return jsonError(400, 'Missing or invalid agent_id');
  }
  if (!token || typeof token !== 'string') {
    return jsonError(401, 'Missing session token — please log in');
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return jsonError(400, 'Missing or empty message');
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonError(400, `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  const supabaseHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Resolve the agent server-side — whispers.user_id is NOT NULL and must not
  // be client-claimed. Also grabs coherence for the boost below.
  const agentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${encodeURIComponent(agent_id)}&select=user_id,coherence,is_alive&limit=1`,
    { headers: supabaseHeaders },
  );
  if (!agentRes.ok) {
    console.error('Supabase agent lookup failed:', await agentRes.text());
    return jsonError(502, 'Failed to look up agent');
  }
  const [agent] = await agentRes.json();
  if (!agent) return jsonError(404, 'Agent not found');
  if (agent.is_alive === false) return jsonError(409, 'The dead hear no whispers.');

  // Session check — only the agent's own Ghost may whisper.
  const tokenDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = [...new Uint8Array(tokenDigest)].map(x => x.toString(16).padStart(2, '0')).join('');
  const sessRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sessions?token_hash=eq.${tokenHash}` +
      `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`,
    { headers: supabaseHeaders },
  );
  if (!sessRes.ok) {
    console.error('Supabase session lookup failed:', await sessRes.text());
    return jsonError(502, 'Failed to verify session');
  }
  const [session] = await sessRes.json();
  if (!session) return jsonError(401, 'Invalid or expired session — please log in again');
  if (session.user_id !== agent.user_id) return jsonError(403, 'Not your agent');

  // Today's whispers for this agent — daily limit + rate limit in one query.
  // whisper_date defaults to CURRENT_DATE in the DB (UTC).
  const today = new Date().toISOString().slice(0, 10);
  const recentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/whispers?agent_id=eq.${encodeURIComponent(agent_id)}` +
      `&whisper_date=eq.${today}&select=sent_at&order=sent_at.desc`,
    { headers: supabaseHeaders },
  );
  if (!recentRes.ok) {
    console.error('Supabase whisper count failed:', await recentRes.text());
    return jsonError(502, 'Failed to check whisper limit');
  }
  const todays = await recentRes.json();

  if (todays.length >= FREE_WHISPERS_PER_DAY) {
    return jsonError(429, `Daily whisper limit reached (${FREE_WHISPERS_PER_DAY}/day). The Ghost falls silent until tomorrow.`);
  }
  if (todays.length > 0) {
    const lastSentMs = Date.parse(todays[0].sent_at + 'Z');
    const secondsSince = (Date.now() - lastSentMs) / 1000;
    if (Number.isFinite(secondsSince) && secondsSince < MIN_SECONDS_BETWEEN_WHISPERS) {
      return jsonError(429, `Whispering too fast — wait ${Math.ceil(MIN_SECONDS_BETWEEN_WHISPERS - secondsSince)}s.`);
    }
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/whispers`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      agent_id,
      user_id: agent.user_id,
      message: message.trim(),
      was_heard: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Supabase whisper insert failed:', errText);
    return jsonError(502, 'Failed to save whisper');
  }

  const [row] = await res.json();

  // Coherence boost — Ghost contact stabilizes the agent.
  let newCoherence = null;
  try {
    newCoherence = Math.min(100, (agent.coherence ?? 50) + COHERENCE_BOOST);
    await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${encodeURIComponent(agent_id)}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ coherence: newCoherence }),
    });
  } catch (e) {
    console.error('Coherence boost failed (non-fatal):', e);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      whisper_id: row?.whisper_id ?? null,
      whispers_remaining: Math.max(0, FREE_WHISPERS_PER_DAY - todays.length - 1),
      coherence: newCoherence,
    }),
    { status: 201, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

function jsonError(status, message) {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

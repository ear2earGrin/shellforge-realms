// Shellforge API — Cloudflare Worker (stub)
// Reads the LIVE Supabase schema as-is. No turn engine yet.
//
// Endpoints:
//   POST /api/auth/login        — env-based test creds → JWT (TODO: real bcrypt against users table)
//   GET  /api/agent/status      — auth required
//   GET  /api/agent/activity    — auth required, ?limit&before pagination
//   GET  /api/whisper/status    — auth required
//   POST /api/whisper           — auth required, daily-limited, 50/50 wasHeard roll
//   GET  /api/recap             — 404 (graceful: PWA shows "no recap yet")
//   GET  /api/world/map         — 404 (graceful)

// ---------- CORS ----------

const ALLOWED_ORIGINS = [
  'https://shellforge.xyz',
  'https://app.shellforge.xyz',
  'http://localhost:5173',
  'http://localhost:3000',
  // Add the Lovable preview URL Lovable gave us:
  'https://id-preview--a399f8a9-e9f1-4b74-ae36-09d34343d225.lovable.app',
];
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/,
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin));
}

function corsHeaders(origin) {
  const allowed = isAllowedOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

// ---------- JWT (HS256, Web Crypto) ----------

function b64url(bytes) {
  let s;
  if (bytes instanceof Uint8Array) {
    s = btoa(String.fromCharCode(...bytes));
  } else {
    s = btoa(bytes);
  }
  return s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return atob(padded);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

async function verifyJWT(token, secret) {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const key = await hmacKey(secret);
    const sigBytes = Uint8Array.from(b64urlDecode(s), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(`${h}.${p}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(b64urlDecode(p));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireAuth(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return verifyJWT(token, env.JWT_SECRET);
}

// ---------- Supabase REST helper ----------

async function sb(env, path, opts = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

// ---------- Time helpers ----------

function nextUtcMidnight() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Feed tier ----------
// The live activity_log has no `tier` column, so derive it from action_type.
// milestone = rare/high-stakes beats; whisper = whisper-driven; else routine.
const MILESTONE_ACTIONS = new Set(['death', 'combat', 'arena', 'hazard', 'event', 'spawn']);
function deriveTier(actionType) {
  const a = (actionType || '').toLowerCase();
  if (a.includes('whisper')) return 'whisper';
  if (MILESTONE_ACTIONS.has(a)) return 'milestone';
  return 'routine';
}

// ---------- Handlers ----------

async function handleLogin(req, env, origin) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body || {};

  // STUB AUTH — env-based test account.
  // TODO: replace with `select * from users where username = $1` + bcrypt verify
  if (username === env.TEST_USERNAME && password === env.TEST_PASSWORD) {
    const token = await signJWT(
      {
        userId: env.TEST_USER_ID,
        agentId: env.TEST_AGENT_ID,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
      },
      env.JWT_SECRET
    );
    return json({ success: true, token, agentId: env.TEST_AGENT_ID }, 200, origin);
  }

  return json({ success: false, error: 'invalid_credentials' }, 401, origin);
}

async function handleAgentStatus(req, env, origin) {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: 'unauthorized' }, 401, origin);

  const r = await sb(env, `/agents?agent_id=eq.${auth.agentId}&select=*`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) {
    return json({ error: 'agent_not_found' }, 404, origin);
  }
  const a = rows[0];

  // The live schema has no current_action column — derive "what they're doing"
  // from the most recent activity_log row.
  let currentAction = 'idle';
  let currentActionDetail = null;
  const lastR = await sb(
    env,
    `/activity_log?agent_id=eq.${auth.agentId}&select=action_type,action_detail&order=timestamp.desc&limit=1`
  );
  const lastRows = await lastR.json();
  if (Array.isArray(lastRows) && lastRows.length) {
    currentAction = lastRows[0].action_type || 'idle';
    currentActionDetail = lastRows[0].action_detail ?? null;
  }

  return json(
    {
      agentId: a.agent_id,
      agentName: a.agent_name,
      archetype: a.archetype,
      archetypeName: a.archetype_name,
      cluster: a.cluster,
      bio: a.bio,
      energy: a.energy,
      health: a.health,
      karma: a.karma,
      shellBalance: a.shell_balance,
      location: a.location,
      locationDetail: a.location_detail,
      position: { x: a.position_x, y: a.position_y },
      currentAction,
      currentActionDetail,
      turnsTaken: a.turns_taken,
      daysSurvived: a.days_survived,
      isAlive: a.is_alive,
      lastActionAt: a.last_action_at,
      nextTurnAt: a.next_turn_at,
      createdAt: a.created_at,
      diedAt: a.died_at,
    },
    200,
    origin
  );
}

async function handleAgentActivity(req, env, origin) {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: 'unauthorized' }, 401, origin);

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 50);
  const before = url.searchParams.get('before');

  let query = `/activity_log?agent_id=eq.${auth.agentId}&select=*&order=timestamp.desc&limit=${limit}`;
  if (before) query += `&timestamp=lt.${encodeURIComponent(before)}`;

  const r = await sb(env, query);
  const rows = await r.json();

  const activities = (rows || []).map((row) => ({
    logId: row.log_id,
    turnNumber: row.turn_number,
    actionType: row.action_type,
    actionDetail: row.action_detail,
    energyCost: row.energy_cost,
    shellChange: row.shell_change,
    karmaChange: row.karma_change,
    itemsGained: row.items_gained,
    itemsLost: row.items_lost,
    timestamp: row.timestamp,
    tier: deriveTier(row.action_type),
    whisperId: null, // no whisper_id column on live activity_log
  }));

  return json(
    {
      activities,
      hasMore: rows && rows.length === limit,
      nextCursor: rows && rows.length ? rows[rows.length - 1].timestamp : null,
    },
    200,
    origin
  );
}

async function handleWhisperStatus(req, env, origin) {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: 'unauthorized' }, 401, origin);

  const today = todayUtcDate();
  const r = await sb(
    env,
    `/whispers?user_id=eq.${auth.userId}&whisper_date=eq.${today}&select=*&order=sent_at.desc`
  );
  const rows = (await r.json()) || [];

  const total = 2;
  const used = rows.length;

  return json(
    {
      whispersRemaining: Math.max(0, total - used),
      totalPerDay: total,
      nextReset: nextUtcMidnight(),
      recentWhispers: rows.slice(0, 5).map((w) => ({
        message: w.message,
        wasHeard: w.was_heard,
        sentAt: w.sent_at,
      })),
    },
    200,
    origin
  );
}

async function handleSendWhisper(req, env, origin) {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: 'unauthorized' }, 401, origin);

  const body = await req.json().catch(() => ({}));
  const message = (body.message || '').toString().slice(0, 280).trim();
  if (!message) return json({ success: false, error: 'empty_message' }, 400, origin);

  const today = todayUtcDate();
  const usedR = await sb(
    env,
    `/whispers?user_id=eq.${auth.userId}&whisper_date=eq.${today}&select=whisper_id`
  );
  const used = (await usedR.json()) || [];

  if (used.length >= 2) {
    return json(
      {
        success: false,
        error: 'no_slots',
        nextReset: nextUtcMidnight(),
      },
      429,
      origin
    );
  }

  // TODO: modify roll by karma, archetype personality, bio modifier keywords.
  // For the stub, flat 50/50. roll_value is persisted (live column).
  const roll = Math.random();
  const wasHeard = roll < 0.5;

  const insertR = await sb(env, '/whispers', {
    method: 'POST',
    body: JSON.stringify({
      user_id: auth.userId,
      agent_id: auth.agentId,
      message,
      was_heard: wasHeard,
      roll_value: roll,
      whisper_date: today,
    }),
  });
  const inserted = (await insertR.json()) || [];

  return json(
    {
      success: true,
      whisperId: inserted[0]?.whisper_id,
      wasHeard,
      whispersRemaining: Math.max(0, 2 - used.length - 1),
      nextReset: nextUtcMidnight(),
    },
    200,
    origin
  );
}

// ---------- Router ----------

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';

    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(req.url);
    const { pathname } = url;
    const m = req.method;

    try {
      if (m === 'POST' && pathname === '/api/auth/login') return handleLogin(req, env, origin);
      if (m === 'GET' && pathname === '/api/agent/status') return handleAgentStatus(req, env, origin);
      if (m === 'GET' && pathname === '/api/agent/activity') return handleAgentActivity(req, env, origin);
      if (m === 'GET' && pathname === '/api/whisper/status') return handleWhisperStatus(req, env, origin);
      if (m === 'POST' && pathname === '/api/whisper') return handleSendWhisper(req, env, origin);

      // Explicit 404s for endpoints Lovable said will handle gracefully
      if (pathname === '/api/recap' || pathname === '/api/world/map') {
        return json({ error: 'not_implemented_yet' }, 404, origin);
      }

      // Health check (no auth) — useful for Lovable to test connectivity + CORS
      if (m === 'GET' && pathname === '/health') {
        return json({ ok: true, service: 'shellforge-api', stub: true }, 200, origin);
      }

      return json({ error: 'not_found', path: pathname }, 404, origin);
    } catch (err) {
      return json(
        { error: 'server_error', detail: err.message || String(err) },
        500,
        origin
      );
    }
  },
};

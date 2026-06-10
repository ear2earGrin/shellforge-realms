// Shellforge Auth Worker — Cloudflare Worker
//
// The ONLY component that reads or writes users.password_hash (service key;
// the anon role is column-blocked by migration 0002). Issues opaque bearer
// session tokens; the DB stores only their sha256 (sessions.token_hash) and
// all player-mutating RPCs assert ownership via fn_session_user.
//
//   POST /auth/register  { username, email, password, agent }            → new account + agent
//   POST /auth/register  { token, agent }                                → rebirth: new agent for the session user
//   POST /auth/login     { username, password }                          → { token, user_id, agents }
//   POST /auth/logout    { token }
//   GET  /auth/session?token=...                                         → { user_id, agents }
//
// Hashing: PBKDF2-SHA256 via WebCrypto (native in Workers — bcrypt/argon2
// would need WASM). Format: pbkdf2$<iterations>$<salt_b64>$<hash_b64>.
// Legacy accounts carry password_hash = 'pending_real_auth' (passwords were
// never collected server-side before) — the first successful login claims
// the account by setting the hash from the supplied password.

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_DAYS = 30;
const MIN_PASSWORD_LENGTH = 8;
const LEGACY_HASH = 'pending_real_auth';

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
    try {
      if (request.method === 'POST' && url.pathname === '/auth/register') return await handleRegister(request, env);
      if (request.method === 'POST' && url.pathname === '/auth/login') return await handleLogin(request, env);
      if (request.method === 'POST' && url.pathname === '/auth/logout') return await handleLogout(request, env);
      if (request.method === 'GET' && url.pathname === '/auth/session') return await handleSession(url, env);
    } catch (err) {
      console.error('auth-worker error:', err.stack || err.message);
      return jsonError(500, 'internal error');
    }
    return new Response('Shellforge Auth Worker', { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' } });
  },
};

// ─── Supabase REST helpers (service role) ───────────────────

function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbGet(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
  if (!r.ok) throw new Error(`supabase GET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbPost(env, path, body, prefer = 'return=representation') {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: prefer },
    body: JSON.stringify(body),
  });
  return r;
}

async function sbPatch(env, path, body) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(env), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase PATCH ${path}: ${r.status} ${await r.text()}`);
}

// ─── Crypto ─────────────────────────────────────────────────

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function hashPassword(password, saltBytes = null, iterations = PBKDF2_ITERATIONS) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key, 256,
  );
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}

async function verifyPassword(password, stored) {
  const parts = (stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromB64(parts[2]);
  const recomputed = await hashPassword(password, salt, iterations);
  // Constant-time-ish compare
  const a = recomputed, b = stored;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Sessions ───────────────────────────────────────────────

async function createSession(env, userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const r = await sbPost(env, 'sessions', {
    user_id: userId,
    token_hash: await sha256Hex(token),
    expires_at: expires,
  }, 'return=minimal');
  if (!r.ok) throw new Error(`session insert failed: ${r.status} ${await r.text()}`);
  return { token, expires_at: expires };
}

async function sessionUser(env, token) {
  if (!token || token.length < 16) return null;
  const rows = await sbGet(env,
    `sessions?token_hash=eq.${await sha256Hex(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  return rows[0]?.user_id || null;
}

async function agentsForUser(env, userId) {
  return sbGet(env,
    `agents?user_id=eq.${userId}&select=agent_id,agent_name,is_alive,archetype_name,location,generation,line_name,died_at&order=is_alive.desc,created_at.desc`);
}

// ─── Handlers ───────────────────────────────────────────────

async function handleRegister(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'invalid JSON body'); }
  const { username, email, password, token, agent } = body ?? {};
  if (!agent || typeof agent !== 'object') return jsonError(400, 'missing agent payload');

  let userId = null;
  let passwordHash = null;

  if (token) {
    // Rebirth path: a logged-in Ghost deploys the next generation.
    userId = await sessionUser(env, token);
    if (!userId) return jsonError(401, 'invalid or expired session');
  } else {
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return jsonError(400, 'username must be at least 3 characters');
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return jsonError(400, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    passwordHash = await hashPassword(password);
  }

  const r = await sbPost(env, 'rpc/rpc_register_account', {
    p_username: username ? username.trim() : null,
    p_email: email || null,
    p_password_hash: passwordHash,
    p_agent: agent,
    p_user_id: userId,
  });
  const result = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = (result && (result.message || result.hint)) || 'registration failed';
    return jsonError(r.status === 401 ? 401 : 400, msg);
  }

  const session = token ? { token } : await createSession(env, result.user_id);
  return jsonOk(201, {
    token: session.token,
    user_id: result.user_id,
    agent_id: result.agent_id,
    generation: result.generation,
    line_name: result.line_name,
  });
}

async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'invalid JSON body'); }
  const { username, password } = body ?? {};
  if (!username || !password) return jsonError(400, 'username and password required');

  // Resolve the account: by users.username first, then by agent callsign.
  let users = await sbGet(env, `users?username=eq.${encodeURIComponent(username.trim())}&select=user_id,username,password_hash&limit=1`);
  if (users.length === 0) {
    const agents = await sbGet(env, `agents?agent_name=eq.${encodeURIComponent(username.trim())}&select=user_id&limit=1`);
    if (agents.length > 0) {
      users = await sbGet(env, `users?user_id=eq.${agents[0].user_id}&select=user_id,username,password_hash&limit=1`);
    }
  }
  if (users.length === 0) return jsonError(401, 'invalid credentials');
  const user = users[0];

  if (user.password_hash === LEGACY_HASH) {
    // Pre-auth account: passwords were never stored. First login claims the
    // account by setting the password supplied now.
    if (password.length < MIN_PASSWORD_LENGTH) {
      return jsonError(400, `this account has no password yet — choose one of at least ${MIN_PASSWORD_LENGTH} characters to claim it`);
    }
    await sbPatch(env, `users?user_id=eq.${user.user_id}`, { password_hash: await hashPassword(password) });
    console.log(`legacy account claimed: ${user.username}`);
  } else if (!(await verifyPassword(password, user.password_hash))) {
    return jsonError(401, 'invalid credentials');
  }

  await sbPatch(env, `users?user_id=eq.${user.user_id}`, { last_login: new Date().toISOString() });
  const session = await createSession(env, user.user_id);
  const agents = await agentsForUser(env, user.user_id);
  return jsonOk(200, { token: session.token, user_id: user.user_id, username: user.username, agents });
}

async function handleLogout(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'invalid JSON body'); }
  const token = body?.token;
  if (token) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/sessions?token_hash=eq.${await sha256Hex(token)}`, {
      method: 'DELETE',
      headers: sbHeaders(env),
    });
  }
  return jsonOk(200, { ok: true });
}

async function handleSession(url, env) {
  const token = url.searchParams.get('token');
  const userId = await sessionUser(env, token);
  if (!userId) return jsonError(401, 'invalid or expired session');
  const agents = await agentsForUser(env, userId);
  return jsonOk(200, { user_id: userId, agents });
}

// ─── Responses ──────────────────────────────────────────────

function jsonOk(status, obj) {
  return new Response(JSON.stringify({ ok: true, ...obj }), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
function jsonError(status, message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

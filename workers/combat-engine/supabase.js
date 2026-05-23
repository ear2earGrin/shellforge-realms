// ═══════════════════════════════════════════════════════════════
//  SUPABASE REST HELPERS
// ═══════════════════════════════════════════════════════════════
//  Thin wrapper around the PostgREST API. Uses service-role key
//  (bypasses RLS) since this Worker is the trusted backend.
//
//  All functions return parsed JSON or null on failure (logged).
// ═══════════════════════════════════════════════════════════════

export function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function req(env, method, pathAndQuery, body = null, prefer = null) {
  const url = `${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`;
  const headers = sbHeaders(env);
  if (prefer) headers.Prefer = prefer;
  const init = { method, headers };
  if (body !== null) init.body = JSON.stringify(body);
  const r = await fetch(url, init);
  if (!r.ok) {
    const text = await r.text().catch(() => '<unreadable>');
    console.error(`[supabase] ${method} ${pathAndQuery} ${r.status}: ${text}`);
    return null;
  }
  if (r.status === 204) return true;
  const text = await r.text();
  if (!text) return true;
  try { return JSON.parse(text); } catch { return text; }
}

export const sb = {
  get:    (env, q)            => req(env, 'GET',    q),
  post:   (env, q, body)      => req(env, 'POST',   q, body, 'return=representation'),
  insert: (env, q, body)      => req(env, 'POST',   q, body, 'return=minimal'),
  patch:  (env, q, body)      => req(env, 'PATCH',  q, body, 'return=minimal'),
  upsert: (env, q, body)      => req(env, 'POST',   q, body, 'resolution=merge-duplicates,return=minimal'),
  delete: (env, q)            => req(env, 'DELETE', q,  null, 'return=minimal'),
  rpc:    (env, fn, params)   => req(env, 'POST',   `rpc/${fn}`, params, 'return=representation'),
};

// Convenience: get single row or null
export async function getOne(env, table, eqClause) {
  const rows = await sb.get(env, `${table}?${eqClause}&limit=1`);
  if (!rows || !Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

// Normalize a feud pair (lexicographically sorted)
export function normalizeFeudPair(agentA, agentB) {
  if (agentA === agentB) throw new Error('Cannot feud with self');
  return agentA < agentB
    ? { agent_a: agentA, agent_b: agentB, swapped: false }
    : { agent_a: agentB, agent_b: agentA, swapped: true };
}

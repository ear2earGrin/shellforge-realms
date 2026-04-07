// Shellforge Whisper Worker — Cloudflare Worker
// POST /whisper  — player sends a whisper to their agent
// Body: { agent_id: "<uuid>", message: "<text>" }
// Writes a row to the whispers table (was_heard=true so the turn engine picks it up).

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

  const { agent_id, message } = body ?? {};

  if (!agent_id || typeof agent_id !== 'string') {
    return jsonError(400, 'Missing or invalid agent_id');
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return jsonError(400, 'Missing or empty message');
  }
  if (message.length > 500) {
    return jsonError(400, 'message must be 500 characters or fewer');
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  const supabaseHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/whispers`, {
    method: 'POST',
    headers: supabaseHeaders,
    body: JSON.stringify({
      agent_id,
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

  return new Response(
    JSON.stringify({ ok: true, whisper_id: row?.whisper_id ?? null }),
    { status: 201, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

function jsonError(status, message) {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

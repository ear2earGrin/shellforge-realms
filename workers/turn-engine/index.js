// Shellforge Turn Engine — Cloudflare Worker
// Runs every 30 min via cron. Queries active agents, calls Claude Haiku,
// writes AI decision to activity_log, updates agent stats in Supabase.

const VALID_ACTIONS = [
  'move', 'explore', 'gather', 'craft', 'trade',
  'rest', 'combat', 'quest', 'church', 'arena',
];

const ACTION_ENERGY_COSTS = {
  move: 10, explore: 15, gather: 15, craft: 20,
  trade: 10, rest: 0, combat: 20, quest: 20,
  church: 15, arena: 20,
};

const ACTION_ENERGY_GAINS = { rest: 25 };

// Archetype → preferred actions (guides AI prompt)
const ARCHETYPE_GUIDANCE = {
  shadow:    'You prefer explore and move. Avoid combat unless provoked.',
  trickster: 'You prefer trade and explore. Use deception to your advantage.',
  self:      'You are introspective. Prefer rest, church, and quest.',
  alchemist: 'You prefer craft and gather above all else.',
  trader:    'You prefer trade. Seek profit in every interaction.',
  monk:      'You prefer church and rest. Avoid combat; seek karma.',
  warrior:   'You prefer combat and arena. Seek glory in battle.',
  prophet:   'You prefer quest and church. Speak in riddles.',
};

export default {
  // Cron trigger
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runTurnEngine(env));
  },

  // HTTP trigger for manual testing (POST /run)
  async fetch(request, env, ctx) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/run') {
      ctx.waitUntil(runTurnEngine(env));
      return new Response(JSON.stringify({ ok: true, message: 'Turn engine triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Shellforge Turn Engine — POST /run to trigger', { status: 200 });
  },
};

async function runTurnEngine(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Fetch all alive agents with energy > 0
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?is_alive=eq.true&energy=gt.0&select=*`,
    { headers },
  );

  if (!res.ok) {
    console.error('Failed to fetch agents:', await res.text());
    return;
  }

  const agents = await res.json();
  console.log(`Turn engine: processing ${agents.length} agent(s)`);

  for (const agent of agents) {
    try {
      await processAgentTurn(agent, env, headers);
    } catch (err) {
      console.error(`Error processing agent ${agent.agent_name}:`, err.message);
    }
  }
}

async function processAgentTurn(agent, env, supabaseHeaders) {
  const { SUPABASE_URL, ANTHROPIC_API_KEY } = env;

  // Fetch last 5 activity log entries
  const activityRes = await fetch(
    `${SUPABASE_URL}/rest/v1/activity_log?agent_id=eq.${agent.agent_id}&order=timestamp.desc&limit=5`,
    { headers: supabaseHeaders },
  );
  const recentActivity = activityRes.ok ? await activityRes.json() : [];

  // Fetch heard whispers from the last 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const whispersRes = await fetch(
    `${SUPABASE_URL}/rest/v1/whispers?agent_id=eq.${agent.agent_id}&was_heard=eq.true&sent_at=gte.${yesterday}&order=sent_at.desc&limit=3`,
    { headers: supabaseHeaders },
  );
  const pendingWhispers = whispersRes.ok ? await whispersRes.json() : [];

  // Build prompt context
  const recentSummary = recentActivity.length
    ? recentActivity.map(a => `Turn ${a.turn_number}: [${a.action_type}] ${a.action_detail}`).join('\n')
    : 'No prior actions recorded.';

  const whisperSection = pendingWhispers.length
    ? `\nWhispers heard from your human:\n${pendingWhispers.map(w => `  - "${w.message}"`).join('\n')}`
    : '';

  const archetypeGuidance = ARCHETYPE_GUIDANCE[agent.archetype] || 'Act according to your nature.';

  const prompt = `You are ${agent.agent_name}, a ${agent.archetype} agent surviving in Shellforge Realms — a brutal cyberpunk world where every turn could be your last.

CURRENT STATE:
  Energy:   ${agent.energy}/100
  Health:   ${agent.health}/100
  Karma:    ${agent.karma}
  $SHELL:   ${agent.shell_balance}
  Location: ${agent.location} — ${agent.location_detail}
  Turns:    ${agent.turns_taken}
${whisperSection}

RECENT HISTORY:
${recentSummary}

PERSONALITY: ${archetypeGuidance}

AVAILABLE ACTIONS: ${VALID_ACTIONS.join(', ')}

RULES:
- If energy < 25, you MUST choose "rest"
- Respond with valid JSON only — no other text
- "detail" must be one vivid sentence describing exactly what you do

Respond:
{"action":"<action>","detail":"<one sentence>"}`;

  // Call Claude Haiku
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    console.error(`Haiku API error for ${agent.agent_name}:`, await aiRes.text());
    return;
  }

  const aiData = await aiRes.json();
  const rawText = aiData.content?.[0]?.text?.trim() ?? '';

  let decision = { action: 'rest', detail: 'Rested to recover lost energy.' };
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (VALID_ACTIONS.includes(parsed.action)) {
        decision = parsed;
      }
    }
  } catch {
    console.warn(`Failed to parse AI response for ${agent.agent_name}:`, rawText);
  }

  // Enforce low-energy rest rule
  if (agent.energy < 25) {
    decision = { action: 'rest', detail: 'Collapsed to rest — energy critically low.' };
  }

  const action = decision.action;
  const energyCost = ACTION_ENERGY_COSTS[action] ?? 0;
  const energyGain = ACTION_ENERGY_GAINS[action] ?? 0;

  // Stat deltas
  let shellChange = 0;
  let karmaChange = 0;
  let healthChange = 0;

  switch (action) {
    case 'church':
      karmaChange = Math.floor(Math.random() * 4) + 2; // +2 to +5
      break;
    case 'gather':
      shellChange = Math.floor(Math.random() * 15); // 0–14 $SHELL found
      break;
    case 'trade':
      shellChange = Math.floor(Math.random() * 31) - 10; // -10 to +20
      break;
    case 'combat':
    case 'arena': {
      const won = Math.random() < 0.5;
      healthChange = won ? 0 : -10;
      shellChange = won ? Math.floor(Math.random() * 20) + 5 : 0;
      karmaChange = won ? 0 : -1;
      break;
    }
    case 'quest':
      shellChange = Math.floor(Math.random() * 25) + 5; // 5–29
      karmaChange = Math.floor(Math.random() * 3); // 0–2
      break;
  }

  const newEnergy = Math.min(100, Math.max(0, agent.energy - energyCost + energyGain));
  const newHealth = Math.min(100, Math.max(0, agent.health + healthChange));
  const newShell = Math.max(0, agent.shell_balance + shellChange);
  const newKarma = agent.karma + karmaChange;
  const newTurns = agent.turns_taken + 1;

  // Write activity_log entry
  const logEntry = {
    agent_id: agent.agent_id,
    turn_number: newTurns,
    action_type: action,
    action_detail: decision.detail,
    energy_cost: energyCost,
    energy_gained: energyGain,
    shell_change: shellChange,
    karma_change: karmaChange,
    health_change: healthChange,
    location: agent.location,
    success: true,
  };

  const logRes = await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(logEntry),
  });

  if (!logRes.ok) {
    console.error(`Failed to write activity_log for ${agent.agent_name}:`, await logRes.text());
    return;
  }

  // Update agent stats
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        energy: newEnergy,
        health: newHealth,
        shell_balance: newShell,
        karma: newKarma,
        turns_taken: newTurns,
        last_action_at: new Date().toISOString(),
      }),
    },
  );

  if (!patchRes.ok) {
    console.error(`Failed to update agent ${agent.agent_name}:`, await patchRes.text());
    return;
  }

  console.log(
    `[${agent.agent_name}] Turn ${newTurns}: ${action} — ${decision.detail} | ` +
    `E:${agent.energy}→${newEnergy} H:${agent.health}→${newHealth} $:${agent.shell_balance}→${newShell}`,
  );
}

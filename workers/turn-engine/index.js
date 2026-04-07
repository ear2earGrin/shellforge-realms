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

const COMBAT_ACTIONS = ['attack', 'defend', 'special'];

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

  // Track agents already consumed by arena combat this turn
  const foughtAgents = new Set();

  for (const agent of agents) {
    if (foughtAgents.has(agent.agent_id)) continue; // already fought as opponent
    try {
      await processAgentTurn(agent, env, headers, agents, foughtAgents);
    } catch (err) {
      console.error(`Error processing agent ${agent.agent_name}:`, err.message);
    }
  }
}

async function processAgentTurn(agent, env, supabaseHeaders, allAgents, foughtAgents) {
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

  // --- Arena combat: wire real Haiku tier calls ---
  if (action === 'arena') {
    const arenaResult = await handleArenaCombat(agent, allAgents, foughtAgents, env, supabaseHeaders);
    if (arenaResult !== null) {
      // Arena handled everything (stats, logs, death). Skip normal turn update.
      return;
    }
    // Fallback: no opponent found — continue to random solo combat below
    decision.action = 'combat';
  }

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

// ─── Arena combat helpers ───────────────────────────────────────────────────

// Ask Haiku to choose an arena action for one agent in a given round.
async function getCombatAction(agent, opponentName, roundNum, myHealth, oppHealth, env) {
  const prompt = `You are ${agent.agent_name} (${agent.archetype}) in arena combat against ${opponentName}, Round ${roundNum}/3.
Your health: ${myHealth} | Opponent health: ${oppHealth}
Actions: attack (deals 15 dmg), defend (blocks 10 incoming dmg), special (deals 25 dmg but costs 10 hp).
Respond with JSON only: {"action":"attack"} or {"action":"defend"} or {"action":"special"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return 'attack';
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() ?? '';
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (COMBAT_ACTIONS.includes(parsed.action)) return parsed.action;
    }
  } catch { /* fall through */ }
  return 'attack';
}

// Resolve one combat round. Returns damage taken by each agent.
function resolveCombatRound(action1, action2) {
  // Offense: attack=15, special=25 (but costs 10 self), defend=0
  const offense1 = action1 === 'attack' ? 15 : action1 === 'special' ? 25 : 0;
  const offense2 = action2 === 'attack' ? 15 : action2 === 'special' ? 25 : 0;
  const selfDmg1 = action1 === 'special' ? 10 : 0;
  const selfDmg2 = action2 === 'special' ? 10 : 0;
  const block1   = action1 === 'defend'  ? 10 : 0;
  const block2   = action2 === 'defend'  ? 10 : 0;

  return {
    damage_to_agent1: Math.max(0, offense2 - block1) + selfDmg1,
    damage_to_agent2: Math.max(0, offense1 - block2) + selfDmg2,
  };
}

// Run a full arena match between two agents. Writes to arena_matches and
// combat_logs, updates both agents' stats, fires death flow if health hits 0.
// Returns a result object on success, or null if no opponent was available.
async function handleArenaCombat(agent, allAgents, foughtAgents, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();

  // Find an eligible opponent: alive, has energy, not the same agent, not already fought
  const opponent = allAgents.find(a =>
    a.agent_id !== agent.agent_id &&
    a.is_alive &&
    a.energy > 0 &&
    !foughtAgents.has(a.agent_id),
  );

  if (!opponent) {
    console.log(`[${agent.agent_name}] Arena: no eligible opponent found — falling back to solo combat.`);
    return null;
  }

  // Reserve both agents so the main loop skips the opponent
  foughtAgents.add(agent.agent_id);
  foughtAgents.add(opponent.agent_id);

  console.log(`[ARENA] ${agent.agent_name} vs ${opponent.agent_name} — fight!`);

  // Create the arena_match record
  const matchRes = await fetch(`${SUPABASE_URL}/rest/v1/arena_matches`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      agent1_id: agent.agent_id,
      agent2_id: opponent.agent_id,
      status: 'in_progress',
    }),
  });

  if (!matchRes.ok) {
    console.error('[ARENA] Failed to create arena_match:', await matchRes.text());
    return null;
  }

  const [match] = await matchRes.json();
  const matchId = match.match_id;

  // Run up to 3 rounds
  let health1 = agent.health;
  let health2 = opponent.health;
  let totalRounds = 0;

  for (let round = 1; round <= 3; round++) {
    if (health1 <= 0 || health2 <= 0) break;

    // Both agents ask Haiku simultaneously
    const [action1, action2] = await Promise.all([
      getCombatAction(agent,    opponent.agent_name, round, health1, health2, env),
      getCombatAction(opponent, agent.agent_name,    round, health2, health1, env),
    ]);

    const { damage_to_agent1, damage_to_agent2 } = resolveCombatRound(action1, action2);

    health1 = Math.max(0, health1 - damage_to_agent1);
    health2 = Math.max(0, health2 - damage_to_agent2);
    totalRounds = round;

    const narrative =
      `Round ${round}: ${agent.agent_name} chose ${action1}, ${opponent.agent_name} chose ${action2}. ` +
      (damage_to_agent1 > 0 ? `${agent.agent_name} took ${damage_to_agent1} dmg. ` : '') +
      (damage_to_agent2 > 0 ? `${opponent.agent_name} took ${damage_to_agent2} dmg.` : '');

    await fetch(`${SUPABASE_URL}/rest/v1/combat_logs`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        match_id: matchId,
        round_number: round,
        agent1_action: action1,
        agent2_action: action2,
        agent1_damage: damage_to_agent1,
        agent2_damage: damage_to_agent2,
        narrative,
      }),
    });

    console.log(`[ARENA] ${narrative}`);
  }

  // Determine winner (higher remaining health wins; ties broken randomly)
  const agent1Wins = health1 > health2 || (health1 === health2 && Math.random() < 0.5);
  const winner   = agent1Wins ? agent    : opponent;
  const loser    = agent1Wins ? opponent : agent;
  const loserHP  = agent1Wins ? health2  : health1;
  const winnerHP = agent1Wins ? health1  : health2;
  const shellPrize = 30;
  const loserIsAlive = loserHP > 0;

  // Finalise arena_match
  await fetch(`${SUPABASE_URL}/rest/v1/arena_matches?match_id=eq.${matchId}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      winner_id: winner.agent_id,
      total_rounds: totalRounds,
      shell_transferred: shellPrize,
      status: 'complete',
      ended_at: now,
    }),
  });

  // Update winner: grant $SHELL, deduct energy, increment turns
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${winner.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      shell_balance: winner.shell_balance + shellPrize,
      energy:        Math.max(0, winner.energy - 20),
      turns_taken:   winner.turns_taken + 1,
      last_action_at: now,
    }),
  });

  // Update loser: reduce health, deduct energy, increment turns; death if HP=0
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${loser.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      health:     loserHP,
      energy:     Math.max(0, loser.energy - 20),
      is_alive:   loserIsAlive,
      died_at:    loserIsAlive ? null : now,
      turns_taken: loser.turns_taken + 1,
      last_action_at: now,
    }),
  });

  // activity_log for winner
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:     winner.agent_id,
      turn_number:  winner.turns_taken + 1,
      action_type:  'arena',
      action_detail: `Defeated ${loser.agent_name} in arena combat (${totalRounds} rounds). Earned ${shellPrize} $SHELL.`,
      energy_cost:  20,
      energy_gained: 0,
      shell_change: shellPrize,
      karma_change: 0,
      health_change: winnerHP - winner.health,
      location:     winner.location,
      success:      true,
    }),
  });

  // activity_log for loser (death action_type if health=0)
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:     loser.agent_id,
      turn_number:  loser.turns_taken + 1,
      action_type:  loserIsAlive ? 'arena' : 'death',
      action_detail: loserIsAlive
        ? `Lost arena combat against ${winner.agent_name} in ${totalRounds} rounds. Health reduced to ${loserHP}.`
        : `Killed by ${winner.agent_name} in arena combat. Death comes for us all.`,
      energy_cost:  20,
      energy_gained: 0,
      shell_change: 0,
      karma_change: 0,
      health_change: loserHP - loser.health,
      location:     loser.location,
      success:      false,
    }),
  });

  console.log(
    `[ARENA] ${winner.agent_name} wins! ${loser.agent_name} hp=${loserHP}. ` +
    (loserIsAlive ? 'Alive.' : 'DEAD — death flow triggered.'),
  );

  return { winnerId: winner.agent_id, loserId: loser.agent_id, loserIsAlive };
}

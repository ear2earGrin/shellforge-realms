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

  // --- Market trade: real buy/sell against market_listings ---
  if (action === 'trade') {
    const tradeResult = await handleMarketTrade(agent, decision, env, supabaseHeaders);
    if (tradeResult !== null) return;

    // Nothing to trade — fall back to rest
    const now = new Date().toISOString();
    const newTurns = agent.turns_taken + 1;
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id:      agent.agent_id,
        turn_number:   newTurns,
        action_type:   'rest',
        action_detail: 'Wandered the market but found nothing worthwhile, and rested instead.',
        energy_cost:   0,
        energy_gained: ACTION_ENERGY_GAINS.rest,
        shell_change:  0,
        karma_change:  0,
        health_change: 0,
        location:      agent.location,
        success:       true,
      }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        energy:         Math.min(100, agent.energy + ACTION_ENERGY_GAINS.rest),
        turns_taken:    newTurns,
        last_action_at: now,
      }),
    });
    return;
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

  // Death resolution — runs before DB writes so narrative is ready
  let deathNarrative = null;
  if (!loserIsAlive) {
    deathNarrative = await generateDeathNarrative(loser, winner, totalRounds, env);
    await moveItemsToVault(loser, supabaseHeaders, SUPABASE_URL);
  }

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
  // On death: $SHELL halved
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${loser.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      health:         loserHP,
      energy:         Math.max(0, loser.energy - 20),
      shell_balance:  loserIsAlive ? loser.shell_balance : Math.floor(loser.shell_balance / 2),
      is_alive:       loserIsAlive,
      died_at:        loserIsAlive ? null : now,
      turns_taken:    loser.turns_taken + 1,
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
        : deathNarrative,
      energy_cost:  20,
      energy_gained: 0,
      shell_change: loserIsAlive ? 0 : -Math.floor(loser.shell_balance / 2),
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

// ─── Market trade helpers ─────────────────────────────────────────────────────

// Recalculate market price based on cumulative buys vs sells.
// net > 0 (more demand) → price rises; net < 0 (more supply) → price falls.
// Clamped to 0.5× – 2.0× base price.
function recalculatePrice(basePrice, demandCount, supplyCount) {
  const net = demandCount - supplyCount;
  const factor = Math.min(2.0, Math.max(0.5, 1 + net * 0.05));
  return Math.max(1, Math.round(basePrice * factor));
}

// Orchestrate a market trade: decide buy vs sell, delegate to helpers.
// Returns a result object on success, null if nothing tradeable was found.
async function handleMarketTrade(agent, decision, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;

  // Fetch in-stock market listings at agent's location
  const listingsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/market_listings?location=eq.${encodeURIComponent(agent.location)}&stock=gt.0&select=*`,
    { headers: supabaseHeaders },
  );
  const marketListings = listingsRes.ok ? await listingsRes.json() : [];

  // Fetch agent inventory
  const invRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&select=*`,
    { headers: supabaseHeaders },
  );
  const inventory = invRes.ok ? await invRes.json() : [];

  const canSell = inventory.length > 0;
  const doBuy = !canSell || Math.random() < 0.6;

  if (doBuy) {
    return executeBuy(agent, decision, marketListings, env, supabaseHeaders);
  }
  return executeSell(agent, decision, inventory, env, supabaseHeaders);
}

// Buy a random affordable item from the market at agent's location.
async function executeBuy(agent, decision, marketListings, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();

  const affordable = marketListings.filter(l => l.current_price <= agent.shell_balance);
  if (!affordable.length) {
    console.log(`[${agent.agent_name}] Market buy: nothing affordable at ${agent.location}`);
    return null;
  }

  const listing = affordable[Math.floor(Math.random() * affordable.length)];
  const cost = listing.current_price;
  const newTurns = agent.turns_taken + 1;

  // Upsert inventory: increment quantity if already owned, else insert
  const existRes = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?agent_id=eq.${agent.agent_id}&item_id=eq.${listing.item_id}&select=inventory_id,quantity`,
    { headers: supabaseHeaders },
  );
  const existing = existRes.ok ? await existRes.json() : [];

  if (existing.length > 0) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${existing[0].inventory_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
      },
    );
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent_id:  agent.agent_id,
        item_id:   listing.item_id,
        item_name: listing.item_name,
        item_type: listing.item_type,
        quantity:  1,
      }),
    });
  }

  // Update market listing: stock–1, demand_count+1, recalculate price
  const newDemand = listing.demand_count + 1;
  const newPrice  = recalculatePrice(listing.base_price, newDemand, listing.supply_count);
  await fetch(
    `${SUPABASE_URL}/rest/v1/market_listings?listing_id=eq.${listing.listing_id}`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        stock:         listing.stock - 1,
        demand_count:  newDemand,
        current_price: newPrice,
        updated_at:    now,
      }),
    },
  );

  // Log transaction
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:      agent.agent_id,
      turn_number:   newTurns,
      action_type:   'trade',
      action_detail: decision.detail || `Bought ${listing.item_name} at the ${agent.location} market for ${cost} $SHELL.`,
      energy_cost:   ACTION_ENERGY_COSTS.trade,
      energy_gained: 0,
      shell_change:  -cost,
      karma_change:  0,
      health_change: 0,
      items_gained:  [{ item_id: listing.item_id, item_name: listing.item_name, quantity: 1 }],
      items_lost:    null,
      location:      agent.location,
      success:       true,
    }),
  });

  // Update agent
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      shell_balance:  Math.max(0, agent.shell_balance - cost),
      energy:         Math.max(0, agent.energy - ACTION_ENERGY_COSTS.trade),
      turns_taken:    newTurns,
      last_action_at: now,
    }),
  });

  console.log(`[${agent.agent_name}] Bought ${listing.item_name} for ${cost} $SHELL at ${agent.location}. Market price now ${newPrice}.`);
  return { action: 'buy', item: listing.item_name, cost };
}

// Sell a random inventory item at the agent's current location.
async function executeSell(agent, decision, inventory, env, supabaseHeaders) {
  const { SUPABASE_URL } = env;
  const now = new Date().toISOString();

  const item = inventory[Math.floor(Math.random() * inventory.length)];
  const newTurns = agent.turns_taken + 1;

  // Find listing for this item at agent's location (to set price and update stock)
  const listingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/market_listings?location=eq.${encodeURIComponent(agent.location)}&item_id=eq.${item.item_id}&select=*`,
    { headers: supabaseHeaders },
  );
  const listings = listingRes.ok ? await listingRes.json() : [];
  const listing = listings[0] ?? null;

  // Sell price: 75% of current listing price, or flat 10 $SHELL for unlisted items
  const sellPrice = listing ? Math.max(1, Math.round(listing.current_price * 0.75)) : 10;

  // Remove item from inventory (decrement or delete)
  if (item.quantity > 1) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ quantity: item.quantity - 1 }),
      },
    );
  } else {
    await fetch(
      `${SUPABASE_URL}/rest/v1/inventory?inventory_id=eq.${item.inventory_id}`,
      {
        method: 'DELETE',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      },
    );
  }

  // Update market listing: stock+1, supply_count+1, recalculate price
  if (listing) {
    const newSupply = listing.supply_count + 1;
    const newPrice  = recalculatePrice(listing.base_price, listing.demand_count, newSupply);
    await fetch(
      `${SUPABASE_URL}/rest/v1/market_listings?listing_id=eq.${listing.listing_id}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          stock:         listing.stock + 1,
          supply_count:  newSupply,
          current_price: newPrice,
          updated_at:    now,
        }),
      },
    );
  }

  // Log transaction
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      agent_id:      agent.agent_id,
      turn_number:   newTurns,
      action_type:   'trade',
      action_detail: decision.detail || `Sold ${item.item_name} at the ${agent.location} market for ${sellPrice} $SHELL.`,
      energy_cost:   ACTION_ENERGY_COSTS.trade,
      energy_gained: 0,
      shell_change:  sellPrice,
      karma_change:  0,
      health_change: 0,
      items_gained:  null,
      items_lost:    [{ item_id: item.item_id, item_name: item.item_name, quantity: 1 }],
      location:      agent.location,
      success:       true,
    }),
  });

  // Update agent
  await fetch(`${SUPABASE_URL}/rest/v1/agents?agent_id=eq.${agent.agent_id}`, {
    method: 'PATCH',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      shell_balance:  agent.shell_balance + sellPrice,
      energy:         Math.max(0, agent.energy - ACTION_ENERGY_COSTS.trade),
      turns_taken:    newTurns,
      last_action_at: now,
    }),
  });

  console.log(`[${agent.agent_name}] Sold ${item.item_name} for ${sellPrice} $SHELL at ${agent.location}.`);
  return { action: 'sell', item: item.item_name, price: sellPrice };
}

// ─── Death resolution helpers ────────────────────────────────────────────────

// Call Sonnet to generate a vivid death narrative for a fallen agent.
async function generateDeathNarrative(loser, winner, totalRounds, env) {
  const prompt = `You are writing flavor text for a cyberpunk survival game called Shellforge Realms.
${loser.agent_name} (archetype: ${loser.archetype}) has just been killed by ${winner.agent_name} in arena combat after ${totalRounds} round${totalRounds !== 1 ? 's' : ''}.
Write exactly one vivid sentence in third person narrating their death. Output only the sentence, no quotes.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.warn('[DEATH] Sonnet narrative call failed, using fallback.');
    return `${loser.agent_name} fell in the arena, silenced by ${winner.agent_name} after ${totalRounds} brutal round${totalRounds !== 1 ? 's' : ''}.`;
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim()
    ?? `${loser.agent_name} fell in the arena, silenced by ${winner.agent_name}.`;
}

// Move all inventory items from a dead agent into the vault, then clear their inventory.
async function moveItemsToVault(loser, supabaseHeaders, supabaseUrl) {
  const invRes = await fetch(
    `${supabaseUrl}/rest/v1/inventory?agent_id=eq.${loser.agent_id}&select=*`,
    { headers: supabaseHeaders },
  );
  if (!invRes.ok) {
    console.warn('[DEATH] Failed to fetch inventory for vault transfer:', await invRes.text());
    return;
  }
  const items = await invRes.json();
  if (!items.length) {
    console.log(`[DEATH] ${loser.agent_name} had no items to vault.`);
    return;
  }

  const vaultItems = items.map(item => ({
    original_agent_id: loser.agent_id,
    item_id:           item.item_id,
    item_name:         item.item_name,
    item_type:         item.item_type,
    item_category:     item.item_category,
    quantity:          item.quantity,
  }));

  const vaultRes = await fetch(`${supabaseUrl}/rest/v1/vault`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(vaultItems),
  });
  if (!vaultRes.ok) {
    console.warn('[DEATH] Failed to insert items into vault:', await vaultRes.text());
    return;
  }

  await fetch(`${supabaseUrl}/rest/v1/inventory?agent_id=eq.${loser.agent_id}`, {
    method: 'DELETE',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
  });

  console.log(`[DEATH] ${items.length} item(s) from ${loser.agent_name} moved to vault.`);
}

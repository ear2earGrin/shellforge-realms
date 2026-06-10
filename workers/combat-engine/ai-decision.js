// ═══════════════════════════════════════════════════════════════
//  AI DECISION MODULE — tiered (Tier 1 Rule 2)
// ═══════════════════════════════════════════════════════════════
//  Per-turn ability selection. Tier routing:
//    - Routine turns (no pending whisper) → Groq Llama 3.1 8B
//    - Whisper turns (Ghost suggestion pending) → Claude Haiku
//    - Fallback — archetype-weighted random if the tier's key is
//      missing or the call fails (counted as "fallback")
//
//  Whisper compliance roll happens BEFORE the model call:
//    - Roll based on archetype + karma + state (tunables in config)
//    - Pass → play the suggested card directly (exact name match)
//    - Fail / free-form → Haiku decides with the whisper in context
//
//  Every AI call is tallied per match in combat_matches.tier_usage
//  ({"groq":n,"haiku":n,"sonnet":n,"fallback":n}) so spend per
//  match is measurable.
// ═══════════════════════════════════════════════════════════════

import { syncConfig } from './config-loader.js';
import { sb, getOne } from './supabase.js';

// Archetype tendencies — used for fallback decisions and compliance bonuses
const ARCHETYPE_PROFILES = {
  '0-Day Primer':        { aggression: 0.7, defense: 0.3, prefer: ['ATK','DEBUFF'] },
  'Consensus Node':      { aggression: 0.4, defense: 0.6, prefer: ['BUFF','DEF'] },
  '0xOracle':            { aggression: 0.5, defense: 0.5, prefer: ['UTIL','ATK'] },
  'Binary Sculptr':      { aggression: 0.4, defense: 0.6, prefer: ['BUFF','DEF'] },
  '0xAdversarial':       { aggression: 0.85, defense: 0.15, prefer: ['ATK','DEBUFF'] },
  'Root Auth':           { aggression: 0.6, defense: 0.4, prefer: ['ATK','BUFF'] },
  'Buffer Sentinel':     { aggression: 0.25, defense: 0.75, prefer: ['DEF','HEAL'] },
  'Noise Injector':      { aggression: 0.5, defense: 0.5, prefer: ['DEBUFF','UTIL'] },
  'Ordinate Mapper':     { aggression: 0.5, defense: 0.5, prefer: ['UTIL','ATK'] },
  'DDoS Insurgent':      { aggression: 0.8, defense: 0.2, prefer: ['ATK','DEBUFF'] },
  'Bound Encryptor':     { aggression: 0.35, defense: 0.65, prefer: ['DEF','BUFF'] },
  'Morph Layer':         { aggression: 0.55, defense: 0.45, prefer: ['BUFF','UTIL'] },
};

function profileFor(archetype) {
  return ARCHETYPE_PROFILES[archetype] || { aggression: 0.5, defense: 0.5, prefer: ['ATK'] };
}

/**
 * Score a card for an archetype's tendency. Higher = more likely to pick.
 */
function scoreCard(card, profile, agentState) {
  let score = 1.0;

  // Type preference
  if (profile.prefer.includes(card.type)) score += 0.5;

  // Aggression-based weighting
  if (card.type === 'ATK' || card.type === 'DEBUFF' || card.type === 'TRAP') {
    score += profile.aggression;
  }
  if (card.type === 'DEF' || card.type === 'HEAL' || card.type === 'BUFF') {
    score += profile.defense;
  }

  // Self-preservation: if HP low, weight HEAL/DEF higher
  const hpRatio = agentState.hp / agentState.hp_max;
  if (hpRatio < 0.3 && (card.type === 'HEAL' || card.type === 'DEF')) score += 1.5;
  if (hpRatio < 0.5 && card.type === 'HEAL') score += 0.5;

  // Coherence efficiency: cheaper cards are slightly preferred when low coherence
  if (agentState.coherence < 4 && card.coherence_cost <= 2) score += 0.3;

  // Power consideration: higher power for ATK cards is appealing
  if (card.type === 'ATK') score += (card.power / 30);

  // One-time abilities held back unless desperate
  if (card.one_time && hpRatio > 0.5) score *= 0.4;

  return Math.max(0.05, score);
}

/**
 * Pick a card via weighted random based on archetype scores.
 * Used as fallback when Haiku is unavailable or returns garbage.
 */
export function pickCardFallback(playableHand, archetype, agentState) {
  if (!playableHand || playableHand.length === 0) return null;
  const profile = profileFor(archetype);
  const scored = playableHand.map(c => ({ card: c, score: scoreCard(c, profile, agentState) }));
  const total = scored.reduce((s, x) => s + x.score, 0);
  let roll = Math.random() * total;
  for (const x of scored) {
    roll -= x.score;
    if (roll <= 0) return x.card;
  }
  return scored[scored.length - 1].card;
}

/**
 * Build the compact prompt context for Haiku decision.
 */
function buildDecisionPrompt(agent, opponent, playableHand, whisper, turnNum, recentTurns) {
  const handSummary = playableHand.slice(0, 14).map((c, i) =>
    `${i+1}. ${c.ability_name} [${c.type}] ⚡${c.coherence_cost} pwr=${c.power}${c.one_time ? ' (1-shot)' : ''}`
  ).join('\n');

  const whisperLine = whisper
    ? `\nGHOST WHISPER: "${whisper.suggestion}" (${whisper.is_premium ? 'premium' : 'free'})`
    : '';

  const recentSummary = (recentTurns || []).slice(-3).map(t =>
    `T${t.turn_number}: you ${t.agent_a_action?.ability_name || '—'}, foe ${t.agent_b_action?.ability_name || '—'}`
  ).join(' | ');

  return `You are ${agent.archetype} in combat (cluster: ${agent.cluster}).
Turn ${turnNum}/20.
You: HP ${agent.hp}/${agent.hp_max}, ⚡${agent.coherence}/${agent.coherence_max}
Foe: HP ${opponent.hp}/${opponent.hp_max}, ⚡${opponent.coherence}/${opponent.coherence_max}
${recentSummary ? `Recent: ${recentSummary}` : ''}

Available cards:
${handSummary}
${whisperLine}

Pick ONE card. Respond with ONLY the card number (1-${playableHand.length}). No explanation. No punctuation. Just the number.`;
}

/**
 * Call Haiku to pick a card. Returns the response text or null on failure.
 */
async function callHaikuForDecision(env, prompt) {
  const cfg = syncConfig().ai;
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[ai-decision] ANTHROPIC_API_KEY not set, using fallback');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.decision_timeout_ms);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.haiku_model,
        max_tokens: cfg.haiku_max_tokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[ai-decision] Haiku HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim() || '';
    return text;
  } catch (e) {
    console.error(`[ai-decision] Haiku call failed: ${e.message}`);
    return null;
  }
}

/**
 * Call Groq (Llama 3.1 8B, OpenAI chat format) to pick a card.
 * Routine-turn tier. Returns the response text or null on failure.
 */
async function callGroqForDecision(env, prompt) {
  const cfg = syncConfig().ai;
  if (!env.GROQ_API_KEY) {
    console.warn('[ai-decision] GROQ_API_KEY not set, using fallback');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.decision_timeout_ms);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.groq_model,
        max_tokens: cfg.groq_max_tokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[ai-decision] Groq HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    return text;
  } catch (e) {
    console.error(`[ai-decision] Groq call failed: ${e.message}`);
    return null;
  }
}

/**
 * Increment combat_matches.tier_usage counters for AI calls made on
 * behalf of a match. Read-modify-write — fine inside the per-turn
 * resolver, which processes one match at a time.
 */
export async function recordTierUsage(env, matchId, tiers) {
  const used = (tiers || []).filter(Boolean);
  if (!matchId || used.length === 0) return;
  const match = await getOne(env, 'combat_matches', `id=eq.${matchId}&select=tier_usage`);
  const usage = { ...((match && match.tier_usage) || {}) };
  for (const t of used) usage[t] = (usage[t] || 0) + 1;
  await sb.patch(env, `combat_matches?id=eq.${matchId}`, { tier_usage: usage });
}

/**
 * Roll for whisper compliance.
 * @returns {object} { followed, rollValue, threshold }
 */
export function rollWhisperCompliance(whisper, agent, opponent) {
  const cfg = syncConfig().whisper;
  let threshold = cfg.base_compliance;

  // Archetype match: if whisper aligns with archetype tendency, +bonus
  const profile = profileFor(agent.archetype);
  if (whisper.suggestion?.toLowerCase().includes('attack') && profile.aggression > 0.6) {
    threshold += cfg.archetype_match_bonus;
  }
  if (whisper.suggestion?.toLowerCase().includes('defend') && profile.defense > 0.6) {
    threshold += cfg.archetype_match_bonus;
  }

  // Karma alignment — high karma pulls compliance up, negative pulls it down
  threshold += ((agent.karma || 0) / 100) * cfg.karma_compliance_scale;

  // Self-preservation: agent won't follow obviously suicidal whispers
  const hpRatio = agent.hp / agent.hp_max;
  if (hpRatio < 0.2 && whisper.suggestion?.toLowerCase().includes('attack')) {
    threshold += cfg.suicidal_suggestion_penalty;
  }

  // Premium whispers carry weight
  if (whisper.is_premium) threshold += cfg.premium_compliance_bonus;

  threshold = Math.max(0.05, Math.min(0.95, threshold));
  const roll = Math.random();
  return { followed: roll < threshold, rollValue: roll, threshold };
}

/**
 * Main decision entry point.
 *
 * @returns {object} { card, source, whisper_followed, fallback_used, compliance, tier }
 *   tier = which AI tier was billed for this decision
 *          ('groq' | 'haiku' | 'fallback' | null when no call was made)
 */
export async function decideAction(env, agent, opponent, playableHand, whisper, turnNum, recentTurns) {
  if (!playableHand || playableHand.length === 0) {
    // Should never happen — basic strike is always in deck
    return { card: null, source: 'none', whisper_followed: false, fallback_used: true, compliance: null, tier: null };
  }

  // 1. If a whisper exists, roll compliance first. A passing roll on an
  //    exact card-name suggestion plays that card directly (no model call).
  let compliance = null;
  if (whisper && whisper.suggestion) {
    compliance = rollWhisperCompliance(whisper, agent, opponent);
    const target = playableHand.find(c =>
      c.ability_name.toLowerCase() === whisper.suggestion.toLowerCase()
    );
    if (target && compliance.followed) {
      return {
        card: target, source: 'whisper', whisper_followed: true,
        fallback_used: false, compliance, tier: null,
      };
    }
  }

  // 2. Model decision. Tier routing (Tier 1 Rule 2):
  //    pending whisper → Haiku; routine turn → Groq.
  const cfg = syncConfig().ai;
  const prompt = buildDecisionPrompt(agent, opponent, playableHand, whisper, turnNum, recentTurns);
  const tier = whisper ? 'haiku' : 'groq';
  const resp = tier === 'haiku'
    ? await callHaikuForDecision(env, prompt)
    : await callGroqForDecision(env, prompt);

  if (resp) {
    const num = parseInt(resp.match(/\d+/)?.[0] || '0', 10);
    if (num >= 1 && num <= playableHand.length) {
      const card = playableHand[num - 1];
      // If the model organically picked the whispered card, that still counts as followed
      const followed = !!(whisper?.suggestion &&
        card.ability_name.toLowerCase() === whisper.suggestion.toLowerCase());
      return { card, source: tier, whisper_followed: followed, fallback_used: false, compliance, tier };
    }
  }

  // 3. Fallback: archetype-weighted random (key missing or call failed)
  if (!cfg.fallback_to_random_on_failure) {
    return { card: null, source: 'none', whisper_followed: false, fallback_used: true, compliance, tier: 'fallback' };
  }

  return {
    card: pickCardFallback(playableHand, agent.archetype, agent),
    source: 'fallback',
    whisper_followed: false,
    fallback_used: true,
    compliance,
    tier: 'fallback',
  };
}

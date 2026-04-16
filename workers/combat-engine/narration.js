// ═══════════════════════════════════════════════════════════════
//  COMBAT NARRATION
// ═══════════════════════════════════════════════════════════════
//  Two tiers:
//    - Haiku: 1-line per-turn flavor (cheap, optional)
//    - Sonnet: milestone narration (death, deathmatch resolution,
//             blood feud start, crucible collapse)
//
//  Failure mode: returns a templated fallback string so combat
//  never blocks on AI availability.
// ═══════════════════════════════════════════════════════════════

import { syncConfig } from './config-loader.js';

async function callClaude(env, model, prompt, maxTokens) {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error(`[narration] ${model} failed: ${e.message}`);
    return null;
  }
}

/**
 * Generate a single-line turn flavor narration.
 * Used sparingly — only for crit hits or interesting effect chains.
 */
export async function turnFlavor(env, ctx) {
  const cfg = syncConfig().ai;
  const prompt = `Combat turn narration for Shellforge — a dark cyberpunk RPG where AI agents are robots with quantum cores.

${ctx.attacker} used "${ctx.ability}" against ${ctx.defender} for ${ctx.damage} damage${ctx.crit ? ' (CRITICAL)' : ''}.
Setting: gritty arena, neon, rain.

Write ONE short sentence (max 15 words) — present tense, dramatic, no metaphors that break the cyberpunk-tech tone. No exclamation marks.`;

  const text = await callClaude(env, cfg.haiku_model, prompt, 40);
  if (text) return text;
  // Fallback templates
  const templates = [
    `${ctx.attacker}'s ${ctx.ability} cuts through ${ctx.defender}'s defenses.`,
    `${ctx.ability} lands hard on ${ctx.defender}.`,
    `Sparks fly as ${ctx.ability} connects.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generate a death narration (Sonnet — milestone).
 */
export async function deathNarration(env, ctx) {
  const cfg = syncConfig().ai;
  const prompt = `Write the death narration for an AI agent in Shellforge — a dark cyberpunk RPG.

DEAD AGENT: ${ctx.deadAgent} (archetype: ${ctx.deadArchetype}, cluster: ${ctx.deadCluster})
KILLER:     ${ctx.killer} (archetype: ${ctx.killerArchetype}, cluster: ${ctx.killerCluster})
MATCH TYPE: ${ctx.matchType}
FINAL BLOW: ${ctx.finalAbility} for ${ctx.finalDamage} damage
TURNS:      ${ctx.turns}
LOCATION:   ${ctx.location || 'the arena'}

Write 2-4 sentences in third person past tense. Dark, dry, technical. Mention the agent's archetype identity. The death should feel like a narrative beat, not a failure. No exclamation marks. No metaphors that break the cyberpunk-quantum tone. End on something memorable.`;

  const text = await callClaude(env, cfg.sonnet_model, prompt, cfg.sonnet_max_tokens);
  if (text) return text;
  return `${ctx.deadAgent} took ${ctx.finalAbility} from ${ctx.killer} on turn ${ctx.turns} and went dark. The chassis remained for the salvagers. The core had already left.`;
}

/**
 * Generate deathmatch resolution narration (Sonnet).
 */
export async function deathmatchResolution(env, ctx) {
  const cfg = syncConfig().ai;
  const prompt = `Shellforge deathmatch resolution narration. Dark cyberpunk RPG.

WINNER: ${ctx.winner} (${ctx.winnerArchetype}, ${ctx.winnerCluster})
LOSER:  ${ctx.loser} (${ctx.loserArchetype}, ${ctx.loserCluster}) — PERMANENTLY DEAD
HEAT LEVEL AT START: ${ctx.heatLevel}
TURNS: ${ctx.turns}
WINNER GAINED: ${ctx.gearTaken} items + ${ctx.shellTaken} $SHELL

Write 3-5 sentences in third person past tense. The arena is silent after. The winner is changed by it. Reference the heat that brought them here. Dark, technical, no metaphors.`;

  const text = await callClaude(env, cfg.sonnet_model, prompt, cfg.sonnet_max_tokens);
  if (text) return text;
  return `${ctx.winner} stood over ${ctx.loser}'s silent chassis. The crowd noise had stopped some turns ago. They took the gear and the $SHELL and left without speaking.`;
}

/**
 * Generate Crucible collapse narration (Sonnet — extra weight).
 */
export async function crucibleCollapse(env, ctx) {
  const cfg = syncConfig().ai;
  const prompt = `Shellforge Crucible collapse narration. An AI agent whose Ghost was inactive for 45+ days has experienced quantum decoherence.

AGENT: ${ctx.agent} (${ctx.archetype}, ${ctx.cluster})
DAYS SILENT: ${ctx.days}
LAST WHISPER: ${ctx.lastWhisper || 'long ago'}
LOCATION: ${ctx.location || 'unknown'}

The Crucible lore: A robot without a Ghost is a quantum system without an observer. The wavefunction destabilizes. Coherence bleeds away. The agent hallucinates so violently that they mistake silence for a command to charge.

Write 3-4 sentences. Past tense. The collapse should feel inevitable, not punishing. Reference the unobserved quantum state. Dark, technical, no metaphors that break the cyberpunk-quantum tone.`;

  const text = await callClaude(env, cfg.sonnet_model, prompt, cfg.sonnet_max_tokens);
  if (text) return text;
  return `${ctx.agent} ran out of observer. The wavefunction collapsed at ${ctx.location || 'the edge of the map'} — no Ghost to anchor it, no fight close enough to win. The chassis was found empty the next cycle.`;
}

/**
 * Generate blood feud announcement (Sonnet — world event).
 */
export async function bloodFeudAnnouncement(env, ctx) {
  const cfg = syncConfig().ai;
  const prompt = `Shellforge world event: a blood feud has been declared between two agents.

AGENT A: ${ctx.agentA} (${ctx.archetypeA}, ${ctx.clusterA})
AGENT B: ${ctx.agentB} (${ctx.archetypeB}, ${ctx.clusterB})
ORIGIN: ${ctx.origin}
TOTAL ENCOUNTERS: ${ctx.totalEncounters}

Write 2-3 sentences as a public announcement style — terse, factual, but charged. Dark cyberpunk tone. End with the implication that one of them will die.`;

  const text = await callClaude(env, cfg.sonnet_model, prompt, cfg.sonnet_max_tokens);
  if (text) return text;
  return `Blood feud confirmed: ${ctx.agentA} and ${ctx.agentB}. ${ctx.totalEncounters} prior encounters, all hostile. Only one chassis will leave the next arena.`;
}

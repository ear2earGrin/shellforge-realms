// Pure mission predicate evaluation — no I/O, no Supabase, no env.
// Imported by the turn engine (workers/turn-engine/index.js) and unit-tested
// directly by scripts/test-missions.mjs. Keep it side-effect free so both
// callers can rely on identical logic. Predicate shapes are documented in
// backend/missions/missions.json.

// Evaluation context shape:
//   {
//     inventory:    { [item_id]: quantity },   // summed quantities
//     actionCounts: { [action_type]: count },  // from activity_log
//     karma:        number,                    // current karma
//     startKarma:   number,                    // karma when the mission row was created
//     daysSurvived: number,
//   }
//
// Returns: { complete: boolean, fraction: number (0..1), label: string }

function clampFraction(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function evaluateMission(predicate, ctx) {
  if (!predicate || typeof predicate !== 'object') {
    return { complete: false, fraction: 0, label: '' };
  }

  switch (predicate.type) {
    case 'inventory_gte': {
      const have = (ctx.inventory && ctx.inventory[predicate.item_id]) || 0;
      const target = predicate.count || 1;
      return {
        complete: have >= target,
        fraction: clampFraction(have / target),
        label: `${Math.min(have, target)}/${target}`,
      };
    }

    case 'action_count_gte': {
      const have = (ctx.actionCounts && ctx.actionCounts[predicate.action_type]) || 0;
      const target = predicate.count || 1;
      return {
        complete: have >= target,
        fraction: clampFraction(have / target),
        label: `${Math.min(have, target)}/${target}`,
      };
    }

    case 'karma_delta_gte': {
      const gained = (ctx.karma || 0) - (ctx.startKarma || 0);
      const target = predicate.value || 1;
      return {
        complete: gained >= target,
        fraction: clampFraction(gained / target),
        label: `+${Math.max(0, Math.min(gained, target))}/${target} karma`,
      };
    }

    case 'days_survived_gte': {
      const have = ctx.daysSurvived || 0;
      const target = predicate.value || 1;
      return {
        complete: have >= target,
        fraction: clampFraction(have / target),
        label: `${Math.min(have, target)}/${target} days`,
      };
    }

    case 'all': {
      const terms = Array.isArray(predicate.of) ? predicate.of : [];
      if (!terms.length) return { complete: false, fraction: 0, label: '' };
      const results = terms.map((p) => evaluateMission(p, ctx));
      const complete = results.every((r) => r.complete);
      // Progress bar shows the least-complete term so it never reads "done" early.
      const fraction = Math.min(...results.map((r) => r.fraction));
      return { complete, fraction: clampFraction(fraction), label: results.map((r) => r.label).join(' · ') };
    }

    default:
      return { complete: false, fraction: 0, label: '' };
  }
}

// Normalize a rewards object into stat deltas the claim path applies.
// Returns { shell, xp, karma, item|null }.
export function normalizeRewards(rewards) {
  const r = rewards || {};
  return {
    shell: Number.isFinite(r.shell) ? r.shell : 0,
    xp: Number.isFinite(r.xp) ? r.xp : 0,
    karma: Number.isFinite(r.karma) ? r.karma : 0,
    item: r.item && typeof r.item === 'object' ? r.item : null,
  };
}

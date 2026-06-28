/**
 * Personal Goal completion — milestone tracking and goal achievement effects.
 *
 * Spec: specs/behaviors/personal-goals.md
 *
 * `checkGoalCompletion` — pure predicate: is this adventurer's goal now met?
 * `applyGoalCompletion` — applies all effects when a goal is achieved.
 */
import type {
  SimulationContext,
  Adventurer,
  PersonalGoal,
  PersonalityAxes,
  DecisionMoment,
} from '../world/types.js';
import { emitEvent } from '../events/eventBus.js';
import { updateReputation } from '../world/WorldExpansion.js';
import { grantDI } from '../divine/DivineInfluence.js';

// ---------------------------------------------------------------------------
// Goal completion checks
// ---------------------------------------------------------------------------

function countMilestoneType(adv: Adventurer, prefix: string): number {
  return adv.personalGoalProgress.milestones.filter(m =>
    m.description.startsWith(prefix),
  ).length;
}

function sumGoldMilestones(adv: Adventurer): number {
  let total = 0;
  for (const m of adv.personalGoalProgress.milestones) {
    if (m.description.startsWith('GOLD_EARNED:')) {
      total += parseInt(m.description.split(':')[1] ?? '0', 10);
    }
  }
  return total;
}

function trustedCompanionCount(adv: Adventurer, ctx: SimulationContext): number {
  const edges = ctx.relationships.get(adv.id);
  if (!edges) return 0;
  let count = 0;
  for (const edge of edges.values()) {
    if (edge.type === 'TRUSTED_COMPANION') count++;
  }
  return count;
}

/** Returns true if the adventurer's personal goal conditions are currently met. */
export function checkGoalCompletion(adv: Adventurer, ctx: SimulationContext): boolean {
  if (adv.personalGoalProgress.completed) return false;

  const goal: PersonalGoal = adv.identity.personalGoal;

  switch (goal) {
    case 'HEROISM': {
      const heroQuests =
        countMilestoneType(adv, 'DUNGEON_SUCCESS') +
        countMilestoneType(adv, 'RESCUE_SUCCESS');
      const hasNearDeath = adv.history.some(h => h.kind === 'NEAR_DEATH');
      return heroQuests >= 3 && hasNearDeath;
    }
    case 'WEALTH':
      return sumGoldMilestones(adv) >= 500;
    case 'BELONGING':
      return trustedCompanionCount(adv, ctx) >= 2;
    case 'REVENGE':
      return adv.personalGoalProgress.milestones.some(m => m.description === 'REVENGE_FULFILLED');
    case 'WANDERLUST':
      return adv.personalGoalProgress.milestones.filter(m =>
        m.description.startsWith('REGION_VISITED:'),
      ).length >= 3;
    case 'PEACE':
      return adv.personalGoalProgress.milestones.some(m => m.description === 'PEACE_STREAK_30');
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Trait shifts
// ---------------------------------------------------------------------------

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function applyTraitShift(personality: PersonalityAxes, goal: PersonalGoal): PersonalityAxes {
  switch (goal) {
    case 'HEROISM':
      return {
        ...personality,
        courage: clamp(personality.courage + 10),
        ambition: clamp(personality.ambition + 5),
      };
    case 'WEALTH':
      return { ...personality, greed: clamp(personality.greed - 10) };
    case 'BELONGING':
      return {
        ...personality,
        empathy: clamp(personality.empathy + 10),
        loyalty: clamp(personality.loyalty + 5),
      };
    case 'REVENGE':
      return {
        ...personality,
        courage: clamp(personality.courage + 5),
        empathy: clamp(personality.empathy - 10),
      };
    case 'WANDERLUST':
      return {
        ...personality,
        ambition: clamp(personality.ambition + 5),
        courage: clamp(personality.courage + 5),
      };
    case 'PEACE':
      return {
        ...personality,
        empathy: clamp(personality.empathy + 15),
        courage: clamp(personality.courage - 5),
      };
    default:
      return personality;
  }
}

// ---------------------------------------------------------------------------
// Retirement decision moment
// ---------------------------------------------------------------------------

function retirementDecisionMoment(
  adv: Adventurer,
  tick: number,
  rng: SimulationContext['rng'],
): DecisionMoment {
  const hi = (rng.next() * 0xFFFFFF >>> 0).toString(16).padStart(6, '0');
  const lo = (rng.next() * 0xFFFFFF >>> 0).toString(16).padStart(6, '0');
  return {
    id: `dm-goal-${hi}${lo}`,
    kind: 'OTHER',
    tick,
    situationText: `${adv.identity.name} has achieved their deepest goal. They may choose to retire in peace.`,
    expiresAt: tick + 48,
    options: [
      {
        label: 'Let them choose',
        description: 'Adventurer rolls 30% chance of retirement.',
        diCost: 0,
        probabilityShift: 0,
        narrativeDistanceLabel: 'LOW',
      },
      {
        label: 'Inspire them to stay',
        description: 'SEND_DREAM (cost 8 DI): suppresses retirement for 30 days.',
        diCost: 8,
        probabilityShift: 0,
        narrativeDistanceLabel: 'MODERATE',
      },
      {
        label: 'Grant them peace',
        description: 'Adventurer retires immediately.',
        diCost: 0,
        probabilityShift: 0,
        narrativeDistanceLabel: 'LOW',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Completion effect
// ---------------------------------------------------------------------------

/**
 * Apply all effects of personal goal completion:
 * - fire PersonalGoalAchieved lifecycle event
 * - mark progress completed
 * - apply permanent trait shift
 * - add GOAL_ACHIEVED mood factor
 * - grant +12 DI (clamped to 100)
 * - surface retirement decision moment
 */
export function applyGoalCompletion(
  ctx: SimulationContext,
  adv: Adventurer,
): SimulationContext {
  const goal = adv.identity.personalGoal;
  const { tick } = ctx.worldTime;

  // 1. Fire lifecycle event
  let next = emitEvent(ctx, {
    kind: 'LIFECYCLE',
    subtype: 'GOAL_ACHIEVED',
    involvedIds: [adv.id],
  });

  // 2. Apply trait shift + mark completed + add mood factor
  const updatedAdv: Adventurer = {
    ...adv,
    personality: applyTraitShift(adv.personality, goal),
    personalGoalProgress: {
      ...adv.personalGoalProgress,
      completed: true,
      completedAt: tick,
    },
    moodFactors: [
      ...adv.moodFactors,
      {
        id: 'GOAL_ACHIEVED',
        label: 'Life goal achieved',
        value: 40,
        decayRate: 0.03,
      },
    ],
  };
  const adventurers = new Map(next.adventurers);
  adventurers.set(adv.id, updatedAdv);
  next = { ...next, adventurers };

  // 3. Grant +12 DI (via grantDI so a DI_GAINED event is emitted)
  next = grantDI(next, 12);

  // 4. Update reputation
  next = { ...next, reputation: updateReputation(next.reputation, { event: 'GOAL_ACHIEVED' }) };

  // 5. Surface retirement decision moment
  const dm = retirementDecisionMoment(updatedAdv, tick, next.rng);
  next = { ...next, pendingDecisions: [...next.pendingDecisions, dm] };

  return next;
}

// ---------------------------------------------------------------------------
// Tick subscriber
// ---------------------------------------------------------------------------

/** Per-tick subscriber: checks goal completion for all adventurers and applies effects. */
export function personalGoalSubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.adventurers.size === 0) return ctx;

  let updatedCtx = ctx;

  for (const adv of ctx.adventurers.values()) {
    if (adv.state === 'DEAD' || adv.state === 'RETIRED') continue;
    if (adv.personalGoalProgress.completed) continue;

    if (checkGoalCompletion(adv, updatedCtx)) {
      updatedCtx = applyGoalCompletion(updatedCtx, adv);
    }
  }

  return updatedCtx;
}

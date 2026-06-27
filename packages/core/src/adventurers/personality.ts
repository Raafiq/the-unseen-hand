/**
 * Personality-derived probability functions.
 *
 * Spec: specs/behaviors/personality-system.md
 * All functions are pure — same input always yields same output.
 * No Math.random(); callers use SimulationContext.rng for rolls.
 */
import type { PersonalityAxes, RelationshipEdge, Adventurer, Quest } from '../world/types.js';

/** Probability that an adventurer attempts to flee when losing. */
export function fleeThreshold(axes: PersonalityAxes): number {
  // Piecewise per spec: courage ≥ 70 → 0.10; courage ≤ 30 → 0.65; linear between.
  const c = axes.courage;
  if (c >= 70) return 0.10;
  if (c <= 30) return 0.65;
  return 0.65 - ((c - 30) / 40) * 0.55;
}

/** Probability that an adventurer voluntarily shares quest loot. */
export function shareLootChance(axes: PersonalityAxes): number {
  const raw = (axes.empathy * 0.6 + (100 - axes.greed) * 0.4) / 100;
  return Math.max(0, Math.min(1, raw));
}

const DEFEND_ALLY_MULTIPLIERS: Record<RelationshipEdge['type'], number> = {
  TRUSTED_COMPANION: 1.8,
  FRIEND: 1.3,
  ACQUAINTANCE: 1.0,
  STRANGER: 1.0,
  RIVAL: 0.3,
  ENEMY: 0.0,
};

/** Probability that an adventurer uses DEFEND_ALLY when an ally is near death. */
export function defendAllyChance(axes: PersonalityAxes, edge: RelationshipEdge): number {
  const base = (axes.loyalty * 0.5 + axes.empathy * 0.5) / 100;
  const raw = base * DEFEND_ALLY_MULTIPLIERS[edge.type];
  return Math.max(0, Math.min(1, raw));
}

const GOAL_ALIGNMENT: Record<Adventurer['identity']['personalGoal'], Quest['type'][]> = {
  HEROISM: ['DUNGEON', 'RESCUE'],
  WEALTH: ['FETCH', 'BOUNTY'],
  BELONGING: ['ESCORT', 'RESCUE'],
  REVENGE: ['BOUNTY', 'DUNGEON'],
  WANDERLUST: ['BOUNTY', 'DUNGEON', 'ESCORT', 'FETCH', 'INVESTIGATION', 'POLITICAL', 'RESCUE'],
  PEACE: ['ESCORT', 'INVESTIGATION'],
};

/** Composite weight for autonomous party selection. */
export function questVolunteerWeight(adventurer: Adventurer, quest: Quest): number {
  if (adventurer.state !== 'IDLE') return 0;

  const goal = adventurer.identity.personalGoal;
  const alignedTypes = GOAL_ALIGNMENT[goal];
  let bonus = 0;

  if (goal === 'WANDERLUST') {
    // All quests get +0.1; INVESTIGATION gets full +0.3
    bonus = quest.type === 'INVESTIGATION' ? 0.3 : 0.1;
  } else if (alignedTypes.includes(quest.type)) {
    bonus = 0.3;
  }

  const ambitionBonus = quest.difficulty >= 7
    ? (adventurer.personality.ambition / 100) * 0.2
    : 0;

  // Mood threshold modifiers (spec: behaviors/mood-system.md §Mood thresholds)
  if (adventurer.mood < 10) return 0; // DESPAIRING — cannot volunteer
  const moodMultiplier = adventurer.mood < 25 ? 0.5 : adventurer.mood < 50 ? 0.8 : 1.0;

  return (adventurer.mood / 100 + bonus + ambitionBonus) * moodMultiplier;
}

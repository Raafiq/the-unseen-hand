// @ugs/core — public API

// World / determinism backbone
export { SeededRNG } from './world/SeededRNG.js';
export { createSimulationContext } from './world/SimulationContext.js';
export type { SimulationContext } from './world/SimulationContext.js';
export { WorldClock } from './world/WorldClock.js';
export type { SpeedMultiplier } from './world/WorldClock.js';
export { SimulationLoop } from './world/SimulationLoop.js';
export type { TickSubscriber } from './world/SimulationLoop.js';
export type * from './world/types.js';

// Adventurers
export { fleeThreshold, shareLootChance, defendAllyChance, questVolunteerWeight } from './adventurers/personality.js';
export { transitionState, IllegalStateTransitionError } from './adventurers/stateMachine.js';
export {
  upsertMoodFactor,
  decayMoodFactors,
  recalculateMood,
  moodThresholdLabel,
  topMoodFactors,
  applyDayTickMood,
} from './adventurers/mood.js';
export type { MoodLabel } from './adventurers/mood.js';

// Relationships
export {
  strengthToType,
  createEdge,
  applyStrengthShift,
  detectThresholdEvents,
  applyDayTickDecay,
} from './relationships/graph.js';
export type { ThresholdEvent, ThresholdEventType } from './relationships/graph.js';
export { moodSubscriber } from './adventurers/mood.js';
export { relationshipDecaySubscriber } from './relationships/graph.js';

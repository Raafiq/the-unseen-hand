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

// Event bus
export { emitEvent } from './events/eventBus.js';

// Social events + departure
export {
  computeInteractionProbability,
  computeOutcomeWeights,
  socialEventSubscriber,
} from './events/socialResolver.js';
export {
  computeDepartureProbability,
  departureSubscriber,
} from './adventurers/departureSystem.js';

// Combat resolution
export { generateBeats, selectBeatActionWeights, renderBeat } from './combat/beatGenerator.js';

// Quest system
export {
  computeQuestProbability,
  questBoardSeedingSubscriber,
  questExpirySubscriber,
  partySelectionSubscriber,
  resolveQuest,
} from './quests/questSystem.js';
export type { QuestOutcomeResult } from './quests/questSystem.js';
export type { SimulationEventInput, SocialEventInput, CombatEventInput, QuestEventInput,
  LifecycleEventInput, WorldEventInput, DecisionMomentEventInput, DivineInterventionEventInput,
} from './events/eventBus.js';

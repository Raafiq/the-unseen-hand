// @ugs/core — public API

// World / determinism backbone
export { SeededRNG } from './world/SeededRNG.js';
export { createSimulationContext } from './world/SimulationContext.js';
export type { SimulationContext } from './world/SimulationContext.js';
export { isNpc, makeNpcId, NPC_ID_PREFIX } from './world/actors.js';
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

// Thoughts (spec: specs/behaviors/thought-system.md)
export { renderThought, THOUGHT_POOLS } from './thoughts/thoughtGrammar.js';
export type { RenderedThought, RenderThoughtOptions } from './thoughts/thoughtGrammar.js';
export { deriveBeliefs } from './thoughts/beliefs.js';
export type { Belief, BeliefKind } from './thoughts/beliefs.js';

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

// LLM Narrator (pure helpers; no I/O)
export { getDayEvents, buildNarratorPrompt } from './events/LLMNarrator.js';
export type { NarratorPrompt } from './events/LLMNarrator.js';

// Social events + departure
export {
  socialPressureSubscriber,
  resolveEncounter,
  resolveOutcome,
  decideApproach,
  computePressureGain,
  actorView,
  festivalPressureMultiplier,
  FESTIVAL_PRESSURE_MULT,
  pairKey,
} from './events/socialResolver.js';
export type { EncounterActor } from './events/socialResolver.js';
export {
  computeDepartureProbability,
  departureSubscriber,
} from './adventurers/departureSystem.js';
export {
  npcFlavourSubscriber,
  rollTownFlavour,
  townFlavourChance,
  TOWN_ROLES,
  TOWN_FLAVOUR_CHANCE,
} from './events/npcFlavour.js';

// Combat resolution
export { generateBeats, selectBeatActionWeights, renderBeat } from './combat/beatGenerator.js';

// Divine Tools (dispatch)
export { dispatch } from './divine/DivineTools.js';
export type { DispatchCommand, DispatchResult } from './divine/DivineTools.js';

// Decision Moment Detector
export { decisionMomentSubscriber } from './events/DecisionMomentDetector.js';

// Divine Influence
export { diTrickleSubscriber, grantDI } from './divine/DivineInfluence.js';
export { narrativeDistance, applyDivineShift } from './divine/ProbabilityShifter.js';

// Scenario engine
export { registerScenario, scenarioEvaluatorSubscriber } from './scenarios/ScenarioEngine.js';
export { createScenario1Context, SCENARIO_1_ID, S1_IDS } from './scenarios/scenario1.js';
export { createThornvaleNpcs, THORNVALE_NPCS } from './scenarios/notableNpcs.js';

// Personal goals
export { checkGoalCompletion, applyGoalCompletion } from './adventurers/PersonalGoals.js';

// History layer
export { contextualModifier, appendHistoryEvent } from './adventurers/HistoryLayer.js';

// World expansion
export {
  createStartingRegions,
  worldExpansionSubscriber,
  worldEventSeedingSubscriber,
  festivalSeedingSubscriber,
  openFestivalSpan,
  hasActiveSpan,
  activeSpans,
  updateReputation,
} from './world/WorldExpansion.js';
export type { ReputationEvent } from './world/WorldExpansion.js';

// Quest system
export {
  computeQuestProbability,
  questBoardSeedingSubscriber,
  questExpirySubscriber,
  partySelectionSubscriber,
  resolveQuest,
  questResolutionSubscriber,
  seedQuestBoard,
} from './quests/questSystem.js';
export type { QuestOutcomeResult } from './quests/questSystem.js';
export { findQuestBracketViolations } from './quests/questBracketInvariant.js';
export type { QuestBracketViolation } from './quests/questBracketInvariant.js';
export type { SimulationEventInput, SocialEventInput, CombatEventInput, QuestEventInput,
  LifecycleEventInput, WorldEventInput, DecisionMomentEventInput, DivineInterventionEventInput,
} from './events/eventBus.js';

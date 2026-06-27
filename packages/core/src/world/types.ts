/**
 * Canonical type definitions for @ugs/core.
 * Source of truth: specs/data-model.md — do not add fields not defined there.
 */
import type { SeededRNG } from './SeededRNG.js';

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type WorldTime = {
  tick: number; // monotonically increasing; canonical unit
  day: number;  // Math.floor(tick / 24)
  hour: number; // tick % 24
};

// ---------------------------------------------------------------------------
// Adventurer
// ---------------------------------------------------------------------------

export type AdventurerId = string;

export type PersonalGoal =
  | 'HEROISM'
  | 'WEALTH'
  | 'BELONGING'
  | 'REVENGE'
  | 'WANDERLUST'
  | 'PEACE';

export type PersonalityAxes = {
  courage: number;  // 0–100
  greed: number;    // 0–100
  empathy: number;  // 0–100
  loyalty: number;  // 0–100
  ambition: number; // 0–100
};

export type AdventurerState =
  | 'IDLE'
  | 'ON_QUEST'
  | 'IN_DUNGEON'
  | 'RESTING'
  | 'SOCIALIZING'
  | 'IN_DISPUTE'
  | 'DEAD'
  | 'RETIRED';

export type MoodFactor = {
  id: string;
  label: string;
  value: number;
  decayRate: number;
  expiresAt?: number;
};

export type GoalMilestone = {
  tick: number;
  description: string;
};

export type GoalProgress = {
  goal: PersonalGoal;
  milestones: GoalMilestone[];
  completed: boolean;
  completedAt?: number;
};

export type HistoryEventKind =
  | 'WITNESSED_DEATH'
  | 'BETRAYED_BY'
  | 'SAVED_BY'
  | 'FIRST_KILL'
  | 'NEAR_DEATH'
  | 'QUEST_TRIUMPH'
  | 'GOAL_ACHIEVED';

export type HistoryEvent = {
  tick: number;
  kind: HistoryEventKind;
  involvedIds: AdventurerId[];
  weight: number;
};

export type AdventurerIdentity = {
  id: AdventurerId;
  name: string;
  age: number;
  backstory: string;
  personalGoal: PersonalGoal;
};

export type QuestId = string;

export type Adventurer = {
  id: AdventurerId;
  identity: AdventurerIdentity;
  personality: PersonalityAxes;
  mood: number;
  moodFactors: MoodFactor[];
  state: AdventurerState;
  history: HistoryEvent[];
  despairStreak: number; // consecutive day-ticks with mood < 10; resets to 0 when mood ≥ 10
  personalGoalProgress: GoalProgress;
  currentQuestId: QuestId | null;
};

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export type RelationshipType =
  | 'STRANGER'
  | 'ACQUAINTANCE'
  | 'FRIEND'
  | 'TRUSTED_COMPANION'
  | 'RIVAL'
  | 'ENEMY';

export type RelationshipEvent = {
  tick: number;
  kind: string;
  delta: number;
};

export type RelationshipEdge = {
  strength: number; // –100 to +100
  type: RelationshipType;
  history: RelationshipEvent[];
};

export type RelationshipGraph = Map<AdventurerId, Map<AdventurerId, RelationshipEdge>>;

/** Keyed by sorted pair id "A-B"; value is the tick of last shared activity. */
export type LastSharedActivity = Record<string, number>;

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export type QuestType =
  | 'BOUNTY'
  | 'ESCORT'
  | 'FETCH'
  | 'DUNGEON'
  | 'INVESTIGATION'
  | 'RESCUE'
  | 'POLITICAL';

export type QuestRisk = {
  injuryChance: number;
  deathChance: number;
  criticalFailChance: number;
};

export type QuestStatus = 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export type Quest = {
  id: QuestId;
  type: QuestType;
  name: string;
  difficulty: number;
  duration: number;
  reward: number;
  risk: QuestRisk;
  requiredPartySize: number;
  expiresAt: number;
  assignedParty: AdventurerId[] | null;
  status: QuestStatus;
};

export type BeatAction =
  | 'ATTACK'
  | 'FLEE'
  | 'DEFEND_ALLY'
  | 'HESITATE'
  | 'USE_ITEM'
  | 'CRITICAL'
  | 'NEAR_DEATH';

export type CombatBeat = {
  tick: number;
  actorId: AdventurerId;
  action: BeatAction;
  outcome: string;
  personalityNote?: string;
};

export type QuestOutcome = {
  questId: QuestId;
  success: boolean;
  injuries: AdventurerId[];
  deaths: AdventurerId[];
  loot: number;
  reputationDelta: number;
  beats: CombatBeat[];
};

export type QuestBoard = {
  available: Quest[];
  active: Quest[];
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventBase = {
  id: string;
  tick: number;
  renderedText: string;
};

export type SocialEvent = EventBase & {
  kind: 'SOCIAL';
  subtype: 'POSITIVE_CHAT' | 'ARGUMENT' | 'BREAKTHROUGH' | 'SILENT_DISTANCE';
  participantIds: [AdventurerId, AdventurerId];
  relationshipDelta: number;
};

export type CombatEvent = EventBase & {
  kind: 'COMBAT';
  subtype: 'BEAT_LOG' | 'QUEST_RESOLVED';
  questId: QuestId;
  involvedIds: AdventurerId[];
};

export type QuestEvent = EventBase & {
  kind: 'QUEST';
  subtype: 'STARTED' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'DROUGHT';
  questId: QuestId;
  partyIds: AdventurerId[];
};

export type LifecycleEvent = EventBase & {
  kind: 'LIFECYCLE';
  subtype:
    | 'ADVENTURER_DIED'
    | 'ADVENTURER_DEPARTED'
    | 'FRIENDSHIP_FORMED'
    | 'TRUSTED_COMPANION_BOND_FORMED'
    | 'BOND_BROKEN'
    | 'RIVALRY_DEEPENED'
    | 'RECONCILIATION'
    | 'GOAL_MILESTONE'
    | 'GOAL_ACHIEVED';
  involvedIds: AdventurerId[];
};

export type WorldEvent = EventBase & {
  kind: 'WORLD';
  subtype:
    | 'STORM'
    | 'PLAGUE'
    | 'WINDFALL'
    | 'MONSTER_SURGE'
    | 'TRAVELLING_MERCHANT'
    | 'RUMOUR'
    | 'QUEST_DROUGHT'
    | 'REGION_UNLOCKED'
    | 'INTERNAL_ERROR';
  regionId?: RegionId;
};

export type DecisionMomentEvent = EventBase & {
  kind: 'DECISION_MOMENT';
  decisionId: string;
  situationText: string;
  options: DecisionOption[];
  expiresAt: number;
};

export type DivineInterventionEvent = EventBase & {
  kind: 'DIVINE';
  subtype: 'TOUCH' | 'SEED_EVENT' | 'SHIFT_DIFFICULTY' | 'OPTION_CHOSEN' | 'DI_GAINED' | 'DI_SPENT';
  diDelta: number;
  targetId?: string;
};

export type SimulationEvent =
  | SocialEvent
  | CombatEvent
  | QuestEvent
  | LifecycleEvent
  | WorldEvent
  | DecisionMomentEvent
  | DivineInterventionEvent;

// ---------------------------------------------------------------------------
// Decision moments
// ---------------------------------------------------------------------------

export type DecisionOption = {
  label: string;
  description: string;
  diCost: number;
  probabilityShift: number;
  narrativeDistanceLabel: 'LOW' | 'MODERATE' | 'EXTREME';
};

export type DecisionMoment = {
  id: string;
  tick: number;
  situationText: string;
  options: DecisionOption[];
  expiresAt: number;
};

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export type RegionId = string;

export type WorldEventType =
  | 'STORM'
  | 'PLAGUE'
  | 'WINDFALL'
  | 'MONSTER_SURGE'
  | 'TRAVELLING_MERCHANT'
  | 'RUMOUR';

export type WorldEventInstance = {
  type: WorldEventType;
  startedAt: number;
  expiresAt: number;
};

export type Region = {
  id: RegionId;
  name: string;
  difficulty: number;
  activeWorldEvents: WorldEventInstance[];
  unlocked: boolean;
};

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type ScenarioGoalState = {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: number;
  diReward: number;
};

export type FailConditionState = {
  id: string;
  description: string;
  triggered: boolean;
  triggeredAt?: number;
};

export type ScenarioState = {
  scenarioId: string;
  startedAt: number;
  goals: ScenarioGoalState[];
  failConditions: FailConditionState[];
  status: 'ACTIVE' | 'COMPLETE' | 'FAILED';
};

// ---------------------------------------------------------------------------
// Root context
// ---------------------------------------------------------------------------

export type SimulationContext = {
  worldTime: WorldTime;
  rng: SeededRNG;
  adventurers: Map<AdventurerId, Adventurer>;
  relationships: RelationshipGraph;
  lastSharedActivity: LastSharedActivity; // updated by Phase 2 quest + social event systems
  questBoard: QuestBoard;
  eventLog: SimulationEvent[];
  pendingDecisions: DecisionMoment[];
  divineInfluence: number; // 0–100
  activeRegions: Map<RegionId, Region>;
  scenario: ScenarioState | null;
};

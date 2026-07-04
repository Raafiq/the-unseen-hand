/**
 * Canonical type definitions for @ugs/core.
 * Source of truth: specs/data-model.md — do not add fields not defined there.
 */
import type { SeededRNG } from './SeededRNG.js';

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** A day is partitioned into three cycles of 8 ticks each; derived from `hour`
 *  via `cycleOf` (world/WorldTime.ts). See specs/behaviors/world-clock.md. */
export type Cycle = 'MORNING' | 'AFTERNOON' | 'NIGHT';

export type WorldTime = {
  tick: number; // monotonically increasing; canonical unit
  day: number;  // Math.floor(tick / 24)
  hour: number; // tick % 24
  cycle: Cycle; // pure function of hour (cycleOf); the player-facing unit of advancement
};

/** The tick window a single `PROCEED` computed, returned by `SimulationLoop.proceed()`.
 *  `day`/`cycle` label the cycle that was just computed (the pre-advance boundary the
 *  window opened on). See specs/behaviors/world-clock.md#advancement--the-proceed-command. */
export type CycleDigest = {
  fromTick: number; // worldTime.tick before the cycle was computed (a cycle boundary)
  toTick: number;   // worldTime.tick after 8 ticks (the next cycle boundary)
  day: number;      // day of the computed cycle
  cycle: Cycle;     // the cycle that was just computed
};

// ---------------------------------------------------------------------------
// Adventurer
// ---------------------------------------------------------------------------

export type AdventurerId = string;

/** A notable (Tier A) NPC id. Distinct namespace ("npc:" prefix); see world/actors.ts. */
export type NpcId = string;

/** A participant in a social encounter or relationship edge. Adventurers and Tier A
 *  notable NPCs share one actor id space (see npc-system.md). Use `isNpc(id)` (world/actors.ts)
 *  to tell them apart — NPCs lack the full Adventurer shape, so adventurer-only logic must guard. */
export type ActorId = AdventurerId | NpcId;

export type PersonalGoal =
  | 'HEROISM'
  | 'WEALTH'
  | 'BELONGING'
  | 'REVENGE'
  | 'WANDERLUST'
  | 'PEACE';

export type PersonalityAxes = {
  courage: number;   // 0–100
  greed: number;     // 0–100
  empathy: number;   // 0–100
  loyalty: number;   // 0–100
  ambition: number;  // 0–100
  stubborn?: number; // 0–100; defaults to 0 when absent
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

export type ActivityId =
  | 'TRAINING' | 'SPARRING' | 'PATROL' | 'HUNTING'
  | 'DRINKING' | 'GAMBLING' | 'COOKING' | 'EATING' | 'GOSSIPING'
  | 'READING' | 'BROODING' | 'RESTING' | 'PRAYING' | 'CRAFTING'
  | 'SLEEPING';

export type ActivityCluster = 'PHYSICAL' | 'SOCIAL' | 'PRIVATE';

export type ActivityState = {
  current: ActivityId;
  enteredAt: number;
  scheduledExitAt: number;
  nextMicroEventAt: number;
};

export type MoodFactor = {
  id: string;
  label: string;
  value: number;
  decayRate: number;
  expiresAt?: number;
  activityWeights?: Partial<Record<ActivityId, number>>;
  stubbornOverride?: boolean;
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
  | 'GOAL_ACHIEVED'
  | 'LUCK_CURSE'
  | 'MARK_FOR_DEATH'
  | 'SEND_DREAM';

export type EnemyArchetype = 'UNDEAD' | 'BEAST' | 'HUMAN' | 'ELEMENTAL' | 'UNKNOWN';

export type HistoryEvent = {
  tick: number;
  kind: HistoryEventKind;
  involvedIds: AdventurerId[];
  weight: number;
  enemyArchetype?: EnemyArchetype; // set for WITNESSED_DEATH events
};

export type BehaviourContext = {
  questType?: string;
  enemyArchetype?: EnemyArchetype;
  involvedAdventurerIds?: AdventurerId[];
  tick: number;
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
  activityState?: ActivityState;
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

export type RelationshipGraph = Map<ActorId, Map<ActorId, RelationshipEdge>>;

// ---------------------------------------------------------------------------
// Town NPCs (spec: specs/behaviors/npc-system.md)
// ---------------------------------------------------------------------------

/** A town role. Doubles as a nameless Tier B label and a notable NPC's role. */
export type TownRole =
  | 'GATE_GUARD' | 'SHOPKEEPER' | 'URCHIN' | 'DRUNK' | 'PRIEST'
  | 'MERCHANT' | 'BEGGAR' | 'BARD' | 'STABLEHAND' | 'BLACKSMITH'
  | 'GUARD_CAPTAIN' | 'INNKEEPER';

/** Tier A — a named, persistent town NPC that lives in the relationship graph as an
 *  honorary actor. NPCs are not full adventurers (no quests, goal, or divine touch),
 *  but carry earned interiority: real mood, event-driven history, and a static want
 *  (npc-system.md#interiority-earned-event-driven). */
export type NotableNpc = {
  id: NpcId;
  name: string;
  role: TownRole;
  traits: Partial<PersonalityAxes>; // enough to drive encounter valence/intensity
  bio: string;                      // 1–2 sentences, shown in UI; stable
  mood: number;                     // 0–100; seeded 50; day-tick decay like adventurers (no despairStreak)
  moodFactors: MoodFactor[];        // written by social encounters; decayed on day ticks
  history: HistoryEvent[];          // 50-cap FIFO via appendHistoryEvent; event-driven writes only
  want: { id: string; text: string }; // static longing; feeds thought-system.md; never mutated
  familiarity: number;              // 0–100; static, seeded at world gen; how embedded in town life (npc-system.md#townsfolk-familiarity)
};

/** Keyed by sorted pair id "A-B"; value is the tick of last shared activity. */
export type LastSharedActivity = Record<string, number>;

/** Sorted pair id `"A-B"` — the canonical key for per-pair social state
 *  (`socialPressure`, `socialCooldowns`). Build with `pairKey(a, b)`. */
export type PairKey = string;

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
  startedAt?: number; // tick when party was assigned; set by partySelectionSubscriber
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

export type SocialOutcomeType =
  | 'BANTER'
  | 'SOLIDARITY'
  | 'BREAKTHROUGH'
  | 'SILENT_DISTANCE'
  | 'ARGUMENT'
  | 'ESTRANGEMENT';

export type SocialEvent = EventBase & {
  kind: 'SOCIAL';
  subtype: SocialOutcomeType;
  participantIds: ActorId[]; // 2–4 participants (group scenes)
  relationshipDelta: number;
};

/** Tier B (nameless-role) town flavour. Carries no outcome and no relationship/mood
 *  effect — a single grammar-rendered line. Spec: npc-system.md, event-bus.md. */
export type NPCEvent = EventBase & {
  kind: 'NPC';
  subtype: 'TOWN_FLAVOUR';
  adventurerId: AdventurerId;
  role: TownRole;
};

export type CombatEvent = EventBase & {
  kind: 'COMBAT';
  subtype: 'BEAT_LOG' | 'QUEST_RESOLVED';
  questId: QuestId;
  involvedIds: AdventurerId[];
  beats?: CombatBeat[];   // present on BEAT_LOG events; used by combat replay UI
  success?: boolean;      // present on BEAT_LOG events; true if quest succeeded
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
    | 'FEUD'          // weighty social span (world-expansion.md); emitted by p10c follow-up
    | 'FESTIVAL'      // town-level span (npc-system.md)
    | 'QUEST_DROUGHT'
    | 'REGION_UNLOCKED'
    | 'SCENARIO_GOAL_ACHIEVED'
    | 'SCENARIO_COMPLETE'
    | 'SCENARIO_FAILED'
    | 'INTERNAL_ERROR';
  phase?: 'START' | 'END';       // present on spanning subtypes; absent on instant/announcement events
  regionId?: RegionId;
  goalId?: string;
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

export type ActivityEvent = EventBase & {
  kind: 'ACTIVITY';
  subtype: 'ACTIVITY_CHANGED' | 'MICRO_EVENT';
  adventurerId: AdventurerId;
  activity: ActivityId;
  prevActivity?: ActivityId;
};

/** A THOUGHT whisper — an actor's inner monologue surfacing into the feed
 *  (thought-system.md). Strictly solo; carries no relationship/mood/state effect. */
export type ThoughtEvent = EventBase & {
  kind: 'THOUGHT';
  actorId: ActorId;   // the thinker — adventurer or Tier A notable NPC
  subjectKey: string; // fragment-family id for anti-repetition; never rendered
};

/** Relationship driver subtypes (relationship-events.md). Peril-response has two branches
 *  (SHARED_DANGER / BETRAYAL); the town-life drivers are KINDNESS / RIVALRY_SPARK. */
export type RelationshipDriverSubtype =
  | 'SHARED_DANGER'
  | 'BETRAYAL'
  | 'KINDNESS'
  | 'RIVALRY_SPARK';

/** A discrete relationship driver surfacing as one feed line (relationship-events.md#surfacing).
 *  `participantIds` are ActorIds so Tier-A NPCs can participate in the town-life drivers. */
export type RelationshipDriverEvent = EventBase & {
  kind: 'RELATIONSHIP';
  subtype: RelationshipDriverSubtype;
  participantIds: ActorId[]; // both actors; ActorId so notable NPCs participate (KINDNESS / RIVALRY_SPARK)
};

export type SimulationEvent =
  | SocialEvent
  | NPCEvent
  | CombatEvent
  | QuestEvent
  | LifecycleEvent
  | WorldEvent
  | DecisionMomentEvent
  | DivineInterventionEvent
  | ActivityEvent
  | ThoughtEvent
  | RelationshipDriverEvent;

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

export type DecisionMomentKind =
  | 'DEATH_IMMINENT'
  | 'RELATIONSHIP_COLLAPSE'
  | 'DEPARTURE'
  | 'SCENARIO_CRITICAL'
  | 'SCENARIO_GOAL'
  | 'PARTY_SELECTION'
  | 'OTHER';

export type DecisionMoment = {
  id: string;
  kind: DecisionMomentKind;
  tick: number;
  situationText: string;
  options: DecisionOption[];
  expiresAt: number;
  subjectId?: string; // adventurerId(s, comma-joined) the chosen option's shift applies to
  cooldownKey?: string; // dedup key written to decisionCooldowns after dismiss/expiry
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
  | 'RUMOUR'
  | 'FESTIVAL'; // town-level span (npc-system.md); seeded separately, not via the weather table

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
  treasuryNegativeSince: number | null; // tick when treasury first went negative (BANKRUPTCY tracking)
  questPressure?: number; // copied from Scenario definition at start; added to weekly seeding formula
};

// ---------------------------------------------------------------------------
// Scenario definition (runtime spec; separate from ScenarioState runtime record)
// ---------------------------------------------------------------------------

export type AdventurerSeed = {
  id: AdventurerId;
  name: string;
  age: number;
  backstory: string;
  personalGoal: PersonalGoal;
  personality: PersonalityAxes;
  /** Pre-existing relationship edges seeded with this adventurer. */
  edges?: Array<{ targetId: AdventurerId; strength: number }>;
};

export type ScenarioGoalDef = {
  id: string;
  description: string;
  condition: (ctx: SimulationContext) => boolean;
  diReward: number;
  optional?: boolean;
  isImminent?: (ctx: SimulationContext) => boolean;
};

export type FailConditionDef = {
  id: string;
  description: string;
  condition: (ctx: SimulationContext) => boolean;
};

export type Scenario = {
  id: string;
  title: string;
  premise: string;
  goals: ScenarioGoalDef[];
  failConditions: FailConditionDef[];
  timeLimit?: number;
  startingRoster: AdventurerSeed[];
  startingDI: number;
  questPressure?: number; // added to weekly board seeding formula: N = baseRate + questPressure - currentBoardSize
};

// ---------------------------------------------------------------------------
// Root context
// ---------------------------------------------------------------------------

export type SimulationContext = {
  worldTime: WorldTime;
  rng: SeededRNG;
  worldSeed: string; // world-gen seed, read-only after creation; lets thought-system.md build derived read-only rng streams without touching ctx.rng
  adventurers: Map<AdventurerId, Adventurer>;
  notableNpcs: Map<NpcId, NotableNpc>; // Tier A town NPCs; honorary actors in `relationships`
  relationships: RelationshipGraph;
  lastSharedActivity: LastSharedActivity; // updated by Phase 2 quest + social event systems
  questBoard: QuestBoard;
  eventLog: SimulationEvent[];
  pendingDecisions: DecisionMoment[];
  pendingShifts: Map<string, number>; // subjectId → probabilityShift; written by CHOOSE_OPTION, read+cleared by quest resolver
  decisionCooldowns: Map<string, number>; // cooldownKey → expiry tick; prevents re-fire after dismiss/expiry
  socialPressure: Map<PairKey, number>;   // per-pair accumulated social tension; built up then discharged (social-system.md §4)
  socialCooldowns: Map<PairKey, number>;  // per-pair post-fire / ESTRANGEMENT cooldown expiry tick; no accumulation while tick < value
  pendingCrises: Set<PairKey>;            // pairs carrying a peril BETRAYAL crisis flag; the next social encounter for the pair escalates (relationship-events.md), then clears it
  divineInfluence: number; // 0–100
  activeRegions: Map<RegionId, Region>;
  scenario: ScenarioState | null;
  treasury: number;    // gold; quest rewards add, upkeep deducts
  reputation: number;  // 0–1000; drives region unlocks
};

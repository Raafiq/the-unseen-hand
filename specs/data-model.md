# Data Model

Canonical type definitions, enumerations, and field semantics for `packages/core`. All types are pure TypeScript — no class inheritance, no runtime magic.

## Time

```typescript
type WorldTime = {
  tick: number;   // monotonically increasing; canonical unit
  day: number;    // tick / 24
  hour: number;   // tick % 24
};
```

- 1 real second = 1 in-game hour (at 1× speed).
- 24 ticks = 1 in-game day.
- All durations in the system are expressed in ticks.

## SimulationContext

The root object. Every tick subscriber receives and returns a new `SimulationContext` — immutable update pattern.

```typescript
type SimulationContext = {
  worldTime: WorldTime;
  rng: SeededRNG;
  adventurers: Map<AdventurerId, Adventurer>;
  relationships: RelationshipGraph;
  lastSharedActivity: LastSharedActivity; // updated by quest + social event systems (Phase 2)
  questBoard: QuestBoard;
  eventLog: SimulationEvent[];
  pendingDecisions: DecisionMoment[];
  divineInfluence: number;          // 0–100
  activeRegions: Map<RegionId, Region>;
  scenario: ScenarioState | null;   // null in sandbox mode
  treasury: number;                 // gold; quest rewards add, upkeep deducts (added Phase 4)
  reputation: number;               // 0–1000; drives region unlocks (added Phase 4)
};

type QuestBoard = {
  available: Quest[];
  active: Quest[];
};
```

## Adventurer

```typescript
type AdventurerId = string;

type Adventurer = {
  id: AdventurerId;
  identity: AdventurerIdentity;
  personality: PersonalityAxes;
  mood: number;                    // 0–100
  moodFactors: MoodFactor[];
  state: AdventurerState;
  history: HistoryEvent[];
  despairStreak: number;           // consecutive day-ticks with mood < 10; resets to 0 when mood ≥ 10
  personalGoalProgress: GoalProgress;
  currentQuestId: QuestId | null;
};

type AdventurerIdentity = {
  id: AdventurerId;
  name: string;
  age: number;
  backstory: string;
  personalGoal: PersonalGoal;
};

type PersonalGoal =
  | 'HEROISM'
  | 'WEALTH'
  | 'BELONGING'
  | 'REVENGE'
  | 'WANDERLUST'
  | 'PEACE';

type PersonalityAxes = {
  courage: number;    // 0–100
  greed: number;      // 0–100
  empathy: number;    // 0–100
  loyalty: number;    // 0–100
  ambition: number;   // 0–100
};

type AdventurerState =
  | 'IDLE'
  | 'ON_QUEST'
  | 'IN_DUNGEON'
  | 'RESTING'
  | 'SOCIALIZING'
  | 'IN_DISPUTE'
  | 'DEAD'
  | 'RETIRED';
```

## Mood

```typescript
type MoodFactor = {
  id: string;             // e.g. 'QUEST_SUCCESS', 'ALLY_DIED', 'LONELY'
  label: string;          // rendered label for the UI
  value: number;          // positive or negative mood contribution
  decayRate: number;      // fraction lost per day tick (0–1)
  expiresAt?: number;     // optional tick at which factor disappears entirely
};
```

- Mood recalculated each day tick: `sum(factors.map(f => f.value))`, clamped to [0, 100].
- Mood thresholds:

| Label | Range | Effect |
|---|---|---|
| `CONTENT` | 50–100 | No modifier |
| `NEUTRAL` | 25–49 | Quest volunteer weight reduced by 20% |
| `UNSATISFIED` | 10–24 | Quest volunteer weight reduced by 50% |
| `DESPAIRING` | 0–9 | Cannot volunteer for quests |

- `mood < 10` for 3+ consecutive days → departure roll (tracked via `despairStreak`).

```typescript
type MoodLabel = 'CONTENT' | 'NEUTRAL' | 'UNSATISFIED' | 'DESPAIRING';
```

## Relationship graph

```typescript
type RelationshipGraph = Map<AdventurerId, Map<AdventurerId, RelationshipEdge>>;

/** Keyed by sorted pair id "idA-idB"; value is the tick of last shared activity. */
type LastSharedActivity = Record<string, number>;

type RelationshipEdge = {
  strength: number;          // –100 to +100
  type: RelationshipType;    // stored and re-derived on every write via strengthToType()
  history: RelationshipEvent[];
};

type RelationshipType =
  | 'STRANGER'
  | 'ACQUAINTANCE'
  | 'FRIEND'
  | 'TRUSTED_COMPANION'
  | 'RIVAL'
  | 'ENEMY';

type RelationshipEvent = {
  tick: number;
  kind: string;      // e.g. 'CO_QUEST_SUCCESS', 'ARGUMENT', 'SAVED_ALLY', 'SEPARATION_DECAY'
  delta: number;     // strength change from this event
};

type ThresholdEventType =
  | 'FRIENDSHIP_FORMED'
  | 'TRUSTED_COMPANION_BOND_FORMED'
  | 'BOND_BROKEN'
  | 'RIVALRY_DEEPENED'
  | 'RECONCILIATION';

type ThresholdEvent = {
  type: ThresholdEventType;
  adventurerId1: AdventurerId;
  adventurerId2: AdventurerId;
  newType: RelationshipType;
  priorType: RelationshipType;
  strength: number;
};
```

Relationship type thresholds and threshold event rules: see `behaviors/relationship-graph.md`.

## Quest

```typescript
type QuestId = string;

type Quest = {
  id: QuestId;
  type: QuestType;
  name: string;
  difficulty: number;       // 1–10 scale
  duration: number;         // ticks
  reward: number;           // gold
  risk: QuestRisk;
  requiredPartySize: number;
  expiresAt: number;        // tick
  assignedParty: AdventurerId[] | null;
  status: QuestStatus;
};

type QuestType =
  | 'BOUNTY'
  | 'ESCORT'
  | 'FETCH'
  | 'DUNGEON'
  | 'INVESTIGATION'
  | 'RESCUE'
  | 'POLITICAL';

type QuestRisk = {
  injuryChance: number;       // 0–1
  deathChance: number;        // 0–1
  criticalFailChance: number; // 0–1
};

type QuestStatus = 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

type QuestOutcome = {
  questId: QuestId;
  success: boolean;
  injuries: AdventurerId[];
  deaths: AdventurerId[];
  loot: number;
  reputationDelta: number;
  beats: CombatBeat[];
};
```

## Combat

```typescript
type CombatBeat = {
  tick: number;
  actorId: AdventurerId;
  action: BeatAction;
  outcome: string;            // short descriptor, e.g. 'hit for 12', 'fled the field'
  personalityNote?: string;   // set when personality caused a non-obvious decision
};

type BeatAction =
  | 'ATTACK'
  | 'FLEE'
  | 'DEFEND_ALLY'
  | 'HESITATE'
  | 'USE_ITEM'
  | 'CRITICAL'
  | 'NEAR_DEATH';
```

## Events

```typescript
type SimulationEvent =
  | SocialEvent
  | CombatEvent
  | QuestEvent
  | LifecycleEvent
  | WorldEvent
  | DecisionMomentEvent
  | DivineInterventionEvent;

// All share a common base
type EventBase = {
  id: string;
  tick: number;
  renderedText: string;   // template-rendered narrative string; never empty
};
```

See `behaviors/event-bus.md` for each event shape.

## Decision moments

```typescript
type DecisionMoment = {
  id: string;
  tick: number;
  situationText: string;
  options: DecisionOption[];
  expiresAt: number;         // tick; auto-resolves to option 0 if not chosen
};

type DecisionOption = {
  label: string;
  description: string;
  diCost: number;
  probabilityShift: number;  // delta applied to the relevant roll (0 = "let fate decide")
  narrativeDistanceLabel: 'LOW' | 'MODERATE' | 'EXTREME';
};
```

Option at index 0 is always "Let fate decide": `diCost: 0`, `probabilityShift: 0`.

## Divine Influence

- Stored as `divineInfluence: number` in `SimulationContext`, range 0–100.
- All DI changes are recorded as `DivineInterventionEvent` entries on the event log.
- See `behaviors/divine-influence.md` for income, costs, and the probability shift function.

## Region

```typescript
type RegionId = string;

type Region = {
  id: RegionId;
  name: string;
  difficulty: number;        // 1–10; player-adjustable via SHIFT_DIFFICULTY
  activeWorldEvents: WorldEventInstance[];
  unlocked: boolean;
};

type WorldEventType =
  | 'STORM'
  | 'PLAGUE'
  | 'WINDFALL'
  | 'MONSTER_SURGE'
  | 'TRAVELLING_MERCHANT'
  | 'RUMOUR';

type WorldEventInstance = {
  type: WorldEventType;
  startedAt: number;    // tick
  expiresAt: number;    // tick
};
```

## Scenario

```typescript
type ScenarioState = {
  scenarioId: string;
  startedAt: number;
  goals: ScenarioGoalState[];
  failConditions: FailConditionState[];
  status: 'ACTIVE' | 'COMPLETE' | 'FAILED';
};

type ScenarioGoalState = {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: number;
  diReward: number;
};

type FailConditionState = {
  id: string;
  description: string;
  triggered: boolean;
  triggeredAt?: number;
};
```

## History

```typescript
type HistoryEvent = {
  tick: number;
  kind: HistoryEventKind;
  involvedIds: AdventurerId[];  // other adventurers involved, if any
  weight: number;               // emotional weight; used by contextual modifier
};

type HistoryEventKind =
  | 'WITNESSED_DEATH'
  | 'BETRAYED_BY'
  | 'SAVED_BY'
  | 'FIRST_KILL'
  | 'NEAR_DEATH'
  | 'QUEST_TRIUMPH'
  | 'GOAL_ACHIEVED';
```

## GoalProgress

```typescript
type GoalProgress = {
  goal: PersonalGoal;
  milestones: GoalMilestone[];
  completed: boolean;
  completedAt?: number;
};

type GoalMilestone = {
  tick: number;
  description: string;
};
```

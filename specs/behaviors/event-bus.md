# Behavior: Event Bus

## Rule

Every meaningful simulation event is emitted as a typed, rendered event object on the `SimulationEventBus`. All event consumers — the UI, the LLM narrator, decision moment detection — subscribe by type. No code reads simulation state to infer what happened; events are the record.

## Applies To

- `packages/core/src/events/SimulationEventBus.ts`
- All systems that emit or consume simulation events

## Details

### Event shape

All events extend a common base:

```typescript
type EventBase = {
  id: string;            // UUID; unique across the event log
  tick: number;
  renderedText: string;  // template-rendered narrative sentence; never empty
};
```

`renderedText` is always populated at emission time by the deterministic template grammar (see
`behaviors/narrative-voice.md`) — never computed lazily and never produced by an LLM call.
Consumers may display it directly. LLM set-pieces (day summary, decision-moment framing, quest
climax) are additive enrichments attached separately, not the source of any event's
`renderedText`.

### Event type union

```typescript
type SimulationEvent =
  | SocialEvent
  | NPCEvent
  | CombatEvent
  | QuestEvent
  | LifecycleEvent
  | WorldEvent
  | DecisionMomentEvent
  | DivineInterventionEvent;
```

### SocialEvent

```typescript
type SocialEvent = EventBase & {
  kind: 'SOCIAL';
  subtype:
    | 'BANTER' | 'SOLIDARITY' | 'BREAKTHROUGH'
    | 'SILENT_DISTANCE' | 'ARGUMENT' | 'ESTRANGEMENT';
  participantIds: ActorId[];        // 2–4; group scenes carry >2 (see social-system.md §4).
                                    // ActorId = AdventurerId | NpcId — a notable (Tier A) NPC
                                    // may be a participant (see npc-system.md).
  relationshipDelta: number;
};
```

The subtype is the six-outcome valence × intensity grid from `behaviors/social-system.md` §5
(superseding the old four-outcome `POSITIVE_CHAT | ARGUMENT | BREAKTHROUGH | SILENT_DISTANCE`
set). The outcome label is never shown to the player — only the grammar-rendered `renderedText`.

### NPCEvent

```typescript
type NPCEvent = EventBase & {
  kind: 'NPC';
  subtype: 'TOWN_FLAVOUR';
  adventurerId: AdventurerId;
  role: TownRole;            // nameless Tier B role (see npc-system.md)
};
```

Tier B (nameless-role) town flavour. Carries no outcome and no relationship/mood effect — a
single grammar-rendered line. Tier A (notable) NPC interactions are **not** `NPCEvent`s; they
reuse `SocialEvent` with the NPC id in `participantIds`.

### CombatEvent

```typescript
type CombatEvent = EventBase & {
  kind: 'COMBAT';
  subtype: 'BEAT_LOG' | 'QUEST_RESOLVED';
  questId: QuestId;
  involvedIds: AdventurerId[];
  beats?: CombatBeat[];    // present on BEAT_LOG events; absent on QUEST_RESOLVED
  success?: boolean;       // present on BEAT_LOG events; used by combat replay UI
};
```

`BEAT_LOG` is emitted once per quest completion. It carries the full `beats` array and the `success` flag so the combat replay UI can reconstruct the fight from the event log without re-simulating.

### QuestEvent

```typescript
type QuestEvent = EventBase & {
  kind: 'QUEST';
  subtype: 'STARTED' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'DROUGHT';
  questId: QuestId;
  partyIds: AdventurerId[];
};
```

### LifecycleEvent

```typescript
type LifecycleEvent = EventBase & {
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
```

### WorldEvent

```typescript
type WorldEvent = EventBase & {
  kind: 'WORLD';
  subtype:
    | 'STORM' | 'PLAGUE' | 'WINDFALL' | 'MONSTER_SURGE' | 'TRAVELLING_MERCHANT' | 'RUMOUR'
    | 'FEUD' | 'FESTIVAL'        // weighty social/town spans (see world-expansion.md)
    | 'QUEST_DROUGHT'
    | 'REGION_UNLOCKED'
    | 'SCENARIO_GOAL_ACHIEVED'   // a non-optional scenario goal was completed
    | 'SCENARIO_COMPLETE'        // all required scenario goals met
    | 'SCENARIO_FAILED'          // a fail condition triggered
    | 'INTERNAL_ERROR';          // illegal state transition caught in production mode
  phase?: 'START' | 'END';       // present on spanning subtypes; absent on instant/announcement events
  regionId?: RegionId;
  goalId?: string;               // set on SCENARIO_GOAL_ACHIEVED
};
```

**Spanning vs instant.** `STORM`, `PLAGUE`, `MONSTER_SURGE`, `TRAVELLING_MERCHANT`, `FEUD`, and
`FESTIVAL` are **stateful spans**: each emits a `phase: 'START'` event when it begins and a
`phase: 'END'` event when it expires, and is held in `Region.activeWorldEvents` while live (see
`behaviors/world-expansion.md`). `RUMOUR` and `WINDFALL`, and the announcement subtypes
(`REGION_UNLOCKED`, the `SCENARIO_*` set, `QUEST_DROUGHT`, `INTERNAL_ERROR`), are instant: they
emit a single event with no `phase`.

### ReputationEvent

The `updateReputation` pure function accepts a discriminated union describing the triggering event:

```typescript
type ReputationEvent =
  | { event: 'QUEST_SUCCESS'; difficulty: number }  // +5 / +10 / +20 by difficulty tier
  | { event: 'QUEST_FAILURE' }                      // −8
  | { event: 'ADVENTURER_DEATH' }                   // −15
  | { event: 'BOND_FORMED' }                        // +5 (TRUSTED_COMPANION threshold crossed)
  | { event: 'GOAL_ACHIEVED' }                      // +10
  | { event: 'SCENARIO_OBJECTIVE' };                // +50
```

Callers: `questResolutionSubscriber`, `socialEventSubscriber` (TRUSTED_COMPANION_BOND_FORMED threshold), `applyGoalCompletion`, `scenarioEvaluatorSubscriber` (SCENARIO_GOAL_ACHIEVED).

### DecisionMomentEvent

```typescript
type DecisionMomentEvent = EventBase & {
  kind: 'DECISION_MOMENT';
  decisionId: string;
  situationText: string;
  options: DecisionOption[];
  expiresAt: number;
};
```

### DivineInterventionEvent

```typescript
type DivineInterventionEvent = EventBase & {
  kind: 'DIVINE';
  subtype: 'TOUCH' | 'SEED_EVENT' | 'SHIFT_DIFFICULTY' | 'OPTION_CHOSEN' | 'DI_GAINED' | 'DI_SPENT';
  diDelta: number;   // positive = gained, negative = spent
  targetId?: string; // adventurerId or regionId, depending on subtype
};
```

### Emission rules

- Events are emitted as part of returning a new `SimulationContext`. They are attached to `ctx.eventLog`.
- No event is emitted without a non-empty `renderedText`.
- Events are append-only. The log is never truncated within a session (UI may virtualize rendering).
- The event log is ordered by `tick`, then by emission order within a tick.

### UI subscription model

The Svelte store layer subscribes to the full `eventLog` array from `SimulationContext`. Filtering by `kind` happens in the UI (see `screens/event-feed.md`), not in the bus.

## Validation

- Every event type has at least one rendered template covering it.
- No event in the log has an empty `renderedText`.
- Events within the same tick are ordered by emission order, not by type.
- `DivineInterventionEvent` with `subtype: 'DI_SPENT'` always has a negative `diDelta`.

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the bus is the mechanism that makes this true. Every event that could matter to a player must be typed and emitted.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — `renderedText` is the contract. An event with a blank or debug `renderedText` violates this principle.

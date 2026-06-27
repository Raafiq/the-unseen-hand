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

`renderedText` is always populated at emission time. It is never computed lazily. Consumers may display it directly.

### Event type union

```typescript
type SimulationEvent =
  | SocialEvent
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
  subtype: 'POSITIVE_CHAT' | 'ARGUMENT' | 'BREAKTHROUGH' | 'SILENT_DISTANCE';
  participantIds: [AdventurerId, AdventurerId];
  relationshipDelta: number;
};
```

### CombatEvent

```typescript
type CombatEvent = EventBase & {
  kind: 'COMBAT';
  subtype: 'BEAT_LOG' | 'QUEST_RESOLVED';
  questId: QuestId;
  involvedIds: AdventurerId[];
};
```

`BEAT_LOG` is emitted once per quest completion, carrying a summary of the beat log (not all individual beats — those are in `QuestOutcome.beats`).

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
  subtype: 'STORM' | 'PLAGUE' | 'WINDFALL' | 'MONSTER_SURGE' | 'TRAVELLING_MERCHANT' | 'RUMOUR' | 'QUEST_DROUGHT' | 'REGION_UNLOCKED' | 'INTERNAL_ERROR';
  regionId?: RegionId;
};
```

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

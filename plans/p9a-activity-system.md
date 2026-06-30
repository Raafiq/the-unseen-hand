---
status: done
depends: []
specs:
  - specs/behaviors/social-system.md
  - specs/behaviors/mood-system.md
---

# Plan: P9a — Activity System

## Scope

Implement the activity pool, per-adventurer activity state, duration/exit logic, micro-events, and the MoodFactor extensions (`activityWeights`, `stubbornOverride`) that feed into transient conditions (HANGOVER, QUEST_INJURY, WELL_RESTED).

**In scope:**
- `SocialActivity` type and `ActivityCluster` enum
- Activity weight calculation: baseAffinity table × moodMultiplier × historyModifier
- Activity draw (replaces the no-op idle model in the current social resolver)
- Duration ranges per cluster, personality scaling, both exit triggers (duration expiry + mood threshold)
- Micro-event queue: tick-interval firing, pre-written fallback templates (≥ 3 per activity)
- MoodFactor extension (`activityWeights`, `stubbornOverride`)
- New transient factors: HANGOVER, QUEST_INJURY, WELL_RESTED
- `ActivityState` on `Adventurer` (current activity, time-entered, scheduled exit tick)
- Subscriber wiring in `SimulationLoop`

**Out of scope:**
- Social escalation trigger (P9b)
- LLM generation (P9c)
- UI display of activity state (deferred — no plan yet; current state badge is sufficient for now)

## Implements

- `specs/behaviors/social-system.md` §1 (Activity system), §2 (Activity duration), §3 (Micro-events)
- `specs/behaviors/mood-system.md` — extended `MoodFactor` type (§Details/MoodFactor), new factor table entries (HANGOVER, QUEST_INJURY, WELL_RESTED)

## Approach

### 1. Extend types (`packages/core/src/world/types.ts`)

```typescript
type ActivityId =
  | 'TRAINING' | 'SPARRING' | 'PATROL' | 'HUNTING'
  | 'DRINKING' | 'GAMBLING' | 'COOKING' | 'EATING' | 'GOSSIPING'
  | 'READING' | 'BROODING' | 'RESTING' | 'PRAYING' | 'CRAFTING'

type ActivityCluster = 'PHYSICAL' | 'SOCIAL' | 'PRIVATE'

interface ActivityState {
  current: ActivityId
  enteredAt: number        // tick
  scheduledExitAt: number  // tick
}

// Extend Adventurer
interface Adventurer {
  // ...existing fields
  activityState: ActivityState
}

// Extend MoodFactor
interface MoodFactor {
  // ...existing fields
  activityWeights?: Partial<Record<ActivityId, number>>
  stubbornOverride?: boolean
}
```

### 2. Activity weight function (`packages/core/src/events/socialResolver.ts`)

```typescript
function drawActivity(adventurer: Adventurer, ctx: SimulationContext): ActivityId
```

- Build the 13-activity weight vector from the spec's affinity table, moodMultiplier, and historyModifier rules.
- `stubbornOverride` check: if any active MoodFactor has `stubbornOverride: true` and `adventurer.personality.stubborn >= 70`, skip that factor's `activityWeights` entirely.
- Use `ctx.rng` weighted draw (Fisher-Yates inverse CDF over the weight vector).

### 3. Duration scheduler

```typescript
function scheduleDuration(activity: ActivityId, adventurer: Adventurer, now: number, ctx: SimulationContext): number
```

Returns `exitAt` tick. Base range from spec table; apply personality scale; draw via `ctx.rng`.

### 4. Activity subscriber

New `activitySubscriber` fires every tick. Per adventurer:
1. If no `activityState`, draw and schedule.
2. Check mood-threshold exit: if mood has crossed threshold for this activity's cluster, exit immediately.
3. Check duration exit: if `now >= scheduledExitAt`, exit.
4. On exit: queue any pending micro-event for this session, then draw next activity.
5. Emit `ACTIVITY_CHANGED` event (event bus) with old and new activity.

### 5. Micro-events

On each tick within an active activity, at 1–2 hr interval (drawn at session start, stored on `activityState`):
- Emit a `MICRO_EVENT` typed entry from the fallback template pool for this activity.
- Template pools stored as `const MICRO_TEMPLATES: Record<ActivityId, string[]>` in `socialResolver.ts`.

### 6. Transient MoodFactor emission

Wire into existing subscribers:
- `moodSubscriber` (end of day): emit HANGOVER if DRINKING was completed yesterday; emit WELL_RESTED if RESTING was completed and mood was CONTENT.
- `questResolutionSubscriber`: emit QUEST_INJURY when a quest resolution contains an injury flag (define `injuryOccurred` on `QuestResult`).

### 7. Tests (TDD — one failing test per step)

Route all tests through `activitySubscriber` with a fully constructed `SimulationContext`. Key tests:
- HANGOVER suppresses DRINKING weight; QUEST_INJURY suppresses TRAINING weight.
- `stubbornOverride` bypasses weight suppression when `stubborn ≥ 70`.
- Exit fires on duration expiry; exit fires on mood threshold.
- Draw never returns an activity with weight 0.

## Validation

- [ ] An adventurer always has an `activityState` after the first subscriber tick.
- [ ] HANGOVER MoodFactor sets DRINKING `activityWeight: 0.15`; DRINKING weight after draw ≤ 15% of baseline.
- [ ] Adventurer with `stubborn ≥ 70` and QUEST_INJURY: `stubbornOverride: true` on the factor; TRAINING/SPARRING/PATROL weights are NOT suppressed (assert effective weight ≥ baseline).
- [ ] Activity exits on duration expiry (mock clock to `scheduledExitAt`).
- [ ] Activity exits early when mood drops below 25 during TRAINING (mood-threshold exit).
- [ ] Micro-event fires at the scheduled interval tick, with a filled template string (no `{A}` or `{B}` slots left).
- [ ] All 13 activities appear in the weight vector; none has weight < 0.
- [ ] `tsc --noEmit` and `svelte-check` both pass with zero errors.
- [ ] All existing tests (431 Vitest) continue to pass.

## Risks / unknowns

- **`Adventurer` type growth** — adding `activityState` is a breaking change on the type. All existing test fixtures that construct `Adventurer` objects will need the field. Factor in the fixture update cost.
- **Subscriber ordering** — `activitySubscriber` must run before `socialEventSubscriber` (P9b) so that activity state is current when the escalation check fires. Add to SimulationLoop after moodSubscriber, before the (to-be-replaced) old socialEventSubscriber.
- **History layer for HANGOVER** — HANGOVER detection reads yesterday's activity log. `HistoryLayer.ts` may not currently record activity completions. May need to add `ACTIVITY_COMPLETED` to `HistoryEventKind`.

## Notes

- `activityState` is optional on `Adventurer` (not required) — avoids breaking all existing test fixtures. Subscriber handles the `undefined` case (first tick: draw and schedule).
- Spec says "thirteen named activities" but the explicit list has 14 (4+5+5). List is authoritative; the header count was wrong. `ALL_ACTIVITY_IDS` has 14 entries.
- `stubborn` was absent from `PersonalityAxes` — added as optional (`stubborn?: number`); activity system treats absent as 0.
- `decayMoodFactors` gained optional `currentTick` param to filter `expiresAt` factors.
- `ActivityEvent` added to `SimulationEvent` union; `EventFeed.svelte` updated to include `ACTIVITY` in `KIND_LABELS`.

## Follow-ups

(Populated at closeout.)

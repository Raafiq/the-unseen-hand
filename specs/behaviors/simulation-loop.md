# Behavior: Simulation Loop

## Rule

The simulation loop holds the world clock and an ordered registry of tick subscribers. Each tick, subscribers execute in order, each receiving the current `SimulationContext` and returning a new one. State is immutable between subscribers.

## Applies To

- `packages/core/src/world/SimulationLoop.ts`
- `packages/core/src/world/SimulationContext.ts`
- All tick subscribers in `packages/core/src/`

## Details

### Subscriber contract

```typescript
type TickSubscriber = (ctx: SimulationContext, delta: number) => SimulationContext;
```

- `delta` is always 1 tick in this simulation (ticks are fixed-size).
- Each subscriber receives the output of the previous subscriber.
- Subscribers must be pure: same input → same output. No side effects beyond returning the new context.
- Events emitted by a subscriber are attached to the returned context's `eventLog`, not fired as side effects.

### Subscriber execution order

`WorldTime` is advanced as an implicit **pre-step** before any subscribers run — it cannot be deregistered or reordered. After that, subscribers execute in registration order:

1. Adventurer state machine transitions
2. Mood recalculation (day ticks only)
3. Relationship tick
5. Quest board seeding and expiry
6. Autonomous party selection
7. Quest outcome resolution (for quests that complete this tick)
8. Social interaction resolver
9. Decision moment detector
10. Departure system

Slots 2–3 (mood, relationship) are registered automatically by `SimulationLoop` at construction time. Later phases register their subscribers via `loop.register()`. This order is stable across ticks — reordering is a spec change.

### `SimulationLoop` interface

- `start()` — starts the world clock; ticks begin firing.
- `stop()` — stops the clock; world is frozen.
- `step()` — advances exactly one tick synchronously; does not use real-time interval.
- `setSpeed(multiplier: 1 | 5 | 20)` — adjusts real-time tick rate.
- `pause()` / `resume()` — aliases for `stop()` / `start()` exposed via `PAUSE` / `RESUME` commands.
- `register(subscriber: TickSubscriber)` — adds a subscriber at the end of the registry.

### `SimulationContext` initialization

A fresh `SimulationContext` is built from:
- A seed string (produces the seeded RNG).
- An optional `ScenarioSeed` (pre-populated adventurers, starting resources).
- Default values: `divineInfluence: 50`, empty `questBoard`, empty `eventLog`.

### Error handling

State machine callers pass an explicit `isDev: boolean` flag (typically `process.env.NODE_ENV !== 'production'`):
- When `isDev === true`: illegal state transitions throw `IllegalStateTransitionError`.
- When `isDev === false`: illegal transitions are caught, logged to `eventLog` as a `WorldEvent` with `kind: 'INTERNAL_ERROR'`, and the prior context is returned unchanged.

## Validation

- 24 sequential `step()` calls must advance world time from day 0 to day 1.
- Same seed + same commands replays identically after `stop()` / `start()` cycle.
- Subscriber order is stable: registering in order A, B, C means A runs before B before C on every tick.
- `step()` does not fire real-time intervals; can be called synchronously in tests without timers.

## Principles

**Inherited:**
- [Seeded determinism](../principles.md#seeded-determinism) — the loop is the point where the seed threads into every tick. The RNG in `SimulationContext` must not be replaced or re-seeded mid-simulation.
- [Headless correctness first](../principles.md#headless-correctness-first-visual-representation-second) — the loop has no UI dependency. It must run identically under Vitest as it does under the Svelte store.

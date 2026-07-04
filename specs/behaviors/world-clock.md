# Behavior: World Clock

## Rule

The world advances time in discrete ticks. 1 tick = 1 in-game hour. 24 ticks = 1 in-game day. A day is partitioned into three **cycles** — morning, afternoon, night — of 8 ticks each. All simulation systems subscribe to ticks as their fundamental unit.

Time is **turn-paced, not real-time.** The clock does not advance on a wall-clock interval. Instead, a `PROCEED` command computes exactly one cycle (8 ticks) synchronously, then the clock **halts at the cycle boundary** and waits. The next cycle does not begin until the next `PROCEED`. There are no speed multipliers.

## Applies To

- `packages/core/src/world/WorldClock.ts`
- `packages/core/src/world/WorldTime.ts`
- All tick-subscriber systems
- `Simulation.dispatch({ type: 'PROCEED' })`

## Details

### WorldTime

```
{ tick: number; day: number; hour: number; cycle: Cycle }
```

- `tick` is monotonically increasing from 0.
- `day = Math.floor(tick / 24)`
- `hour = tick % 24`
- `cycle` is derived from `hour` (see Cycles).

### Cycles

A day has three cycles of 8 ticks each. `cycle` is a pure function of `hour`:

| Cycle | Hours (inclusive) | Ticks within day |
|---|---|---|
| `MORNING` | 0–7 | 0–7 |
| `AFTERNOON` | 8–15 | 8–15 |
| `NIGHT` | 16–23 | 16–23 |

```
type Cycle = 'MORNING' | 'AFTERNOON' | 'NIGHT';
cycleOf(hour) = hour < 8 ? 'MORNING' : hour < 16 ? 'AFTERNOON' : 'NIGHT';
```

- The **cycle** is the player-facing unit of advancement — one `PROCEED` moves the world through exactly one cycle. A cycle always starts on its first tick (`hour % 8 === 0`) and ends after its eighth.
- A cycle is never partially advanced. The world state the player reads is always at a cycle boundary (`hour ∈ {0, 8, 16}` after a `PROCEED` completes, having just finished the *prior* cycle).

### Advancement — the `PROCEED` command

`dispatch({ type: 'PROCEED' })`:

1. Computes 8 ticks in sequence by calling every registered tick listener 8 times, exactly as `step()` would, advancing `worldTime` by 8.
2. Runs synchronously to completion — when `dispatch` returns, the full cycle has resolved and all subscriber side effects (milestones, DI bursts, `pendingShifts`, decision moments, world-event spans) are written.
3. Leaves the clock **halted** at the new cycle boundary. No further ticks fire until the next `PROCEED`.
4. Returns a **cycle digest** handle (the tick range just computed: `{ fromTick, toTick, day, cycle }`) so the UI and narrative layer can collect the events of exactly that cycle.

The clock has no timer, no interval, and no background advancement. Between `PROCEED` commands the world is frozen — this is the reading window (see `behaviors/cycle-narrative.md`, `screens/event-feed.md`).

> **Rationale.** The game is turn-paced (the reading-first lineage), so advancement is a command, not a clock tick. See `principles.md#autonomy-of-outcomes-player-controlled-tempo`.

### Tick emission

- A tick is emitted by calling registered listeners; 8 emissions make one cycle.
- API: `onTick(listener: () => void)` — registers a callback invoked on each tick. Unchanged from the real-time model; only the *driver* changed (a `PROCEED` command, not an interval).
- Listeners are called synchronously in registration order.
- Decision moments that arise during a cycle are surfaced at the cycle boundary, not mid-cycle (see `behaviors/decision-moments.md`).

### Cycle and day boundaries

- A new **cycle** begins when `hour` transitions across a cycle edge (7→8, 15→16, 23→0).
- A new **day** begins when `hour` transitions from 23 to 0 — i.e. the `NIGHT → MORNING` boundary is also the day boundary.
- Subscribers that operate on "day ticks" filter for `worldTime.hour === 0`; subscribers that operate on "cycle ticks" filter for `worldTime.hour % 8 === 0`.
- Cycle and day boundaries are normal ticks — not special event types.

### Halt / step

- The clock is **always halted between cycles** — there is no separate paused state to enter or leave, and no interval to clear. The world is only ever mid-computation *inside* a synchronous `PROCEED`.
- `step()`: manually advances exactly one tick. Retained for tests and as the primitive `PROCEED` composes 8 of. Deterministic; ignores any notion of real time.
- There is no `setSpeed`, no `pause()`, no `resume()`, and no `currentSpeed` — the real-time speed model is retired.

## Validation

- `cycleOf` maps hour 0→MORNING, 7→MORNING, 8→AFTERNOON, 15→AFTERNOON, 16→NIGHT, 23→NIGHT.
- One `PROCEED` from tick 0 advances `worldTime` to `{ tick: 8, day: 0, hour: 8, cycle: 'AFTERNOON' }` and fires exactly 8 tick emissions.
- Three `PROCEED`s from tick 0 produce `{ tick: 24, day: 1, hour: 0, cycle: 'MORNING' }`.
- `PROCEED` returns a digest whose `fromTick`/`toTick` cover exactly the 8 ticks it computed.
- No ticks fire between `PROCEED` commands (a listener count assertion across an idle interval).
- `PROCEED` with the same seed and no other commands always produces the same `WorldTime` sequence and the same events (determinism).

## Principles

**Inherited:**
- [Seeded determinism](../principles.md#seeded-determinism) — `PROCEED`/`step()` must be deterministic; `WorldClock` must not use `Date.now()` or `Math.random()` internally.
- [Autonomy of outcomes; player-controlled tempo](../principles.md#autonomy-of-outcomes-player-controlled-tempo) — the clock halts at each cycle boundary and waits for `PROCEED`; that is the player's tempo control. Within a `PROCEED`, every tick resolves autonomously with no player input. The halt is for *reading*, never for *deciding*.

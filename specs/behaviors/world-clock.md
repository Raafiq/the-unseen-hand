# Behavior: World Clock

## Rule

The world advances time in discrete ticks. 1 tick = 1 in-game hour. 24 ticks = 1 in-game day. All simulation systems subscribe to ticks as their fundamental unit.

## Applies To

- `packages/core/src/world/WorldClock.ts`
- `packages/core/src/world/WorldTime.ts`
- All tick-subscriber systems

## Details

### WorldTime

```
{ tick: number; day: number; hour: number }
```

- `tick` is monotonically increasing from 0.
- `day = Math.floor(tick / 24)`
- `hour = tick % 24`

### Real-time to in-game time mapping

| Speed multiplier | Real time per tick | In-game time per second |
|---|---|---|
| 1× (default) | 1 second | 1 hour |
| 5× | 200 ms | 5 hours |
| 20× | 50 ms | 1 day |

The clock interval is driven by `setSpeed(multiplier)`. Speed changes take effect on the next interval fire — the current tick is never interrupted.

### Tick emission

- `WorldClock` emits a tick on each interval by calling registered listeners.
- API: `onTick(listener: () => void)` — registers a callback invoked on each tick.
- Listeners are called synchronously before the next interval is scheduled.
- In paused state: no ticks fire. The clock resumes from the same world time.

### Observable state

- `currentSpeed: SpeedMultiplier` — readable property reflecting the active speed multiplier.

### Day boundary

- A new in-game day begins when `hour` transitions from 23 to 0.
- Subscribers that operate on "day ticks" filter for `worldTime.hour === 0`.
- The day-tick is a normal tick — it is not a special event type.

### Pause / Resume

- `pause()`: clears the current interval. Tick counter does not advance.
- `resume()`: restores the interval at the current speed.
- `step()`: manually advances exactly one tick. Used in tests. Ignores real-time interval.

## Validation

- 24 `step()` calls starting at tick 0 must produce `day: 1, hour: 0`.
- `step()` with the same seed and no commands always produces the same `WorldTime` sequence.
- Speed change from 1× to 5× reduces interval from 1000 ms to 200 ms without skipping a tick.
- Pausing and resuming does not shift `worldTime.tick`.

## Principles

**Inherited:**
- [Seeded determinism](../principles.md#seeded-determinism) — `step()` must be deterministic; `WorldClock` must not use `Date.now()` or `Math.random()` internally.
- [Autonomy is the default; intervention is the exception](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — the clock runs without player interaction. Pause requires an explicit `PAUSE` command.

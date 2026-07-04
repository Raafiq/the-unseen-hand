/**
 * WorldClock — advances world time in discrete ticks.
 *
 * Spec: specs/behaviors/world-clock.md
 * 1 tick = 1 in-game hour. 24 ticks = 1 in-game day.
 * step() is synchronous and safe for use in tests (no setInterval).
 * start()/stop() manage a real-time interval for live play.
 */
import type { WorldTime } from './types.js';
import { cycleOf } from './WorldTime.js';

export type SpeedMultiplier = 1 | 5 | 20;

const INTERVAL_MS: Record<SpeedMultiplier, number> = {
  1: 1000,
  5: 200,
  20: 50,
};

export class WorldClock {
  private _worldTime: WorldTime = { tick: 0, day: 0, hour: 0, cycle: 'MORNING' };
  private _speed: SpeedMultiplier = 1;
  private _intervalHandle: ReturnType<typeof setInterval> | null = null;
  private _listeners: Array<(wt: WorldTime) => void> = [];

  get worldTime(): WorldTime {
    return this._worldTime;
  }

  /** @deprecated removed in p15e — the turn-paced model has no speed multipliers. */
  get currentSpeed(): SpeedMultiplier {
    return this._speed;
  }

  onTick(listener: (wt: WorldTime) => void): void {
    this._listeners.push(listener);
  }

  step(): void {
    const tick = this._worldTime.tick + 1;
    const hour = tick % 24;
    this._worldTime = {
      tick,
      day: Math.floor(tick / 24),
      hour,
      cycle: cycleOf(hour),
    };
    for (const l of this._listeners) l(this._worldTime);
  }

  // --- Deprecated real-time interval API: removed in p15e (world-clock.md retires ---
  // the speed model). Kept as functioning shims so the current client keeps building
  // and running until the top-bar switches to PROCEED. Engine advance is command-driven.

  /** @deprecated removed in p15e — there are no speed multipliers in the turn-paced model. */
  setSpeed(multiplier: SpeedMultiplier): void {
    this._speed = multiplier;
    if (this._intervalHandle !== null) {
      // Restart interval at new speed; current tick is not interrupted.
      clearInterval(this._intervalHandle);
      this._intervalHandle = setInterval(() => this.step(), INTERVAL_MS[this._speed]);
    }
  }

  /** @deprecated removed in p15e — the clock is command-driven; use SimulationLoop.proceed(). */
  start(): void {
    if (this._intervalHandle !== null) return;
    this._intervalHandle = setInterval(() => this.step(), INTERVAL_MS[this._speed]);
  }

  /** @deprecated removed in p15e — the clock is command-driven; use SimulationLoop.proceed(). */
  stop(): void {
    if (this._intervalHandle !== null) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
  }

  /** @deprecated removed in p15e — the clock halts between cycles by default. */
  pause(): void {
    this.stop();
  }

  /** @deprecated removed in p15e — the clock is command-driven; use SimulationLoop.proceed(). */
  resume(): void {
    this.start();
  }
}

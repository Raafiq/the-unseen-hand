/**
 * SimulationLoop — the ordered subscriber registry that drives world state forward.
 *
 * Spec: specs/behaviors/simulation-loop.md
 * Each tick: advance WorldTime, then run subscribers in registration order.
 * Each subscriber receives the output of the previous one (immutable chain).
 * step() is synchronous — no real-time interval.
 */
import type { SimulationContext } from './types.js';
import { WorldClock, type SpeedMultiplier } from './WorldClock.js';
import { moodSubscriber } from '../adventurers/mood.js';
import { relationshipDecaySubscriber } from '../relationships/graph.js';
import { socialEventSubscriber } from '../events/socialResolver.js';
import { departureSubscriber } from '../adventurers/departureSystem.js';
import { diTrickleSubscriber } from '../divine/DivineInfluence.js';
import { decisionMomentSubscriber } from '../events/DecisionMomentDetector.js';

export type TickSubscriber = (ctx: SimulationContext, delta: number) => SimulationContext;

function advanceTime(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick + 1;
  return {
    ...ctx,
    worldTime: {
      tick,
      day: Math.floor(tick / 24),
      hour: tick % 24,
    },
  };
}

export class SimulationLoop {
  private _ctx: SimulationContext;
  private _subscribers: TickSubscriber[] = [];
  private _clock: WorldClock;

  constructor(initialCtx: SimulationContext) {
    this._ctx = initialCtx;
    this._clock = new WorldClock();
    this._clock.onTick(() => this._tick());
    // Core subscribers in spec-mandated order
    this._subscribers.push(
      moodSubscriber,
      relationshipDecaySubscriber,
      socialEventSubscriber,
      departureSubscriber,
      diTrickleSubscriber,
      decisionMomentSubscriber,
    );
  }

  get context(): SimulationContext {
    return this._ctx;
  }

  register(subscriber: TickSubscriber): void {
    this._subscribers.push(subscriber);
  }

  step(): void {
    this._tick();
  }

  start(): void {
    this._clock.start();
  }

  stop(): void {
    this._clock.stop();
  }

  pause(): void {
    this._clock.pause();
  }

  resume(): void {
    this._clock.resume();
  }

  setSpeed(multiplier: SpeedMultiplier): void {
    this._clock.setSpeed(multiplier);
  }

  private _tick(): void {
    // Advance time first (guaranteed first subscriber)
    let ctx = advanceTime(this._ctx);
    // Run all registered subscribers in order
    for (const subscriber of this._subscribers) {
      ctx = subscriber(ctx, 1);
    }
    this._ctx = ctx;
  }
}

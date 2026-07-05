/**
 * SimulationLoop — the ordered subscriber registry that drives world state forward.
 *
 * Spec: specs/behaviors/simulation-loop.md
 * Each tick: advance WorldTime, then run subscribers in registration order.
 * Each subscriber receives the output of the previous one (immutable chain).
 * step() is synchronous — no real-time interval.
 */
import type { SimulationContext, CycleDigest } from './types.js';
import { cycleOf } from './WorldTime.js';
import { moodSubscriber } from '../adventurers/mood.js';
import { relationshipDecaySubscriber } from '../relationships/graph.js';
import { socialPressureSubscriber } from '../events/socialResolver.js';
import { activitySubscriber } from '../events/activitySystem.js';
import { npcFlavourSubscriber } from '../events/npcFlavour.js';
import { departureSubscriber } from '../adventurers/departureSystem.js';
import { diTrickleSubscriber } from '../divine/DivineInfluence.js';
import { decisionMomentSubscriber } from '../events/DecisionMomentDetector.js';
import { scenarioEvaluatorSubscriber } from '../scenarios/ScenarioEngine.js';
import { worldExpansionSubscriber, festivalSeedingSubscriber } from './WorldExpansion.js';
import {
  questBoardSeedingSubscriber,
  createQuestExpirySubscriber,
  partySelectionSubscriber,
  questResolutionSubscriber,
} from '../quests/questSystem.js';
import { personalGoalSubscriber } from '../adventurers/PersonalGoals.js';
import { worldEventSeedingSubscriber } from './WorldExpansion.js';
import { thoughtWhisperSubscriber } from '../thoughts/thoughtWhispers.js';
import { townDriverSubscriber } from '../relationships/drivers.js';

export type TickSubscriber = (ctx: SimulationContext, delta: number) => SimulationContext;

function advanceTime(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick + 1;
  const hour = tick % 24;
  return {
    ...ctx,
    worldTime: {
      tick,
      day: Math.floor(tick / 24),
      hour,
      cycle: cycleOf(hour),
    },
  };
}

/** Number of ticks in one cycle (world-clock.md#cycles). */
const TICKS_PER_CYCLE = 8;

export class SimulationLoop {
  private _ctx: SimulationContext;
  private _subscribers: TickSubscriber[] = [];

  constructor(initialCtx: SimulationContext) {
    this._ctx = initialCtx;
    // Spec-mandated subscriber order (simulation-loop.md §Subscriber execution order)
    this._subscribers.push(
      moodSubscriber,            // slot 2: mood recalculation (day ticks only)
      relationshipDecaySubscriber, // slot 3: relationship tick
      questBoardSeedingSubscriber, // slot 5a: quest board seeding (weekly)
      createQuestExpirySubscriber(), // slot 5b: quest expiry + drought tracking
      partySelectionSubscriber,  // slot 6: autonomous party selection (day ticks)
      questResolutionSubscriber, // slot 7: quest outcome resolution
      activitySubscriber,        // slot 8: activity pool (runs before social escalation)
      socialPressureSubscriber,  // slot 8b: per-tick social pressure accumulation + jittered discharge (social-system.md §4)
      personalGoalSubscriber,    // slot 9a: personal goal completion checks
      decisionMomentSubscriber,  // slot 9b: decision moment detector
      departureSubscriber,       // slot 10: departure system (day ticks)
      diTrickleSubscriber,       // DI trickle (every tick)
      scenarioEvaluatorSubscriber, // scenario evaluation (every tick, after all systems)
      worldEventSeedingSubscriber, // autonomous world flavour events (~1/day, spread across clock) + span END-sweep
      festivalSeedingSubscriber, // autonomous town-festival cadence (npc-system.md); END swept above
      worldExpansionSubscriber,  // region unlocks (every tick, after scenario)
      // Tier B town flavour runs late so its per-tick rng draws never shift the stream seen by
      // the decision/quest/social systems within a tick (npc-system.md; p10b span-tint precedent).
      npcFlavourSubscriber,
      // THOUGHT whispers run dead-last for the same rng-stream-ordering reason: a new per-tick
      // rng consumer must sit after every already-baselined intra-tick draw — including
      // npcFlavour's own (thought-system.md#thought-whispers).
      thoughtWhisperSubscriber,
      // Town-life relationship drivers (KINDNESS / RIVALRY_SPARK) run after even the thought
      // whispers — a brand-new per-tick rng consumer must slot after every already-baselined draw
      // so it never churns the decision/quest/social/thought streams (relationship-events.md).
      townDriverSubscriber,
    );
  }

  get context(): SimulationContext {
    return this._ctx;
  }

  register(subscriber: TickSubscriber): void {
    this._subscribers.push(subscriber);
  }

  /** Inject an externally-modified context (e.g. after a dispatch call) between ticks. */
  setContext(ctx: SimulationContext): void {
    this._ctx = ctx;
  }

  step(): void {
    this._tick();
  }

  /**
   * PROCEED — compute exactly one cycle (8 ticks) synchronously, then halt.
   *
   * Spec: specs/behaviors/world-clock.md#advancement--the-proceed-command.
   * Drives the existing `_tick()` path 8 times (advanceTime first, then subscribers
   * in registration order) so subscribers cannot tell a PROCEED from a real-time tick.
   * When this returns, the full cycle has resolved and all subscriber side effects are
   * written; the clock is left halted at the new cycle boundary.
   *
   * Returns a {@link CycleDigest} for the window just computed — `day`/`cycle` label the
   * cycle that was read (the pre-advance boundary), and `fromTick`/`toTick` bound its ticks.
   */
  proceed(): CycleDigest {
    const start = this._ctx.worldTime; // at a cycle boundary: cycle === the one about to compute
    const fromTick = start.tick;
    for (let i = 0; i < TICKS_PER_CYCLE; i++) this._tick();
    return { fromTick, toTick: this._ctx.worldTime.tick, day: start.day, cycle: start.cycle };
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

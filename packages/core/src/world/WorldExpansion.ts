/**
 * World Expansion — region unlocks driven by reputation and scenario completion.
 *
 * Spec: specs/behaviors/world-expansion.md
 *
 * Region unlock triggers:
 *   ASHWOOD  — ScenarioComplete OR reputation ≥ 200
 *   STORMPASS — reputation ≥ 500 OR 2 scenarios complete
 *
 * Unlock is idempotent: already-unlocked regions are not re-fired.
 */
import type { SimulationContext, Region, RegionId } from './types.js';
import { emitEvent } from '../events/eventBus.js';

// ---------------------------------------------------------------------------
// Starting regions
// ---------------------------------------------------------------------------

export function createStartingRegions(): Map<RegionId, Region> {
  return new Map<RegionId, Region>([
    ['THORNVALE', {
      id: 'THORNVALE',
      name: 'Thornvale',
      difficulty: 3,
      activeWorldEvents: [],
      unlocked: true,
    }],
    ['ASHWOOD', {
      id: 'ASHWOOD',
      name: 'The Ashwood',
      difficulty: 5,
      activeWorldEvents: [],
      unlocked: false,
    }],
    ['STORMPASS', {
      id: 'STORMPASS',
      name: 'Stormpass',
      difficulty: 7,
      activeWorldEvents: [],
      unlocked: false,
    }],
  ]);
}

// ---------------------------------------------------------------------------
// Reputation helpers
// ---------------------------------------------------------------------------

export type ReputationEvent =
  | { event: 'QUEST_SUCCESS'; difficulty: number }
  | { event: 'QUEST_FAILURE' }
  | { event: 'ADVENTURER_DEATH' }
  | { event: 'BOND_FORMED' }
  | { event: 'GOAL_ACHIEVED' }
  | { event: 'SCENARIO_OBJECTIVE' };

/** Returns the new reputation value after applying the event delta, clamped [0, 1000]. */
export function updateReputation(current: number, reputationEvent: ReputationEvent): number {
  let delta = 0;
  switch (reputationEvent.event) {
    case 'QUEST_SUCCESS': {
      const d = reputationEvent.difficulty;
      delta = d <= 4 ? 5 : d <= 7 ? 10 : 20;
      break;
    }
    case 'QUEST_FAILURE':       delta = -8;  break;
    case 'ADVENTURER_DEATH':    delta = -15; break;
    case 'BOND_FORMED':         delta = 5;   break;
    case 'GOAL_ACHIEVED':       delta = 10;  break;
    case 'SCENARIO_OBJECTIVE':  delta = 50;  break;
  }
  return Math.min(1000, Math.max(0, current + delta));
}

// ---------------------------------------------------------------------------
// Unlock helpers
// ---------------------------------------------------------------------------

function scenariosCompleteCount(ctx: SimulationContext): number {
  return ctx.eventLog.filter(
    e => e.kind === 'WORLD' && (e as any).subtype === 'SCENARIO_COMPLETE',
  ).length;
}

function unlock(ctx: SimulationContext, regionId: RegionId): SimulationContext {
  const region = ctx.activeRegions.get(regionId);
  if (!region || region.unlocked) return ctx;

  const updatedRegions = new Map(ctx.activeRegions);
  updatedRegions.set(regionId, { ...region, unlocked: true });
  let next = { ...ctx, activeRegions: updatedRegions };
  next = emitEvent(next, { kind: 'WORLD', subtype: 'REGION_UNLOCKED', regionId });
  return next;
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

/** Per-tick world expansion check. Register in SimulationLoop after scenarioEvaluator. */
export function worldExpansionSubscriber(
  ctx: SimulationContext,
  _delta = 1,
): SimulationContext {
  let next = ctx;
  const rep = next.reputation;
  const scenariosComplete = scenariosCompleteCount(next);

  // ASHWOOD: ScenarioComplete OR reputation ≥ 200
  if (!next.activeRegions.get('ASHWOOD')?.unlocked) {
    if (scenariosComplete >= 1 || rep >= 200) {
      next = unlock(next, 'ASHWOOD');
    }
  }

  // STORMPASS: reputation ≥ 500 OR 2 scenarios complete
  if (!next.activeRegions.get('STORMPASS')?.unlocked) {
    if (rep >= 500 || scenariosComplete >= 2) {
      next = unlock(next, 'STORMPASS');
    }
  }

  return next;
}

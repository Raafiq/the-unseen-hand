/**
 * Scenario Engine — per-tick evaluation of scenario goals and fail conditions.
 *
 * Spec: specs/behaviors/scenario-engine.md
 *
 * Runs last in the subscriber order (after all other systems).
 * No-ops when ctx.scenario is null or status is not ACTIVE.
 */
import type { SimulationContext, Scenario } from '../world/types.js';
import { emitEvent } from '../events/eventBus.js';
import { updateReputation } from '../world/WorldExpansion.js';
import { grantDI } from '../divine/DivineInfluence.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, Scenario>();

/** Register a Scenario definition so the evaluator can find its conditions. */
export function registerScenario(scenario: Scenario): void {
  registry.set(scenario.id, scenario);
}

// ---------------------------------------------------------------------------
// Upkeep
// ---------------------------------------------------------------------------

const UPKEEP_PER_ADVENTURER = 5;
const TICKS_PER_WEEK = 168; // 7 days × 24 ticks

function applyUpkeep(ctx: SimulationContext): SimulationContext {
  const { tick } = ctx.worldTime;
  if (tick === 0 || tick % TICKS_PER_WEEK !== 0) return ctx;
  const living = [...ctx.adventurers.values()].filter(
    a => a.state !== 'DEAD' && a.state !== 'RETIRED',
  ).length;
  return { ...ctx, treasury: ctx.treasury - living * UPKEEP_PER_ADVENTURER };
}

// ---------------------------------------------------------------------------
// Treasury tracking (for BANKRUPTCY consecutive-tick check)
// ---------------------------------------------------------------------------

function trackTreasuryNegative(ctx: SimulationContext): SimulationContext {
  if (!ctx.scenario) return ctx;
  const { treasuryNegativeSince } = ctx.scenario;
  const { tick } = ctx.worldTime;
  if (ctx.treasury < 0) {
    if (treasuryNegativeSince === null) {
      return { ...ctx, scenario: { ...ctx.scenario, treasuryNegativeSince: tick } };
    }
  } else {
    if (treasuryNegativeSince !== null) {
      return { ...ctx, scenario: { ...ctx.scenario, treasuryNegativeSince: null } };
    }
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

/** Per-tick scenario evaluator. Register in SimulationLoop last (after all other subscribers). */
export function scenarioEvaluatorSubscriber(
  ctx: SimulationContext,
  _delta = 1,
): SimulationContext {
  if (!ctx.scenario) return ctx;
  if (ctx.scenario.status !== 'ACTIVE') return ctx;

  const scenarioDef = registry.get(ctx.scenario.scenarioId);

  // Apply upkeep before evaluation (treasury may affect fail conditions)
  let next = scenarioDef ? applyUpkeep(ctx) : ctx;

  if (!scenarioDef) return next;

  // Track consecutive negative-treasury ticks (for BANKRUPTCY condition)
  next = trackTreasuryNegative(next);

  let { scenario } = next;
  if (!scenario) return next;

  const { tick } = next.worldTime;

  // -- Fail condition evaluation --
  let failed = false;
  for (const fcDef of scenarioDef.failConditions) {
    const fcState = scenario.failConditions.find(f => f.id === fcDef.id);
    if (!fcState || fcState.triggered) continue;
    if (fcDef.condition(next)) {
      failed = true;
      scenario = {
        ...scenario,
        failConditions: scenario.failConditions.map(f =>
          f.id === fcDef.id ? { ...f, triggered: true, triggeredAt: tick } : f,
        ),
        status: 'FAILED',
      };
      next = emitEvent({ ...next, scenario }, { kind: 'WORLD', subtype: 'SCENARIO_FAILED' });
      scenario = next.scenario!;
      break; // first triggered fail ends evaluation
    }
  }

  if (failed) return next;

  // -- Goal evaluation --
  for (const gDef of scenarioDef.goals) {
    const gState = scenario.goals.find(g => g.id === gDef.id);
    if (!gState || gState.completed) continue;
    if (gDef.condition(next)) {
      scenario = {
        ...scenario,
        goals: scenario.goals.map(g =>
          g.id === gDef.id ? { ...g, completed: true, completedAt: tick } : g,
        ),
      };
      next = grantDI({ ...next, scenario }, gDef.diReward);
      next = emitEvent(next, { kind: 'WORLD', subtype: 'SCENARIO_GOAL_ACHIEVED', goalId: gDef.id });
      next = { ...next, reputation: updateReputation(next.reputation, { event: 'SCENARIO_OBJECTIVE' }) };
      scenario = next.scenario!;
    }
  }

  // -- Completion check --
  const requiredGoals = scenarioDef.goals.filter(g => !g.optional);
  const allRequiredMet = requiredGoals.every(g =>
    scenario!.goals.find(gs => gs.id === g.id)?.completed,
  );

  if (allRequiredMet && scenario.status === 'ACTIVE') {
    scenario = { ...scenario, status: 'COMPLETE' };
    next = emitEvent({ ...next, scenario }, { kind: 'WORLD', subtype: 'SCENARIO_COMPLETE' });
    scenario = next.scenario!;
  }

  return { ...next, scenario };
}

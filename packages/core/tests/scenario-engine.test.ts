import { describe, it, expect, beforeEach } from 'vitest';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import {
  scenarioEvaluatorSubscriber,
  registerScenario,
} from '../src/scenarios/ScenarioEngine.js';
import type { SimulationContext, ScenarioGoalState, FailConditionState } from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function atTick(ctx: SimulationContext, t: number): SimulationContext {
  return { ...ctx, worldTime: { tick: t, day: Math.floor(t / 24), hour: t % 24 } };
}

function makeCtxWithScenario(
  goals: ScenarioGoalState[],
  failConditions: FailConditionState[],
  extra: Partial<SimulationContext> = {},
): SimulationContext {
  const base = createSimulationContext('test');
  return {
    ...base,
    ...extra,
    scenario: {
      scenarioId: 'TEST_SCENARIO',
      startedAt: 0,
      status: 'ACTIVE',
      treasuryNegativeSince: null,
      goals,
      failConditions,
    },
  };
}

function makeGoal(id: string, opts: Partial<ScenarioGoalState> = {}): ScenarioGoalState {
  return { id, description: `Goal ${id}`, completed: false, diReward: 10, ...opts };
}

function makeFailCondition(id: string, opts: Partial<FailConditionState> = {}): FailConditionState {
  return { id, description: `Fail ${id}`, triggered: false, ...opts };
}

const ALWAYS_TRUE_SCENARIO = {
  id: 'TEST_SCENARIO',
  title: 'Test Scenario',
  premise: 'A test.',
  startingRoster: [],
  startingDI: 50,
  goals: [
    {
      id: 'G1',
      description: 'Always-true goal',
      condition: (_ctx: SimulationContext) => true,
      diReward: 10,
    },
  ],
  failConditions: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScenarioEngine — goal evaluation', () => {
  beforeEach(() => {
    registerScenario(ALWAYS_TRUE_SCENARIO);
  });

  it('marks a goal completed when its condition is true', () => {
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], []), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.scenario!.goals[0].completed).toBe(true);
  });

  it('records completedAt on the goal when condition is true', () => {
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], []), 5);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.scenario!.goals[0].completedAt).toBe(5);
  });

  it('grants DI when goal condition is met', () => {
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], []), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.divineInfluence).toBe(ctx.divineInfluence + 10);
  });

  it('emits SCENARIO_GOAL_ACHIEVED world event when goal completes', () => {
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], []), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    const ev = result.eventLog.find(e => e.kind === 'WORLD' && (e as any).subtype === 'SCENARIO_GOAL_ACHIEVED');
    expect(ev).toBeDefined();
    expect(ev!.renderedText).toBeTruthy();
  });

  it('does not re-fire goal events when goal is already completed', () => {
    const ctx = atTick(
      makeCtxWithScenario([makeGoal('G1', { completed: true, completedAt: 1 })], []),
      2,
    );
    const result = scenarioEvaluatorSubscriber(ctx);
    const goalEvents = result.eventLog.filter(
      e => e.kind === 'WORLD' && (e as any).subtype === 'SCENARIO_GOAL_ACHIEVED',
    );
    expect(goalEvents).toHaveLength(0);
  });
});

describe('ScenarioEngine — fail condition evaluation', () => {
  it('sets status to FAILED and fires SCENARIO_FAILED when fail condition triggers', () => {
    registerScenario({
      id: 'TEST_SCENARIO',
      title: 'Test',
      premise: 'A test.',
      startingRoster: [],
      startingDI: 50,
      goals: [],
      failConditions: [
        { id: 'F1', description: 'Always fails', condition: (_ctx: SimulationContext) => true },
      ],
    });
    const ctx = atTick(makeCtxWithScenario([], [makeFailCondition('F1')]), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.scenario!.status).toBe('FAILED');
    expect(result.scenario!.failConditions[0].triggered).toBe(true);
    const ev = result.eventLog.find(e => e.kind === 'WORLD' && (e as any).subtype === 'SCENARIO_FAILED');
    expect(ev).toBeDefined();
  });

  it('does not evaluate fail conditions after scenario is already FAILED', () => {
    registerScenario({
      id: 'TEST_SCENARIO',
      title: 'Test',
      premise: 'A test.',
      startingRoster: [],
      startingDI: 50,
      goals: [],
      failConditions: [
        { id: 'F1', description: 'Always fails', condition: (_ctx: SimulationContext) => true },
      ],
    });
    const ctx = atTick(
      makeCtxWithScenario([], [makeFailCondition('F1', { triggered: true, triggeredAt: 1 })]),
      2,
    );
    const ctxFailed = { ...ctx, scenario: { ...ctx.scenario!, status: 'FAILED' as const } };
    const result = scenarioEvaluatorSubscriber(ctxFailed);
    expect(result.eventLog.filter(e => e.kind === 'WORLD' && (e as any).subtype === 'SCENARIO_FAILED')).toHaveLength(0);
  });
});

describe('ScenarioEngine — scenario completion', () => {
  it('sets status to COMPLETE when all non-optional goals are met', () => {
    registerScenario({
      id: 'TEST_SCENARIO',
      title: 'Test',
      premise: 'A test.',
      startingRoster: [],
      startingDI: 50,
      goals: [
        { id: 'G1', description: 'req goal', condition: (_ctx: SimulationContext) => true, diReward: 10 },
      ],
      failConditions: [],
    });
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], []), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.scenario!.status).toBe('COMPLETE');
  });

  it('fires SCENARIO_COMPLETE event on completion', () => {
    registerScenario({
      id: 'TEST_SCENARIO',
      title: 'Test',
      premise: 'A test.',
      startingRoster: [],
      startingDI: 50,
      goals: [
        { id: 'G1', description: 'req', condition: (_ctx: SimulationContext) => true, diReward: 10 },
      ],
      failConditions: [],
    });
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], []), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    const ev = result.eventLog.find(e => e.kind === 'WORLD' && (e as any).subtype === 'SCENARIO_COMPLETE');
    expect(ev).toBeDefined();
    expect(ev!.renderedText).toBeTruthy();
  });

  it('optional goal incomplete does not block ScenarioComplete', () => {
    registerScenario({
      id: 'TEST_SCENARIO',
      title: 'Test',
      premise: 'A test.',
      startingRoster: [],
      startingDI: 50,
      goals: [
        { id: 'G1', description: 'required', condition: (_ctx: SimulationContext) => true, diReward: 10 },
        { id: 'OPT', description: 'optional', condition: (_ctx: SimulationContext) => false, diReward: 20, optional: true },
      ],
      failConditions: [],
    });
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1'), makeGoal('OPT')], []), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.scenario!.status).toBe('COMPLETE');
  });

  it('SCENARIO_FAILED blocks ScenarioComplete even if all goals met', () => {
    registerScenario({
      id: 'TEST_SCENARIO',
      title: 'Test',
      premise: 'A test.',
      startingRoster: [],
      startingDI: 50,
      goals: [
        { id: 'G1', description: 'req', condition: (_ctx: SimulationContext) => true, diReward: 10 },
      ],
      failConditions: [
        { id: 'F1', description: 'always fail', condition: (_ctx: SimulationContext) => true },
      ],
    });
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], [makeFailCondition('F1')]), 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.scenario!.status).toBe('FAILED');
  });
});

describe('ScenarioEngine — no-op conditions', () => {
  it('no-ops if ctx.scenario is null', () => {
    const ctx = createSimulationContext('test');
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result).toBe(ctx);
  });

  it('no-ops if scenario status is not ACTIVE', () => {
    registerScenario(ALWAYS_TRUE_SCENARIO);
    const ctx = atTick(makeCtxWithScenario([makeGoal('G1')], []), 1);
    const completedCtx = { ...ctx, scenario: { ...ctx.scenario!, status: 'COMPLETE' as const } };
    const result = scenarioEvaluatorSubscriber(completedCtx);
    expect(result.eventLog).toHaveLength(0);
  });
});

describe('ScenarioEngine — upkeep', () => {
  it('deducts 5 gold per adventurer each week tick (tick divisible by 168)', () => {
    registerScenario(ALWAYS_TRUE_SCENARIO);
    // Make goals already complete so upkeep doesn't trigger scenario complete events
    const ctx = atTick({
      ...makeCtxWithScenario([makeGoal('G1', { completed: true })], []),
      treasury: 100,
      adventurers: new Map([
        ['a1', { id: 'a1', state: 'IDLE' } as any],
        ['a2', { id: 'a2', state: 'IDLE' } as any],
      ]),
    }, 168);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.treasury).toBe(100 - 5 * 2);
  });

  it('does not deduct upkeep on non-week ticks', () => {
    registerScenario(ALWAYS_TRUE_SCENARIO);
    const ctx = atTick({
      ...makeCtxWithScenario([makeGoal('G1', { completed: true })], []),
      treasury: 100,
      adventurers: new Map([['a1', { id: 'a1', state: 'IDLE' } as any]]),
    }, 1);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.treasury).toBe(100);
  });

  it('counts only living adventurers (not DEAD or RETIRED) for upkeep', () => {
    registerScenario(ALWAYS_TRUE_SCENARIO);
    const ctx = atTick({
      ...makeCtxWithScenario([makeGoal('G1', { completed: true })], []),
      treasury: 100,
      adventurers: new Map([
        ['a1', { id: 'a1', state: 'IDLE' } as any],
        ['a2', { id: 'a2', state: 'DEAD' } as any],
        ['a3', { id: 'a3', state: 'RETIRED' } as any],
      ]),
    }, 168);
    const result = scenarioEvaluatorSubscriber(ctx);
    expect(result.treasury).toBe(95);
  });
});

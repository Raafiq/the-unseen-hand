import { describe, it, expect } from 'vitest';
import { createScenario1Context, SCENARIO_1_ID } from '../src/scenarios/scenario1.js';
import { scenarioEvaluatorSubscriber } from '../src/scenarios/ScenarioEngine.js';
import type { SimulationContext } from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function atTick(ctx: SimulationContext, t: number): SimulationContext {
  return { ...ctx, worldTime: { tick: t, day: Math.floor(t / 24), hour: t % 24 } };
}

function tick(ctx: SimulationContext, t: number): SimulationContext {
  return scenarioEvaluatorSubscriber(atTick(ctx, t));
}

function killAdventurers(ctx: SimulationContext, ids: string[]): SimulationContext {
  const adventurers = new Map(ctx.adventurers);
  for (const id of ids) {
    const adv = adventurers.get(id);
    if (adv) adventurers.set(id, { ...adv, state: 'DEAD' });
  }
  return { ...ctx, adventurers };
}

// ---------------------------------------------------------------------------
// Scenario 1 context setup
// ---------------------------------------------------------------------------

describe('Scenario 1 — createScenario1Context', () => {
  it('starts with treasury === 50', () => {
    const ctx = createScenario1Context();
    expect(ctx.treasury).toBe(50);
  });

  it('starts with divineInfluence === 40', () => {
    const ctx = createScenario1Context();
    expect(ctx.divineInfluence).toBe(40);
  });

  it('starts with 1 adventurer (Kara)', () => {
    const ctx = createScenario1Context();
    expect(ctx.adventurers.size).toBe(1);
    const kara = [...ctx.adventurers.values()][0]!;
    expect(kara.identity.name).toBe('Kara');
  });

  it('Kara starts with no relationship edges', () => {
    const ctx = createScenario1Context();
    const kara = [...ctx.adventurers.values()][0]!;
    const edges = ctx.relationships.get(kara.id);
    expect(!edges || edges.size === 0).toBe(true);
  });

  it('scenario is ACTIVE at start with correct scenarioId', () => {
    const ctx = createScenario1Context();
    expect(ctx.scenario).not.toBeNull();
    expect(ctx.scenario!.scenarioId).toBe(SCENARIO_1_ID);
    expect(ctx.scenario!.status).toBe('ACTIVE');
  });

  it('Kara has BELONGING as her personal goal', () => {
    const ctx = createScenario1Context();
    const kara = [...ctx.adventurers.values()][0]!;
    expect(kara.identity.personalGoal).toBe('BELONGING');
  });
});

// ---------------------------------------------------------------------------
// Goal conditions
// ---------------------------------------------------------------------------

describe('Scenario 1 — SURVIVAL goal', () => {
  it('SURVIVAL goal completes at tick 720 when Kara is alive', () => {
    const result = tick(createScenario1Context(), 720);
    const survival = result.scenario!.goals.find(g => g.id === 'SURVIVAL');
    expect(survival!.completed).toBe(true);
  });

  it('SURVIVAL goal does not complete at tick 720 when Kara is dead', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const result = tick(killAdventurers(ctx, ids), 720);
    const survival = result.scenario!.goals.find(g => g.id === 'SURVIVAL');
    expect(survival!.completed).toBe(false);
  });

  it('SURVIVAL goal does not complete before tick 720', () => {
    const result = tick(createScenario1Context(), 719);
    const survival = result.scenario!.goals.find(g => g.id === 'SURVIVAL');
    expect(survival!.completed).toBe(false);
  });
});

describe('Scenario 1 — SOLVENT goal', () => {
  it('SOLVENT goal completes at tick 720 when treasury > 0', () => {
    const ctx = { ...createScenario1Context(), treasury: 10 };
    const result = tick(ctx, 720);
    const solvent = result.scenario!.goals.find(g => g.id === 'SOLVENT');
    expect(solvent!.completed).toBe(true);
  });

  it('SOLVENT goal does not complete at tick 720 when treasury === 0', () => {
    const ctx = { ...createScenario1Context(), treasury: 0 };
    const result = tick(ctx, 720);
    const solvent = result.scenario!.goals.find(g => g.id === 'SOLVENT');
    expect(solvent!.completed).toBe(false);
  });

  it('SOLVENT goal does not complete before tick 720', () => {
    const ctx = { ...createScenario1Context(), treasury: 100 };
    const result = tick(ctx, 719);
    const solvent = result.scenario!.goals.find(g => g.id === 'SOLVENT');
    expect(solvent!.completed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fail conditions
// ---------------------------------------------------------------------------

describe('Scenario 1 — ROSTER_COLLAPSE fail condition', () => {
  it('ROSTER_COLLAPSE triggers when Kara dies', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const result = tick(killAdventurers(ctx, ids), 1);
    expect(result.scenario!.status).toBe('FAILED');
    const fc = result.scenario!.failConditions.find(f => f.id === 'ROSTER_COLLAPSE');
    expect(fc!.triggered).toBe(true);
  });

  it('ROSTER_COLLAPSE does not trigger when Kara is alive', () => {
    const result = tick(createScenario1Context(), 1);
    const fc = result.scenario!.failConditions.find(f => f.id === 'ROSTER_COLLAPSE');
    expect(fc!.triggered).toBe(false);
  });
});

describe('Scenario 1 — BANKRUPTCY fail condition', () => {
  it('BANKRUPTCY does not trigger after fewer than 168 ticks of negative treasury', () => {
    const ctx = {
      ...createScenario1Context(),
      treasury: -1,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: 1 },
    };
    const result = tick(ctx, 168);
    const fc = result.scenario!.failConditions.find(f => f.id === 'BANKRUPTCY');
    expect(fc!.triggered).toBe(false);
    expect(result.scenario!.status).toBe('ACTIVE');
  });

  it('BANKRUPTCY triggers at exactly 168 ticks of consecutive negative treasury', () => {
    const ctx = {
      ...createScenario1Context(),
      treasury: -1,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: 1 },
    };
    const result = tick(ctx, 169);
    const fc = result.scenario!.failConditions.find(f => f.id === 'BANKRUPTCY');
    expect(fc!.triggered).toBe(true);
  });

  it('BANKRUPTCY tracking resets when treasury returns to 0 or above', () => {
    const ctx = {
      ...createScenario1Context(),
      treasury: -1,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: 1 },
    };
    const ctxPositive = { ...atTick(ctx, 50), treasury: 10 };
    const result = scenarioEvaluatorSubscriber(ctxPositive);
    expect(result.scenario!.treasuryNegativeSince).toBeNull();
  });
});

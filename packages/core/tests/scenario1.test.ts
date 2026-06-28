import { describe, it, expect } from 'vitest';
import { createScenario1Context, SCENARIO_1_ID } from '../src/scenarios/scenario1.js';
import { scenarioEvaluatorSubscriber } from '../src/scenarios/ScenarioEngine.js';
import { emitEvent } from '../src/events/eventBus.js';
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

  it('starts with 6 adventurers', () => {
    const ctx = createScenario1Context();
    expect(ctx.adventurers.size).toBe(6);
  });

  it('Garrett and Kara start with TRUSTED_COMPANION edge at strength 75', () => {
    const ctx = createScenario1Context();
    const byName = new Map([...ctx.adventurers.values()].map(a => [a.identity.name, a.id]));
    const garrettId = byName.get('Garrett')!;
    const karaId = byName.get('Kara')!;
    expect(garrettId).toBeDefined();
    expect(karaId).toBeDefined();
    const edge = ctx.relationships.get(garrettId)?.get(karaId);
    expect(edge).toBeDefined();
    expect(edge!.strength).toBe(75);
    expect(edge!.type).toBe('TRUSTED_COMPANION');
  });

  it('Kara also has the symmetric edge to Garrett', () => {
    const ctx = createScenario1Context();
    const byName = new Map([...ctx.adventurers.values()].map(a => [a.identity.name, a.id]));
    const edge = ctx.relationships.get(byName.get('Kara')!)?.get(byName.get('Garrett')!);
    expect(edge!.strength).toBe(75);
  });

  it('Voss and Mira start with RIVAL edge at strength -30', () => {
    const ctx = createScenario1Context();
    const byName = new Map([...ctx.adventurers.values()].map(a => [a.identity.name, a.id]));
    const edge = ctx.relationships.get(byName.get('Voss')!)?.get(byName.get('Mira')!);
    expect(edge).toBeDefined();
    expect(edge!.strength).toBe(-30);
    expect(edge!.type).toBe('RIVAL');
  });

  it('scenario is ACTIVE at start with correct scenarioId', () => {
    const ctx = createScenario1Context();
    expect(ctx.scenario).not.toBeNull();
    expect(ctx.scenario!.scenarioId).toBe(SCENARIO_1_ID);
    expect(ctx.scenario!.status).toBe('ACTIVE');
  });

  it('has correct personal goals for each adventurer', () => {
    const ctx = createScenario1Context();
    const byName = new Map([...ctx.adventurers.values()].map(a => [a.identity.name, a]));
    expect(byName.get('Kara')!.identity.personalGoal).toBe('BELONGING');
    expect(byName.get('Doran')!.identity.personalGoal).toBe('WEALTH');
    expect(byName.get('Selin')!.identity.personalGoal).toBe('PEACE');
    expect(byName.get('Mira')!.identity.personalGoal).toBe('HEROISM');
    expect(byName.get('Garrett')!.identity.personalGoal).toBe('BELONGING');
    expect(byName.get('Voss')!.identity.personalGoal).toBe('REVENGE');
  });
});

// ---------------------------------------------------------------------------
// Goal conditions
// ---------------------------------------------------------------------------

describe('Scenario 1 — SURVIVAL goal', () => {
  it('SURVIVAL goal completes at tick 720 when ≥4 adventurers alive', () => {
    const result = tick(createScenario1Context(), 720);
    const survival = result.scenario!.goals.find(g => g.id === 'SURVIVAL');
    expect(survival!.completed).toBe(true);
  });

  it('SURVIVAL goal does not complete at tick 720 when only 3 alive', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const result = tick(killAdventurers(ctx, ids.slice(0, 3)), 720);
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

describe('Scenario 1 — BOND goal (optional)', () => {
  it('BOND goal completes when TRUSTED_COMPANION_BOND_FORMED event is in log', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const ctxWithBond = emitEvent(ctx, {
      kind: 'LIFECYCLE',
      subtype: 'TRUSTED_COMPANION_BOND_FORMED',
      involvedIds: [ids[0], ids[1]],
    });
    const result = tick(ctxWithBond, 1);
    const bond = result.scenario!.goals.find(g => g.id === 'BOND');
    expect(bond!.completed).toBe(true);
  });

  it('BOND goal does not complete without TRUSTED_COMPANION_BOND_FORMED event', () => {
    const result = tick(createScenario1Context(), 1);
    const bond = result.scenario!.goals.find(g => g.id === 'BOND');
    expect(bond!.completed).toBe(false);
  });

  it('incomplete BOND goal does not block ScenarioComplete when required goals met', () => {
    // Treasury 50 > 0 and 6 adventurers alive at tick 720 → required goals met
    const result = tick(createScenario1Context(), 720);
    const bond = result.scenario!.goals.find(g => g.id === 'BOND');
    expect(bond!.completed).toBe(false);
    expect(result.scenario!.status).toBe('COMPLETE');
  });
});

// ---------------------------------------------------------------------------
// Fail conditions
// ---------------------------------------------------------------------------

describe('Scenario 1 — ROSTER_COLLAPSE fail condition', () => {
  it('ROSTER_COLLAPSE triggers when living adventurers drop to 1', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const ctx5Dead = killAdventurers(ctx, ids.slice(0, 5)); // 1 remaining
    const result = tick(ctx5Dead, 1);
    expect(result.scenario!.status).toBe('FAILED');
    const fc = result.scenario!.failConditions.find(f => f.id === 'ROSTER_COLLAPSE');
    expect(fc!.triggered).toBe(true);
  });

  it('ROSTER_COLLAPSE does not trigger at 2 living adventurers', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const ctx4Dead = killAdventurers(ctx, ids.slice(0, 4)); // 2 remaining
    const result = tick(ctx4Dead, 1);
    const fc = result.scenario!.failConditions.find(f => f.id === 'ROSTER_COLLAPSE');
    expect(fc!.triggered).toBe(false);
  });
});

describe('Scenario 1 — BANKRUPTCY fail condition', () => {
  it('BANKRUPTCY does not trigger after fewer than 168 ticks of negative treasury', () => {
    // Set treasuryNegativeSince to tick 1, evaluate at tick 168 → 167 ticks elapsed → not triggered
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
    // treasuryNegativeSince = 1, current tick = 169 → 169-1 = 168 ticks → triggers
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
    // Start negative (to set tracker), then go positive (to reset), then confirm no trigger
    const ctx = {
      ...createScenario1Context(),
      treasury: -1,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: 1 },
    };
    // Now treasury goes positive
    const ctxPositive = { ...atTick(ctx, 50), treasury: 10 };
    const result = scenarioEvaluatorSubscriber(ctxPositive);
    expect(result.scenario!.treasuryNegativeSince).toBeNull();
  });
});

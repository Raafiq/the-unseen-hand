import { describe, it, expect } from 'vitest';
import { decisionMomentSubscriber } from '../src/events/DecisionMomentDetector.js';
import { createScenario1Context } from '../src/scenarios/scenario1.js';
import { createEdge } from '../src/relationships/graph.js';
import type { SimulationContext } from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createScenario1Context(), ...overrides };
}

describe('decisionMomentSubscriber — SCENARIO_GOAL detection', () => {
  it('surfaces BOND SCENARIO_GOAL when two adventurers have relationship strength ≥ 55', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const [idA, idB] = [ids[0]!, ids[1]!];

    // Set edge strength to 60 — approaching TRUSTED_COMPANION (threshold 70)
    const relationships = new Map(ctx.relationships);
    const edgesA = new Map(relationships.get(idA) ?? []);
    edgesA.set(idB, { ...createEdge(60), strength: 60 });
    relationships.set(idA, edgesA);
    const edgesB = new Map(relationships.get(idB) ?? []);
    edgesB.set(idA, { ...createEdge(60), strength: 60 });
    relationships.set(idB, edgesB);

    const next = decisionMomentSubscriber({ ...ctx, relationships }, 1);
    const goalMoments = next.pendingDecisions.filter(m => m.kind === 'SCENARIO_GOAL');
    expect(goalMoments.some(m => m.subjectId === 'BOND')).toBe(true);
  });

  it('does NOT surface BOND moment when no pair has strength ≥ 55', () => {
    const ctx = createScenario1Context();
    // Fresh context — Garrett+Kara have strength 75 so BOND is already achievable,
    // but check that moderate-strength pairs don't trigger it spuriously
    // Use ctx with all relationships at 40 (FRIEND but not imminent)
    const relationships = new Map<string, Map<string, ReturnType<typeof createEdge>>>();
    const next = decisionMomentSubscriber({ ...ctx, relationships }, 1);
    const bondGoalMoment = next.pendingDecisions.find(
      m => m.kind === 'SCENARIO_GOAL' && m.subjectId === 'BOND',
    );
    expect(bondGoalMoment).toBeUndefined();
  });

  it('does NOT surface BOND moment when BOND goal is already completed', () => {
    const ctx = createScenario1Context();
    const ids = [...ctx.adventurers.keys()];
    const [idA, idB] = [ids[0]!, ids[1]!];
    const relationships = new Map(ctx.relationships);
    const edgesA = new Map(relationships.get(idA) ?? []);
    edgesA.set(idB, { ...createEdge(60), strength: 60 });
    relationships.set(idA, edgesA);

    // Mark BOND goal as already completed
    const scenario = {
      ...ctx.scenario!,
      goals: ctx.scenario!.goals.map(g =>
        g.id === 'BOND' ? { ...g, completed: true, completedAt: 10 } : g,
      ),
    };
    const next = decisionMomentSubscriber({ ...ctx, relationships, scenario }, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'SCENARIO_GOAL' && m.subjectId === 'BOND')).toBe(false);
  });

  it('surfaces SURVIVAL SCENARIO_GOAL when tick > 600 and ≥ 4 living', () => {
    const ctx = makeCtx({ worldTime: { tick: 650, day: 27, hour: 2 } });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'SCENARIO_GOAL' && m.subjectId === 'SURVIVAL')).toBe(true);
  });

  it('does not duplicate SCENARIO_GOAL moments for the same goalId', () => {
    const ctx = makeCtx({ worldTime: { tick: 650, day: 27, hour: 2 } });
    const existing = {
      id: 'dm-goal',
      kind: 'SCENARIO_GOAL' as const,
      tick: 650,
      situationText: 'Already pending.',
      options: [],
      expiresAt: 698,
      subjectId: 'SURVIVAL',
    };
    const ctxWithExisting = { ...ctx, pendingDecisions: [existing] };
    const next = decisionMomentSubscriber(ctxWithExisting, 1);
    expect(next.pendingDecisions.filter(m => m.kind === 'SCENARIO_GOAL' && m.subjectId === 'SURVIVAL')).toHaveLength(1);
  });
});

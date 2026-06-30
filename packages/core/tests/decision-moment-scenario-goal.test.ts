import { describe, it, expect } from 'vitest';
import { decisionMomentSubscriber } from '../src/events/DecisionMomentDetector.js';
import { createScenario1Context } from '../src/scenarios/scenario1.js';
import type { SimulationContext } from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createScenario1Context(), ...overrides };
}

describe('decisionMomentSubscriber — SCENARIO_GOAL detection', () => {
  it('surfaces SURVIVAL SCENARIO_GOAL when tick > 600 and Kara is alive', () => {
    const ctx = makeCtx({ worldTime: { tick: 650, day: 27, hour: 2 } });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'SCENARIO_GOAL' && m.subjectId === 'SURVIVAL')).toBe(true);
  });

  it('does not surface SURVIVAL SCENARIO_GOAL before tick 600', () => {
    const ctx = makeCtx({ worldTime: { tick: 580, day: 24, hour: 4 } });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'SCENARIO_GOAL' && m.subjectId === 'SURVIVAL')).toBe(false);
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

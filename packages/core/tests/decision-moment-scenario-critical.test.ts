import { describe, it, expect } from 'vitest';
import { decisionMomentSubscriber } from '../src/events/DecisionMomentDetector.js';
import { createScenario1Context } from '../src/scenarios/scenario1.js';
import type { SimulationContext } from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createScenario1Context(), ...overrides };
}

describe('decisionMomentSubscriber — SCENARIO_CRITICAL detection', () => {
  it('surfaces BANKRUPTCY SCENARIO_CRITICAL when treasury has been negative for ≥ 96 ticks', () => {
    const tick = 200;
    // treasuryNegativeSince = 100, elapsed = 100 >= 96 → within 3 days of BANKRUPTCY
    const ctx = makeCtx({
      worldTime: { tick, day: 8, hour: 8 },
      treasury: -10,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: 100 },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    const criticalMoments = next.pendingDecisions.filter(m => m.kind === 'SCENARIO_CRITICAL');
    expect(criticalMoments).toHaveLength(1);
    expect(criticalMoments[0]!.subjectId).toBe('BANKRUPTCY');
  });

  it('does NOT surface BANKRUPTCY moment when treasury has been negative for < 96 ticks', () => {
    const tick = 190;
    // treasuryNegativeSince = 100, elapsed = 90 < 96 → not yet critical
    const ctx = makeCtx({
      worldTime: { tick, day: 7, hour: 22 },
      treasury: -10,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: 100 },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'SCENARIO_CRITICAL' && m.subjectId === 'BANKRUPTCY')).toBe(false);
  });

  it('does NOT surface BANKRUPTCY when treasuryNegativeSince is null', () => {
    const ctx = makeCtx({
      treasury: 50,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: null },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'SCENARIO_CRITICAL' && m.subjectId === 'BANKRUPTCY')).toBe(false);
  });

  it('does not duplicate SCENARIO_CRITICAL moments for same subjectId', () => {
    const tick = 200;
    const existing = {
      id: 'dm-sc',
      kind: 'SCENARIO_CRITICAL' as const,
      tick,
      situationText: 'Bankruptcy looms.',
      options: [],
      expiresAt: tick + 48,
      subjectId: 'BANKRUPTCY',
    };
    const ctx = makeCtx({
      worldTime: { tick, day: 8, hour: 8 },
      treasury: -10,
      scenario: { ...createScenario1Context().scenario!, treasuryNegativeSince: 100 },
      pendingDecisions: [existing],
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.filter(m => m.kind === 'SCENARIO_CRITICAL' && m.subjectId === 'BANKRUPTCY')).toHaveLength(1);
  });

  it('does not surface SCENARIO_CRITICAL when scenario is null', () => {
    const ctx = makeCtx({ scenario: null });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'SCENARIO_CRITICAL')).toBe(false);
  });
});

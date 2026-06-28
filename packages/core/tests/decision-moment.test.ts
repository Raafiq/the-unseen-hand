import { describe, it, expect } from 'vitest';
import { decisionMomentSubscriber } from '../src/events/DecisionMomentDetector.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { DecisionMoment, SimulationContext } from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext({ seed: 1 }), ...overrides };
}

const FATE_OPTION = {
  label: 'Let fate decide',
  description: 'Take no action. DI refund may apply if outcome is unfavourable.',
  diCost: 0,
  probabilityShift: 0,
  narrativeDistanceLabel: 'LOW' as const,
};

function makeDecisionMoment(overrides: Partial<DecisionMoment> = {}): DecisionMoment {
  return {
    id: 'dm-test',
    kind: 'OTHER',
    tick: 0,
    situationText: 'Something is happening.',
    options: [FATE_OPTION],
    expiresAt: 24,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Detection helpers (surfacing moments)
// ---------------------------------------------------------------------------

describe('decisionMomentSubscriber — detection', () => {
  it('surfaces a QUEST_DROUGHT decision moment when a QUEST_DROUGHT event fired this tick', () => {
    const ctx = makeCtx({ worldTime: { tick: 10, day: 0, hour: 10 } });
    // Inject a QUEST_DROUGHT world event at the current tick
    const droughtEvent = {
      kind: 'WORLD' as const,
      subtype: 'QUEST_DROUGHT' as const,
      id: 'ev-drought',
      tick: 10,
      renderedText: 'The quest board stands empty.',
    };
    const ctxWithEvent = { ...ctx, eventLog: [droughtEvent] };
    const next = decisionMomentSubscriber(ctxWithEvent, 1);
    expect(next.pendingDecisions).toHaveLength(1);
    expect(next.pendingDecisions[0].kind).toBe('OTHER');
  });

  it('does not surface a duplicate moment for the same condition', () => {
    const ctx = makeCtx({ worldTime: { tick: 10, day: 0, hour: 10 } });
    const droughtEvent = {
      kind: 'WORLD' as const,
      subtype: 'QUEST_DROUGHT' as const,
      id: 'ev-drought',
      tick: 10,
      renderedText: 'The quest board stands empty.',
    };
    // Already have an existing OTHER moment (e.g. from previous drought)
    const existingMoment = makeDecisionMoment({ id: 'dm-existing', kind: 'OTHER', expiresAt: 34 });
    const ctxWithEvent = { ...ctx, eventLog: [droughtEvent], pendingDecisions: [existingMoment] };
    const next = decisionMomentSubscriber(ctxWithEvent, 1);
    // Should not add a second OTHER moment
    const otherMoments = next.pendingDecisions.filter(m => m.kind === 'OTHER');
    expect(otherMoments).toHaveLength(1);
  });

  it('caps active moments at 3 — lowest priority dropped', () => {
    // Start with 3 active moments (max): DEATH, RELATIONSHIP_COLLAPSE, DEPARTURE
    const ctx = makeCtx({ worldTime: { tick: 10, day: 0, hour: 10 } });
    const existing = [
      makeDecisionMoment({ id: 'dm-a', kind: 'DEATH_IMMINENT', expiresAt: 22 }),
      makeDecisionMoment({ id: 'dm-b', kind: 'RELATIONSHIP_COLLAPSE', expiresAt: 34 }),
      makeDecisionMoment({ id: 'dm-c', kind: 'DEPARTURE', expiresAt: 22 }),
    ];
    // QUEST_DROUGHT would add an 'OTHER' moment — which should be dropped since cap is 3
    const droughtEvent = {
      kind: 'WORLD' as const,
      subtype: 'QUEST_DROUGHT' as const,
      id: 'ev-drought',
      tick: 10,
      renderedText: 'The quest board stands empty.',
    };
    const ctxFull = { ...ctx, eventLog: [droughtEvent], pendingDecisions: existing };
    const next = decisionMomentSubscriber(ctxFull, 1);
    expect(next.pendingDecisions).toHaveLength(3);
    // All three high-priority ones should remain, OTHER should have been suppressed
    expect(next.pendingDecisions.map(m => m.kind)).not.toContain('OTHER');
  });
});

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

describe('decisionMomentSubscriber — expiry', () => {
  it('removes a moment whose expiresAt <= current tick', () => {
    const moment = makeDecisionMoment({ expiresAt: 5 });
    const ctx = makeCtx({
      pendingDecisions: [moment],
      worldTime: { tick: 5, day: 0, hour: 5 },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions).toHaveLength(0);
  });

  it('keeps moments that have not yet expired', () => {
    const moment = makeDecisionMoment({ expiresAt: 20 });
    const ctx = makeCtx({
      pendingDecisions: [moment],
      worldTime: { tick: 10, day: 0, hour: 10 },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions).toHaveLength(1);
  });

  it('fires OPTION_CHOSEN event when a moment expires', () => {
    const moment = makeDecisionMoment({ expiresAt: 5 });
    const ctx = makeCtx({
      pendingDecisions: [moment],
      worldTime: { tick: 5, day: 0, hour: 5 },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    const optionChosenEvents = next.eventLog.filter(
      e => e.kind === 'DIVINE' && e.subtype === 'OPTION_CHOSEN',
    );
    expect(optionChosenEvents).toHaveLength(1);
  });

  it('grants +10 DI when a DEATH_IMMINENT moment expires unresolved', () => {
    const moment = makeDecisionMoment({ kind: 'DEATH_IMMINENT', expiresAt: 5 });
    const ctx = makeCtx({
      pendingDecisions: [moment],
      divineInfluence: 30,
      worldTime: { tick: 5, day: 0, hour: 5 },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.divineInfluence).toBe(40);
  });

  it('does not grant extra DI when a non-death moment expires', () => {
    const moment = makeDecisionMoment({ kind: 'OTHER', expiresAt: 5 });
    const ctx = makeCtx({
      pendingDecisions: [moment],
      divineInfluence: 30,
      worldTime: { tick: 5, day: 0, hour: 5 },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.divineInfluence).toBe(30);
  });
});

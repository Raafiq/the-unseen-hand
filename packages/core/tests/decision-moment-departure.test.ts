import { describe, it, expect } from 'vitest';
import { decisionMomentSubscriber } from '../src/events/DecisionMomentDetector.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { Adventurer, SimulationContext } from '../src/world/types.js';

function makeAdventurer(id: string, despairStreak: number, state: Adventurer['state'] = 'IDLE'): Adventurer {
  return {
    id,
    identity: { id, name: 'Test', age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 5,
    moodFactors: [],
    state,
    history: [],
    despairStreak,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext({ seed: 1 }), ...overrides };
}

describe('decisionMomentSubscriber — DEPARTURE detection', () => {
  it('surfaces a DEPARTURE moment for an adventurer with despairStreak ≥ 3 in IDLE state', () => {
    const adv = makeAdventurer('adv-1', 4, 'IDLE');
    const ctx = makeCtx({ adventurers: new Map([['adv-1', adv]]) });
    const next = decisionMomentSubscriber(ctx, 1);
    const departureMoments = next.pendingDecisions.filter(m => m.kind === 'DEPARTURE');
    expect(departureMoments).toHaveLength(1);
    expect(departureMoments[0]!.subjectId).toBe('adv-1');
  });

  it('surfaces DEPARTURE for adventurer in RESTING state', () => {
    const adv = makeAdventurer('adv-1', 3, 'RESTING');
    const ctx = makeCtx({ adventurers: new Map([['adv-1', adv]]) });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'DEPARTURE')).toBe(true);
  });

  it('does NOT surface DEPARTURE for adventurer with despairStreak < 3', () => {
    const adv = makeAdventurer('adv-1', 2, 'IDLE');
    const ctx = makeCtx({ adventurers: new Map([['adv-1', adv]]) });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'DEPARTURE')).toBe(false);
  });

  it('does NOT surface DEPARTURE for adventurer ON_QUEST', () => {
    const adv = makeAdventurer('adv-1', 5, 'ON_QUEST');
    const ctx = makeCtx({ adventurers: new Map([['adv-1', adv]]) });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'DEPARTURE')).toBe(false);
  });

  it('does not create duplicate DEPARTURE moments for the same adventurer', () => {
    const adv = makeAdventurer('adv-1', 4, 'IDLE');
    const tick = 10;
    const ctx = makeCtx({
      adventurers: new Map([['adv-1', adv]]),
      worldTime: { tick, day: 0, hour: 10 },
      pendingDecisions: [{
        id: 'dm-existing',
        kind: 'DEPARTURE',
        tick,
        situationText: 'Already pending.',
        options: [],
        expiresAt: tick + 12,
        subjectId: 'adv-1',
      }],
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.filter(m => m.kind === 'DEPARTURE' && m.subjectId === 'adv-1')).toHaveLength(1);
  });

  it('DEPARTURE moment includes a MOOD_LIFT option with diCost 8 and subjectId set', () => {
    const adv = makeAdventurer('adv-1', 4, 'IDLE');
    const ctx = makeCtx({ adventurers: new Map([['adv-1', adv]]) });
    const next = decisionMomentSubscriber(ctx, 1);
    const dm = next.pendingDecisions.find(m => m.kind === 'DEPARTURE');
    expect(dm).toBeDefined();
    const moodLiftOption = dm!.options.find(o => o.diCost === 8);
    expect(moodLiftOption).toBeDefined();
    expect(dm!.subjectId).toBe('adv-1');
  });

  it('DEPARTURE moment expires after 12 ticks', () => {
    const adv = makeAdventurer('adv-1', 4, 'IDLE');
    const ctx = makeCtx({ adventurers: new Map([['adv-1', adv]]) });
    const created = decisionMomentSubscriber(ctx, 1);
    const dm = created.pendingDecisions.find(m => m.kind === 'DEPARTURE')!;
    expect(dm.expiresAt).toBe(12); // tick 0 + 12
  });
});

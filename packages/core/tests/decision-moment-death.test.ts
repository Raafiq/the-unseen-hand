import { describe, it, expect } from 'vitest';
import { decisionMomentSubscriber } from '../src/events/DecisionMomentDetector.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { Adventurer, Quest, SimulationContext } from '../src/world/types.js';

function makeAdventurer(id: string): Adventurer {
  return {
    id,
    identity: { id, name: 'Fighter', age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 50,
    moodFactors: [],
    state: 'ON_QUEST',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: 'q-1',
  };
}

function makeHighRiskQuest(tick: number, resolvingInTicks = 5): Quest {
  return {
    id: 'q-1',
    type: 'DUNGEON',
    name: 'Dungeon (d9)',
    difficulty: 9,
    duration: 108,
    reward: 450,
    risk: { injuryChance: 0.36, deathChance: 0.09, criticalFailChance: 0.27 },
    requiredPartySize: 3,
    expiresAt: tick + 200,
    assignedParty: ['adv-1'],
    status: 'IN_PROGRESS',
    startedAt: tick - (108 - resolvingInTicks),
  };
}

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext({ seed: 42 }), ...overrides };
}

describe('decisionMomentSubscriber — DEATH_IMMINENT detection', () => {
  it('surfaces DEATH_IMMINENT when a high-difficulty quest resolves within 12 ticks', () => {
    const tick = 100;
    const adv = makeAdventurer('adv-1');
    const quest = makeHighRiskQuest(tick, 5); // resolves in 5 ticks
    const ctx = makeCtx({
      worldTime: { tick, day: 4, hour: 4 },
      adventurers: new Map([['adv-1', adv]]),
      questBoard: {
        available: [],
        active: [quest],
      },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    const deathMoments = next.pendingDecisions.filter(m => m.kind === 'DEATH_IMMINENT');
    expect(deathMoments).toHaveLength(1);
    expect(deathMoments[0]!.subjectId).toBe('adv-1');
  });

  it('does NOT surface DEATH_IMMINENT for a low-difficulty quest (prob ≥ 0.40)', () => {
    const tick = 100;
    const adv = makeAdventurer('adv-1');
    const easyQuest: Quest = {
      id: 'q-easy',
      type: 'FETCH',
      name: 'Fetch (d2)',
      difficulty: 2,
      duration: 24,
      reward: 100,
      risk: { injuryChance: 0.08, deathChance: 0.02, criticalFailChance: 0.06 },
      requiredPartySize: 1,
      expiresAt: tick + 200,
      assignedParty: ['adv-1'],
      status: 'IN_PROGRESS',
      startedAt: tick - 20,
    };
    const ctx = makeCtx({
      worldTime: { tick, day: 4, hour: 4 },
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [], active: [easyQuest] },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'DEATH_IMMINENT')).toBe(false);
  });

  it('does NOT surface DEATH_IMMINENT for a quest resolving more than 12 ticks away', () => {
    const tick = 100;
    const adv = makeAdventurer('adv-1');
    const quest = makeHighRiskQuest(tick, 20); // resolves in 20 ticks
    const ctx = makeCtx({
      worldTime: { tick, day: 4, hour: 4 },
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [], active: [quest] },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'DEATH_IMMINENT')).toBe(false);
  });

  it('does not create duplicate DEATH_IMMINENT moments for the same party', () => {
    const tick = 100;
    const adv = makeAdventurer('adv-1');
    const quest = makeHighRiskQuest(tick, 5);
    const existing = {
      id: 'dm-existing',
      kind: 'DEATH_IMMINENT' as const,
      tick,
      situationText: 'Already pending.',
      options: [],
      expiresAt: tick + 12,
      subjectId: 'adv-1',
    };
    const ctx = makeCtx({
      worldTime: { tick, day: 4, hour: 4 },
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [], active: [quest] },
      pendingDecisions: [existing],
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.filter(m => m.kind === 'DEATH_IMMINENT')).toHaveLength(1);
  });

  it('DEATH_IMMINENT option 0 has diCost 0 and probabilityShift 0', () => {
    const tick = 100;
    const adv = makeAdventurer('adv-1');
    const quest = makeHighRiskQuest(tick, 5);
    const ctx = makeCtx({
      worldTime: { tick, day: 4, hour: 4 },
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [], active: [quest] },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    const dm = next.pendingDecisions.find(m => m.kind === 'DEATH_IMMINENT')!;
    expect(dm.options[0]!.diCost).toBe(0);
    expect(dm.options[0]!.probabilityShift).toBe(0);
  });

  it('DEATH_IMMINENT higher probability shift options have higher diCost', () => {
    const tick = 100;
    const adv = makeAdventurer('adv-1');
    const quest = makeHighRiskQuest(tick, 5);
    const ctx = makeCtx({
      worldTime: { tick, day: 4, hour: 4 },
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [], active: [quest] },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    const dm = next.pendingDecisions.find(m => m.kind === 'DEATH_IMMINENT')!;
    // Options should be ordered by ascending diCost (fate → moderate → high → extreme)
    const payCosts = dm.options.filter(o => o.diCost > 0).map(o => o.diCost);
    expect(payCosts.length).toBeGreaterThan(0);
    // Each successive paid option should cost more
    for (let i = 1; i < payCosts.length; i++) {
      expect(payCosts[i]).toBeGreaterThan(payCosts[i - 1]!);
    }
  });
});

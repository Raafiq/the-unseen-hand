import { describe, it, expect } from 'vitest';
import { decisionMomentSubscriber } from '../src/events/DecisionMomentDetector.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { Adventurer, Quest, SimulationContext } from '../src/world/types.js';

function makeIdleAdventurer(id: string): Adventurer {
  return {
    id,
    identity: { id, name: 'Fighter', age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 50,
    moodFactors: [],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

function makeHighDifficultyQuest(id = 'q-hard'): Quest {
  return {
    id,
    type: 'DUNGEON',
    name: 'Dungeon (d9)',
    difficulty: 9,
    duration: 108,
    reward: 450,
    risk: { injuryChance: 0.36, deathChance: 0.09, criticalFailChance: 0.27 },
    requiredPartySize: 1,
    expiresAt: 200,
    assignedParty: null,
    status: 'AVAILABLE',
  };
}

function makeEasyQuest(id = 'q-easy'): Quest {
  return {
    id,
    type: 'FETCH',
    name: 'Fetch (d2)',
    difficulty: 2,
    duration: 24,
    reward: 100,
    risk: { injuryChance: 0.08, deathChance: 0.02, criticalFailChance: 0.06 },
    requiredPartySize: 1,
    expiresAt: 200,
    assignedParty: null,
    status: 'AVAILABLE',
  };
}

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext({ seed: 1 }), ...overrides };
}

describe('decisionMomentSubscriber — PARTY_SELECTION detection', () => {
  it('surfaces PARTY_SELECTION when an available quest has probability < 0.30 for idle party', () => {
    const adv = makeIdleAdventurer('adv-1');
    const quest = makeHighDifficultyQuest();
    const ctx = makeCtx({
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [quest], active: [] },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    const partyMoments = next.pendingDecisions.filter(m => m.kind === 'PARTY_SELECTION');
    expect(partyMoments).toHaveLength(1);
    expect(partyMoments[0]!.subjectId).toContain('adv-1');
  });

  it('does NOT surface PARTY_SELECTION for an easy quest (prob ≥ 0.30)', () => {
    const adv = makeIdleAdventurer('adv-1');
    const quest = makeEasyQuest();
    const ctx = makeCtx({
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [quest], active: [] },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.some(m => m.kind === 'PARTY_SELECTION')).toBe(false);
  });

  it('does not create duplicate PARTY_SELECTION for the same party member', () => {
    const adv = makeIdleAdventurer('adv-1');
    const quest = makeHighDifficultyQuest('q-hard');
    const existing = {
      id: 'dm-ps',
      kind: 'PARTY_SELECTION' as const,
      tick: 0,
      situationText: 'Already pending.',
      options: [],
      expiresAt: 6,
      subjectId: 'adv-1',
      cooldownKey: 'PARTY_SELECTION:q-hard', // dedup now matches by cooldownKey
    };
    const ctx = makeCtx({
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [quest], active: [] },
      pendingDecisions: [existing],
    });
    const next = decisionMomentSubscriber(ctx, 1);
    expect(next.pendingDecisions.filter(m => m.kind === 'PARTY_SELECTION')).toHaveLength(1);
  });

  it('PARTY_SELECTION moment includes a probability-boost option', () => {
    const adv = makeIdleAdventurer('adv-1');
    const quest = makeHighDifficultyQuest();
    const ctx = makeCtx({
      adventurers: new Map([['adv-1', adv]]),
      questBoard: { available: [quest], active: [] },
    });
    const next = decisionMomentSubscriber(ctx, 1);
    const dm = next.pendingDecisions.find(m => m.kind === 'PARTY_SELECTION')!;
    const boostOption = dm.options.find(o => o.diCost > 0);
    expect(boostOption).toBeDefined();
    expect(boostOption!.probabilityShift).toBeGreaterThan(0);
  });
});

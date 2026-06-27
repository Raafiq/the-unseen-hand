import { describe, it, expect } from 'vitest';
import {
  fleeThreshold,
  shareLootChance,
  defendAllyChance,
  questVolunteerWeight,
} from '../src/adventurers/personality.js';
import type { PersonalityAxes, RelationshipEdge, Adventurer, Quest } from '../src/world/types.js';

const allMin: PersonalityAxes = { courage: 0, greed: 0, empathy: 0, loyalty: 0, ambition: 0 };
const allMax: PersonalityAxes = { courage: 100, greed: 100, empathy: 100, loyalty: 100, ambition: 100 };

function makeEdge(type: RelationshipEdge['type'], strength = 50): RelationshipEdge {
  return { strength, type, history: [] };
}

// Minimal adventurer factory for volunteer weight tests
function makeIdleAdventurer(overrides: Partial<Adventurer> = {}): Adventurer {
  return {
    id: 'a1',
    identity: { id: 'a1', name: 'Test', age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 60,
    moodFactors: [],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
    ...overrides,
  };
}

function makeQuest(type: Quest['type'], difficulty = 5): Quest {
  return {
    id: 'q1', type, name: 'Test Quest', difficulty, duration: 10,
    reward: 100, risk: { injuryChance: 0.1, deathChance: 0.05, criticalFailChance: 0.05 },
    requiredPartySize: 2, expiresAt: 9999, assignedParty: null, status: 'AVAILABLE',
  };
}

describe('fleeThreshold', () => {
  it('courage 100 returns ≤ 0.10', () => {
    expect(fleeThreshold(allMax)).toBeLessThanOrEqual(0.10);
  });

  it('courage 0 returns ≥ 0.65', () => {
    expect(fleeThreshold(allMin)).toBeGreaterThanOrEqual(0.65);
  });

  it('higher courage always yields lower or equal flee threshold than lower courage', () => {
    const axes30 = { ...allMin, courage: 30 };
    const axes70 = { ...allMin, courage: 70 };
    expect(fleeThreshold(axes70)).toBeLessThanOrEqual(fleeThreshold(axes30));
  });

  it('courage 70 returns ≤ 0.10 (spec boundary)', () => {
    expect(fleeThreshold({ ...allMin, courage: 70 })).toBeLessThanOrEqual(0.10);
  });

  it('courage 30 returns ≥ 0.65 (spec boundary)', () => {
    expect(fleeThreshold({ ...allMin, courage: 30 })).toBeGreaterThanOrEqual(0.65);
  });

  it('result is always in [0, 1]', () => {
    const v = fleeThreshold({ courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('shareLootChance', () => {
  it('high empathy + low greed returns near-max chance', () => {
    const axes = { ...allMin, empathy: 100, greed: 0 };
    expect(shareLootChance(axes)).toBeCloseTo(1.0, 1);
  });

  it('low empathy + high greed returns near-zero chance', () => {
    const axes = { ...allMin, empathy: 0, greed: 100 };
    expect(shareLootChance(axes)).toBeCloseTo(0.0, 1);
  });

  it('result is always in [0, 1]', () => {
    const v = shareLootChance(allMax);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('defendAllyChance', () => {
  it('TRUSTED_COMPANION edge > STRANGER edge with same axes', () => {
    const axes: PersonalityAxes = { courage: 50, greed: 50, empathy: 80, loyalty: 80, ambition: 50 };
    const companion = makeEdge('TRUSTED_COMPANION');
    const stranger = makeEdge('STRANGER');
    expect(defendAllyChance(axes, companion)).toBeGreaterThan(defendAllyChance(axes, stranger));
  });

  it('ENEMY edge always returns 0 regardless of axes', () => {
    expect(defendAllyChance(allMax, makeEdge('ENEMY'))).toBe(0);
    expect(defendAllyChance(allMin, makeEdge('ENEMY'))).toBe(0);
  });

  it('result is always in [0, 1]', () => {
    const v = defendAllyChance(allMax, makeEdge('TRUSTED_COMPANION'));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('FRIEND > ACQUAINTANCE for same axes', () => {
    const axes: PersonalityAxes = { courage: 50, greed: 50, empathy: 60, loyalty: 60, ambition: 50 };
    expect(defendAllyChance(axes, makeEdge('FRIEND'))).toBeGreaterThan(
      defendAllyChance(axes, makeEdge('ACQUAINTANCE'))
    );
  });
});

describe('questVolunteerWeight', () => {
  it('aligned quest returns higher weight than non-aligned for idle adventurer', () => {
    const hero = makeIdleAdventurer({
      identity: { id: 'a1', name: 'Hero', age: 25, backstory: '', personalGoal: 'HEROISM' },
    });
    const aligned = makeQuest('DUNGEON');     // HEROISM aligns with DUNGEON
    const nonAligned = makeQuest('FETCH');
    expect(questVolunteerWeight(hero, aligned)).toBeGreaterThan(questVolunteerWeight(hero, nonAligned));
  });

  it('non-IDLE adventurer returns 0 regardless of quest', () => {
    const onQuest = makeIdleAdventurer({ state: 'ON_QUEST', currentQuestId: 'q-existing' });
    expect(questVolunteerWeight(onQuest, makeQuest('DUNGEON'))).toBe(0);
  });

  it('DESPAIRING adventurer (mood < 10) returns 0 regardless of quest', () => {
    const despairing = makeIdleAdventurer({ mood: 5 });
    expect(questVolunteerWeight(despairing, makeQuest('DUNGEON'))).toBe(0);
    expect(questVolunteerWeight(despairing, makeQuest('FETCH'))).toBe(0);
  });

  it('CONTENT adventurer has higher weight than UNSATISFIED for the same quest', () => {
    const content = makeIdleAdventurer({ mood: 60 });
    const unsatisfied = makeIdleAdventurer({ mood: 15 });
    const quest = makeQuest('DUNGEON');
    expect(questVolunteerWeight(content, quest)).toBeGreaterThan(questVolunteerWeight(unsatisfied, quest));
  });

  it('hard quest (difficulty ≥ 7) gives ambition bonus', () => {
    const highAmb = makeIdleAdventurer({
      personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 100 },
    });
    const hardQuest = makeQuest('BOUNTY', 8);
    const easyQuest = makeQuest('BOUNTY', 3);
    // Same goal alignment, but hard quest has ambition bonus
    expect(questVolunteerWeight(highAmb, hardQuest)).toBeGreaterThan(
      questVolunteerWeight(highAmb, easyQuest)
    );
  });
});

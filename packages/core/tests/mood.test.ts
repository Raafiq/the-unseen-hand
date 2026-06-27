import { describe, it, expect } from 'vitest';
import {
  upsertMoodFactor,
  decayMoodFactors,
  recalculateMood,
  moodThresholdLabel,
  topMoodFactors,
  applyDayTickMood,
} from '../src/adventurers/mood.js';
import type { MoodFactor, Adventurer } from '../src/world/types.js';

function factor(id: string, value: number, decayRate = 0.1): MoodFactor {
  return { id, label: id, value, decayRate };
}

function makeAdventurer(mood: number, moodFactors: MoodFactor[], despairStreak = 0): Adventurer {
  return {
    id: 'a1',
    identity: { id: 'a1', name: 'Test', age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood,
    moodFactors,
    state: 'IDLE',
    history: [],
    despairStreak,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

describe('upsertMoodFactor', () => {
  it('adds a new factor', () => {
    const result = upsertMoodFactor([], factor('QUEST_SUCCESS', 15));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(15);
  });

  it('overwrites existing factor with same id', () => {
    const initial = [factor('QUEST_SUCCESS', 10, 0.1)];
    const result = upsertMoodFactor(initial, factor('QUEST_SUCCESS', 20, 0.15));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(20);
    expect(result[0].decayRate).toBe(0.15);
  });

  it('keeps other factors intact when upserting', () => {
    const initial = [factor('QUEST_SUCCESS', 10), factor('RESTING', 5)];
    const result = upsertMoodFactor(initial, factor('QUEST_SUCCESS', 20));
    expect(result).toHaveLength(2);
    expect(result.find(f => f.id === 'RESTING')?.value).toBe(5);
  });
});

describe('decayMoodFactors', () => {
  it('factor with decayRate 0.10 and value 20 has value ≈ 18 after one decay', () => {
    const result = decayMoodFactors([factor('F', 20, 0.10)]);
    expect(result[0].value).toBeCloseTo(18, 1);
  });

  it('factor with |value| < 1 after decay is removed', () => {
    const tiny = factor('F', 0.5, 0.1);
    const result = decayMoodFactors([tiny]);
    expect(result).toHaveLength(0);
  });

  it('factors with large values are retained after decay', () => {
    const result = decayMoodFactors([factor('F', 20, 0.1)]);
    expect(result).toHaveLength(1);
  });

  it('negative factor decays toward zero', () => {
    const neg = factor('F', -20, 0.10);
    const result = decayMoodFactors([neg]);
    expect(result[0].value).toBeCloseTo(-18, 1);
  });
});

describe('recalculateMood', () => {
  it('sums all factor values clamped to [0, 100]', () => {
    const factors = [factor('A', 40), factor('B', 30)];
    expect(recalculateMood(factors)).toBe(70);
  });

  it('clamps below 0', () => {
    const factors = [factor('A', -200, 0)];
    expect(recalculateMood(factors)).toBe(0);
  });

  it('clamps above 100', () => {
    const factors = [factor('A', 200, 0)];
    expect(recalculateMood(factors)).toBe(100);
  });

  it('empty factors returns 0', () => {
    expect(recalculateMood([])).toBe(0);
  });
});

describe('moodThresholdLabel', () => {
  it('50–100 → CONTENT', () => expect(moodThresholdLabel(75)).toBe('CONTENT'));
  it('25–49 → NEUTRAL', () => expect(moodThresholdLabel(35)).toBe('NEUTRAL'));
  it('10–24 → UNSATISFIED', () => expect(moodThresholdLabel(15)).toBe('UNSATISFIED'));
  it('0–9 → DESPAIRING', () => expect(moodThresholdLabel(5)).toBe('DESPAIRING'));
});

describe('topMoodFactors', () => {
  it('returns top N factors by absolute value', () => {
    const factors = [factor('A', 5), factor('B', -20), factor('C', 15), factor('D', 2)];
    const top3 = topMoodFactors(factors, 3);
    expect(top3.map(f => f.id)).toEqual(['B', 'C', 'A']);
  });

  it('returns fewer than N if fewer factors exist', () => {
    expect(topMoodFactors([factor('A', 5)], 3)).toHaveLength(1);
  });
});

describe('applyDayTickMood', () => {
  it('recalculation only runs on day ticks (hour === 0)', () => {
    const adv = makeAdventurer(50, [factor('F', 30, 0.1)]);
    // Non-day tick — mood and factors should be unchanged
    const unchanged = applyDayTickMood(adv, { tick: 5, day: 0, hour: 5 });
    expect(unchanged.mood).toBe(50);
    expect(unchanged.moodFactors[0].value).toBe(30);
  });

  it('runs on day tick (hour === 0), decays factors and recalculates mood', () => {
    const adv = makeAdventurer(50, [factor('F', 20, 0.1)]);
    const result = applyDayTickMood(adv, { tick: 24, day: 1, hour: 0 });
    // After decay: 20 * (1 - 0.1) = 18
    expect(result.moodFactors[0].value).toBeCloseTo(18, 1);
    expect(result.mood).toBeCloseTo(18, 0);
  });

  it('despairStreak increments when mood < 10 on day tick', () => {
    const adv = makeAdventurer(5, [], 0);
    const result = applyDayTickMood(adv, { tick: 24, day: 1, hour: 0 });
    expect(result.despairStreak).toBe(1);
  });

  it('despairStreak resets when mood ≥ 10 on day tick', () => {
    const adv = makeAdventurer(50, [factor('F', 50, 0)], 2);
    const result = applyDayTickMood(adv, { tick: 24, day: 1, hour: 0 });
    expect(result.despairStreak).toBe(0);
  });

  it('despairStreak reaches 3 after 3 consecutive despairing day ticks', () => {
    let adv = makeAdventurer(5, [], 0);
    for (let day = 1; day <= 3; day++) {
      adv = applyDayTickMood(adv, { tick: day * 24, day, hour: 0 });
    }
    expect(adv.despairStreak).toBe(3);
  });
});

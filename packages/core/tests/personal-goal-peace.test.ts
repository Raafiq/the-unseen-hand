import { describe, it, expect } from 'vitest';
import { personalGoalSubscriber } from '../src/adventurers/PersonalGoals.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { Adventurer, QuestEvent, SimulationContext } from '../src/world/types.js';

function makePeaceAdventurer(id: string): Adventurer {
  return {
    id,
    identity: { id, name: 'Selin', age: 29, backstory: 'Former healer.', personalGoal: 'PEACE' },
    personality: { courage: 30, loyalty: 60, empathy: 85, greed: 10, ambition: 30 },
    mood: 60,
    moodFactors: [],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'PEACE', milestones: [], completed: false },
    currentQuestId: null,
  };
}

function makeCtx(tick: number, eventLog: SimulationContext['eventLog'] = [], overrides: Partial<SimulationContext> = {}): SimulationContext {
  const base = createSimulationContext({ seed: 1 });
  return {
    ...base,
    worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 },
    eventLog,
    ...overrides,
  };
}

function makeQuestStartedEvent(tick: number, adventurerId: string): QuestEvent {
  return {
    id: `ev-quest-${tick}`,
    tick,
    kind: 'QUEST',
    subtype: 'STARTED',
    questId: 'q-test',
    partyIds: [adventurerId],
    renderedText: 'A quest began.',
  };
}

describe('personalGoalSubscriber — PEACE_STREAK_30 milestone', () => {
  it('fires PEACE_STREAK_30 milestone when adventurer has 30 combat-free days (720 ticks)', () => {
    const adv = makePeaceAdventurer('selin');
    // At tick 720 (day 30), no QUEST events in log → streak complete
    const ctx = makeCtx(720, [], {
      adventurers: new Map([['selin', adv]]),
      worldTime: { tick: 720, day: 30, hour: 0 },
    });
    const next = personalGoalSubscriber(ctx);
    const selinNext = next.adventurers.get('selin')!;
    expect(selinNext.personalGoalProgress.milestones.some(m => m.description === 'PEACE_STREAK_30')).toBe(true);
  });

  it('PEACE goal completes after PEACE_STREAK_30 milestone fires', () => {
    const adv = makePeaceAdventurer('selin');
    const ctx = makeCtx(720, [], {
      adventurers: new Map([['selin', adv]]),
      worldTime: { tick: 720, day: 30, hour: 0 },
    });
    const next = personalGoalSubscriber(ctx);
    const selinNext = next.adventurers.get('selin')!;
    expect(selinNext.personalGoalProgress.completed).toBe(true);
  });

  it('does NOT fire PEACE_STREAK_30 if adventurer was ON_QUEST within last 720 ticks', () => {
    const adv = makePeaceAdventurer('selin');
    // Quest started at tick 400 — within the 720-tick lookback window
    const questEvent = makeQuestStartedEvent(400, 'selin');
    const ctx = makeCtx(720, [questEvent], {
      adventurers: new Map([['selin', adv]]),
      worldTime: { tick: 720, day: 30, hour: 0 },
    });
    const next = personalGoalSubscriber(ctx);
    const selinNext = next.adventurers.get('selin')!;
    expect(selinNext.personalGoalProgress.milestones.some(m => m.description === 'PEACE_STREAK_30')).toBe(false);
  });

  it('fires PEACE_STREAK_30 when quest was > 720 ticks ago', () => {
    const adv = makePeaceAdventurer('selin');
    // Quest at tick 0, check at tick 721 → more than 720 ticks ago → streak valid
    const questEvent = makeQuestStartedEvent(0, 'selin');
    const ctx = makeCtx(721, [questEvent], {
      adventurers: new Map([['selin', adv]]),
      worldTime: { tick: 721, day: 30, hour: 1 },
    });
    const next = personalGoalSubscriber(ctx);
    const selinNext = next.adventurers.get('selin')!;
    expect(selinNext.personalGoalProgress.milestones.some(m => m.description === 'PEACE_STREAK_30')).toBe(true);
  });

  it('does not fire PEACE_STREAK_30 for non-PEACE goal adventurers', () => {
    const adv: Adventurer = {
      id: 'kara',
      identity: { id: 'kara', name: 'Kara', age: 34, backstory: '', personalGoal: 'BELONGING' },
      personality: { courage: 70, loyalty: 80, empathy: 50, greed: 20, ambition: 50 },
      mood: 60,
      moodFactors: [],
      state: 'IDLE',
      history: [],
      despairStreak: 0,
      personalGoalProgress: { goal: 'BELONGING', milestones: [], completed: false },
      currentQuestId: null,
    };
    const ctx = makeCtx(720, [], {
      adventurers: new Map([['kara', adv]]),
      worldTime: { tick: 720, day: 30, hour: 0 },
    });
    const next = personalGoalSubscriber(ctx);
    const karaNext = next.adventurers.get('kara')!;
    expect(karaNext.personalGoalProgress.milestones.some(m => m.description === 'PEACE_STREAK_30')).toBe(false);
  });

  it('does not fire PEACE_STREAK_30 twice if already in milestones', () => {
    const adv: Adventurer = {
      ...makePeaceAdventurer('selin'),
      personalGoalProgress: {
        goal: 'PEACE',
        milestones: [{ tick: 720, description: 'PEACE_STREAK_30' }],
        completed: false,
      },
    };
    const ctx = makeCtx(744, [], {
      adventurers: new Map([['selin', adv]]),
      worldTime: { tick: 744, day: 31, hour: 0 },
    });
    const next = personalGoalSubscriber(ctx);
    const selinNext = next.adventurers.get('selin')!;
    const peaceStreakMilestones = selinNext.personalGoalProgress.milestones.filter(
      m => m.description === 'PEACE_STREAK_30',
    );
    expect(peaceStreakMilestones).toHaveLength(1);
  });
});

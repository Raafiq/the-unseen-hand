import { describe, it, expect } from 'vitest';
import {
  transitionState,
  IllegalStateTransitionError,
} from '../src/adventurers/stateMachine.js';
import type { Adventurer } from '../src/world/types.js';

function makeAdventurer(state: Adventurer['state'], questId: string | null = null): Adventurer {
  return {
    id: 'a1',
    identity: { id: 'a1', name: 'Test', age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 60,
    moodFactors: [],
    state,
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: questId,
  };
}

describe('transitionState', () => {
  it('IDLE → ON_QUEST with valid questId succeeds', () => {
    const a = makeAdventurer('IDLE');
    const result = transitionState(a, 'ON_QUEST', { questId: 'q1', isDev: false });
    expect(result.state).toBe('ON_QUEST');
    expect(result.currentQuestId).toBe('q1');
  });

  it('IDLE → ON_QUEST with null questId throws in dev', () => {
    const a = makeAdventurer('IDLE');
    expect(() => transitionState(a, 'ON_QUEST', { questId: null, isDev: true }))
      .toThrow(IllegalStateTransitionError);
  });

  it('IDLE → ON_QUEST with null questId returns unchanged adventurer in prod', () => {
    const a = makeAdventurer('IDLE');
    const result = transitionState(a, 'ON_QUEST', { questId: null, isDev: false });
    expect(result.state).toBe('IDLE');
  });

  it('DEAD → IDLE is rejected in dev', () => {
    const a = makeAdventurer('DEAD');
    expect(() => transitionState(a, 'IDLE', { questId: null, isDev: true }))
      .toThrow(IllegalStateTransitionError);
  });

  it('DEAD → IDLE is rejected in prod (state unchanged)', () => {
    const a = makeAdventurer('DEAD');
    const result = transitionState(a, 'IDLE', { questId: null, isDev: false });
    expect(result.state).toBe('DEAD');
  });

  it('RETIRED → any state is rejected (terminal)', () => {
    const a = makeAdventurer('RETIRED');
    expect(() => transitionState(a, 'IDLE', { questId: null, isDev: true }))
      .toThrow(IllegalStateTransitionError);
  });

  it('IDLE → RESTING succeeds', () => {
    const a = makeAdventurer('IDLE');
    expect(transitionState(a, 'RESTING', { questId: null, isDev: false }).state).toBe('RESTING');
  });

  it('IDLE → SOCIALIZING succeeds', () => {
    const a = makeAdventurer('IDLE');
    expect(transitionState(a, 'SOCIALIZING', { questId: null, isDev: false }).state).toBe('SOCIALIZING');
  });

  it('RESTING → IDLE succeeds', () => {
    const a = makeAdventurer('RESTING');
    expect(transitionState(a, 'IDLE', { questId: null, isDev: false }).state).toBe('IDLE');
  });

  it('ON_QUEST → IN_DUNGEON with questId succeeds', () => {
    const a = makeAdventurer('ON_QUEST', 'q1');
    expect(transitionState(a, 'IN_DUNGEON', { questId: 'q1', isDev: false }).state).toBe('IN_DUNGEON');
  });

  it('ON_QUEST → DEAD succeeds', () => {
    const a = makeAdventurer('ON_QUEST', 'q1');
    expect(transitionState(a, 'DEAD', { questId: 'q1', isDev: false }).state).toBe('DEAD');
  });

  it('ON_QUEST → IDLE (quest complete) clears questId', () => {
    const a = makeAdventurer('ON_QUEST', 'q1');
    const result = transitionState(a, 'IDLE', { questId: null, isDev: false });
    expect(result.state).toBe('IDLE');
    expect(result.currentQuestId).toBeNull();
  });

  it('IDLE → ON_QUEST clears activityState (no stale home activity while away)', () => {
    const a: Adventurer = {
      ...makeAdventurer('IDLE'),
      activityState: { current: 'SLEEPING', enteredAt: 1, scheduledExitAt: 8, nextMicroEventAt: 5 },
    };
    const result = transitionState(a, 'ON_QUEST', { questId: 'q1', isDev: false });
    expect(result.activityState).toBeUndefined();
  });

  it('ON_QUEST → IN_DUNGEON clears activityState', () => {
    const a: Adventurer = {
      ...makeAdventurer('ON_QUEST', 'q1'),
      activityState: { current: 'SLEEPING', enteredAt: 1, scheduledExitAt: 8, nextMicroEventAt: 5 },
    };
    const result = transitionState(a, 'IN_DUNGEON', { questId: 'q1', isDev: false });
    expect(result.activityState).toBeUndefined();
  });

  it('IDLE → RESTING preserves a home activity (only quest departure clears it)', () => {
    const a: Adventurer = {
      ...makeAdventurer('IDLE'),
      activityState: { current: 'READING', enteredAt: 1, scheduledExitAt: 8, nextMicroEventAt: 5 },
    };
    const result = transitionState(a, 'RESTING', { questId: null, isDev: false });
    expect(result.activityState).toEqual(a.activityState);
  });
});

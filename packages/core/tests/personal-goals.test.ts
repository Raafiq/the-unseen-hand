import { describe, it, expect } from 'vitest';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import {
  checkGoalCompletion,
  applyGoalCompletion,
} from '../src/adventurers/PersonalGoals.js';
import type {
  SimulationContext,
  Adventurer,
  HistoryEvent,
  RelationshipEdge,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdventurer(
  id: string,
  goal: Adventurer['identity']['personalGoal'],
  opts: Partial<Adventurer> = {},
): Adventurer {
  return {
    id,
    identity: { id, name: id, age: 25, backstory: '', personalGoal: goal },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 50,
    moodFactors: [],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal, milestones: [], completed: false },
    currentQuestId: null,
    ...opts,
  };
}

function baseCtx(extras: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext('goals-test'), ...extras };
}

function historyEvent(kind: HistoryEvent['kind'], tick = 0): HistoryEvent {
  return { tick, kind, involvedIds: [], weight: 1 };
}

function tcEdge(): RelationshipEdge {
  return { strength: 75, type: 'TRUSTED_COMPANION', history: [] };
}

// ---------------------------------------------------------------------------
// checkGoalCompletion — HEROISM
// ---------------------------------------------------------------------------

describe('checkGoalCompletion — HEROISM', () => {
  it('returns false when fewer than 3 dungeon/rescue successes', () => {
    const adv = makeAdventurer('a1', 'HEROISM', {
      personalGoalProgress: {
        goal: 'HEROISM',
        milestones: [
          { tick: 1, description: 'DUNGEON_SUCCESS' },
          { tick: 2, description: 'DUNGEON_SUCCESS' },
        ],
        completed: false,
      },
      history: [historyEvent('NEAR_DEATH')],
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    expect(checkGoalCompletion(adv, ctx)).toBe(false);
  });

  it('returns false when 3 dungeon successes but no NEAR_DEATH in history', () => {
    const adv = makeAdventurer('a1', 'HEROISM', {
      personalGoalProgress: {
        goal: 'HEROISM',
        milestones: [
          { tick: 1, description: 'DUNGEON_SUCCESS' },
          { tick: 2, description: 'DUNGEON_SUCCESS' },
          { tick: 3, description: 'DUNGEON_SUCCESS' },
        ],
        completed: false,
      },
      history: [],
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    expect(checkGoalCompletion(adv, ctx)).toBe(false);
  });

  it('returns true when 3 dungeon successes AND NEAR_DEATH in history', () => {
    const adv = makeAdventurer('a1', 'HEROISM', {
      personalGoalProgress: {
        goal: 'HEROISM',
        milestones: [
          { tick: 1, description: 'DUNGEON_SUCCESS' },
          { tick: 2, description: 'DUNGEON_SUCCESS' },
          { tick: 3, description: 'DUNGEON_SUCCESS' },
        ],
        completed: false,
      },
      history: [historyEvent('NEAR_DEATH')],
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    expect(checkGoalCompletion(adv, ctx)).toBe(true);
  });

  it('RESCUE successes count toward HEROISM like DUNGEON successes', () => {
    const adv = makeAdventurer('a1', 'HEROISM', {
      personalGoalProgress: {
        goal: 'HEROISM',
        milestones: [
          { tick: 1, description: 'DUNGEON_SUCCESS' },
          { tick: 2, description: 'RESCUE_SUCCESS' },
          { tick: 3, description: 'RESCUE_SUCCESS' },
        ],
        completed: false,
      },
      history: [historyEvent('NEAR_DEATH')],
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    expect(checkGoalCompletion(adv, ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkGoalCompletion — WEALTH
// ---------------------------------------------------------------------------

describe('checkGoalCompletion — WEALTH', () => {
  it('returns false when cumulative gold < 500', () => {
    const adv = makeAdventurer('a1', 'WEALTH', {
      personalGoalProgress: { goal: 'WEALTH', milestones: [], completed: false },
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]), treasury: 499 });
    // Treasury is not the right measure — WEALTH is adventurer's earned gold
    // We'll track it in milestones as GOLD_EARNED events summing up to >= 500
    expect(checkGoalCompletion(adv, ctx)).toBe(false);
  });

  it('returns true when cumulative gold milestones sum to ≥ 500', () => {
    const adv = makeAdventurer('a1', 'WEALTH', {
      personalGoalProgress: {
        goal: 'WEALTH',
        milestones: [
          { tick: 1, description: 'GOLD_EARNED:300' },
          { tick: 2, description: 'GOLD_EARNED:200' },
        ],
        completed: false,
      },
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    expect(checkGoalCompletion(adv, ctx)).toBe(true);
  });

  it('returns false when gold milestones sum to < 500', () => {
    const adv = makeAdventurer('a1', 'WEALTH', {
      personalGoalProgress: {
        goal: 'WEALTH',
        milestones: [{ tick: 1, description: 'GOLD_EARNED:499' }],
        completed: false,
      },
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    expect(checkGoalCompletion(adv, ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkGoalCompletion — BELONGING
// ---------------------------------------------------------------------------

describe('checkGoalCompletion — BELONGING', () => {
  it('returns true when adventurer has 2+ TRUSTED_COMPANION edges simultaneously', () => {
    const adv = makeAdventurer('a1', 'BELONGING');
    const rels = new Map([
      ['a1', new Map([['a2', tcEdge()], ['a3', tcEdge()]])],
    ]);
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]), relationships: rels });
    expect(checkGoalCompletion(adv, ctx)).toBe(true);
  });

  it('returns false with only 1 TRUSTED_COMPANION edge', () => {
    const adv = makeAdventurer('a1', 'BELONGING');
    const rels = new Map([['a1', new Map([['a2', tcEdge()]])]]);
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]), relationships: rels });
    expect(checkGoalCompletion(adv, ctx)).toBe(false);
  });

  it('returns false with no relationships', () => {
    const adv = makeAdventurer('a1', 'BELONGING');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    expect(checkGoalCompletion(adv, ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkGoalCompletion — already completed
// ---------------------------------------------------------------------------

describe('checkGoalCompletion — already completed', () => {
  it('returns false when goal is already marked completed', () => {
    const adv = makeAdventurer('a1', 'BELONGING', {
      personalGoalProgress: { goal: 'BELONGING', milestones: [], completed: true, completedAt: 1 },
    });
    const rels = new Map([
      ['a1', new Map([['a2', tcEdge()], ['a3', tcEdge()]])],
    ]);
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]), relationships: rels });
    expect(checkGoalCompletion(adv, ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyGoalCompletion
// ---------------------------------------------------------------------------

describe('applyGoalCompletion', () => {
  it('fires PersonalGoalAchieved lifecycle event', () => {
    const adv = makeAdventurer('a1', 'HEROISM');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const ev = result.eventLog.find(
      e => e.kind === 'LIFECYCLE' && (e as any).subtype === 'GOAL_ACHIEVED',
    );
    expect(ev).toBeDefined();
    expect(ev!.renderedText).toBeTruthy();
  });

  it('marks the adventurer personalGoalProgress.completed = true', () => {
    const adv = makeAdventurer('a1', 'BELONGING');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const updated = result.adventurers.get('a1')!;
    expect(updated.personalGoalProgress.completed).toBe(true);
    expect(updated.personalGoalProgress.completedAt).toBe(ctx.worldTime.tick);
  });

  it('applies HEROISM trait shift: courage +10, ambition +5 (capped at 100)', () => {
    const adv = makeAdventurer('a1', 'HEROISM', {
      personality: { courage: 95, greed: 50, empathy: 50, loyalty: 50, ambition: 98 },
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const updated = result.adventurers.get('a1')!;
    expect(updated.personality.courage).toBe(100); // 95 + 10, capped
    expect(updated.personality.ambition).toBe(100); // 98 + 5, capped
  });

  it('applies WEALTH trait shift: greed -10 (min 0)', () => {
    const adv = makeAdventurer('a1', 'WEALTH', {
      personality: { courage: 50, greed: 5, empathy: 50, loyalty: 50, ambition: 50 },
    });
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    expect(result.adventurers.get('a1')!.personality.greed).toBe(0); // 5 - 10, clamped to 0
  });

  it('applies BELONGING trait shift: empathy +10, loyalty +5', () => {
    const adv = makeAdventurer('a1', 'BELONGING');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const updated = result.adventurers.get('a1')!;
    expect(updated.personality.empathy).toBe(60);
    expect(updated.personality.loyalty).toBe(55);
  });

  it('applies REVENGE trait shift: courage +5, empathy -10', () => {
    const adv = makeAdventurer('a1', 'REVENGE');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const updated = result.adventurers.get('a1')!;
    expect(updated.personality.courage).toBe(55);
    expect(updated.personality.empathy).toBe(40);
  });

  it('applies PEACE trait shift: empathy +15, courage -5', () => {
    const adv = makeAdventurer('a1', 'PEACE');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const updated = result.adventurers.get('a1')!;
    expect(updated.personality.empathy).toBe(65);
    expect(updated.personality.courage).toBe(45);
  });

  it('applies WANDERLUST trait shift: ambition +5, courage +5', () => {
    const adv = makeAdventurer('a1', 'WANDERLUST');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const updated = result.adventurers.get('a1')!;
    expect(updated.personality.ambition).toBe(55);
    expect(updated.personality.courage).toBe(55);
  });

  it('adds GOAL_ACHIEVED mood factor (+40, decay 0.03)', () => {
    const adv = makeAdventurer('a1', 'HEROISM');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const updated = result.adventurers.get('a1')!;
    const mf = updated.moodFactors.find(f => f.id === 'GOAL_ACHIEVED');
    expect(mf).toBeDefined();
    expect(mf!.value).toBe(40);
    expect(mf!.decayRate).toBe(0.03);
  });

  it('grants +12 DI on completion', () => {
    const adv = makeAdventurer('a1', 'HEROISM');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]), divineInfluence: 50 });
    const result = applyGoalCompletion(ctx, adv);
    expect(result.divineInfluence).toBe(62);
  });

  it('surfaces a retirement decision moment within the same tick', () => {
    const adv = makeAdventurer('a1', 'HEROISM');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]) });
    const result = applyGoalCompletion(ctx, adv);
    const dm = result.pendingDecisions.find(
      d => d.situationText.includes('achieved their deepest goal'),
    );
    expect(dm).toBeDefined();
    expect(dm!.options).toHaveLength(3); // let choose, send dream, grant peace
    expect(dm!.expiresAt).toBe(ctx.worldTime.tick + 48);
  });

  it('DI does not exceed 100', () => {
    const adv = makeAdventurer('a1', 'HEROISM');
    const ctx = baseCtx({ adventurers: new Map([['a1', adv]]), divineInfluence: 95 });
    const result = applyGoalCompletion(ctx, adv);
    expect(result.divineInfluence).toBe(100);
  });
});

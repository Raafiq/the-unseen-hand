import { describe, it, expect } from 'vitest';
import { dispatch } from '../src/divine/DivineTools.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type {
  SimulationContext,
  Adventurer,
  DecisionMoment,
  Region,
} from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext({ seed: 99 }), ...overrides };
}

function makeAdventurer(id: string, state: Adventurer['state'] = 'IDLE', history: Adventurer['history'] = []): Adventurer {
  return {
    id,
    identity: { id, name: id, age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 60,
    moodFactors: [],
    state,
    history,
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

const FATE_OPTION = {
  label: 'Let fate decide',
  description: '',
  diCost: 0,
  probabilityShift: 0,
  narrativeDistanceLabel: 'LOW' as const,
};

const INTERVENTION_OPTION = {
  label: 'Intervene',
  description: 'Shift the odds.',
  diCost: 20,
  probabilityShift: 0.15,
  narrativeDistanceLabel: 'MODERATE' as const,
};

function makeDecisionMoment(expiresAt = 100): DecisionMoment {
  return {
    id: 'dm-1',
    kind: 'OTHER',
    tick: 0,
    situationText: 'A moment of choice.',
    options: [FATE_OPTION, INTERVENTION_OPTION],
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// CHOOSE_OPTION
// ---------------------------------------------------------------------------

describe('dispatch CHOOSE_OPTION', () => {
  it('returns DECISION_NOT_FOUND when decision id is unknown', () => {
    const ctx = makeCtx({ divineInfluence: 50 });
    const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: 'dm-unknown', optionIndex: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('DECISION_NOT_FOUND');
  });

  it('returns INSUFFICIENT_DI when player cannot afford the option', () => {
    const moment = makeDecisionMoment();
    const ctx = makeCtx({ divineInfluence: 10, pendingDecisions: [moment] });
    const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: 'dm-1', optionIndex: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INSUFFICIENT_DI');
  });

  it('option 0 (fate) always costs 0 and succeeds', () => {
    const moment = makeDecisionMoment();
    const ctx = makeCtx({ divineInfluence: 0, pendingDecisions: [moment] });
    const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: 'dm-1', optionIndex: 0 });
    expect(result.ok).toBe(true);
  });

  it('deducts DI and removes the moment on success', () => {
    const moment = makeDecisionMoment();
    const ctx = makeCtx({ divineInfluence: 50, pendingDecisions: [moment] });
    const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: 'dm-1', optionIndex: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.divineInfluence).toBe(30); // 50 - 20
      expect(result.ctx.pendingDecisions).toHaveLength(0);
    }
  });

  it('fires OPTION_CHOSEN event on success', () => {
    const moment = makeDecisionMoment();
    const ctx = makeCtx({ divineInfluence: 50, pendingDecisions: [moment] });
    const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: 'dm-1', optionIndex: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const events = result.ctx.eventLog.filter(e => e.kind === 'DIVINE' && e.subtype === 'OPTION_CHOSEN');
      expect(events).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// DIVINE_TOUCH
// ---------------------------------------------------------------------------

describe('dispatch DIVINE_TOUCH', () => {
  it('returns INVALID_TARGET when targeting a DEAD adventurer', () => {
    const dead = makeAdventurer('a1', 'DEAD');
    const ctx = makeCtx({
      divineInfluence: 50,
      adventurers: new Map([['a1', dead]]),
    });
    const result = dispatch(ctx, { type: 'DIVINE_TOUCH', adventurerId: 'a1', effect: 'MOOD_LIFT', diCost: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_TARGET');
  });

  it('returns INVALID_TARGET when targeting a RETIRED adventurer', () => {
    const retired = makeAdventurer('a1', 'RETIRED');
    const ctx = makeCtx({
      divineInfluence: 50,
      adventurers: new Map([['a1', retired]]),
    });
    const result = dispatch(ctx, { type: 'DIVINE_TOUCH', adventurerId: 'a1', effect: 'MOOD_LIFT', diCost: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_TARGET');
  });

  it('returns INSUFFICIENT_DI when not enough DI', () => {
    const adv = makeAdventurer('a1');
    const ctx = makeCtx({
      divineInfluence: 3,
      adventurers: new Map([['a1', adv]]),
    });
    const result = dispatch(ctx, { type: 'DIVINE_TOUCH', adventurerId: 'a1', effect: 'MOOD_LIFT', diCost: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INSUFFICIENT_DI');
  });

  it('deducts DI before applying MOOD_LIFT', () => {
    const adv = makeAdventurer('a1');
    const ctx = makeCtx({
      divineInfluence: 20,
      adventurers: new Map([['a1', adv]]),
    });
    const result = dispatch(ctx, { type: 'DIVINE_TOUCH', adventurerId: 'a1', effect: 'MOOD_LIFT', diCost: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.divineInfluence).toBe(15);
    }
  });

  it('returns COOLDOWN_ACTIVE when LUCK_CURSE applied twice within 7 days', () => {
    const recentCurse = { kind: 'LUCK_CURSE' as const, tick: 10, involvedIds: [], weight: 0 };
    const adv = makeAdventurer('a1', 'IDLE', [recentCurse]);
    const ctx = makeCtx({
      divineInfluence: 50,
      adventurers: new Map([['a1', adv]]),
      worldTime: { tick: 20, day: 0, hour: 20 }, // within 7 days = 168 ticks
    });
    const result = dispatch(ctx, { type: 'DIVINE_TOUCH', adventurerId: 'a1', effect: 'LUCK_CURSE', diCost: 8 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('COOLDOWN_ACTIVE');
  });
});

// ---------------------------------------------------------------------------
// SEED_EVENT
// ---------------------------------------------------------------------------

describe('dispatch SEED_EVENT', () => {
  it('returns EVENT_ALREADY_ACTIVE when same event type is active in region', () => {
    const region: Region = {
      id: 'r1',
      name: 'The North',
      difficulty: 3,
      unlocked: true,
      activeWorldEvents: [{ type: 'STORM', startedAt: 0, expiresAt: 200 }],
    };
    const ctx = makeCtx({
      divineInfluence: 50,
      activeRegions: new Map([['r1', region]]),
    });
    const result = dispatch(ctx, { type: 'SEED_EVENT', regionId: 'r1', eventType: 'STORM', diCost: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('EVENT_ALREADY_ACTIVE');
  });

  it('adds a new world event to region on success', () => {
    const region: Region = {
      id: 'r1',
      name: 'The North',
      difficulty: 3,
      unlocked: true,
      activeWorldEvents: [],
    };
    const ctx = makeCtx({
      divineInfluence: 50,
      activeRegions: new Map([['r1', region]]),
    });
    const result = dispatch(ctx, { type: 'SEED_EVENT', regionId: 'r1', eventType: 'WINDFALL', diCost: 8 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const updatedRegion = result.ctx.activeRegions.get('r1');
      expect(updatedRegion?.activeWorldEvents).toHaveLength(1);
      expect(updatedRegion?.activeWorldEvents[0].type).toBe('WINDFALL');
    }
  });
});

// ---------------------------------------------------------------------------
// SHIFT_DIFFICULTY
// ---------------------------------------------------------------------------

describe('dispatch SHIFT_DIFFICULTY', () => {
  it('costs |delta| * 3 DI', () => {
    const region: Region = {
      id: 'r1', name: 'The North', difficulty: 5, unlocked: true, activeWorldEvents: [],
    };
    const ctx = makeCtx({
      divineInfluence: 50,
      activeRegions: new Map([['r1', region]]),
    });
    const result = dispatch(ctx, { type: 'SHIFT_DIFFICULTY', regionId: 'r1', delta: 2, diCost: 6 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ctx.divineInfluence).toBe(44); // 50 - 6
  });

  it('clamps region difficulty to [1, 10]', () => {
    const region: Region = {
      id: 'r1', name: 'The North', difficulty: 9, unlocked: true, activeWorldEvents: [],
    };
    const ctx = makeCtx({
      divineInfluence: 50,
      activeRegions: new Map([['r1', region]]),
    });
    const result = dispatch(ctx, { type: 'SHIFT_DIFFICULTY', regionId: 'r1', delta: 3, diCost: 9 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const updatedRegion = result.ctx.activeRegions.get('r1');
      expect(updatedRegion?.difficulty).toBe(10);
    }
  });
});

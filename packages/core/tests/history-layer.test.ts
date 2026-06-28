import { describe, it, expect } from 'vitest';
import {
  contextualModifier,
  appendHistoryEvent,
} from '../src/adventurers/HistoryLayer.js';
import type {
  PersonalityAxes,
  HistoryEvent,
  BehaviourContext,
  EnemyArchetype,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE: PersonalityAxes = {
  courage: 50,
  greed: 50,
  empathy: 50,
  loyalty: 50,
  ambition: 50,
};

function history(kind: HistoryEvent['kind'], opts: Partial<HistoryEvent> = {}): HistoryEvent {
  return { tick: 0, kind, involvedIds: [], weight: 1, ...opts };
}

function combatCtx(archetype: EnemyArchetype = 'UNDEAD', tick = 10): BehaviourContext {
  return { questType: 'DUNGEON', enemyArchetype: archetype, involvedAdventurerIds: [], tick };
}

// ---------------------------------------------------------------------------
// contextualModifier — WITNESSED_DEATH
// ---------------------------------------------------------------------------

describe('contextualModifier — WITNESSED_DEATH', () => {
  it('reduces effective courage by 20 in matching archetype context', () => {
    const hist: HistoryEvent[] = [history('WITNESSED_DEATH', { enemyArchetype: 'UNDEAD' })];
    const result = contextualModifier(BASE, hist, combatCtx('UNDEAD'));
    expect(result.courage).toBe(30); // 50 - 20
  });

  it('does not affect courage in a different archetype context', () => {
    const hist: HistoryEvent[] = [history('WITNESSED_DEATH', { enemyArchetype: 'UNDEAD' })];
    const result = contextualModifier(BASE, hist, combatCtx('BEAST'));
    expect(result.courage).toBe(50); // unchanged
  });

  it('two WITNESSED_DEATH events in same archetype stack to -40', () => {
    const hist: HistoryEvent[] = [
      history('WITNESSED_DEATH', { enemyArchetype: 'HUMAN' }),
      history('WITNESSED_DEATH', { enemyArchetype: 'HUMAN' }),
    ];
    const result = contextualModifier(BASE, hist, combatCtx('HUMAN'));
    expect(result.courage).toBe(10); // 50 - 40
  });

  it('two WITNESSED_DEATH events clamp at 0 when base courage < 40', () => {
    const lowCourage = { ...BASE, courage: 30 };
    const hist: HistoryEvent[] = [
      history('WITNESSED_DEATH', { enemyArchetype: 'BEAST' }),
      history('WITNESSED_DEATH', { enemyArchetype: 'BEAST' }),
    ];
    const result = contextualModifier(lowCourage, hist, combatCtx('BEAST'));
    expect(result.courage).toBe(0); // 30 - 40 = -10, clamped to 0
  });
});

// ---------------------------------------------------------------------------
// contextualModifier — NEAR_DEATH
// ---------------------------------------------------------------------------

describe('contextualModifier — NEAR_DEATH', () => {
  it('+15 effective courage within 14 days (tick 5 after event at tick 0)', () => {
    const hist: HistoryEvent[] = [history('NEAR_DEATH', { tick: 0 })];
    const ctx: BehaviourContext = { tick: 5, questType: 'DUNGEON' };
    const result = contextualModifier(BASE, hist, ctx);
    expect(result.courage).toBe(65); // 50 + 15
  });

  it('-10 effective courage after 30 days (tick 721 after event at tick 0)', () => {
    const hist: HistoryEvent[] = [history('NEAR_DEATH', { tick: 0 })];
    const ctx: BehaviourContext = { tick: 721, questType: 'DUNGEON' };
    const result = contextualModifier(BASE, hist, ctx);
    expect(result.courage).toBe(40); // 50 - 10
  });

  it('no modifier between 14 and 30 days (tick 337 — between 336 and 720)', () => {
    const hist: HistoryEvent[] = [history('NEAR_DEATH', { tick: 0 })];
    const ctx: BehaviourContext = { tick: 337, questType: 'DUNGEON' };
    const result = contextualModifier(BASE, hist, ctx);
    expect(result.courage).toBe(50); // unchanged in window between effects
  });
});

// ---------------------------------------------------------------------------
// contextualModifier — FIRST_KILL
// ---------------------------------------------------------------------------

describe('contextualModifier — FIRST_KILL', () => {
  it('+10 effective courage in all combat contexts after FIRST_KILL', () => {
    const hist: HistoryEvent[] = [history('FIRST_KILL')];
    const ctx: BehaviourContext = { tick: 100, questType: 'BOUNTY' };
    const result = contextualModifier(BASE, hist, ctx);
    expect(result.courage).toBe(60); // 50 + 10
  });
});

// ---------------------------------------------------------------------------
// contextualModifier — SAVED_BY
// ---------------------------------------------------------------------------

describe('contextualModifier — SAVED_BY', () => {
  it('+15 loyalty toward the saver (in involvedAdventurerIds)', () => {
    const hist: HistoryEvent[] = [history('SAVED_BY', { involvedIds: ['saver1'] })];
    const ctx: BehaviourContext = { tick: 10, involvedAdventurerIds: ['saver1'] };
    const result = contextualModifier(BASE, hist, ctx);
    expect(result.loyalty).toBe(65); // 50 + 15
  });

  it('+10 empathy in rescue scenarios (questType RESCUE)', () => {
    const hist: HistoryEvent[] = [history('SAVED_BY', { involvedIds: ['saver1'] })];
    const ctx: BehaviourContext = { tick: 10, questType: 'RESCUE' };
    const result = contextualModifier(BASE, hist, ctx);
    expect(result.empathy).toBe(60); // 50 + 10
  });

  it('no loyalty modifier when saver is not in involvedAdventurerIds', () => {
    const hist: HistoryEvent[] = [history('SAVED_BY', { involvedIds: ['saver1'] })];
    const ctx: BehaviourContext = { tick: 10, involvedAdventurerIds: ['someone-else'] };
    const result = contextualModifier(BASE, hist, ctx);
    expect(result.loyalty).toBe(50); // unchanged
  });
});

// ---------------------------------------------------------------------------
// contextualModifier — purity
// ---------------------------------------------------------------------------

describe('contextualModifier — purity', () => {
  it('same inputs produce same output (pure function)', () => {
    const hist: HistoryEvent[] = [history('FIRST_KILL'), history('NEAR_DEATH', { tick: 0 })];
    const ctx: BehaviourContext = { tick: 5 };
    const r1 = contextualModifier(BASE, hist, ctx);
    const r2 = contextualModifier(BASE, hist, ctx);
    expect(r1).toEqual(r2);
  });

  it('does not mutate the input axes object', () => {
    const axes: PersonalityAxes = { ...BASE };
    const hist: HistoryEvent[] = [history('FIRST_KILL')];
    contextualModifier(axes, hist, { tick: 1 });
    expect(axes.courage).toBe(50); // unchanged
  });

  it('does not mutate the history array', () => {
    const hist: HistoryEvent[] = [history('FIRST_KILL')];
    const originalLength = hist.length;
    contextualModifier(BASE, hist, { tick: 1 });
    expect(hist.length).toBe(originalLength);
  });
});

// ---------------------------------------------------------------------------
// appendHistoryEvent — max 50 events, prune oldest
// ---------------------------------------------------------------------------

describe('appendHistoryEvent', () => {
  it('appends an event to history', () => {
    const history: HistoryEvent[] = [];
    const result = appendHistoryEvent(history, { tick: 1, kind: 'FIRST_KILL', involvedIds: [], weight: 1 });
    expect(result).toHaveLength(1);
  });

  it('prunes oldest event when exceeding 50', () => {
    const existing: HistoryEvent[] = Array.from({ length: 50 }, (_, i) => ({
      tick: i,
      kind: 'FIRST_KILL' as const,
      involvedIds: [],
      weight: 1,
    }));
    const newest: HistoryEvent = { tick: 100, kind: 'NEAR_DEATH', involvedIds: [], weight: 1 };
    const result = appendHistoryEvent(existing, newest);
    expect(result).toHaveLength(50);
    expect(result[result.length - 1]).toBe(newest);
    expect(result[0].tick).toBe(1); // oldest (tick 0) pruned
  });

  it('does not mutate the original history array', () => {
    const original: HistoryEvent[] = [{ tick: 1, kind: 'FIRST_KILL', involvedIds: [], weight: 1 }];
    appendHistoryEvent(original, { tick: 2, kind: 'NEAR_DEATH', involvedIds: [], weight: 1 });
    expect(original).toHaveLength(1);
  });
});

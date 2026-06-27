import { describe, it, expect } from 'vitest';
import {
  strengthToType,
  createEdge,
  applyStrengthShift,
  detectThresholdEvents,
  applyDayTickDecay,
} from '../src/relationships/graph.js';
import type { RelationshipGraph } from '../src/world/types.js';

describe('strengthToType', () => {
  it('strength 71 → TRUSTED_COMPANION', () => expect(strengthToType(71)).toBe('TRUSTED_COMPANION'));
  it('strength 70 → TRUSTED_COMPANION (boundary)', () => expect(strengthToType(70)).toBe('TRUSTED_COMPANION'));
  it('strength 69 → FRIEND', () => expect(strengthToType(69)).toBe('FRIEND'));
  it('strength 40 → FRIEND', () => expect(strengthToType(40)).toBe('FRIEND'));
  it('strength 39 → ACQUAINTANCE', () => expect(strengthToType(39)).toBe('ACQUAINTANCE'));
  it('strength 11 → ACQUAINTANCE', () => expect(strengthToType(11)).toBe('ACQUAINTANCE'));
  it('strength 10 → STRANGER', () => expect(strengthToType(10)).toBe('STRANGER'));
  it('strength -10 → STRANGER', () => expect(strengthToType(-10)).toBe('STRANGER'));
  it('strength -11 → RIVAL', () => expect(strengthToType(-11)).toBe('RIVAL'));
  it('strength -50 → RIVAL', () => expect(strengthToType(-50)).toBe('RIVAL'));
  it('strength -51 → ENEMY', () => expect(strengthToType(-51)).toBe('ENEMY'));
  it('strength -100 → ENEMY', () => expect(strengthToType(-100)).toBe('ENEMY'));
});

describe('applyStrengthShift', () => {
  it('graph[A][B].strength === graph[B][A].strength after update', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', createEdge(0)]])],
      ['B', new Map([['A', createEdge(0)]])],
    ]);
    const result = applyStrengthShift(graph, 'A', 'B', +8);
    expect(result.get('A')!.get('B')!.strength).toBe(result.get('B')!.get('A')!.strength);
  });

  it('clamps strength to [-100, +100]', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', createEdge(95)]])],
      ['B', new Map([['A', createEdge(95)]])],
    ]);
    const result = applyStrengthShift(graph, 'A', 'B', +20);
    expect(result.get('A')!.get('B')!.strength).toBe(100);
  });

  it('type is derived from new strength after shift', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', createEdge(65)]])],
      ['B', new Map([['A', createEdge(65)]])],
    ]);
    // +8 → 73 → TRUSTED_COMPANION
    const result = applyStrengthShift(graph, 'A', 'B', +8);
    expect(result.get('A')!.get('B')!.type).toBe('TRUSTED_COMPANION');
  });
});

describe('detectThresholdEvents', () => {
  it('crossing from ACQUAINTANCE to FRIEND fires FRIENDSHIP_FORMED', () => {
    const events = detectThresholdEvents('A', 'B', 38, 41);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('FRIENDSHIP_FORMED');
  });

  it('crossing into TRUSTED_COMPANION fires TRUSTED_COMPANION_BOND_FORMED', () => {
    const events = detectThresholdEvents('A', 'B', 50, 71);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('TRUSTED_COMPANION_BOND_FORMED');
  });

  it('no event when staying in same type', () => {
    const events = detectThresholdEvents('A', 'B', 41, 50);
    expect(events).toHaveLength(0);
  });

  it('FRIEND to RIVAL fires BOND_BROKEN', () => {
    const events = detectThresholdEvents('A', 'B', 40, -12);
    expect(events.some(e => e.type === 'BOND_BROKEN')).toBe(true);
  });

  it('RIVAL to ENEMY fires RIVALRY_DEEPENED', () => {
    const events = detectThresholdEvents('A', 'B', -20, -55);
    expect(events.some(e => e.type === 'RIVALRY_DEEPENED')).toBe(true);
  });

  it('ENEMY to STRANGER fires RECONCILIATION', () => {
    const events = detectThresholdEvents('A', 'B', -60, 0);
    expect(events.some(e => e.type === 'RECONCILIATION')).toBe(true);
  });

  it('TRUSTED_COMPANION to ENEMY fires BOND_BROKEN but NOT RIVALRY_DEEPENED', () => {
    const events = detectThresholdEvents('A', 'B', 75, -55);
    expect(events.some(e => e.type === 'BOND_BROKEN')).toBe(true);
    expect(events.some(e => e.type === 'RIVALRY_DEEPENED')).toBe(false);
  });

  it('FRIEND to ENEMY fires BOND_BROKEN but NOT RIVALRY_DEEPENED', () => {
    const events = detectThresholdEvents('A', 'B', 50, -55);
    expect(events.some(e => e.type === 'BOND_BROKEN')).toBe(true);
    expect(events.some(e => e.type === 'RIVALRY_DEEPENED')).toBe(false);
  });

  it('ACQUAINTANCE → FRIEND fires exactly one FRIENDSHIP_FORMED event', () => {
    const events = detectThresholdEvents('A', 'B', 38, 42);
    const friendships = events.filter(e => e.type === 'FRIENDSHIP_FORMED');
    expect(friendships).toHaveLength(1);
  });
});

describe('applyDayTickDecay', () => {
  it('FRIEND edge decays -1/day after 14-day inactivity window; 28 days total = 14 reduction', () => {
    // Spec: decay fires when no shared activity in PAST 14 days.
    // Days 1-14: last activity (tick 0) is still within the 14-day window → no decay.
    // Days 15-28: last activity is outside the window → -1/day.
    // After 28 days: 50 - 14 = 36.
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', { strength: 50, type: 'FRIEND', history: [] }]])],
      ['B', new Map([['A', { strength: 50, type: 'FRIEND', history: [] }]])],
    ]);
    let g = graph;
    for (let day = 1; day <= 28; day++) {
      g = applyDayTickDecay(g, { 'A-B': 0 }, day * 24);
    }
    expect(g.get('A')!.get('B')!.strength).toBe(36); // 50 - 14
  });

  it('does not decay edges at STRANGER strength (prevents friends-through-distance)', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', { strength: 5, type: 'STRANGER', history: [] }]])],
      ['B', new Map([['A', { strength: 5, type: 'STRANGER', history: [] }]])],
    ]);
    const result = applyDayTickDecay(graph, { 'A-B': 0 }, 24 * 20);
    expect(result.get('A')!.get('B')!.strength).toBe(5);
  });

  it('dead adventurer edge does not decay after death', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', { strength: 50, type: 'FRIEND', history: [] }]])],
      ['B', new Map([['A', { strength: 50, type: 'FRIEND', history: [] }]])],
    ]);
    const adventurers = new Map([
      ['A', { state: 'DEAD' }],
      ['B', { state: 'IDLE' }],
    ]);
    let g = graph;
    for (let day = 1; day <= 28; day++) {
      g = applyDayTickDecay(g, {}, day * 24, adventurers);
    }
    expect(g.get('A')!.get('B')!.strength).toBe(50);
  });

  it('applyStrengthShift records history entry when tick and kind are provided', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', createEdge(0)]])],
      ['B', new Map([['A', createEdge(0)]])],
    ]);
    const result = applyStrengthShift(graph, 'A', 'B', +10, 48, 'QUEST_SHARED');
    expect(result.get('A')!.get('B')!.history).toHaveLength(1);
    expect(result.get('A')!.get('B')!.history[0]).toEqual({ tick: 48, kind: 'QUEST_SHARED', delta: 10 });
  });

  it('applyStrengthShift does not append history when tick/kind are omitted', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', createEdge(0)]])],
      ['B', new Map([['A', createEdge(0)]])],
    ]);
    const result = applyStrengthShift(graph, 'A', 'B', +10);
    expect(result.get('A')!.get('B')!.history).toHaveLength(0);
  });

  it('symmetry is maintained after decay', () => {
    const graph: RelationshipGraph = new Map([
      ['A', new Map([['B', { strength: 50, type: 'FRIEND', history: [] }]])],
      ['B', new Map([['A', { strength: 50, type: 'FRIEND', history: [] }]])],
    ]);
    const result = applyDayTickDecay(graph, { 'A-B': 0 }, 24 * 20);
    expect(result.get('A')!.get('B')!.strength).toBe(result.get('B')!.get('A')!.strength);
  });
});

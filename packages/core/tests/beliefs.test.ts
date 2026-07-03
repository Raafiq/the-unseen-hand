import { describe, it, expect } from 'vitest';
import { deriveBeliefs } from '../src/thoughts/beliefs.js';
import { strengthToType } from '../src/relationships/graph.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type {
  Adventurer,
  HistoryEvent,
  RelationshipGraph,
  SimulationContext,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAdventurer(id: string, history: HistoryEvent[] = []): Adventurer {
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'A wanderer.', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0 },
    mood: 60,
    moodFactors: [],
    state: 'IDLE',
    history,
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

function makeCtx(adventurers: Adventurer[], tick = 1000): SimulationContext {
  const base = createSimulationContext('beliefs-seed');
  return {
    ...base,
    adventurers: new Map(adventurers.map(a => [a.id, a])),
    worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 },
  };
}

/** Build a symmetric edge a↔b at `strength`, optionally with one history entry.
 *  (applyStrengthShift no-ops on missing edges, so tests seed edges directly.) */
function withEdge(
  ctx: SimulationContext,
  a: string,
  b: string,
  strength: number,
  entry?: { tick: number; kind: string },
): SimulationContext {
  const history = entry ? [{ tick: entry.tick, kind: entry.kind, delta: strength }] : [];
  const edge = { strength, type: strengthToType(strength), history };
  const graph: RelationshipGraph = new Map(ctx.relationships);
  graph.set(a, new Map(graph.get(a) ?? []).set(b, { ...edge, history: [...history] }));
  graph.set(b, new Map(graph.get(b) ?? []).set(a, { ...edge, history: [...history] }));
  return { ...ctx, relationships: graph };
}

// ---------------------------------------------------------------------------
// Kind table
// ---------------------------------------------------------------------------

describe('deriveBeliefs — kind table', () => {
  it('derives TRUSTS at strength >= 40', () => {
    const ctx = withEdge(makeCtx([makeAdventurer('a'), makeAdventurer('b')]), 'a', 'b', 45);
    const beliefs = deriveBeliefs(ctx, 'a');
    expect(beliefs.some(x => x.kind === 'TRUSTS' && x.aboutId === 'b')).toBe(true);
  });

  it('derives DISTRUSTS at strength <= -25 and FEARS at <= -50 (not both)', () => {
    const distrust = withEdge(makeCtx([makeAdventurer('a'), makeAdventurer('b')]), 'a', 'b', -30);
    expect(deriveBeliefs(distrust, 'a').map(x => x.kind)).toContain('DISTRUSTS');
    expect(deriveBeliefs(distrust, 'a').map(x => x.kind)).not.toContain('FEARS');

    const fear = withEdge(makeCtx([makeAdventurer('a'), makeAdventurer('b')]), 'a', 'b', -60);
    expect(deriveBeliefs(fear, 'a').map(x => x.kind)).toContain('FEARS');
    expect(deriveBeliefs(fear, 'a').map(x => x.kind)).not.toContain('DISTRUSTS');
  });

  it('derives DISTRUSTS from BETRAYED_BY history even on a positive edge', () => {
    const betrayed = makeAdventurer('a', [
      { tick: 900, kind: 'BETRAYED_BY', involvedIds: ['b'], weight: 5 },
    ]);
    const ctx = withEdge(makeCtx([betrayed, makeAdventurer('b')]), 'a', 'b', 20);
    const beliefs = deriveBeliefs(ctx, 'a');
    expect(beliefs.some(x => x.kind === 'DISTRUSTS' && x.aboutId === 'b' && x.sourceTick === 900)).toBe(true);
  });

  it('derives RESENTS from a recent ARGUMENT and expires it outside the 14-day window', () => {
    const recent = withEdge(
      makeCtx([makeAdventurer('a'), makeAdventurer('b')], 1000),
      'a', 'b', -5,
      { tick: 990, kind: 'ARGUMENT' },
    );
    expect(deriveBeliefs(recent, 'a').map(x => x.kind)).toContain('RESENTS');

    const stale = withEdge(
      makeCtx([makeAdventurer('a'), makeAdventurer('b')], 990 + 14 * 24 + 1),
      'a', 'b', -5,
      { tick: 990, kind: 'ARGUMENT' },
    );
    expect(deriveBeliefs(stale, 'a').map(x => x.kind)).not.toContain('RESENTS');
  });

  it('derives ADMIRES from a recent BREAKTHROUGH only at strength >= 25', () => {
    const strong = withEdge(
      makeCtx([makeAdventurer('a'), makeAdventurer('b')], 1000),
      'a', 'b', 30,
      { tick: 995, kind: 'BREAKTHROUGH' },
    );
    expect(deriveBeliefs(strong, 'a').map(x => x.kind)).toContain('ADMIRES');

    const weak = withEdge(
      makeCtx([makeAdventurer('a'), makeAdventurer('b')], 1000),
      'a', 'b', 10,
      { tick: 995, kind: 'BREAKTHROUGH' },
    );
    expect(deriveBeliefs(weak, 'a').map(x => x.kind)).not.toContain('ADMIRES');
  });

  it('derives OWES from SAVED_BY within 30 days and drops it after', () => {
    const saved = makeAdventurer('a', [
      { tick: 800, kind: 'SAVED_BY', involvedIds: ['b'], weight: 8 },
    ]);
    const recent = withEdge(makeCtx([saved, makeAdventurer('b')], 1000), 'a', 'b', 10);
    expect(deriveBeliefs(recent, 'a').map(x => x.kind)).toContain('OWES');

    const later = withEdge(makeCtx([saved, makeAdventurer('b')], 800 + 30 * 24 + 1), 'a', 'b', 10);
    expect(deriveBeliefs(later, 'a').map(x => x.kind)).not.toContain('OWES');
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe('deriveBeliefs — purity', () => {
  it('is pure: identical inputs give identical output', () => {
    const ctx = withEdge(makeCtx([makeAdventurer('a'), makeAdventurer('b')]), 'a', 'b', 55);
    expect(deriveBeliefs(ctx, 'a')).toEqual(deriveBeliefs(ctx, 'a'));
  });

  it('does not consume ctx.rng', () => {
    const ctxA = withEdge(makeCtx([makeAdventurer('a'), makeAdventurer('b')]), 'a', 'b', 55);
    const ctxB = withEdge(makeCtx([makeAdventurer('a'), makeAdventurer('b')]), 'a', 'b', 55);
    for (let i = 0; i < 50; i++) deriveBeliefs(ctxA, 'a');
    expect(ctxA.rng.next()).toBe(ctxB.rng.next());
  });

  it('never reads ctx.eventLog', () => {
    const ctx = withEdge(makeCtx([makeAdventurer('a'), makeAdventurer('b')]), 'a', 'b', 55);
    const poisoned = {
      ...ctx,
      eventLog: new Proxy([], {
        get() {
          throw new Error('deriveBeliefs must not read ctx.eventLog');
        },
      }) as SimulationContext['eventLog'],
    };
    expect(() => deriveBeliefs(poisoned, 'a')).not.toThrow();
  });

  it('returns [] for an actor with no edges', () => {
    expect(deriveBeliefs(makeCtx([makeAdventurer('a')]), 'a')).toEqual([]);
  });
});

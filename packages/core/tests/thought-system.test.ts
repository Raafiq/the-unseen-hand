import { describe, it, expect } from 'vitest';
import { renderThought, THOUGHT_POOLS } from '../src/thoughts/thoughtGrammar.js';
import { strengthToType } from '../src/relationships/graph.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { makeNpcId } from '../src/world/actors.js';
import type {
  Adventurer,
  HistoryEvent,
  MoodFactor,
  NotableNpc,
  SimulationContext,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAdventurer(
  id: string,
  opts: Partial<{
    mood: number;
    stubborn: number;
    moodFactors: MoodFactor[];
    history: HistoryEvent[];
    state: Adventurer['state'];
  }> = {},
): Adventurer {
  const { mood = 60, stubborn = 0, moodFactors = [], history = [], state = 'IDLE' } = opts;
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'A wanderer.', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn },
    mood,
    moodFactors,
    state,
    history,
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

function makeCtx(adventurers: Adventurer[], tick = 100, seed = 'thought-seed'): SimulationContext {
  const base = createSimulationContext(seed);
  return {
    ...base,
    adventurers: new Map(adventurers.map(a => [a.id, a])),
    worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 },
  };
}

const atTick = (ctx: SimulationContext, tick: number): SimulationContext => ({
  ...ctx,
  worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 },
});

/** Seed a symmetric edge directly (applyStrengthShift no-ops on missing edges). */
function withEdge(
  ctx: SimulationContext,
  a: string,
  b: string,
  strength: number,
  entry?: { tick: number; kind: string; delta: number },
): SimulationContext {
  const history = entry ? [entry] : [];
  const graph = new Map(ctx.relationships);
  graph.set(a, new Map(graph.get(a) ?? []).set(b, { strength, type: strengthToType(strength), history: [...history] }));
  graph.set(b, new Map(graph.get(b) ?? []).set(a, { strength, type: strengthToType(strength), history: [...history] }));
  return { ...ctx, relationships: graph };
}

// ---------------------------------------------------------------------------
// Purity — the panel is a window, not a hand
// ---------------------------------------------------------------------------

describe('renderThought — rng purity', () => {
  it('does not consume ctx.rng (twin-context probe)', () => {
    const ctxA = makeCtx([makeAdventurer('kara')]);
    const ctxB = makeCtx([makeAdventurer('kara')]);
    for (let i = 0; i < 100; i++) renderThought(ctxA, 'kara');
    expect(ctxA.rng.next()).toBe(ctxB.rng.next());
  });

  it('is stable: same (ctx, actorId) → identical text on every call', () => {
    const ctx = makeCtx([makeAdventurer('kara')]);
    const first = renderThought(ctx, 'kara');
    for (let i = 0; i < 20; i++) {
      expect(renderThought(ctx, 'kara')).toEqual(first);
    }
  });

  it('gives different actors independent streams at the same tick', () => {
    const ctx = makeCtx([makeAdventurer('kara'), makeAdventurer('bren')]);
    const a = renderThought(ctx, 'kara')!;
    const b = renderThought(ctx, 'bren')!;
    expect(a.text).not.toBe(b.text.replace(/bren/g, 'kara'));
  });

  it('varies across ticks for the same actor (statistical)', () => {
    const ctx = makeCtx([makeAdventurer('kara')]);
    const texts = new Set<string>();
    for (let t = 0; t < 50; t++) {
      texts.add(renderThought(atTick(ctx, t), 'kara')!.text);
    }
    expect(texts.size).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// Rendering rules
// ---------------------------------------------------------------------------

describe('renderThought — rendering rules', () => {
  it('never leaves an unfilled {slot} across a 200-render sweep', () => {
    const kara = makeAdventurer('kara', {
      history: [{ tick: 90, kind: 'NEAR_DEATH', involvedIds: ['kara'], weight: 8 }],
      moodFactors: [{ id: 'QUEST_SUCCESS', label: 'Quest success', value: 15, decayRate: 1 }],
    });
    let ctx = makeCtx([kara, makeAdventurer('bren')]);
    ctx = withEdge(ctx, 'kara', 'bren', 45, { tick: 95, kind: 'CO_QUEST_SUCCESS', delta: 8 });
    for (let t = 0; t < 200; t++) {
      const thought = renderThought(atTick(ctx, t), 'kara')!;
      expect(thought.text).not.toMatch(/\{[a-z]+\}/i);
      expect(thought.text.length).toBeGreaterThan(0);
    }
  });

  it('stance follows the mood band', () => {
    const despairing = makeCtx([makeAdventurer('kara', { mood: 5 })]);
    const content = makeCtx([makeAdventurer('kara', { mood: 80 })]);
    // Band-locked: every DESPAIRING:* fragment differs from every CONTENT:* fragment,
    // so the same tick must produce different stances.
    expect(renderThought(despairing, 'kara')!.text).not.toBe(renderThought(content, 'kara')!.text);
  });

  it('stubborn >= 70 can select the defiant register', () => {
    const ctx = makeCtx([makeAdventurer('kara', { stubborn: 80 })]);
    const defiantFragments = THOUGHT_POOLS['INFLECTION:DEFIANT'].map(f =>
      f.replaceAll('{self}', 'kara'),
    );
    let hits = 0;
    for (let t = 0; t < 60; t++) {
      const text = renderThought(atTick(ctx, t), 'kara')!.text;
      if (defiantFragments.some(f => text.includes(f))) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('hook reflects a recent relationship delta (WARMED phrasing appears)', () => {
    let ctx = makeCtx([makeAdventurer('kara'), makeAdventurer('bren')], 100);
    ctx = withEdge(ctx, 'kara', 'bren', 8, { tick: 99, kind: 'CO_QUEST_SUCCESS', delta: 8 });
    const warmed = THOUGHT_POOLS['HOOK:WARMED'].map(f =>
      f.replaceAll('{self}', 'kara').replaceAll('{other}', 'bren'),
    );
    let hits = 0;
    for (let t = 100; t < 148; t++) {
      const text = renderThought(atTick(ctx, t), 'kara')!.text;
      if (warmed.some(f => text.includes(f))) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('suppressSubjects steers away from a subjectKey when alternatives exist', () => {
    const kara = makeAdventurer('kara', {
      history: [{ tick: 95, kind: 'NEAR_DEATH', involvedIds: ['kara'], weight: 10 }],
    });
    const ctx = makeCtx([kara]);
    // Find a tick where the memory is chosen, then suppress it at that tick.
    for (let t = 0; t < 100; t++) {
      const chosen = renderThought(atTick(ctx, t), 'kara')!;
      if (chosen.subjectKey.startsWith('MEMORY:')) {
        const suppressed = renderThought(atTick(ctx, t), 'kara', {
          suppressSubjects: [chosen.subjectKey],
        })!;
        expect(suppressed.subjectKey).not.toBe(chosen.subjectKey);
        return;
      }
    }
    throw new Error('memory subject never selected in 100 ticks — fixture too weak');
  });

  it('renders no thought for DEAD, RETIRED, or unknown actors', () => {
    const ctx = makeCtx([
      makeAdventurer('dead', { state: 'DEAD' }),
      makeAdventurer('gone', { state: 'RETIRED' }),
    ]);
    expect(renderThought(ctx, 'dead')).toBeUndefined();
    expect(renderThought(ctx, 'gone')).toBeUndefined();
    expect(renderThought(ctx, 'nobody')).toBeUndefined();
  });

  it('renders a thought for a notable NPC', () => {
    const npcId = makeNpcId('brenna-blacksmith');
    const npc: NotableNpc = {
      id: npcId,
      name: 'Brenna',
      role: 'BLACKSMITH',
      traits: { stubborn: 75 },
      bio: 'The town blacksmith.',
      mood: 55,
      moodFactors: [],
      history: [],
      want: { id: 'WANT_CRAFT_HONOURED', text: 'to see her blades come home carried, not sold' },
    };
    const base = makeCtx([]);
    const ctx = { ...base, notableNpcs: new Map([[npcId, npc]]) };
    const thought = renderThought(ctx, npcId);
    expect(thought).toBeDefined();
    expect(thought!.text).toContain('Brenna');
    expect(thought!.text).not.toMatch(/\{[a-z]+\}/i);
  });
});

// ---------------------------------------------------------------------------
// Pool coverage — narrative-voice quality bar
// ---------------------------------------------------------------------------

describe('THOUGHT_POOLS — coverage', () => {
  it('every pool key has >= 3 variants', () => {
    for (const [key, pool] of Object.entries(THOUGHT_POOLS)) {
      expect(pool.length, `pool ${key}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('covers every mood band × tint, belief kind, memory kind, goal, register, and hook direction', () => {
    const keys = Object.keys(THOUGHT_POOLS);
    for (const band of ['CONTENT', 'NEUTRAL', 'UNSATISFIED', 'DESPAIRING']) {
      for (const tint of ['UP', 'DOWN', 'FLAT']) {
        expect(keys).toContain(`STANCE:${band}:${tint}`);
      }
    }
    for (const kind of ['TRUSTS', 'DISTRUSTS', 'ADMIRES', 'RESENTS', 'OWES', 'FEARS']) {
      expect(keys).toContain(`SUBJECT:BELIEF:${kind}`);
    }
    for (const kind of [
      'WITNESSED_DEATH', 'BETRAYED_BY', 'SAVED_BY', 'FIRST_KILL', 'NEAR_DEATH',
      'QUEST_TRIUMPH', 'GOAL_ACHIEVED', 'LUCK_CURSE', 'MARK_FOR_DEATH', 'SEND_DREAM',
    ]) {
      expect(keys).toContain(`SUBJECT:MEMORY:${kind}`);
    }
    for (const goal of ['HEROISM', 'WEALTH', 'BELONGING', 'REVENGE', 'WANDERLUST', 'PEACE']) {
      expect(keys).toContain(`SUBJECT:GOALGAP:${goal}`);
    }
    expect(keys).toContain('SUBJECT:WANT');
    expect(keys).toContain('SUBJECT:MUSING');
    for (const reg of ['DEFIANT', 'WISTFUL', 'ACQUISITIVE', 'FEARFUL', 'HUNGRY']) {
      expect(keys).toContain(`INFLECTION:${reg}`);
    }
    expect(keys).toContain('HOOK:WARMED');
    expect(keys).toContain('HOOK:COOLED');
  });
});

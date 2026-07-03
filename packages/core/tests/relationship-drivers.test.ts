import { describe, it, expect } from 'vitest';
import { detectPerilPairs, applyPerilResponse, townDriverSubscriber } from '../src/relationships/drivers.js';
import { socialPressureSubscriber } from '../src/events/socialResolver.js';
import { deriveBeliefs } from '../src/thoughts/beliefs.js';
import { strengthToType, createEdge } from '../src/relationships/graph.js';
import { questResolutionSubscriber } from '../src/quests/questSystem.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type {
  Adventurer,
  BeatAction,
  CombatBeat,
  HistoryEvent,
  NotableNpc,
  Quest,
  RelationshipGraph,
  SimulationContext,
} from '../src/world/types.js';

const beat = (actorId: string, action: BeatAction): CombatBeat => ({
  tick: 0,
  actorId,
  action,
  outcome: '',
});

// ---------------------------------------------------------------------------
// Fixtures (mirroring beliefs.test.ts)
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

function makeCtx(adventurers: Adventurer[], tick = 1000, seed = 'drivers-seed'): SimulationContext {
  const base = createSimulationContext(seed);
  return {
    ...base,
    adventurers: new Map(adventurers.map(a => [a.id, a])),
    worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 },
  };
}

function withEdge(ctx: SimulationContext, a: string, b: string, strength: number): SimulationContext {
  const edge = { strength, type: strengthToType(strength), history: [] as never[] };
  const graph: RelationshipGraph = new Map(ctx.relationships);
  graph.set(a, new Map(graph.get(a) ?? []).set(b, { ...edge, history: [] }));
  graph.set(b, new Map(graph.get(b) ?? []).set(a, { ...edge, history: [] }));
  return { ...ctx, relationships: graph };
}

function edgeStrength(ctx: SimulationContext, a: string, b: string): number {
  return ctx.relationships.get(a)!.get(b)!.strength;
}

const pk = (a: string, b: string) => [a, b].sort().join('-');

describe('peril-response detection (detectPerilPairs)', () => {
  it('flags a BETRAYAL pair when a survivor HESITATEd while an ally was at NEAR_DEATH', () => {
    const beats = [beat('victim', 'NEAR_DEATH'), beat('coward', 'HESITATE')];
    const { betrayal, sharedDanger } = detectPerilPairs(beats, ['victim', 'coward']);
    expect(betrayal).toContainEqual(['victim', 'coward']);
    expect(sharedDanger).toHaveLength(0);
  });

  it('flags a SHARED_DANGER pair when a survivor DEFEND_ALLYd while an ally was at NEAR_DEATH', () => {
    const beats = [beat('victim', 'NEAR_DEATH'), beat('hero', 'DEFEND_ALLY')];
    const { betrayal, sharedDanger } = detectPerilPairs(beats, ['victim', 'hero']);
    expect(sharedDanger).toContainEqual(['victim', 'hero']);
    expect(betrayal).toHaveLength(0);
  });

  it('fires nothing when no ally hit NEAR_DEATH (no peril moment)', () => {
    const beats = [beat('a', 'DEFEND_ALLY'), beat('b', 'HESITATE')];
    const { betrayal, sharedDanger } = detectPerilPairs(beats, ['a', 'b']);
    expect(betrayal).toHaveLength(0);
    expect(sharedDanger).toHaveLength(0);
  });

  it('does not brand a defender as a betrayer even if they also have a HESITATE beat', () => {
    // A member who both defended and hesitated reads as a defender (the save dominates).
    const beats = [beat('victim', 'NEAR_DEATH'), beat('hero', 'DEFEND_ALLY'), beat('hero', 'HESITATE')];
    const { betrayal, sharedDanger } = detectPerilPairs(beats, ['victim', 'hero']);
    expect(sharedDanger).toContainEqual(['victim', 'hero']);
    expect(betrayal).toHaveLength(0);
  });

  it('never pairs a near-death victim with themselves', () => {
    const beats = [beat('victim', 'NEAR_DEATH'), beat('victim', 'HESITATE')];
    const { betrayal, sharedDanger } = detectPerilPairs(beats, ['victim']);
    expect(betrayal).toHaveLength(0);
    expect(sharedDanger).toHaveLength(0);
  });

  it('excludes a fallen (non-surviving) party member from being a victim', () => {
    // The near-death actor died; peril bonds/betrayals only form among survivors.
    const beats = [beat('victim', 'NEAR_DEATH'), beat('coward', 'HESITATE')];
    const { betrayal } = detectPerilPairs(beats, ['coward']); // victim not in survivors
    expect(betrayal).toHaveLength(0);
  });
});

describe('peril-response application (applyPerilResponse)', () => {
  it('BETRAYAL drops the bond, writes BETRAYED_BY on the victim, flags a crisis, and emits a RELATIONSHIP line', () => {
    let ctx = withEdge(makeCtx([makeAdventurer('v'), makeAdventurer('c')]), 'v', 'c', 30);
    const beats = [beat('v', 'NEAR_DEATH'), beat('c', 'HESITATE')];

    const next = applyPerilResponse(ctx, ['v', 'c'], beats);

    // Symmetric bond drop (spec: BETRAYAL −18).
    expect(edgeStrength(next, 'v', 'c')).toBe(12);
    expect(edgeStrength(next, 'c', 'v')).toBe(12);

    // The abandoned victim carries the BETRAYED_BY memory naming the betrayer.
    const vHist = next.adventurers.get('v')!.history;
    expect(vHist.some(h => h.kind === 'BETRAYED_BY' && h.involvedIds.includes('c'))).toBe(true);
    // The betrayer carries no such memory (asymmetry lives in the per-actor token).
    expect(next.adventurers.get('c')!.history.some(h => h.kind === 'BETRAYED_BY')).toBe(false);

    // Belief derivation still fires DISTRUSTS off the token (unchanged consumer).
    expect(deriveBeliefs(next, 'v').some(x => x.kind === 'DISTRUSTS' && x.aboutId === 'c')).toBe(true);

    // Crisis flag carried into the social system.
    expect(next.pendingCrises.has(pk('v', 'c'))).toBe(true);

    // Exactly one RELATIONSHIP:BETRAYAL feed line naming both actors.
    const rel = next.eventLog.filter(e => e.kind === 'RELATIONSHIP');
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({ kind: 'RELATIONSHIP', subtype: 'BETRAYAL' });
    expect((rel[0] as { participantIds: string[] }).participantIds).toEqual(expect.arrayContaining(['v', 'c']));
  });

  it('SHARED_DANGER warms the bond additively and emits a RELATIONSHIP line; the saved side (SAVED_BY) warms more via OWES', () => {
    // questSystem writes SAVED_BY on the saved victim at the same resolution; seed it here.
    const victim = makeAdventurer('v', [{ tick: 1000, kind: 'SAVED_BY', involvedIds: ['h'], weight: 1 }]);
    let ctx = withEdge(makeCtx([victim, makeAdventurer('h')]), 'v', 'h', 20);
    const beats = [beat('v', 'NEAR_DEATH'), beat('h', 'DEFEND_ALLY')];

    const next = applyPerilResponse(ctx, ['v', 'h'], beats);

    // Additive to whatever the co-quest shift already applied (spec: SHARED_DANGER +12).
    expect(edgeStrength(next, 'v', 'h')).toBe(32);

    const rel = next.eventLog.filter(e => e.kind === 'RELATIONSHIP');
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({ kind: 'RELATIONSHIP', subtype: 'SHARED_DANGER' });

    // Belief-mediated asymmetry: the saved side owes the defender; the defender does not owe back.
    expect(deriveBeliefs(next, 'v').some(x => x.kind === 'OWES' && x.aboutId === 'h')).toBe(true);
    expect(deriveBeliefs(next, 'h').some(x => x.kind === 'OWES' && x.aboutId === 'v')).toBe(false);

    // A shared-danger bond is not a crisis.
    expect(next.pendingCrises.size).toBe(0);
  });

  it('records the driver in edge history with a drift-legible kind', () => {
    const ctx = withEdge(makeCtx([makeAdventurer('v'), makeAdventurer('c')]), 'v', 'c', 30);
    const next = applyPerilResponse(ctx, ['v', 'c'], [beat('v', 'NEAR_DEATH'), beat('c', 'HESITATE')]);
    const hist = next.relationships.get('v')!.get('c')!.history;
    expect(hist.at(-1)).toMatchObject({ kind: 'BETRAYAL', delta: -18 });
  });

  it('a boundary-crossing driver emits BOTH its RELATIONSHIP line and the LIFECYCLE threshold event', () => {
    // SHARED_DANGER +12 from 32 (ACQUAINTANCE) → 44 (FRIEND) crosses the friendship boundary.
    const ctx = withEdge(makeCtx([makeAdventurer('v'), makeAdventurer('h')]), 'v', 'h', 32);
    const next = applyPerilResponse(ctx, ['v', 'h'], [beat('v', 'NEAR_DEATH'), beat('h', 'DEFEND_ALLY')]);
    expect(edgeStrength(next, 'v', 'h')).toBe(44);
    expect(next.eventLog.filter(e => e.kind === 'RELATIONSHIP' && e.subtype === 'SHARED_DANGER')).toHaveLength(1);
    expect(next.eventLog.filter(e => e.kind === 'LIFECYCLE' && e.subtype === 'FRIENDSHIP_FORMED')).toHaveLength(1);
  });

  it('never fires on an edge with an NPC endpoint', () => {
    // Peril response is adventurer-only; an NPC id endpoint is a no-op (belt-and-braces).
    const ctx = withEdge(makeCtx([makeAdventurer('v')]), 'v', 'npc:smith', 30);
    const next = applyPerilResponse(ctx, ['v', 'npc:smith'], [beat('v', 'NEAR_DEATH'), beat('npc:smith', 'HESITATE')]);
    expect(edgeStrength(next, 'v', 'npc:smith')).toBe(30);
    expect(next.eventLog.filter(e => e.kind === 'RELATIONSHIP')).toHaveLength(0);
  });
});

describe('town-life driver probabilities (pure)', () => {
  const axes = (o: Partial<Record<'courage'|'greed'|'empathy'|'loyalty'|'ambition'|'stubborn', number>>) => ({
    courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0, ...o,
  });

  it('generosity rises with empathy/loyalty and falls with greed', async () => {
    const { generosity } = await import('../src/relationships/drivers.js');
    expect(generosity(axes({ empathy: 90, loyalty: 90, greed: 10 })))
      .toBeGreaterThan(generosity(axes({ empathy: 55, loyalty: 20, greed: 80 })));
  });

  it('kindness initiative is 0 below the empathy/loyalty gate and higher for the more generous of two eligible actors', async () => {
    const { kindnessInitiativeProb } = await import('../src/relationships/drivers.js');
    expect(kindnessInitiativeProb(axes({ empathy: 40, loyalty: 40 }))).toBe(0); // ungated
    const generous = kindnessInitiativeProb(axes({ empathy: 90, loyalty: 90, greed: 5 }));
    const stingy = kindnessInitiativeProb(axes({ empathy: 55, loyalty: 20, greed: 90 }));
    expect(generous).toBeGreaterThan(stingy);
    expect(stingy).toBeGreaterThan(0); // still eligible (empathy ≥ 55)
  });

  it('rivalry spark is likelier for two high-ambition low-empathy rivals than a lopsided pair (probability shift, not outcome)', async () => {
    const { rivalrySparkProb } = await import('../src/relationships/drivers.js');
    const bothDriven = rivalrySparkProb(axes({ ambition: 85, empathy: 15 }), axes({ ambition: 80, empathy: 20 }), true);
    const lopsided = rivalrySparkProb(axes({ ambition: 85, empathy: 15 }), axes({ ambition: 30, empathy: 60 }), true);
    expect(bothDriven).toBeGreaterThan(lopsided);
    expect(lopsided).toBe(0); // an indifferent partner never sparks
    // No shared goal → no spark even between two ambitious actors.
    expect(rivalrySparkProb(axes({ ambition: 85, empathy: 15 }), axes({ ambition: 80, empathy: 20 }), false)).toBe(0);
  });

  it('divine influence is indirect: a shifted mood-strain input raises the trigger probability, never forces the act', async () => {
    const { rivalrySparkProb } = await import('../src/relationships/drivers.js');
    const calm = rivalrySparkProb(axes({ ambition: 85, empathy: 15 }), axes({ ambition: 80, empathy: 20 }), true, 0);
    const strained = rivalrySparkProb(axes({ ambition: 85, empathy: 15 }), axes({ ambition: 80, empathy: 20 }), true, 0.5);
    // A divine MOOD_LIFT/COURAGE_BLESS moves the input (mood strain); the probability follows.
    expect(strained).toBeGreaterThan(calm);
    // There is no exported hook that fires a driver directly — influence stays on the inputs.
    const drivers = await import('../src/relationships/drivers.js');
    expect(Object.keys(drivers)).not.toContain('forceDriver');
  });
});

describe('drift indicator derivation (computeEdgeDrift)', () => {
  const hist = (entries: Array<{ tick: number; kind: string; delta: number }>) => ({
    strength: 0, type: strengthToType(0), history: entries,
  });

  it('reads warming above +TREND_EPS with the most-recent cause label', async () => {
    const { computeEdgeDrift } = await import('../src/relationships/drift.js');
    const edge = hist([{ tick: 900, kind: 'CO_QUEST_SUCCESS', delta: 8 }, { tick: 950, kind: 'KINDNESS', delta: 7 }]);
    const d = computeEdgeDrift(edge, 1000);
    expect(d.direction).toBe('warming');
    expect(d.cause).toBe('an act of kindness');
  });

  it('reads cooling below −TREND_EPS', async () => {
    const { computeEdgeDrift } = await import('../src/relationships/drift.js');
    const edge = hist([{ tick: 960, kind: 'BETRAYAL', delta: -18 }]);
    const d = computeEdgeDrift(edge, 1000);
    expect(d.direction).toBe('cooling');
    expect(d.cause).toBe('a betrayal');
  });

  it('shows no glyph (steady) when the net drift is within ±TREND_EPS', async () => {
    const { computeEdgeDrift } = await import('../src/relationships/drift.js');
    const edge = hist([{ tick: 950, kind: 'SEPARATION_DECAY', delta: -1 }]); // a single stray ±1
    expect(computeEdgeDrift(edge, 1000).direction).toBe('steady');
  });

  it('is steady with no recent history in the 7-day window', async () => {
    const { computeEdgeDrift } = await import('../src/relationships/drift.js');
    const edge = hist([{ tick: 100, kind: 'KINDNESS', delta: 7 }]); // 900 ticks ago, outside window
    const d = computeEdgeDrift(edge, 1000);
    expect(d.direction).toBe('steady');
    expect(d.cause).toBeNull();
  });

  it('never surfaces a raw token as the cause label', async () => {
    const { computeEdgeDrift } = await import('../src/relationships/drift.js');
    for (const kind of ['SEPARATION_DECAY', 'CO_QUEST_SUCCESS', 'BANTER', 'ARGUMENT', 'SHARED_DANGER', 'RIVALRY_SPARK']) {
      const edge = hist([{ tick: 960, kind, delta: 9 }]);
      const cause = computeEdgeDrift(edge, 1000).cause;
      expect(cause, kind).not.toMatch(/[A-Z_]{3,}/); // no SCREAMING_SNAKE token leaked
      expect(cause, kind).toBeTruthy();
    }
  });
});

describe('town-life driver subscriber (townDriverSubscriber)', () => {
  const genAxes = { courage: 60, greed: 5, empathy: 90, loyalty: 90, ambition: 40, stubborn: 0 };

  function makeNpc(id: string): NotableNpc {
    return {
      id, name: id.replace('npc:', ''), role: 'INNKEEPER',
      traits: { empathy: 50, loyalty: 50 }, bio: 'A fixture of the town.',
      mood: 60, moodFactors: [], history: [],
      want: { id: 'w', text: 'a quiet life' },
    };
  }

  /** Seed-search: run the subscriber under seeds until a driver of `subtype` fires; return that ctx. */
  function fireDriver(
    build: (seed: string) => SimulationContext,
    subtype: string,
    limit = 200,
  ): SimulationContext | undefined {
    for (let i = 0; i < limit; i++) {
      const out = townDriverSubscriber(build(`town-${subtype}-${i}`));
      if (out.eventLog.some(e => e.kind === 'RELATIONSHIP' && (e as { subtype: string }).subtype === subtype)) return out;
    }
    return undefined;
  }

  it('KINDNESS warms the bond, gives the recipient a larger mood lift than the giver, and sets a cooldown', () => {
    const build = (seed: string): SimulationContext => {
      const giver: Adventurer = { ...makeAdventurer('g'), personality: genAxes };
      const recv: Adventurer = { ...makeAdventurer('r') };
      return withEdge(makeCtx([giver, recv], 100, seed), 'g', 'r', 20); // ACQUAINTANCE
    };
    const out = fireDriver(build, 'KINDNESS');
    expect(out, 'no KINDNESS fired in 200 seeds').toBeDefined();

    // Symmetric warm (spec: KINDNESS +7).
    expect(edgeStrength(out!, 'g', 'r')).toBe(27);

    // Asymmetry lives in mood: receiving warms more than giving.
    const recvFactor = out!.adventurers.get('r')!.moodFactors.find(f => f.id === 'KINDNESS_RECEIVED');
    const giveFactor = out!.adventurers.get('g')!.moodFactors.find(f => f.id === 'KINDNESS_GIVEN');
    expect(recvFactor!.value).toBeGreaterThan(giveFactor!.value);

    // Per-pair cooldown written (once/day discipline).
    expect((out!.decisionCooldowns.get('DRIVER:g-r') ?? 0)).toBeGreaterThan(100);
  });

  it('KINDNESS never targets an ENEMY edge', () => {
    const build = (seed: string): SimulationContext => {
      const giver: Adventurer = { ...makeAdventurer('g'), personality: genAxes };
      return withEdge(makeCtx([giver, makeAdventurer('r')], 100, seed), 'g', 'r', -60); // ENEMY
    };
    // No KINDNESS should ever fire on an enemy edge.
    expect(fireDriver(build, 'KINDNESS', 120)).toBeUndefined();
  });

  it('KINDNESS can involve a notable NPC as recipient', () => {
    const build = (seed: string): SimulationContext => {
      const giver: Adventurer = { ...makeAdventurer('g'), personality: genAxes };
      const base = makeCtx([giver], 100, seed);
      const ctx: SimulationContext = { ...base, notableNpcs: new Map([['npc:inn', makeNpc('npc:inn')]]) };
      return withEdge(ctx, 'g', 'npc:inn', 25);
    };
    const out = fireDriver(build, 'KINDNESS');
    expect(out).toBeDefined();
    const rel = out!.eventLog.find(e => e.kind === 'RELATIONSHIP' && (e as { subtype: string }).subtype === 'KINDNESS')!;
    expect((rel as { participantIds: string[] }).participantIds).toContain('npc:inn');
  });

  it('RIVALRY_SPARK cools the bond between two ambitious, low-empathy, same-goal actors', () => {
    const rivalAxes = { courage: 60, greed: 60, empathy: 15, loyalty: 30, ambition: 85, stubborn: 0 };
    const build = (seed: string): SimulationContext => {
      // Same personalGoal (HEROISM) → shared goal.
      const a: Adventurer = { ...makeAdventurer('x'), personality: rivalAxes };
      const b: Adventurer = { ...makeAdventurer('y'), personality: { ...rivalAxes, ambition: 80 } };
      return withEdge(makeCtx([a, b], 100, seed), 'x', 'y', 5); // STRANGER
    };
    const out = fireDriver(build, 'RIVALRY_SPARK');
    expect(out, 'no RIVALRY_SPARK fired in 200 seeds').toBeDefined();
    expect(edgeStrength(out!, 'x', 'y')).toBe(5 + -10); // RIVALRY_DELTA
  });

  it('feed volume: even a maximally-social roster stays punctuation, not noise (per-day bound), and fires deterministically', () => {
    const roster: Adventurer[] = [
      { ...makeAdventurer('a'), personality: { courage: 50, greed: 10, empathy: 85, loyalty: 80, ambition: 50, stubborn: 0 } },
      { ...makeAdventurer('b'), personality: { courage: 50, greed: 15, empathy: 80, loyalty: 75, ambition: 50, stubborn: 0 } },
      { ...makeAdventurer('c'), personality: { courage: 60, greed: 60, empathy: 15, loyalty: 20, ambition: 85, stubborn: 0 } },
      { ...makeAdventurer('d'), personality: { courage: 60, greed: 60, empathy: 18, loyalty: 25, ambition: 82, stubborn: 0 } },
      { ...makeAdventurer('e'), personality: { courage: 50, greed: 40, empathy: 60, loyalty: 65, ambition: 50, stubborn: 0 } },
    ];
    // c & d share the default HEROISM goal (makeAdventurer) → a rivalry pair; a & b are givers.
    const run = (seed: string): number => {
      let ctx: SimulationContext = { ...createSimulationContext(seed), adventurers: new Map(roster.map(a => [a.id, a])) };
      const graph: RelationshipGraph = new Map();
      const ids = roster.map(r => r.id);
      for (const x of ids) for (const y of ids) if (x !== y) graph.set(x, (graph.get(x) ?? new Map()).set(y, createEdge(25)));
      ctx = { ...ctx, relationships: graph };
      for (let t = 0; t < 720; t++) {
        ctx = { ...ctx, worldTime: { tick: t, day: Math.floor(t / 24), hour: t % 24 } };
        ctx = townDriverSubscriber(ctx);
      }
      return ctx.eventLog.filter(e => e.kind === 'RELATIONSHIP').length;
    };
    const total = run('vol-fixed');
    expect(total).toBeGreaterThan(0);            // drivers do fire in aggregate
    expect(total / 30).toBeLessThan(8);          // per-day stays punctuation, not a flood
    expect(run('vol-fixed')).toBe(total);        // deterministic under a fixed seed
  });

  it('does not re-fire a driver for the same pair while the cooldown is live', () => {
    // Build a ctx already flagged with a live cooldown; the subscriber must skip the pair.
    const giver: Adventurer = { ...makeAdventurer('g'), personality: genAxes };
    const ctx0 = withEdge(makeCtx([giver, makeAdventurer('r')], 100), 'g', 'r', 20);
    const ctx: SimulationContext = { ...ctx0, decisionCooldowns: new Map([['DRIVER:g-r', 120]]) };
    // Even across many rng advances, no driver fires while tick(100) < cooldown(120).
    let fired = false;
    let c = ctx;
    for (let i = 0; i < 200; i++) {
      c = { ...c, rng: makeCtx([]).rng }; // fresh rng each iter to vary rolls
      const out = townDriverSubscriber({ ...c, worldTime: { tick: 100, day: 4, hour: 4 } });
      if (out.eventLog.some(e => e.kind === 'RELATIONSHIP')) { fired = true; break; }
    }
    expect(fired).toBe(false);
  });
});

describe('peril-response wiring (through questResolutionSubscriber)', () => {
  // A hard, multi-member quest that resolves this tick. High difficulty → likely failure →
  // NEAR_DEATH plus losing-fight HESITATE/DEFEND_ALLY beats among survivors → a peril moment.
  function dueQuestCtx(seed: string): SimulationContext {
    const base = createSimulationContext(seed);
    const ids = ['h', 'c', 'm']; // hero (loyal defender), coward (hesitator), mid
    const advs: Adventurer[] = [
      { ...makeAdventurer('h'), personality: { courage: 80, greed: 30, empathy: 80, loyalty: 90, ambition: 40, stubborn: 0 }, state: 'ON_QUEST', currentQuestId: 'q1' },
      { ...makeAdventurer('c'), personality: { courage: 15, greed: 60, empathy: 20, loyalty: 20, ambition: 50, stubborn: 0 }, state: 'ON_QUEST', currentQuestId: 'q1' },
      { ...makeAdventurer('m'), personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0 }, state: 'ON_QUEST', currentQuestId: 'q1' },
    ];
    // Seed acquaintance edges among the party so drivers have a bond to move.
    const graph: RelationshipGraph = new Map();
    for (const a of ids) for (const b of ids) if (a !== b) {
      graph.set(a, (graph.get(a) ?? new Map()).set(b, createEdge(20)));
    }
    const quest: Quest = {
      id: 'q1', type: 'DUNGEON', name: 'Deadly Delve', difficulty: 9,
      duration: 48, reward: 100,
      risk: { injuryChance: 0.1, deathChance: 0.02, criticalFailChance: 0.1 },
      requiredPartySize: 3, expiresAt: 9999,
      assignedParty: ids, status: 'IN_PROGRESS', startedAt: 0,
    };
    return {
      ...base,
      worldTime: { tick: 48, day: 2, hour: 0 },
      adventurers: new Map(advs.map(a => [a.id, a])),
      relationships: graph,
      questBoard: { available: [], active: [quest] },
    };
  }

  it('emits a RELATIONSHIP driver line end-to-end for at least one seed, reproducibly', () => {
    let hitSeed: string | undefined;
    for (let i = 0; i < 100 && !hitSeed; i++) {
      const out = questResolutionSubscriber(dueQuestCtx(`peril-${i}`));
      if (out.eventLog.some(e => e.kind === 'RELATIONSHIP')) hitSeed = `peril-${i}`;
    }
    expect(hitSeed, 'no seed in [0,100) produced a peril driver').toBeDefined();

    // Deterministic replay: the same seed reproduces the same RELATIONSHIP lines byte-for-byte.
    const a = questResolutionSubscriber(dueQuestCtx(hitSeed!)).eventLog.filter(e => e.kind === 'RELATIONSHIP');
    const b = questResolutionSubscriber(dueQuestCtx(hitSeed!)).eventLog.filter(e => e.kind === 'RELATIONSHIP');
    expect(a.map(e => e.renderedText)).toEqual(b.map(e => e.renderedText));
    expect(a.length).toBeGreaterThan(0);
    for (const e of a) expect(['SHARED_DANGER', 'BETRAYAL']).toContain((e as { subtype: string }).subtype);
  });
});

// ---------------------------------------------------------------------------
// Crisis-flag consumption (socialPressureSubscriber reads pendingCrises)
// ---------------------------------------------------------------------------

describe('crisis-flag consumption (socialPressureSubscriber)', () => {
  // Two adventurers locked past ENEMY_FLOOR (−51) with a very-high mood gap: NEGATIVE valence
  // (strength < −10) + veryHighGap (moodGap > 50). Under a crisis flag, resolveOutcome's escalate()
  // short-circuits on `crisis` → a deterministic ESTRANGEMENT; without one, the enemy gate blocks
  // all accumulation so the pair can never fire.
  function enemyPairCtx(): SimulationContext {
    const e1 = { ...makeAdventurer('e1'), mood: 80 };
    const e2 = { ...makeAdventurer('e2'), mood: 10 };
    return withEdge(makeCtx([e1, e2], 500), 'e1', 'e2', -60);
  }

  it('forces an escalation encounter for a flagged enemy pair (bypassing the enemy gate) and clears the flag', () => {
    const ctx = { ...enemyPairCtx(), pendingCrises: new Set([pk('e1', 'e2')]) };

    const next = socialPressureSubscriber(ctx);

    // The flag is consumed exactly once.
    expect(next.pendingCrises.has(pk('e1', 'e2'))).toBe(false);
    // A forced escalation fired despite the pair being enemies — crisis bypasses the threshold,
    // so the deterministic outcome is ESTRANGEMENT.
    const social = next.eventLog.filter(e => e.kind === 'SOCIAL');
    expect(social).toHaveLength(1);
    expect(social[0]).toMatchObject({ kind: 'SOCIAL', subtype: 'ESTRANGEMENT' });
    // The bond dropped further (ESTRANGEMENT −22) and an approach-lock cooldown was set.
    expect(edgeStrength(next, 'e1', 'e2')).toBeLessThan(-60);
    expect(next.socialCooldowns.get(pk('e1', 'e2')) ?? 0).toBeGreaterThan(ctx.worldTime.tick);
  });

  it('without a crisis flag, the same enemy pair never fires (enemy gate holds)', () => {
    const ctx = enemyPairCtx(); // pendingCrises empty

    const next = socialPressureSubscriber(ctx);

    expect(next.eventLog.filter(e => e.kind === 'SOCIAL')).toHaveLength(0);
    expect(edgeStrength(next, 'e1', 'e2')).toBe(-60);
    expect(next.socialPressure.get(pk('e1', 'e2')) ?? 0).toBe(0); // no accumulation
  });

  it('keeps the flag when a participant is asleep (nightly pause), consuming it on a later awake tick', () => {
    const asleep = {
      ...makeAdventurer('e2'),
      mood: 10,
      activityState: { current: 'SLEEPING' as const, enteredAt: 490, scheduledExitAt: 520, nextMicroEventAt: 505 },
    };
    const base = withEdge(makeCtx([{ ...makeAdventurer('e1'), mood: 80 }, asleep], 500), 'e1', 'e2', -60);
    const ctx = { ...base, pendingCrises: new Set([pk('e1', 'e2')]) };

    const next = socialPressureSubscriber(ctx);

    // Frozen: no encounter, flag retained for a later tick.
    expect(next.eventLog.filter(e => e.kind === 'SOCIAL')).toHaveLength(0);
    expect(next.pendingCrises.has(pk('e1', 'e2'))).toBe(true);
  });
});

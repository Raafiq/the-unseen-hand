/**
 * P12b — Tier-A NPC interiority (npc-system.md#interiority-earned-event-driven).
 *
 * NPC mood factors are written by resolveEncounter (the authoritative encounter
 * write site) and decayed by moodSubscriber on day ticks; bonded-witness history
 * is written at the death/departure sites via witnessLossForBondedNpcs.
 */
import { describe, it, expect } from 'vitest';
import { resolveEncounter } from '../src/events/socialResolver.js';
import { moodSubscriber } from '../src/adventurers/mood.js';
import { witnessLossForBondedNpcs, appendHistoryEvent } from '../src/adventurers/HistoryLayer.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { SimulationLoop } from '../src/world/SimulationLoop.js';
import { createEdge } from '../src/relationships/graph.js';
import { makeNpcId } from '../src/world/actors.js';
import type {
  Adventurer,
  HistoryEvent,
  NotableNpc,
  Quest,
  RelationshipGraph,
  SimulationContext,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAdv(id: string, state: Adventurer['state'] = 'IDLE'): Adventurer {
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'A wanderer.', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0 },
    mood: 50, moodFactors: [], state, history: [], despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

function makeNpc(slug: string, mood = 50): NotableNpc {
  return {
    id: makeNpcId(slug),
    name: `NPC-${slug}`,
    role: 'BLACKSMITH',
    traits: { empathy: 60, courage: 50 },
    bio: 'A townsperson.',
    mood,
    moodFactors: [{ id: 'BASELINE', label: 'Steady trade', value: mood, decayRate: 0 }],
    history: [],
    want: { id: 'WANT_TEST', text: 'a quieter town' },
  };
}

function edgeGraph(edges: Array<[string, string, number]>): RelationshipGraph {
  const g: RelationshipGraph = new Map();
  for (const [a, b, s] of edges) {
    g.set(a, new Map(g.get(a) ?? []).set(b, createEdge(s)));
    g.set(b, new Map(g.get(b) ?? []).set(a, createEdge(s)));
  }
  return g;
}

function makeCtx(
  adventurers: Adventurer[],
  npcs: NotableNpc[],
  opts: Partial<{ tick: number; relationships: RelationshipGraph }> = {},
): SimulationContext {
  const { tick = 10, relationships } = opts;
  const base = createSimulationContext('npc-interiority-seed');
  return {
    ...base,
    adventurers: new Map(adventurers.map(a => [a.id, a])),
    notableNpcs: new Map(npcs.map(n => [n.id, n])),
    relationships: relationships ?? base.relationships,
    worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 },
  };
}

// ---------------------------------------------------------------------------
// Encounters write NPC mood factors
// ---------------------------------------------------------------------------

describe('resolveEncounter — NPC mood factors', () => {
  it('applies the outcome mood factor to an NPC participant', () => {
    const adv = makeAdv('a');
    const npc = makeNpc('smith');
    const ctx = makeCtx([adv], [npc]);

    const next = resolveEncounter(ctx, [adv.id, npc.id], { forceOutcome: 'ARGUMENT' });

    const updatedNpc = next.notableNpcs.get(npc.id)!;
    const factor = updatedNpc.moodFactors.find(f => f.id === 'SOCIAL_ARGUMENT');
    expect(factor).toBeDefined();
    expect(factor!.value).toBeLessThan(0);
    // Adventurer still gets theirs too.
    expect(next.adventurers.get(adv.id)!.moodFactors.some(f => f.id === 'SOCIAL_ARGUMENT')).toBe(true);
  });

  it('leaves NPC mood factors untouched on a factorless outcome (SILENT_DISTANCE)', () => {
    const adv = makeAdv('a');
    const npc = makeNpc('smith');
    const ctx = makeCtx([adv], [npc]);

    const next = resolveEncounter(ctx, [adv.id, npc.id], { forceOutcome: 'SILENT_DISTANCE' });
    expect(next.notableNpcs.get(npc.id)!.moodFactors).toEqual(npc.moodFactors);
  });
});

// ---------------------------------------------------------------------------
// Day-tick mood pass covers NPCs
// ---------------------------------------------------------------------------

describe('moodSubscriber — NPC day-tick pass', () => {
  it('decays NPC mood factors and recalculates npc.mood on day ticks', () => {
    const npc: NotableNpc = {
      ...makeNpc('smith', 50),
      moodFactors: [
        { id: 'BASELINE', label: 'Steady trade', value: 50, decayRate: 0 },
        { id: 'SOCIAL_ARGUMENT', label: 'A bitter argument', value: -12, decayRate: 0.25 },
      ],
    };
    const ctx = makeCtx([], [npc], { tick: 24 }); // hour === 0

    const next = moodSubscriber(ctx);
    const updated = next.notableNpcs.get(npc.id)!;

    const argument = updated.moodFactors.find(f => f.id === 'SOCIAL_ARGUMENT');
    expect(argument!.value).toBeCloseTo(-9, 0); // -12 * (1 - 0.25)
    expect(updated.mood).toBe(50 - 9);          // recalculated from factors
  });

  it('does not run off day ticks and gives NPCs no despair consequence', () => {
    const npc = makeNpc('smith', 0); // rock bottom
    const midday = makeCtx([], [npc], { tick: 36 }); // hour === 12
    expect(moodSubscriber(midday)).toBe(midday);

    const dayTick = makeCtx([], [npc], { tick: 24 });
    const next = moodSubscriber(dayTick);
    // Still present, still an NPC — no streak field, no departure, no state change.
    expect(next.notableNpcs.get(npc.id)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Bonded-witness history
// ---------------------------------------------------------------------------

describe('witnessLossForBondedNpcs', () => {
  it('appends WITNESSED_DEATH to a bonded NPC and not to a stranger NPC', () => {
    const adv = makeAdv('kara');
    const bonded = makeNpc('smith');
    const stranger = makeNpc('guard');
    const ctx = makeCtx([adv], [bonded, stranger], {
      tick: 50,
      relationships: edgeGraph([[bonded.id, 'kara', 35]]), // |35| ≥ 20; stranger has no edge
    });

    const next = witnessLossForBondedNpcs(ctx, 'kara');

    const bondedHistory = next.notableNpcs.get(bonded.id)!.history;
    expect(bondedHistory).toHaveLength(1);
    expect(bondedHistory[0]).toMatchObject({ kind: 'WITNESSED_DEATH', involvedIds: ['kara'], tick: 50 });
    expect(next.notableNpcs.get(stranger.id)!.history).toHaveLength(0);
  });

  it('counts negative bonds too (a bitter rival still registers the loss)', () => {
    const adv = makeAdv('kara');
    const rivalNpc = makeNpc('smith');
    const ctx = makeCtx([adv], [rivalNpc], {
      relationships: edgeGraph([[rivalNpc.id, 'kara', -30]]),
    });
    const next = witnessLossForBondedNpcs(ctx, 'kara');
    expect(next.notableNpcs.get(rivalNpc.id)!.history).toHaveLength(1);
  });

  it('respects the 50-cap FIFO via appendHistoryEvent', () => {
    let history: HistoryEvent[] = [];
    for (let i = 0; i < 55; i++) {
      history = appendHistoryEvent(history, { tick: i, kind: 'WITNESSED_DEATH', involvedIds: ['x'], weight: 3 });
    }
    expect(history).toHaveLength(50);
    expect(history[0]!.tick).toBe(5); // oldest pruned
  });
});

// ---------------------------------------------------------------------------
// Loop-routed: a quest death reaches bonded townsfolk (p4b-witness pattern)
// ---------------------------------------------------------------------------

describe('quest death → bonded NPC history (through the loop)', () => {
  it('a bonded NPC registers a party death; npc.want never mutates', () => {
    // deathChance 1.0 guarantees deaths on failure; probability floors at 0.05,
    // so scan a few seeds and assert on the first seeded run that fails.
    for (const seed of ['npc-witness-1', 'npc-witness-2', 'npc-witness-3', 'npc-witness-4']) {
      const base = createSimulationContext(seed);
      const victim = { ...makeAdv('victim', 'ON_QUEST'), currentQuestId: 'deadly' };
      const npc = makeNpc('smith');
      const deadlyQ: Quest = {
        id: 'deadly', type: 'DUNGEON', name: 'Deadly', difficulty: 10,
        duration: 1, reward: 0,
        risk: { injuryChance: 0.0, deathChance: 1.0, criticalFailChance: 0.0 },
        requiredPartySize: 1, expiresAt: 99999,
        assignedParty: ['victim'], status: 'IN_PROGRESS', startedAt: 0,
      };
      const ctx: SimulationContext = {
        ...base,
        adventurers: new Map([['victim', victim]]),
        notableNpcs: new Map([[npc.id, npc]]),
        relationships: edgeGraph([[npc.id, 'victim', 40]]),
        questBoard: { available: [], active: [deadlyQ] },
      };

      const loop = new SimulationLoop(ctx);
      loop.step();

      const died = loop.context.adventurers.get('victim')!.state === 'DEAD';
      if (!died) continue; // quest succeeded under this seed (~5%) — try the next
      const updatedNpc = loop.context.notableNpcs.get(npc.id)!;
      expect(updatedNpc.history.some(h => h.kind === 'WITNESSED_DEATH' && h.involvedIds.includes('victim'))).toBe(true);
      expect(updatedNpc.want).toEqual(npc.want); // static, never mutated
      return;
    }
    throw new Error('no seed produced a quest failure in 4 attempts — fixture too weak');
  });
});

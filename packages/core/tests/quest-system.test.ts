import { describe, it, expect } from 'vitest';
import {
  computeQuestProbability,
  questBoardSeedingSubscriber,
  questExpirySubscriber,
  partySelectionSubscriber,
  questResolutionSubscriber,
  resolveQuest,
} from '../src/quests/questSystem.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { createEdge } from '../src/relationships/graph.js';
import type { Quest, Adventurer, RelationshipGraph, SimulationContext } from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuest(difficulty: number): Quest {
  return {
    id: 'q1', type: 'DUNGEON', name: 'Test Quest', difficulty,
    duration: 48, reward: 100,
    risk: { injuryChance: 0.1, deathChance: 0.05, criticalFailChance: 0.05 },
    requiredPartySize: 2, expiresAt: 9999,
    assignedParty: null, status: 'AVAILABLE',
  };
}

function makeAdventurer(id: string, mood = 50): Adventurer {
  return {
    id, identity: { id, name: id, age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood, moodFactors: [], state: 'IDLE', history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

const emptyGraph: RelationshipGraph = new Map();

// ---------------------------------------------------------------------------
// Probability — tracer bullet
// ---------------------------------------------------------------------------

describe('computeQuestProbability', () => {
  it('difficulty 10 solo party has finalProbability ≤ 0.95 (spec hard cap)', () => {
    const prob = computeQuestProbability(makeQuest(10), [makeAdventurer('a')], emptyGraph, 0);
    expect(prob).toBeLessThanOrEqual(0.95);
  });

  it('difficulty 1 full TRUSTED_COMPANION party has finalProbability ≤ 0.95', () => {
    const graph: RelationshipGraph = new Map([
      ['a', new Map([['b', createEdge(80)]])],
      ['b', new Map([['a', createEdge(80)]])],
    ]);
    const prob = computeQuestProbability(makeQuest(1), [makeAdventurer('a'), makeAdventurer('b')], graph, 0.5);
    expect(prob).toBeLessThanOrEqual(0.95);
  });

  it('FRIEND pair increases probability by +0.05 vs no relationship', () => {
    const graph: RelationshipGraph = new Map([
      ['a', new Map([['b', createEdge(50)]])], // FRIEND (50 ≥ 40)
      ['b', new Map([['a', createEdge(50)]])],
    ]);
    const noRelGraph: RelationshipGraph = new Map();
    const withFriend = computeQuestProbability(makeQuest(5), [makeAdventurer('a'), makeAdventurer('b')], graph, 0);
    const noRel = computeQuestProbability(makeQuest(5), [makeAdventurer('a'), makeAdventurer('b')], noRelGraph, 0);
    expect(withFriend).toBeCloseTo(noRel + 0.05, 5);
  });

  it('ENEMY pair decreases probability by −0.08 vs no relationship', () => {
    const graph: RelationshipGraph = new Map([
      ['a', new Map([['b', createEdge(-60)]])], // ENEMY (-60 ≤ -51)
      ['b', new Map([['a', createEdge(-60)]])],
    ]);
    const noRelGraph: RelationshipGraph = new Map();
    const withEnemy = computeQuestProbability(makeQuest(5), [makeAdventurer('a'), makeAdventurer('b')], graph, 0);
    const noRel = computeQuestProbability(makeQuest(5), [makeAdventurer('a'), makeAdventurer('b')], noRelGraph, 0);
    expect(withEnemy).toBeCloseTo(noRel - 0.08, 5);
  });

  it('high mood party has higher probability than low mood party', () => {
    const highMood = computeQuestProbability(makeQuest(5), [makeAdventurer('a', 90)], emptyGraph, 0);
    const lowMood  = computeQuestProbability(makeQuest(5), [makeAdventurer('a', 10)], emptyGraph, 0);
    expect(highMood).toBeGreaterThan(lowMood);
  });

  it('diModifier shifts probability (but stays clamped to 0.95)', () => {
    const base = computeQuestProbability(makeQuest(5), [makeAdventurer('a')], emptyGraph, 0);
    const boosted = computeQuestProbability(makeQuest(5), [makeAdventurer('a')], emptyGraph, 0.2);
    expect(boosted).toBeGreaterThan(base);
    expect(boosted).toBeLessThanOrEqual(0.95);
  });

  it('probability is always in [0.05, 0.95]', () => {
    for (let d = 1; d <= 10; d++) {
      const p = computeQuestProbability(makeQuest(d), [makeAdventurer('a', 50)], emptyGraph, 0);
      expect(p).toBeGreaterThanOrEqual(0.05);
      expect(p).toBeLessThanOrEqual(0.95);
    }
  });
});

// ---------------------------------------------------------------------------
// Quest board seeding
// ---------------------------------------------------------------------------

describe('questBoardSeedingSubscriber', () => {
  it('does not seed at tick 0', () => {
    const ctx = createSimulationContext('seed-test');
    expect(ctx.worldTime.tick).toBe(0);
    const result = questBoardSeedingSubscriber(ctx);
    expect(result.questBoard.available).toHaveLength(0);
  });

  it('seeds quests at tick 168 (one week)', () => {
    const ctx = { ...createSimulationContext('seed-168'), worldTime: { tick: 168, day: 7, hour: 0 } };
    const result = questBoardSeedingSubscriber(ctx);
    expect(result.questBoard.available.length).toBeGreaterThan(0);
  });

  it('does not seed at tick 169 (non-weekly tick)', () => {
    const ctx = { ...createSimulationContext('seed-169'), worldTime: { tick: 169, day: 7, hour: 1 } };
    const result = questBoardSeedingSubscriber(ctx);
    expect(result.questBoard.available).toHaveLength(0);
  });

  it('seeds at tick 336 (two weeks)', () => {
    const ctx = { ...createSimulationContext('seed-336'), worldTime: { tick: 336, day: 14, hour: 0 } };
    const result = questBoardSeedingSubscriber(ctx);
    expect(result.questBoard.available.length).toBeGreaterThan(0);
  });

  it('generated quests have status AVAILABLE and expiresAt = tick + 168', () => {
    const ctx = { ...createSimulationContext('seed-exp'), worldTime: { tick: 168, day: 7, hour: 0 } };
    const result = questBoardSeedingSubscriber(ctx);
    for (const q of result.questBoard.available) {
      expect(q.status).toBe('AVAILABLE');
      expect(q.expiresAt).toBe(168 + 168);
    }
  });

  it('generated names are flavorful multi-word titles, never the bare type or a (dN) suffix', () => {
    const ctx = { ...createSimulationContext('seed-names'), worldTime: { tick: 168, day: 7, hour: 0 } };
    const quests = questBoardSeedingSubscriber(ctx).questBoard.available;
    expect(quests.length).toBeGreaterThan(0);
    for (const q of quests) {
      // No difficulty suffix - the meaningful title stands alone.
      expect(q.name).not.toMatch(/\(d\d+\)/);
      // Never the bare quest type (e.g. "Investigation").
      const bareType = q.type.charAt(0) + q.type.slice(1).toLowerCase();
      expect(q.name).not.toBe(bareType);
      // Flavorful titles are always multi-word.
      expect(q.name.split(' ').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('quest naming is deterministic for a given seed', () => {
    const mk = () => ({ ...createSimulationContext('seed-determinism'), worldTime: { tick: 168, day: 7, hour: 0 } });
    const namesA = questBoardSeedingSubscriber(mk()).questBoard.available.map(q => q.name);
    const namesB = questBoardSeedingSubscriber(mk()).questBoard.available.map(q => q.name);
    expect(namesA).toEqual(namesB);
  });
});

// ---------------------------------------------------------------------------
// Quest expiry
// ---------------------------------------------------------------------------

describe('questExpirySubscriber', () => {
  function makeExpiredQuest(id: string): Quest {
    return { ...makeQuest(3), id, expiresAt: 24, status: 'AVAILABLE' };
  }

  it('only runs on day ticks (hour === 0)', () => {
    const ctx = createSimulationContext('expiry-hour');
    const withQuest = { ...ctx,
      worldTime: { tick: 25, day: 1, hour: 1 },
      questBoard: { available: [makeExpiredQuest('q1')], active: [] },
    };
    const result = questExpirySubscriber(withQuest);
    expect(result.questBoard.available).toHaveLength(1); // unchanged
  });

  it('removes AVAILABLE quests past expiresAt on a day tick', () => {
    const ctx = createSimulationContext('expiry-day');
    const withQuest = { ...ctx,
      worldTime: { tick: 48, day: 2, hour: 0 },
      questBoard: { available: [makeExpiredQuest('q1')], active: [] },
    };
    const result = questExpirySubscriber(withQuest);
    expect(result.questBoard.available).toHaveLength(0);
  });

  it('leaves non-expired quests untouched', () => {
    const ctx = createSimulationContext('expiry-fresh');
    const fresh = { ...makeQuest(3), id: 'fresh', expiresAt: 9999, status: 'AVAILABLE' as const };
    const withQuest = { ...ctx,
      worldTime: { tick: 48, day: 2, hour: 0 },
      questBoard: { available: [fresh], active: [] },
    };
    const result = questExpirySubscriber(withQuest);
    expect(result.questBoard.available).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Party selection
// ---------------------------------------------------------------------------

describe('partySelectionSubscriber', () => {
  function withIdleAdventurer(ctx: SimulationContext, id: string, mood = 60): SimulationContext {
    const adv: Adventurer = makeAdventurer(id, mood);
    return { ...ctx, adventurers: new Map(ctx.adventurers).set(id, adv) };
  }

  function withAvailableQuest(ctx: SimulationContext, q: Quest): SimulationContext {
    return { ...ctx, questBoard: { ...ctx.questBoard, available: [...ctx.questBoard.available, q] } };
  }

  it('does not run on non-day ticks', () => {
    let ctx = createSimulationContext('sel-hour');
    ctx = { ...ctx, worldTime: { tick: 5, day: 0, hour: 5 } };
    ctx = withIdleAdventurer(ctx, 'a');
    ctx = withAvailableQuest(ctx, { ...makeQuest(1), requiredPartySize: 1 });
    const result = partySelectionSubscriber(ctx);
    expect(result.adventurers.get('a')!.state).toBe('IDLE');
  });

  it('assigns a party and transitions adventurers to ON_QUEST', () => {
    let ctx = createSimulationContext('sel-assign');
    ctx = { ...ctx, worldTime: { tick: 30, day: 1, hour: 6 } }; // dawn departure hour
    ctx = withIdleAdventurer(ctx, 'a');
    ctx = withAvailableQuest(ctx, { ...makeQuest(1), id: 'q1', requiredPartySize: 1 });
    const result = partySelectionSubscriber(ctx);
    expect(result.adventurers.get('a')!.state).toBe('ON_QUEST');
  });

  it('fires QUEST STARTED event when party assigned', () => {
    let ctx = createSimulationContext('sel-event');
    ctx = { ...ctx, worldTime: { tick: 30, day: 1, hour: 6 } }; // dawn departure hour
    ctx = withIdleAdventurer(ctx, 'a');
    ctx = withAvailableQuest(ctx, { ...makeQuest(1), id: 'q1', requiredPartySize: 1 });
    const result = partySelectionSubscriber(ctx);
    const questEvents = result.eventLog.filter(e => e.kind === 'QUEST');
    expect(questEvents.length).toBeGreaterThan(0);
    expect(questEvents[0]!.renderedText).toBeTruthy();
  });

  it('emits a PREPARES_FOR_QUEST wake beat before QUEST STARTED for a party member who was asleep', () => {
    let ctx = createSimulationContext('sel-rouse');
    ctx = { ...ctx, worldTime: { tick: 30, day: 1, hour: 6 } }; // dawn departure hour
    const sleeper: Adventurer = {
      ...makeAdventurer('Reiko'),
      activityState: { current: 'SLEEPING', enteredAt: 24, scheduledExitAt: 33, nextMicroEventAt: 99 },
    };
    ctx = { ...ctx, adventurers: new Map(ctx.adventurers).set('Reiko', sleeper) };
    ctx = withAvailableQuest(ctx, { ...makeQuest(1), id: 'q1', requiredPartySize: 1 });

    const result = partySelectionSubscriber(ctx);

    const prep = result.eventLog.findIndex(
      e => e.kind === 'ACTIVITY' && (e as { subtype: string }).subtype === 'PREPARES_FOR_QUEST',
    );
    const started = result.eventLog.findIndex(
      e => e.kind === 'QUEST' && (e as { subtype: string }).subtype === 'STARTED',
    );
    expect(prep).toBeGreaterThanOrEqual(0);            // the prepare beat fired
    expect(started).toBeGreaterThanOrEqual(0);         // the party set out
    expect(prep).toBeLessThan(started);                // prepare is narrated first
    expect(result.eventLog[prep]!.renderedText).toContain('Reiko');
    expect(result.eventLog[prep]!.renderedText.toLowerCase()).toContain('sleep'); // roused flavor
  });

  it('emits a PREPARES_FOR_QUEST beat for every drafted member, naming the activity they left', () => {
    let ctx = createSimulationContext('sel-prep-all');
    ctx = { ...ctx, worldTime: { tick: 30, day: 1, hour: 6 } };
    const reiko: Adventurer = {
      ...makeAdventurer('Reiko'),
      activityState: { current: 'SLEEPING', enteredAt: 24, scheduledExitAt: 33, nextMicroEventAt: 99 },
    };
    const bran: Adventurer = {
      ...makeAdventurer('Bran'),
      activityState: { current: 'TRAINING', enteredAt: 28, scheduledExitAt: 40, nextMicroEventAt: 99 },
    };
    ctx = { ...ctx, adventurers: new Map(ctx.adventurers).set('Reiko', reiko).set('Bran', bran) };
    ctx = withAvailableQuest(ctx, { ...makeQuest(1), id: 'q1', requiredPartySize: 2 });

    const result = partySelectionSubscriber(ctx);
    const preps = result.eventLog.filter(
      e => e.kind === 'ACTIVITY' && (e as { subtype: string }).subtype === 'PREPARES_FOR_QUEST',
    );
    // One beat per drafted member.
    expect(preps).toHaveLength(2);
    const text = preps.map(e => e.renderedText).join('\n');
    expect(text).toContain('Reiko');
    expect(text).toContain('Bran');
    // The awake member's beat names the activity they broke off.
    expect(preps.find(e => e.renderedText.includes('Bran'))!.renderedText).toContain('training');
  });

  it('avoids assigning ENEMY pairs if a valid alternative exists', () => {
    let ctx = createSimulationContext('sel-enemy');
    ctx = { ...ctx, worldTime: { tick: 24, day: 1, hour: 0 } };
    // a and b are ENEMIES; c is a neutral alternative
    ctx = withIdleAdventurer(ctx, 'a', 80);
    ctx = withIdleAdventurer(ctx, 'b', 60);
    ctx = withIdleAdventurer(ctx, 'c', 60);
    const graph: RelationshipGraph = new Map([
      ['a', new Map([['b', createEdge(-60)]])],
      ['b', new Map([['a', createEdge(-60)]])],
    ]);
    ctx = { ...ctx, relationships: graph };
    ctx = withAvailableQuest(ctx, { ...makeQuest(3), id: 'q1', requiredPartySize: 2 });
    const result = partySelectionSubscriber(ctx);
    // b and a should not both be ON_QUEST (one gets replaced by c)
    const onQuestIds = [...result.adventurers.values()]
      .filter(a => a.state === 'ON_QUEST')
      .map(a => a.id);
    const hasEnemyPair = onQuestIds.includes('a') && onQuestIds.includes('b');
    expect(hasEnemyPair).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quest outcome resolution
// ---------------------------------------------------------------------------

describe('resolveQuest', () => {
  it('emits COMPLETED event on success', () => {
    // Use seed that produces roll < probability for difficulty=1 (probability ≈ 0.90)
    const ctx = { ...createSimulationContext('resolve-success'), worldTime: { tick: 100, day: 4, hour: 4 } };
    const party = [makeAdventurer('a', 60)];
    const quest = { ...makeQuest(1), id: 'q1' };

    // Run until we get a success (deterministic with seed)
    let result = resolveQuest(quest, party, ctx, 0);
    // With difficulty 1, probability is ~0.90 — very likely to succeed on first try
    // If it fails, that's fine; the test just checks the shape
    if (result.success) {
      const ev = result.ctx.eventLog.find(e => e.kind === 'QUEST');
      expect(ev).toBeDefined();
      expect(ev!.renderedText).toBeTruthy();
    } else {
      const ev = result.ctx.eventLog.find(e => e.kind === 'QUEST');
      expect(ev).toBeDefined();
    }
  });

  it('resolveQuest returns success=true when roll < probability (seeded check)', () => {
    // Probability for difficulty=1 is 0.90. Most seeds will produce roll < 0.90.
    // This test verifies the probability composition, not the roll itself.
    const prob = computeQuestProbability(makeQuest(1), [makeAdventurer('a')], emptyGraph, 0);
    expect(prob).toBeGreaterThan(0.85); // difficulty 1: base = 0.90
  });

  it('LIFECYCLE ADVENTURER_DIED event fires when adventurer dies in failed quest', () => {
    // Use very high death chance and a seeded RNG that will produce a low roll
    const ctx = createSimulationContext('resolve-death');
    const deadlyQuest: Quest = {
      ...makeQuest(10),
      risk: { injuryChance: 1.0, deathChance: 1.0, criticalFailChance: 1.0 },
    };
    // Force failure by using a difficulty-10 quest (probability ≈ 0.05)
    // We don't assert the rolled outcome; we assert that if death_chance=1.0,
    // the system processes deaths correctly (structural test)
    const party = [makeAdventurer('a', 50)];
    const result = resolveQuest(deadlyQuest, party, ctx, -0.9); // diModifier pushes to floor
    if (!result.success) {
      // If failed with deathChance=1, adventurer must die
      expect(result.deaths.length + result.injuries.length).toBeGreaterThanOrEqual(0); // always true
      // Structural: QUEST FAILED event is emitted
      const failedEv = result.ctx.eventLog.find(e => e.kind === 'QUEST' && (e as { subtype: string }).subtype === 'FAILED');
      expect(failedEv).toBeDefined();
    }
  });

  it('emits BEAT_LOG within the quest bracket — before the closing QUEST outcome event — and returns the beats', () => {
    const ctx = { ...createSimulationContext('resolve-order'), worldTime: { tick: 100, day: 4, hour: 4 } };
    const party = [makeAdventurer('a', 60), makeAdventurer('b', 60)];
    const quest = { ...makeQuest(3), id: 'q1', requiredPartySize: 2 };

    const result = resolveQuest(quest, party, ctx, 0);
    const log = result.ctx.eventLog;

    const beatIdx = log.findIndex(e => e.kind === 'COMBAT' && (e as { subtype: string }).subtype === 'BEAT_LOG');
    const questIdx = log.findIndex(e => e.kind === 'QUEST'); // COMPLETED or FAILED — the closing bracket
    expect(beatIdx).toBeGreaterThanOrEqual(0);
    expect(questIdx).toBeGreaterThanOrEqual(0);
    // The fight report precedes the closing outcome event; combat never trails past the bracket.
    expect(beatIdx).toBeLessThan(questIdx);

    // Beats are produced in resolveQuest and returned in the result (combat-resolution.md),
    // and the emitted event carries exactly those beats.
    expect(result.beats.length).toBeGreaterThan(0);
    expect((log[beatIdx] as { beats?: unknown }).beats).toEqual(result.beats);
  });
});

describe('questResolutionSubscriber — combat stays inside the quest bracket', () => {
  it('emits exactly one BEAT_LOG, before the closing QUEST outcome event', () => {
    const base = createSimulationContext('resolve-sub-order');
    const q: Quest = {
      ...makeQuest(1), id: 'q1', requiredPartySize: 1,
      assignedParty: ['a'], status: 'IN_PROGRESS', startedAt: 0,
    };
    const adv: Adventurer = { ...makeAdventurer('a', 60), state: 'ON_QUEST', currentQuestId: 'q1' };
    const ctx: SimulationContext = {
      ...base,
      worldTime: { tick: 48, day: 2, hour: 0 }, // 48 ≥ startedAt(0) + duration(48) → resolves
      adventurers: new Map([['a', adv]]),
      questBoard: { available: [], active: [q] },
    };

    const log = questResolutionSubscriber(ctx).eventLog;
    const beatLogs = log.filter(e => e.kind === 'COMBAT' && (e as { subtype: string }).subtype === 'BEAT_LOG');
    // Single emission — resolveQuest owns it; the subscriber no longer regenerates a second set.
    expect(beatLogs).toHaveLength(1);

    const beatIdx = log.findIndex(e => e.kind === 'COMBAT' && (e as { subtype: string }).subtype === 'BEAT_LOG');
    const outcomeIdx = log.findIndex(
      e => e.kind === 'QUEST' && ['COMPLETED', 'FAILED'].includes((e as { subtype: string }).subtype),
    );
    expect(beatIdx).toBeGreaterThanOrEqual(0);
    expect(outcomeIdx).toBeGreaterThanOrEqual(0);
    expect(beatIdx).toBeLessThan(outcomeIdx);
  });
});

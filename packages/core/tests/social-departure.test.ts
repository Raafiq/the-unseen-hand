import { describe, it, expect } from 'vitest';
import {
  computeInteractionProbability,
  computeOutcomeWeights,
  socialEventSubscriber,
} from '../src/events/socialResolver.js';
import {
  computeDepartureProbability,
  departureSubscriber,
} from '../src/adventurers/departureSystem.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { createEdge } from '../src/relationships/graph.js';
import type { Adventurer, RelationshipEdge, SimulationContext } from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdventurer(id: string, opts: Partial<{ mood: number; empathy: number; loyalty: number; despairStreak: number; state: Adventurer['state'] }> = {}): Adventurer {
  const { mood = 60, empathy = 50, loyalty = 50, despairStreak = 0, state = 'IDLE' } = opts;
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'A wanderer from afar.', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy, loyalty, ambition: 50 },
    mood, moodFactors: [], state, history: [],
    despairStreak,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

function makeEdge(strength: number): RelationshipEdge {
  return { strength, type: 'ACQUAINTANCE', history: [] };
}

// ---------------------------------------------------------------------------
// Social events — tracer bullet
// ---------------------------------------------------------------------------

describe('computeInteractionProbability', () => {
  it('neutral pair with no edge returns base ~0.15', () => {
    const a1 = makeAdventurer('a');
    const a2 = makeAdventurer('b');
    const prob = computeInteractionProbability(a1, a2, undefined);
    expect(prob).toBeCloseTo(0.15 + 0.10, 1); // base + empathy 50+50/200*0.20
  });

  it('high-mood adventurer increases probability', () => {
    const happy = makeAdventurer('a', { mood: 80 });
    const base  = makeAdventurer('b', { mood: 50 });
    const neutral = makeAdventurer('c', { mood: 50 });
    const withHappy  = computeInteractionProbability(happy, base,   undefined);
    const withNeutral = computeInteractionProbability(neutral, base, undefined);
    expect(withHappy).toBeGreaterThan(withNeutral);
  });

  it('low-mood adventurer decreases probability', () => {
    const sad    = makeAdventurer('a', { mood: 20 });
    const neutral = makeAdventurer('b', { mood: 50 });
    const neutral2 = makeAdventurer('c', { mood: 50 });
    const withSad     = computeInteractionProbability(sad, neutral,  undefined);
    const withNeutral = computeInteractionProbability(neutral2, neutral, undefined);
    expect(withSad).toBeLessThan(withNeutral);
  });
});

// ---------------------------------------------------------------------------
// Outcome weights
// ---------------------------------------------------------------------------

describe('computeOutcomeWeights', () => {
  it('SILENT_DISTANCE has higher weight for RIVAL pair than STRANGER pair', () => {
    const a1 = makeAdventurer('a');
    const a2 = makeAdventurer('b');
    const rivalEdge   = makeEdge(-20); // RIVAL
    const strangerEdge = makeEdge(0);   // STRANGER
    const rivalW    = computeOutcomeWeights(a1, a2, rivalEdge);
    const strangerW = computeOutcomeWeights(a1, a2, strangerEdge);
    expect(rivalW.SILENT_DISTANCE).toBeGreaterThan(strangerW.SILENT_DISTANCE);
  });

  it('ARGUMENT has higher weight when adventurer is UNSATISFIED (mood < 25)', () => {
    const unsatisfied = makeAdventurer('a', { mood: 15 });
    const content     = makeAdventurer('b', { mood: 60 });
    const other       = makeAdventurer('c', { mood: 60 });
    const withBad  = computeOutcomeWeights(unsatisfied, other,   undefined);
    const withGood = computeOutcomeWeights(content,     other,   undefined);
    expect(withBad.ARGUMENT).toBeGreaterThan(withGood.ARGUMENT);
  });

  it('BREAKTHROUGH has higher weight for FRIEND pair', () => {
    const a1 = makeAdventurer('a');
    const a2 = makeAdventurer('b');
    const friendEdge   = makeEdge(50); // FRIEND
    const strangerEdge = makeEdge(0);  // STRANGER
    const friendW    = computeOutcomeWeights(a1, a2, friendEdge);
    const strangerW  = computeOutcomeWeights(a1, a2, strangerEdge);
    expect(friendW.BREAKTHROUGH).toBeGreaterThan(strangerW.BREAKTHROUGH);
  });
});

// ---------------------------------------------------------------------------
// Social event subscriber
// ---------------------------------------------------------------------------

describe('socialEventSubscriber', () => {
  function ctxWithPair(mood1 = 60, mood2 = 60): SimulationContext {
    const base = createSimulationContext('social-sub');
    const dayCtx = { ...base, worldTime: { tick: 24, day: 1, hour: 0 } };
    const a1: Adventurer = makeAdventurer('a', { mood: mood1 });
    const a2: Adventurer = makeAdventurer('b', { mood: mood2 });
    const adventurers = new Map([['a', a1], ['b', a2]]);
    // Give them a relationship edge (prerequisite for interaction)
    const relationships = new Map([
      ['a', new Map([['b', createEdge(20)]])],
      ['b', new Map([['a', createEdge(20)]])],
    ]);
    return { ...dayCtx, adventurers, relationships };
  }

  it('only runs on day ticks (hour === 0)', () => {
    const ctx = { ...ctxWithPair(), worldTime: { tick: 5, day: 0, hour: 5 } };
    const result = socialEventSubscriber(ctx);
    expect(result.eventLog).toHaveLength(0);
  });

  it('when interaction fires, a SOCIAL event is added to eventLog', () => {
    // Run many seeds until one fires (interaction probability ~0.25 for default pair)
    let fired = false;
    for (let seed = 0; seed < 20; seed++) {
      const base = createSimulationContext(`social-fire-${seed}`);
      const ctx = { ...base, worldTime: { tick: 24, day: 1, hour: 0 } };
      const a1: Adventurer = makeAdventurer('a');
      const a2: Adventurer = makeAdventurer('b');
      const adventurers = new Map([['a', a1], ['b', a2]]);
      const relationships = new Map([
        ['a', new Map([['b', createEdge(20)]])],
        ['b', new Map([['a', createEdge(20)]])],
      ]);
      const result = socialEventSubscriber({ ...ctx, adventurers, relationships });
      if (result.eventLog.length > 0) {
        const ev = result.eventLog[0]!;
        expect(ev.kind).toBe('SOCIAL');
        expect(ev.renderedText).toBeTruthy();
        fired = true;
        break;
      }
    }
    expect(fired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Departure system
// ---------------------------------------------------------------------------

describe('computeDepartureProbability', () => {
  it('2 days despairing → 0 (no departure roll yet)', () => {
    const adv = makeAdventurer('a', { despairStreak: 2 });
    expect(computeDepartureProbability(adv)).toBe(0);
  });

  it('3 days despairing → 10% base probability', () => {
    const adv = makeAdventurer('a', { despairStreak: 3 });
    expect(computeDepartureProbability(adv)).toBeCloseTo(0.10);
  });

  it('4 days despairing → 15%', () => {
    const adv = makeAdventurer('a', { despairStreak: 4 });
    expect(computeDepartureProbability(adv)).toBeCloseTo(0.15);
  });

  it('10+ days despairing caps at 40%', () => {
    const adv = makeAdventurer('a', { despairStreak: 20 });
    expect(computeDepartureProbability(adv)).toBe(0.40);
  });

  it('high-loyalty adventurer has lower departure probability', () => {
    const loyal   = makeAdventurer('a', { despairStreak: 3, loyalty: 80 });
    const disloyal = makeAdventurer('b', { despairStreak: 3, loyalty: 30 });
    expect(computeDepartureProbability(loyal)).toBeLessThan(computeDepartureProbability(disloyal));
  });
});

describe('departureSubscriber', () => {
  function despairingCtx(despairStreak: number, state: Adventurer['state'] = 'IDLE'): SimulationContext {
    const base = createSimulationContext('depart-test');
    const ctx = { ...base, worldTime: { tick: 24, day: 1, hour: 0 } };
    const adv: Adventurer = { ...makeAdventurer('a', { despairStreak }), state };
    return { ...ctx, adventurers: new Map([['a', adv]]) };
  }

  it('does not roll departure when despairStreak < 3', () => {
    const ctx = despairingCtx(2);
    const result = departureSubscriber(ctx);
    expect(result.adventurers.get('a')!.state).toBe('IDLE');
  });

  it('does not roll departure for ON_QUEST adventurer regardless of despairStreak', () => {
    const ctx = despairingCtx(10, 'ON_QUEST');
    const result = departureSubscriber(ctx);
    expect(result.adventurers.get('a')!.state).toBe('ON_QUEST');
  });

  it('only runs on day ticks', () => {
    const base = createSimulationContext('depart-hour');
    const ctx = { ...base, worldTime: { tick: 5, day: 0, hour: 5 } };
    const adv: Adventurer = { ...makeAdventurer('a', { despairStreak: 10 }), state: 'IDLE' };
    const result = departureSubscriber({ ...ctx, adventurers: new Map([['a', adv]]) });
    expect(result.adventurers.get('a')!.state).toBe('IDLE');
  });

  it('when departure fires, adventurer transitions to RETIRED and event is emitted', () => {
    // With despairStreak=10 and loyalty=10, departure probability = min(0.40, 0.10+0.35)-0.10 = 0.25
    // (loyalty ≤ 60 so no loyalty reduction here; loyalty=10 means no reduction)
    // Run enough seeds to find a departure
    let departed = false;
    for (let seed = 0; seed < 50; seed++) {
      const base = createSimulationContext(`depart-fire-${seed}`);
      const ctx = { ...base, worldTime: { tick: 24, day: 1, hour: 0 } };
      const adv: Adventurer = { ...makeAdventurer('a', { despairStreak: 10, loyalty: 10 }), state: 'IDLE' };
      const result = departureSubscriber({ ...ctx, adventurers: new Map([['a', adv]]) });
      if (result.adventurers.get('a')!.state === 'RETIRED') {
        departed = true;
        const ev = result.eventLog.find(e => e.kind === 'LIFECYCLE');
        expect(ev).toBeDefined();
        expect(ev!.renderedText).toContain(adv.identity.name);
        break;
      }
    }
    expect(departed).toBe(true);
  });
});

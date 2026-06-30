import { describe, it, expect } from 'vitest';
import {
  computeDepartureProbability,
  departureSubscriber,
} from '../src/adventurers/departureSystem.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import type { Adventurer, SimulationContext } from '../src/world/types.js';

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

  it('pendingShift >= departure probability prevents departure from firing', () => {
    // despairStreak=20, loyalty=10 → prob = 0.40 (capped)
    // pendingShift of 0.40 → effectiveProb = 0 → rng.next() is always >= 0 → never departs
    for (let seed = 0; seed < 50; seed++) {
      const base = createSimulationContext(`depart-shift-${seed}`);
      const ctx = { ...base, worldTime: { tick: 24, day: 1, hour: 0 } };
      const adv: Adventurer = { ...makeAdventurer('a', { despairStreak: 20, loyalty: 10 }), state: 'IDLE' };
      const pendingShifts = new Map([['a', 0.40]]);
      const result = departureSubscriber({ ...ctx, adventurers: new Map([['a', adv]]), pendingShifts });
      expect(result.adventurers.get('a')!.state).toBe('IDLE');
    }
  });

  it('pendingShift is consumed from context after subscriber runs', () => {
    const base = createSimulationContext('depart-consume');
    const ctx = { ...base, worldTime: { tick: 24, day: 1, hour: 0 } };
    const adv: Adventurer = { ...makeAdventurer('a', { despairStreak: 20 }), state: 'IDLE' };
    const pendingShifts = new Map([['a', 0.40]]);
    const result = departureSubscriber({ ...ctx, adventurers: new Map([['a', adv]]), pendingShifts });
    expect(result.pendingShifts.has('a')).toBe(false);
  });

  it('when departure fires, adventurer transitions to RETIRED and event is emitted', () => {
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

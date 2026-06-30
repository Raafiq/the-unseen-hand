/**
 * Social pressure engine (p10c) — accumulation, discharge, and six-outcome resolution.
 *
 * Spec: specs/behaviors/social-system.md §4–5. Plan: plans/p10c-social-pressure.md.
 * Accumulation/discharge is tested through `socialPressureSubscriber`; encounter side effects
 * through `resolveEncounter` (the authoritative write site) per CLAUDE.md's subscriber rule.
 * Frozen constants under test: THRESHOLD = 1.0, DECAY = 0.015.
 */
import { describe, it, expect } from 'vitest';
import {
  socialPressureSubscriber,
  resolveEncounter,
  resolveOutcome,
  decideApproach,
  computePressureGain,
  pairKey,
  type EncounterStats,
} from '../src/events/socialResolver.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { createEdge } from '../src/relationships/graph.js';
import type {
  Adventurer,
  ActivityId,
  RelationshipGraph,
  SimulationContext,
  SocialOutcomeType,
} from '../src/world/types.js';

const THRESHOLD = 1.0;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

type AdvOpts = Partial<{
  mood: number; empathy: number; courage: number; loyalty: number;
  ambition: number; greed: number; stubborn: number;
  state: Adventurer['state']; activity: ActivityId | null;
}>;

function makeAdv(id: string, opts: AdvOpts = {}): Adventurer {
  const {
    mood = 50, empathy = 50, courage = 50, loyalty = 50, ambition = 50,
    greed = 50, stubborn = 0, state = 'IDLE', activity = 'EATING',
  } = opts;
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'A wanderer.', personalGoal: 'HEROISM' },
    personality: { courage, greed, empathy, loyalty, ambition, stubborn },
    mood, moodFactors: [], state, history: [], despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
    activityState: activity
      ? { current: activity, enteredAt: 0, scheduledExitAt: 9999, nextMicroEventAt: 9999 }
      : undefined,
  };
}

function graphWithEdges(edges: Array<[string, string, number]>): RelationshipGraph {
  const g: RelationshipGraph = new Map();
  const set = (a: string, b: string, s: number): void => {
    const inner = g.get(a) ?? new Map();
    inner.set(b, createEdge(s));
    g.set(a, inner);
  };
  for (const [a, b, s] of edges) { set(a, b, s); set(b, a, s); }
  return g;
}

function ctxWith(advs: Adventurer[], edges: Array<[string, string, number]> = [], seed = 'sp'): SimulationContext {
  const base = createSimulationContext(seed);
  return {
    ...base,
    adventurers: new Map(advs.map(a => [a.id, a])),
    relationships: graphWithEdges(edges),
  };
}

/** Advance one tick and run the pressure subscriber. */
function step(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick + 1;
  const advanced = { ...ctx, worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 } };
  return socialPressureSubscriber(advanced);
}

const socialEvents = (ctx: SimulationContext) => ctx.eventLog.filter(e => e.kind === 'SOCIAL');

// ---------------------------------------------------------------------------
// computePressureGain — net-flow eligibility via compatibility (plan D2/D3)
// ---------------------------------------------------------------------------

describe('computePressureGain', () => {
  it('a public-activity pair nets positive (gain > DECAY 0.015)', () => {
    const a = makeAdv('a', { activity: 'EATING' });
    const b = makeAdv('b', { activity: 'EATING' });
    const gain = computePressureGain(a, b, createEdge(20));
    expect(gain).toBeGreaterThan(0.015);
  });

  it('a withdrawn pairing (one RESTING) nets negative (gain < DECAY 0.015)', () => {
    const a = makeAdv('a', { activity: 'RESTING' });
    const b = makeAdv('b', { activity: 'EATING' });
    const gain = computePressureGain(a, b, createEdge(20));
    expect(gain).toBeLessThan(0.015);
  });

  it('a rival edge accrues faster than a settled acquaintance edge', () => {
    const a = makeAdv('a');
    const b = makeAdv('b');
    const rival = computePressureGain(a, b, createEdge(-30));   // RIVAL
    const settled = computePressureGain(a, b, createEdge(25));  // ACQUAINTANCE, not near a boundary
    expect(rival).toBeGreaterThan(settled);
  });
});

// ---------------------------------------------------------------------------
// Box 1 — enemy pairs accumulate zero pressure, never fire in 24 ticks
// ---------------------------------------------------------------------------

describe('enemy gate', () => {
  it('an enemy pair accumulates zero pressure and fires nothing across 24 ticks', () => {
    let ctx = ctxWith(
      [makeAdv('a', { activity: 'DRINKING' }), makeAdv('b', { activity: 'DRINKING' })],
      [['a', 'b', -60]], // ENEMY (≤ -51)
    );
    const key = pairKey('a', 'b');
    for (let i = 0; i < 24; i++) ctx = step(ctx);
    expect(ctx.socialPressure.get(key) ?? 0).toBe(0);
    expect(socialEvents(ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Box 2 — a kept-apart pair's pressure decays toward 0, never crosses THRESHOLD
// ---------------------------------------------------------------------------

describe('decay of a kept-apart pair', () => {
  it('one always-RESTING member makes the pair net-negative; pressure decays monotonically toward 0', () => {
    let ctx = ctxWith(
      [makeAdv('a', { activity: 'RESTING', mood: 50 }), makeAdv('b', { activity: 'EATING', mood: 50 })],
      [['a', 'b', 20]],
    );
    const key = pairKey('a', 'b');
    ctx = { ...ctx, socialPressure: new Map([[key, 0.2]]) }; // seed some standing pressure

    let prev = 0.2;
    for (let i = 0; i < 40; i++) {
      ctx = step(ctx);
      const p = ctx.socialPressure.get(key) ?? 0;
      expect(p).toBeLessThanOrEqual(prev);     // monotonic non-increase
      expect(p).toBeLessThan(THRESHOLD);       // never crosses
      prev = p;
    }
    expect(prev).toBeLessThan(0.2);            // demonstrably decayed
    expect(socialEvents(ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Box 3 — sustained proximity + strain rises monotonically to THRESHOLD
// ---------------------------------------------------------------------------

describe('monotonic accumulation to THRESHOLD', () => {
  it('a public, mood-strained pair accumulates strictly upward and crosses THRESHOLD', () => {
    let ctx = ctxWith(
      [makeAdv('a', { activity: 'EATING', mood: 70 }), makeAdv('b', { activity: 'EATING', mood: 30 })],
      [['a', 'b', 20]],
      'mono',
    );
    const key = pairKey('a', 'b');

    let prev = 0;
    // First 8 ticks stay below THRESHOLD (gain ≈ 0.097/tick) → strictly increasing.
    for (let i = 0; i < 8; i++) {
      ctx = step(ctx);
      const p = ctx.socialPressure.get(key) ?? 0;
      expect(p).toBeGreaterThan(prev);
      expect(p).toBeLessThan(THRESHOLD);
      prev = p;
    }

    // Keep stepping until the accumulator demonstrably crosses (either read ≥ THRESHOLD,
    // or it discharged and emitted a SOCIAL event — both prove the crossing).
    let crossed = false;
    for (let i = 0; i < 20 && !crossed; i++) {
      ctx = step(ctx);
      if ((ctx.socialPressure.get(key) ?? 0) >= THRESHOLD || socialEvents(ctx).length > 0) crossed = true;
    }
    expect(crossed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Box 4 — post-fire reset + cooldown, no re-fire until tick ≥ cooldown
// ---------------------------------------------------------------------------

describe('post-fire reset and cooldown', () => {
  it('resolveEncounter resets the pair pressure to 0 and sets a jittered cooldown in [tick+8, tick+24)', () => {
    const ctx0 = ctxWith([makeAdv('a'), makeAdv('b')], [['a', 'b', 20]], 'fire');
    const key = pairKey('a', 'b');
    const ctx = { ...ctx0, worldTime: { tick: 100, day: 4, hour: 4 }, socialPressure: new Map([[key, 1.5]]) };

    const next = resolveEncounter(ctx, ['a', 'b'], { forceOutcome: 'BANTER' });
    expect(next.socialPressure.get(key)).toBe(0);
    const cd = next.socialCooldowns.get(key)!;
    expect(cd).toBeGreaterThanOrEqual(100 + 8);
    expect(cd).toBeLessThan(100 + 24);
  });

  it('the subscriber does not fire while a pair is on cooldown, even with pressure over THRESHOLD', () => {
    const a = makeAdv('a', { activity: 'DRINKING' });
    const b = makeAdv('b', { activity: 'DRINKING' });
    let ctx = ctxWith([a, b], [['a', 'b', 20]], 'cooldown');
    const key = pairKey('a', 'b');
    ctx = {
      ...ctx,
      worldTime: { tick: 50, day: 2, hour: 2 },
      socialPressure: new Map([[key, 2.0]]),
      socialCooldowns: new Map([[key, 60]]), // active until tick 60
    };
    // Step ticks 51..59 — all under cooldown; nothing may fire and pressure is held.
    for (let i = 0; i < 9; i++) {
      ctx = step(ctx);
      expect(socialEvents(ctx)).toHaveLength(0);
      expect(ctx.socialPressure.get(key)).toBe(2.0);
    }
  });
});

// ---------------------------------------------------------------------------
// Box 5 — empathic approacher always JOINs
// ---------------------------------------------------------------------------

describe('decideApproach (join vs interrupt)', () => {
  it('empathy ≥ 55 always JOINs, even at low compatibility', () => {
    const approacher = makeAdv('a', { empathy: 70 });
    expect(decideApproach(approacher, 0.2)).toBe('JOIN');
    expect(decideApproach(approacher, 2.5)).toBe('JOIN');
  });

  it('low-empathy, high-courage approacher INTERRUPTs', () => {
    const approacher = makeAdv('a', { empathy: 30, courage: 70 });
    expect(decideApproach(approacher, 2.0)).toBe('INTERRUPT');
  });

  it('mid-empathy falls back to compatibility (≥1.5 JOIN, else INTERRUPT)', () => {
    const approacher = makeAdv('a', { empathy: 45, courage: 50 });
    expect(decideApproach(approacher, 2.0)).toBe('JOIN');
    expect(decideApproach(approacher, 1.0)).toBe('INTERRUPT');
  });
});

// ---------------------------------------------------------------------------
// Box 6 — six-outcome relationship deltas + mood factors
// ---------------------------------------------------------------------------

describe('outcome effects', () => {
  function resolveWith(opts: { forceOutcome: SocialOutcomeType }) {
    const ctx = ctxWith([makeAdv('a'), makeAdv('b')], [['a', 'b', 20]], `eff-${opts.forceOutcome}`);
    return resolveEncounter(ctx, ['a', 'b'], opts);
  }

  it('SOLIDARITY applies +10 to the edge and a SOCIAL_SOLIDARITY factor to both', () => {
    const next = resolveWith({ forceOutcome: 'SOLIDARITY' });
    expect(next.relationships.get('a')!.get('b')!.strength).toBe(30);
    for (const id of ['a', 'b']) {
      expect(next.adventurers.get(id)!.moodFactors.find(f => f.id === 'SOCIAL_SOLIDARITY')?.value).toBe(12);
    }
  });

  it('ARGUMENT applies -10 to the edge', () => {
    const next = resolveWith({ forceOutcome: 'ARGUMENT' });
    expect(next.relationships.get('a')!.get('b')!.strength).toBe(10);
    expect(next.adventurers.get('a')!.moodFactors.some(f => f.id === 'SOCIAL_ARGUMENT')).toBe(true);
  });

  it('ESTRANGEMENT applies -22 to the edge and locks a 5-day (120-tick) approach cooldown', () => {
    const ctx = ctxWith([makeAdv('a'), makeAdv('b')], [['a', 'b', 20]], 'estrange');
    const at = { ...ctx, worldTime: { tick: 200, day: 8, hour: 8 } };
    const next = resolveEncounter(at, ['a', 'b'], { forceOutcome: 'ESTRANGEMENT' });
    expect(next.relationships.get('a')!.get('b')!.strength).toBe(-2);
    expect(next.socialCooldowns.get(pairKey('a', 'b'))).toBeGreaterThanOrEqual(200 + 120);
  });

  it('each mood-bearing outcome emits its named factor; SILENT_DISTANCE emits none and is -1', () => {
    const expected: Record<string, string | null> = {
      BANTER: 'SOCIAL_BANTER',
      SOLIDARITY: 'SOCIAL_SOLIDARITY',
      BREAKTHROUGH: 'SOCIAL_BREAKTHROUGH',
      ARGUMENT: 'SOCIAL_ARGUMENT',
      ESTRANGEMENT: 'SOCIAL_ESTRANGEMENT',
      SILENT_DISTANCE: null,
    };
    for (const [outcome, factorId] of Object.entries(expected)) {
      const next = resolveWith({ forceOutcome: outcome as SocialOutcomeType });
      const factors = next.adventurers.get('a')!.moodFactors;
      if (factorId) {
        expect(factors.some(f => f.id === factorId), outcome).toBe(true);
      } else {
        expect(factors.some(f => f.id.startsWith('SOCIAL_')), outcome).toBe(false);
        expect(next.relationships.get('a')!.get('b')!.strength, outcome).toBe(19); // 20 - 1
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Box 7 — rare-outcome threshold gate + crisis bypass
// ---------------------------------------------------------------------------

describe('rare-outcome threshold gate', () => {
  const positiveVeryHighGap: EncounterStats = { moodAvg: 70, moodGap: 60, clashScore: 0, strength: 30 };
  const negativeVeryHighGap: EncounterStats = { moodAvg: 20, moodGap: 60, clashScore: 0, strength: -30 };

  it('BREAKTHROUGH fires on ≤ 40% of qualifying encounters (threshold gate)', () => {
    const rng = createSimulationContext('gate-stats').rng;
    const N = 600;
    let breakthroughs = 0;
    for (let i = 0; i < N; i++) {
      if (resolveOutcome(positiveVeryHighGap, rng) === 'BREAKTHROUGH') breakthroughs++;
    }
    const rate = breakthroughs / N;
    expect(rate).toBeGreaterThan(0.25); // not vanishing
    expect(rate).toBeLessThanOrEqual(0.5); // ~0.4, comfortably ≤ 40% + sampling margin
  });

  it('a crisis flag bypasses the gate: BREAKTHROUGH / ESTRANGEMENT fire at 100%', () => {
    const rng = createSimulationContext('crisis').rng;
    for (let i = 0; i < 30; i++) {
      expect(resolveOutcome(positiveVeryHighGap, rng, true)).toBe('BREAKTHROUGH');
      expect(resolveOutcome(negativeVeryHighGap, rng, true)).toBe('ESTRANGEMENT');
    }
  });

  it('a STRONG positive encounter that is not very-high-gap stays SOLIDARITY (never BREAKTHROUGH)', () => {
    const rng = createSimulationContext('no-escalate').rng;
    const strongNotVeryHigh: EncounterStats = { moodAvg: 70, moodGap: 40, clashScore: 0, strength: 30 };
    for (let i = 0; i < 30; i++) {
      expect(resolveOutcome(strongNotVeryHigh, rng)).toBe('SOLIDARITY');
    }
  });
});

// ---------------------------------------------------------------------------
// Box 8 — group scene: one event, N participant ids, N-choose-2 pair updates
// ---------------------------------------------------------------------------

describe('group scene', () => {
  it('a 3-participant encounter emits one SocialEvent with 3 ids and updates all 3 pairs', () => {
    const ctx = ctxWith(
      [makeAdv('a'), makeAdv('b'), makeAdv('c')],
      [['a', 'b', 10], ['a', 'c', 10], ['b', 'c', 10]],
      'group',
    );
    const before = socialEvents(ctx).length;
    const next = resolveEncounter(ctx, ['a', 'b', 'c'], { forceOutcome: 'BANTER' }); // +3 each

    const fired = socialEvents(next);
    expect(fired).toHaveLength(before + 1);
    const ev = fired[fired.length - 1] as import('../src/world/types.js').SocialEvent;
    expect(ev.participantIds).toEqual(['a', 'b', 'c']);

    expect(next.relationships.get('a')!.get('b')!.strength).toBe(13);
    expect(next.relationships.get('a')!.get('c')!.strength).toBe(13);
    expect(next.relationships.get('b')!.get('c')!.strength).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// Box 10 — rendered text is non-empty, slot-free, and replayable
// ---------------------------------------------------------------------------

describe('rendered encounter text', () => {
  it('produces non-empty, slot-free text', () => {
    const ctx = ctxWith([makeAdv('a'), makeAdv('b')], [['a', 'b', 20]], 'render');
    const next = resolveEncounter(ctx, ['a', 'b'], { forceOutcome: 'SOLIDARITY' });
    const text = next.eventLog[next.eventLog.length - 1]!.renderedText;
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\{[a-z]+\}/i);
  });

  it('replays byte-for-byte under a fixed seed', () => {
    const build = () => resolveEncounter(
      ctxWith([makeAdv('a'), makeAdv('b')], [['a', 'b', 20]], 'replay'),
      ['a', 'b'],
      { forceOutcome: 'ARGUMENT' },
    );
    const t1 = build().eventLog.at(-1)!.renderedText;
    const t2 = build().eventLog.at(-1)!.renderedText;
    expect(t1).toBe(t2);
  });
});

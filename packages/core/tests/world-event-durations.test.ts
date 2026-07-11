import { describe, it, expect } from 'vitest';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import {
  createStartingRegions,
  worldEventSeedingSubscriber,
  rollSpanDuration,
  monsterSurgeThreatBonus,
  SPAN_DURATIONS,
} from '../src/world/WorldExpansion.js';
import { seedQuestBoard } from '../src/quests/questSystem.js';
import { computeDepartureProbability } from '../src/adventurers/departureSystem.js';
import { emitEvent } from '../src/events/eventBus.js';
import type { SimulationContext, WorldEventInstance, WorldEvent, Adventurer } from '../src/world/types.js';

// Spec: specs/behaviors/world-expansion.md (Active world events / stateful spans)
//       specs/behaviors/event-bus.md (WorldEvent.phase, spanning-vs-instant)
// Plan: plans/p10b-world-event-durations.md

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Context with the three starting regions (THORNVALE unlocked) and a seed. */
function ctxWithRegions(seed: string): SimulationContext {
  const base = createSimulationContext(seed);
  return { ...base, activeRegions: createStartingRegions() };
}

/** Inject a live span instance into THORNVALE. */
function withSpan(ctx: SimulationContext, inst: WorldEventInstance): SimulationContext {
  const regions = new Map(ctx.activeRegions);
  const region = regions.get('THORNVALE')!;
  regions.set('THORNVALE', { ...region, activeWorldEvents: [...region.activeWorldEvents, inst] });
  return { ...ctx, activeRegions: regions };
}

type TickSnapshot = {
  tick: number;
  newEvents: WorldEvent[];
  active: Map<string, WorldEventInstance[]>;
};

/** Drive the subscriber n ticks, recording per-tick new WORLD events + active-span snapshot. */
function simulate(seed: string, n: number): { ctx: SimulationContext; snapshots: TickSnapshot[] } {
  let ctx = ctxWithRegions(seed);
  const snapshots: TickSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const tick = ctx.worldTime.tick + 1;
    ctx = { ...ctx, worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 } };
    const before = ctx.eventLog.length;
    ctx = worldEventSeedingSubscriber(ctx);
    const newEvents = ctx.eventLog.slice(before).filter((e): e is WorldEvent => e.kind === 'WORLD');
    const active = new Map<string, WorldEventInstance[]>();
    for (const [rid, region] of ctx.activeRegions) {
      active.set(rid, region.activeWorldEvents.map(s => ({ ...s })));
    }
    snapshots.push({ tick, newEvents, active });
  }
  return { ctx, snapshots };
}

const SPANNING = ['STORM', 'TRAVELLING_MERCHANT', 'MONSTER_SURGE', 'PLAGUE'] as const;
const SPAN_RANGE: Record<string, [number, number]> = {
  STORM: [6, 18], TRAVELLING_MERCHANT: [24, 72], MONSTER_SURGE: [48, 120], PLAGUE: [72, 192],
};

// ---------------------------------------------------------------------------
// Span lifecycle through the subscriber
// ---------------------------------------------------------------------------

describe('worldEventSeedingSubscriber — span lifecycle', () => {
  it('a seeded STORM adds one instance to a region with duration in [6,18] and emits phase:START', () => {
    const { snapshots } = simulate('lifecycle-storm', 4000);
    // Find a tick where a STORM START fired.
    const startTick = snapshots.find(s =>
      s.newEvents.some(e => e.subtype === 'STORM' && e.phase === 'START'),
    );
    expect(startTick, 'expected at least one STORM span in 4000 ticks').toBeDefined();

    const startEv = startTick!.newEvents.find(e => e.subtype === 'STORM' && e.phase === 'START')!;
    expect(startEv.regionId).toBeDefined();
    const insts = startTick!.active.get(startEv.regionId!)!.filter(s => s.type === 'STORM');
    expect(insts).toHaveLength(1);
    const dur = insts[0]!.expiresAt - insts[0]!.startedAt;
    expect(dur).toBeGreaterThanOrEqual(6);
    expect(dur).toBeLessThanOrEqual(18);
  });

  it('every spanning START is paired with exactly one END at tick === expiresAt; no events between', () => {
    const { snapshots } = simulate('lifecycle-pairing', 6000);

    for (const type of SPANNING) {
      // Per region, walk events of this type in order; START must precede END, duration in range.
      const byRegion = new Map<string, WorldEvent[]>();
      for (const s of snapshots) {
        for (const e of s.newEvents) {
          if (e.subtype !== type || !e.phase) continue;
          // attach the emitting tick for analysis
          (e as any)._tick = s.tick;
          const arr = byRegion.get(e.regionId!) ?? [];
          arr.push(e);
          byRegion.set(e.regionId!, arr);
        }
      }
      for (const [, events] of byRegion) {
        // Events must strictly alternate START, END, START, END, ...
        for (let i = 0; i < events.length; i++) {
          const expectedPhase = i % 2 === 0 ? 'START' : 'END';
          expect(events[i]!.phase, `${type} event #${i}`).toBe(expectedPhase);
        }
        // Each START/END pair: duration within the declared range.
        const [lo, hi] = SPAN_RANGE[type]!;
        for (let i = 0; i + 1 < events.length; i += 2) {
          const dur = (events[i + 1] as any)._tick - (events[i] as any)._tick;
          expect(dur, `${type} pair #${i / 2}`).toBeGreaterThanOrEqual(lo);
          expect(dur, `${type} pair #${i / 2}`).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it('never holds two live instances of the same type in one region (same-type suppression)', () => {
    const { snapshots } = simulate('lifecycle-suppress', 6000);
    for (const s of snapshots) {
      for (const [, insts] of s.active) {
        const counts = new Map<string, number>();
        for (const inst of insts) counts.set(inst.type, (counts.get(inst.type) ?? 0) + 1);
        for (const [type, c] of counts) {
          expect(c, `${type} @ tick ${s.tick}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('RUMOUR/WINDFALL emit a single phase-less event and never enter activeWorldEvents', () => {
    const { snapshots } = simulate('lifecycle-instant', 4000);
    let sawInstant = false;
    for (const s of snapshots) {
      for (const e of s.newEvents) {
        if (e.subtype === 'RUMOUR' || e.subtype === 'WINDFALL') {
          sawInstant = true;
          expect(e.phase).toBeUndefined();
        }
      }
      // Instant types never appear as live instances.
      for (const [, insts] of s.active) {
        for (const inst of insts) {
          expect(inst.type === 'RUMOUR' || inst.type === 'WINDFALL').toBe(false);
        }
      }
    }
    expect(sawInstant, 'expected at least one RUMOUR/WINDFALL in 4000 ticks').toBe(true);
  });

  it('END-sweep runs even on non-seeding ticks (spans actually expire)', () => {
    const { snapshots } = simulate('lifecycle-expire', 6000);
    // At least one END event exists, proving spans expire rather than living forever.
    const ends = snapshots.flatMap(s => s.newEvents).filter(e => e.phase === 'END');
    expect(ends.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Duration rolls
// ---------------------------------------------------------------------------

describe('rollSpanDuration', () => {
  it('STORM duration lands within [6, 18]', () => {
    const ctx = ctxWithRegions('dur-storm');
    for (let i = 0; i < 50; i++) {
      const d = rollSpanDuration('STORM', ctx)!;
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(18);
    }
  });

  it('each spanning type rolls within its declared range', () => {
    const ctx = ctxWithRegions('dur-all');
    const ranges: Record<string, [number, number]> = {
      STORM: [6, 18], TRAVELLING_MERCHANT: [24, 72], MONSTER_SURGE: [48, 120], PLAGUE: [72, 192],
    };
    for (const [type, [lo, hi]] of Object.entries(ranges)) {
      for (let i = 0; i < 30; i++) {
        const d = rollSpanDuration(type as any, ctx)!;
        expect(d, type).toBeGreaterThanOrEqual(lo);
        expect(d, type).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('RUMOUR and WINDFALL are instant (null duration)', () => {
    const ctx = ctxWithRegions('dur-instant');
    expect(rollSpanDuration('RUMOUR', ctx)).toBeNull();
    expect(rollSpanDuration('WINDFALL', ctx)).toBeNull();
    expect(SPAN_DURATIONS.RUMOUR).toBeNull();
    expect(SPAN_DURATIONS.WINDFALL).toBeNull();
  });

  it('is reproducible under a fixed seed', () => {
    const a = ctxWithRegions('repro');
    const b = ctxWithRegions('repro');
    const seqA = Array.from({ length: 10 }, () => rollSpanDuration('PLAGUE', a));
    const seqB = Array.from({ length: 10 }, () => rollSpanDuration('PLAGUE', b));
    expect(seqA).toEqual(seqB);
  });
});

// ---------------------------------------------------------------------------
// Consumers
// ---------------------------------------------------------------------------

const LIVE: WorldEventInstance = { type: 'MONSTER_SURGE', startedAt: 0, expiresAt: 9999 };

describe('consumer: quest threat (MONSTER_SURGE)', () => {
  it('a live MONSTER_SURGE raises the threat bonus; reverts to 0 when none active', () => {
    const base = ctxWithRegions('surge-bonus');
    expect(monsterSurgeThreatBonus(base)).toBe(0);
    const surged = withSpan(base, LIVE);
    expect(monsterSurgeThreatBonus(surged)).toBeGreaterThan(0);
  });

  it('raises measured quest difficulty across a seeded board (same seed)', () => {
    const plain = seedQuestBoard(ctxWithRegions('surge-board'), 12);
    const surged = seedQuestBoard(withSpan(ctxWithRegions('surge-board'), LIVE), 12);
    const sum = (c: SimulationContext) => c.questBoard.available.reduce((s, q) => s + q.difficulty, 0);
    expect(sum(surged)).toBeGreaterThan(sum(plain));
    // and never exceeds the cap
    for (const q of surged.questBoard.available) expect(q.difficulty).toBeLessThanOrEqual(10);
  });
});

describe('consumer: departure strain (PLAGUE)', () => {
  function adv(despairStreak: number, loyalty = 30): Adventurer {
    return { despairStreak, personality: { loyalty } } as unknown as Adventurer;
  }

  it('world strain raises the departure probability VALUE (probability-shift pathway)', () => {
    const a = adv(4);
    expect(computeDepartureProbability(a, 0.05)).toBeGreaterThan(computeDepartureProbability(a, 0));
  });

  it('zero strain leaves the baseline probability unchanged', () => {
    const a = adv(4);
    expect(computeDepartureProbability(a, 0)).toBe(computeDepartureProbability(a));
  });
});

describe('consumer: narrative colour tint', () => {
  function emitSocialLines(ctx: SimulationContext, n: number): string[] {
    let c = ctx;
    const lines: string[] = [];
    for (let i = 0; i < n; i++) {
      c = emitEvent(c, { kind: 'SOCIAL', subtype: 'BANTER', participantIds: ['alice', 'bob'], relationshipDelta: 5 });
      lines.push(c.eventLog[c.eventLog.length - 1]!.renderedText);
    }
    return lines;
  }

  it('a live STORM span tints some unrelated feed lines; no tint when none active', () => {
    const stormy = withSpan(ctxWithRegions('tint-on'), { type: 'STORM', startedAt: 0, expiresAt: 9999 });
    const calm = ctxWithRegions('tint-off');
    const STORM_MARKERS = ['storm', 'rain', 'wind', 'shutters'];
    const tinted = (lines: string[]) =>
      lines.filter(l => STORM_MARKERS.some(m => l.toLowerCase().includes(m))).length;

    expect(tinted(emitSocialLines(stormy, 80))).toBeGreaterThan(0);
    expect(tinted(emitSocialLines(calm, 80))).toBe(0);
  });

  it('a live FESTIVAL span tints guild-local lines but NEVER a COMBAT fight report', () => {
    // Regression: a COMBAT:BEAT_LOG (the away-quest fight) must not inherit the town festival's
    // ambient — otherwise the feed reads "The party trudges home from X. Lantern-light and
    // laughter spill through the streets outside." for a fight that happened out in a dungeon.
    const festive = withSpan(ctxWithRegions('festival-tint'), { type: 'FESTIVAL', startedAt: 0, expiresAt: 9999 });
    const FESTIVAL_MARKERS = ['festival', 'lantern', 'laughter', 'streets', 'crowd', 'music'];
    const tinted = (lines: string[]) =>
      lines.filter(l => FESTIVAL_MARKERS.some(m => l.toLowerCase().includes(m))).length;

    // Sanity: the span really is live and tinting guild-local (SOCIAL) lines.
    expect(tinted(emitSocialLines(festive, 80)), 'social tinted').toBeGreaterThan(0);

    // But the away-quest combat report is never tinted.
    let c = festive;
    const combatLines: string[] = [];
    for (let i = 0; i < 80; i++) {
      c = emitEvent(c, { kind: 'COMBAT', subtype: 'BEAT_LOG', questId: 'q1', involvedIds: ['alice'] });
      combatLines.push(c.eventLog[c.eventLog.length - 1]!.renderedText);
    }
    expect(tinted(combatLines), 'combat never tinted').toBe(0);
  });

  it('a live FESTIVAL span NEVER tints a QUEST departure/return line', () => {
    // Same rationale as COMBAT: a QUEST:STARTED/COMPLETED names the dungeon ("The party returns
    // triumphant from X"), so the guild-town festival's ambient must not bleed onto it.
    const festive = withSpan(ctxWithRegions('festival-quest-tint'), { type: 'FESTIVAL', startedAt: 0, expiresAt: 9999 });
    const FESTIVAL_MARKERS = ['festival', 'lantern', 'laughter', 'streets', 'crowd', 'music'];
    const tinted = (lines: string[]) =>
      lines.filter(l => FESTIVAL_MARKERS.some(m => l.toLowerCase().includes(m))).length;

    // Sanity: the span is live and tints guild-local (SOCIAL) lines.
    expect(tinted(emitSocialLines(festive, 80)), 'social tinted').toBeGreaterThan(0);

    let c = festive;
    const questLines: string[] = [];
    for (let i = 0; i < 80; i++) {
      c = emitEvent(c, { kind: 'QUEST', subtype: 'COMPLETED', questId: 'q1', partyIds: ['alice'] });
      c = emitEvent(c, { kind: 'QUEST', subtype: 'STARTED', questId: 'q2', partyIds: ['alice'] });
      questLines.push(c.eventLog[c.eventLog.length - 2]!.renderedText);
      questLines.push(c.eventLog[c.eventLog.length - 1]!.renderedText);
    }
    expect(tinted(questLines), 'quest lines never tinted').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// START/END grammar
// ---------------------------------------------------------------------------

describe('grammar: START vs END beat lines', () => {
  function distinct(seed: string, phase: 'START' | 'END', subtype: any, n = 60): Set<string> {
    let ctx = ctxWithRegions(seed);
    const set = new Set<string>();
    for (let i = 0; i < n; i++) {
      ctx = emitEvent(ctx, { kind: 'WORLD', subtype, phase, regionId: 'THORNVALE' });
      set.add(ctx.eventLog[ctx.eventLog.length - 1]!.renderedText);
    }
    return set;
  }

  it('each spanning type yields ≥3 distinct lines for both START and END, and they differ', () => {
    for (const type of SPANNING) {
      const starts = distinct(`g-${type}-s`, 'START', type);
      const ends = distinct(`g-${type}-e`, 'END', type);
      expect(starts.size, `${type} START`).toBeGreaterThanOrEqual(3);
      expect(ends.size, `${type} END`).toBeGreaterThanOrEqual(3);
      // START and END pools are distinct prose.
      for (const s of starts) expect(ends.has(s), `${type} overlap`).toBe(false);
    }
  });
});

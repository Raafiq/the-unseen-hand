import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createSimulationContext,
  type SimulationContext,
  type Adventurer,
  type SimulationEvent,
  type CycleDigest,
} from '@ugs/core';
import {
  composeCycleReads,
  composeChapter,
  isSignificantForChapter,
  type CycleReads,
} from './cycleNarrative';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAdv(id: string, name: string, mood = 55): Adventurer {
  return {
    id,
    identity: { id, name, age: 30, backstory: `${name} of Thornvale.`, personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood,
    moodFactors: [{ id: 'BASELINE', label: 'Adventurer spirit', value: mood, decayRate: 0 }],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

/** A context with Kara + Mira and an empty log, ready for injected cycle events. */
function baseCtx(seed = 'cycle-test'): SimulationContext {
  const ctx = createSimulationContext(seed);
  ctx.adventurers.set('s1-kara', makeAdv('s1-kara', 'Kara'));
  ctx.adventurers.set('s1-mira', makeAdv('s1-mira', 'Mira'));
  // A MORNING cycle: ticks 1..8 belong to it (proceed advances then emits).
  ctx.worldTime = { tick: 8, day: 0, hour: 8, cycle: 'AFTERNOON' };
  return ctx;
}

const MORNING_DIGEST: CycleDigest = { fromTick: 0, toTick: 8, day: 0, cycle: 'MORNING' };

function socialEvent(id: string, tick: number, subtype: string, participants: string[], text: string): SimulationEvent {
  return { id, tick, kind: 'SOCIAL', subtype, participantIds: participants, relationshipDelta: -5, renderedText: text } as SimulationEvent;
}

// ---------------------------------------------------------------------------
// Chapter selection
// ---------------------------------------------------------------------------

describe('chapter selection', () => {
  it('gives an adventurer with a meaningful cycle event exactly one chapter', () => {
    const ctx = baseCtx();
    ctx.eventLog = [
      socialEvent('e1', 3, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Kara and Mira clash over the map.'),
    ];
    const reads = composeCycleReads(ctx, MORNING_DIGEST);
    const kara = reads.chapters.filter(c => c.actorId === 's1-kara');
    expect(kara).toHaveLength(1);
    expect(kara[0]!.text.length).toBeGreaterThan(0);
  });

  it('omits a chapter for an adventurer with no meaningful cycle events (no placeholder)', () => {
    const ctx = baseCtx();
    // Only Kara + Mira are involved; a third idle adventurer has nothing.
    ctx.adventurers.set('s1-tomas', makeAdv('s1-tomas', 'Tomas'));
    ctx.eventLog = [
      socialEvent('e1', 3, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Kara and Mira clash over the map.'),
    ];
    const reads = composeCycleReads(ctx, MORNING_DIGEST);
    expect(reads.chapters.some(c => c.actorId === 's1-tomas')).toBe(false);
  });

  it('excludes events outside the cycle tick window', () => {
    const ctx = baseCtx();
    ctx.eventLog = [
      socialEvent('prev', 0, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Previous-cycle boundary event.'),
      socialEvent('next', 9, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Next-cycle event.'),
    ];
    const reads = composeCycleReads(ctx, MORNING_DIGEST);
    expect(reads.chapters).toHaveLength(0);
  });

  it('excludes pure ambient world flavour a character was not part of', () => {
    const ctx = baseCtx();
    const worldEvt = { id: 'w1', tick: 3, kind: 'WORLD', subtype: 'STORM', renderedText: 'A storm rolls in.' } as SimulationEvent;
    expect(isSignificantForChapter(worldEvt, 's1-kara')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quest-resolution dedup + roster-aware overview
// ---------------------------------------------------------------------------

function questEvent(id: string, tick: number, subtype: string, questId: string, party: string[], text: string): SimulationEvent {
  return { id, tick, kind: 'QUEST', subtype, questId, partyIds: party, renderedText: text } as SimulationEvent;
}
function combatResolved(id: string, tick: number, questId: string, party: string[], text: string): SimulationEvent {
  return { id, tick, kind: 'COMBAT', subtype: 'QUEST_RESOLVED', questId, involvedIds: party, renderedText: text } as SimulationEvent;
}

describe('quest-resolution dedup', () => {
  it('drops the redundant COMBAT travel line from the prose when the QUEST outcome is present', () => {
    const ctx = baseCtx();
    ctx.eventLog = [
      combatResolved('c1', 3, 'q1', ['s1-kara'], 'The party trudges home from “Descent”.'),
      questEvent('q1e', 3, 'COMPLETED', 'q1', ['s1-kara'], 'The party returns triumphant from “Descent”.'),
    ];
    const chapter = composeChapter(ctx, MORNING_DIGEST, 's1-kara');
    expect(chapter).not.toBeNull();
    expect(chapter!.text).toContain('returns triumphant');
    expect(chapter!.text).not.toContain('trudges home');
  });

  it('keeps the COMBAT line when no QUEST close for that quest shares the cycle', () => {
    const ctx = baseCtx();
    ctx.eventLog = [
      combatResolved('c1', 3, 'q1', ['s1-kara'], 'The party trudges home from “Descent”.'),
    ];
    const chapter = composeChapter(ctx, MORNING_DIGEST, 's1-kara');
    expect(chapter!.text).toContain('trudges home');
  });
});

describe('roster-aware overview', () => {
  it('never claims "more than one of them" when only one character has a chapter', () => {
    // Scan many seeds so we exercise the full overview phrase pool, not one lucky pick.
    for (let i = 0; i < 60; i++) {
      const ctx = baseCtx(`solo-overview-${i}`);
      ctx.adventurers.delete('s1-mira'); // single-adventurer guild
      ctx.eventLog = [questEvent('q', 3, 'COMPLETED', 'q1', ['s1-kara'], 'Kara returns triumphant from “Descent”.')];
      const reads = composeCycleReads(ctx, MORNING_DIGEST);
      expect(reads.chapters).toHaveLength(1);
      expect(reads.overview).not.toContain('more than one of them');
    }
  });
});

// ---------------------------------------------------------------------------
// POV shading
// ---------------------------------------------------------------------------

describe('POV shading', () => {
  it('renders one shared event into both chapters, from each POV, as one log entry', () => {
    const ctx = baseCtx();
    ctx.eventLog = [
      socialEvent('e1', 3, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Kara and Mira clash over the map.'),
    ];
    const before = ctx.eventLog.length;
    const reads = composeCycleReads(ctx, MORNING_DIGEST);

    const kara = reads.chapters.find(c => c.actorId === 's1-kara');
    const mira = reads.chapters.find(c => c.actorId === 's1-mira');
    expect(kara).toBeDefined();
    expect(mira).toBeDefined();

    // Each chapter centres its own character.
    expect(kara!.text).toContain('Kara');
    expect(mira!.text).toContain('Mira');
    // Distinct renderings (POV-shaded, not the same string echoed).
    expect(kara!.text).not.toBe(mira!.text);
    // Still one event in the log — composition never duplicates the record.
    expect(ctx.eventLog).toHaveLength(before);
  });
});

// ---------------------------------------------------------------------------
// Determinism + purity
// ---------------------------------------------------------------------------

describe('determinism and purity', () => {
  it('re-composes byte-identical text for a fixed seed + tick range', () => {
    const build = () => {
      const ctx = baseCtx('fixed-seed');
      ctx.eventLog = [
        socialEvent('e1', 2, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Kara and Mira clash over the map.'),
        socialEvent('e2', 5, 'SOLIDARITY', ['s1-kara', 's1-mira'], 'Kara and Mira find common ground.'),
      ];
      return ctx;
    };
    const a = composeCycleReads(build(), MORNING_DIGEST);
    const b = composeCycleReads(build(), MORNING_DIGEST);
    expect(a.overview).toBe(b.overview);
    expect(a.chapters.map(c => c.text)).toEqual(b.chapters.map(c => c.text));
  });

  it('does not mutate eventLog or advance ctx.rng', () => {
    const ctxA = baseCtx('purity');
    const ctxB = baseCtx('purity');
    const evt = () => socialEvent('e1', 3, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Kara and Mira clash over the map.');
    ctxA.eventLog = [evt()];
    ctxB.eventLog = [evt()];

    const logRef = ctxA.eventLog;
    composeCycleReads(ctxA, MORNING_DIGEST);

    // eventLog untouched (same array, same length).
    expect(ctxA.eventLog).toBe(logRef);
    expect(ctxA.eventLog).toHaveLength(1);
    // ctx.rng never consumed: the next draw matches an untouched control ctx.
    expect(ctxA.rng.next()).toBe(ctxB.rng.next());
  });
});

// ---------------------------------------------------------------------------
// Prose quality
// ---------------------------------------------------------------------------

describe('prose quality', () => {
  it('leaves no unfilled slot tokens and no raw outcome labels', () => {
    const ctx = baseCtx();
    ctx.eventLog = [
      socialEvent('e1', 2, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Kara and Mira clash over the map.'),
      socialEvent('e2', 4, 'ESTRANGEMENT', ['s1-kara', 's1-mira'], 'Kara and Mira drift apart for good.'),
      socialEvent('e3', 6, 'BREAKTHROUGH', ['s1-kara', 's1-mira'], 'Kara and Mira reach an understanding.'),
    ];
    const reads = composeCycleReads(ctx, MORNING_DIGEST);
    const allText = [reads.overview, ...reads.chapters.map(c => c.text)].join('\n');
    // No unfilled interpolation slots.
    expect(allText).not.toMatch(/\{[a-zA-Z]+\}/);
    // No raw outcome-label enum strings leaking into prose.
    for (const label of ['ARGUMENT', 'ESTRANGEMENT', 'BREAKTHROUGH', 'SOLIDARITY', 'BANTER', 'SILENT_DISTANCE']) {
      expect(allText).not.toContain(label);
    }
  });

  it('produces a non-empty 1-2 sentence cycle overview', () => {
    const ctx = baseCtx();
    ctx.eventLog = [
      socialEvent('e1', 3, 'ARGUMENT', ['s1-kara', 's1-mira'], 'Kara and Mira clash over the map.'),
    ];
    const reads = composeCycleReads(ctx, MORNING_DIGEST);
    expect(reads.overview.trim().length).toBeGreaterThan(0);
    const sentences = reads.overview.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(2);
  });

  it('composeChapter returns null for an actor with no cycle events', () => {
    const ctx = baseCtx();
    ctx.eventLog = [];
    expect(composeChapter(ctx, MORNING_DIGEST, 's1-kara')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No network / LLM in the composition path
// ---------------------------------------------------------------------------

describe('no network in composition path', () => {
  it('the module source issues no fetch/Anthropic/LLM call', () => {
    const src = readFileSync(fileURLToPath(new URL('./cycleNarrative.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/api\.anthropic/i);
  });
});

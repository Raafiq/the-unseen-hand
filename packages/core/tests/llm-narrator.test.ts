import { describe, it, expect } from 'vitest';
import {
  getDayEvents,
  buildNarratorPrompt,
  buildCycleOverviewPrompt,
  buildCycleChapterPrompt,
} from '../src/events/LLMNarrator.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { emitEvent } from '../src/events/eventBus.js';
import type { Adventurer, SimulationContext, SimulationEvent } from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext({ seed: 42 }), ...overrides };
}

function makeAdventurer(overrides: Partial<Adventurer> = {}): Adventurer {
  return {
    id: 'a-kara',
    identity: { id: 'a-kara', name: 'Kara', age: 29, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 72, greed: 18, empathy: 65, loyalty: 80, ambition: 40 },
    mood: 68,
    moodFactors: [],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { milestones: [], progress: 0 } as Adventurer['personalGoalProgress'],
    currentQuestId: null,
    ...overrides,
  };
}

const chapterEvent = (over: Partial<SimulationEvent> = {}): SimulationEvent => ({
  id: 'e1', tick: 10, kind: 'SOCIAL', subtype: 'BANTER',
  participantIds: ['a-kara', 'a-mira'],
  renderedText: 'Kara and Mira share an easy laugh by the fire.',
  ...over,
} as SimulationEvent);

// ---------------------------------------------------------------------------
// getDayEvents
// ---------------------------------------------------------------------------

describe('getDayEvents', () => {
  it('returns events from the given day (ticks day*24 through day*24+23)', () => {
    let ctx = makeCtx();
    // Emit events at tick 0 (day 0) and tick 24 (day 1)
    ctx = emitEvent({ ...ctx, worldTime: { tick: 0, day: 0, hour: 0 } }, {
      kind: 'WORLD', subtype: 'RUMOUR',
    });
    ctx = emitEvent({ ...ctx, worldTime: { tick: 24, day: 1, hour: 0 } }, {
      kind: 'WORLD', subtype: 'STORM',
    });

    const day0 = getDayEvents(ctx.eventLog, 0);
    expect(day0).toHaveLength(1);
    expect(day0[0]!.tick).toBe(0);

    const day1 = getDayEvents(ctx.eventLog, 1);
    expect(day1).toHaveLength(1);
    expect(day1[0]!.tick).toBe(24);
  });

  it('returns empty array when no events fall in the given day', () => {
    const ctx = makeCtx();
    expect(getDayEvents(ctx.eventLog, 5)).toHaveLength(0);
  });

  it('includes events at the last hour of the day (tick day*24+23)', () => {
    let ctx = makeCtx();
    ctx = emitEvent({ ...ctx, worldTime: { tick: 23, day: 0, hour: 23 } }, {
      kind: 'WORLD', subtype: 'RUMOUR',
    });
    expect(getDayEvents(ctx.eventLog, 0)).toHaveLength(1);
  });

  it('excludes the first tick of the next day (tick day*24+24)', () => {
    let ctx = makeCtx();
    ctx = emitEvent({ ...ctx, worldTime: { tick: 24, day: 1, hour: 0 } }, {
      kind: 'WORLD', subtype: 'RUMOUR',
    });
    expect(getDayEvents(ctx.eventLog, 0)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildNarratorPrompt
// ---------------------------------------------------------------------------

describe('buildNarratorPrompt', () => {
  it('returns an object with systemPrompt and userPrompt strings', () => {
    const ctx = makeCtx();
    const result = buildNarratorPrompt(1, [], ctx);
    expect(typeof result.systemPrompt).toBe('string');
    expect(typeof result.userPrompt).toBe('string');
  });

  it('system prompt establishes a melancholy narrator voice', () => {
    const ctx = makeCtx();
    const { systemPrompt } = buildNarratorPrompt(1, [], ctx);
    expect(systemPrompt.toLowerCase()).toContain('narrator');
  });

  it('user prompt includes the in-game day number', () => {
    const ctx = makeCtx();
    const { userPrompt } = buildNarratorPrompt(3, [], ctx);
    expect(userPrompt).toContain('Day 3');
  });

  it('user prompt includes rendered event text when events are present', () => {
    let ctx = makeCtx();
    ctx = emitEvent({ ...ctx, worldTime: { tick: 0, day: 0, hour: 0 } }, {
      kind: 'WORLD', subtype: 'STORM',
    });
    const day0Events = getDayEvents(ctx.eventLog, 0);
    const { userPrompt } = buildNarratorPrompt(0, day0Events, ctx);
    // The event's renderedText should appear in the prompt
    expect(userPrompt).toContain(day0Events[0]!.renderedText);
  });

  it('user prompt includes adventurer name from roster', () => {
    const ctx = makeCtx();
    const firstAdventurer = [...ctx.adventurers.values()][0];
    if (!firstAdventurer) return; // no adventurers in this context
    const { userPrompt } = buildNarratorPrompt(1, [], ctx);
    expect(userPrompt).toContain(firstAdventurer.identity.name);
  });

  it('handles empty event list without throwing', () => {
    const ctx = makeCtx();
    expect(() => buildNarratorPrompt(0, [], ctx)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildCycleOverviewPrompt — the per-cycle establishing paragraph (generalises
// the former day summary; llm-narrator.md + cycle-narrative.md §"cycle overview")
// ---------------------------------------------------------------------------

describe('buildCycleOverviewPrompt', () => {
  it('names the cycle and day it establishes', () => {
    const ctx = makeCtx();
    const { userPrompt } = buildCycleOverviewPrompt(2, 'AFTERNOON', [], ctx);
    expect(userPrompt).toContain('Day 2');
    expect(userPrompt.toLowerCase()).toContain('afternoon');
  });

  it('carries the cycle event lines', () => {
    const ctx = makeCtx();
    const e = chapterEvent({ renderedText: 'A storm rolls in over Thornvale.' });
    const { userPrompt } = buildCycleOverviewPrompt(0, 'MORNING', [e], ctx);
    expect(userPrompt).toContain('A storm rolls in over Thornvale.');
  });

  it('keeps the established narrator voice', () => {
    const ctx = makeCtx();
    const { systemPrompt } = buildCycleOverviewPrompt(0, 'NIGHT', [], ctx);
    expect(systemPrompt.toLowerCase()).toContain('narrator');
  });
});

// ---------------------------------------------------------------------------
// buildCycleChapterPrompt — one character's story of the cycle (cycle-narrative.md
// §"LLM tier": events + personality axes + mood + key relationships)
// ---------------------------------------------------------------------------

describe('buildCycleChapterPrompt', () => {
  it('centres the prompt on the character and cycle', () => {
    const ctx = makeCtx();
    const kara = makeAdventurer();
    const { userPrompt } = buildCycleChapterPrompt(kara, 1, 'MORNING', [chapterEvent()], ctx);
    expect(userPrompt).toContain('Kara');
    expect(userPrompt.toLowerCase()).toContain('morning');
    expect(userPrompt).toContain('Day 1');
  });

  it('carries the character cycle events', () => {
    const ctx = makeCtx();
    const kara = makeAdventurer();
    const e = chapterEvent({ renderedText: 'Kara stands her ground against the ogre.' });
    const { userPrompt } = buildCycleChapterPrompt(kara, 0, 'AFTERNOON', [e], ctx);
    expect(userPrompt).toContain('Kara stands her ground against the ogre.');
  });

  it('supplies personality axes and mood as narrator context', () => {
    const ctx = makeCtx();
    const kara = makeAdventurer({ personality: { courage: 91, greed: 5, empathy: 40, loyalty: 70, ambition: 33 } });
    const { userPrompt } = buildCycleChapterPrompt(kara, 0, 'NIGHT', [chapterEvent()], ctx);
    expect(userPrompt.toLowerCase()).toContain('courage');
    expect(userPrompt).toContain('91');
    // mood band label is surfaced so the narrator can colour the passage
    expect(userPrompt).toMatch(/content|neutral|unsatisfied|despairing/i);
  });

  it('asks for a short passage in the established narrator voice', () => {
    const ctx = makeCtx();
    const { systemPrompt } = buildCycleChapterPrompt(makeAdventurer(), 0, 'MORNING', [], ctx);
    expect(systemPrompt.toLowerCase()).toContain('narrator');
  });

  it('does not throw on a character with no cycle events', () => {
    const ctx = makeCtx();
    expect(() => buildCycleChapterPrompt(makeAdventurer(), 0, 'MORNING', [], ctx)).not.toThrow();
  });
});

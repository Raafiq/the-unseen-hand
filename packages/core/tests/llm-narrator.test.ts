import { describe, it, expect } from 'vitest';
import { getDayEvents, buildNarratorPrompt } from '../src/events/LLMNarrator.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { emitEvent } from '../src/events/eventBus.js';
import type { SimulationContext } from '../src/world/types.js';

function makeCtx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return { ...createSimulationContext({ seed: 42 }), ...overrides };
}

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

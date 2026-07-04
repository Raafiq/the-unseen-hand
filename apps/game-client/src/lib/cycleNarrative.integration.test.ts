import { describe, it, expect } from 'vitest';
import { SimulationLoop, createScenario1Context, type CycleDigest } from '@ugs/core';
import { composeCycleReads } from './cycleNarrative';

/**
 * End-to-end check over the *real* emission path: drive scenario 1 through several PROCEED
 * cycles and compose the reads from the actual event log (not crafted fixtures). Confirms the
 * template tier holds against real grammar lines, and that composition stays a pure view.
 */
describe('cycle narrative over a real proceed() run', () => {
  it('composes deterministic, slot-clean reads from a live cycle digest without perturbing state', () => {
    const loop = new SimulationLoop(createScenario1Context('p15b-verify'));

    // Advance until a cycle produces at least one chapter for the (single-adventurer) roster.
    let digest: CycleDigest | null = null;
    for (let i = 0; i < 12; i++) {
      digest = loop.proceed();
      const reads = composeCycleReads(loop.context, digest);
      if (reads.chapters.length > 0) break;
    }
    expect(digest).not.toBeNull();

    const ctx = loop.context;
    const reads = composeCycleReads(ctx, digest!);

    // Overview is always present and non-empty.
    expect(reads.overview.trim().length).toBeGreaterThan(0);
    // Over 12 cycles the lone survivor accrues thoughts / townsfolk encounters → a chapter.
    expect(reads.chapters.length).toBeGreaterThan(0);

    const allText = [reads.overview, ...reads.chapters.map(c => c.text)].join('\n');
    expect(allText).not.toMatch(/\{[a-zA-Z]+\}/); // no unfilled slot tokens
    for (const label of ['ARGUMENT', 'ESTRANGEMENT', 'BREAKTHROUGH', 'SOLIDARITY', 'BANTER', 'SILENT_DISTANCE', 'BEAT_LOG', 'QUEST_RESOLVED']) {
      expect(allText).not.toContain(label); // no raw enum labels
    }

    // Purity: composing does not touch the event log (same array reference, same length).
    const logRef = ctx.eventLog;
    const logLen = ctx.eventLog.length;

    // Determinism: recompose byte-identical from the same seed + tick range.
    const again = composeCycleReads(ctx, digest!);
    expect(again.overview).toBe(reads.overview);
    expect(again.chapters.map(c => c.text)).toEqual(reads.chapters.map(c => c.text));

    expect(ctx.eventLog).toBe(logRef);
    expect(ctx.eventLog).toHaveLength(logLen);
  });
});

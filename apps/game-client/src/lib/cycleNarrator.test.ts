import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimulationLoop, createScenario1Context } from '@ugs/core';
import { composeCycleReads, type CycleReads } from './cycleNarrative.js';
import { enrichCycleReads, patchCycleReads } from './cycleNarrator.js';

// The first PROCEED of scenario-1 (Day 0 · Afternoon) deterministically gives the lone
// adventurer, Reiko, one chapter — so reads.chapters.length === 1 (cycle-reader.spec.ts).
function firstCycle(): { ctx: ReturnType<typeof createScenario1Context>; reads: CycleReads } {
  const ctx0 = createScenario1Context();
  const loop = new SimulationLoop(ctx0);
  const digest = loop.proceed();
  const ctx = loop.context;
  return { ctx, reads: composeCycleReads(ctx, digest) };
}

function mockClaude(text = 'MOCK LLM PROSE') {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ content: [{ type: 'text', text }] }),
  }) as unknown as Response);
}

describe('enrichCycleReads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op with no API key (degraded — template tier stands)', async () => {
    const fetchMock = mockClaude();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {}); // no __e2eNarratorKey

    const { ctx, reads } = firstCycle();
    const onOverview = vi.fn();
    const onChapter = vi.fn();
    await enrichCycleReads(reads, ctx, { onOverview, onChapter });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onOverview).not.toHaveBeenCalled();
    expect(onChapter).not.toHaveBeenCalled();
  });

  it('batches at most rosterSize + 1 calls per cycle (overview + one per eventful chapter)', async () => {
    const fetchMock = mockClaude();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { __e2eNarratorKey: 'test-key' });

    const { ctx, reads } = firstCycle();
    await enrichCycleReads(reads, ctx, { onOverview: vi.fn(), onChapter: vi.fn() });

    // Exactly one overview call plus one per eventful chapter — never per event.
    expect(fetchMock).toHaveBeenCalledTimes(reads.chapters.length + 1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(ctx.adventurers.size + 1);
  });

  it('delivers the resolved passage to the overview and chapter handlers', async () => {
    vi.stubGlobal('fetch', mockClaude('a distinctive resolved passage'));
    vi.stubGlobal('window', { __e2eNarratorKey: 'test-key' });

    const { ctx, reads } = firstCycle();
    const onOverview = vi.fn();
    const onChapter = vi.fn();
    await enrichCycleReads(reads, ctx, { onOverview, onChapter });

    expect(onOverview).toHaveBeenCalledWith(reads.digest.fromTick, 'a distinctive resolved passage');
    const firstChapter = reads.chapters[0]!;
    expect(onChapter).toHaveBeenCalledWith(reads.digest.fromTick, firstChapter.actorId, 'a distinctive resolved passage');
  });

  it('keeps the template passage on API error (no handler fires)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
    vi.stubGlobal('window', { __e2eNarratorKey: 'test-key' });

    const { ctx, reads } = firstCycle();
    const onOverview = vi.fn();
    const onChapter = vi.fn();
    await enrichCycleReads(reads, ctx, { onOverview, onChapter });

    expect(onOverview).not.toHaveBeenCalled();
    expect(onChapter).not.toHaveBeenCalled();
  });

  it('never mutates the simulation context (LLM output stays outside the replay record)', async () => {
    vi.stubGlobal('fetch', mockClaude());
    vi.stubGlobal('window', { __e2eNarratorKey: 'test-key' });

    const { ctx, reads } = firstCycle();
    const eventLogBefore = ctx.eventLog.length;
    await enrichCycleReads(reads, ctx, { onOverview: vi.fn(), onChapter: vi.fn() });

    expect(ctx.eventLog.length).toBe(eventLogBefore);
  });
});

describe('patchCycleReads', () => {
  const base: CycleReads[] = [
    { digest: { fromTick: 9, toTick: 16, day: 0, cycle: 'AFTERNOON' }, overview: 'T-over', chapters: [{ actorId: 'a', name: 'A', day: 0, cycle: 'AFTERNOON', text: 'T-a', eventCount: 1 }] },
    { digest: { fromTick: 17, toTick: 24, day: 0, cycle: 'NIGHT' }, overview: 'N-over', chapters: [] },
  ];

  it('replaces the overview of the matching cycle only', () => {
    const next = patchCycleReads(base, 9, { overview: 'LLM overview' });
    expect(next[0]!.overview).toBe('LLM overview');
    expect(next[1]!.overview).toBe('N-over'); // untouched
  });

  it('replaces a chapter passage in place, preserving its key', () => {
    const next = patchCycleReads(base, 9, { chapter: { actorId: 'a', text: 'LLM chapter' } });
    expect(next[0]!.chapters[0]!.text).toBe('LLM chapter');
    expect(next[0]!.chapters[0]!.actorId).toBe('a'); // key preserved → in-place swap
  });

  it('is immutable — the original history is untouched', () => {
    patchCycleReads(base, 9, { overview: 'x', chapter: { actorId: 'a', text: 'y' } });
    expect(base[0]!.overview).toBe('T-over');
    expect(base[0]!.chapters[0]!.text).toBe('T-a');
  });

  it('is a no-op for an unknown cycle or actor', () => {
    expect(patchCycleReads(base, 999, { overview: 'x' })[0]!.overview).toBe('T-over');
    const next = patchCycleReads(base, 9, { chapter: { actorId: 'ghost', text: 'x' } });
    expect(next[0]!.chapters[0]!.text).toBe('T-a');
  });
});

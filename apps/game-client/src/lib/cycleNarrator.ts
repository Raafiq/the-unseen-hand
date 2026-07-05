/**
 * Cycle narrator — the **LLM tier** of the per-character reads (cycle-narrative.md §"LLM tier",
 * narrative-voice.md set-piece 1, llm-narrator.md). Layered on top of the deterministic template
 * tier (cycleNarrative.ts): at each cycle boundary it fires a bounded batch of Claude calls — one
 * cycle overview plus one chapter per eventful character (at most `rosterSize + 1`) — and each
 * resolved passage **replaces** the template passage in place when it arrives.
 *
 * Fully additive and degraded-safe: no API key → nothing fires (template only); an error or >10s
 * timeout → that passage stays template. It never blocks PROCEED and never touches simulation
 * state — the LLM output lives entirely outside the deterministic replay record. A replay with
 * the API absent is mechanically identical to one with it present; only the prose differs.
 */
import { buildCycleOverviewPrompt, buildCycleChapterPrompt, type SimulationContext } from '@ugs/core';
import { callNarrator, resolveNarratorApiKey } from './narrator.js';
import { chapterEvents, cycleOverviewEvents, type CycleReads } from './cycleNarrative.js';

/** Replace-on-arrival sinks — invoked once per resolved passage (overview or one chapter). */
export interface CycleEnrichmentHandlers {
  /** The LLM cycle overview resolved for the cycle at `fromTick`. */
  onOverview: (fromTick: number, text: string) => void;
  /** The LLM chapter for `actorId` in the cycle at `fromTick` resolved. */
  onChapter: (fromTick: number, actorId: string, text: string) => void;
}

/**
 * Fire the batched LLM set-piece for a just-composed cycle. Returns a promise that settles when
 * every call has resolved (for tests / flushing) — callers do **not** await it; the handlers fire
 * individually as each passage lands so the reader swaps prose in as it arrives. A no-op (resolves
 * immediately) when no API key is present.
 */
export function enrichCycleReads(
  reads: CycleReads,
  ctx: SimulationContext,
  handlers: CycleEnrichmentHandlers,
): Promise<void> {
  const apiKey = resolveNarratorApiKey();
  if (!apiKey) return Promise.resolve(); // degraded — template tier stands

  const { digest } = reads;
  const calls: Promise<unknown>[] = [];

  // One overview call for the whole guild's cycle.
  const overviewPrompt = buildCycleOverviewPrompt(digest.day, digest.cycle, cycleOverviewEvents(ctx, digest), ctx);
  calls.push(
    callNarrator(overviewPrompt, apiKey).then(text => {
      if (text) handlers.onOverview(digest.fromTick, text);
    }),
  );

  // One chapter call per eventful character — bounded by roster size (reads.chapters already
  // excludes characters with no meaningful cycle events), so the batch is ≤ rosterSize + 1.
  for (const ch of reads.chapters) {
    const adv = ctx.adventurers.get(ch.actorId);
    if (!adv) continue;
    const prompt = buildCycleChapterPrompt(adv, digest.day, digest.cycle, chapterEvents(ctx, digest, ch.actorId), ctx);
    calls.push(
      callNarrator(prompt, apiKey).then(text => {
        if (text) handlers.onChapter(digest.fromTick, ch.actorId, text);
      }),
    );
  }

  return Promise.all(calls).then(() => undefined);
}

/**
 * Replace-in-place: return a new history with the cycle at `fromTick` carrying the enriched
 * overview and/or chapter text, every other cycle untouched. Pure and immutable — the reader keys
 * spreads by `digest.fromTick` and chapters by `actorId`, so the swapped `CycleReads` re-renders
 * the prose in place (no reflow, no re-order). A patch for a missing cycle or actor is a no-op.
 */
export function patchCycleReads(
  history: CycleReads[],
  fromTick: number,
  patch: { overview?: string; chapter?: { actorId: string; text: string } },
): CycleReads[] {
  return history.map(reads => {
    if (reads.digest.fromTick !== fromTick) return reads;
    let next = reads;
    if (patch.overview !== undefined) next = { ...next, overview: patch.overview };
    if (patch.chapter) {
      const { actorId, text } = patch.chapter;
      next = { ...next, chapters: next.chapters.map(ch => (ch.actorId === actorId ? { ...ch, text } : ch)) };
    }
    return next;
  });
}

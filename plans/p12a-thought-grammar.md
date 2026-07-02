---
status: pending
depends: []
specs:
  - specs/behaviors/thought-system.md
  - specs/data-model.md
  - specs/behaviors/narrative-voice.md
  - specs/behaviors/history-layer.md
---

# Plan: P12a — Thought grammar + beliefs (core, pure)

> The deterministic heart of the living-minds feature: a pure `renderThought` slot grammar and a
> pure `deriveBeliefs` opinion layer, both randomized only through a derived
> `(worldSeed, actorId, tick)` stream so UI reads can never perturb the sim. No events, no
> subscriber, no UI in this slice.

## Scope

**In scope:**
- `worldSeed: string` on `SimulationContext` + stored by `createSimulationContext`.
- New `packages/core/src/thoughts/` domain: `beliefs.ts` (`deriveBeliefs`), `thoughtGrammar.ts`
  (fragment pools + `renderThought(ctx, actorId, opts?) → { text, subjectKey } | undefined`).
- Fragment pools (~110–130 fragments: stance 4 bands × 4, beliefs 6 kinds × 4, memories ~10
  kinds × 3, goal gaps 6 × 3, want-frames 3, inflections 5 × 3, hooks 2 × 4) in the game's
  melancholy voice, with a ≥ 3-variant coverage test.
- Exports in `src/index.ts`: `renderThought`, `deriveBeliefs`, types.
- Adventurer rendering fully working. NPC rendering compiles against `NotableNpc` **as it exists
  today** — want/history/moodFactors subject branches degrade gracefully until p12b lands
  (fallback: bio-derived subject or omission).

**Out of scope:**
- `THOUGHT` event kind, whisper subscriber, anti-repetition (p12c).
- NPC field additions (p12b). Any UI (p12d).

## Implements

- `specs/behaviors/thought-system.md` — grammar, derived stream, beliefs table, purity rules.
- `specs/data-model.md#simulationcontext` — `worldSeed`.

## Approach

1. TDD `beliefs.test.ts` first: derives DISTRUSTS from BETRAYED_BY history; TRUSTS at
   strength ≥ 40; RESENTS expires outside the 14-day window; OWES from SAVED_BY within 30 days;
   derivation is pure (identical inputs → identical output); never reads `ctx.eventLog`.
   Implement `deriveBeliefs` (edge-history scanned backwards with window early-exit).
2. Add `worldSeed` to `SimulationContext` + factory (one-line each).
3. TDD `thought-system.test.ts`: stable for same `(ctx, actorId)`; **does not consume `ctx.rng`**
   (twin-context probe: render 100× on ctxA, then `expect(ctxA.rng.next()).toBe(ctxB.rng.next())`);
   different actors at the same tick get independent streams; same actor at different ticks can
   differ (statistical over 50 ticks); no unfilled `{slot}` across a 200-render sweep; stance
   follows mood band; stubborn ≥ 70 selects the defiant register; hook reflects the largest
   recent relationship delta; DEAD/RETIRED/unknown ids → `undefined`. Implement pools +
   `renderThought`.
4. Pool coverage test mirroring narrative-voice: every pool key ≥ 3 variants.
5. Gates: `pnpm --filter @ugs/core exec tsc --noEmit`, full Vitest,
   `grep -r "Math.random" packages/`.

## Validation

- [ ] Twin-context rng-purity test green.
- [ ] Stability + independent-streams + slot-free sweep green.
- [ ] Coverage ≥ 3 per pool key.
- [ ] `tsc --noEmit` + full core suite green with **zero re-baselines** (this plan consumes no
      `ctx.rng`).
- [ ] `data-model.md` lists `worldSeed`; `thought-system.md` merged with the p9c note.

## Risks / unknowns

- Grammar authoring is craft work — the coverage test is the floor; tone review is human.
- Salience weighting (weight × recency) needs a first-pass formula; tune in playtest, not here.

## Notes

- The derived stream reuses `SeededRNG`'s xmur3 string hash as the pure hash — no second
  randomness primitive.
- Beliefs are derived, never stored: zero new write sites, zero data-model surface beyond
  `worldSeed`.

## Follow-ups

- p12b (NPC interiority) unlocks the want/history subject branches for NPCs.
- p12c (whispers), p12d (surfaces).

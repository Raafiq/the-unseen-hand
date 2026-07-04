---
status: done
depends: [p15a-world-clock-turn-gate]
specs:
  - specs/behaviors/cycle-narrative.md
  - specs/behaviors/narrative-voice.md
issues: []
---

# Plan: P15b — Cycle narrative engine (template tier)

> The deterministic heart of the reading experience. Composes each character's **cycle chapter**
> and the **cycle overview** from a `PROCEED` digest, using authored fragment pools and a derived
> read-only stream — the Wildermyth model (fragments + character data, no AI). This is the tier
> that is always present; P15c layers the LLM on top. No engine mutation: composition is a pure
> view over the deterministic event log.

## Scope

**In scope:**
- **`apps/game-client/src/lib/cycleNarrative.ts`**: given a cycle digest `{ fromTick, toTick, day,
  cycle }` + the `eventLog` slice + adventurer/relationship snapshot, produce:
  - **Per-character chapters** — select each adventurer's meaningful cycle events via the existing
    `getInvolvedIds` resolution and the feed significance bar; compose a 2–4 sentence passage
    (cycle-keyed opening beat + significant event sentences in order + optional closing colour).
  - **Cycle overview** — a 1–2 sentence guild-level establishing passage.
- **Derived read-only stream**: fragment selection hashed from `(worldSeed, actorId, fromTick)`
  (same pattern as on-demand thought renders) so (re)composing a chapter never perturbs `ctx.rng`
  or the replayable record.
- **POV-shading**: a shared (multi-participant) event is rendered into each participant's chapter
  from that character's point of view; one event → N POV renderings.
- **Fragment pools** for cycle openings/closings keyed by `(cycle, mood band)`, reusing the
  `narrative-voice.md` grammar conventions.
- **`cycleChapters` store field**: expose the composed overview + chapters for the current spread
  on `simulationStore` for the reader UI (P15d) to consume.

**Out of scope:**
- Any LLM call (P15c). This tier is the deterministic fallback and stands alone.
- The reader screen and roster-dock wiring (P15d).

## Implements

- `specs/behaviors/cycle-narrative.md` — the template tier: event selection, per-(character,cycle)
  scoping, POV-shaded shared encounters, the derived-stream determinism boundary, optional/empty
  chapters, length/voice, and no-network guarantee.
- `specs/behaviors/narrative-voice.md` — the cycle set-piece's deterministic fallback (template
  composition over grammar lines; the LLM half is P15c).

## Approach

Composition reuses two things the codebase already has: `getInvolvedIds` for "whose chapter is
this", and the derived-stream hashing that thought renders use to stay out of the replay record.
That makes the whole tier a pure function of `(digest, eventLog, worldSeed)` — testable in
isolation and reproducible byte-for-byte. Chapters are a passage-form generalisation of the
existing character-detail "Last Day Events" list, so the significance filter and event-to-sentence
mapping are lifted from there rather than invented. Living-first ordering and empty-chapter
omission match the reader's needs (P15d) without the reader owning any composition logic.

## Validation

- [x] After a `PROCEED`, each adventurer with ≥1 meaningful cycle event has exactly one chapter;
      characters with none have zero chapters (no placeholder).
- [x] A two-participant event appears in both participants' chapters, rendered from each POV; it is
      one event in the log.
- [x] Re-composing a chapter for a fixed seed + tick range yields identical text, and does not
      mutate `eventLog` or any simulation state (determinism + purity).
- [x] No chapter contains an unfilled slot token or a raw outcome-label string; every chapter is a
      complete non-empty passage.
- [x] No network/LLM call in the composition path (grep + test).
- [x] `pnpm --filter @ugs/game-client check` green; composition unit-tested (game-client vitest
      harness stood up as part of this plan — the P14a follow-up).

## Risks / unknowns

- Game-client currently has no vitest harness (only e2e) — this tier wants direct unit tests, so a
  small vitest setup may be part of the plan (tracked as a P14a follow-up already).
- Significance-bar reuse: confirm the character-detail "Last Day Events" significance definition is
  the single source so the chapter and that panel never disagree.

## Notes

- **Composer**: `apps/game-client/src/lib/cycleNarrative.ts` — pure `composeCycleReads(ctx, digest)`
  → `{ digest, overview, chapters }`; also `composeChapter` and the exported significance predicate
  `isSignificantForChapter`. Derived read-only stream `new SeededRNG(`${worldSeed}:cycle:${actorId}:${fromTick}`)`
  (overview keyed `:cycle-overview:${fromTick}`), copied from `thoughtGrammar.ts:476`. Never touches
  `ctx.rng`; cycle window is `(fromTick, toTick]` (PROCEED advances *then* emits, so the boundary tick
  belongs to the prior cycle).
- **Significance single-sourced two ways**: `getInvolvedIds` was extracted out of `EventFeed.svelte`
  into `apps/game-client/src/lib/eventInvolvement.ts` and imported by both, so feed and chapters can
  never disagree on involvement; and `isSignificantForChapter` also gates on the feed's
  `hiddenEventKinds()` so a hidden feature's kind never leaks into a chapter. The character-detail
  recap referenced in the handoff turned out to be a `adv.history` (`HistoryEvent`) list — a different
  data source than the `eventLog`, so there was no shared function to lift; the meaningful-kind set
  (`COMBAT/SOCIAL/RELATIONSHIP/LIFECYCLE/QUEST/NPC/THOUGHT`) is now the single authority for chapters.
- **POV-shading**: symmetric shared events (SOCIAL ×6, `RELATIONSHIP:SHARED_DANGER`, the paired
  LIFECYCLE bond subtypes, COMBAT, QUEST start/complete/fail) get a `{self} {clause-with-{others}}`
  recast from `POV_POOLS`, so the same event reads distinctly in each participant's chapter.
  **Directional** events (BETRAYAL, KINDNESS, RIVALRY_SPARK) are deliberately *not* in `POV_POOLS` —
  a naive self-as-subject frame would invert their meaning — so they fall back to the shared
  `renderedText` (still appears in both chapters, one log record). All solo/unmapped events fall back
  to `renderedText`, which is complete prose by construction.
- **Quality pass** after eyeballing a real run: per-chapter anti-repetition (`pickFresh` avoids
  reusing a POV fragment), a 4-sentence event cap, closing colour only on quiet (≤2-event) chapters,
  and light `TRANSITIONS` to break `{Name}…{Name}…` monotony. All deterministic (drawn from the same
  stream).
- **Store**: `simulationStore.cycleChapters: CycleReads | null` + `recordCycleReads(digest)` action
  (p15e wires it to the PROCEED button).
- **Vitest harness stood up** (the P14a follow-up): `apps/game-client/vitest.config.ts` (node env,
  `src/**/*.test.ts`), `"test": "vitest run"` script, `vitest` dev-dep. Resolves `@ugs/core` through
  its built `dist` exactly like the Vite app build — **so keep `@ugs/core` built** before running
  (`dist` was stale from before p15a and had to be rebuilt for `Cycle`/`CycleDigest`). 12 tests
  (`cycleNarrative.test.ts` unit + `cycleNarrative.integration.test.ts` real-`proceed()` run).
- Verified: 12/12 vitest, `check` 0/0, e2e 17 pass / 6 feature-skipped (baseline held after the
  `EventFeed` refactor). **Not committed** — left for the user.

## Follow-ups

- **p15c (LLM tier)** and **p15d (reader UI)** are now unblocked. p15c replaces the template passage
  when the API resolves; p15d consumes `simulationStore.cycleChapters`.
- **p15e** wires `recordCycleReads(digest)` to the PROCEED action (composition currently has no caller
  in the running app — the store field/action exist but nothing invokes them yet).
- **scenario-1 is single-adventurer**, so the real-run integration test exercises solo chapters +
  overview + determinism but *not* multi-participant POV across two chapters — that path is covered by
  the crafted unit fixture. A multi-adventurer scenario (or the p15d e2e) would exercise POV live.
- **Directional-event POV** (BETRAYAL/KINDNESS/RIVALRY_SPARK) currently falls back to `renderedText`
  rather than a true POV recast. If the LLM tier (p15c) doesn't subsume this, consider giver/receiver
  POV pools keyed on the event's direction.
- The core `tsc` guardrail note (`packages/core/CLAUDE.md`, uncommitted from the p15a session) is
  still in the working tree; fold into the p15b commit or leave.

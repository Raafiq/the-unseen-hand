---
status: planned
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

- [ ] After a `PROCEED`, each adventurer with ≥1 meaningful cycle event has exactly one chapter;
      characters with none have zero chapters (no placeholder).
- [ ] A two-participant event appears in both participants' chapters, rendered from each POV; it is
      one event in the log.
- [ ] Re-composing a chapter for a fixed seed + tick range yields identical text, and does not
      mutate `eventLog` or any simulation state (determinism + purity).
- [ ] No chapter contains an unfilled slot token or a raw outcome-label string; every chapter is a
      complete non-empty passage.
- [ ] No network/LLM call in the composition path (grep + test).
- [ ] `pnpm --filter @ugs/game-client check` green; composition unit-tested (add game-client vitest
      if not yet present, per the P14a follow-up).

## Risks / unknowns

- Game-client currently has no vitest harness (only e2e) — this tier wants direct unit tests, so a
  small vitest setup may be part of the plan (tracked as a P14a follow-up already).
- Significance-bar reuse: confirm the character-detail "Last Day Events" significance definition is
  the single source so the chapter and that panel never disagree.

## Notes

(populated at closeout)

## Follow-ups

(populated at closeout)

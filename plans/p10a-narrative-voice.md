---
status: done
depends: []
specs:
  - specs/behaviors/narrative-voice.md
  - specs/behaviors/event-bus.md
  - specs/behaviors/llm-narrator.md
  - specs/behaviors/social-system.md
---

# Plan: P10a — Narrative Voice (template grammar + LLM set-piece boundary)

> **Phase 10 — Events Redesign.** First of four (Voice → Durations → Timing → Town).
> Supersedes the cancelled **p9c-llm-inline-cards** (per-scene LLM + character cards were
> rejected; the day-summary narrator is retained).

## Scope

Lift `eventBus.renderText`'s flat per-subtype one-liners to a deterministic
**`subject + beat + colour`** template grammar with ≥ 3 beat variants per `(kind, subtype)`,
all selection via `ctx.rng`. Establish the LLM **set-piece** boundary: the day-summary narrator
stays as one of exactly three set-pieces; nothing else calls an LLM for `renderedText`.

**In scope:**
- Grammar primitives: typed fragment pools (`beatPool`, `colourPool`), an rng-driven
  `compose(subject, beat, colour?)` helper, slot interpolation (`{a}`, `{b}`, `{subject}`,
  `{region}`) with a no-unfilled-slot guarantee.
- Beat/colour pools for every current event family that reaches the feed: social (the six
  outcomes — authored now even though P10c emits them), quest, lifecycle, world flavour,
  micro-events (generalise the existing `MICRO_TEMPLATES` shape), divine.
- Colour tinting hook: colour may key on participant mood band (and, once P10b lands, an active
  world-event span — wire the seam now, no-op until spans exist).
- Confirm the day-summary narrator (`llm-narrator.md`) is retained and untouched; document it as
  set-piece #1. (Decision-moment framing and quest-climax dramatisation are set-pieces #2/#3 —
  seams only here, no new LLM calls.)
- Coverage + determinism tests.

**Out of scope:**
- The six-outcome `SocialEvent` *emission* and pressure trigger (P10c) — this plan authors the
  social *pools* keyed by the six outcomes, but escalation still emits the old shape until P10c.
- World-event span START/END colour (P10b consumes the colour hook).
- NPC pools (P10d).
- Any new LLM call. Decision-moment / quest-climax LLM set-pieces are future work; only the seam
  is acknowledged.

## Implements

- `specs/behaviors/narrative-voice.md` — the whole spec (grammar, two-tier boundary, determinism).
- `specs/behaviors/event-bus.md` — `renderedText` is grammar-composed, never LLM-sourced.
- `specs/behaviors/llm-narrator.md` — day summary retained as a set-piece (no code change beyond
  confirming the narrator is not deleted).
- `specs/behaviors/social-system.md` §3, §6 — micro-event and encounter text via the grammar.

## Approach

### 1. Grammar primitives (`packages/core/src/events/eventBus.ts`)

```typescript
type Beat = string;                              // may carry {slots}
const BEAT_POOLS: Record<EventFamilyKey, Beat[]> // keyed by `${kind}:${subtype}`
const COLOUR_POOLS: Record<string, Beat[]>       // keyed by subtype | moodBand | spanType
function compose(subject: string, familyKey: string, ctx: SimulationContext,
                 opts?: { colourKey?: string; colourChance?: number }): string
```

- `compose` picks a beat via `ctx.rng`, optionally appends a colour (default ~60% chance via
  `ctx.rng`), interpolates slots, asserts no `{` remains.
- `renderText` becomes a thin dispatcher: resolve subject + family key per event, call `compose`.

### 2. Author pools

Port the existing one-liners into ≥ 3-variant beat pools; add colour pools. Social pools are
keyed by the six outcomes (`BANTER`…`ESTRANGEMENT`). Micro-events reuse the
`activitySystem.ts` `MICRO_TEMPLATES` as their beat pool (the reference quality bar).

### 3. Set-piece boundary

No new LLM code. Add a `SET_PIECE` doc-comment enumerating the three set-pieces and asserting (in
a test) that `packages/core/src/events/` imports no Anthropic SDK / fetch.

### 4. Tests (TDD)

- Coverage: every `(kind, subtype)` in the event union has a beat pool of ≥ 3 (table-driven).
- No-slot: 1000-seed run → no rendered line contains `{`.
- Determinism: same seed → identical feed text (byte-for-byte).
- Variety: same subtype twice in a seeded run → not always identical.
- Purity: grep test — no LLM/network import under `packages/core/src/events/`.

## Validation

- [x] Every `(kind, subtype)` reaching the feed has ≥ 3 beat variants (per-family variety tests in `narrative-voice.test.ts`). Exemptions documented in Notes.
- [x] No rendered line contains an unfilled slot token (slot-sweep test across all slot-bearing families).
- [x] Fixed-seed run reproduces the full feed text byte-for-byte (replay test).
- [x] Two same-subtype events in one run are not always identical text (variety ≥ 3).
- [x] No module under `packages/core/src/events/` imports an LLM SDK or issues a network call (purity test).
- [x] Day-summary narrator untouched; core `llm-narrator.test.ts` passes. (Playwright `narrator.spec.ts` not re-run this session — no narrator/client code changed.)
- [x] `tsc --noEmit` passes with zero errors. `svelte-check` not gating — no Svelte files changed.
- [x] All existing Vitest tests pass — 465/465 across 36 files, zero regressions.

## Risks / unknowns

- **Snapshot churn** — existing tests that assert exact `renderedText` strings will break when
  one-liners become pools. Audit and convert those to structural assertions (kind/subtype/slots
  filled) before swapping, per the probability-shift-not-outcome testing rule.
- **Colour-on-mood seam** — reading participant mood band inside `renderText` needs the event to
  carry or resolve mood; keep colour optional so absence degrades gracefully.

## Notes

_Implementation complete (in-progress pending closeout commit). Grammar engine (`pick`/`fill`/
`compose`, `BEAT_POOLS`, `COLOUR_POOLS`) added to `eventBus.ts`; `renderText` is now a thin
dispatcher routing every family through `compose` with a deterministic fallback. 12 tests in
`tests/narrative-voice.test.ts`. tsc clean; 465/465 vitest green._

Three scoping decisions made during implementation (deviations from the plan's literal text,
all spec-faithful — the narrative-voice coverage rule is scoped to subtypes that *reach the
feed*):

1. **Social pools authored for the current 4-outcome set** (`POSITIVE_CHAT`, `ARGUMENT`,
   `BREAKTHROUGH`, `SILENT_DISTANCE`), not the future 6-outcome grid. The 6-outcome social
   subtypes (`BANTER`/`SOLIDARITY`/`ESTRANGEMENT`) are not yet emittable — authoring/testing
   their pools belongs to **p10c**, which changes `SocialEventInput` and emission. Adding the
   two new outcome pools there is a one-line-per-pool extension.
2. **`MICRO_EVENT` left as-is (single line).** `renderMicroTemplate`/`MICRO_TEMPLATES` in
   `activitySystem.ts` are currently **dead code** — `MICRO_EVENT` is never emitted (only
   `ACTIVITY_CHANGED` reaches the feed, and it got the grammar treatment). Wiring micro-events
   through the grammar requires first emitting them — deferred (see Follow-ups).
3. **Region attribution dropped from WORLD line text.** The old code appended ` in <regionId>`
   (raw id) to world lines; the grammar lines are self-contained. `regionId` remains on the
   event object for the UI. Scenario/system announcements (`SCENARIO_*`, `INTERNAL_ERROR`) and
   the diagnostic `INTERNAL_ERROR` line stay fixed by design (not pooled flavour).

## Follow-ups

- **Deferred to plan p10c:** author the two new social-outcome beat pools (`SOLIDARITY`,
  `ESTRANGEMENT`; split `POSITIVE_CHAT`→`BANTER`/`SOLIDARITY`) when emission switches to the
  6-outcome grid.
- **Tracked (micro-events):** wire `MICRO_EVENT` emission + route the existing `MICRO_TEMPLATES`
  through the grammar (currently dead code in `activitySystem.ts`). Candidate for a small
  activity-system follow-up plan or folding into p10c.
- **Optional:** restore region attribution to world-event lines as a colour fragment once
  region *names* (not ids) are conveniently resolvable in `renderText`.

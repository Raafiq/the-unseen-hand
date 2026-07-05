---
status: done
depends: [p15b-cycle-narrative-engine]
specs:
  - specs/behaviors/llm-narrator.md
  - specs/behaviors/cycle-narrative.md
  - specs/behaviors/narrative-voice.md
issues: []
---

# Plan: P15c — Cycle LLM tier (per-character chapters + overview)

> Layers the LLM set-piece onto the deterministic chapters from P15b. Retargets the former
> end-of-day summary into a **per-cycle** batch: one overview prompt + one chapter prompt per
> eventful character, fired at each cycle boundary. Fully additive and degrades to the template
> tier — no key, an error, or a timeout leaves a coherent read.

## Scope

**In scope:**
- **Retarget the narrator** (`apps/game-client/src/lib/narrator.ts` → cycle-aware, or fold into
  `cycleNarrative.ts`): fire on the cycle digest returned by `PROCEED`, not on the day tick.
- **Batched prompts**: one **cycle-overview** prompt + one **per-character chapter** prompt per
  adventurer with meaningful cycle events. At most `rosterSize + 1` calls per `PROCEED`.
- **Prompt shape**: reuse the established narrator voice/system prompt; user prompt carries that
  character's cycle events (`[{type, text, involved}]`), personality axes, mood, key relationships.
- **Replace-on-arrival**: the LLM passage replaces that character's (or the overview's) template
  passage in `cycleChapters` when it resolves; until then the template passage shows.
- **Degraded mode / errors / timeout**: no key → template only, no error surfaced; API error or
  >10s timeout → template passage remains; never blocks `PROCEED`.

**Out of scope:**
- The reader UI (P15d) — this plan only feeds `cycleChapters`.
- Any change to the deterministic replay record (LLM output stays outside it).

## Implements

- `specs/behaviors/llm-narrator.md` — the per-cycle trigger, prompt shape, degraded mode, error/
  timeout handling, and token budget (now applied per cycle).
- `specs/behaviors/cycle-narrative.md` — the LLM tier and its replace-on-arrival + determinism-
  boundary rules.
- `specs/behaviors/narrative-voice.md` — the cycle set-piece (bounded batch, not per event).

## Approach

Because the world is halted between cycles, the async calls have a natural home: nothing is
ticking while they're in flight, so the player reads the template passages immediately and each
LLM passage swaps in when it lands, with no simulation coupling. The batch is bounded by roster
size at a player-paced boundary — the exact property that makes this affordable where the
rejected per-event call was not. Reuse of the existing narrator prompt/voice keeps the LLM layer a
thin retarget rather than a new subsystem.

## Validation

- [x] With `CLAUDE_API_KEY` set: after a `PROCEED`, each eventful character's template passage is
      replaced by an LLM passage once it resolves; the overview likewise. *(e2e `narrator.spec.ts`:
      mocked API, asserts both `.cycle-overview` and `.chapter-prose` swap to LLM text in place.)*
- [x] Without a key: chapters are template-only, no error, no placeholder (identical to P15b output).
      *(`enrichCycleReads` no-ops without a key — `cycleNarrator.test.ts`; the keyless cycle-reader
      e2e run stays template-only.)*
- [x] API error / >10s timeout: the template passage remains; `PROCEED` never blocks.
      *(`cycleNarrator.test.ts` "keeps the template passage on API error"; `callNarrator` returns null,
      no handler fires; enrichment is fire-and-forget, never awaited in `proceed()`.)*
- [x] Calls are batched: ≤ `rosterSize + 1` per `PROCEED` (assert call count), never per event.
      *(`cycleNarrator.test.ts` "batches at most rosterSize + 1 calls".)*
- [x] A replay with the API absent is mechanically identical to one with it present (only prose
      artifacts differ). *(`cycleNarrator.test.ts` "never mutates the simulation context"; LLM output
      only patches view state via `patchCycleReads`, never `ctx`/`eventLog`.)*
- [x] `pnpm --filter @ugs/game-client check` green. *(0 errors / 0 warnings.)*

## Risks / unknowns

- Latency of `rosterSize` parallel calls at a boundary — confirm concurrency/rate-limit handling is
  acceptable; consider a cap or sequential fallback if a large roster stalls.
- Model/token budget per chapter vs. the old single day summary — validate cost against the
  ~800–1500 token/day baseline now that it is per character per cycle.

## Notes

Landed as a thin retarget of the day-summary narrator onto the per-cycle boundary, kept strictly
additive over the P15b template tier.

- **Core (pure prompt builders).** `events/LLMNarrator.ts` gained `buildCycleOverviewPrompt` and
  `buildCycleChapterPrompt` (exported from `index.ts`), sharing a `NARRATOR_VOICE` constant with the
  retained `buildNarratorPrompt`. The chapter prompt carries the character context the day summary
  lacked: compact personality axes, mood + band label (`moodThresholdLabel`), and top-3 key
  relationships. Covered by new `describe` blocks in `tests/llm-narrator.test.ts`.
- **Low-level client.** `lib/narrator.ts` was refactored to a reusable `callNarrator(prompt, apiKey)`
  + `resolveNarratorApiKey()`; the dead day-path (`fetchDaySummary`) was **removed** (nothing
  rendered `daySummaries`).
- **LLM tier.** New `lib/cycleNarrator.ts`: `enrichCycleReads(reads, ctx, handlers)` fires the bounded
  batch (one overview + one per eventful chapter, ≤ `rosterSize + 1`), fire-and-forget, degrade-safe
  (no key → no-op); pure `patchCycleReads(history, fromTick, patch)` does the replace-in-place. It
  selects the **same** events the template chapter uses via `chapterEvents` (renamed/exported from
  the private `cycleEventsFor`) plus a new `cycleOverviewEvents`, so prompt and template can't disagree
  about the cycle.
- **Store wiring.** `proceed()` records the template reads synchronously, then fires enrichment; the
  `onOverview`/`onChapter` handlers call `applyCycleEnrichment` → `patchCycleReads`, reassigning
  `cycleReadsHistory` (and keeping the `cycleChapters` pointer synced) so Svelte re-renders prose in
  place. The keys the reader uses (`digest.fromTick`, `ch.actorId`) stay stable ⇒ no reflow. The
  day-narrator `loop.register` block and the `daySummaries` store field were deleted.
- **e2e.** `narrator.spec.ts` re-enabled and retargeted at `.cycle-overview` + `.chapter-prose`,
  distinguishing the overview vs chapter prompt by the request body's system text and asserting each
  LLM passage replaces its template.

**Guardrails at closeout:** core `tsc` clean; core `test` 642 pass; game-client `check` 0/0; game-client
`vitest` 21 pass (9 new in `cycleNarrator.test.ts`); e2e **23 pass / 6 skip** (narrator moved
skip→pass).

**Drive-by fix (bd05f37 fallout).** `cycle-reader.spec.ts` "no placeholder" test hardcoded *Day 0 ·
Night* as the quiet cycle, but the same-activity re-draw fix (`bd05f37`) made it eventful — Reiko now
gets a **second** organic `RELATIONSHIP:KINDNESS` at t19 (distinct id from the t10 one, so not a
window-boundary double-count). Retargeted the test to *Day 1 · Afternoon*, the first genuinely quiet
cycle for the lone adventurer. This was a pre-existing failure on `main`, not introduced here.

## Follow-ups

- **Concurrency cap (plan risk, still open).** All chapter calls fire in parallel; fine at scenario-1
  roster size but a large roster could burst. If a bigger roster lands, add a small concurrency cap or
  sequential fallback in `enrichCycleReads`.
- **Token/cost at scale (plan risk, still open).** Per-chapter Haiku calls at `MAX_TOKENS = 200`; the
  per-cycle-per-character batch is inherently more calls than the old single day summary. Validate real
  cost once multi-adventurer play is live.
- **Multi-adventurer POV not live-exercised.** Shared-encounter chapters / two-POV overview are covered
  only by unit fixtures + the batching test; scenario-1 is single-adventurer. Same gap flagged in the
  handoff — worth a multi-adventurer scenario for both template and LLM tiers.
- **Structured `involved` field.** The chapter prompt leans on `renderedText` (which already names
  participants) rather than a separate `{type, text, involved}` involved list. Adequate now; revisit if
  the narrator needs explicit co-participant ids.

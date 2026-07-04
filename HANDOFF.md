# Handoff — Phase 15 tail: p15c (LLM tier) and p15e (app-shell Proceed)

Next session: **pick up p15c or p15e** — the last two plans in Phase 15. Both are ready
(unblocked by p15d). p15b and p15d are DONE. Neither remaining plan unblocks anything
further; they are independent, so either order works.

## Current state

- **p15a shipped & committed** (`6215ea8`): world clock + `PROCEED` turn-gate.
- **p15b shipped & committed** (`9532f15` + `5923644`): cycle narrative engine (template tier)
  + game-client vitest harness.
- **p15d DONE — NOT committed** (this session, in the working tree): the **Cycle Reader** UI.
  `plans/p15d-cycle-reader-ui.md` is `status: done` with Notes/Follow-ups filled. What changed:
  - **Reader** (`apps/game-client/src/lib/components/EventFeed.svelte`, name kept): rewritten into
    the two-layer reader — a stack of per-cycle **spreads** (header + overview + living-first
    **chapter cards** with co-participant initials), each with a **Raw log** drill-down (shared
    kind-filter bar + chronological rows, CombatReplay preserved). Pure view over the store.
  - **Interim advance = PROCEED brought forward** (user's chosen fork over keeping the real-time
    clock): `App.svelte` dropped `loop.start()` + the speed buttons; added a single **Proceed**
    button → `simulationStore.proceed()`. Top-bar clock now reads "Day N · Cycle".
  - **Store** (`simulationStore.svelte.ts`): added `lastCycleDigest`, `cycleReadsHistory`,
    `chapterFocus` + `proceed()` / `focusChapter()`; `recordCycleReads` now records all three.
  - **Composer**: `cycleNarrative.ts` gained `chapterCoParticipants` (single-sources the co-participant
    initials with the chapter's cycle-window + significance).
  - **E2E migrated** to the Proceed model (removing the real-time clock broke every speed-driven
    test): `smoke`, `bot-player`, `thought-surfaces`, `relationship-drivers` reworked; new
    `cycle-reader.spec.ts`; `narrator.spec` **skipped** (its `.day-summary` surface → p15c overview).
- **Guardrail baseline (re-confirm before editing):** core built & clean; game-client `check` 0/0;
  vitest **12/12**; e2e **22 pass / 7 skipped** (6 flag-skips + narrator).
- **Uncommitted, pre-existing:** the `packages/core/CLAUDE.md` `tsc`-scope note (since p15a). Fold
  into a commit or leave.

## Working tree (uncommitted — user commits when ready)

```
M HANDOFF.md
M apps/game-client/src/App.svelte
M apps/game-client/src/lib/components/EventFeed.svelte
M apps/game-client/src/lib/cycleNarrative.ts
M apps/game-client/src/lib/simulationStore.svelte.ts
M apps/game-client/tests/{bot-player,narrator,relationship-drivers,smoke,thought-surfaces}.spec.ts
M plans/p15d-cycle-reader-ui.md
?? apps/game-client/tests/cycle-reader.spec.ts
```

## Next steps (in order)

1. `& "C:\Users\mdraa\.claude\skills\specops\scripts\specops" next` (from repo root) — confirm
   p15c + p15e ready.
2. Decide p15c vs p15e (ask the user; they are independent). Read that plan + its spec fully.
3. Mark it `in-progress`; invoke **tdd**; build; run `check` + vitest + `test:e2e`; **verify**;
   closeout (flip to `done`, fill Notes/Follow-ups). Do NOT auto-commit.

### If p15c (LLM cycle tier)
- Spec: `specs/behaviors/cycle-narrative.md` (LLM tier) + `narrative-voice.md` (new set-piece).
- Swap the LLM passage into the **keyed** chapter card (`data-chapter-actor` / `{#each … (ch.actorId)}`)
  so it replaces in place without reflow — the p15d structural hook the "replace-in-place" bullet
  points at (`plans/p15d-cycle-reader-ui.md:63`).
- Re-home the day-summary narrator as the LLM **cycle overview**; then re-enable `narrator.spec`
  retargeted at `.cycle-overview` (it is `test.skip`'d with that note now).
- `simulationStore.daySummaries` + `fetchDaySummary` are currently **dead** — repurpose or replace.

### If p15e (app-shell Proceed finalisation)
- Spec: `specs/screens/app-shell.md` (top bar) + `behaviors/world-clock.md` + `decision-moments.md`.
- Delete the deprecated speed API entirely: `SimulationLoop` + `WorldClock` `start/stop/pause/resume/
  setSpeed` shims (grep `removed in p15e`) and the now-vestigial `simulationStore.speed` /
  `speedBeforePause` / `setSpeed`. p15d already removed the speed *UI* and brought PROCEED forward, so
  this is mostly the engine-side cleanup + final top-bar polish + surfacing decision moments **at the
  cycle boundary** (they don't gate PROCEED).

## Decisions & rationale (locked; do not relitigate — user signed off 2026-07-04)

- **Turn-based Proceed, Morning/Afternoon/Night cycles, hybrid LLM+template reads, feed kept as
  raw-log drill-down.** Design forks locked in the Lavish session; rationale in memory
  `project-events-cycle-redesign` and `.lavish/*.html`.
- **p15d interim advance:** the user chose **"bring PROCEED forward"** (halt the auto-clock, add a
  temporary Proceed button) over keeping the real-time clock or a test-only seam — so the reader is
  coherent (halts between cycles, newest-is-home) and e2e drives a real button. p15e finishes the job.
- **Composition/reader is a pure view** — never mutates `eventLog` or sim state, no `packages/core`
  network call; determinism via the p15b derived stream, never `ctx.rng`.

## Gotchas & dead ends

- **Keep `@ugs/core` built** before game-client vitest — it resolves `@ugs/core` through `dist`, not
  `src` (`apps/game-client/CLAUDE.md`). Rebuilt this session for the `Cycle`/`CycleDigest` exports.
- **`check` is the authority for cross-package type wiring**, not `vitest` (esbuild erases
  `import type`). Run `pnpm --filter @ugs/game-client check`.
- **scenario-1 is single-adventurer** and starts mid-cycle (`START_TICK = 9` → Day 0 · Afternoon).
  Deterministic facts the e2e leans on: first PROCEED already yields Reiko a chapter; Day 0 · Night is
  a quiet (no-card) spread; Quest events appear by ~cycle 3. Multi-adventurer POV (shared-encounter
  chapters / focus) is still not live-exercised — covered only by unit fixtures.
- **Removing the real-time clock breaks any e2e that expected the world to auto-advance** — they must
  click Proceed now. Watch for this if you touch more specs in p15e.
- **Windows shell:** prefer the Bash tool; run `specops` from the **repo root** (it resolves `plans/`
  from cwd) and quote the Windows path. Screenshots: use a throwaway Playwright spec via the harness
  (it owns port 4173) — a hand-started `vite preview` collides.

## Suggested skills

- **specops** — mark the chosen plan in-progress at start; closeout at end. `scripts/specops next|dag`.
- **tdd** — spec Validation = the test list.
- **verify** — drive PROCEED end-to-end and read the composed spread / swapped passage.

## Reference (don't duplicate)

- Locked design + rationale: memory `project-events-cycle-redesign`; `.lavish/*.html`.
- Every plan body has Scope/Implements/Approach/Validation/Risks/Notes — read the plan, not a restatement.

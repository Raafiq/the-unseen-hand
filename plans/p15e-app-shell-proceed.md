---
status: done
depends: [p15a-world-clock-turn-gate, p15d-cycle-reader-ui]
specs:
  - specs/screens/app-shell.md
  - specs/behaviors/decision-moments.md
issues: []
---

# Plan: P15e — App shell Proceed control + boundary decisions

> Closes the redesign at the shell level: the top bar's speed controls become a single **Proceed**
> button, the clock reads "Day N · Cycle", and decision moments surface at the boundary with a
> tick/cycle countdown and no gating. Also removes the now-dead speed/auto-pause machinery that
> P15a left deprecated, leaving the tree at the spec end-state.

## Scope

**In scope:**
- **Top bar rewrite**: replace Pause / 1× / 5× / 20× with one prominent **Proceed** button that
  dispatches `PROCEED` and advances the reader to the new cycle; label names the destination
  ("Proceed to Afternoon", "Proceed to Night", "Proceed to Day {n+1}").
- **Clock display**: "Day {day} · {Morning|Afternoon|Night}" (the cycle just read), replacing the
  "Day 12, 14:00" hour format.
- **Remove the retired speed API + store wiring**: delete `setSpeed/pause/resume/currentSpeed`
  (deprecated in P15a) and the speed store field; **delete the auto-pause / speed-restore logic**
  and update the obsolete guardrail in `apps/game-client/CLAUDE.md` (auto-pause speed restore) so it
  no longer describes a control that exists.
- **Roster-dock wiring**: a dock click focuses that character's chapter in the reader (P15d focus
  API) in addition to opening the character-detail drawer.
- **Decision moments at the boundary**: surface active moments alongside the reads after `PROCEED`;
  they do **not** gate `PROCEED` (proceed-and-let-ride is allowed); show the expiry countdown in
  **ticks / cycles remaining**, not wall-clock time.

**Out of scope:**
- Decision-moment detection/priority/expiry *logic* (unchanged from the existing engine) — this plan
  only changes surfacing timing and the countdown's units/label.
- Reader internals (P15d) and narrative (P15b/P15c).

## Implements

- `specs/screens/app-shell.md` — the Proceed control, cycle clock display, decision-moment boundary
  surfacing + non-gating, data-requirement changes (`lastCycleDigest`, `cycleChapters`, no `speed`),
  and the updated Autonomy principle reference.
- `specs/behaviors/decision-moments.md` — boundary surfacing and the ticks/cycles-remaining countdown
  (the real-time equivalents are removed).

## Approach

This plan is where the deprecated speed shims from P15a finally go, together with the UI that used
them — doing the removal in one plan keeps every intermediate commit green. Decision-moment
surfacing needs almost no engine work: because `PROCEED` computes the whole cycle synchronously and
the UI only re-renders when it returns, moments that arose mid-cycle are *naturally* first seen at
the boundary; the change is presentational (batch them into the boundary view, express the countdown
in cycles/ticks). The dock's chapter-focus reuses P15d's focus API so "select a character to read"
has a single implementation across the dock and the reader.

## Validation

- [x] The top bar shows a single **Proceed** button and no pause/speed controls; its label names the
      next cycle. *(Verified in the shell screenshot: "Proceed to Day 1 ›", no speed row; App.svelte
      `nextLabel`.)*
- [x] Clicking **Proceed** advances the world one cycle and moves the reader to the new spread.
      *(e2e `smoke.spec.ts` "Proceed computes a cycle and renders its spread".)*
- [x] The clock reads "Day N · {Cycle}" and updates each `PROCEED`. *(e2e `smoke.spec.ts` "Proceed
      advances the in-game date across cycles".)*
- [x] With one decision moment active, it appears at the boundary and **Proceed still works** (proceed
      lets it ride toward expiry); the countdown is shown in ticks/cycles, not minutes. *(Code: the
      auto-pause is gone; the right panel surfaces the ChoiceCard naturally at the boundary and
      `proceed()` never checks `pendingDecisions`. `ChoiceCard` now renders "Expires in N ticks ·
      ~M cycles". Asserted by `choice-card.spec.ts` "does not gate Proceed" + "ticks and cycles" — these
      run under the DI feature flag, currently off, so they are **flag-skipped** like the existing
      ChoiceCard tests, not live-green.)*
- [x] A dock click focuses that character's chapter (P15d) and opens the detail drawer. *(e2e
      `cycle-reader.spec.ts` "selecting a roster card focuses that character's chapter"; App.svelte
      dock `onSelect` calls `selectAdventurer` + `focusChapter`.)*
- [x] No references to `setSpeed/pause/resume/currentSpeed`/auto-pause remain in the client; the
      `apps/game-client/CLAUDE.md` auto-pause guardrail is updated. *(grep clean; guardrail rewritten to
      "the world is turn-paced; there is no speed or pause control".)*
- [x] `pnpm --filter @ugs/game-client check`, full `test:e2e`, and `pnpm build` green; screenshots
      confirm the top bar + boundary decision read cleanly. *(check 0/0; e2e 23 pass / 7 skip; build
      green; shell screenshot reads cleanly.)*

## Risks / unknowns

- The pre-existing `choice-card.spec.ts` failure (single-Kara scenario can't produce a PARTY_SELECTION,
  noted in the events-redesign memory) may resurface around decision-moment UI changes — confirm it is
  the same known issue, not a regression from boundary surfacing.
- Auto-pause removal: verify nothing else (e.g. decision-moment arrival) depended on the auto-pause
  behaviour that is being deleted.

## Notes

Because P15d had already brought the top-bar Proceed control, the "Day N · Cycle" clock, and the
dock→chapter-focus wiring forward as an interim, this plan was mostly the *deletion* half: retiring
the deprecated real-time speed machinery P15a left as shims, plus the ChoiceCard countdown units.

- **Engine — speed API fully removed.** `WorldClock.ts` stripped to the turn-paced primitives
  (`worldTime`, `onTick`, `step`); gone: `SpeedMultiplier`, `INTERVAL_MS`, `_speed`,
  `_intervalHandle`, `currentSpeed`, `setSpeed/start/stop/pause/resume`. `SimulationLoop.ts` no longer
  holds a `WorldClock` at all (it was only there to host the shims — `proceed()`/`step()` advance time
  directly via `advanceTime`), and its 5 deprecated shim methods are deleted. `SpeedMultiplier` is no
  longer exported from `index.ts`.
- **Store — speed/auto-pause machinery removed.** Deleted `simulationStore.speed` /
  `speedBeforePause`, the `setSpeed` action, the decision-moment auto-pause in the render observer, and
  the resume-on-`CHOOSE_OPTION` branch in `doDispatch`. The render observer now just mirrors `ctx`;
  decision moments surface at the boundary naturally because the world only advances inside a
  synchronous `proceed()`. The `FEATURES` import (used only by the auto-pause) was dropped.
- **ChoiceCard countdown → ticks / cycles.** The primary expiry now reads "Expires in N ticks ·
  ~M cycles" (8 ticks/cycle) and the secondary chip carries a cycles tooltip — no wall-clock units, per
  `decision-moments.md §"Expiry windows"`.
- **Guardrail.** `apps/game-client/CLAUDE.md`'s "auto-pause must save and restore speed" rule was
  replaced with "the world is turn-paced; there is no speed or pause control" (advance only via
  `proceed()`; moments do not gate `PROCEED`).
- **Tests.** Core `world-clock.test.ts` / `simulation-loop.test.ts` had their deprecated-API tests
  removed (pause/resume, setSpeed/currentSpeed, start/stop) — core drops from 642 → **640** with no
  loss of real coverage. `choice-card.spec.ts` gained a non-gating boundary test and a ticks/cycles
  countdown assertion (both DI-flag-gated).

**Guardrails at closeout:** core `tsc` clean; core `test` **640 pass**; game-client `check` **0/0**;
game-client `vitest` **21 pass**; `test:e2e` **23 pass / 7 skip**; `pnpm build` green. Shell screenshot
confirms a clean top bar (single Proceed button, no speed row, no layout gap).

## Follow-ups

- **Decision-moment boundary UI is not live-exercised.** The ChoiceCard, DI meter, and decision
  moments are behind `FEATURES.divineIntervention` (currently `false`), so the two boundary/countdown
  e2e assertions are flag-skipped. They will run when DI re-enables; until then the boundary-surfacing
  and non-gating behavior is covered only by code review + the injected `?e2e=decision` seam. Flagged
  as a plan risk and confirmed to still be the known flag-gated situation, not a regression.
- **Top-bar clock vs. spread header wording.** The clock shows `worldTime.cycle` (the cycle the world
  is *poised on* — e.g. "Day 0 · Night") while the newest spread header shows the cycle *just read*
  ("Day 0 · Afternoon"). This follows `app-shell.md §"Top bar"`'s explicit `Day {worldTime.day} ·
  {cycle}` formula, but that line also glosses it as "the cycle just read", which reads as a mild
  self-contradiction. Left as-is (formula is authoritative and the clock must visibly advance each
  `PROCEED`, which "just read" would not on the mid-cycle start); worth a one-line spec clarification.
- **`WorldClock` is now used only by its own test.** `SimulationLoop` advances time itself, so
  `WorldClock` is a retained primitive (`step`/`onTick`/`worldTime`) exercised only by
  `world-clock.test.ts`. Kept because `world-clock.md` lists it as a module; a future cleanup could
  fold it into `SimulationLoop` or drop it if the spec agrees.

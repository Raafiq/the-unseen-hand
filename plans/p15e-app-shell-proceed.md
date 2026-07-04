---
status: planned
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

- [ ] The top bar shows a single **Proceed** button and no pause/speed controls; its label names the
      next cycle. (e2e)
- [ ] Clicking **Proceed** advances the world one cycle and moves the reader to the new spread. (e2e)
- [ ] The clock reads "Day N · {Cycle}" and updates each `PROCEED`. (e2e)
- [ ] With one decision moment active, it appears at the boundary and **Proceed still works** (proceed
      lets it ride toward expiry); the countdown is shown in ticks/cycles, not minutes. (e2e)
- [ ] A dock click focuses that character's chapter (P15d) and opens the detail drawer. (e2e)
- [ ] No references to `setSpeed/pause/resume/currentSpeed`/auto-pause remain in the client; the
      `apps/game-client/CLAUDE.md` auto-pause guardrail is updated/removed. (grep + check)
- [ ] `pnpm --filter @ugs/game-client check`, full `test:e2e`, and `pnpm build` green; screenshots
      confirm the top bar + boundary decision read cleanly (pixel check).

## Risks / unknowns

- The pre-existing `choice-card.spec.ts` failure (single-Kara scenario can't produce a PARTY_SELECTION,
  noted in the events-redesign memory) may resurface around decision-moment UI changes — confirm it is
  the same known issue, not a regression from boundary surfacing.
- Auto-pause removal: verify nothing else (e.g. decision-moment arrival) depended on the auto-pause
  behaviour that is being deleted.

## Notes

(populated at closeout)

## Follow-ups

(populated at closeout)

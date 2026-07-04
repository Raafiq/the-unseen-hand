---
status: done
depends: [p9a-activity-system]
specs:
  - specs/behaviors/social-system.md
issues: []
---

# Plan: P9d — Activity continuation (same-activity re-draw)

## Scope

Fix the bug where an activity that re-draws to the *same* `ActivityId` on exit emits a
spurious `ACTIVITY_CHANGED` event, narrating a broken "finishes X and begins X" (or the
nonsensical "wakes from sleep and begins sleep") for what is one continuous activity. Treat
a same-activity re-draw as a **continuation**: extend the duration, keep `enteredAt`, emit
no event, and skip the on-exit side effects.

**In scope:**
- `activitySubscriber` exit branch: detect `nextActivity === currActivity` and continue instead of change.
- Suppress on-exit transient factors (HANGOVER/WELL_RESTED) and the deep-night `SLEEP_DEPRIVED`
  penalty on a continuation — they model a *completed*/*switched-from* activity.

**Out of scope:**
- Any change to the weighted draw itself (it may legitimately return the same activity; we
  collapse the *presentation*, not the draw).
- UI changes — the reader already renders whatever events exist; fewer events is the fix.

## Implements

- `specs/behaviors/social-system.md` §2 (Activity duration) — "A re-draw that lands on the
  current activity is a continuation, not a change" + its Validation criterion.

## Approach

In `activitySubscriber` (`packages/core/src/events/activitySystem.ts`), inside the
`exitEarly || exitOnDuration` branch, draw `nextActivity` **before** applying any exit
side effects, then:

- If `nextActivity === currActivity`: reschedule (`scheduledExitAt = scheduleDuration(...)`,
  refresh `nextMicroEventAt`), **preserve `enteredAt`**, emit no event, and `continue`. Do
  not apply HANGOVER/WELL_RESTED or `SLEEP_DEPRIVED`.
- Else (genuine switch): the existing path — apply transient factors, sleep-deprivation
  check, reset `enteredAt = now`, emit `ACTIVITY_CHANGED`.

The draw must move above the transient-factor application so a continuation never triggers
them; the RNG draw order (draw next activity, then decide) is unchanged, preserving the
deterministic stream for switches.

## Validation

- [x] Unit (through the subscriber): a context rigged so the exit re-draw returns the current
      activity emits **zero** `ACTIVITY_CHANGED` events for that tick; `enteredAt` unchanged;
      `scheduledExitAt` advanced.
- [x] Continuation of DRINKING does not add a HANGOVER factor; continuation of RESTING (CONTENT)
      does not add WELL_RESTED; continuation of a non-sleep activity at `hour ≤ 4` adds no
      `SLEEP_DEPRIVED`.
- [x] A genuine switch (re-draw ≠ current) still emits `ACTIVITY_CHANGED` and still applies the
      relevant on-exit factors (regression guard).
- [x] Repro harness: a 120-cycle run produces **no** `ACTIVITY_CHANGED` event whose
      `prevActivity === activity` (was 20 before the fix; now 0).
- [x] `pnpm --filter @ugs/core test` green (634 passed); `tsc --noEmit` clean; `svelte-check` 0/0.

## Risks / unknowns

- **Mood-threshold exits:** if a mood-forced exit re-draws the same activity, it collapses to a
  continuation. Acceptable — the weighted draw rarely returns the same activity in the mood band
  that forced the exit, and the check re-runs next tick; the continuation is still truthful.
- **Sleep continuity at night:** SLEEPING re-drawing SLEEPING (very likely under the ×12 night
  weight) now extends one sleep span instead of emitting 2–3 "wake and begin sleep" beats per
  night. This is the intended improvement, but changes the event count of a typical night.

## Notes

- Implemented as a reorder in `activitySubscriber`'s exit branch: draw `nextActivity` first,
  branch to a continuation (extend duration, keep `enteredAt`, no emit, no factors) when it
  equals the current activity, else the existing switch path. On-exit factor application moved
  below the draw and now keys off `prevActivity` (was `currActivity` — same value, clearer intent).
- Determinism: the switch path's RNG consumption order is unchanged (the transient-factor helpers
  don't touch `ctx.rng`). A continuation now consumes *fewer* draws than the old spurious-change
  path (it skips `emitEvent`, which pulls from `ctx.rng` for grammar selection), so the downstream
  stream shifts — reproducible per seed, but it reshuffled unrelated seeded outcomes.
- One fallout from that shift: `quest-bracket-invariant.test.ts`'s "not vacuous" precondition
  (`starts > 2` over 30 days) landed on exactly 2 for the scenario-1 seed. Quest flow is healthy
  (60d→3, 90d→5 starts); the 30-day window was just boundary-brittle. Extended the run to 90 days
  (2160 ticks) so the guard clears with margin instead of weakening it.
- The most visible win is nightly sleep: SLEEPING re-drawing SLEEPING under the ×12 night weight
  used to emit 2–3 "wakes from sleep and begins sleep" beats per night; it's now one continuous
  sleep span.

## Follow-ups

**None.** The behavior is specified (`social-system.md` §2 + Validation), covered by unit tests
and a full-loop repro guard, and no deferrals were made.

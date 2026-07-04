---
status: planned
depends: [p15a-world-clock-turn-gate, p15b-cycle-narrative-engine]
specs:
  - specs/screens/event-feed.md
issues: []
---

# Plan: P15d — Cycle Reader UI

> Turns the live one-liner feed into the **Cycle Reader**: the just-completed cycle as a spread
> (overview + per-character chapter cards), with the terse chronological feed preserved as a
> one-toggle **raw-log** drill-down. This is the surface the player actually asked to revise.

## Scope

**In scope:**
- **Rewrite `EventFeed.svelte`** (kept named per the spec-file mapping) into the two-layer reader:
  - **Spread (primary)**: cycle header ("Day N · Cycle"), the cycle overview block (omitted if
    none), and one **chapter card** per character with a chapter — portrait + name + chapter prose,
    living adventurers first; no card for characters with no meaningful cycle events.
  - **Raw log (secondary)**: a "Raw log" toggle revealing the chronological one-line-per-event view
    for that cycle (time label, `kind` type-tag pill, `renderedText`, involved initials), ordered
    oldest→newest, dropping `hiddenEventKinds`.
- **Filtering** moves to the raw log (All / Social / Combat / Quest / Lifecycle / World / Divine /
  Thought), same toggle semantics as before, affecting only raw-log rows.
- **Prior-cycle scrollback**: earlier cycles remain scrollable above the current spread, each as
  its own overview + chapters; virtualize spreads and raw-log rows.
- **Chapter focus**: clicking a roster-dock card (P15e wires the dock; this plan exposes the focus
  API) or a co-participant initial scrolls to and highlights that character's chapter card.
- **Replace-in-place**: an LLM chapter passage (from P15c) swaps into its card without reflowing the
  whole spread.

**Out of scope:**
- Top-bar Proceed control, clock format, and decision-moment timing (P15e).
- Chapter composition and LLM (P15b/P15c) — this plan only renders `cycleChapters`.

## Implements

- `specs/screens/event-feed.md` in full — the spread, chapter cards, raw-log drill-down + filtering,
  prior-cycle history, virtualization, chapter focus, and the "prose on top, ledger beneath" /
  "newest cycle is home" local principles.

## Approach

The reader is a pure view over `cycleChapters` (P15b/P15c) plus the `eventLog` slice for the raw
log, so it holds no narrative logic — it renders what the engine composed. Keeping the raw log a
sibling toggle rather than a separate screen preserves the audit trail one interaction away while
making the reads the resting view. Virtualization is retained from the old feed for the raw log and
extended to the spread history. Chapter-focus is exposed as a small imperative API the dock (P15e)
and co-participant initials both call, so "select a character to read" has one implementation.

## Validation

- [ ] After a `PROCEED`, the spread shows the cycle overview (when present) + one chapter card per
      eventful character; a character with no cycle events has no card. (e2e)
- [ ] Toggling "Raw log" reveals the chronological rows for that cycle; type filters hide/show rows
      by `kind`; "All" resets. (e2e)
- [ ] Focusing a chapter (via the dock-focus API / a co-participant initial) scrolls to and
      highlights that character's card. (e2e)
- [ ] Scrolling back re-renders prior cycles' spreads; virtualization keeps DOM bounded on a long
      run. (e2e + perf spot-check)
- [ ] An LLM passage replaces its template passage in-place without reflowing the spread. (e2e with
      key, or a stubbed passage)
- [ ] `pnpm --filter @ugs/game-client check` and `test:e2e` green; screenshots confirm the spread and
      raw-log read cleanly (pixel check).

## Risks / unknowns

- The app-shell still renders speed controls until P15e — during this plan the reader may be driven
  by a temporary "Proceed" affordance or a test harness `PROCEED` dispatch; confirm an interim way to
  advance for e2e without the final top bar.
- Chapter-card layout at large rosters (many cards) — confirm the spread scrolls/columns gracefully.

## Notes

(populated at closeout)

## Follow-ups

(populated at closeout)

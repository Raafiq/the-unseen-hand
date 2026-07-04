---
status: done
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

- [x] After a `PROCEED`, the spread shows the cycle overview (when present) + one chapter card per
      eventful character; a character with no cycle events has no card. (e2e — `cycle-reader.spec.ts`
      tests 1 & 2: Day 0 · Afternoon yields Reiko's chapter; Day 0 · Night is a `spread-quiet`
      overview with zero cards.)
- [x] Toggling "Raw log" reveals the chronological rows for that cycle; type filters hide/show rows
      by `kind`; "All" resets. (e2e — `cycle-reader.spec.ts` test 3.)
- [x] Focusing a chapter (via the dock-focus API / a co-participant initial) scrolls to and
      highlights that character's card. (e2e — dock path in `cycle-reader.spec.ts` test 4; the
      co-participant-initial path shares the same `focusChapter` action. Adventurer↔adventurer POV
      focus isn't live-exercised — scenario-1 is single-adventurer — see Follow-ups.)
- [x] Scrolling back re-renders prior cycles' spreads; virtualization keeps DOM bounded on a long
      run. (e2e — `cycle-reader.spec.ts` test 5 stacks 3 spreads in order. DOM bound is a windowed
      cap `MAX_SPREADS = 40`; raw-log rows are per-cycle (≤ a cycle's events) and only in the DOM
      when a toggle is open — see Notes.)
- [~] An LLM passage replaces its template passage in-place without reflowing the spread. Structure
      is ready — chapter cards are keyed by `actorId`, so a text swap replaces in place — but there
      is no LLM tier yet to swap, so this is **verified structurally, exercised live in p15c**.
- [x] `pnpm --filter @ugs/game-client check` and `test:e2e` green; screenshots confirm the spread and
      raw-log read cleanly (pixel check — reviewed the spread, the focus highlight + drawer, and an
      open raw log).

## Risks / unknowns

- The app-shell still renders speed controls until P15e — during this plan the reader may be driven
  by a temporary "Proceed" affordance or a test harness `PROCEED` dispatch; confirm an interim way to
  advance for e2e without the final top bar.
- Chapter-card layout at large rosters (many cards) — confirm the spread scrolls/columns gracefully.

## Notes

- **Reader** (`components/EventFeed.svelte`, name kept per the spec-file mapping): a pure view over
  `cycleReadsHistory` + the event log. Renders a stack of `.cycle-spread`s oldest→newest (newest at
  the resting position; a `spreads.length` effect pins scroll to the bottom on each new cycle). Each
  spread = `.spread-header` ("Day N · Cycle"), an optional `.cycle-overview`, living-first
  `.chapter-card`s (portrait + name + prose + co-participant initials), and a per-spread `.raw-log`
  drill-down (shared kind-filter bar, chronological rows, CombatReplay preserved). No narrative logic
  lives here — composition is p15b's.
- **Interim advance = PROCEED brought forward** (the fork the user chose over keeping the real-time
  clock): `App.svelte` drops `loop.start()`/the speed buttons and adds a single **Proceed** button →
  `simulationStore.proceed()` (`loop.proceed()` → `recordCycleReads(digest)`). The top-bar clock now
  reads "Day N · Cycle"; the Proceed label names the next cycle ("Proceed to Night / Day n+1"). p15e
  still owns the *final* top bar (deleting the deprecated speed API entirely + decision-at-boundary),
  but the mechanism is already here.
- **Store**: added `lastCycleDigest`, `cycleReadsHistory` (append-only, the reader's scrollback),
  and `chapterFocus {actorId, seq}` + `focusChapter()`. `recordCycleReads` now sets all three.
  `proceed()` and `focusChapter()` are the new actions. `composeCycleReads`/`cycleChapters` unchanged
  from p15b.
- **Focus is single-sourced**: the roster dock (`App.svelte` `onSelect`) and a chapter's
  co-participant initials both call `focusChapter(id)`; the reader's effect scrolls the newest
  matching card into view and flips `.focused` for 1.6 s. Dock click also opens the detail drawer
  (the two affordances coexist, per app-shell.md).
- **Co-participant helper** added to `cycleNarrative.ts` (`chapterCoParticipants`) so the initials and
  the prose share one cycle-window + significance definition and can't disagree about who was present.
  A co-participant initial routes by actor type (`activateCoParticipant`): an **adventurer** has their
  own chapter → focus it; a **notable NPC** has none → open their townsfolk detail (no dead click).
  Covered by `cycle-reader.spec.ts` (scenario-1's first cycle shares a beat with the smith, Brenna).
- **Virtualization** is a windowed cap (`MAX_SPREADS = 40`) rather than a virtual scroller: prior
  spreads beyond the window scroll off, and raw-log rows are per-cycle (small) and only mounted while
  a toggle is open — so the DOM stays bounded on a long run without a row recycler.
- **E2E migration** (forced by removing the real-time clock): `smoke` (feed→spread/raw-log +
  date-advance, dropped the speed-active test), `bot-player` (Proceed loop instead of 20×),
  `thought-surfaces` (no ⏸ — the world is halted by default), `relationship-drivers` (open the raw
  log to find the line; the `?e2e=drivers` feed event moved to `startTick+1` so it lands in the first
  cycle window — its edge-history entry stays at `startTick` for the drift detector). `narrator.spec`
  **skipped** — the `.day-summary` LLM surface becomes the p15c cycle overview.
- Verified: `check` 0/0, vitest 12/12, e2e **21 pass / 7 skipped** (baseline 6 flag-skips + narrator).
  **Not committed** — left for the user.

## Follow-ups

- **p15c (LLM tier)** and **p15e (app-shell Proceed)** are now unblocked. p15c swaps the LLM passage
  into the keyed chapter card + re-homes the day-summary narrator as the LLM cycle overview (re-enable
  `narrator.spec`, retargeted at `.cycle-overview`). p15e finalises the top bar and deletes the
  deprecated speed API (`SimulationLoop`/`WorldClock` shims, the vestigial `simulationStore.speed`).
- **Adventurer↔adventurer POV focus is not live-exercised** (scenario-1 is single-adventurer), same
  gap p15b flagged for the composer. A multi-adventurer scenario or a p15d fixture would drive the
  shared-encounter focus + the two-POV-cards path.
- **`simulationStore.daySummaries` + `fetchDaySummary` are now dead** (nothing renders them) until
  p15c re-homes the narrator as the LLM overview. Left in place for p15c rather than deleted.
- The core `tsc` guardrail note (`packages/core/CLAUDE.md`, uncommitted since p15a) is still in the
  working tree; fold into a commit or leave.

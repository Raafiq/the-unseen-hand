---
status: planned
depends: [p10a-narrative-voice]
specs:
  - specs/behaviors/world-expansion.md
  - specs/behaviors/event-bus.md
---

# Plan: P10b — World-Event Durations (stateful spans)

> **Phase 10 — Events Redesign** (2 of 4). Promotes weighty world events from instantaneous
> announcements to stateful spans living in the (currently unpopulated) `Region.activeWorldEvents`.

## Scope

Make `STORM`, `PLAGUE`, `MONSTER_SURGE`, and `TRAVELLING_MERCHANT` **spans** with rng-rolled
durations, START/END events, and live presence in `Region.activeWorldEvents`. Keep `RUMOUR` and
`WINDFALL` instant. Wire the consumers that read active spans.

**In scope:**
- `WorldEvent.phase: 'START' | 'END'` (event-bus); START/END emission for spanning subtypes.
- Duration rolls (ticks): STORM 6–18, TRAVELLING_MERCHANT 24–72, MONSTER_SURGE 48–120,
  PLAGUE 72–192 — via `ctx.rng`.
- Span lifecycle in `worldEventSeedingSubscriber`: start (push instance + emit START), live
  (no-op), end (`tick ≥ expiresAt` → remove + emit END). Same-type suppression while live.
- Consumer reads of `region.activeWorldEvents`:
  - quest seeding/difficulty (MONSTER_SURGE ↑ threat; STORM suppresses travel/departures;
    TRAVELLING_MERCHANT enables trade variants),
  - narrative-voice colour tinting (the colour seam from P10a),
  - departure mood-strain input for live PLAGUE.
- START/END grammar lines (beat pools added under P10a's grammar).

**Out of scope:**
- FEUD/FESTIVAL spans — the `phase`/subtype slots exist (event-bus), but feud triggers belong to
  P10c (social) and festival to P10d (town). This plan ships only the world-event spans + the
  shared span lifecycle they can reuse.
- Re-speccing the seeding probability (the ~1/24-per-tick roll is retained as-is).

## Implements

- `specs/behaviors/world-expansion.md` — "Active world events (stateful spans)" section + the
  shared span lifecycle; the weighty-social-spans section's *mechanic* (feud/festival triggers
  are downstream).
- `specs/behaviors/event-bus.md` — `WorldEvent.phase`, spanning-vs-instant rule.

## Approach

### 1. Types & event shape

`WorldEventInstance` already exists (`{type, startedAt, expiresAt}`). Add `phase?` to the
`WorldEvent` emission input. Add a `SPAN_DURATIONS: Record<WorldEventType, [lo, hi] | null>`
(null = instant).

### 2. Lifecycle in `worldEventSeedingSubscriber` (`WorldExpansion.ts`)

- On seed of a spanning type for a region with no live instance of that type: roll duration,
  push instance, emit START.
- Each tick: drop instances where `tick ≥ expiresAt`, emit END for each.
- Instant types: emit single event, no instance.

### 3. Consumers

Add `activeSpans(region)` / `hasActiveSpan(region, type)` helpers; wire the three consumer reads.
Keep effects modest and spec-faithful.

### 4. Tests (TDD)

- STORM seed → one instance, `expiresAt − startedAt ∈ [6,18]`, START emitted.
- Removal + single END on first tick `≥ expiresAt`; no per-tick events while live.
- RUMOUR/WINDFALL → single event, no instance, no phase.
- Same-type suppression while a span is live.
- Duration reproducible under fixed seed.
- Consumer: live MONSTER_SURGE raises measured quest threat; reverts on END.

## Validation

- [ ] STORM span adds one `WorldEventInstance` with duration in [6,18] and emits `phase:'START'`.
- [ ] Span removed and exactly one `phase:'END'` emitted on first tick `≥ expiresAt`; no events while live.
- [ ] RUMOUR/WINDFALL emit a single phase-less event and never enter `activeWorldEvents`.
- [ ] A second STORM for a region with a live STORM is suppressed.
- [ ] Live MONSTER_SURGE raises measured quest threat/difficulty; reverts on END.
- [ ] Span durations reproducible under a fixed seed; no `Math.random()` (grep clean).
- [ ] `tsc --noEmit` and `svelte-check` pass; all Vitest tests pass.

## Risks / unknowns

- **Departure interaction** — PLAGUE as a standing mood-strain input must use the
  probability-shift pathway, not force outcomes (departure testing rule).
- **EventFeed world labels** — `WorldEventType` label `Record` may need START/END affordance so
  the feed reads "A storm rolls in" vs "The storm passes" (grammar handles text; ensure no label
  gap per the EventFeed enum-label rule).

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)

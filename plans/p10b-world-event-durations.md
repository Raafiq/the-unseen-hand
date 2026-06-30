---
status: done
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

- [x] STORM span adds one `WorldEventInstance` with duration in [6,18] and emits `phase:'START'`.
- [x] Span removed and exactly one `phase:'END'` emitted on first tick `≥ expiresAt`; no events while live.
- [x] RUMOUR/WINDFALL emit a single phase-less event and never enter `activeWorldEvents`.
- [x] A second STORM for a region with a live STORM is suppressed.
- [x] Live MONSTER_SURGE raises measured quest threat/difficulty; reverts on END.
- [x] Span durations reproducible under a fixed seed; no `Math.random()` (grep clean).
- [x] `tsc --noEmit` and `svelte-check` pass; all Vitest tests pass.

## Risks / unknowns

- **Departure interaction** — PLAGUE as a standing mood-strain input must use the
  probability-shift pathway, not force outcomes (departure testing rule).
- **EventFeed world labels** — `WorldEventType` label `Record` may need START/END affordance so
  the feed reads "A storm rolls in" vs "The storm passes" (grammar handles text; ensure no label
  gap per the EventFeed enum-label rule).

## Notes

Shipped the shared span lifecycle and all 7 Validation boxes. 15 new tests in
`tests/world-event-durations.test.ts`; full core suite 493 green; `tsc` (core + client)
and `svelte-check` (0/0) clean; no `Math.random()`.

**Design decisions settled during the build:**

- **Region selection (the open decision step 4 flagged).** Each spanning seed attaches to
  a **single rng-picked *unlocked* region** (`pickUnlockedRegion`). Instant types stay
  region-less, as before. Early game this is always THORNVALE; ASHWOOD/STORMPASS join the
  pool as they unlock. Chosen over "all unlocked regions" because the spec phrases the
  lifecycle per-region ("when a spanning event is seeded *for a region*") and same-type
  suppression is per-region — one region per roll keeps spans sparse and legible.
- **END-sweep ordering.** `sweepExpiredSpans` runs unconditionally at the top of
  `worldEventSeedingSubscriber`, *before* the ~1/24 seed-roll early-return, so spans expire
  on every tick rather than only on seeding ticks. (The single biggest trap the handoff
  flagged.)
- **PLAGUE → departure uses the probability-shift pathway**, not a forced outcome:
  `computeDepartureProbability(adv, worldStrain)` adds `PLAGUE_DEPARTURE_STRAIN = 0.05` to
  the probability *value* while a PLAGUE span is live (departure testing rule). Tests assert
  the value rises, not that anyone departs.
- **MONSTER_SURGE → quest threat**: `monsterSurgeThreatBonus(ctx)` adds
  `MONSTER_SURGE_THREAT_BONUS = 2` to each newly-seeded quest's rolled difficulty (clamped
  ≤10) while a surge is live in any unlocked region.
- **Narrative colour tint**: `compose` appends a span-weather fragment
  (`SPAN_COLOUR_POOLS`, `SPAN_TINT_CHANCE = 0.35`) to non-WORLD feed lines while a span is
  live. Critically, the tint branch **only consumes rng when a span is actually live**, so
  spanless feeds (every existing narrative-voice test) are byte-for-byte unchanged.
- **START/END grammar**: `renderText`'s WORLD case keys on `phase`
  (`WORLD:<type>:START` / `:END`); phase-less `WORLD:<type>` pools are retained so the
  existing narrative-voice phase-less WORLD test still resolves.

## Follow-ups

- **Deferred to a later plan — remaining span consumers.** The Scope lists two softer
  consumer reads that are *not* in the Validation boxes and were intentionally not shipped:
  - *STORM suppresses new departures and travel-type quests.* Departure suppression is a
    trivial symmetric negative `worldStrain`; "travel-type quests" has no concept in the
    current `QuestType` enum. Defer until that's wanted.
  - *TRAVELLING_MERCHANT enables trade/restock quest variants.* **Blocked**: `QuestType`
    (`BOUNTY|ESCORT|FETCH|DUNGEON|INVESTIGATION|RESCUE|POLITICAL`) has no trade/restock
    variant — needs a quest-type expansion first.
- **Deferred to p10c/p10d — FEUD/FESTIVAL spans.** The shared lifecycle (`openSpan` /
  `sweepExpiredSpans` / `hasActiveSpan` / `rollSpanDuration` / `SPAN_DURATIONS`) is written
  to be reused. Wiring FEUD requires adding `FEUD`/`FESTIVAL` to the code's `WorldEvent` /
  `WorldEventInput` subtype unions (spec `event-bus.md:132` already lists them — pre-existing
  drift, out of scope here) and a duration entry, then opening a span from
  `resolveEncounter` on ESTRANGEMENT+crisis (p10c follow-up #2).
- **None blocking.** Tree green; p10b done.

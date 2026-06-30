---
status: cancelled
depends: [p9a-activity-system]
specs:
  - specs/behaviors/social-system.md
  - specs/behaviors/relationship-graph.md
  - specs/behaviors/mood-system.md
---

> **CANCELLED — superseded by `p10c-social-pressure` (Phase 10 — Events Redesign).** The
> escalation gate, join/interrupt, group scenes, and six-outcome resolution carry forward into
> p10c, but the memoryless per-tick **probability trigger** in this plan is replaced by the
> **pressure-accumulator + jitter + cooldown** model (locked timing decision, 2026-06-30). Do not
> implement this plan; build p10c instead.

# Plan: P9b — Social Escalation & Outcome Resolution

## Scope

Replace the existing `socialEventSubscriber` (pair-hash, flat 4-outcome model) with the new initiative-based escalation engine and valence × intensity outcome grid.

**In scope:**
- Approach eligibility gate (enemy block, stranger low-prob)
- Approach probability formula: BASE × empathyMult × relationshipMult × compatibilityMult
- Join vs interrupt decision (approacher personality)
- Group scene support (up to 4 participants, single encounter)
- Outcome resolution: valence/intensity computation → 6 outcomes
- BREAKTHROUGH / ESTRANGEMENT threshold gate + crisis bypass
- ESTRANGEMENT 5-day approach cooldown
- Relationship graph deltas (updated to new 6-outcome table)
- Mood factor emission for all 6 outcomes
- Event bus emission for social encounters (typed `SocialEvent` with outcome + participants)
- Removal of `pairHour` hash (old daily gating replaced by per-tick probability)

**Out of scope:**
- LLM-generated event text (P9c — this plan emits placeholder text; P9c replaces it)
- Activity system (P9a)
- UI changes beyond what's already wired to `SocialEvent` in the event feed

## Implements

- `specs/behaviors/social-system.md` §4 (Social escalation trigger), §5 (Social outcome resolution)
- `specs/behaviors/relationship-graph.md` — strength delta table for the 6 new outcomes
- `specs/behaviors/mood-system.md` — 6 new social MoodFactor entries (SOCIAL_BANTER through SOCIAL_ESTRANGEMENT)

## Approach

### 1. Extend types (`packages/core/src/world/types.ts`)

```typescript
type SocialOutcomeType =
  | 'BANTER' | 'SOLIDARITY' | 'BREAKTHROUGH'
  | 'SILENT_DISTANCE' | 'ARGUMENT' | 'ESTRANGEMENT'

interface SocialEvent extends SimulationEvent {
  type: 'SOCIAL'
  participants: AdventurerId[]   // 2–4
  outcome: SocialOutcomeType
  joinType: 'JOIN' | 'INTERRUPT' | 'GROUP'
  crisisFlag?: boolean
  renderedText: string           // placeholder until P9c
}

// Approach cooldown on Adventurer
interface Adventurer {
  // ...existing fields
  approachCooldowns: Map<AdventurerId, number>  // until tick
}
```

### 2. Approach check (`packages/core/src/events/socialResolver.ts`)

Replace the old `socialEventSubscriber` entirely.

```typescript
function checkApproach(
  approacher: Adventurer,
  target: Adventurer,
  edge: RelationshipEdge | undefined,
  ctx: SimulationContext
): boolean
```

- Enemy gate: `edge?.strength <= -51` → return false (unless crisis flag present — crisis flag detection is a future hook; for now, no crisis bypass in the gate itself).
- Cooldown gate: `approacher.approachCooldowns.get(target.id) > ctx.worldTime.tick` → return false.
- Compute `p` per spec formula; roll `ctx.rng.next() < p`.

### 3. Join vs interrupt decision

```typescript
function resolveJoinOrInterrupt(approacher: Adventurer): 'JOIN' | 'INTERRUPT'
```

Per spec table: empathy ≥ 55 → JOIN; empathy < 40 AND courage ≥ 60 → INTERRUPT; else compatibility fallback.

### 4. Group scene aggregation

Per tick, scan all approach checks that fire against the same target within the same tick. Aggregate into a single `SocialEncounter` with `participants: [target, ...approachers]` (capped at 4). Single outcome resolution for the group; apply relationship/mood deltas to all pairs.

### 5. Outcome resolution

```typescript
function resolveOutcome(
  participants: Adventurer[],
  ctx: SimulationContext
): SocialOutcomeType
```

Compute `valence` and `intensity` per spec formulae. Check rare-outcome threshold gate (`ctx.rng.next() < 0.4` for BREAKTHROUGH/ESTRANGEMENT). Return one of 6 outcome types.

Apply effects:
- Relationship deltas: call `applyStrengthShift` for all participant pairs.
- Mood factors: call `upsertMoodFactor` per participant.
- ESTRANGEMENT: write `approachCooldowns` entries for `now + 5 * 24` ticks on both participants.

### 6. Placeholder text

Emit `renderedText` from pre-written fallback templates per outcome (≥ 3 variants, same templates that P9c will use as its LLM fallback). P9c will replace the rendering step with LLM-batched generation.

### 7. Remove old social subscriber artifacts

- Delete `pairHour()` export.
- Remove the old `socialEventSubscriber` registration from `SimulationLoop.ts`.
- Register `newSocialEventSubscriber` in its place (same position in subscriber order).
- Update tests that referenced `pairHour` or the old 4-outcome type names.

### 8. Tests (TDD)

All tests through `newSocialEventSubscriber`. Key cases:
- Enemy pair: zero approach checks in 24-tick run (no crisis flag).
- Stranger pair (no edge): approach prob ≤ 0.02 per tick (test with deterministic RNG).
- Empathic approacher (`empathy ≥ 55`): always JOIN.
- BREAKTHROUGH fires ≤ 40% of qualifying encounters (statistical over 1000 seeds; CI: < 50%).
- ESTRANGEMENT: approach cooldown set for 5 days on both participants.
- Group scene of 3: 3 relationship pair updates.
- Relationship delta for SOLIDARITY = +10, ESTRANGEMENT = −22.
- Social outcome mood factors present on both participants after resolution.

## Validation

- [ ] Enemy pairs (`strength ≤ −51`) produce zero approach checks across a 24-tick run with seed 42.
- [ ] Stranger pair approach probability ≤ 0.02 per tick (measured, not rolled).
- [ ] Approacher with `empathy ≥ 55` always resolves to JOIN (100 consecutive runs, fixed seed).
- [ ] BREAKTHROUGH fires on ≤ 45% of qualifying encounters (statistical threshold; measured over 500 seeded runs).
- [ ] ESTRANGEMENT sets `approachCooldowns` entries blocking approach for 5 × 24 ticks on both sides.
- [ ] Group scene (3 participants) emits a single `SocialEvent` with 3 participant IDs and 3 pair relationship updates.
- [ ] SOLIDARITY relationship delta = +10; ARGUMENT = −10; ESTRANGEMENT = −22 (assert on `RelationshipEdge.strength` after subscriber).
- [ ] Social mood factors (e.g. `SOCIAL_SOLIDARITY`) appear on both participants after resolution.
- [ ] Old `pairHour` function no longer exported from `socialResolver.ts`.
- [ ] Tests that referenced old outcome names (`POSITIVE_CHAT`, `BREAKTHROUGH` old delta) are updated.
- [ ] `tsc --noEmit` and `svelte-check` both pass with zero errors.
- [ ] All Vitest tests pass; no regressions in Playwright E2E.

## Risks / unknowns

- **Old test suite** — `social-departure.test.ts`, `p4b-wiring.test.ts`, `quest-system.test.ts` all reference social events; audit before starting to avoid surprise failures.
- **`approachCooldowns` on Adventurer** — a new Map field; needs initialisation in `createSimulationContext` and `scenario1.ts`. Missing initialisation will cause undefined-map errors in tests.
- **Crisis flag** — spec describes a future crisis bypass mechanism for BREAKTHROUGH/ESTRANGEMENT. For now, the crisis flag is always `false`. The interface includes `crisisFlag?: boolean` on `SocialEvent` as a forward slot; no logic reads it yet.
- **Group scene cadence** — the old system fired once per pair per day. The new per-tick probability is much higher frequency. Run a 30-day playtest to confirm social event density feels reasonable before shipping.

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)

---
status: done
depends: [p13a-relationship-driver-events]
specs:
  - specs/behaviors/npc-system.md
issues: []
---

# Plan: P13b — Townsfolk familiarity scalar

> Fixes the "service NPCs are too unfriendly / adventurers are treated like the townsfolk have never
> met anyone" gap (Set 2 answers B + E). Adds a **static per-NPC familiarity scalar** that seeds a
> warmer starting edge toward newcomer adventurers and adds a small approach bias — deliberately
> cheaper than a live NPC↔NPC graph, which stays out of scope. Depends on p13a so the driver/graph
> surfacing is in place first and the two plans don't edit the relationship-seeding path concurrently.

## Scope

**In scope:**
- **`familiarity: number` (0–100)** on `NotableNpc` (`world/types.ts`), seeded per NPC in
  `scenarios/notableNpcs.ts`. Static — never mutated by any subscriber (like `want`).
- **Service-role warmth seeding:** INNKEEPER/PRIEST/SHOPKEEPER/MERCHANT/BARD/STABLEHAND → high;
  GUARD_CAPTAIN/GATE_GUARD → moderate; scenario may flag a rival NPC low/negative.
- **Seeded starting edges:** at world generation, create each adventurer↔notable-NPC edge with an
  initial `strength` biased by `familiarity` (high → ACQUAINTANCE band; low/rival → STRANGER or mild
  negative). After seeding it is an ordinary `RelationshipEdge`.
- **Static approach bias:** `familiarity` contributes a fixed constant to social-pressure `gain`
  (`social-system.md` §4) for that NPC's adventurer pairs — applied every tick, never itself changing.
- Surface `familiarity`-seeded relationships wherever NPC edges already render (townsfolk detail
  Relationships list, adventurer relationship rows) — no new UI, just non-empty seeded edges.

**Out of scope:**
- The driver events + `RELATIONSHIP` feed kind + drift indicator → **p13a**.
- NPC↔NPC edges / a live familiarity graph (explicitly rejected — answer E).
- Dynamic familiarity that grows/decays over time (it is a static starting condition by design).
- Tier B nameless-role changes.

## Implements

- `specs/behaviors/npc-system.md#townsfolk-familiarity` + the `familiarity` field on `NotableNpc`
  + its Validation bullets (seeded-edge band, static invariant, approach-bias gain difference,
  post-seed ordinary evolution).

## Approach

`familiarity` is a scalar on the NPC, not graph state, so the only new persistent field is one number
per notable NPC. Edge seeding runs once at world generation alongside the existing notable-NPC
projection into the graph — reuse `createEdge(strength)` with a `familiarity`-derived opening
strength instead of the current stranger/zero default. The approach bias is a pure additive term in
the existing pressure `gain` computation, guarded on `isNpc` so adventurer↔adventurer pairs are
unaffected. Because seeded edges then flow through the ordinary machinery, p13a's drivers and drift
indicator operate on them with no extra wiring. TDD: assert the seeded band per role and the gain
difference (probability/quantity, not a rolled encounter) before implementing.

## Validation

- [x] `pnpm --filter @ugs/core exec tsc --noEmit` — 0 errors.
- [x] `pnpm --filter @ugs/core test` — green (621 tests; 17 new in `townsfolk-familiarity.test.ts`).
- [x] `pnpm --filter @ugs/game-client check` — 0 errors / 0 warnings (rebuild core first).
- [x] A high-familiarity INNKEEPER seeds adventurer edges in the ACQUAINTANCE band at world gen (not
      STRANGER); a rival-flagged low-familiarity NPC seeds STRANGER or mild negative.
- [x] `npc.familiarity` is unchanged across a long seeded run (static invariant, through the
      SimulationLoop for ~3 days).
- [x] A high-familiarity NPC contributes a larger approach-bias to pressure gain than a low-familiarity
      one (asserts the gain delta, not a rolled encounter).
- [x] A seeded townsfolk↔adventurer edge subsequently evolves through the ordinary
      driver/encounter/decay machinery (seeded edges carry empty history + derived type).
- [x] Seeded NPC relationships render in the townsfolk detail + adventurer relationship rows (e2e:
      `townsfolk-familiarity.spec.ts`, plain `/` load, no seam). 16/16 e2e green.

## Risks / unknowns

- **Opening-strength calibration.** Too warm and every service NPC is an instant friend; too cold and
  the fix is invisible. Tune the `familiarity → strength` mapping so service NPCs open around
  low-ACQUAINTANCE, leaving room for drivers to build.
- **Seeding site.** Confirm where notable NPCs are currently projected into the graph so seeding
  happens exactly once (not re-applied on load/replay), preserving determinism.
- **Approach-bias balance.** The additive gain term must not swamp mood/relationship terms and make
  NPC encounters dominate the feed; keep it a small constant.

## Notes

- **New module `relationships/familiarity.ts`** holds all four pieces so the mapping is testable in
  isolation and reusable by any scenario: `familiarityForRole` (role → default tier),
  `openingStrengthForFamiliarity` (familiarity → opening edge strength), `seedFamiliarityEdges`
  (world-gen edge projection), `familiarityApproachBias` + `FAMILIARITY_APPROACH_BIAS` (the pressure
  bias). All exported from `@ugs/core`.
- **Tiers:** high = 80 (service/craft), moderate = 55 (guard), low = 25 (marginal). **Opening map:**
  `clamp(round(0.4·familiarity − 14), −30, 39)` → high(80)=18 ACQUAINTANCE, moderate(55)=8 warm
  STRANGER, low(25)=−4 cool STRANGER, rival(0)=−14 mild RIVAL. Clamp guarantees no FRIEND/ENEMY at
  seed. Monotonic, leaves room for drivers to build toward FRIEND (40).
- **Approach bias** rides parallel to the `PROXIMITY` floor *inside* the additive group
  (`(proximity + moodStrain + relTension + familiarityBias) × compat × empathy`), matching how
  proximity already works. `familiarity` was added to `EncounterActor` (optional) and set by
  `npcToActor`; adventurer↔adventurer pairs carry no familiarity so they're unaffected (bias 0).
  Max bias 0.03 at familiarity 100 — small vs the mood/relationship terms.
- **Seeding site:** `createScenario1Context` now builds `relationships` via `seedFamiliarityEdges`
  (was an empty Map). Runs once at world gen; scenario1 has no other edges. The old
  `scenario1.test.ts` "Reiko starts with no relationship edges" test was **reconciled** to assert the
  new seeded-townsfolk-edges behavior (spec-conformant, not coded around).
- **Static invariant holds by construction:** every subscriber that writes `notableNpcs` spreads
  `{...npc, moodFactors|history: ...}`, so `familiarity` is preserved automatically. Verified through
  a 72-tick loop run.
- **Spec reconciliation:** `BLACKSMITH` (Brenna) is a seeded notable NPC but was absent from the
  spec's service-role list — added to the high/craft tier in `npc-system.md` (a town craftsperson is
  as embedded as the innkeeper). Also documented the marginal-role low tier explicitly.
- **NPC rivalry** remains reachable only via a scenario seeding a low/negative familiarity + a seeded
  negative edge; no Thornvale NPC is a rival, so all four take their role default.

## Follow-ups

- **Stale seam comment fixed:** `simulationStore.ts` `?e2e=npc` seam previously claimed
  "townsfolk↔adventurer edges form only after emergent town encounters" — no longer true (they seed
  at world gen). Comment updated; the seam now reads as a deliberate FRIEND-band *override* of the
  natural STRANGER opening.
- **Calibration** of the opening map + bias constant is a tuning knob; confirm against a longer
  playtest that service-NPC encounters don't dominate the feed (bias is intentionally small).
- **NPC↔NPC familiarity graph** stays out of scope (rejected — answer E).

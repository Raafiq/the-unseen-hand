# Handoff — The Unseen Hand: p13a + p13b shipped & committed (2026-07-04)

Phase 13 (relationship drivers + townsfolk familiarity) is **built, verified, and committed to
`main`**. `specops next` shows **0 ready / 27 done** — no queued plan work remains. The DAG is clean;
next real work is new planning (a phase-14 batch) or the one open design sign-off below.

## What shipped this session (3 commits on `main`)

1. **`60e6ffb` p13a — relationship driver events** (was built-but-uncommitted at session start).
   Peril drivers (SHARED_DANGER +12, BETRAYAL −18 writing `BETRAYED_BY`→`DISTRUSTS` + crisis flag),
   town drivers (KINDNESS +7, RIVALRY_SPARK −10), `RELATIONSHIP` feed kind, drift indicator.
   Symmetric edge deltas; asymmetry lives in per-actor surfaces. (See its plan Notes for the
   symmetric-vs-directional decision.)
2. **`1909e0c` consume the crisis flag** (p13a follow-up, TDD). `pendingCrises` was written but never
   read. `socialPressureSubscriber` now forces **exactly one** escalation encounter for each flagged,
   co-present, awake pair (`crisis:true` bypasses enemy gate + pressure threshold + post-fire
   cooldown → `ESTRANGEMENT` reachable), then clears the flag; an unavailable pair keeps its flag.
   Gated on a non-empty `pendingCrises`, so scenario1/existing suites saw **zero rng churn**.
   Tightened `social-system.md` §4. 3 new tests.
3. **`486f182` p13b — townsfolk familiarity.** Static per-NPC `familiarity` scalar (0–100, seeded at
   world gen, never churned): seeds a warmer adventurer↔NPC opening edge (service/craft → ACQUAINTANCE,
   guard → warm STRANGER, marginal/rival → low/negative) + a small static approach bias in the
   pressure gain. New module `relationships/familiarity.ts`. scenario1 now seeds the opening graph
   (was empty). 17 new core tests + 1 e2e (plain `/`, no seam).

## Guardrails (all green at last commit)

- core `tsc` clean · **621 core tests** · `svelte-check` clean · **16/16 e2e**.
- Nothing uncommitted except this HANDOFF.

## Open item to raise with the user (carried from p13a, still unresolved)

- **Symmetric-edge decision sign-off.** The p13a specs' driver deltas were *per-direction asymmetric*,
  but `RelationshipEdge.strength` is symmetric by a hard invariant. Resolved by best judgment: one
  symmetric delta per driver; asymmetry lives in per-actor surfaces (`SAVED_BY`→`OWES`,
  `BETRAYED_BY`→`DISTRUSTS`, larger recipient mood for KINDNESS). All specs reconciled to match.
  If the designer wants literal directional deltas, that's a much larger change (directional edges
  ripple through beliefs/decay/thresholds/drift/UI). Re-ask if you want their call.

## Next steps

1. **(user) Confirm the symmetric-edge decision** above, or greenlight it as final.
2. **New planning.** No ready plans remain. When starting phase 14, use the **specops** skill: map the
   spec batch first, then propose the set of plans (don't ad-hoc it).
3. Nothing else pending — trunk is clean.

## Key files (phase 13)

- Engine: `relationships/drivers.ts` (peril + town drivers), `relationships/drift.ts`,
  `relationships/familiarity.ts` (p13b — role→familiarity, opening-strength map, edge seeding,
  approach bias), `events/socialResolver.ts` (crisis consumption in `socialPressureSubscriber`;
  familiarity bias in `computePressureGain`; `EncounterActor.familiarity`), `scenarios/scenario1.ts`
  (`seedFamiliarityEdges` at world gen), `scenarios/notableNpcs.ts` (per-NPC familiarity),
  `world/types.ts` (`NotableNpc.familiarity`, `pendingCrises`), `index.ts` (exports).
- UI: `EventFeed.svelte`, `CharacterDetail.svelte` (drift row + seeded rel rows render),
  `simulationStore.svelte.ts` (`?e2e=drivers|npc` seams).
- Tests: `packages/core/tests/relationship-drivers.test.ts` (+crisis consumption),
  `packages/core/tests/townsfolk-familiarity.test.ts`, e2e `relationship-drivers.spec.ts` +
  `townsfolk-familiarity.spec.ts`.
- Plans (both `done`): `plans/p13a-relationship-driver-events.md`, `plans/p13b-townsfolk-familiarity.md`.

## Gotchas (still current)

- **`townDriverSubscriber` MUST stay dead-last** in `SimulationLoop` (rng-stream discipline).
- **Familiarity is static:** the invariant holds because every subscriber that writes `notableNpcs`
  spreads `{...npc, ...}`, preserving the field. Don't add a familiarity write site.
- **Opening-strength map** = `clamp(round(0.4·familiarity − 14), −30, 39)` — never seeds FRIEND/ENEMY.
  Calibration is a tuning knob; watch that service-NPC encounters don't dominate the feed.
- **NPC id prefix is `npc:`** (colon), and `pairKey` joins ids with `-` (don't parse it back — match
  membership instead, as the crisis path does).
- **Beat model has no target** → peril attribution is party-wide; solo-party near-death produces no
  peril pairs (why scenario1 shows 0 peril events — not a bug).

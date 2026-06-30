---
status: planned
depends: [p10a-narrative-voice, p9a-activity-system]
specs:
  - specs/behaviors/social-system.md
  - specs/behaviors/relationship-graph.md
  - specs/behaviors/mood-system.md
  - specs/behaviors/event-bus.md
---

# Plan: P10c — Social Pressure Escalation & Outcome Resolution

> **Phase 10 — Events Redesign** (3 of 4). **Supersedes the cancelled p9b-social-escalation.**
> Absorbs p9b's escalation gate, join/interrupt, group scenes, and six-outcome resolution, but
> **replaces the memoryless per-tick probability trigger with the pressure-accumulator +
> jitter + cooldown model** (the locked timing decision). Encounter text is rendered by the
> P10a grammar — no per-scene LLM.

## Scope

Replace the legacy `pairHour` flat-gate social subscriber with the pressure-driven escalation
engine and the valence × intensity six-outcome grid.

**In scope:**
- `socialPressure: Map<PairKey, number>` and `socialCooldowns: Map<PairKey, number>` on
  `SimulationContext` (init in `createSimulationContext` and `scenario1.ts`).
- Per-tick pressure accumulation: eligibility gate (enemy/forced-proximity, cooldowns),
  `gain = (proximity + moodStrain + relationshipTension) × compatibilityMult × empathyMult`,
  decay toward 0 when ineligible.
- Discharge: `THRESHOLD` crossing → jittered per-tick fire roll
  `FIRE_BASE × min(2, pressure/THRESHOLD)`; reset pressure + jittered post-fire cooldown
  (reuses the `decisionCooldowns` mechanism per CLAUDE.md's per-tick-detector rule).
- Join vs interrupt (approacher personality), group scenes (≤ 4, single encounter).
- Six-outcome resolution (valence/intensity → BANTER…ESTRANGEMENT), BREAKTHROUGH/ESTRANGEMENT
  threshold gate + crisis bypass, ESTRANGEMENT 5-day approach cooldown.
- Relationship deltas (six-outcome table) + mood-factor emission for all six.
- `SocialEvent` emission: six-outcome subtype, `participantIds: ActorId[]` (2–4),
  `renderedText` from the P10a social pools.
- Remove `pairHour` and the old four-outcome subscriber.
- FEUD span trigger (ESTRANGEMENT-under-crisis → a feud span; reuses P10b's span lifecycle).

**Out of scope:**
- NPCs as participants (P10d widens eligibility to actors; this plan stays adventurer↔adventurer,
  but emits `ActorId[]` so P10d needs no event-shape change).
- LLM text (none — grammar only).

## Implements

- `specs/behaviors/social-system.md` §4 (pressure trigger), §5 (six-outcome resolution).
- `specs/behaviors/relationship-graph.md` — six-outcome strength deltas + ESTRANGEMENT cooldown.
- `specs/behaviors/mood-system.md` — six social MoodFactors.
- `specs/behaviors/event-bus.md` — six-outcome `SocialEvent`, `ActorId[]` participants.

## Approach

### 1. Context fields & types

Add `socialPressure` / `socialCooldowns` maps; `PairKey` = sorted `"A-B"`. Six-outcome
`SocialOutcomeType`. Init maps everywhere a context/roster is constructed.

### 2. Pressure subscriber (`socialResolver.ts`)

Replace the `pairHour` subscriber. Per tick: for each eligible pair, accumulate or decay; on
THRESHOLD, roll discharge; on fire, resolve encounter and set cooldown. Constants
(`THRESHOLD`, `FIRE_BASE`, `DECAY`, `COOLDOWN_BASE/JITTER`, proximity/strain/tension weights)
defined and tuned against a playtest.

### 3. Resolution

Port p9b's intended `resolveOutcome` (valence/intensity, threshold gate, crisis bypass), delta
application via `applyStrengthShift` for all pairs, `upsertMoodFactor` per participant,
ESTRANGEMENT cooldown writes. Group aggregation: approach fires against same target in same tick
→ single encounter (≤ 4).

### 4. Feud span

On ESTRANGEMENT with a crisis flag, open a FEUD span (P10b lifecycle) holding the pair's cold
state; encounters during it read hostile (grammar colour) and approach stays gated.

### 5. Remove legacy

Delete `pairHour`; drop the old subscriber registration; update tests referencing old outcome
names / `pairHour`.

### 6. Tests (TDD — through the subscriber, seeded context)

- Enemy pair: zero pressure, never fires in 24 ticks (no crisis).
- Kept-apart pair: pressure decays toward 0, never crosses THRESHOLD.
- Sustained proximity+strain: pressure rises monotonically to THRESHOLD (assert accumulator).
- Post-fire: pressure reset to 0, cooldown set, no re-fire until `tick ≥ cooldown` (deterministic).
- Empathic approacher → always JOIN.
- Six-outcome deltas (SOLIDARITY +10, ARGUMENT −10, ESTRANGEMENT −22) on `RelationshipEdge`.
- BREAKTHROUGH fires ≤ ~45% of qualifying (statistical); 100% under crisis flag.
- Group scene of 3 → one `SocialEvent`, 3 pair updates.
- `renderedText` non-empty, slot-free, replayable under fixed seed.

## Validation

- [ ] Enemy pairs accumulate zero pressure and never fire in a 24-tick run (no crisis flag).
- [ ] A kept-apart pair's pressure decays toward 0 and never crosses THRESHOLD.
- [ ] A sustained-proximity+strain pair's pressure rises monotonically to THRESHOLD (asserted on the accumulator).
- [ ] After firing, pressure resets to 0 and the pair cannot fire again until `tick ≥ cooldown` (fixed seed).
- [ ] `empathy ≥ 55` approacher always resolves JOIN.
- [ ] SOLIDARITY +10, ARGUMENT −10, ESTRANGEMENT −22 on the edge; six social MoodFactors emitted.
- [ ] BREAKTHROUGH ≤ ~45% of qualifying encounters; 100% under crisis flag.
- [ ] Group scene (3) emits one `SocialEvent` with 3 participant ids and 3 pair updates.
- [ ] `pairHour` no longer exported; old four-outcome names gone from tests.
- [ ] Encounter `renderedText` non-empty, slot-free, byte-for-byte replayable under fixed seed.
- [ ] `tsc --noEmit` and `svelte-check` pass; all Vitest tests pass.

## Risks / unknowns

- **Tuning** — pressure constants determine social density; run a 30-day playtest and record the
  tuned values in Notes at closeout.
- **Map init** — missing `socialPressure`/`socialCooldowns` init causes undefined-map crashes;
  audit every context/roster construction site (carried over from p9b's risk).
- **Crisis flag source** — still a forward slot; only ESTRANGEMENT-feud sets it for now.

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)

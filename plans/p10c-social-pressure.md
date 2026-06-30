---
status: done
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
- BREAKTHROUGH fires ≤ 40% of qualifying (statistical, `thresholdProb = 0.4`); 100% under crisis flag.
- Group scene of 3 → one `SocialEvent`, 3 pair updates.
- `renderedText` non-empty, slot-free, replayable under fixed seed.

## Validation

- [x] Enemy pairs accumulate zero pressure and never fire in a 24-tick run (no crisis flag).
- [x] A kept-apart pair's pressure decays toward 0 and never crosses THRESHOLD.
- [x] A sustained-proximity+strain pair's pressure rises monotonically to THRESHOLD (asserted on the accumulator).
- [x] After firing, pressure resets to 0 and the pair cannot fire again until `tick ≥ cooldown` (fixed seed).
- [x] `empathy ≥ 55` approacher always resolves JOIN.
- [x] SOLIDARITY +10, ARGUMENT −10, ESTRANGEMENT −22 on the edge; six social MoodFactors emitted.
- [x] BREAKTHROUGH ≤ 40% of qualifying encounters (`thresholdProb = 0.4`); 100% under crisis flag.
- [x] Group scene (3) emits one `SocialEvent` with 3 participant ids and 3 pair updates.
- [x] `pairHour` no longer exported; old four-outcome names gone from tests.
- [x] Encounter `renderedText` non-empty, slot-free, byte-for-byte replayable under fixed seed.
- [x] `tsc --noEmit` and `svelte-check` pass; all Vitest tests pass.

> All boxes verified by `packages/core/tests/social-pressure.test.ts` (21 tests) +
> `narrative-voice.test.ts` (six-subtype beat-pool coverage). Full suite: 478 core Vitest green;
> game-client `tsc` + `svelte-check` = 0 errors.

## Risks / unknowns

- **Tuning** — pressure constants determine social density; run a 30-day playtest and record the
  tuned values in Notes at closeout.
- **Map init** — missing `socialPressure`/`socialCooldowns` init causes undefined-map crashes;
  audit every context/roster construction site (carried over from p9b's risk).
- **Crisis flag source** — still a forward slot; only ESTRANGEMENT-feud sets it for now.

## Notes

### Tuning model — settled by the pressure-accumulator grill (user sign-off 2026-06-30)

Rendered and signed off via `.lavish/social-pressure-tuning.html` (all 7 decisions accepted, no
overrides). These are the **build-target** constants; confirm/adjust against a 30-day playtest at
closeout. Clock: **1 tick = 1 in-game hour, 24 ticks/day**; reference roster **5 adv → 10 pairs**.

**D1 — density target.** ~5 social encounters/day guild-wide at the 5-adv/10-pair reference roster
(~150 over a 720-tick/30-day run); sanity band 3–7/day. The knob held is guild-wide encounters/day.
(Scenario 1 ships with a roster of one — density is only observable once recruitment grows the guild.)

**D2 — gain formula** `gain = (proximity + moodStrain + relationshipTension) × compatibilityMult × empathyMult`:
| term | definition | range | typical |
|---|---|---|---|
| `proximity` | flat floor, co-present & awake | `0.05` | 0.05 |
| `moodStrain` | `0.03·(gap/100) + 0.03·clamp((40−minMood)/40, 0, 1)` | 0–0.06 | ~0.01 |
| `relationshipTension` | `0.005 + 0.025·isRival + 0.015·nearBoundary(±5)` | 0.005–0.045 | ~0.008 |
| `empathyMult` | `0.5 + max(empA,empB)/100` | 0.5–1.5 | ~1.0 |
| `compatibilityMult` | spec §4 table (DRINKING 2.5 … RESTING 0.15) | 0.15–2.5 | ~1.5 |

The three additive terms are deliberately commensurable (hundredths): `proximity` is the floor,
`moodStrain`/`relationshipTension` are modifiers that can ~double it. Typical public-activity tick
≈ `0.068 × 1.0 × 1.5 ≈ 0.10/tick`.

**D3 — net-flow decay (amended `social-system.md §4`).** `Δpressure = gain − DECAY` each tick where
both are awake & present, floored at 0; **frozen** (no gain/decay) when either is SLEEPING or
questing. `DECAY = 0.015` — set below typical public gain (~0.10) and above max withdrawn gain
(~0.014), so the compat table doubles as the eligibility gate (no binary flag). RESTING (compat
0.15 → gain ~0.010) nets negative → kept-apart pair decays toward 0, satisfying the spec test.

**D4 — threshold & discharge.** `THRESHOLD = 1.0`; `fireProb = FIRE_BASE × min(2, pressure/THRESHOLD)`
with `FIRE_BASE = 0.2`, overshoot cap `2.0` (max fireProb 0.4). Firing tick is geometrically
distributed (mean ~5 ticks past threshold) — that is the organic jitter; cap prevents a wildly
overdue pair from becoming deterministic.

**D5 — cooldowns.** Post-fire: reset pressure to 0, `socialCooldowns.set(key, tick + 8 + floor(rng·16))`
→ window `[8, 24)` ticks (`COOLDOWN_BASE = 8`, `COOLDOWN_JITTER = 16`). ESTRANGEMENT approach lock
`= 120 ticks` (5 days), effective cooldown = max of the two. Reuses the `decisionCooldowns` mechanism.

**D6 — outcome resolution.** Six-grid + thresholds per `social-system.md §5`. `thresholdProb = 0.40`
(spec wins over the plan's prior "~45%" wording — now reconciled). Very-high-gap precondition for
the two rare cells = `moodGap > 50 OR clashScore > 70` (added to spec §5). Crisis flag bypasses the
gate (rare outcome at 100%); for p10c only ESTRANGEMENT-under-crisis opens a FEUD span — nothing
else sets the flag yet.

**D7 — deltas & groups (spec-settled, no change).** Six-outcome edge/mood table per `social-system.md §5`
+ `relationship-graph.md` (BANTER +3 · SOLIDARITY +10 · BREAKTHROUGH +18 · SILENT_DISTANCE −1 ·
ARGUMENT −10 · ESTRANGEMENT −22). Group scene ≤4: one outcome on group-avg mood & max pairwise gap,
applied to all N-choose-2 pairs; one `SocialEvent` with N `participantIds`.

**Worked density check:** ~6 net-positive public ticks/day × ~0.085 net ≈ 0.45 pressure/day →
~2.2 days to THRESHOLD + ~0.5 day cooldown ≈ 2.5-day pair cycle → ~0.4 fires/pair/day → ~4/day at
10 pairs (inside the 3–7 band). Cheapest density levers if playtest reads off: `proximity 0.05→0.06`
or `DECAY 0.015→0.012` (sparse), `COOLDOWN_BASE↑` (spammy).

### Closeout — playtest reading (2026-06-30)

Constants shipped **at the locked build-target values** (D1–D7 unchanged); the directive was to
build to the signed-off numbers, not re-tune. A 30-day playtest on the live scenario is **not
possible** — Scenario 1 ships with a roster of one (no pairs), so social density is unobservable
in-game today (as D1 anticipated).

A throwaway synthetic harness (5 adventurers / 10 pairs, full activity + mood subscribers, 720
ticks × 5 seeds) was run to get *a* reading: **mean ≈ 1.7/day** with mood dynamics on (≈2.5/day
with mood held static). Both sit **below** the 3–7/day target band. Caveats: synthetic roster,
convergent moods (all seed at 50 with a single baseline factor → near-zero mood-gap strain), no
recruitment feedback. So this is a rough lower bound, not a verdict.

**Decision:** constants left as signed-off. The sparse reading is recorded but the locked numbers
were **not** changed unilaterally — see Follow-ups for the recommended tuning lever, which is the
user's call. The plan pre-authorised exactly this contingency ("Cheapest density levers if
playtest reads off: `proximity 0.05→0.06` or `DECAY 0.015→0.012`").

## Follow-ups

- **Density tuning (for user decision).** Synthetic playtest reads sparse (~1.7/day vs ~5 target).
  If confirmed once recruitment exists, apply the pre-authorised levers (`PROXIMITY 0.05→0.06`,
  `DECAY 0.015→0.012`, or lower `THRESHOLD`) in `socialResolver.ts`. Not changed now: numbers are
  signed-off and the effect is unobservable in the single-adventurer shipping scenario.
- **FEUD span on ESTRANGEMENT-under-crisis — descoped, blocked on p10b.** The span lifecycle p10c
  would reuse does not exist yet (`p10b-world-event-durations` is still `planned`). The crisis-bypass
  *logic* is built and tested (`resolveOutcome(..., crisis)`), but no FEUD span is opened and nothing
  in-sim sets the crisis flag. Wire this once p10b lands. (None of the 11 Validation boxes needed it.)
- **Join/interrupt side effects not wired.** `decideApproach` is implemented + tested (Validation
  box 5), but the subscriber calls `resolveEncounter` directly without applying the spec §3 JOIN
  duration-extension / INTERRUPT activity-termination. Outcome resolution is unaffected; wire the
  approach side effects into the activity window as a follow-up.
- **Group prose names only the first two participants.** `resolveEncounter` emits one `SocialEvent`
  with all N ids, but the P10a beat pools (`{a}`/`{b}`) name only two. Add a group-subject grammar
  (spec §6 "subject naming the group") so 3–4-person scenes read correctly.
- **Crisis flag source remains a forward slot** (carried from Risks) — no in-sim condition sets it
  yet; first real producer is the descoped FEUD path above.

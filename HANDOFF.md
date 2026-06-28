# Handoff — The Unseen Hand (guild-sim)

_Last updated: 2026-06-28. Resume from this file at the start of the next session._

---

## Current status

**Phase 3 complete. Phase 4 is next.**

| Phase | Plan file | Status |
|---|---|---|
| P1 — Foundation | `plans/phase-1-foundation.md` | done |
| P2 — Autonomous World | `plans/phase-2-autonomous-world.md` | done |
| P3 — Divine Intervention | `plans/phase-3-divine.md` | done |
| P4 — Scenario Engine | `plans/phase-4-scenario.md` | planned |
| P5 — UI | `plans/phase-5-ui.md` | planned |
| P6 — Narrator | `plans/phase-6-narrator.md` | planned |

**Test baseline:** 244 tests, 17 test files, `tsc --noEmit` clean.

---

## What was done this session

### P3 — Divine Intervention (all four steps TDD)

1. **DI resource + trickle** — `src/divine/DivineInfluence.ts`: `diTrickleSubscriber` (+1 DI per day tick, emits `DI_GAINED`), `grantDI` helper (clamps [0,100], emits `DI_GAINED`).
2. **Probability shifter** — `src/divine/ProbabilityShifter.ts`: `narrativeDistance(natural, target)` clamped [0,10]; `applyDivineShift(base, diSpent)` shift = `diSpent/100 * 0.40`, clamped [0,1].
3. **DecisionMomentDetector** — `src/events/DecisionMomentDetector.ts`: expiry handling (OPTION_CHOSEN event + DI reward), `QUEST_DROUGHT` and `RELATIONSHIP_COLLAPSE` detection, max-3 cap with priority ordering (death > relationship-collapse > departure > scenario > party-selection > other).
4. **dispatch** — `src/divine/DivineTools.ts`: `CHOOSE_OPTION`, `DIVINE_TOUCH`, `SEED_EVENT`, `SHIFT_DIFFICULTY` — all validate DI before spend, return `{ ok, error }`.

**Type additions:**
- `DecisionMomentKind` union + `kind` field on `DecisionMoment` (required for priority/DI-reward logic, was missing from spec).
- `LUCK_CURSE` | `MARK_FOR_DEATH` added to `HistoryEventKind` (cooldown tracking for divine touch).

All four subscribers registered in `SimulationLoop` in spec-mandated order: mood → relationshipDecay → socialEvent → departure → diTrickle → decisionMoment.

---

## Codebase map (`packages/core/src/`)

```
world/
  SeededRNG.ts          - mulberry32 PRNG; all randomness flows through ctx.rng
  SimulationContext.ts  - createSimulationContext factory; sets lastSharedActivity: {}
  WorldClock.ts         - real-time interval; onTick(listener), currentSpeed getter
  SimulationLoop.ts     - subscriber registry; step()/start()/stop(); auto-registers core subs
  types.ts              - ALL canonical types (SimulationContext, Adventurer, Quest, events...)

adventurers/
  personality.ts        - fleeThreshold, questVolunteerWeight, shareLootChance, defendAllyChance
  stateMachine.ts       - transitionState; TransitionOpts requires { questId, isDev }
  mood.ts               - upsertMoodFactor, applyDayTickMood, moodSubscriber, topMoodFactors
  departureSystem.ts    - computeDepartureProbability, departureSubscriber

relationships/
  graph.ts              - applyStrengthShift, detectThresholdEvents, applyDayTickDecay,
                          relationshipDecaySubscriber, createEdge, strengthToType

events/
  eventBus.ts           - emitEvent (typed union, template engine)
  socialResolver.ts     - computeInteractionProbability, computeOutcomeWeights, socialEventSubscriber
  DecisionMomentDetector.ts - decisionMomentSubscriber (expiry + QUEST_DROUGHT/RELATIONSHIP_COLLAPSE detection)

quests/
  questSystem.ts        - questBoardSeedingSubscriber, questExpirySubscriber,
                          partySelectionSubscriber, resolveQuest, computeQuestProbability

combat/
  beatGenerator.ts      - generateBeats, selectBeatActionWeights, renderBeat

divine/
  DivineInfluence.ts    - diTrickleSubscriber, grantDI
  ProbabilityShifter.ts - narrativeDistance, applyDivineShift
  DivineTools.ts        - dispatch (CHOOSE_OPTION, DIVINE_TOUCH, SEED_EVENT, SHIFT_DIFFICULTY)
```

`src/index.ts` re-exports everything. Add new exports there when adding new modules.

---

## Key invariants (do not break)

- **No `Math.random()` in `packages/core/`** — all randomness via `ctx.rng`. Verify: `grep -r "Math.random" packages/`
- **Probability shifts, not outcomes** — tests assert shifted probability values, never rolled outcomes. See `specs/principles.md`.
- **`transitionState` opts** require `{ questId: QuestId | null; isDev: boolean }` — missing `questId` is a compile error.
- **Svelte 5 store rule** — `export const store = $state({...})`, never `export let x = $state(...)`. Applies to `apps/game-client`.
- **`tsc --noEmit` + `svelte-check` must both pass** before any Svelte edit is considered done.
- **`DecisionMoment.kind`** — required on all moments; drives priority ordering and DI reward on expiry.

---

## Phase 4 — Scenario Engine (next)

**Plan:** `plans/phase-4-scenario.md` (status: planned)

**Spec to implement:** `specs/behaviors/scenario-engine.md` (if it exists) or create it first.

**Known deferred work from P3:**
- Scenario-critical and scenario-goal decision moment detection (needs scenario engine).
- PersonalGoal imminent detection (needs scenario engine).

### How to resume

```
1. Run /specops — confirm phase-4-scenario.md plan and DAG
2. Check if specs/behaviors/scenario-engine.md exists; if not, spec first
3. Run /tdd for each P4 step
4. After all steps pass: full suite, tsc --noEmit, commit, close plan, /audit-spec-drift
```

Quick sanity check before starting:
```powershell
cd packages/core
node_modules\.bin\vitest run
# expect: 17 files, 244 tests, all passing

node_modules\.bin\tsc --project tsconfig.build.json --noEmit
# expect: no output (zero errors)
```

---

## Known follow-ups

- Update `specs/behaviors/decision-moments.md` to add `kind: DecisionMomentKind` to the `DecisionMoment` type definition.
- `SILENT_DISTANCE` social outcome does not update `lastSharedActivity` — intentional but worth spec review.
- Run `/audit-spec-drift` after P4 completes.

---

## Suggested skills for next session

1. **`/specops`** — invoke first to confirm `plans/phase-4-scenario.md` and verify the plan DAG
2. **`/tdd`** — for each P4 step; one failing test -> minimum code -> repeat
3. **`/audit-spec-drift`** — after P4 is complete, before starting P5

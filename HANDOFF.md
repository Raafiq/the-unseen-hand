# Handoff — The Unseen Hand (guild-sim)

_Last updated: 2026-06-28. Resume from this file at the start of the next session._

---

## Current status

**Phase 4 complete. Phase 5 (UI) is next.**

| Phase | Plan file | Status |
|---|---|---|
| P1 — Foundation | `plans/phase-1-foundation.md` | done |
| P2 — Autonomous World | `plans/phase-2-autonomous-world.md` | done |
| P3 — Divine Intervention | `plans/phase-3-divine.md` | done |
| P4 — Scenario Engine | `plans/phase-4-scenario.md` | done |
| P5 — UI | `plans/phase-5-ui.md` | planned |
| P6 — Narrator | `plans/phase-6-narrator.md` | planned |

**Test baseline:** 349 tests, 23 test files, `tsc --noEmit` clean.

Last commit: `feat(core): P4 scenario engine — scenario eval, Failing Guild, personal goals, history layer, world expansion`

---

## What was done this session

### P4 — Scenario Engine & Progression (all six steps, TDD)

Built via `/tdd` skill, one failing test per behavior.

**Step 1 — `treasury` + `reputation`** (`SimulationContext`):
- Added `treasury: number` (default 0) and `reputation: number` (default 0) to `SimulationContext`.
- Updated `specs/data-model.md` to document both fields.

**Step 2 — Scenario schema + per-tick evaluation** (`src/scenarios/ScenarioEngine.ts`):
- `registerScenario(def)`: adds to registry keyed by `scenarioId`.
- `scenarioEvaluatorSubscriber(ctx, _delta)`: per-tick goal/fail check, upkeep deduction (5 gold/adventurer/week = 168 ticks), treasury-negative tracking for BANKRUPTCY.
- New `WorldEvent` subtypes: `SCENARIO_GOAL_ACHIEVED`, `SCENARIO_COMPLETE`, `SCENARIO_FAILED`.
- `ScenarioState.treasuryNegativeSince: number | null` added for BANKRUPTCY consecutive-tick tracking.

**Step 3 — Scenario 1 "The Failing Guild"** (`src/scenarios/scenario1.ts`):
- `createScenario1Context(seed?)`: 6 pre-seeded adventurers, relationships (Garrett↔Kara TRUSTED_COMPANION 75, Voss↔Mira RIVAL −30), treasury 50, DI 40, `createStartingRegions()` wired.
- Goals: `SURVIVAL` (≥4 alive at tick 720), `SOLVENT` (treasury > 0 at tick 720), `BOND` (optional, TRUSTED_COMPANION event in log).
- Fail conditions: `ROSTER_COLLAPSE` (living < 2), `BANKRUPTCY` (treasury < 0 for 168+ ticks).

**Step 4 — Personal goals** (`src/adventurers/PersonalGoals.ts`):
- `checkGoalCompletion(adv, ctx)`: per-goal predicates (HEROISM, WEALTH, BELONGING, REVENGE, WANDERLUST, PEACE).
- `applyGoalCompletion(ctx, adv)`: fires `GOAL_ACHIEVED` lifecycle event, marks completed, applies bounded trait shift, adds mood factor (+40, decay 0.03), grants +12 DI (capped 100), surfaces retirement decision moment (3 options, expires at tick+48).

**Step 5 — History layer** (`src/adventurers/HistoryLayer.ts`):
- `contextualModifier(axes, history, context)`: pure function, values clamped [0, 100].
  - `WITNESSED_DEATH`: −20 courage in matching `enemyArchetype` only.
  - `NEAR_DEATH`: +15 courage ≤14 days; −10 courage >30 days.
  - `FIRST_KILL`: +10 courage always.
  - `SAVED_BY`: +15 loyalty toward saver; +10 empathy in RESCUE quests.
- `appendHistoryEvent(history, event)`: FIFO cap at 50 events, no mutation.
- New types: `BehaviourContext`, `EnemyArchetype`, `enemyArchetype` on `HistoryEvent`, `SEND_DREAM` in `HistoryEventKind`.

**Step 6 — World expansion** (`src/world/WorldExpansion.ts`):
- `createStartingRegions()`: THORNVALE (unlocked), ASHWOOD (locked), STORMPASS (locked).
- `worldExpansionSubscriber(ctx)`: ASHWOOD unlocks on ≥1 `SCENARIO_COMPLETE` event OR reputation ≥200; STORMPASS on reputation ≥500 OR ≥2 scenarios complete. Idempotent.
- `updateReputation(current, event)`: delta table per spec, clamped [0, 1000].

**Subscriber order in `SimulationLoop`:** mood → relationshipDecay → socialEvent → departure → diTrickle → decisionMoment → scenarioEvaluator → worldExpansion

---

## Codebase map (`packages/core/src/`)

```
world/
  SeededRNG.ts               - mulberry32 PRNG; all randomness via ctx.rng
  SimulationContext.ts       - createSimulationContext; defaults: DI=50, treasury=0, reputation=0
  WorldClock.ts              - real-time interval; onTick, currentSpeed
  SimulationLoop.ts          - subscriber registry; step/start/stop; auto-registers all core subs
  WorldExpansion.ts          - createStartingRegions, worldExpansionSubscriber, updateReputation
  types.ts                   - ALL canonical types

adventurers/
  personality.ts             - fleeThreshold, questVolunteerWeight, shareLootChance, defendAllyChance
  stateMachine.ts            - transitionState (opts require { questId, isDev })
  mood.ts                    - upsertMoodFactor, applyDayTickMood, moodSubscriber
  departureSystem.ts         - computeDepartureProbability, departureSubscriber
  PersonalGoals.ts           - checkGoalCompletion, applyGoalCompletion
  HistoryLayer.ts            - contextualModifier (pure), appendHistoryEvent

relationships/
  graph.ts                   - applyStrengthShift, detectThresholdEvents, applyDayTickDecay,
                               relationshipDecaySubscriber, createEdge, strengthToType

events/
  eventBus.ts                - emitEvent (typed union, template engine, renderedText never-empty)
  socialResolver.ts          - computeInteractionProbability, computeOutcomeWeights, socialEventSubscriber
  DecisionMomentDetector.ts  - decisionMomentSubscriber (expiry + QUEST_DROUGHT/COLLAPSE detection)

quests/
  questSystem.ts             - questBoardSeedingSubscriber, questExpirySubscriber,
                               partySelectionSubscriber, resolveQuest, computeQuestProbability

combat/
  beatGenerator.ts           - generateBeats, selectBeatActionWeights, renderBeat

divine/
  DivineInfluence.ts         - diTrickleSubscriber, grantDI
  ProbabilityShifter.ts      - narrativeDistance, applyDivineShift
  DivineTools.ts             - dispatch (CHOOSE_OPTION, DIVINE_TOUCH, SEED_EVENT, SHIFT_DIFFICULTY)

scenarios/
  ScenarioEngine.ts          - registerScenario, scenarioEvaluatorSubscriber
  scenario1.ts               - createScenario1Context, SCENARIO_1_ID, S1_IDS
```

`src/index.ts` re-exports everything public. Add new exports there when adding new modules.

---

## Key invariants (do not break)

- **No `Math.random()` in `packages/core/`** — all randomness via `ctx.rng`. Verify: `grep -r "Math.random" packages/`
- **Probability shifts, not outcomes** — tests assert shifted probability values, never rolled outcomes. See `specs/principles.md`.
- **`transitionState` opts** require `{ questId: QuestId | null; isDev: boolean }` — missing `questId` is a compile error.
- **Svelte 5 store rule** — `export const store = $state({...})`, never `export let x = $state(...)`. Applies to `apps/game-client`.
- **`tsc --noEmit` + `svelte-check` must both pass** before any Svelte edit is considered done.
- **`DecisionMoment.kind`** — required on all moments; drives priority ordering and DI reward on expiry.
- **`ScenarioState.treasuryNegativeSince`** — must always be initialized to `null` in new scenario state; tracks BANKRUPTCY consecutive ticks.
- **`contextualModifier` is pure** — never stores result on adventurer; always called on-demand.

---

## Phase 5 — UI (next)

**Plan:** `plans/phase-5-ui.md` (status: planned)

**Likely specs to implement:** check `specs/screens/` — app-shell, roster-grid, character-detail, event-feed, world-panel, choice-card, combat-replay, world-map.

### Suggested implementation order

1. Read `plans/phase-5-ui.md` in full
2. Read all `specs/screens/` files
3. TDD each step; verify with `tsc --noEmit` AND `svelte-check` after every Svelte change
4. After all steps: full suite, type check, commit, close plan, `/audit-spec-drift`

### Quick sanity check before starting

```powershell
cd packages/core
node_modules\.bin\vitest run
# expect: 23 files, 349 tests, all passing

node_modules\.bin\tsc --project tsconfig.build.json --noEmit
# expect: no output (zero errors)
```

---

## Known follow-ups (from P4 closeout)

- Run `/audit-spec-drift` after P4 merge (deferred from P3, now overdue).
- Wire `GOAL_ACHIEVED`/`NEAR_DEATH` history event recording into `questSystem.ts` beat resolution.
- WANDERLUST/REVENGE/PEACE personal goal milestone recording (quest system + social events integration needed).
- Scenario-critical and scenario-goal `DecisionMoment` detection in `DecisionMomentDetector.ts` (scenario engine is now available to wire these).
- `SILENT_DISTANCE` social outcome still does not update `lastSharedActivity` — intentional, worth spec review.
- Update `specs/data-model.md` to document `BehaviourContext`, `EnemyArchetype`, and `ScenarioState.treasuryNegativeSince` (added during P4 implementation).

---

## Suggested skills for next session

1. **`/audit-spec-drift`** — run before P5 starts; P3+P4 changes have accumulated
2. **`/specops`** — to read `plans/phase-5-ui.md` and all `specs/screens/` files
3. **`/tdd`** — for each P5 step; one failing test → minimum code → repeat

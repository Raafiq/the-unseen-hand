# Handoff — The Unseen Hand (guild-sim)

_Last updated: 2026-06-28. Resume from this file at the start of the next session._

---

## Current status

**Phase 4c + Phase 5 complete. P6 (Narrator) is next, pending manual browser smoke-test.**

| Phase | Plan file | Status |
|---|---|---|
| P1 — Foundation | `plans/phase-1-foundation.md` | done |
| P2 — Autonomous World | `plans/phase-2-autonomous-world.md` | done |
| P3 — Divine Intervention | `plans/phase-3-divine.md` | done |
| P4 — Scenario Engine | `plans/phase-4-scenario.md` | done |
| P4b — Simulation Wiring | `plans/phase-4b-simulation-wiring.md` | done |
| **P4c — Mechanics Completion** | **`plans/phase-4c-mechanics-completion.md`** | **done** |
| **P5 — UI** | **`plans/phase-5-ui.md`** | **done (browser test pending)** |
| P6 — Narrator | `plans/phase-6-narrator.md` | planned (blocked on P5 browser gate) |

**Test baseline:** 382 tests, 25 test files, `tsc --noEmit` + `svelte-check` both clean.

---

## What happened last session

### Phase 4c — Mechanics Completion

Fixed the critical behavioral gaps identified by the P4b spec-drift audit:

- **DI shift pipeline**: added `pendingShifts: Map<string, number>` to `SimulationContext`; `chooseOption` writes adventurer-keyed probability shifts; `questResolutionSubscriber` reads, sums, and clears them before calling `resolveQuest`
- **Milestone writing**: `questResolutionSubscriber` now appends `DUNGEON_SUCCESS` / `RESCUE_SUCCESS` (HEROISM) and `GOLD_EARNED:N` (WEALTH) to `personalGoalProgress.milestones` per surviving party member; emits `GOAL_MILESTONE` lifecycle events
- **DI burst sources**: `questResolutionSubscriber` grants +5 DI on success; `socialEventSubscriber` grants +8 DI on FRIENDSHIP_FORMED / TRUSTED_COMPANION_BOND_FORMED; +5 DI for deaths without a pending DEATH_IMMINENT moment
- **`grantDI` everywhere**: fixed direct `divineInfluence` mutations in `applyGoalCompletion` and `scenarioEvaluatorSubscriber`; all DI changes now emit `DI_GAINED` events
- **QUEST_DROUGHT fix**: removed `&& active.length === 0` guard; drought now fires when available board is empty regardless of active quests
- **`questPressure`** added to `Scenario` and `ScenarioState` types
- **`personalityNote` thresholds** corrected to match `combat-resolution.md` (FLEE/HESITATE: courage < 30, DEFEND_ALLY: loyalty > 70, no-DEFEND_ALLY: empathy < 20)
- **Spec rename**: `despairingDayCount` → `despairStreak` in `departure-system.md`
- 15 new tests in `tests/p4c-mechanics.test.ts`

### Phase 5 — Svelte 5 Dashboard UI

Built the full god-game dashboard in `apps/game-client/src/`:

- **`lib/simulationStore.svelte.ts`** — `$state` snapshot; render observer on SimulationLoop; `doDispatch`, `setSpeed`, `selectAdventurer`, `setActiveTab`, `unreadEventCount`
- **`App.svelte`** — top bar (world name, time, DI meter, speed controls), left nav (4 tabs + badges), main panel, right panel (ChoiceCard / CharacterDetail / default state)
- **`lib/components/RosterGrid.svelte`** — adventurer cards sorted Living/Dead/Retired; state badges, mood bars, goal progress icons; compact mode >12
- **`lib/components/EventFeed.svelte`** — reverse-chronological; type filter bar; 200-event slice; portrait initials with click-to-select
- **`lib/components/ChoiceCard.svelte`** — primary + secondary decision moment cards; DI cost; affordability; expiry countdown
- **`lib/components/WorldPanel.svelte`** — regions, difficulty shift, seed event picker, quest sub-section, reputation
- **`lib/components/CharacterDetail.svelte`** — identity, backstory, goal progress, personality axes, mood factors, relationships, history, divine touch sub-panel
- **`svelte.config.js`** added — required by `svelte-check` to locate the Svelte preprocessor

**Verification gate passed:** `tsc --noEmit` ✓ · `svelte-check` ✓ (382 tests, zero TS/Svelte errors)

**Pending manual:** run `pnpm --filter game-client dev`, open `localhost:5173`, verify live Scenario-1 run, DI meter, choice card dispatch, speed controls.

---

## Known gaps / deferred

1. **PEACE_STREAK_30 daily tick subscriber** — not yet implemented; PEACE goal milestones still unwritten. Deferred to P4d.
2. **Decision-moment detection suite** — DEATH_IMMINENT, DEPARTURE, SCENARIO_CRITICAL, PARTY_SELECTION, SCENARIO_GOAL moment detection not yet built. Deferred to P4d.
3. **Adventurer baseline mood** — freshly created adventurers have empty `moodFactors` → mood = 0 (DESPAIRING) after first day-tick. Seeds need a non-decaying baseline. Deferred.
4. **P5 browser smoke-test** — `pnpm --filter game-client dev` + visual check not yet done. Blocking gate for P6.

---

## Codebase map (`packages/core/src/`)

```
world/
  SeededRNG.ts               - mulberry32 PRNG; all randomness via ctx.rng
  SimulationContext.ts       - createSimulationContext; defaults: DI=50, treasury=0, reputation=0
  WorldClock.ts              - real-time interval; onTick, currentSpeed
  SimulationLoop.ts          - subscriber registry (fully wired as of P4b); setContext() public method
  WorldExpansion.ts          - createStartingRegions, worldExpansionSubscriber, updateReputation
  types.ts                   - ALL canonical types

adventurers/
  personality.ts             - fleeThreshold, questVolunteerWeight
  stateMachine.ts            - transitionState
  mood.ts                    - upsertMoodFactor, applyDayTickMood, moodSubscriber
  departureSystem.ts         - departureSubscriber
  PersonalGoals.ts           - checkGoalCompletion, applyGoalCompletion, personalGoalSubscriber
  HistoryLayer.ts            - contextualModifier (pure), appendHistoryEvent

relationships/
  graph.ts                   - applyStrengthShift, detectThresholdEvents

events/
  eventBus.ts                - emitEvent (typed union, template engine)
  socialResolver.ts          - socialEventSubscriber (grants DI on bond milestones)
  DecisionMomentDetector.ts  - decisionMomentSubscriber

quests/
  questSystem.ts             - questBoardSeedingSubscriber, createQuestExpirySubscriber,
                               partySelectionSubscriber, resolveQuest, questResolutionSubscriber
                               (writes milestones, clears pendingShifts, grants DI on success/death)

combat/
  beatGenerator.ts           - generateBeats (called from questResolutionSubscriber)

divine/
  DivineInfluence.ts         - diTrickleSubscriber, grantDI
  ProbabilityShifter.ts      - narrativeDistance, applyDivineShift
  DivineTools.ts             - dispatch (chooseOption writes to pendingShifts)

scenarios/
  ScenarioEngine.ts          - registerScenario, scenarioEvaluatorSubscriber
  scenario1.ts               - createScenario1Context, SCENARIO_1_ID, S1_IDS
```

## SimulationLoop subscriber order (as of P4b)

```
1.  advanceTime (implicit pre-step)
2.  moodSubscriber
3.  relationshipDecaySubscriber
4.  questBoardSeedingSubscriber       (weekly)
5.  createQuestExpirySubscriber()     (daily + drought tracking)
6.  partySelectionSubscriber          (daily)
7.  questResolutionSubscriber         (every tick)
8.  socialEventSubscriber             (daily)
9.  personalGoalSubscriber            (every tick)
10. decisionMomentSubscriber          (every tick)
11. departureSubscriber               (daily)
12. diTrickleSubscriber               (every tick)
13. scenarioEvaluatorSubscriber       (every tick)
14. worldExpansionSubscriber          (every tick)
```

---

## Key invariants (do not break)

- **No `Math.random()` in `packages/core/`** — all randomness via `ctx.rng`
- **Probability shifts, not outcomes** — tests assert shifted probability values, never rolled outcomes
- **`transitionState` opts** require `{ questId: QuestId | null; isDev: boolean }`
- **`tsc --noEmit` + `svelte-check` must both pass** before any Svelte edit is considered done
- **Svelte 5 store rule**: `export const store = $state({...})` — never `export let x = $state(...)`
- **`contextualModifier` is pure** — never stored on adventurer; always called on-demand
- **`ScenarioState.treasuryNegativeSince`** — must initialize to `null`
- **`questExpirySubscriber` singleton** is module-level; tests needing independent drought state must use `createQuestExpirySubscriber()` directly
- **`pendingShifts`** is a Map on `SimulationContext`; always copy-on-write (never mutate in place)

---

## Suggested next steps

1. **Manual browser smoke-test** — `pnpm --filter game-client dev`, open `localhost:5173`, verify live run
2. **`/specops`** — read `plans/phase-6-narrator.md`, start P6 only after browser gate passes
3. **`/audit-spec-drift`** — optional re-run to catch any P5 screen spec gaps before P6

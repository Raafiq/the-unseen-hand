# Handoff — The Unseen Hand (guild-sim)

_Last updated: 2026-06-28 (P6 session + handoff). Resume from this file at the start of the next session._

---

## Current status

**P4d complete. All planned phases done. DAG exhausted.**

| Phase | Plan file | Status |
|---|---|---|
| P1 — Foundation | `plans/phase-1-foundation.md` | done |
| P2 — Autonomous World | `plans/phase-2-autonomous-world.md` | done |
| P3 — Divine Intervention | `plans/phase-3-divine.md` | done |
| P4 — Scenario Engine | `plans/phase-4-scenario.md` | done |
| P4b — Simulation Wiring | `plans/phase-4b-simulation-wiring.md` | done |
| P4c — Mechanics Completion | `plans/phase-4c-mechanics-completion.md` | done |
| P4d — Decision-Moment Detection Suite | `plans/phase-4d-decision-moments.md` | done |
| P5 — UI | `plans/phase-5-ui.md` | done |
| P5b — E2E Smoke Tests | `plans/phase-5b-e2e.md` | done |
| P6 — Narrator & Visual Polish | `plans/phase-6-narrator.md` | done |

**Test baseline:** 429 Vitest tests, 33 test files + 6 Playwright E2E smoke tests. `tsc --noEmit` + `svelte-check` both clean (0 errors, 0 warnings).

---

## Recommended next work: P7 — Choice-Card E2E + Departure Shift Wiring

P4d is complete. The `pendingDecisions` array is now populated by 5 new moment kinds. The highest-value polish items:

1. **Departure shift wiring** — `departureSubscriber` doesn't yet consume `pendingShifts.get(adv.id)`. The DEPARTURE moment writes a `+0.30` shift but it's ignored at roll time. Fix: add `const diBoost = ctx.pendingShifts.get(adv.id) ?? 0` to the departure probability check in `departureSubscriber`, then clear the key from pendingShifts.
2. **Choice-card E2E test** — Playwright test that confirms a DEPARTURE or PARTY_SELECTION `ChoiceCard` actually appears in the UI when a qualifying condition fires. Route the simulation to a known state and assert the card renders.

**Lower priority (deferred from P6):**
- World map sidebar (clicking a region opens a true sidebar panel; currently just highlights the list)
- Narrator E2E test (Playwright route interception to mock `VITE_CLAUDE_API_KEY` response)

---

## What happened last session (P4d)

### Phase 4d — Decision-Moment Detection Suite

**Adventurer baseline mood**
- `packages/core/src/scenarios/scenario1.ts` — `makeAdventurer` now seeds `moodFactors: [{ id: 'BASELINE', value: 30, decayRate: 0 }]`; adventurers no longer despair on day 1.

**`DecisionMomentDetector.ts` — 5 new moment kinds:**
- `DEATH_IMMINENT` — fires when an active quest (prob < 0.40) resolves within 12 ticks; options shift survival probability to 0.50/0.80/0.95; player gets +10 DI on expiry.
- `DEPARTURE` — fires when an adventurer's `despairStreak ≥ 3` in IDLE/RESTING/SOCIALIZING; `subjectId` = adventurer ID; MOOD_LIFT option costs 8 DI.
- `SCENARIO_CRITICAL` — BANKRUPTCY: fires when `treasuryNegativeSince ≥ 96 ticks ago`; ROSTER_COLLAPSE: fires when exactly 2 living adventurers remain.
- `SCENARIO_GOAL` — driven by `ScenarioGoalDef.isImminent?` (new optional field); scenario1 implements it for SURVIVAL/SOLVENT (tick > 600 on-track) and BOND (strength ≥ 55).
- `PARTY_SELECTION` — fires when an available quest has prob < 0.30 for the best idle party; `subjectId` = comma-joined adventurer IDs; `chooseOption` fans out the shift to each.

**DivineTools.ts change:** `chooseOption` splits `subjectId` on `,` before writing `pendingShifts` — enables PARTY_SELECTION multi-target shifts.

**ScenarioEngine.ts:** exported `getScenario(id)` so DecisionMomentDetector can call `isImminent` without importing the private registry.

**PEACE_STREAK_30 milestone**
- `packages/core/src/adventurers/PersonalGoals.ts` — `personalGoalSubscriber` now fires `PEACE_STREAK_30` milestone for adventurers with PEACE goal that haven't participated in a QUEST event in the last 720 ticks; goal completion follows immediately.

**New test files:** `scenario1-baseline`, `decision-moment-departure`, `decision-moment-death`, `decision-moment-scenario-critical`, `decision-moment-scenario-goal`, `decision-moment-party`, `personal-goal-peace` (+37 tests; total 429).

---

## What happened in P6 (previous session)

### Phase 6 — Narrator & Visual Polish

**LLM Narrator**
- `packages/core/src/events/LLMNarrator.ts` — `getDayEvents()` + `buildNarratorPrompt()` (pure, 10 Vitest tests)
- Exported from `@ugs/core` public API
- `apps/game-client/src/lib/narrator.ts` — `fetchDaySummary()`: calls Anthropic API via `VITE_CLAUDE_API_KEY`; 10s timeout; returns `null` on error/timeout/no-key
- `simulationStore.svelte.ts` — `daySummaries: Map<number, string>`; render observer fires narrator async on day rollover
- `EventFeed.svelte` — events grouped by day; `DaySummaryBlock` (purple left-border, "Day N — Fate's Record") appears when summary arrives

**PixiJS Combat Replay**
- `CombatEvent` type extended: `beats?: CombatBeat[]` and `success?: boolean` (spec updated in `specs/behaviors/event-bus.md`)
- `questResolutionSubscriber` now writes beats into the BEAT_LOG event
- `apps/game-client/src/lib/components/CombatReplay.svelte` — modal: PixiJS canvas, beat transcript, Play/Pause, 1×/3× speed, Escape-to-close
- `EventFeed.svelte` — "Replay" button on BEAT_LOG events

**PixiJS World Map**
- `apps/game-client/src/lib/components/WorldMap.svelte` — PixiJS canvas (380×200); region nodes, paths, guild node, world-event indicators; click to select; `loadFailed` fallback
- `WorldPanel.svelte` — map embedded at top; selected region highlighted in list; all controls remain in DOM if canvas fails

---

## Known gaps / deferred

1. **Departure shift not consumed** — `departureSubscriber` doesn't read `pendingShifts` for the DEPARTURE moment's MOOD_LIFT option. The shift is written but ignored at roll time. → Next session
2. **Choice card dispatch not yet E2E-tested** — Playwright test confirming ChoiceCard renders for a triggered decision moment. → Next session
3. **World map sidebar** — clicking a region currently highlights the existing list; a true sidebar panel per `specs/screens/world-map.md` is deferred polish. → P6 polish
4. **Narrator E2E test** — Playwright route interception to mock API response; confirm `DaySummaryBlock` appears. → P6 polish

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
  DecisionMomentDetector.ts  - decisionMomentSubscriber (RELATIONSHIP_COLLAPSE implemented; others missing)
  LLMNarrator.ts             - getDayEvents, buildNarratorPrompt (pure; no I/O)

quests/
  questSystem.ts             - questBoardSeedingSubscriber, createQuestExpirySubscriber,
                               partySelectionSubscriber, resolveQuest, questResolutionSubscriber

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

## UI (`apps/game-client/src/`)

```
lib/
  simulationStore.svelte.ts  - $state snapshot; render observer on SimulationLoop; daySummaries Map
  narrator.ts                - fetchDaySummary; calls Anthropic API with VITE_CLAUDE_API_KEY
  components/
    RosterGrid.svelte         - adventurer cards sorted Living/Dead/Retired
    EventFeed.svelte          - day-grouped; DaySummaryBlock; Replay button on BEAT_LOG events
    ChoiceCard.svelte         - decision moment cards; DI cost; expiry countdown
    WorldPanel.svelte         - regions, difficulty shift, seed event picker, reputation + WorldMap
    CharacterDetail.svelte    - identity, goal progress, personality axes, divine touch sub-panel
    CombatReplay.svelte       - beat-by-beat replay modal; PixiJS canvas; Play/Pause/Speed/Close
    WorldMap.svelte           - PixiJS region map (380×200); nodes, paths, guild node; click to select
App.svelte                    - top bar, nav (4 tabs + badges), main panel, right panel
tests/
  smoke.spec.ts               - 6 Playwright E2E tests; runs against vite preview (port 4173)
playwright.config.ts          - Chromium only; webServer: vite preview; baseURL: http://localhost:4173
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
- **E2E test: build core first** — `pnpm --filter @ugs/core build` must run before `vite build` if dist is stale
- **Narrator API key** — Vite requires `VITE_` prefix; set `VITE_CLAUDE_API_KEY` in `.env.local`
- **PixiJS dynamic import** — `CombatReplay.svelte` and `WorldMap.svelte` use `await import('pixi.js')` inside `onMount`; never top-level
- **`CombatEvent.beats`** — `beats?: CombatBeat[]` and `success?: boolean` are optional; both present only on BEAT_LOG subtypes

---

## Suggested next steps

1. **P4d — Decision-Moment Detection Suite** ← recommended starting point. Read `specs/behaviors/decision-moments.md` and `packages/core/src/events/DecisionMomentDetector.ts`. Use `/specops` to author the plan, `/tdd` for each moment kind.
2. **Adventurer baseline mood** — add a `BASELINE` mood factor in `createScenario1Context` so freshly seeded adventurers don't immediately DESPAIR.
3. **PEACE goal milestones** — implement `PEACE_STREAK_30` daily subscriber in `PersonalGoals.ts`.
4. **Run `/audit-spec-drift`** — confirm no P6 spec gap before starting P4d.

---

## Suggested skills

- **`/specops`** — invoke before any planning or spec work; required to author or close out plan files in `plans/`
- **`/tdd`** — use for each plan step: red test → implement → green
- **`/audit-spec-drift`** — run to check for spec gaps before starting the next phase

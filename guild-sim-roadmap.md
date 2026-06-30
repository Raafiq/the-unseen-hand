# Master Product Backlog & Architecture Specification: The Unseen Hand [Working Title]

## Project Vision

A god-game simulation where the player is an unseen divine presence watching over a world of autonomous adventurers. The world runs without the player — adventurers take quests, form relationships, betray each other, grieve, and die on their own. The player is a storyteller-god: able to nudge probability, seed events, and touch individual souls — but never dictate outcomes. The primary joy is watching a story emerge, then choosing when and how to reach in.

**The core tension:** Every intervention costs Divine Influence. Every outcome the player chooses not to prevent refills it. Letting the world breathe makes you more powerful. Trying to save everyone makes you helpless.

**Inspired by:** *Our Adventurer Guild* (character attachment, guild management), *RimWorld* (emergent tragedy, colonist personalities), *Black & White* (god-scale intervention with resource cost), *Dwarf Fortress* (the event feed as story).

---

## What This Game Is Not

- Not a real-time tactical combat game. Fights resolve as a beat-by-beat narrative log, not an animated battle scene.
- Not a guild management optimizer. The player cannot directly hire, fire, or assign with efficiency as the goal — only influence probability.
- Not a city builder. The spatial world exists but is secondary to the people in it.

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Proven pattern; clean boundary enforcement |
| Simulation engine | Pure TypeScript (`packages/core`) | Zero DOM, zero UI, fully headless and testable |
| UI framework | Svelte 5 (DOM-first, no canvas) | Reactive roster cards and event feeds are HTML, not canvas |
| Build tool | Vite | Fast dev loop, pairs cleanly with Svelte 5 |
| Testing | Vitest (headless) | No browser required for engine tests |
| Visual layer (Phase 6+) | PixiJS v8 (optional) | World map / combat replay if needed — added then, not now |
| LLM narrator (Phase 5+) | Claude API (additive, not load-bearing) | Periodic prose synthesis over template output; degrades gracefully offline |

**Phaser is not used.** The TTE architecture needed Phaser for animated battle canvas. This game's UI is roster panels, event feeds, and choice cards — pure DOM work. No canvas framework is required until Phase 6.

---

## Monorepo Directory & Boundaries

```text
├── apps/
│   └── game-client/                   # Svelte 5 SPA — DOM-first god dashboard
│       ├── src/
│       │   ├── components/
│       │   │   ├── RosterGrid.svelte       # Adventurer cards: face, name, state, mood
│       │   │   ├── CharacterDetail.svelte  # Full profile: stats, history, relationships, Divine Touch
│       │   │   ├── EventFeed.svelte        # Chronological narrative log, filterable
│       │   │   ├── ChoiceCard.svelte       # Decision moment UI: options + DI costs
│       │   │   ├── WorldPanel.svelte       # Region map, difficulty controls, event seeding
│       │   │   └── QuestBoard.svelte       # Active and available quests
│       │   ├── stores/                     # Svelte 5 $state stores wrapping @ugs/core
│       │   └── App.svelte
├── packages/
│   └── core/                          # Pure TS simulation engine. Zero DOM.
│       ├── src/
│       │   ├── world/                 # World clock, tick loop, simulation context
│       │   ├── adventurers/           # Entity, personality axes, mood, state machine
│       │   ├── relationships/         # Graph, edge weights, threshold events
│       │   ├── combat/                # Beat-by-beat resolver, personality influence
│       │   ├── quests/                # Board, seeding, autonomous dispatch, outcome resolver
│       │   ├── events/                # Event bus, template engine, decision moment surfacing
│       │   ├── divine/                # DI resource, probability shifter, narrative distance
│       │   ├── scenarios/             # Scenario goals, win/lose detection, sandbox transition
│       │   └── index.ts               # Public API
│       └── tests/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

### Architecture Boundaries

1. **The Simulation (`packages/core`):** Single source of truth. Owns all state. No DOM, no Svelte, no PixiJS. Runs identically in Node and browser.
2. **The Dashboard (`apps/game-client`):** Reads reactive snapshots via `.svelte.ts` stores. Dispatches player commands. Never mutates core state directly.
3. **No EventBus bridge.** TTE required a Svelte/Phaser bridge. This game has no canvas scene — Svelte reads directly from stores that wrap simulation state.
4. **All randomness is seeded.** A seeded RNG flows through `SimulationContext`. Outcomes are reproducible. Save/load records seed + command history.

---

## Core Design Invariants

### Divine Influence (DI)
- Slow passive trickle (floor — player is never fully locked out)
- Bursts from meaningful world outcomes: quest completions, relationship milestones, personal goal achievements, deaths the player chose not to prevent
- Spent on interventions. Cost = f(narrative distance from natural outcome)
- Probability shifting only — never outcome dictation. A 95% chance is not a guarantee.

### Personality Axes (scored 0–100)
`courage`, `greed`, `empathy`, `loyalty`, `ambition`
- Each axis influences behaviour probabilities in combat, social events, and quest decisions
- History layer added in Phase 3: specific past events create contextual modifiers on top of base axes

### Relationship Graph
- Bidirectional weighted edges: strength −100 to +100
- Type thresholds: STRANGER → ACQUAINTANCE → FRIEND → TRUSTED_COMPANION / RIVAL → ENEMY
- Crossing a threshold unlocks emergent behaviours (e.g. TRUSTED_COMPANION charges to defend a downed ally)
- Modifier baseline applies continuously; threshold behaviours fire as discrete events

### Permadeath
- Death is permanent by default
- Player may spend DI to resist it — cost scales with how certain the death outcome was
- Saving everyone is mechanically self-defeating (DI bankruptcy)

### Command Pattern
```typescript
type UGSCommand =
  | { type: 'DIVINE_TOUCH'; adventurerId: string; effect: DivineEffect; diCost: number }
  | { type: 'SEED_EVENT'; regionId: string; eventType: WorldEventType; diCost: number }
  | { type: 'SHIFT_DIFFICULTY'; regionId: string; delta: number; diCost: number }
  | { type: 'CHOOSE_OPTION'; decisionId: string; optionIndex: number }
  | { type: 'SET_SPEED'; multiplier: 1 | 5 | 20 }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };
```

All player interventions flow through `Simulation.dispatch(command)`. The world runs autonomously without any commands — commands are interruptions, not requirements.

---

## The Complete Multi-Sprint Backlog

---

### Phase 1: World Simulation Foundation (Sprints 1–3)

**Goal:** A headless simulation that advances time, maintains adventurer state, and produces a stream of typed events. No UI. Proven entirely through Vitest.

---

#### Sprint 1: Monorepo Scaffold & World Clock

- [x] **Task 1.1: Repository Initialization**
    - New repository. pnpm workspace + Turborepo pipeline for `build`, `test`, `dev`.
    - `packages/core` as `@ugs/core`: strict TypeScript, `lib: ["ES2022"]`, no DOM lib, Vitest config.
    - `apps/game-client`: Svelte 5 + Vite, linked via `"@ugs/core": "workspace:*"`.

- [x] **Task 1.2: World Clock**
    - `WorldTime`: `{ tick: number; day: number; hour: number }`.
    - `WorldClock`: configurable real-time tick interval (default: 1 real second = 1 in-game hour). Emits typed `TICK` events.
    - Tick is the canonical unit. All systems subscribe to ticks.

- [x] **Task 1.3: Simulation Loop**
    - `SimulationLoop`: holds `WorldClock` + ordered tick subscriber registry.
    - `start()`, `stop()`, `step()` (manual advance for tests), `setSpeed(multiplier)`.
    - Subscribers receive `(ctx: SimulationContext, delta: number) => SimulationContext`. Immutable — each returns a new context.
    - `SimulationContext`: root object holding all world state + seeded RNG.

- [x] **Task 1.4: Headless Tests**
    - 24 ticks advances exactly 1 in-game day.
    - `step()` is deterministic: same seed + same commands = same outcome.
    - Subscriber order is stable across ticks.

---

#### Sprint 2: Adventurer Entity & Personality

- [x] **Task 2.1: Identity Schema**
    - `AdventurerIdentity`: `{ id, name, age, backstory: string, personalGoal: PersonalGoal }`.
    - `PersonalGoal`: `HEROISM | WEALTH | BELONGING | REVENGE | WANDERLUST | PEACE`.
    - `PersonalityAxes`: `{ courage, greed, empathy, loyalty, ambition }` (0–100 each).

- [x] **Task 2.2: Derived Behaviour Probabilities**
    - Pure functions: `fleeThreshold(axes)`, `shareLootChance(axes)`, `defendAllyChance(axes, relationship)`.
    - These are used by combat and social resolvers — not stored on the entity, computed on demand.
    - Vitest: verify axis values produce expected probability ranges.

- [x] **Task 2.3: Mood System**
    - `mood`: 0–100. Below 25 = `UNSATISFIED`. Below 10 = departure risk.
    - `MoodFactors`: named contributors with values and decay rates. Recalculated each day tick.
    - Mood influences quest volunteer probability and social interaction outcomes.

- [x] **Task 2.4: State Machine**
    - States: `IDLE | ON_QUEST | IN_DUNGEON | RESTING | SOCIALIZING | IN_DISPUTE | DEAD | RETIRED`.
    - Typed transitions with guards. Illegal transitions throw in development, are caught in production.
    - Vitest: all legal transitions pass; all illegal transitions are caught.

---

#### Sprint 3: Relationship Graph

- [x] **Task 3.1: Graph Schema**
    - `RelationshipGraph`: `Map<AdventurerId, Map<AdventurerId, RelationshipEdge>>`.
    - `RelationshipEdge`: `{ strength: number, type: RelationshipType, history: RelationshipEvent[] }`.
    - `RelationshipType`: `STRANGER | ACQUAINTANCE | FRIEND | TRUSTED_COMPANION | RIVAL | ENEMY`.

- [x] **Task 3.2: Relationship Tick**
    - Strength shifts based on shared activity: co-quest success/failure, proximity, time apart.
    - Long separation decays strength toward `STRANGER`.
    - All shifts computed as pure functions of context — no direct mutation.

- [x] **Task 3.3: Threshold Events**
    - Crossing type thresholds fires typed events: `FRIENDSHIP_FORMED`, `RIVALRY_FORMED`, `BOND_BROKEN`, `RECONCILIATION`.
    - Events carry both adventurer IDs + the edge state that triggered.
    - Threshold events are consumed by the event engine in Phase 2.

---

### Phase 2: The Autonomous World (Sprints 4–6)

**Goal:** The simulation generates a continuous stream of narrative events without player input. Quests are taken, fought, and resolved. Social events emerge. The event feed has content.

---

#### Sprint 4: Quest System

- [x] **Task 4.1: Quest Schema**
    - `Quest`: `{ id, type: QuestType, name, difficulty, duration, reward, risk, requiredPartySize, expiresAt }`.
    - `QuestType`: `BOUNTY | ESCORT | FETCH | DUNGEON | INVESTIGATION | RESCUE | POLITICAL`.
    - `QuestRisk`: `{ injuryChance, deathChance, criticalFailChance }`.

- [x] **Task 4.2: Quest Board Seeding**
    - Each in-game week: seed `N` new quests weighted by world region and current scenario context.
    - Quests expire. Board with no quests for 3 days fires a `QUEST_DROUGHT` world event.

- [x] **Task 4.3: Autonomous Party Selection**
    - Each day tick: if idle adventurers exist and open quests exist, attempt auto-assign.
    - Selection weights: personality-goal alignment, current mood, relationship compatibility of candidate party.
    - Player can override via `CHOOSE_OPTION` on a surfaced decision moment.

- [x] **Task 4.4: Quest Outcome Resolver**
    - `resolveQuest(quest, party, rng, diModifier): QuestOutcome`.
    - Base probability from party stats vs. difficulty. Modified by relationship cohesion, mood average, luck rolls.
    - `diModifier`: the probability shift from any player intervention on this quest.
    - `QuestOutcome`: `{ success, injuries, deaths, loot, reputationDelta, beats: CombatBeat[] }`.

---

#### Sprint 5: Beat-by-Beat Combat Log

- [x] **Task 5.1: Combat Beat Schema**
    - `CombatBeat`: `{ tick, actorId, action: BeatAction, outcome, personalityNote?: string }`.
    - `BeatAction`: `ATTACK | FLEE | DEFEND_ALLY | HESITATE | USE_ITEM | CRITICAL | NEAR_DEATH`.
    - `personalityNote`: populated when a personality axis caused a non-obvious decision (e.g. "courage 28 — hesitates at the opening").

- [x] **Task 5.2: Personality-Driven Beat Resolver**
    - Each beat: roll action probabilities against personality axes and context.
    - `courage < 30` in a losing fight → `FLEE` probability spikes.
    - Active `TRUSTED_COMPANION` relationship → `DEFEND_ALLY` fires when ally drops below 20% health.
    - `RIVAL` relationship → `HESITATE` when the rival needs help.

- [x] **Task 5.3: Beat Template Engine**
    - `renderBeat(beat, adventurerMap): string` — maps `CombatBeat` to a narrative sentence.
    - Template bank per `BeatAction` with variable slots for names, stats, and relationship context.
    - Vitest: every `BeatAction` has at least 3 template variants. No slot goes unfilled.

---

#### Sprint 6: Social Event Engine

- [x] **Task 6.1: Event Bus**
    - `SimulationEventBus`: typed pub/sub. Tick subscribers emit events. UI consumers subscribe by type.
    - Typed union: `SocialEvent | CombatEvent | QuestEvent | LifecycleEvent | WorldEvent | DecisionMomentEvent`.

- [x] **Task 6.2: Social Interaction Resolver**
    - Each day tick: for idle/resting adventurer pairs, roll social interaction probability weighted by `empathy` and `sociability`.
    - Outcomes: `POSITIVE_CHAT | ARGUMENT | BREAKTHROUGH | SILENT_DISTANCE`.
    - Each outcome adjusts relationship edge + fires a `SocialEvent` with a template-rendered narrative string.

- [x] **Task 6.3: Departure System**
    - `mood < 10` for 3 consecutive days → departure roll (probability scales with duration).
    - On departure: state → `RETIRED`, fire `AdventurerDeparted` with reason derived from top negative mood factors.
    - Departed adventurer persists in history. Their relationships remain on surviving adventurers.

---

### Phase 3: Divine Intervention System (Sprints 7–8)

**Goal:** The player has a resource to spend, tools to spend it with, and the simulation surfaces moments asking for their divine attention.

---

#### Sprint 7: Divine Influence Engine

- [x] **Task 7.1: DI Resource**
    - `divineInfluence`: 0–100. Stored in `SimulationContext`.
    - Passive trickle: +1 DI per in-game day (floor — never fully locked out).
    - Burst sources: quest completion (+5), relationship milestone (+8), personal goal achievement (+12), death not prevented (+10), scenario objective completed (+25).

- [x] **Task 7.2: Narrative Distance Calculator**
    - `narrativeDistance(naturalProbability, targetProbability): number` — how far the player is pushing against fate.
    - DI cost = `BASE_COST × narrativeDistance`. Reversing a 95% certain death costs ~10× more than nudging a 50/50.
    - Pure function. Fully testable. Used by both the choice card renderer and the freeform divine touch panel.

- [x] **Task 7.3: Probability Shifter**
    - `applyDivineShift(baseProbability, diSpent, context): shiftedProbability`.
    - Returns a clamped float. The simulation still rolls — a shifted 80% is not a guarantee.
    - DI is deducted from `SimulationContext` on shift application, before roll resolution.

---

#### Sprint 8: Decision Moment System & Freeform Tools

- [x] **Task 8.1: Decision Moment Surfacing**
    - `DecisionMomentDetector`: tick subscriber that scans world state for surface-worthy situations.
    - Trigger conditions: adventurer death imminent, relationship at breaking threshold, rare world event, scenario-critical moment.
    - Fires `DecisionMomentEvent`: `{ id, situationText, options: DecisionOption[], expiresAt }`.
    - `DecisionOption`: `{ label, description, diCost, probabilityShift, narrativeDistanceLabel }`.

- [x] **Task 8.2: Choice Resolution**
    - `Simulation.dispatch({ type: 'CHOOSE_OPTION', decisionId, optionIndex })`.
    - Applies the chosen option's probability shift, deducts DI, fires a `DivineInterventionEvent`.
    - "Let fate decide" option is always index 0, always costs 0 DI.
    - Expired decisions auto-resolve as "let fate decide."

- [x] **Task 8.3: Freeform Divine Touch (Individual Layer)**
    - `DivineEffect` union: `COURAGE_BLESS | LUCK_CURSE | MOOD_LIFT | SEND_DREAM | REVEAL_SECRET | MARK_FOR_DEATH`.
    - Each effect has a base DI cost + narrative distance multiplier based on target's current state.
    - `Simulation.dispatch({ type: 'DIVINE_TOUCH', adventurerId, effect, diCost })`.

- [x] **Task 8.4: Freeform World Seeding (World Layer)**
    - `WorldEventType`: `STORM | PLAGUE | WINDFALL | MONSTER_SURGE | TRAVELLING_MERCHANT | RUMOUR`.
    - `Simulation.dispatch({ type: 'SEED_EVENT', regionId, eventType, diCost })`.
    - `Simulation.dispatch({ type: 'SHIFT_DIFFICULTY', regionId, delta, diCost })`.
    - All costs validated against current DI before dispatch. Returns `{ ok: false, error }` if insufficient.

---

### Phase 4: Scenario Engine & Progression (Sprints 9–10)

**Goal:** The game has a beginning, a goal, and an ending state. New players have a structured entry point. Completing a scenario unlocks sandbox.

---

#### Sprint 9: Scenario System

- [x] **Task 9.1: Scenario Schema**
    - `Scenario`: `{ id, title, premise, goals: ScenarioGoal[], failConditions: FailCondition[], timeLimit?: number, startingRoster: AdventurerSeed[] }`.
    - `ScenarioGoal`: `{ description, condition: (ctx) => boolean, diReward }`.
    - `FailCondition`: `{ description, condition: (ctx) => boolean }`.

- [x] **Task 9.2: Scenario 1 — "The Failing Guild"**
    - Premise: A once-proud guild is down to 6 adventurers and a near-empty treasury. A harsh winter is coming.
    - Goal 1: Maintain at least 4 living adventurers through 30 in-game days.
    - Goal 2: Treasury above zero at day 30.
    - Goal 3 (optional): Two adventurers form a `TRUSTED_COMPANION` bond.
    - Fail condition: Roster drops below 2 OR treasury < 0 for 7 consecutive days.
    - Starting roster: 6 pre-seeded adventurers with varied personality axes and pre-existing relationships.

- [x] **Task 9.3: Win/Lose Detection & Sandbox Transition**
    - Each tick: evaluate all goal conditions and fail conditions.
    - On goal completion: fire `GoalAchieved`, grant DI burst, display summary.
    - On all goals met: fire `ScenarioComplete`, unlock sandbox mode.
    - On fail condition: fire `ScenarioFailed`, display outcome summary with what the world's story was.
    - Sandbox: simulation continues indefinitely, new scenarios can be seeded by player.

---

#### Sprint 10: Personal Goal Arcs & World Expansion

- [x] **Task 10.1: Personal Goal Progress Tracking**
    - Each adventurer tracks progress toward their `PersonalGoal` via accumulated milestone events.
    - `HEROISM`: landmark dungeon clears + near-death survivals. `WEALTH`: total gold earned. `BELONGING`: relationship milestones. `REVENGE`: specific antagonist defeated (seeded at world gen). `WANDERLUST`: regions explored. `PEACE`: days without combat.
    - Goal completion fires `PersonalGoalAchieved`: large mood spike + permanent trait shift + optional retirement decision.

- [x] **Task 10.2: History Layer (Personality Modifier)**
    - `AdventurerHistory`: ordered list of `HistoryEvent` with emotional weight tags.
    - `HistoryEvent` types that create contextual modifiers: `WITNESSED_DEATH`, `BETRAYED_BY`, `SAVED_BY`, `FIRST_KILL`, `NEAR_DEATH`.
    - `contextualModifier(axes, history, currentContext): axisAdjustment` — read-only, computed on demand.
    - Example: `WITNESSED_DEATH` of a `TRUSTED_COMPANION` adds −20 effective courage vs. undead enemies only.

- [x] **Task 10.3: World Expansion Trigger**
    - On scenario completion OR reputation crossing a threshold: new region unlocks.
    - New region seeds new quest types, new adventurer recruitment pool, new world events.
    - Simulation complexity scales with progression — early game is intimate and legible.

---

### Phase 5: Svelte 5 Dashboard UI (Sprints 11–13)

**Goal:** A DOM-first management dashboard wired to the live simulation. The player watches a world and reaches in.

---

#### Sprint 11: Store Bridge & App Shell

- [x] **Task 11.1: Reactive Store Layer**
    - `simulationStore.svelte.ts`: `$state` object wrapping `SimulationContext` snapshot.
    - Updated on each tick. Key properties: `adventurerMap`, `relationshipGraph`, `eventLog`, `questBoard`, `divineInfluence`, `worldTime`, `activeDecisionMoments`.
    - `Simulation.dispatch` wired to a store action function.

- [x] **Task 11.2: App Shell**
    - Top bar: world name, in-game date, DI meter (prominent — it's the player's core resource).
    - Left panel: navigation tabs (Roster, Quests, World, Events).
    - Main panel: active view.
    - Right panel: contextual detail (selected adventurer or active decision moment).
    - Speed controls: Pause / 1× / 5× / 20×.

- [x] **Task 11.3: DI Meter Component**
    - Visual DI bar: current / max with animated fill.
    - Recent DI changes shown as floating deltas (+10 from Mira's milestone, −15 from blessing).
    - Tooltip explaining what generates and costs DI.

---

#### Sprint 12: Roster, Character Detail & Divine Touch

- [x] **Task 12.1: Roster Grid**
    - Card per adventurer: portrait placeholder, name, state badge, mood bar, personal goal icon.
    - State colour-coding: green (idle), amber (on quest), red (in danger / dispute), grey (dead/retired).
    - Click → opens Character Detail in right panel.

- [x] **Task 12.2: Character Detail Panel**
    - Identity section: name, age, backstory, personal goal with progress bar.
    - Personality axes: radar chart or bar display (courage, greed, empathy, loyalty, ambition).
    - Mood: current score + top 3 active mood factors.
    - Relationships: list of known adventurers, relationship type badge, strength bar.
    - History: last 10 events involving this adventurer.

- [x] **Task 12.3: Divine Touch Sub-Panel**
    - Below character detail: available `DivineEffect` options for this adventurer.
    - Each shows: effect name, description, DI cost, and narrative distance label (LOW / MODERATE / EXTREME).
    - Greyed out if insufficient DI. Confirm dialog before spending.

---

#### Sprint 13: Event Feed, Choice Cards & World Panel

- [x] **Task 13.1: Event Feed**
    - Chronological list of rendered narrative strings from `SimulationEventBus`.
    - Filterable by type: Social, Combat, Quest, Lifecycle, World, Divine.
    - Click an entry → highlight involved adventurers in roster. Click again → open character detail.
    - Unread indicator on the Events nav tab.

- [x] **Task 13.2: Choice Card UI**
    - Active decision moments render as cards in the right panel (or as a modal overlay for urgent moments).
    - Card layout: situation text at top, option buttons below each showing label, description, DI cost, and distance label.
    - "Let fate decide" always present as a free option.
    - Expiry countdown timer visible. Expired cards collapse with a "resolved by fate" label.

- [x] **Task 13.3: World Panel**
    - Region list with current difficulty level and active world events.
    - Difficulty slider per region: player adjusts, DI cost shown in real-time.
    - "Seed Event" button: opens a picker of available `WorldEventType` options with costs.
    - Quest board sub-view: active and available quests with party assignments.

---

### Phase 6: Narrator Layer & Visual Polish (Sprint 14+)

**Goal:** The world sounds alive. Optional visual representations for combat and geography.

---

- [x] **Task 14.1: LLM Narrator Layer**
    - End of each in-game day: collect that day's `SimulationEvent` stream and pass structured context to Claude API.
    - Prompt: adventurer identities, personality axes, relationship states, events of the day → 2–3 sentence narrative paragraph.
    - Output rendered at the top of the event feed as a "day summary" block.
    - Gracefully disabled if no API key. Templates remain the load-bearing narrative.

- [x] **Task 14.2: Combat Beat Replay**
    - "Replay" button on completed quest cards.
    - Lightweight PixiJS v8 canvas mounts inside a modal.
    - Character icons on a simple field. Beats play out as icon animations + floating text.
    - No live battle — this is a reconstructed replay of the already-resolved `CombatBeat[]` array.

- [x] **Task 14.3: World Map View**
    - PixiJS canvas in the World Panel.
    - Region nodes connected by paths. Quest location markers. Adventurer icons moving toward quest destinations.
    - Clicking a region opens the region detail (difficulty, active events, current quests).

---

## Appendix: Agent Guardrails

### TypeScript Verification
Same as TTE: `tsc --noEmit` + `svelte-check` must both pass before any Svelte edit is considered verified.

### Svelte 5 Store Rule
```typescript
// ✅ CORRECT
export const simulationStore = $state({ adventurerMap: new Map(), divineInfluence: 50 });

// ❌ WRONG — state_invalid_export
export let divineInfluence = $state(50);
```

### Spec-Driven Development
This project uses specops. Every phase begins with a spec in `specs/`. No implementation without a red test first (TDD). Plans live in `plans/`.

### No Outcome Dictation in Tests
Test assertions should verify probability *shifts*, not fixed outcomes. Use seeded RNG to make test rolls deterministic, then assert the shifted roll used the correct probability.

```typescript
// ✅ CORRECT
const shifted = applyDivineShift(0.3, 20, ctx); // base 30%, 20 DI spent
expect(shifted).toBeGreaterThan(0.3);
expect(shifted).toBeLessThanOrEqual(1.0);

// ❌ WRONG
expect(outcome.success).toBe(true); // dictating outcome, not testing probability
```

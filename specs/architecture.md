# Architecture

Foundational technology decisions and monorepo structure for *The Unseen Hand*.

## Tech stack

| Layer | Technology | Version / notes |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | `pnpm-workspace.yaml` at root; `turbo.json` pipelines: `build`, `test`, `dev` |
| Simulation engine | Pure TypeScript | `packages/core` (`@ugs/core`); `lib: ["ES2022"]`, no DOM lib |
| UI framework | Svelte 5 | DOM-first; no canvas; runes API (`$state`, `$derived`, `$effect`) |
| Build tool | Vite | Dev server for `apps/game-client` |
| Testing | Vitest | Headless; runs in Node against `packages/core`; no browser required |
| Visual layer (Phase 6+) | PixiJS v8 | Optional; world map and combat replay only; not required until Phase 6 |
| LLM narrator (Phase 6+) | Claude API | Additive; degrades gracefully when no API key present |

**Phaser is not used.** No animated battle canvas. No canvas framework before Phase 6.

## Monorepo layout

```
├── apps/
│   └── game-client/                   # Svelte 5 SPA — DOM-first god dashboard
│       ├── src/
│       │   ├── components/
│       │   │   ├── RosterGrid.svelte
│       │   │   ├── CharacterDetail.svelte
│       │   │   ├── EventFeed.svelte
│       │   │   ├── ChoiceCard.svelte
│       │   │   ├── WorldPanel.svelte
│       │   │   └── QuestBoard.svelte
│       │   ├── stores/                # Svelte 5 $state stores wrapping @ugs/core
│       │   └── App.svelte
├── packages/
│   └── core/                          # Pure TS simulation engine. Zero DOM.
│       ├── src/
│       │   ├── world/                 # WorldTime, WorldClock, SimulationLoop, SimulationContext
│       │   ├── adventurers/           # AdventurerEntity, personality axes, mood, state machine
│       │   ├── relationships/         # RelationshipGraph, edge weights, threshold events
│       │   ├── combat/                # Beat-by-beat resolver, personality influence
│       │   ├── quests/                # QuestBoard, seeding, autonomous dispatch, outcome resolver
│       │   ├── events/                # SimulationEventBus, template engine, decision moment surfacing
│       │   ├── divine/                # DI resource, probability shifter, narrative distance
│       │   ├── scenarios/             # Scenario goals, win/lose detection, sandbox transition
│       │   └── index.ts               # Public API
│       └── tests/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Architecture boundaries

### 1. Simulation (`packages/core`) is the single source of truth

- Owns all state. No DOM dependency, no Svelte, no PixiJS.
- Runs identically in Node and browser.
- Exports a single public API via `src/index.ts`.
- UI never mutates core state directly.

### 2. Dashboard (`apps/game-client`) is a view, not an actor

- Reads reactive snapshots via `.svelte.ts` stores.
- Dispatches player commands via `Simulation.dispatch(command)`.
- Never reaches into `packages/core` internals past the public API.

### 3. No EventBus bridge between Svelte and the simulation

- Svelte reads directly from stores that wrap simulation state.
- No separate bridging layer (unlike canvas-based architectures).

### 4. All randomness is seeded

- A seeded PRNG is threaded through `SimulationContext`.
- No system uses `Math.random()` directly.
- Same seed + same command history = same outcome, always.
- Required for save/load and deterministic tests.

## TypeScript conventions

- `packages/core`: `strict: true`, `lib: ["ES2022"]`, no `"DOM"` in lib.
- `apps/game-client`: Svelte 5 runes; `tsc --noEmit` + `svelte-check` must both pass.
- Exports from `packages/core` are pure values and types — no classes with side effects in constructors.

## Svelte 5 store convention

```typescript
// ✅ Correct — object export with $state inside
export const simulationStore = $state({ adventurerMap: new Map(), divineInfluence: 50 });

// ❌ Wrong — state_invalid_export
export let divineInfluence = $state(50);
```

## Command pattern

All player interventions flow through `Simulation.dispatch(command: UGSCommand)`. The world runs autonomously without commands — commands are interruptions, not requirements.

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

`dispatch` returns `{ ok: true } | { ok: false; error: string }`. Callers must check `ok` before assuming effect.

## Testing conventions

- All tests live in `packages/core/tests/`.
- Tests use `step()` for manual tick advance — never real timers.
- Probability-shift tests assert the shifted value, not the rolled outcome (see [principles.md — Probability shift, not outcome override](./principles.md#probability-shift-not-outcome-override)).
- Every public behavior must have at least one Vitest test before implementation is considered complete.

## Principles

**Inherited** — project-wide principles that especially govern architecture:
- [Headless correctness first, visual representation second](./principles.md#headless-correctness-first-visual-representation-second) — the architecture is designed so `packages/core` is the only layer that must be correct; the UI is always replaceable.
- [Seeded determinism](./principles.md#seeded-determinism) — the monorepo boundary and the command pattern both exist to make seeded replay possible.

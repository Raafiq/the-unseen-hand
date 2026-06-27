# Specs

Specifications for *The Unseen Hand* — the source of truth for what the software should do.

## What specs are

Specs declare **desired state** — what must be true when the software is correct. They answer "what" and "under what conditions", not "how". Implementation is brought into conformance with specs, not the other way around.

If the code diverges from a spec, that's a bug. If a spec is wrong, fix the spec first, then fix the code.

## Directory layout

```
specs/
├── README.md              ← this file
├── principles.md          ← project-wide decisive trade-off rules
├── architecture.md        ← tech stack, monorepo boundaries, foundational decisions
├── data-model.md          ← canonical type definitions, field semantics, enumerations
├── behaviors/             ← cross-cutting simulation rules (one file per system)
│   ├── world-clock.md
│   ├── simulation-loop.md
│   ├── adventurer-entity.md
│   ├── personality-system.md
│   ├── mood-system.md
│   ├── relationship-graph.md
│   ├── quest-system.md
│   ├── combat-resolution.md
│   ├── social-events.md
│   ├── event-bus.md
│   ├── departure-system.md
│   ├── divine-influence.md
│   ├── decision-moments.md
│   ├── divine-tools.md
│   ├── scenario-engine.md
│   ├── personal-goals.md
│   ├── history-layer.md
│   ├── world-expansion.md
│   └── llm-narrator.md
└── screens/               ← UI dashboard screens (one file per screen/view)
    ├── app-shell.md
    ├── roster-grid.md
    ├── character-detail.md
    ├── event-feed.md
    ├── world-panel.md
    ├── choice-card.md
    ├── combat-replay.md
    └── world-map.md
```

## Workflow

1. **Spec first.** Before changing behavior, update the spec. Get it accepted. Then implement.
2. **Implement to spec.** Read the spec before writing code. The spec answers "what"; you decide "how".
3. **Verify against spec.** When done, check every display rule, action, and invariant.
4. **Specs and plans travel together.** Feature work lives in `plans/`. A plan names the spec files it implements. The plan freezes to `done` when its validation criteria are checked off.

## Phase map

| Phase | Sprints | Spec files |
|---|---|---|
| 1 — World Simulation Foundation | 1–3 | `architecture.md`, `data-model.md`, `behaviors/world-clock.md`, `simulation-loop.md`, `adventurer-entity.md`, `personality-system.md`, `mood-system.md`, `relationship-graph.md` |
| 2 — Autonomous World | 4–6 | `behaviors/quest-system.md`, `combat-resolution.md`, `social-events.md`, `event-bus.md`, `departure-system.md` |
| 3 — Divine Intervention | 7–8 | `behaviors/divine-influence.md`, `decision-moments.md`, `divine-tools.md` |
| 4 — Scenario Engine | 9–10 | `behaviors/scenario-engine.md`, `personal-goals.md`, `history-layer.md`, `world-expansion.md` |
| 5 — Dashboard UI | 11–13 | `screens/app-shell.md`, `roster-grid.md`, `character-detail.md`, `event-feed.md`, `world-panel.md`, `choice-card.md` |
| 6 — Narrator & Visual | 14+ | `behaviors/llm-narrator.md`, `screens/combat-replay.md`, `world-map.md` |

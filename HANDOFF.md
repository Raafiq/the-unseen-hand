# Handoff — Begin Implementation (Phase 0 + Phase 1)

**Project:** "The Unseen Hand" — a spec-driven (specops) god-game simulation.

## Read first

The 31 specs in `specs/` are complete and are the **source of truth** — read the relevant spec before writing any code. The full rollout plan is at `C:\Users\mdraa\.claude\plans\lazy-squishing-umbrella.md` — read it before starting.

- **Granularity:** one plan file per roadmap phase (6 plans), built strictly linearly.
- **Method:** each phase is implemented spec-first and test-first (TDD: one red test from a spec's Validation bullet → minimum code to pass → repeat).
- **Environment:** Windows + PowerShell. Not yet a git repo (offer `git init` at some point).

## Do P0 first, then start P1.

---

## P0 — Tooling setup

1. Create `plans/` + `plans/README.md` (motion-vs-state blurb + pointer to the specops skill's `references/plans-protocol.md`; **no** hand-drawn DAG or status table).
2. Create root `CLAUDE.md` with the specops hook block (skill path `C:\Users\mdraa\.claude\skills\specops`) plus the project guardrails from the roadmap appendix:
   - TS verification: `tsc --noEmit` + `svelte-check` must both pass before any Svelte edit is verified.
   - Svelte 5 store rule (`export const store = $state({...})`, never `export let x = $state(...)`).
   - Tests assert probability **shifts**, never fixed outcomes.
3. Install the drift auditor:
   - Copy `C:\Users\mdraa\.claude\skills\specops\references\spec-drift-auditor.md` → `.claude/agents/spec-drift-auditor.md` (set its Phase 3 inventory to `packages/core/src/` + `apps/game-client/src/`).
   - Copy `C:\Users\mdraa\.claude\skills\specops\references\audit-spec-drift.md` → `.claude/commands/audit-spec-drift.md`.
4. Write all 6 phase-plan files as `status: planned` stubs with frontmatter (`depends`, `specs:`) so the DAG is queryable. Plan→spec mapping is in the rollout plan.
5. **Verify:** `C:\Users\mdraa\.claude\skills\specops\scripts\specops` shows P1 as the next ready plan; `/audit-spec-drift` command exists.

---

## P1 — Phase 1: World Simulation Foundation

**Implements:** `specs/architecture.md`, `specs/data-model.md`, and `specs/behaviors/{world-clock, simulation-loop, adventurer-entity, personality-system, mood-system, relationship-graph}.md`

Set the P1 plan to `status: in-progress` when you begin. Build in this order, TDD throughout:

1. **Monorepo scaffold** — pnpm workspaces + Turborepo (`build`/`test`/`dev` pipelines), `packages/core` as `@ugs/core` (strict TS, `lib:["ES2022"]`, no DOM lib, Vitest), `apps/game-client` Svelte 5 + Vite linked `"@ugs/core": "workspace:*"`. Verify `pnpm -w build` and `pnpm -w test` run green on an empty suite.
2. **Seeded RNG + `SimulationContext`** — the determinism backbone everything threads through. **No `Math.random()` anywhere.**
3. **`WorldClock` + `SimulationLoop`** — tick/day/hour, `step()`, `setSpeed`, ordered immutable subscriber registry (each returns a new context).
4. **Adventurer + personality + mood + state machine** — pure derived-probability functions (`fleeThreshold`, `defendAllyChance`, `questVolunteerWeight`), decaying mood factors, guarded state transitions.
5. **Relationship graph** — symmetric edges, strength→type thresholds, threshold events.

**Done when:** every Validation bullet in those six specs has a passing Vitest test, and `/audit-spec-drift` shows no Phase-1 gap. Then fill the P1 plan's Notes/Follow-ups and flip it to `status: done`.

---

## Per-phase loop (P1–P6)

1. Set the phase plan `status: in-progress`.
2. For each behavior/screen: read its spec, then `/tdd` — one failing test from a Validation bullet, minimum code to pass, repeat.
3. When all the phase's Validation bullets pass, run `/audit-spec-drift` to confirm no spec↔code gap.
4. Fill the plan's Notes + Follow-ups, flip to `status: done` in the closeout commit.
5. `scripts/specops next` surfaces the following phase.

## Phase dependency order

```
P0 tooling → P1 foundation → P2 autonomous-world → P3 divine
          → P4 scenario → P5 ui → P6 narrator
```

Phases 1–4 are pure `@ugs/core`, proven entirely in Vitest (headless correctness first). P5 is the first UI. P6 is additive polish (LLM narrator + PixiJS), each degrading gracefully.

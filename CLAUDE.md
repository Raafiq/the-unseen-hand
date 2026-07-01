# The Unseen Hand — Agent Instructions

## Spec-driven development (specops)

This project uses spec-driven development. `specs/` is the source of truth for what
*should be true*; `plans/` is the work-in-flight DAG that bridges specs to merged code.
The **specops** skill carries the full methodology — invoke it (the skill triggers on
"spec", "plan", starting a feature, etc.) before writing specs, planning, or building.

- **Specs lead.** Before changing behavior, change the spec; bring code into conformance
  after. Spec↔code drift is a bug, not debt.
- **`plans/` is the planning system — not your built-in plan mode.** Every chunk of work
  lands as a file in `plans/` that freezes to `done` as the durable record of what got
  built. Don't let an ephemeral plan substitute for it, and don't skip it for "small"
  changes. (Classic trap: an ad-hoc plan of "write spec X, then build it" that ends with
  neither a reviewed spec nor a plan file — split those into the two real artifacts.)
- **When to author a plan depends on intent:** mapping out a batch of specs → finish the
  batch first, then propose a *set* of plans; speccing one bounded feature in a mature
  project → draft the spec change and its plan in tandem; intent unclear → ask. The skill
  details each mode.
- **A spec change ripples to its plans.** After editing a spec, review the plans that
  implement it (`grep -l '<spec-path>' plans/*.md`) and offer to update them.

Query the DAG:

```powershell
C:\Users\mdraa\.claude\skills\specops\scripts\specops next   # what to work on next
C:\Users\mdraa\.claude\skills\specops\scripts\specops dag    # dependency graph
```

Run `/audit-spec-drift` to compare specs against the implementation.

---

## Commands

Monorepo uses **pnpm** workspaces + **turbo**. Two packages: `@ugs/core`, `@ugs/game-client`.

```powershell
pnpm build                                  # turbo: build all
pnpm test                                   # turbo: test all
pnpm --filter @ugs/core test                # core unit tests (vitest run)
pnpm --filter @ugs/core exec tsc --noEmit   # core typecheck (guardrail)
pnpm --filter @ugs/game-client check        # svelte-check (guardrail)
pnpm --filter @ugs/game-client test:e2e     # Playwright e2e (builds first)
pnpm --filter @ugs/game-client dev          # vite dev server
```

## Architecture

- **`packages/core`** (`@ugs/core`) — deterministic sim engine, no UI. Public API in
  `src/index.ts`. Domains: `adventurers/`, `combat/`, `quests/`, `divine/`,
  `relationships/`, `events/`, `world/`, `scenarios/`.
- **`apps/game-client`** (`@ugs/game-client`) — Svelte 5 + Pixi.js UI. E2E in `tests/`.
- **Determinism backbone:** `world/SimulationContext.ts` + `SeededRNG`. The loop drives
  **tick subscribers** (`SimulationLoop`), which are the authoritative write sites for
  side effects (milestones, DI bursts, `pendingShifts`, decision moments) — hence the
  "test through the subscriber" rule below.

---

## Project guardrails

**Package-specific guardrails live in each package's `CLAUDE.md`** and auto-load
when you work in that subtree:

- **`packages/core/CLAUDE.md`** — sim-engine rules: probability-shift testing,
  test-through-the-subscriber, no `Math.random()`, `createSimulationContext` seeds,
  roster-index arithmetic, decision-moment cooldown keys.
- **`apps/game-client/CLAUDE.md`** — UI rules: `tsc` + `svelte-check` gate, Svelte 5
  store pattern, `svelte.config.js` requirement, typed enum-label Records, the
  EventFeed three-update rule, no manual browser gates, auto-pause speed restore.

For a task that spans both packages, consult both files.

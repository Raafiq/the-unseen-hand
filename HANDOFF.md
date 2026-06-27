# Handoff — Close out P1 + start P2

**Project:** "The Unseen Hand" — spec-driven god-game sim  
**Repo:** `C:\Users\mdraa\projects\guild-sim`

## Read first

- Full rollout plan: `C:\Users\mdraa\.claude\plans\lazy-squishing-umbrella.md`
- Active plan: `plans/phase-1-foundation.md` (status: in-progress)
- Source of truth for any behavior: `specs/` (never deviate from spec without changing it first)

---

## Current state

**P0** is complete. **P1 steps 1–5 are all implemented** but not yet committed or closed out.

`git status` shows:
- Modified: `packages/core/package.json`, `src/index.ts`, `src/world/types.ts`, `tsconfig*.json`, `plans/phase-1-foundation.md`
- Untracked: `WorldClock.ts`, `SimulationLoop.ts`, `src/adventurers/`, `src/relationships/`, all new test files, `pnpm-lock.yaml`

**Test run: 100 tests, 9 files, all passing.** Nothing is staged yet.

### What was implemented (all P1 steps)

| Step | Files | Tests |
|---|---|---|
| Scaffold + SeededRNG + SimulationContext | committed at `cc1a9ef` | 14 tests |
| WorldClock | `src/world/WorldClock.ts` | `tests/world-clock.test.ts` (7) |
| SimulationLoop | `src/world/SimulationLoop.ts` | `tests/simulation-loop.test.ts` (6) |
| Personality (pure functions) | `src/adventurers/personality.ts` | `tests/personality.test.ts` (14) |
| State machine | `src/adventurers/stateMachine.ts` | `tests/state-machine.test.ts` (12) |
| Mood system | `src/adventurers/mood.ts` | `tests/mood.test.ts` (22) |
| Relationship graph | `src/relationships/graph.ts` | `tests/relationship-graph.test.ts` (25) |

Types updated: `Adventurer` now has `despairStreak: number` field (added to track consecutive despairing days).

---

## What to do this session

### 1. Verify the build is clean

```powershell
cd C:\Users\mdraa\projects\guild-sim
node_modules/.bin/turbo run build test
grep -r "Math.random" packages/src   # should return nothing (doc comments in dist are fine)
```

### 2. Tick all earned Validation boxes in `plans/phase-1-foundation.md`

All boxes except the last two (`/audit-spec-drift` and `pnpm -w build on fresh clone`) should be `[x]`. Check them manually against the 100 passing tests.

### 3. Run the drift audit

```
/audit-spec-drift
```

Fix any Phase-1 gaps it surfaces before closing the plan.

### 4. Commit all the uncommitted work

Stage and commit everything:
- New source files (WorldClock, SimulationLoop, adventurers/, relationships/)
- Updated tsconfig files, package.json, pnpm-lock.yaml
- Updated index.ts and types.ts

Use a descriptive commit message covering steps 3–5.

### 5. Closeout commit for P1

In the final commit before declaring done:
- Flip `plans/phase-1-foundation.md` to `status: done`
- Tick the remaining Validation boxes (`[x]`)
- Populate the **Notes** and **Follow-ups** sections
- Commit message: `chore(plans): mark phase-1-foundation done`

### 6. Verify specops shows P2 as next

```powershell
node C:\Users\mdraa\.claude\skills\specops\scripts\specops.mjs next --dir plans
```

Should show `phase-2-autonomous-world` as the only ready plan.

### 7. Begin P2 — The Autonomous World

Specs to implement (read each before coding):
- `specs/behaviors/event-bus.md` — build first; everything else emits through it
- `specs/behaviors/quest-system.md`
- `specs/behaviors/combat-resolution.md`
- `specs/behaviors/social-events.md`
- `specs/behaviors/departure-system.md`

Mark `plans/phase-2-autonomous-world.md` `status: in-progress` before starting.
Use `/tdd` for each behavior: one red test → minimum code to pass → repeat.

---

## Guardrails (enforced in CLAUDE.md)

- No `Math.random()` anywhere in `packages/core`. All randomness through `SimulationContext.rng`.
- Tests assert **probability shifts**, not rolled outcomes.
- `tsc --noEmit` + `svelte-check` both pass before any Svelte edit is verified.
- Svelte 5: `export const store = $state({...})` — never `export let x = $state(...)`.

## Suggested skills

- `/specops` — before any spec or plan work; use `specops next` / `dag` to query the DAG
- `/tdd` — for each P2 behavior (one red test, minimum code, green, repeat)

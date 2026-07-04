# Handoff — implement p15a (world-clock turn-gate)

Focus of next session: **implement plan `p15a-world-clock-turn-gate` test-first.** All specs +
plans for the events cycle-redesign (Phase 15) are written and accepted; **nothing is
implemented yet.** p15a is the ready root of the DAG.

## Goal

Bring `@ugs/core` into conformance with the rewritten `specs/behaviors/world-clock.md`: add the
3-cycle day + a `PROCEED` operation that computes exactly one cycle (8 ticks) synchronously,
halts, and returns a cycle digest `{fromTick,toTick,day,cycle}`. Retire the real-time speed model
(but see "deprecate, don't delete" gotcha). **Done =** all p15a Validation checkboxes pass, core
`tsc --noEmit` + `pnpm --filter @ugs/core test` green, and the game-client still builds.

Full spec of the work: **`plans/p15a-world-clock-turn-gate.md`** — read it first, it is the
contract. Don't re-derive scope from this file.

## Current state

- **Spec-first phase COMPLETE & user-accepted** (reviewed via Lavish, verdict "accept all five").
  8 specs changed, 0 code changed. Everything below is **uncommitted on `main`** (trunk-based;
  commit only when the user asks).
- Specs written: `specs/principles.md` (autonomy principle rewritten → heading is now
  `## Autonomy of outcomes; player-controlled tempo`), `specs/behaviors/world-clock.md` (rewrite),
  `specs/behaviors/cycle-narrative.md` (**new**), `specs/screens/event-feed.md` (rewrite),
  `specs/screens/app-shell.md`, plus ripples `specs/behaviors/narrative-voice.md`,
  `specs/behaviors/llm-narrator.md`, `specs/behaviors/decision-moments.md`, and 10 anchor-link
  fixes across other specs.
- Plans authored (all `status: planned`): `plans/p15a..p15e`. DAG verified:
  `specops next` → p15a ready (unblocks 4); p15b⇐p15a; p15c⇐p15b; p15d⇐p15a,p15b; p15e⇐p15a,p15d.
- Guardrail baseline (from prior session, pre-redesign): core `tsc` clean, ~621 core tests,
  `svelte-check` clean, 16/16 e2e. Re-run to confirm before editing.

## Next steps (in order)

1. `C:\Users\mdraa\.claude\skills\specops\scripts\specops next` — confirm p15a is ready.
2. Read `plans/p15a-world-clock-turn-gate.md` + `specs/behaviors/world-clock.md` fully.
3. Set p15a `status: in-progress` in its frontmatter.
4. Invoke **tdd** skill. Implement per plan, red→green per behavior:
   a. Add `cycle` + `cycleOf` to the `WorldTime` type — `packages/core/src/world/types.ts`
      (WorldTime type lives here). `Cycle = 'MORNING'|'AFTERNOON'|'NIGHT'`;
      `cycleOf(hour)= hour<8?MORNING:hour<16?AFTERNOON:NIGHT`.
   b. Populate `cycle` at **every** WorldTime write site (see two-clock gotcha): `advanceTime(...)`
      (the loop's real per-tick advance) AND `WorldClock.step()`
      (`packages/core/src/world/WorldClock.ts:37`).
   c. Add a `proceed(): CycleDigest` op that runs the loop's tick 8× and returns
      `{fromTick,toTick,day,cycle}`. The real advance API is **SimulationLoop methods**
      (`SimulationLoop.step()` → `_tick()` → `advanceTime`, `SimulationLoop.ts:100,124`), NOT a
      command `dispatch`. Add `proceed()` to `SimulationLoop` composing 8× `_tick()`; capture
      fromTick before, toTick after.
   d. **Deprecate (do not delete)** `setSpeed/start/stop/pause/resume/currentSpeed` on both
      `WorldClock` and `SimulationLoop` — leave as shims w/ a `// deprecated: removed in p15e`
      comment so the client keeps compiling. Deletion + UI is p15e's job.
5. Run core `tsc --noEmit` + tests; confirm game-client still builds
   (`pnpm --filter @ugs/game-client check`). Check off Validation items in the plan.
6. **verify** skill: drive a short PROCEED sequence, assert digest + WorldTime progression.
7. Do NOT auto-commit. Report back; the user chose whether to commit the spec+plan+code together.

## Key files & locations

- Plan (the contract): `plans/p15a-world-clock-turn-gate.md`
- Spec: `specs/behaviors/world-clock.md` (Validation section lists exact expected values)
- `packages/core/src/world/WorldClock.ts` — `step()`:37 (adds cycle here), `setSpeed`:47,
  `start/stop`:56/61, `pause/resume`:68/72, `currentSpeed`:29, `SpeedMultiplier`:11. `_worldTime`
  init `{tick:0,day:0,hour:0}`:20 (add `cycle:'MORNING'`).
- `packages/core/src/world/SimulationLoop.ts` — `_tick()`:124 (calls `advanceTime(this._ctx)`:126
  then subscribers), `step()`:100, method shims `start/stop/pause/resume/setSpeed`:104-122,
  `setContext`:96, clock wired at `onTick(()=>this._tick())`:54. Add `proceed()` here.
- `packages/core/src/world/types.ts` — `WorldTime` type def (add `cycle`); grep `advanceTime`
  to find the loop's per-tick time-advance function (it, not WorldClock.step, sets the context's
  worldTime).
- Core public API barrel: `packages/core/src/index.ts` (export `Cycle`, `cycleOf`, digest type).
- Client speed usage (p15e scope, leave alone now): `apps/game-client/src/lib/simulationStore.svelte.ts`,
  `apps/game-client/src/App.svelte`, `CharacterDetail.svelte`, `CombatReplay.svelte`.

## Decisions & rationale (do not relitigate — user signed off 2026-07-04)

- **Fully turn-based** cadence, **Morning/Afternoon/Night** cycles (8 ticks each), **hybrid
  LLM+template** narrative, **feed kept as raw-log drill-down** beneath per-character reads. These
  4 forks are locked (Lavish design session). Rationale + genre grounding (Wildermyth / Persona /
  Football Manager) in memory `project-events-cycle-redesign` and `.lavish/*.html`.
- **Principle rewrite APPROVED:** "Autonomy is the default" → "Autonomy of outcomes;
  player-controlled tempo." Outcome-autonomy preserved (defaults resolve everything, moments
  auto-expire); only *tempo* moved to the player. `principles.md` carries a `> History:` note.
- **Deprecate-don't-delete** the speed API in p15a → keeps the monorepo green between p15a and
  p15e. Final removal + top-bar Proceed UI is p15e. This is deliberate sequencing, not laziness.
- `PROCEED` = deterministic loop over the existing `step()` primitive → inherits replay
  determinism and unchanged subscriber ordering for free.

## Gotchas & dead ends

- **TWO time representations.** `WorldClock._worldTime` (the interval-driver counter) and the
  **context** worldTime advanced by `advanceTime()` inside `SimulationLoop._tick()` are separate.
  The context time is the authoritative one the sim/digest uses. You must add `cycle` to the
  `WorldTime` type and set it in **both** advance sites, and `proceed()` must read fromTick/toTick
  from the **context** (`this._ctx`/`getContext`), not from `WorldClock._worldTime`. Verify which
  one the UI/store reads before trusting either.
- **No `dispatch({type:'PROCEED'})` exists.** Despite the spec's prose, the real API is loop
  methods. Add `proceed()` as a method; don't invent a command bus.
- **Determinism is law** (`packages/core/CLAUDE.md`): no `Math.random()`; all rng via
  `SimulationContext.rng`; same seed+commands ⇒ identical WorldTime + events. `proceed()` must not
  touch `Date.now()`/`Math.random()`.
- **Tick-subscriber ordering is load-bearing** — `proceed()` must drive the existing `_tick()`
  path unchanged (advanceTime first, then subscribers in registration order). Do not reorder.
- **`createSimulationContext(seed)` needs a seed** or it crashes in `xmur3` (no compile guard).
- Test rules (core `CLAUDE.md`): assert probability shifts not outcomes; test through subscribers;
  build the condition directly rather than running a 30-day loop.

## Suggested skills

- **specops** — mark p15a in-progress at start; run the closeout ritual (flip to `done`, fill
  Notes/Follow-ups) at end. `scripts/specops next|dag` to navigate the DAG.
- **tdd** — red→green per behavior for the cycle/PROCEED logic (spec Validation = the test list).
- **verify** — drive PROCEED end-to-end after green to confirm real digest/time behavior.
- After p15a: p15b (cycle-narrative-engine) is next; p15c ∥ p15d then p15e.

## Reference (don't duplicate)

- Locked design + rationale: memory `project-events-cycle-redesign` (index in
  `~/.claude/projects/.../memory/MEMORY.md`).
- Design + spec-review artifacts: `.lavish/events-dashboard-cycle-redesign.html`,
  `.lavish/spec-review-cycle-redesign.html`.
- Every plan body has Scope/Implements/Approach/Validation/Risks — read the plan, not a restatement.

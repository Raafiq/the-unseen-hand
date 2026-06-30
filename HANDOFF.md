# Handoff — The Unseen Hand (guild-sim)

_Updated 2026-06-30. **Task: BUILD `p10d-npc-system` via `/tdd`** (the last Phase-10 plan, and the
only `ready` plan). HEAD `94f2a68` on `main`, tree clean. p10b shipped this session (`94f2a68`) —
its span lifecycle is what p10d's FESTIVAL reuses (see §SPAN REUSE). Read
`plans/p10d-npc-system.md` in full first; this doc covers what the plan doesn't._

---

## Where Phase 10 stands

Phase 10 (Events Redesign) is 3 of 4 done: p10a (narrative voice), p10c (social pressure), p10b
(world-event durations) all `done`. **p10d is the last one.** `specops next` → `p10d-npc-system`
ready (deps `p10c` + `p10a` both met). Repo: 20 done, 2 cancelled, 0 blocked.

Verified baseline (end of p10b): **493 core Vitest green**, `tsc --noEmit` (core + client) clean,
`svelte-check` 0/0, no `Math.random()` in `packages/core/src`.

## Goal (p10d)

Add the two-tier town NPC population. **Tier A** notable NPCs (`NotableNpc`) become honorary actors
in the relationship graph and the p10c encounter model; **Tier B** nameless `TownRole` NPCs are pure
grammar flavour (`NPCEvent`, `kind:'NPC'`, `subtype:'TOWN_FLAVOUR'`). Plus a **FESTIVAL** town span.
**Done** = all 10 Validation boxes in `plans/p10d-npc-system.md` checked, `tsc` + `svelte-check` +
Vitest + Playwright E2E green, plan closed out per specops.

## Next steps (in order)

1. `chore(plans): mark p10d-npc-system in-progress` — flip frontmatter, commit (specops).
2. Read `plans/p10d-npc-system.md` Approach §1–7 + the three specs it implements (`npc-system.md`
   is the main one; also `event-bus.md`, `relationship-graph.md`, `world-expansion.md`).
3. Build test-first per the plan's §7 / Validation boxes. The **graph-key widening**
   (`Map<AdventurerId,…>` → `Map<ActorId,…>`) is the highest-blast-radius change — audit every
   relationship-graph consumer (combat, quest, departure, decision moments) for adventurer-only
   assumptions and `isNpc`-guard them (plan Risk #1).
4. **EventFeed 3-update rule** for the new `NPC` kind: `KIND_LABELS`, `ALL_KINDS`, `getInvolvedIds`
   (must resolve NPC ids → NPC name, not just `adventurerMap`). `tsc` only catches the first;
   the other two fail silently (CLAUDE.md EventFeed rule).
5. Verify (`tsc` + `svelte-check` + Vitest + `npm run test:e2e` in game-client, grep `Math.random`
   clean). Close out per specops; populate Notes + Follow-ups; mark `done`; closeout commit.

## SPAN REUSE — p10b → p10d FESTIVAL (read before wiring the festival)

p10b built a **reusable span lifecycle** in `packages/core/src/world/WorldExpansion.ts`:
`SPAN_DURATIONS`, `rollSpanDuration`, `activeSpans(ctx)`, `hasActiveSpan(ctx,type)`, plus private
`openSpan` / `sweepExpiredSpans` driven by `worldEventSeedingSubscriber`. Events carry
`WorldEvent.phase: 'START'|'END'`; grammar keys on phase (`WORLD:<type>:START`/`:END` in
`eventBus.ts` `BEAT_POOLS`). **But it is region-instance-based** — spans live in
`Region.activeWorldEvents` keyed by `WorldEventType`. Three gaps p10d must close to add FESTIVAL:

- `FESTIVAL` (and `FEUD`) are **not** in the code's `WorldEvent`/`WorldEventInput` subtype unions
  (`types.ts:302`, `eventBus.ts:60`) **nor** in `WorldEventType` (`types.ts:392`). The spec
  (`event-bus.md:132`) already lists them — pre-existing drift, deliberately left for p10c/p10d.
  Decide whether FESTIVAL becomes a `WorldEventType` (and gets a `SPAN_DURATIONS` entry) or rides a
  separate town-span field.
- FESTIVAL is **town-level**, not region-scoped — the current `openSpan`/`sweep` attach to one
  region's `activeWorldEvents`. Either attach the festival to a region anyway (simplest) or
  generalize the lifecycle to a town-level span store. Pick one, document in plan Notes.
- Add START/END grammar pools for `WORLD:FESTIVAL:*` (mirror the p10b STORM/PLAGUE/etc pools).

Wire FESTIVAL effects through the same consumer pattern p10b used: `hasActiveSpan(ctx,'FESTIVAL')`
gating Social-cluster weight / pressure-gain / Tier-B-frequency scaling (revert on END).

## Key files

- Plan: `plans/p10d-npc-system.md` (Scope, Approach §1–7, 10 Validation boxes).
- Specs: `specs/behaviors/npc-system.md`, `event-bus.md`, `relationship-graph.md`,
  `world-expansion.md` (§Weighty social spans covers FEUD/FESTIVAL).
- Graph: `packages/core/src/relationships/graph.js` (key widening lands here + every consumer).
- Social encounter model (p10c): `packages/core/src/events/socialResolver.ts` (pressure +
  `resolveEncounter`; Tier A NPC pairs plug in here).
- Span lifecycle to reuse: `packages/core/src/world/WorldExpansion.ts` (see §SPAN REUSE).
- Grammar: `packages/core/src/events/eventBus.ts` (`BEAT_POOLS`, `renderText` NPC + WORLD cases).
- EventFeed: `apps/game-client/src/lib/components/EventFeed.svelte` (the 3-update rule).
- E2E: `apps/game-client/tests/` via `npm run test:e2e` (builds + Playwright).

## Gotchas & dead ends

- **Rebuild core (`npm run build` in `packages/core`) before `svelte-check`** — game-client resolves
  `@ugs/core` types from `dist/`, not source. (`dist/` is gitignored — no commit churn.)
- **`createSimulationContext()` needs a seed arg** (crashes in `xmur3` without one).
- **No `Math.random()` in `packages/core`** — all rng via `ctx.rng` (CLAUDE.md). NPC selection too.
- **EventFeed: `tsc` catches only `KIND_LABELS`** — `ALL_KINDS` + `getInvolvedIds` gaps are silent.
- **`vitest run` "failed files" for Playwright specs = false alarm** (mis-collected). E2E via the
  game-client `test:e2e` script.
- Clock: 1 tick = 1 hour, 24/day, 720 ticks = 30 days.
- **Span tint rng discipline (p10b precedent):** the narrative colour tint in `eventBus.ts compose`
  only consumes rng when a span is live, so spanless feeds stay byte-for-byte identical. If p10d
  adds any new conditional rng draw in `compose`/`renderText`, keep this property or the
  narrative-voice replay test breaks.

## Carryover (not blocking p10d)

- **p10b follow-ups (deferred):** STORM-suppresses-departures and TRAVELLING_MERCHANT-trade-variants
  were in p10b Scope but not validated and not shipped — the latter is *blocked* on a trade/restock
  `QuestType` that doesn't exist. Full text in `plans/p10b-world-event-durations.md` Follow-ups.
- **FEUD span (p10c follow-up #2):** the shared lifecycle now exists; p10c can open a FEUD span from
  `resolveEncounter` on ESTRANGEMENT+crisis. Same FESTIVAL-style union/duration gaps apply (§SPAN
  REUSE). p10d need not do this, but if you're touching the span machinery for FESTIVAL, FEUD is the
  symmetric sibling.
- **p10c density tuning (user decision pending):** density playtest read sparse (~1.7/day synthetic
  vs ~5 target), unobservable in the 1-adventurer scenario; constants left signed-off. Tuning of
  `PROXIMITY`/`DECAY`/`THRESHOLD` in `events/socialResolver.ts` is unresolved. Ignore unless raised.

## Suggested skills

- **`/specops`** — mark in-progress (step 1), close out (step 5). Touch specs only if the build
  surfaces a contradiction.
- **`/tdd`** — build test-first, one test per Validation box.
- **`/code-review`** or **`/simplify`** — after green, before closeout (the graph-key widening is
  exactly the kind of broad change worth a review pass).

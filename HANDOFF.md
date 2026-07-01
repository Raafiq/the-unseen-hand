# Handoff — The Unseen Hand (guild-sim)

_Updated 2026-07-01. **Phase 10 (Events Redesign) is COMPLETE — all four plans `done`.** `specops
next` reports 0 ready · 0 in-progress · 0 blocked. HEAD `0135815` on `main`. Tree has one unrelated
uncommitted change (`CLAUDE.md` doc addition — left as-is, not mine). No `ready` plan to pick up next;
the top actionable item is the pre-existing e2e failure below._

---

## Where things stand

Phase 10 shipped p10a (narrative voice), p10b (world-event durations), p10c (social pressure), and
now **p10d (town NPC system)** — all `done`. Verified at p10d closeout: **504 core Vitest green**,
`tsc --noEmit` (core + client) clean, `svelte-check` 0/0, no `Math.random()` in `packages/core/src`.
Playwright: **10/12 green** — the 2 failures are pre-existing (see below).

## TOP ITEM — pre-existing E2E failure (needs a design call)

`apps/game-client/tests/choice-card.spec.ts` (2 tests) **fails on clean HEAD too** — proven by
stashing all p10d work, rebuilding, and re-running. It is NOT caused by the NPC work.

- **Root cause:** the single-adventurer scenario-1 board (seed `scenario-1`) seeds no low-probability
  **size-1** quest. The only size-1 quest is Investigation d3 at 0.70 success; the d7/d9 quests are
  size 2–3 and Kara is alone, so she can neither be auto-assigned to them nor trigger a
  `PARTY_SELECTION` decision (which needs `requiredPartySize ≤ idle count`). The card never appears →
  the 12 s wait times out. In fact the single-Kara scenario produces **no** decision moments at all.
- **Fix options (pick one):** (a) seed a size-1 high-difficulty quest in scenario-1; (b) add a
  deterministic decision-injection test seam to the store; (c) rewrite the test to force the state.
  All are out of p10d scope. Details in `plans/p10d-npc-system.md` Follow-ups.

## What p10d added (for context)

- **Actor id space:** `ActorId = AdventurerId | NpcId`; `isNpc`/`makeNpcId`/`NPC_ID_PREFIX` in
  `world/actors.ts`. Graph keys widened to `ActorId` (type-level only — both are `string`).
- **Tier A:** `EncounterActor` + `actorView` in `events/socialResolver.ts` — notable NPCs are honorary
  actors in the p10c pressure/outcome model. NPC↔NPC pairs skipped; NPCs get no mood factors.
- **Tier B:** `events/npcFlavour.ts` — flavour-only `NPCEvent`s during non-Private activities.
- **FESTIVAL:** a `WorldEventType` town span (p10b lifecycle) in `world/WorldExpansion.ts`
  (`openFestivalSpan`, `festivalSeedingSubscriber`); effects on pressure, Social activity weight, Tier
  B frequency. `FEUD` subtype + grammar exist but are not seeded (p10c follow-up).
- **Data + UI:** 4 Thornvale NPCs (`scenarios/notableNpcs.ts`); EventFeed 3-update rule + NPC filter
  chips; CharacterDetail resolves NPC edge names (`[townsfolk]`, non-navigable).

## Gotchas & precedents (still true)

- **Rebuild core (`pnpm --filter @ugs/core build`) before `svelte-check`** — client resolves `@ugs/core`
  from `dist/` (gitignored).
- **rng-stream discipline (p10b precedent, reinforced by p10d):** any new per-tick rng consumer must run
  **after** the decision/quest/social systems so it doesn't shift their stream. p10d's Tier B flavour
  subscriber is registered dead-last for exactly this reason.
- **`createSimulationContext()` needs a seed arg.** Clock: 1 tick = 1 hour, 720 ticks = 30 days.
- **`vitest run` "failed files" for Playwright specs = false alarm** (mis-collected); run e2e via the
  game-client `test:e2e` script.

## Carryover (not blocking)

- **FEUD span (p10c follow-up):** subtype union + `WORLD:FEUD:START/END` grammar now exist; wire an
  open-from-`resolveEncounter`-on-ESTRANGEMENT path + a `WorldEventType`/`SPAN_DURATIONS` entry.
- **p10d tuning constants** (`TOWN_FLAVOUR_CHANCE`, festival multipliers/duration/seed-prob) are
  first-pass — confirm against a 30-day playtest. See plan Notes.
- **p10b follow-ups** (STORM-suppresses-departures; TRAVELLING_MERCHANT trade variants — the latter
  blocked on a trade/restock `QuestType`). See `plans/p10b-world-event-durations.md`.

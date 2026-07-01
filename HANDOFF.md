# Handoff — The Unseen Hand (guild-sim)

_Updated 2026-07-01. **Phase 10 (Events Redesign) is COMPLETE — all four plans `done`.** `specops
next` reports 0 ready · 0 in-progress · 0 blocked. HEAD `4a06e17` on `main`. Tree has one unrelated
uncommitted change (`CLAUDE.md` doc addition — left as-is, not mine). No `ready` plan to pick up next._

---

## Where things stand

Phase 10 shipped p10a (narrative voice), p10b (world-event durations), p10c (social pressure), and
now **p10d (town NPC system)** — all `done`. Fully green: **504 core Vitest**, **12/12 Playwright
e2e**, `tsc --noEmit` (core + client) clean, `svelte-check` 0/0, no `Math.random()` in
`packages/core/src`.

## Fixed this session — the long-standing choice-card e2e

`apps/game-client/tests/choice-card.spec.ts` had been failing on clean HEAD (a deferred gap, not
p10d): the single-Kara scenario produces no decision moments organically — no low-prob size-1 quest,
and Kara alone can't field the size-2/3 quests, so `PARTY_SELECTION` never fires. Fixed with a
query-param-gated e2e seam (`?e2e=decision`) in `simulationStore.svelte.ts` that injects one
deterministic PARTY_SELECTION at load; the spec now targets `/?e2e=decision` and still drives the
real ChoiceCard render path. The deeper gameplay gap (a solo scenario yielding zero decisions) is
left for a future scenario-balance pass.

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

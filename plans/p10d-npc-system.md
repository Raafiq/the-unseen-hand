---
status: done
depends: [p10c-social-pressure, p10a-narrative-voice]
specs:
  - specs/behaviors/npc-system.md
  - specs/behaviors/event-bus.md
  - specs/behaviors/relationship-graph.md
  - specs/behaviors/world-expansion.md
---

# Plan: P10d — Town NPC System (two tiers)

> **Phase 10 — Events Redesign** (4 of 4). Adds the two-tier town NPC population. Tier A notable
> NPCs become honorary actors in the relationship graph and the P10c encounter model; Tier B
> nameless roles are pure grammar flavour.

## Scope

**In scope:**
- `ActorId = AdventurerId | NpcId`, `isNpc(id)`; widen relationship graph keys and the social
  encounter participant space to `ActorId`.
- `NotableNpc` type (`{id, name, role, traits, bio, mood?}`); seed a starting-town handful in
  scenario data.
- Tier A graph integration: adventurer↔NPC edges use existing strength/type/threshold/decay;
  guard co-quest deltas and death/departure-by-default on `isNpc`.
- Tier A encounters: NPCs accumulate pressure with adventurers (P10c) and resolve via the
  six-outcome grid; NPC `traits`/`mood` feed valence/intensity.
- `TownRole` enum; Tier B flavour: low per-tick rng chance during town-eligible activities emits
  an `NPCEvent` (`kind:'NPC'`, `subtype:'TOWN_FLAVOUR'`) — one grammar line, no state.
- Grammar: role-keyed Tier B beat pools; Tier A uses social pools with NPC-name subject (P10a).
- EventFeed three updates for `NPC`: `KIND_LABELS`, `ALL_KINDS`, `getInvolvedIds` (resolves NPC
  ids in `SocialEvent.participantIds` and the `NPCEvent.adventurerId`).
- FESTIVAL town span (P10b lifecycle): raises Social-cluster weights + pressure gain + Tier B
  frequency while live; START/END events.
- Character-detail / roster display of notable-NPC relationships (NPC name resolution).

**Out of scope:**
- NPC↔NPC relationships (explicitly not modelled).
- Recruiting NPCs into the adventurer roster.
- A full NPC inspection panel (only name/bio + relationship rows surface for now).

## Implements

- `specs/behaviors/npc-system.md` — the whole spec (both tiers, encounters, events, festival).
- `specs/behaviors/event-bus.md` — `NPCEvent` kind, `ActorId[]` participants.
- `specs/behaviors/relationship-graph.md` — NPC actor participation.
- `specs/behaviors/world-expansion.md` — FESTIVAL as a town span.

## Approach

### 1. Id space & types

`NpcId` namespace (`"npc:"` prefix), `ActorId`, `isNpc`. Widen `RelationshipGraph` to
`Map<ActorId, Map<ActorId, RelationshipEdge>>`. `NotableNpc` + `TownRole` in `types.ts`.

### 2. Seed notable NPCs

Scenario data: a starting town's notable NPCs (blacksmith, guard captain, innkeeper, …) with
traits/bio. Add their nodes to the graph at world init (no edges until interaction).

### 3. Tier A encounters

Extend P10c eligibility to include eligible adventurer↔notable-NPC pairs; reuse pressure +
resolution. Guard adventurer-only logic (`isNpc`): skip co-quest deltas, activity draws,
departures, death.

### 4. Tier B flavour

In town-eligible activities, low rng chance → `NPCEvent` from a role-keyed grammar pool. No
pressure, cooldown, or effect.

### 5. Festival span

Seed FESTIVAL via P10b lifecycle; while live, scale Social weights + pressure gain + Tier B
chance; revert on END.

### 6. EventFeed + UI

Three EventFeed updates; NPC-name resolution in `getInvolvedIds` and character/roster displays.

### 7. Tests (TDD)

- Adventurer↔notable-NPC edge → FRIEND at ≥40 fires one `FRIENDSHIP_FORMED` (parity with adv↔adv).
- Co-quest delta never applied to an NPC-endpoint edge.
- NPC edge decays under the 14-day rule.
- Tier A encounter emits `SocialEvent` with NPC id in `participantIds`, six-outcome delta.
- Tier B emits `NPCEvent`, non-empty slot-free text, zero relationship/mood change.
- `getInvolvedIds` resolves an NPC id to the NPC name; event shows in both filters.
- Live FESTIVAL raises Social weight + pressure gain; reverts on END.
- All NPC selection via `ctx.rng` (no `Math.random()`).

## Validation

- [x] Adventurer↔notable-NPC edge crosses to FRIEND at ≥40 with exactly one `FRIENDSHIP_FORMED`.
- [x] Co-quest delta never applied to an edge with an NPC endpoint.
- [x] Notable-NPC edge decays under the 14-day long-separation rule.
- [x] Tier A encounter emits a `SocialEvent` with the NPC id in `participantIds` and a six-outcome delta.
- [x] Tier B emits an `NPCEvent` with non-empty, slot-free `renderedText` and no relationship/mood change.
- [x] `getInvolvedIds` resolves an NPC id to its name; the event appears in the NPC's and the adventurer's character filters.
- [x] Live FESTIVAL raises Social-cluster weight + social pressure gain; reverts on END.
- [x] No `Math.random()` anywhere in the NPC path (grep clean).
- [x] EventFeed renders the `NPC` kind (`KIND_LABELS`/`ALL_KINDS`/`getInvolvedIds` all updated).
- [x] `tsc --noEmit` and `svelte-check` pass; Vitest green (504). Playwright: 10/12 green; the 2
  `choice-card.spec.ts` failures are **pre-existing** (fail identically on clean HEAD — see Follow-ups),
  unrelated to the NPC path.

## Risks / unknowns

- **Graph key widening** — `Map<ActorId, …>` touches every graph consumer; audit combat/quest/
  departure reads for adventurer-only assumptions and `isNpc`-guard them.
- **EventFeed actor resolution** — `getInvolvedIds` and name lookups must handle ids that resolve
  to NPCs, not just `adventurerMap` (per CLAUDE.md's EventFeed 3-update rule).
- **Town location model** — "town-eligible activity" currently approximated by non-Private
  activities; if a real location model is later added, revisit eligibility.

## Notes

- **Id space.** `isNpc`/`makeNpcId`/`NPC_ID_PREFIX` (`"npc:"`) live in `world/actors.ts`; `ActorId =
  AdventurerId | NpcId`. Both are `string`, so the graph key-widening was type-level only — no runtime
  change to the Map, and all 493 prior tests stayed green. `RelationshipGraph`, `graph.ts` signatures,
  and `pairKey`/`groupFiringPairs`/`ensureEdge` are now `ActorId`-typed.
- **Encounter integration (honorary actors, not a parallel system).** `EncounterActor` is the minimal
  shape the pressure/stats/outcome machinery reads; `Adventurer` satisfies it structurally and a
  `NotableNpc` is projected via `actorView`/`npcToActor` (partial `traits` filled to the 50 midpoint,
  `mood ?? 50`, always present + awake). `socialPressureSubscriber` iterates present adventurers + all
  NPCs and skips NPC↔NPC pairs. Mood-factor writes in `resolveEncounter` key off `ctx.adventurers`, so
  NPCs naturally receive none. No separate NPC-relationship subsystem was built (spec's local principle).
- **BELONGING via NPC bond.** `trustedCompanionCount` (PersonalGoals) counts NPC edges — left
  unguarded deliberately: in the single-Kara scenario a TRUSTED_COMPANION can only be an NPC, so this
  is the one path by which Kara's BELONGING goal is reachable. Thematically valid ("belonging" from a
  townsperson), so it stays.
- **Co-quest guard.** Parties are adventurer-only, so the `isNpc` guard in `questSystem` co-quest
  strengthening is belt-and-braces; the test smuggles an `npc:` id into a party to prove it skips.
- **FESTIVAL = a `WorldEventType` town span.** Rode the p10b span lifecycle (`SPAN_DURATIONS.FESTIVAL =
  [48,96]`, `openSpan`/`sweepExpiredSpans`) attached to the town's home region (`townRegionId` →
  THORNVALE). Seeded by a dedicated `festivalSeedingSubscriber` (`1/1440` per tick), NOT the weather
  table. END is swept by the existing `worldEventSeedingSubscriber`. `FEUD` was added to the
  `WorldEvent` subtype union + grammar pools (spec parity) but is **not** seeded (a p10c follow-up).
- **rng-stream discipline (p10b precedent).** `npcFlavourSubscriber` and `festivalSeedingSubscriber`
  draw rng every tick, so both are registered **after** the decision/quest/social systems — Tier B is
  dead-last in the loop — so their draws never shift the stream those systems see within a tick.
- **Tuning constants (unvalidated, first-pass):** `TOWN_FLAVOUR_CHANCE = 0.02`, `FESTIVAL_FLAVOUR_MULT
  = 2`, `FESTIVAL_PRESSURE_MULT = 1.5`, `FESTIVAL_SOCIAL_WEIGHT_MULT = 1.5`, `FESTIVAL_SEED_PROB =
  1/1440`, FESTIVAL duration `[48,96]`. Confirm against a 30-day playtest.
- **Town-eligibility** is approximated by non-PRIVATE activity cluster (`isTownEligible`), per plan Risk
  #3 — revisit if a real location model lands.

## Follow-ups

- **PRE-EXISTING E2E FAILURE (not p10d):** `apps/game-client/tests/choice-card.spec.ts` (2 tests) fails
  on clean HEAD as well as this branch. Root cause: the single-Kara scenario board (seed `scenario-1`)
  seeds no low-probability **size-1** quest — the only size-1 quest is Investigation d3 at 0.70 success,
  and Kara alone can't field the size-2/3 quests — so a `PARTY_SELECTION` decision moment can never fire
  organically, and the test waits forever for `.primary-card`. The single-adventurer scenario in fact
  produces no decision moments at all (Kara never quests, never despairs). This is a scenario/test drift
  that predates and is orthogonal to the NPC work. Fix options: (a) seed a size-1 high-difficulty quest
  in scenario-1; (b) add a deterministic decision-injection test seam; (c) rewrite the test to force the
  state. Needs a design call — deferred, flagged to the user.
- **FEUD span (p10c follow-up #2):** subtype union + `WORLD:FEUD:START/END` grammar now exist; a p10c
  follow-up can open a FEUD span from `resolveEncounter` on ESTRANGEMENT+crisis. Add a `WorldEventType`
  entry + `SPAN_DURATIONS` when wired.
- **NPC inspection panel:** clicking a notable NPC (feed portrait / relationship row) is intentionally
  non-navigable — resolves the name + a `[townsfolk]` tag but opens no detail panel (out of scope).
- **NPC↔NPC relationships** remain out of scope by design.

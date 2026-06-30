---
status: planned
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

- [ ] Adventurer↔notable-NPC edge crosses to FRIEND at ≥40 with exactly one `FRIENDSHIP_FORMED`.
- [ ] Co-quest delta never applied to an edge with an NPC endpoint.
- [ ] Notable-NPC edge decays under the 14-day long-separation rule.
- [ ] Tier A encounter emits a `SocialEvent` with the NPC id in `participantIds` and a six-outcome delta.
- [ ] Tier B emits an `NPCEvent` with non-empty, slot-free `renderedText` and no relationship/mood change.
- [ ] `getInvolvedIds` resolves an NPC id to its name; the event appears in the NPC's and the adventurer's character filters.
- [ ] Live FESTIVAL raises Social-cluster weight + social pressure gain; reverts on END.
- [ ] No `Math.random()` anywhere in the NPC path (grep clean).
- [ ] EventFeed renders the `NPC` kind (`KIND_LABELS`/`ALL_KINDS`/`getInvolvedIds` all updated).
- [ ] `tsc --noEmit` and `svelte-check` pass; all Vitest + Playwright E2E pass.

## Risks / unknowns

- **Graph key widening** — `Map<ActorId, …>` touches every graph consumer; audit combat/quest/
  departure reads for adventurer-only assumptions and `isNpc`-guard them.
- **EventFeed actor resolution** — `getInvolvedIds` and name lookups must handle ids that resolve
  to NPCs, not just `adventurerMap` (per CLAUDE.md's EventFeed 3-update rule).
- **Town location model** — "town-eligible activity" currently approximated by non-Private
  activities; if a real location model is later added, revisit eligibility.

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)

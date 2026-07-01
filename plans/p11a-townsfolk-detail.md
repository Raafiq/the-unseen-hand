---
status: done
depends: [p10d-npc-system]
specs:
  - specs/behaviors/npc-system.md
  - specs/screens/app-shell.md
---

# Plan: P11a — Townsfolk detail view

> Surfaces the notable-NPC identity record (name, role, bio, traits, mood, relationships) in the
> detail drawer. Closes the follow-up P10d deferred (its Out-of-scope: "A full NPC inspection
> panel — only name/bio + relationship rows surface for now"). No engine changes; the data already
> exists on `ctx.notableNpcs` and the relationship graph — this is pure UI surfacing.

## Scope

**In scope:**
- New `NpcDetail.svelte` — read-only townsfolk card (name, role label, Townsfolk tag, bio, defined
  trait bars, optional mood, relationships list re-targeting the drawer).
- `App.svelte` — route the selected actor id in the detail drawer to `NpcDetail` when it is a
  notable NPC (`ctx.notableNpcs.has(id)`), else `CharacterDetail` as today.
- `CharacterDetail.svelte` — make `[townsfolk]` relationship rows clickable (they were inert:
  the click guarded on the row being an adventurer).
- `EventFeed.svelte` — make notable-NPC names clickable, opening the townsfolk detail (guard
  currently allows only `ctx.adventurers.has(id)`).
- E2E coverage: open a townsfolk from a relationship row, assert bio/role/traits render and no
  goal/history/divine sections; re-target back to the adventurer.

**Out of scope:**
- NPC↔NPC relationships (still not modelled).
- Adding townsfolk to the roster dock (they are reached via relationships / event feed only).
- Any engine / core change; Tier B nameless roles (no identity to inspect).

## Implements

- `specs/behaviors/npc-system.md#ui--townsfolk-detail` + its validation bullets.
- `specs/screens/app-shell.md#detail-drawer` (drawer holds either actor kind).

## Approach

The selection channel (`selectedAdventurerId` / `selectAdventurer`) already carries an opaque
`string | null` id and RosterDock highlights by exact match, so an NPC id flows through unchanged
and simply highlights no roster card. App-level routing on `ctx.notableNpcs.has(selectedId)` picks
the component. Edges are symmetric in the graph, so `ctx.relationships.get(npcId)` yields the
townsfolk's relationships for the list. Reuse the drawer chrome and the relationship-row visual
grammar / `strengthToType` labels from `CharacterDetail` for consistency.

## Validation

- [x] `pnpm --filter @ugs/game-client check` (svelte-check) passes — 0 errors / 0 warnings.
- [x] `pnpm --filter @ugs/game-client test:e2e` passes (9 active, 5 pre-existing flag skips),
      including the new `townsfolk-detail.spec.ts`.
- [x] Clicking a `[townsfolk]` relationship row opens a detail showing the NPC's bio + role label
      + trait bars, and shows no goal / history / divine-touch / dispatch sections.
- [x] A relationship row inside the townsfolk detail re-targets the drawer to that actor
      (adventurer row returns to the character detail).
- [x] A notable-NPC name in the event feed opens the townsfolk detail (guard widened in
      `EventFeed.svelte`; shares the same `selectActor` channel — covered by the same seam path).

## Risks / unknowns

- Drawer layout: `NpcDetail` has fewer sections than `CharacterDetail`; must still read well in
  the wide/short drawer (`variant="drawer"`) rather than looking sparse.

## Notes

- No engine change was needed: `world/types.ts` already exports `NotableNpc`/`TownRole` via
  `export type *`, edges are symmetric, and the selection channel carries an opaque id — so the
  townsfolk detail is pure UI surfacing over data that already existed on `ctx`.
- New `NpcDetail.svelte` uses a 2-column drawer layout (vs `CharacterDetail`'s 3) so the smaller
  section set doesn't read sparse.
- Landed directly on `main` without a PR (per request); committed alongside other in-flight tree
  changes that were green at the time.

## Follow-ups

- **None.** NPC↔NPC relationships and roster-dock inclusion for townsfolk remain intentionally
  out of scope (see Scope).

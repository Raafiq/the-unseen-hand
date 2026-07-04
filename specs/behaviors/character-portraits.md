# Behavior: Character Portraits

## Rule

Every character rendered in the UI resolves to a **portrait image** when hand-authored art exists for its identity, and to a deterministic fallback when it does not.
A character is never rendered blank: the resolution always terminates in a visible representation.

Portraits are pure presentation.
They are a view over identity, never a source of truth, and the simulation in `@ugs/core` neither produces nor depends on them.

## Applies To

Every surface that today renders the colored-initial circle:

- `screens/roster-grid.md` — adventurer card portrait (and its compact-mode variant).
- `screens/character-detail.md` — the large identity-section portrait.
- `behaviors/npc-system.md#ui--townsfolk-detail` — the notable-NPC detail portrait.
- The docked roster strip and the inline event-feed character glyphs (`RosterDock`, `EventFeed`).

## Details

### Portrait resolution and fallback chain

A character is resolved to a portrait by a single client-side resolver keyed off the stable identity the UI already holds.
Resolution walks this chain and stops at the first hit:

1. **Exact character art.** For a named character with a stable id, the portrait whose key is that id.
   - Adventurers key off `Adventurer.id` (e.g. `s1-reiko`).
   - Notable (Tier A) NPCs key off `NpcId` with the `npc:` prefix removed (e.g. `npc:brenna-smith` → `brenna-smith`).
   - Adventurers and notable NPCs share the `ActorId` space; `isNpc(id)` selects which class the key belongs to.
2. **Generic art by role.** For a nameless (Tier B) townsfolk that has no per-character id, the generic portrait for its `TownRole` (e.g. a blacksmith silhouette). This is the "nameless NPCs get a generic portrait" case.
3. **Deterministic circle.** The existing colored-initial circle — a hue hashed from the character id with the name's first initial — used whenever no image resolves at all.

The colored circle is the **last resort, not the default**.
It exists so a character with no art still renders as a recognizable, stable token; it is not itself a portrait and must not shadow one when art exists.
On the roster surfaces (grid and dock), dead and retired characters render their resolved portrait desaturated, mirroring the existing circle-desaturation rule in `screens/roster-grid.md`.

### Asset contract

- Portrait images live under `apps/game-client/src/lib/assets/portraits/`, foldered by character class: `adventurers/`, `npcs/`, `roles/`.
- The filename is the resolution key: `<adventurer-id>` for adventurers, `<npc-id without the npc: prefix>` for notable NPCs, `<town-role>` (lowercased) for role fallbacks.
- The set of available portraits is discovered from these files at build time (a Vite module-graph manifest), so which characters have art is derived from what files exist — there is no separately maintained registry to drift.
- Format is **WebP**, square aspect (rendered inside a circular mask), authored at a resolution comfortably larger than the largest on-screen use (detail view). A missing file for a given key is a normal, silent map-miss that advances the fallback chain — never an error and never a runtime image request that 404s.

### Base-path safety

All portrait URLs are produced through the build's module graph, so they inherit the deploy base path automatically (the game is served under `/the-unseen-hand/` on GitHub Pages and `/` locally).
No portrait URL is ever hand-constructed from an absolute root path; a raw `/portraits/x.webp` is a conformance violation because it breaks under the project-site base path.

### Deferred (out of this behavior)

- **Full-body / full character art.** Only the portrait (headshot/bust) is in scope. A full character image has no render site yet; it is a later behavior.
- **Enemy portraits.** Combat has no enemy entity to attach art to (the foe is a narrative reference; `EnemyArchetype` is the only key and is currently hardcoded). Enemy portraits wait on combat gaining enemy actors. When they exist, they extend this same chain with `EnemyArchetype` as the key.
- **Procedural adventurers.** Only hand-authored characters have art. When an adventurer generator exists, generated adventurers simply fall through to the circle until art is authored for them — that is the designed behavior, not a gap.

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — via `roster-grid.md`, the roster is the visual anchor for character attachment; a real face deepens that attachment where the colored circle only approximated it.
- [Headless correctness first, visual representation second](../principles.md#headless-correctness-first-visual-representation-second) — portraits are the archetypal "visual representation second." They add zero simulation state and live entirely in the client; `@ugs/core` stays UI-free.

**Local:**
- **A portrait decorates an identity; it never defines one.** The stable id is the identity. Art is a lookup over it, and its absence is always recoverable to the circle. No feature may make a character's behavior, selection, or existence depend on whether a portrait file is present.

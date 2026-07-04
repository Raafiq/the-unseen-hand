---
status: done
depends: []
specs:
  - specs/behaviors/character-portraits.md
  - specs/screens/roster-grid.md
  - specs/screens/character-detail.md
  - specs/behaviors/npc-system.md
issues: []
---

# Plan: P14a — Character portraits

> Adds the first real character art to the game. Replaces the faked colored-initial circle with a
> resolved portrait image for hand-authored characters (adventurers + notable town NPCs), with a
> generic-per-role image for nameless townsfolk and the circle demoted to last-resort fallback.
> Pure client-side view — **zero `@ugs/core` changes**. Enemy portraits and full-body art are
> explicitly deferred (no render site for either yet).

## Scope

**In scope:**
- **Resolver module** `apps/game-client/src/lib/portraits.ts`: a build-time portrait manifest via
  `import.meta.glob('./assets/portraits/**/*.webp', { eager: true, query: '?url', import: 'default' })`
  and `portraitFor(actorId, { role? })` implementing the fallback chain from
  `character-portraits.md` (exact character art by id → generic by `TownRole` → `null` so the caller
  renders the circle). `isNpc(id)` selects the adventurer vs `npcs/` key; the `npc:` prefix is
  stripped for the filename.
- **Consolidate** the duplicated `portraitColor()` into `portraits.ts` as the exported circle
  fallback; delete the five copies (`RosterGrid`, `RosterDock`, `CharacterDetail`, `NpcDetail`,
  `EventFeed`).
- **Wire the five render sites**: resolved `<img>` (circular-masked, `alt={name}`, desaturated for
  DEAD/RETIRED) when a src resolves, else the existing colored circle — preserving each site's
  current sizing (36px roster card, large on detail, dot in feed, compact roster-dock strip).
- **Assets** under `apps/game-client/src/lib/assets/portraits/`: `adventurers/s1-reiko.webp`, the four
  `npcs/*.webp` (`brenna-smith`, `halden-captain`, `marsa-inn`, `father-oswin`), and the generic
  `roles/*.webp` needed for the townsfolk fallback.

**Out of scope:**
- **Full-body / full character art** — no render site yet; separate later behavior.
- **Enemy portraits** — combat has no enemy entity; `EnemyArchetype` is hardcoded `'UNKNOWN'`. The
  resolver chain is designed to extend to it when enemy actors exist.
- **Procedural adventurer art** — no generator exists; generated adventurers fall through to the
  circle by design.
- **`@ugs/core` changes** — portraits are pure presentation (`Headless correctness first` principle).

## Implements

- `specs/behaviors/character-portraits.md` in full — the resolution/fallback chain, asset contract
  (WebP, square, `src/lib/assets/portraits/`, build-time manifest), base-path-safety invariant, and
  the "portrait decorates identity, never defines it" local principle.
- The updated Portrait display-rule bullets in `specs/screens/roster-grid.md` and
  `specs/screens/character-detail.md`, and the townsfolk-detail portrait via
  `specs/behaviors/npc-system.md#ui--townsfolk-detail`.

## Approach

The whole feature is a view concern, so it stays in `apps/game-client` with no engine change. The
single new abstraction is `portraitFor`, keyed off the `ActorId` the components already hold. Using
`import.meta.glob` over `src/lib/assets/` (not `public/`) makes Vite own the URLs: it rewrites them
for the `/the-unseen-hand/` base path automatically (closing the GitHub-Pages gotcha), content-hashes
for caching, and includes only files that exist — so "no art" is a clean map-miss, not a 404. Windows
can't name a file `npc:brenna-smith`, so the class becomes the folder and the `npc:` prefix is
stripped. The colored circle survives as the terminal fallback via the consolidated `portraitColor`,
so nothing ever renders blank.

## Validation

- [x] `pnpm --filter @ugs/game-client check` — 0 errors / 0 warnings (after adding `vite-env.d.ts`
      for the `import.meta.glob` types).
- [x] Selecting Reiko (`s1-reiko`) renders an `<img>` portrait (`src` matches `/s1-reiko/`) in both
      the roster dock and the character-detail drawer; a notable NPC (`npc:brenna-smith`) renders an
      `<img>` (`src` matches `/brenna-smith/`) in the townsfolk detail. (`character-portraits.spec.ts`)
- [x] A character with no art (Marsa, `npc:marsa-inn`) renders the colored-initial circle fallback —
      `div.portrait-lg` with initial "M", zero `img.portrait-lg` — never blank.
- [x] E2E asserted on a plain `/` load (no seam) so real base-path URL resolution is exercised; full
      suite green (17 passed). Screenshots confirm the circular `object-fit: cover` crop is clean on
      Reiko + Brenna and the dock portrait.
- [x] `portraitColor()` exists in exactly one place (`lib/portraits.ts`); the five component copies
      are gone.
- [~] Generic `roles/<role>` fallback — **resolver supports it** (`portraitSrc(id, { role })`, wired
      from `NpcDetail`) but no role image is shipped and there is no nameless-NPC render site yet, so
      it is dormant by design (see Follow-ups). Not a render path today.
- [~] DEAD/RETIRED desaturation — implemented on the roster grid + dock `<img>` (class `desaturated`,
      `filter: grayscale`); not e2e-asserted because scenario 1 has no dead/retired actor at load.

## Notes

- **Resolver** `apps/game-client/src/lib/portraits.ts`: build-time manifest via
  `import.meta.glob('./assets/portraits/**/*.webp', { eager: true, query: '?url', import: 'default' })`,
  keyed `"<folder>/<basename>"`. `portraitSrc(actorId, { role? })` walks id → role → null; Vite
  rewrites URLs for the base path automatically (verified: `vite build` + `vite preview` under `/`).
- **Assets placed:** `adventurers/s1-reiko.webp`, `npcs/brenna-smith.webp`, `npcs/father-oswin.webp`
  (Halden and Marsa intentionally have no art → circle fallback, which the e2e exercises).
- **`vite-env.d.ts` added** (`/// <reference types="vite/client" />` + svelte) — the package had no
  ambient Vite types, so `import.meta.glob` didn't typecheck until this was added. Also types
  `import.meta.env`.
- **EventFeed scope call:** the 20px involved-actor glyph (`.portrait-init`) now shows the portrait
  image; the 8px character-filter dot (`.char-dot`) stays a plain color swatch (too small to read as
  a face). Consistent with "portrait, not decoration" — the dot was never a portrait.
- **Spec reconciliation:** the desaturation sentence in `character-portraits.md` was scoped to the
  roster surfaces (grid + dock) to match where dead/retired desaturation actually renders; the detail
  views never desaturated the circle and still don't.

## Follow-ups

- **Deferred to a later plan — full-body art:** no render site yet; needs a detail-view or modal
  design first.
- **Deferred to a later plan — enemy portraits:** blocked on combat gaining enemy actors
  (`EnemyArchetype` is the eventual key; currently hardcoded `'UNKNOWN'`). The resolver chain is
  built to extend to it.
- **Deferred — nameless-townsfolk generic portraits:** the `roles/<role>` branch is wired but has no
  render site (Tier B NPCs are role-only, never entities in the current UI) and no art shipped. Add
  role art + a render site together when Tier B gets a face.
- **Tracked as follow-up — game-client vitest:** the pure `portraitSrc` chain is only covered via
  e2e today; adding vitest to the package would allow direct unit tests of the fallback order.
- **Remaining notable-NPC art:** Marsa (`marsa-inn`) and Captain Halden (`halden-captain`) still fall
  back to the circle — drop `npcs/marsa-inn.webp` / `npcs/halden-captain.webp` to complete the set.

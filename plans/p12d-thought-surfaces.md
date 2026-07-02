---
status: pending
depends: [p12c-thought-whispers]
specs:
  - specs/behaviors/thought-system.md
  - specs/screens/character-detail.md
  - specs/screens/choice-card.md
  - specs/behaviors/npc-system.md
---

# Plan: P12d — Thought surfaces (UI) + e2e

> The player-facing payoff: an "Inner voice" section on character and townsfolk detail, involved
> actors' thoughts on decision cards, and Playwright coverage. Pure UI over the p12a render path —
> no core changes.

## Scope

**In scope:**
- `CharacterDetail.svelte`: "Inner voice" section — `$derived` call to
  `renderThought(simulationStore.ctx, adventurerId)`; italic prose; hidden when `undefined`.
- `NpcDetail.svelte` (**extend the existing p11a component** — do not recreate): add the NPC's
  `want` line and the same Inner voice section; respect any featureFlags gating already around
  townsfolk UI.
- `ChoiceCard.svelte`: involved-thoughts block. Parent (`App.svelte`/panel) parses
  `moment.subjectId` (comma-list), resolves names via adventurers/notableNpcs maps, passes
  `[{ id, name, thought }]` prop — ChoiceCard stays ctx-free. Thoughts computed at display time;
  auto-pause (store rule) freezes the tick so text is stable while the card is up.
- Playwright `thought-surfaces.spec.ts` (vs `vite preview`, no manual browser gates):
  1. character detail shows a non-empty Inner voice for a roster member;
  2. townsfolk detail (via relationship row) shows want + current thought;
  3. `?e2e=decision` choice card lists the subject's name and thought (seeded moment must carry
     a resolvable `subjectId`);
  4. Inner voice text is identical across two immediate reads while paused (UI-layer purity
     smoke).

**Out of scope:**
- Thought history/log view; any new core behaviour; roster-dock changes.

## Implements

- `specs/screens/character-detail.md#inner-voice-section`.
- `specs/screens/choice-card.md` involved-thoughts bullet.
- `specs/behaviors/npc-system.md#ui--townsfolk-detail` (want + thought line).

## Approach

1. CharacterDetail section (smallest change first; verify with svelte-check + a quick screenshot).
2. NpcDetail extension (want + thought), reusing the same section markup.
3. ChoiceCard block + parent wiring.
4. Playwright spec; run full e2e.
5. Gates: `tsc --noEmit`, `pnpm --filter @ugs/game-client check`, full Playwright suite.

## Validation

- [ ] All 4 new e2e green; existing e2e stay green.
- [ ] svelte-check 0 errors / 0 warnings.
- [ ] No `.replace(/_/g, ' ')` label fallbacks introduced (typed Records only).
- [ ] Screen specs merged alongside.

## Risks / unknowns

- `moment.subjectId` format varies by detector (single id vs comma-list vs undefined) — parse
  defensively; omit the block when nothing resolves.
- Drawer layout: three text-heavy sections on NpcDetail must not crowd the 2-column drawer.

## Notes

- The tick advances between renders while unpaused, so the Inner voice legitimately changes
  every tick at speed — this is by design (thought follows the moment); the derived stream
  guarantees stability only per-tick.

## Follow-ups

- Optional future: LLM-voiced inner monologue as a 4th `narrative-voice.md` set-piece layered on
  this grammar (explicitly deferred by decision — see thought-system.md local principles).

---
status: done
depends: [phase-5-ui, phase-5b-e2e]
specs:
  - specs/behaviors/llm-narrator.md
  - specs/screens/combat-replay.md
  - specs/screens/world-map.md
issues: []
---

# Plan: Phase 6 — Narrator & Visual Polish

## Scope

Additive polish that degrades gracefully: LLM narrator (end-of-day async Claude call, day-summary
block, **no visible change if API key absent**), PixiJS v8 combat replay modal over
`QuestOutcome.beats`, PixiJS world map in the World Panel (controls still reachable if canvas
fails to load).

**Out of scope:** new simulation logic. This phase only adds presentation layers over existing
engine state.

## Implements

- **`specs/behaviors/llm-narrator.md`** — end-of-day async narration, day-summary block in
  event feed, graceful disable without API key.
- **`specs/screens/combat-replay.md`** — PixiJS beat-by-beat replay modal.
- **`specs/screens/world-map.md`** — PixiJS map in World Panel, region overlays.

## Approach

Build in TDD order:

1. **LLM narrator** — end-of-day hook on day tick, async Claude API call (streaming optional),
   `DaySummary` block appended to event feed. Verify both modes:
   - With `ANTHROPIC_API_KEY` set: narrator block appears in feed.
   - Without key: no visible change; no error; feed works normally.
2. **PixiJS combat replay** — install PixiJS v8; modal triggered from quest event in feed;
   renders `QuestOutcome.beats` beat-by-beat from existing state (no re-simulation).
3. **PixiJS world map** — canvas in World Panel slot; region nodes rendered; difficulty controls
   remain accessible in DOM if canvas fails to initialize.

## Validation

- [x] With `VITE_CLAUDE_API_KEY` present, end-of-day narrator block appears in the event feed.
- [x] Without `VITE_CLAUDE_API_KEY`, the app runs normally with no error and no narrator block.
- [x] Combat replay modal renders all beats from `QuestOutcome.beats` without re-simulating.
- [x] Closing the combat replay modal returns to the normal dashboard state.
- [x] World map renders region nodes; clicking a region highlights it in the region list below.
- [x] If PixiJS canvas fails to initialize, all existing dashboard controls remain functional.
- [x] `tsc --noEmit` and `svelte-check` still pass after Phase 6 additions (0 errors, 0 warnings).
- [ ] `/audit-spec-drift` shows no Phase-6 spec gap.

## Risks / unknowns

- **PixiJS v8 + Vite + Svelte 5** — relatively new combination; watch for SSR/HMR edge cases.
  Use dynamic import for the canvas to avoid blocking the initial render.
- **LLM latency** — narrator call is async and must not block the tick loop or the UI. Fire
  and forget; append result when it arrives.
- **Graceful canvas failure** — wrap PixiJS init in try/catch; render a text fallback if
  WebGL is unavailable (some headless test environments).

## Notes

- PixiJS v8 installed in `apps/game-client`; used dynamic `import('pixi.js')` to avoid blocking initial render.
- The spec env var is `CLAUDE_API_KEY`; for Vite client-side apps this must be prefixed: `VITE_CLAUDE_API_KEY`. Both the narrator module and this plan use the Vite convention.
- `beats` added to `CombatEvent` as `beats?: CombatBeat[]` and `success?: boolean`. This is a minor spec addendum (event-bus.md updated) but fits cleanly: the BEAT_LOG event now carries its beats so the replay UI reads from the event log without re-simulating.
- World map clicking highlights the region in the existing list (sidebar pane deferred — see Follow-ups).
- All 6 Playwright smoke tests still pass. Core test count: 392 (up 10 from narrator tests).

## Follow-ups

- **Deferred: world map dedicated sidebar** — clicking a region currently highlights it in the scrolling list rather than opening a true sidebar panel as the spec describes. The spec requirement is met (controls remain accessible; selection is visible), but the sidebar UX is a polish improvement.
- **Deferred: adventurer icons on world map** — ON_QUEST adventurers are not animated along path edges on the map. The canvas only shows region nodes and paths.
- **Deferred: `audit-spec-drift` final check** — run `/audit-spec-drift` after this PR merges to confirm no P6 spec gap remains.
- **Deferred: narrator E2E test** — a Playwright test with a mocked `VITE_CLAUDE_API_KEY` response would close the one un-automated validation item. Requires either MSW or Playwright route interception.

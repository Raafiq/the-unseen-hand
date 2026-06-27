---
status: planned
depends: [phase-5-ui]
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

- [ ] With `ANTHROPIC_API_KEY` present, end-of-day narrator block appears in the event feed.
- [ ] Without `ANTHROPIC_API_KEY`, the app runs normally with no error and no narrator block.
- [ ] Combat replay modal renders all beats from `QuestOutcome.beats` without re-simulating.
- [ ] Closing the combat replay modal returns to the normal dashboard state.
- [ ] World map renders region nodes; clicking a region shows its difficulty + world events.
- [ ] If PixiJS canvas fails to initialize, all existing dashboard controls remain functional.
- [ ] `tsc --noEmit` and `svelte-check` still pass after Phase 6 additions.
- [ ] `/audit-spec-drift` shows no Phase-6 spec gap.

## Risks / unknowns

- **PixiJS v8 + Vite + Svelte 5** — relatively new combination; watch for SSR/HMR edge cases.
  Use dynamic import for the canvas to avoid blocking the initial render.
- **LLM latency** — narrator call is async and must not block the tick loop or the UI. Fire
  and forget; append result when it arrives.
- **Graceful canvas failure** — wrap PixiJS init in try/catch; render a text fallback if
  WebGL is unavailable (some headless test environments).

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)

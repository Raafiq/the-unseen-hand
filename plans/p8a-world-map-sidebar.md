---
status: done
depends: []
specs:
  - specs/screens/world-map.md
---

# P8a — World Map Sidebar

## Scope

Wire up the region-detail sidebar in `WorldPanel.svelte`. Clicking a region node on the PixiJS map (or a region row in the list) opens a dedicated sidebar panel below the map showing that region's full detail. Currently `selectedRegionId` is tracked but only adds a CSS class — no sidebar panel renders.

## Implements

- `specs/screens/world-map.md` §"Region sidebar"

## Approach

1. Add `.region-sidebar` panel to `WorldPanel.svelte` that renders when `selectedRegionId` is set.
2. The sidebar shows the full region detail (same content as the existing inline list section): active world events, difficulty bar + controls, seed event picker, quest sub-section. Locked region shows only name + unlock condition.
3. Add a close button (×) that sets `selectedRegionId = null`.
4. Region list rows become click targets — clicking a row selects the region and scrolls/opens the sidebar (list rows stay as compact headers, not expanded inline).
5. Keep existing `map-selected` highlight class on list row for the selected region.
6. Layout: map on top (full width), sidebar panel below map (full width), then compact region list below sidebar. On wide viewports the sidebar could float; for now, stack below map is sufficient — the spec allows "below on narrow viewports."

## Validation

- [x] Clicking a region row in the list opens the sidebar panel (`.region-sidebar` becomes visible)
- [x] Clicking the PixiJS map region node opens the sidebar panel
- [x] Sidebar shows the correct region name, difficulty, active events, controls
- [x] Locked region: sidebar shows only name and unlock condition, no controls
- [x] Clicking the × close button hides the sidebar (`selectedRegionId` → null)
- [x] Playwright E2E: `world-map-sidebar.spec.ts` — click region row → assert `.region-sidebar` visible + `.sidebar-region-name` text is non-empty + `.diff-controls` visible
- [x] `tsc --noEmit` and `svelte-check` both pass

## Risks / unknowns

- Region list rows currently show full inline detail; stripping them to compact headers is a layout change. Keep the inline detail for now and add the sidebar as an additional panel (avoids regressions on the list UX).

## Notes

`WorldPanel.svelte`: added `selectedRegion` derived state, `selectRegion()` / `closeSidebar()` helpers, `.region-sidebar` panel block (full detail: events, difficulty controls, seed picker, quest table, locked state). Region list `.region-header` rows got `role="button"` + `onclick` → `selectRegion`. New CSS: `.region-sidebar`, `.sidebar-header`, `.sidebar-region-name`, `.sidebar-close`. `tsc --noEmit` + `svelte-check` clean (0 errors, 0 warnings). 10/10 Playwright E2E tests pass (8 existing + 2 new sidebar tests).

## Follow-ups

- **Narrator E2E** — Playwright route interception to mock `VITE_CLAUDE_API_KEY` response; confirm `DaySummaryBlock` appears (tracked as deferred in HANDOFF)

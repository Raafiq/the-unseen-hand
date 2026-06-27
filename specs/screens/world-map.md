# Screen: World Map

## Route

Replaces or augments the World Panel's region list when the World tab is selected (Phase 6). The map is a PixiJS v8 canvas embedded within the World Panel layout. Region detail (difficulty, events, quest board) is shown in a sidebar when a region is selected.

## Data Requirements

From `simulationStore`:
- `activeRegions: Map<RegionId, Region>` — all regions (locked and unlocked)
- `adventurers: Map<AdventurerId, Adventurer>` — for positioning adventurer icons on map
- `questBoard: QuestBoard` — for quest location markers
- `divineInfluence: number` — for seeding cost previews

## Display Rules

### Map canvas

Fills the main area of the World Panel. A top-down stylized map (not photorealistic):
- Region nodes: circular nodes at fixed positions. Unlocked regions: full color. Locked regions: desaturated with a lock icon.
- Paths between connected regions: simple lines. No animated traffic.
- **Quest markers**: small icons on the region node when quests are active there. Icon count = number of active (`IN_PROGRESS`) quests.
- **Adventurer icons**: small portrait initials moving from guild location toward the assigned region when `ON_QUEST` or `IN_DUNGEON`. Icon animates along the path edge. Returns to guild on quest completion.
- **World event indicators**: if a region has an active world event, a small icon (e.g. storm cloud, skull) overlaid on the region node.

### Region sidebar

When a region node is clicked: a sidebar panel opens to the right of the map (or below on narrow viewports) showing the region's detail. This is the same content as the World Panel region section from Phase 5, adapted for sidebar display.

Locked region: sidebar shows only the region name and unlock condition. No interactive controls.

### Guild node

A special "Guild" node on the map represents the player's base. Adventurers in `IDLE`, `RESTING`, or `SOCIALIZING` states are shown as clustered icons on or near this node. On-quest adventurers animate away from it.

### Zoom and pan

- Mouse wheel or pinch: zoom in/out, clamped to a min/max that keeps all region nodes visible.
- Click and drag: pan the canvas.
- Double-click a region node: centers the view on that region and opens its sidebar.

## Actions

- **Click region node**: opens region detail sidebar.
- **Click guild node**: closes the region sidebar (deselects region).
- **Zoom / pan**: as described above.
- All region controls from the World Panel (difficulty slider, seed event) are available in the sidebar.

## Navigation

Within the World Panel. No tab change or modal.

## Principles

**Local:**
- **The map is a view, not a control surface.** Players read the world from the map; they act on it through the sidebar controls (same as Phase 5 World Panel). The map must never be the only way to access a region control — all controls must remain accessible without PixiJS if the canvas fails to load.

# Screen: World Panel

## Route

Active when World tab is selected in app shell.

## Data Requirements

From `simulationStore`:
- `activeRegions: Map<RegionId, Region>` — all regions (locked and unlocked)
- `questBoard: QuestBoard` — active and available quests per region
- `divineInfluence: number` — for seeding cost display
- `worldTime: WorldTime` — for event duration display

## Display Rules

### Region list

One section per region, ordered by unlock sequence (`THORNVALE` first, etc.):

**Unlocked region section:**
- Region name (large) + current difficulty level (e.g. "Difficulty 5/10")
- **Active world events**: small tag per active `WorldEventInstance` (e.g. "STORM · expires Day 15"). If none: "No active events."
- **Difficulty slider**: horizontal slider from 1–10. Current value highlighted. DI cost preview shown in real-time as the user drags: "Shift to {value}: costs {cost} DI". Releasing the slider at a new value opens a confirmation prompt.
- **Seed Event button**: opens the event picker (see below).
- **Quest sub-section**: lists quests assigned to this region (see Quest sub-view below).

**Locked region section:**
- Region name in grey + "Locked"
- Unlock condition shown: e.g. "Unlocks at reputation 200 or scenario completion."
- Reputation progress bar if reputation is the unlock condition: `{currentReputation} / {threshold}`.
- No interactive controls.

### Difficulty slider behavior

- Slider is disabled if `divineInfluence < 3` (minimum cost to shift by 1).
- Drag preview shows cost in real-time. Player must confirm before DI is spent.
- Shift takes effect immediately on confirmation; `SHIFT_DIFFICULTY` command dispatched.

### Seed Event picker

Opens as a dropdown or modal within the region section. Lists all `WorldEventType` options with:
- Event name
- One-line description of effect
- DI cost
- Greyed out if: current DI < cost OR an event of the same type is already active in this region.

Selecting an available event dispatches `SEED_EVENT` command. No separate confirmation dialog — the cost is visible before selection.

### Quest sub-view

Under each unlocked region, a collapsible sub-section: "Quests (active: N, available: M)".

When expanded: a table of all quests for this region with `status: 'IN_PROGRESS'` or `status: 'AVAILABLE'`:
- Quest name + type badge
- Difficulty (1–10)
- Assigned party (adventurer name initials, or "Unassigned" if available)
- Status badge (`In Progress` / `Available` / days until expiry for available quests)

Clicking a quest row: highlights involved adventurers in the roster grid.

### Guild reputation

Below the region list: a "Guild Reputation" row showing the numeric value (e.g. "Reputation: 342") and a progress bar toward the next unlock threshold.

## Actions

- **Drag difficulty slider**: previews DI cost in real-time.
- **Confirm difficulty shift**: dispatches `SHIFT_DIFFICULTY`.
- **Click "Seed Event"**: opens event picker for that region.
- **Select event from picker**: dispatches `SEED_EVENT`.
- **Click quest row**: highlights party members in roster grid.
- **Expand/collapse quest sub-section**: local UI toggle only.

## Navigation

Within the app shell. No navigation to other panels — selecting adventurers via quest rows highlights them in the roster but does not switch the active tab.

## Principles

**Inherited:**
- [DI bankruptcy is a valid player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — unaffordable options (seeding, difficulty shifts) are greyed out with cost shown. Cost is never hidden; the empty DI bar is the player's problem to solve.
- [Emergence over control](../principles.md#emergence-over-control) — world seeding and difficulty shifts are the player's levers, but the resulting events play out autonomously. The panel surfaces the levers, not the outcomes.

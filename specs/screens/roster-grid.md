# Screen: Roster Grid

## Route

Active when Roster tab is selected in app shell.

## Data Requirements

From `simulationStore`:
- `adventurers: Map<AdventurerId, Adventurer>` — all adventurers (living, dead, retired)
- `worldTime: WorldTime` — for state duration labels

## Display Rules

### Layout

Grid of adventurer cards. Cards appear in a fixed order:
1. Living adventurers (`state !== 'DEAD' && state !== 'RETIRED'`) — sorted by name alphabetically.
2. Dead adventurers (`state === 'DEAD'`) — sorted by death tick descending (most recent first).
3. Retired adventurers (`state === 'RETIRED'`) — sorted by retirement tick descending.

Section headers: "Active", "Fallen", "Departed" — shown only if their section is non-empty.

### Adventurer card

Each card shows:
- **Portrait placeholder**: a colored circle with the adventurer's initial. Color is deterministically derived from the adventurer's `id` (consistent across renders). Dead adventurers: desaturated portrait.
- **Name**: `adventurer.identity.name`. If dead: strikethrough. If retired: italic.
- **State badge**: a small colored pill.

| State | Color | Label |
|---|---|---|
| `IDLE` | green | Idle |
| `ON_QUEST` | amber | On Quest |
| `IN_DUNGEON` | amber | In Dungeon |
| `RESTING` | blue | Resting |
| `SOCIALIZING` | teal | Socializing |
| `IN_DISPUTE` | orange | In Dispute |
| `DEAD` | dark grey | Fallen |
| `RETIRED` | mid grey | Departed |

- **Mood bar**: horizontal progress bar, 0–100. Color: green (≥ 50), amber (25–49), red (< 25). Hidden for DEAD and RETIRED adventurers.
- **Personal goal icon**: a small icon representing the adventurer's `PersonalGoal`. Shown with a faint progress indicator (filled fraction = milestones completed / milestones total). Hidden for DEAD and RETIRED.
- **Danger indicator**: a small animated icon (e.g. pulsing skull) shown when an adventurer has an active `NEAR_DEATH` or `DESPAIRING` condition. Shown in addition to other elements.

### Compact mode

When the roster has more than 12 adventurers, cards switch to a compact single-row layout: portrait + name + state badge + mood bar only. Full card layout up to 12.

## Actions

- **Click card**: selects the adventurer; opens Character Detail in the right panel. Selected card has a distinct highlight border.
- **Click again** (already selected): deselects; right panel returns to default.

## Navigation

Within the app shell. Clicking an adventurer opens Character Detail in the right panel (same page).

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the roster grid is the visual anchor for character attachment. Portrait, name, state, and mood are the minimum to make adventurers feel like individuals rather than data rows.

**Local:**
- **Dead and retired adventurers are visible, not deleted.** They remain in the grid as a permanent record. Removing them would erase the story. They are deprioritized visually (bottom, desaturated) but not hidden.

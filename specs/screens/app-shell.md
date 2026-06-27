# Screen: App Shell

## Route

`/` (root; single-page application, no routing required)

## Data Requirements

From `simulationStore`:
- `worldTime: WorldTime` — current in-game date/time
- `divineInfluence: number` — current DI
- `activeDecisionMoments: DecisionMoment[]` — for unread indicator badge
- `eventLog: SimulationEvent[]` — for unread indicator on Events tab
- `scenario: ScenarioState | null` — for world name and scenario status
- `speed: 1 | 5 | 20 | 'paused'` — current simulation speed

## Display Rules

### Top bar

Fixed at top. Contains:
- **World name**: scenario title if `scenario !== null`, else "Sandbox" in italic.
- **In-game date**: formatted as "Day {worldTime.day}, {worldTime.hour}:00" — e.g. "Day 12, 14:00".
- **DI meter** (see `components/DIMetrComponent`): prominent bar showing current / 100. Includes recent deltas (see `screens/app-shell.md#di-meter`).
- **Speed controls**: Pause / 1× / 5× / 20× buttons. Active speed is highlighted. Pause shows a "paused" indicator replacing the date animation.

### Left navigation panel

Vertical tabs. Active tab is highlighted. Tabs:
1. **Roster** — adventurer grid
2. **Quests** — quest board
3. **World** — region panel
4. **Events** — event feed

**Unread indicators:**
- Events tab: badge showing count of unread `SimulationEvent` entries since the player last viewed the Events tab. Badge disappears when the Events view is open.
- Quests tab: badge if any active `DecisionMoment` relates to a quest (party selection, quest outcome).

### Main panel

Renders the active tab view:
- Roster → `RosterGrid.svelte`
- Quests → `QuestBoard.svelte`
- World → `WorldPanel.svelte`
- Events → `EventFeed.svelte`

Default active tab on load: Roster.

### Right panel

Contextual. Shows one of:
- **Nothing** (default): a brief "You are the unseen hand. Watch. Reach in when it matters."
- **Character detail**: when an adventurer is selected from the roster or an event.
- **Active decision moment**: the highest-priority active `DecisionMoment` (by priority order defined in `behaviors/decision-moments.md`). If multiple, shows the highest-priority one; others are accessible via a small list below it.

When a decision moment is active, the right panel pulses with a subtle visual indicator (e.g. border animation) to draw attention without being disruptive.

### DI meter

- Horizontal bar: fills from left proportional to `divineInfluence / 100`.
- Color: green (≥ 60), amber (25–59), red (< 25).
- Floating delta text: last 3 DI change events shown as floating labels (`+10 from Mira's milestone`, `−15 from blessing`) that fade out over 3 seconds.
- Tooltip on hover: explains DI income sources and cost categories. Text is static (see below).

DI meter tooltip text:
> "Divine Influence fuels your interventions. You gain it from quest completions, relationship milestones, personal goal achievements, and deaths you choose not to prevent. You spend it on divine touches, event seeding, difficulty shifts, and decision moment options. Spending everything makes you helpless. Letting the world breathe makes you powerful."

## Actions

- **Tab click**: switches active tab. Marks Events as read when Events tab is opened.
- **Pause / speed buttons**: dispatch `PAUSE` or `SET_SPEED` command to simulation.
- **Click adventurer in roster**: opens character detail in right panel.
- **Click decision moment option**: dispatches `CHOOSE_OPTION` command (UI is on `ChoiceCard` — see `screens/choice-card.md`).

## Navigation

Single-page. No URL changes. State is panel-driven.

## Principles

**Inherited:**
- [DI bankruptcy is a valid player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — the DI meter must not block or warn in a way that prevents DI from reaching 0. It surfaces the state clearly; it does not prevent it.
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the unread badge on the Events tab is the primary mechanism for drawing attention to events. It must always reflect the true unread count.

**Local:**
- **Decision moments get right-panel priority over character detail.** When an active decision moment exists, it displaces any currently-shown character detail from the right panel. The player's divine attention is more urgent than retrospective character review. Character detail is re-shown when all moments are resolved.

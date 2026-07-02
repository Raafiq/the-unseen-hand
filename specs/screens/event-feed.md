# Screen: Event Feed

## Route

Active when Events tab is selected in app shell.

## Data Requirements

From `simulationStore`:
- `eventLog: SimulationEvent[]` — full event log, ordered by tick + emission order
- `adventurers: Map<AdventurerId, Adventurer>` — for name resolution on click

## Display Rules

### Layout

Chronological list of simulation events, newest at top (reverse chronological). Each event is one row.

### Event row

Each row shows:
- **Time label**: "Day {day}, hour {hour}" derived from the event's `tick`.
- **Type tag**: small colored pill indicating event `kind`: Social (teal), Combat (red), Quest (amber), Lifecycle (purple), World (blue), Divine (gold), Thought (muted grey — row text renders italic; see `thought-system.md`).
- **Rendered text**: `event.renderedText` — the pre-rendered narrative string. Never empty.
- **Involved adventurers**: if `involvedIds` or `participantIds` are present, show a small row of portrait initials below the text. Clicking a portrait navigates to that adventurer's character detail in the right panel. A `THOUGHT` event's single participant is its `actorId` (the thinker) — it must resolve in `getInvolvedIds` so whispers appear under that actor's character filter.

### Day summary blocks (Phase 6)

When the LLM narrator is active (API key present), a "Day summary" block is inserted at the top of each in-game day's events. It displays the LLM-generated 2–3 sentence narrative paragraph summarising that day. If the API key is absent, no summary block is shown and template-rendered events remain the only content. This degradation is graceful — the feed is fully usable without LLM output.

### Filtering

A filter bar above the list. Filter toggles per type:
- All (default: selected)
- Social
- Combat
- Quest
- Lifecycle
- World
- Divine
- Thought

Selecting a specific type deselects "All" and filters the list to matching `kind` values. Selecting "All" clears all type filters. Multiple specific types can be selected simultaneously.

Filtering does not mark events as read — it only affects display.

### Unread tracking

- Opening the Events tab marks all currently-visible events as read (regardless of filter state).
- New events arriving while Events tab is open do not increment the unread count.
- Unread count (displayed as badge on the Events tab) resets to 0 when the tab is opened.

### Performance

The event log is append-only and may grow large. The feed must virtualize rendering — only the visible rows (plus a buffer) are rendered in the DOM. Scrolling up reveals older events; scrolling stops at the oldest event.

## Actions

- **Toggle filter type**: shows/hides events by kind.
- **Click "All"**: resets filter to show all types.
- **Click portrait initial on an event row**: opens character detail for that adventurer in the right panel.
- **Click event row** (not a portrait): highlights all involved adventurers in the roster grid (highlights their card borders). Click again to clear highlight.

## Navigation

Within the app shell. Clicking portraits in event rows opens character detail in the right panel without leaving the Events tab.

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the event feed is the player's primary interface with the world story. It must be fast, readable, and always have content once adventurers are active.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — `renderedText` on every row must be a human-readable sentence. No debug strings, no empty rows, no "[event]" placeholders.

**Local:**
- **Newest first.** The player's most immediate need is to catch up on what just happened, not to read from the beginning. Reverse chronological is the primary read direction; the player may scroll down to see history.

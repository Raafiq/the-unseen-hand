# Screen: Character Detail Panel

## Route

Right panel of app shell when an adventurer is selected.

## Data Requirements

From `simulationStore` (for the selected `adventurerId`):
- `adventurer: Adventurer` — full adventurer object
- `relationships: RelationshipGraph` — for this adventurer's edges
- `eventLog: SimulationEvent[]` — filtered to events involving this adventurer
- `divineInfluence: number` — to determine which divine touch options are affordable

## Display Rules

### Identity section

At top of panel:
- **Portrait**: same colored-initial circle as roster card, but larger.
- **Name and age**: `{name}, age {age}`
- **State badge**: same as roster card
- **Backstory**: full `identity.backstory` text, rendered in italic. Truncated at 120 characters with "..." and an expand link if longer.
- **Personal goal**: goal name in bold + a descriptive phrase (e.g. `HEROISM → "Seeks glory and legend"`) + a progress bar showing milestones completed / total.

### Personality axes

A visual display of all 5 axes: courage, greed, empathy, loyalty, ambition.

Display format: horizontal bars for each axis, labeled, with numeric value shown. Values are the **base** axis values (0–100). Contextual modifiers from the history layer are not displayed here (they are invisible to the player — they produce behaviour, not a stat screen).

### Mood section

- **Mood score**: `{mood}/100` as a number + a colored label badge (`CONTENT` / `NEUTRAL` / `UNSATISFIED` / `DESPAIRING`).
- **Top 3 mood factors**: listed as `{label}: {value > 0 ? '+' : ''}{value}` (e.g. "Lost a companion: −35", "Quest success: +15"). Sorted by `|value|` descending.

### Inner voice section

- The actor's **current thought** (`thought-system.md`), rendered via the pure on-demand path
  (`renderThought`) — italic prose, 1–3 sentences. Hidden entirely when no thought renders
  (DEAD/RETIRED). Re-renders as the tick advances; while paused it is stable (same tick → same
  text, guaranteed by the derived stream). This section also appears on the townsfolk detail
  (`npc-system.md#ui--townsfolk-detail`), along with the NPC's `want`.

### Relationships section

Listed as rows, one per edge (adventurer with at least `ACQUAINTANCE` relationship or higher — `STRANGER` edges not shown unless they are known faces from long proximity):

Each row:
- Counterpart's name
- Relationship type badge (`FRIEND`, `RIVAL`, etc.)
- Strength bar (−100 to +100, color-coded: blue for positive, red for negative)
- `[deceased]` or `[departed]` annotation if the counterpart is dead/retired

Sorted: positive relationships first (highest strength), then negative (most negative last).

### History section

Last 10 `HistoryEvent` entries for this adventurer, in reverse chronological order (most recent first):

Each entry: `Day {day}: {description}` — where `description` is a human-readable rendering of the `HistoryEventKind` and `involvedIds`.

Examples:
- "Day 8: Witnessed Garrett's death in the Ashwood dungeon."
- "Day 3: Nearly died — but survived."
- "Day 1: Received divine guidance (dream)."

### Last Day Events section

Displayed between History and Divine Touch.

Shows the **1–2 most significant events from the previous in-game day** involving this
adventurer, as their already-rendered feed sentences. Significance is defined in
`behaviors/social-system.md` §7 (BREAKTHROUGH, ESTRANGEMENT, relationship type-boundary
crossings, crisis-flagged outcomes, deaths/departures of known companions, quest outcomes).
The events are selected from `eventLog` (and/or the history layer), filtered to the prior day
(`day * 24 - 24` … `day * 24 - 1`) and to events whose participants include this adventurer.

- Header: "Yesterday" (or "Last seen on Day {day}" if the adventurer is dead/retired).
- Content: the 1–2 most significant event sentences, in chronological order, sorted by
  significance when more than two qualify.
- Hidden entirely if there were no significant events on the prior day. No placeholder text, no
  "nothing to report."

This section is read-only — a window into what mattered to the character recently, not an
action surface. It reads from the deterministic event/history record (there is no
per-character LLM card).

### Divine Touch sub-panel

Below history. Header: "Divine Touch".

Lists all applicable `DivineEffect` options for this adventurer (based on their current state — some effects are gated: `LUCK_CURSE` not shown if on cooldown, `REVEAL_SECRET` not shown if no acquaintances):

Each option row:
- Effect name
- One-sentence description
- DI cost (as a number)
- Narrative distance label: `LOW` / `MODERATE` / `EXTREME`
- **Greyed out and non-interactive** if current `divineInfluence < diCost`

Clicking an option that is affordable opens a **confirmation dialog**:
> "Spend {cost} DI to {effect description}? This cannot be undone."
> [Confirm] [Cancel]

Confirming dispatches `DIVINE_TOUCH` command. Cancelling closes the dialog with no effect.

## Actions

- **Expand backstory**: reveals full backstory text in place.
- **Click relationship row**: selects that counterpart adventurer (navigates character detail to show that adventurer instead).
- **Click divine touch option**: opens confirmation dialog.
- **Confirm divine touch**: dispatches `DIVINE_TOUCH` command.

## Navigation

Within the right panel. Clicking a relationship row replaces the current character detail with the counterpart's detail. A back button (`← {prior name}`) appears when navigating this way.

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — the history section is what makes this true in the UI. It must show actual events, not placeholders.
- [DI bankruptcy is a valid player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — unaffordable divine touches are greyed out, not hidden. The player sees what they can't afford. This creates desire and communicates the cost of over-spending.

**Local:**
- **Contextual modifiers are invisible to the player.** The personality axes displayed are base values only. Showing contextual modifiers would confuse "what kind of person are they" with "what is their context right now." The history section provides the narrative context instead.

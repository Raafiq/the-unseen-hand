# Screen: Cycle Reader (Event Feed)

> Formerly the live "Event Feed". The events cycle-redesign (2026-07-04) made the primary
> surface a **per-character reading experience** for the just-completed cycle; the terse
> chronological feed survives beneath it as the **raw log** drill-down. File kept as
> `event-feed.md` so existing spec references resolve.

## Route

The persistent centre of the app shell (`screens/app-shell.md`). Always in view; there is no tab navigation.

## Data Requirements

From `simulationStore`:
- `worldTime: WorldTime` — current `{ day, cycle }`, used to label the spread and know which cycle just resolved
- `lastCycleDigest: { fromTick, toTick, day, cycle }` — the range of the most recently completed cycle (`behaviors/world-clock.md`)
- `eventLog: SimulationEvent[]` — full event log; sliced by tick range for a cycle's raw log
- `cycleChapters` — per-character chapters and the cycle overview for the current spread (`behaviors/cycle-narrative.md`)
- `adventurers: Map<AdventurerId, Adventurer>` — for chapter authorship, name resolution, and the roster selector

## Display Rules

### The two layers

The reader has a **primary read layer** and a **secondary raw-log layer**. The read layer is shown by default; the raw log is one toggle away and never the resting state.

### Cycle spread (primary)

The main panel presents the **just-completed cycle** as a "spread":

- **Header**: the cycle and date — "Day {day} · {Morning|Afternoon|Night}".
- **Cycle overview**: the 1–2 sentence establishing paragraph for the whole guild that cycle (`behaviors/cycle-narrative.md` — the descendant of the day summary). Visually set apart (left rule or tinted background). Omitted when neither tier produced one.
- **Character chapters**: one card per adventurer who had a meaningful event this cycle, each showing the character's portrait + name and their **chapter** prose (`behaviors/cycle-narrative.md`). Chapters are laid out as a readable stack/columns, living adventurers first. A character with no meaningful cycle events has no card (no placeholder).
- **Reading is optional and non-blocking.** The player may read all chapters, one, or none. Nothing gates `PROCEED` on having read (`principles.md#autonomy-of-outcomes-player-controlled-tempo`).

### Character chapter card

Each card shows:
- The character's portrait + name (portrait resolution per `behaviors/character-portraits.md`).
- The chapter prose: the LLM passage when it has arrived, otherwise the deterministic template passage (`behaviors/cycle-narrative.md`). Never empty for a character that has a card.
- A small row of co-participant portrait initials for the cycle's shared encounters; clicking one focuses that character's chapter (its card) in the same spread. A shared encounter appears, POV-shaded, in each participant's chapter.
- No raw outcome labels or debug strings ever appear — prose only.

### Selecting a character to read

The **roster dock** (`screens/app-shell.md`) is the character selector for reading. Clicking a dock card **focuses that character's chapter** in the spread (scrolls to and highlights their card). This is distinct from the character-**detail drawer** (stats/relationships), which the dock also governs; focusing a chapter to read and opening the stat drawer are different affordances on the same dock — the detail drawer remains the stat view, the spread is the narrative read.

### History of prior cycles

Above the current spread, earlier cycles remain scrollable in reverse order (newest cycle at the resting position, older spreads above as the player scrolls back), each rendered as its own overview + chapters. The player can re-read any past cycle. This replaces the old "infinite reverse-chronological one-liner list" as the default view.

### Raw log (secondary / drill-down)

A toggle (e.g. "Raw log") on the current spread reveals the terse, chronological, one-line-per-event view for that cycle — the former event feed, unchanged in spirit:

- Each row: time label ("Day {day}, hour {hour}"), a **type tag** pill by `kind` (Social teal, Combat red, Quest amber, Lifecycle purple, World blue, Divine gold, Thought muted-grey italic), and `event.renderedText` (the deterministic grammar line, never empty), plus involved-adventurer portrait initials.
- The raw log is the **audit trail** — it shows exactly what the chapters were composed from, one deterministic line per event. It is the ground truth beneath the prose.
- Rows are ordered chronologically within the cycle (oldest → newest reads naturally as the cycle's timeline).
- The raw log drops any event kind whose owning feature is flag-gated (`hiddenEventKinds`), same as before.

### Filtering (raw log only)

The type-filter bar applies to the **raw log**, not the chapters. Toggles: All (default), Social, Combat, Quest, Lifecycle, World, Divine, Thought. Selecting a type deselects "All" and filters to matching `kind`; "All" clears type filters; multiple types may be active. Filtering only affects the raw-log display.

### Performance

Prior-cycle history and the raw log are append-only and grow large. Both must virtualize — only visible spreads/rows (plus a buffer) are in the DOM. Chapter LLM passages, when present, replace their template passages in place without reflowing the whole spread.

## Actions

- **Proceed** (in the app shell): dispatches `PROCEED`, computes the next cycle, and moves the spread to that new cycle (see `screens/app-shell.md`).
- **Click a roster dock card**: focuses that character's chapter in the spread.
- **Click a co-participant initial on a chapter**: focuses that character's chapter.
- **Toggle Raw log**: reveals/hides the terse chronological view for the current cycle.
- **Toggle filter type** (raw log open): shows/hides raw-log rows by kind; **All** resets.
- **Scroll back**: re-read prior cycles' spreads.

## Navigation

Within the app shell. No URL changes. Focusing a chapter, opening the raw log, and scrolling prior cycles all stay on this surface. The character-detail drawer (stats) is reached via the roster dock as specified in `screens/app-shell.md`.

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the reading surface is now the game's primary interface. It must be vivid on templates alone; the raw log guarantees every event is still readable as a deterministic line beneath the prose.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — both layers honour this: chapters are the causal story, the raw log the traceable ledger. No debug strings, no empty rows, no placeholder chapters.
- [Autonomy of outcomes; player-controlled tempo](../principles.md#autonomy-of-outcomes-player-controlled-tempo) — the spread is what the player reads during the between-cycles pause; reading never gates advancement.

**Local:**
- **Prose on top, ledger beneath.** The chapters are the read; the raw log is the audit trail that proves the prose. Neither replaces the other — the raw log is always one toggle away, never the resting view, and never discarded.
- **Newest cycle is home.** The resting position is the just-completed cycle. The player scrolls *back* to re-read history; they do not scroll forward past unread cycles, because the world has not computed them yet.

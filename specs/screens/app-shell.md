# Screen: App Shell

## Route

`/` (root; single-page application, no routing required)

## Data Requirements

From `simulationStore`:
- `worldTime: WorldTime` — current in-game `{ day, cycle, hour }` (see `behaviors/world-clock.md`)
- `lastCycleDigest: { fromTick, toTick, day, cycle }` — the cycle the reader is currently showing
- `divineInfluence: number` — current DI
- `activeDecisionMoments: DecisionMoment[]` — for right-panel ChoiceCard priority
- `eventLog: SimulationEvent[]` — source for the cycle reader (`screens/event-feed.md`)
- `cycleChapters` — per-character chapters + cycle overview for the current spread (`behaviors/cycle-narrative.md`)
- `adventurers: Map<string, Adventurer>` — for the roster dock (also the chapter selector)
- `scenario: ScenarioState | null` — for world name and scenario status

## Display Rules

### Top bar

Fixed at top. Contains:
- **World name**: scenario title if `scenario !== null`, else "Sandbox" in italic.
- **In-game date**: formatted as "Day {worldTime.day} · {Morning|Afternoon|Night}" - e.g. "Day 12 · Afternoon". This is the cycle the world is *poised on* (`worldTime.cycle`), the one the next **Proceed** will read - not a wall-clock hour. It deliberately reads one cycle ahead of the newest spread header (which names the cycle *just read*, `digest.cycle`): the clock says where the world **is**, so it advances on every Proceed, while the spread names the page you are on.
- **DI meter** (see `components/DIMetrComponent`): prominent bar showing current / 100. Includes recent deltas (see `screens/app-shell.md#di-meter`).
- **Proceed control**: a single prominent **Proceed** button that dispatches `PROCEED`, computing the next cycle and advancing the reader to it (`behaviors/world-clock.md`, `screens/event-feed.md`). Its label names where you are headed — "Proceed to Afternoon", "Proceed to Night", "Proceed to Day {n+1}". There are no speed multipliers and no pause control — the world is always halted between cycles by design, so "paused" is not a state to enter or indicate.

### Main panel

The event feed is the persistent centre of the shell — there is no tab navigation.
`EventFeed.svelte` fills the primary area at all times, so the running world is always
in view.

Quests and World are not surfaced here while their features are flag-gated
(`featureFlags.ts`); when re-enabled they get their own home rather than displacing the
feed. The feed already drops any event kind whose owning feature is hidden (see
`hiddenEventKinds`).

### Roster dock

The roster is a persistent horizontal dock pinned to the bottom of the shell, spanning
the full width beneath the main panel and right panel (`RosterDock.svelte`). It shows a
compact card per adventurer — portrait, name, state badge, mood bar — that scrolls
horizontally when the roster outgrows the width. Living adventurers come first, sorted by
name; the fallen and departed follow, desaturated.

Clicking a dock card selects that adventurer and opens the **detail drawer** (below);
clicking the selected card again deselects it and closes the drawer. The dock stays visible
at all times.

### Detail drawer

When an adventurer is selected, their character detail rises as a drawer directly above the
roster dock (`CharacterDetail.svelte`, `variant="drawer"`), spanning the full width and
pushing the main panel up rather than covering it. Action and result share the bottom
region — the click and the detail live together — so there is no cross-screen jump.

The drawer lays its sections out in balanced newspaper columns (identity spanning the top,
then personality / mood / relationships / history flowing into columns) to use the wide,
short space instead of scrolling. It carries a close (×) control, and clicking a
relationship inside it re-targets the drawer to that actor. It is capped at ~42% of
viewport height and scrolls internally if a character's history overflows.

The drawer holds whichever **actor** is selected. When the selected id is a guild adventurer
it shows the character detail above; when it is a notable **townsfolk** (Tier A NPC) it shows
the read-only townsfolk detail defined in `behaviors/npc-system.md#ui--townsfolk-detail`
(name, role, bio, traits, relationships — no goal / history / divine-touch / dispatch). A
townsfolk is reached by clicking a `[townsfolk]` relationship row inside a character's detail
or a notable-NPC name in the event feed; both funnel through the same actor selection as a
roster click.

### Right panel

Your divine dashboard — a stable column that does not churn as you inspect adventurers.
Shows one of:
- **Scenario status** (default): the "You are the unseen hand" line, scenario goal
  checklist, and treasury / reputation.
- **Active decision moment**: the highest-priority active `DecisionMoment` (by priority order defined in `behaviors/decision-moments.md`). If multiple, shows the highest-priority one; others are accessible via a small list below it.

Decision moments that arise during a cycle are surfaced **at the cycle boundary**, alongside the reads, rather than mid-cycle (`behaviors/world-clock.md`, `behaviors/decision-moments.md`). They do **not** gate `PROCEED`: consistent with autonomy-of-outcomes, the player may resolve a moment before proceeding or proceed and let it ride toward its expiry. When a decision moment is active, the right panel pulses with a subtle visual indicator (e.g. border animation) to draw attention without being disruptive.

### DI meter

- Horizontal bar: fills from left proportional to `divineInfluence / 100`.
- Color: green (≥ 60), amber (25–59), red (< 25).
- Floating delta text: last 3 DI change events shown as floating labels (`+10 from Mira's milestone`, `−15 from blessing`) that fade out over 3 seconds.
- Tooltip on hover: explains DI income sources and cost categories. Text is static (see below).

DI meter tooltip text:
> "Divine Influence fuels your interventions. You gain it from quest completions, relationship milestones, personal goal achievements, and deaths you choose not to prevent. You spend it on divine touches, event seeding, difficulty shifts, and decision moment options. Spending everything makes you helpless. Letting the world breathe makes you powerful."

## Actions

- **Proceed**: dispatches `PROCEED`, computing the next cycle and advancing the reader to it (`behaviors/world-clock.md`). This is the sole tempo control; there is no pause or speed command.
- **Click adventurer in roster dock**: focuses that character's chapter in the cycle reader (`screens/event-feed.md`) and opens the character-detail drawer above the dock; clicking the selected card again (or the drawer's × control) deselects it and closes the drawer.
- **Click decision moment option**: dispatches `CHOOSE_OPTION` command (UI is on `ChoiceCard` — see `screens/choice-card.md`).

## Navigation

Single-page. No URL changes. State is panel-driven.

## Principles

**Inherited:**
- [DI bankruptcy is a valid player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — the DI meter must not block or warn in a way that prevents DI from reaching 0. It surfaces the state clearly; it does not prevent it.
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the cycle reader is the persistent centre of the shell, always in view, never hidden behind a tab.
- [Autonomy of outcomes; player-controlled tempo](../principles.md#autonomy-of-outcomes-player-controlled-tempo) — the top bar's tempo control is a single **Proceed**, not speeds; the world halts between cycles for reading and advances only on the player's command, while every outcome still resolves autonomously within the cycle.

**Local:**
- **Action and its result share a region.** Inspecting an adventurer resolves in the detail drawer that rises from the dock — right where the roster card was clicked — never in the opposite corner of the screen. This keeps the trigger and its consequence spatially bound.
- **The right panel is the divine dashboard, not a character inspector.** It stays reserved for the god-layer (scenario status, and decision-moment ChoiceCards) so it does not churn every time the player reviews a mortal. Character review lives in the drawer; a decision moment still takes the right panel, and the two can coexist because they occupy different regions.

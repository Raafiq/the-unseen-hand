# Screen: Choice Card (Decision Moment UI)

## Route

Rendered in the right panel of the app shell when active `DecisionMoment` objects exist. Highest-priority moment is shown; others are listed below as compact cards.

## Data Requirements

From `simulationStore`:
- `activeDecisionMoments: DecisionMoment[]` — sorted by priority (see `behaviors/decision-moments.md`)
- `divineInfluence: number` — for affordability checks
- `worldTime: WorldTime` — for expiry countdown

## Display Rules

### Primary choice card (highest-priority moment)

Displayed prominently at the top of the right panel:

- **Situation text**: `moment.situationText` — large, bold. This is the narrative hook that explains what's happening.
- **Expiry countdown**: "Expires in {N} ticks" displayed as a countdown. If ≤ 12 ticks remaining: colored amber. If ≤ 3 ticks remaining: colored red with a pulse animation. Updates every tick.
- **Options list**: one button/row per `DecisionOption` in `moment.options`:
  - Option label (bold)
  - Option description (smaller text, 1–2 lines)
  - DI cost (right-aligned): `{cost} DI` or `Free` if cost is 0
  - Narrative distance label: `LOW` / `MODERATE` / `EXTREME` shown as a small tag
  - **Greyed out and non-interactive** if `divineInfluence < option.diCost`

Option 0 ("Let fate decide") is always the first option listed, always shows as `Free`, and is always interactive regardless of DI.

Clicking an affordable option dispatches `CHOOSE_OPTION` immediately (no confirmation dialog — the situation text, description, and cost are already displayed). The card collapses after dispatch.

### Secondary moment cards (lower-priority moments)

Below the primary card: compact list of other active moments (if any). Each compact card shows:
- Situation text (truncated at 60 characters)
- Expiry countdown
- "Tap to focus" label

Clicking a compact card promotes it to the primary card position (replaces the current primary card in the UI; the prior primary returns to the compact list). No change to resolution order — this is a display-only priority override.

### Expired card state

When a moment expires mid-display (its `expiresAt` tick passes):
- Primary card collapses with a brief animation.
- A "Resolved by fate" label appears for 2 seconds, then fades.
- The next highest-priority moment (if any) slides into the primary position.

### Empty state

If `activeDecisionMoments` is empty: the right panel shows the default state ("You are the unseen hand..."). No empty card UI.

## Actions

- **Click option (affordable)**: dispatches `CHOOSE_OPTION` command with `decisionId` and `optionIndex`.
- **Click compact card**: promotes it to primary display position.
- No action for unaffordable options (greyed out, no click handler).

## Navigation

Within the right panel. After a moment is resolved, the panel either shows the next moment or reverts to character detail (if an adventurer was selected before the moment appeared) or the default state.

## Principles

**Inherited:**
- [Autonomy is the default](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — the expiry countdown is not a countdown to failure; it's a countdown to the world resolving the situation on its own. The default outcome (fate decides) is always shown as the first option.
- [DI bankruptcy is a valid player state](../principles.md#di-bankruptcy-is-a-valid-intended-player-state) — unaffordable options are greyed out but visible. The player sees what costs what. Running dry and watching a death moment expire unresolved is the intended experience.
- [Emergence over control](../principles.md#emergence-over-control) — "Let fate decide" must always be available and zero-cost. It is never hidden, labelled negatively, or visually subordinate to paid options.

**Local:**
- **No confirmation dialog for option selection.** The situation text, description, and cost are already visible on the card. A confirmation dialog adds friction to a time-sensitive interaction. The player accepted the cost when they read the card.

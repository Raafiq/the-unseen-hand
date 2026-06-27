# Screen: Combat Replay

## Route

Modal overlay, launched from a completed quest card in the Quest Board view. No dedicated URL.

## Data Requirements

- `QuestOutcome.beats: CombatBeat[]` — the beat sequence for the quest being replayed
- `adventurers: Map<AdventurerId, Adventurer>` — for names and portraits
- PixiJS v8 canvas (Phase 6+ only; not rendered before Phase 6)

## Display Rules

### Modal layout

Full-screen modal with a dark backdrop. Contains:
- Quest name + outcome label ("Success" / "Failure") at top.
- PixiJS canvas occupying the main area.
- Beat transcript panel on the right (fixed width): scrollable list of beat text as beats play.
- Playback controls at the bottom: Play / Pause, speed (1× / 3×), Close.

### Canvas

Simple flat field. No terrain, no background detail.

- Each party member is represented by a named icon (colored circle with initial, same style as roster cards).
- Enemy(s) represented by a darker icon cluster on the opposite side.
- Beats play out sequentially:
  - `ATTACK` / `CRITICAL`: actor icon moves toward target, brief flash on target.
  - `FLEE`: actor icon moves off-screen edge (if `FLEE` in losing fight).
  - `DEFEND_ALLY`: actor icon moves in front of ally icon; a brief shield animation.
  - `HESITATE`: actor icon dims briefly (no movement).
  - `NEAR_DEATH`: target icon pulsates red briefly.
  - `USE_ITEM`: actor icon glows briefly (no specific item sprite).

Beat animation speed: ~1.5 seconds per beat at 1×. At 3×: ~0.5 seconds per beat.

### Beat transcript panel

Each beat's `renderedText` appears as a new line as the beat plays. Includes `personalityNote` in italics below the beat text if present. The panel auto-scrolls to the latest beat.

### End state

After the last beat:
- Canvas holds final icon positions.
- Outcome summary shown below canvas: party members who died are greyed out in-canvas.
- "Close" button returns to the quest board.

## Actions

- **Play / Pause**: starts or pauses beat playback.
- **Speed toggle (1× / 3×)**: changes beat animation speed.
- **Close**: dismisses the modal; returns to quest board.
- Replay begins paused. Player presses Play to start. Auto-play option (checkbox): if checked, replay starts automatically when modal opens.

## Navigation

Modal over the app shell. Closing returns to quest board (World or Quests tab, whichever launched it).

## Principles

**Local:**
- **Replay is reconstruction, not re-simulation.** The outcome is already determined. The replay dramatises `QuestOutcome.beats` — it cannot change anything. This must be clear from the playback UX (it is a "replay", not a "battle"). This aligns with [Probability shift, not outcome override](../principles.md#probability-shift-not-outcome-override) — the replay shows what fate already decided.

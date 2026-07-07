# Bugs

## Original backlog

1. Sleeping event not triggering, is there awareness of a night time? there can be occassions where characters might stay up, but this should incur penalities
2. TRUSTED_COMPANION is displayed in the UI
3. Activities that span a few hours should not be repeatedly shown every hour. Activies if ended should be show that it's ended as a transition event together with the next activity. e.g Kara has woken from sleep. She is now getting ready for hunting. 
4. We should just start Day 0 at 09:00
5. There should be a character filter in events so player can track a single character if they want to.
6. if there's an event that players can intervene in that pops up on the right, pause the day and highlight it for players attention.
7. There should be some quests available at Day 0.

### Status from the Day-5 playtest (2026-07-07 — see `playtest/day5-report.md`)

- **#1 — still open.** Reiko sleeps h09→16 (through the day) and h02→06; no fatigue penalty. See B103.
- **#2 — not reproduced (looks fixed).** Relationships render "Acquaintance"/"Stranger"; `TRUSTED_COMPANION` appears only in label maps, never surfaced.
- **#3 — looks fixed.** Activities now render as transitions ("Reiko finishes hunting and begins gossiping"). Thrash frequency is high, but the every-hour repetition is gone.
- **#4 — half-done and now wrong.** `START_TICK=9` was set, but 09:00 mislabels as "Afternoon" and knocks every cycle out of phase. See B101.
- **#5 — still open.** Event filter is by *kind*, not per-character.
- **#6 — N/A this build.** DI / decision moments are feature-flagged off.
- **#7 — still open.** First quest appears Day 1 h06, not Day 0.

## Found in the Day-5 playtest (2026-07-07)

Grounded in a recorded playthrough (`playtest/day5-transcript.json`); reproduce with
`node playtest/record-playthrough.mjs`. Full write-up in `playtest/day5-report.md`.

### High

- **B101 — World clock opens mislabeled and every cycle is out of phase with its header.**
  `scenario1.ts:138` `START_TICK=9` collides with `cycleOf`'s 0/8/16 partition (`world/WorldTime.ts`),
  so the game opens reading "Day 0 · Afternoon" at 09:00. `SimulationLoop.proceed()`
  (`world/SimulationLoop.ts:118`) computes a fixed 8 ticks from tick 9, putting cycle boundaries at
  hours 9/17/1, so each spread files a foreign-cycle event under the wrong header (hour-16 event under
  "Afternoon"; hour-02/09 events under "Morning"). Violates `world-clock.md`'s cycle-boundary invariant.
- **B102 — Quest and near-death resolve off-page.** Quest picked up Day 1 h06; Reiko's near-death and
  first kill appear only in the character-detail history, never in any cycle prose or raw log. The four
  cycles she's on the quest are `quiet`/empty. (Partly flag-gating, partly a narration gap.)
- **B103 — Treasury and Reputation change with no ledger event.** 50g→238g and rep 0→5 after the quest
  reward, with no `rawRows` entry logging either — and both are scenario win-conditions.

### Medium

- **B104 — Relationship drift glyph contradicts its cause.** `relationships/drift.ts` `computeEdgeDrift`
  sets `direction` from the net window sum but `cause` from the latest event's kind, so a net-warming edge
  whose last beat was cold renders ▲ (warming/green) next to "a cooling silence".
- **B105 — "No one had a story worth telling this cycle" shown over a non-empty raw log.** The quiet
  copy (`EventFeed.svelte:227`, gated on `sorted.length === 0`) fires on cycles whose raw ledger still
  lists activity (steps 10/12/14).
- **B106 — Pronoun inconsistency.** Reiko is "she/her" in her authored backstory but "they/their" in all
  generated prose ("gathers their gear", "find their people").
- **B107 — World-span ambient flavor glued onto unrelated lines, repeats within a cycle, bleeds onto the
  away-quest.** `eventBus.ts:~637` appends span colour text to non-WORLD/non-COMBAT families but not
  QUEST, so town ambience lands on a dungeon quest-return line; the same span line can repeat twice in a
  cycle; and with the World map off these spans are never announced, only tinted.
- **B108 — Cycle overview asserts plurality a one-adventurer guild can't have.** `cycleNarrative.ts:196`
  "The day left its mark on more than one of them" is roster-blind; every spread has one chapter.

### Low

- **B109 — Console 404 on load (missing favicon).** `index.html` declares no `<link rel="icon">`, so the
  browser's automatic `/favicon.ico` request 404s.
- **B110 — Mood color/label disagree at the threshold.** `43/100 — NEUTRAL` shown with an orange
  (warning) bar; green→orange flips around 48–50.
- **B111 — Quest-return prose redundant/contradictory.** "The party trudges home… The party returns
  triumphant…" with the quest title printed twice (Combat row + Quest row stitched without dedupe).

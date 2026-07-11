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

> **Fix status (this PR — clock + drift + narrative polish):** ✅ = fixed with tests;
> ⏳ = deferred (needs a spec + plan per specops); ⓘ = re-examined, not a defect.
> Fixed: **B101, B104, B105, B107, B108, B109, B111.** Deferred: **B102, B103, B106.**
> Not a defect: **B110.** The committed `playtest/day5-transcript.json` is the *before*
> evidence; the fixes are verified against a fresh build (console 404 gone, drift glyph
> agrees with its cause, no "more than one of them" over a solo roster, etc.).

### High

- ✅ **B101 — World clock opens mislabeled and every cycle is out of phase with its header.**
  `scenario1.ts:138` `START_TICK=9` collides with `cycleOf`'s 0/8/16 partition (`world/WorldTime.ts`),
  so the game opens reading "Day 0 · Afternoon" at 09:00. `SimulationLoop.proceed()`
  (`world/SimulationLoop.ts:118`) computes a fixed 8 ticks from tick 9, putting cycle boundaries at
  hours 9/17/1, so each spread files a foreign-cycle event under the wrong header (hour-16 event under
  "Afternoon"; hour-02/09 events under "Morning"). Violates `world-clock.md`'s cycle-boundary invariant.
  *Fixed:* `START_TICK = 8` (a cycle boundary), so PROCEED's fixed-8-tick window stays in phase with
  the 0/8/16 partition. Header/hour mismatches drop from ~5 to the 1 accepted closing boundary tick
  (an event on the cycle's last hour, per the inclusive-`toTick` digest convention `proceed.test.ts`
  blesses; realigning that is a `world-clock.md` spec change, deferred).
- ⏳ **B102 — Quest and near-death resolve off-page.** Quest picked up Day 1 h06; Reiko's near-death and
  first kill appear only in the character-detail history, never in any cycle prose or raw log. The four
  cycles she's on the quest are `quiet`/empty. (Partly flag-gating, partly a narration gap.)
- ⏳ **B103 — Treasury and Reputation change with no ledger event.** 50g→238g and rep 0→5 after the quest
  reward, with no `rawRows` entry logging either — and both are scenario win-conditions. *(New behavior —
  emitting an economy ledger event needs a spec + plan; deferred.)*

### Medium

- ✅ **B104 — Relationship drift glyph contradicts its cause.** `relationships/drift.ts` `computeEdgeDrift`
  set `direction` from the net window sum but `cause` from the latest event's kind, so a net-warming edge
  whose last beat was cold rendered ▲ (warming/green) next to "a cooling silence". *Fixed:* `cause` now names
  the most recent entry whose delta agrees with the trend, so glyph and label can never point opposite ways.
- ✅ **B105 — "No one had a story worth telling this cycle" shown over a non-empty raw log.** The quiet
  copy (`EventFeed.svelte`, gated on `sorted.length === 0`) fired on cycles whose raw ledger still listed
  activity. *Fixed:* the marker now reads "Only the everyday this cycle — chores, patrols, rest…" when the
  cycle has routine events, and "The guild was still; nothing stirred…" only when it is genuinely empty.
- ⏳ **B106 — Pronoun inconsistency.** Reiko is "she/her" in her authored backstory but "they/their" in all
  generated prose ("gathers their gear", "find their people"). *(Needs a gender/pronoun field on the
  adventurer data-model threaded through the templates — a spec change; deferred.)*
- ✅ **B107 — World-span ambient flavor bleeds onto the away-quest.** `eventBus.ts` appended span colour
  text to non-WORLD/non-COMBAT families but not QUEST, so town ambience landed on a dungeon quest-return
  line. *Fixed:* QUEST joins WORLD/COMBAT in the span-tint exclusion (same away-from-town rationale).
- ✅ **B108 — Cycle overview asserts plurality a one-adventurer guild can't have.** "The day left its mark
  on more than one of them" was roster-blind. *Fixed:* plural-implying overview tails only enter the pool
  when more than one character has a chapter this cycle.

### Low

- ✅ **B109 — Console 404 on load (missing favicon).** `index.html` declared no `<link rel="icon">`, so the
  browser's automatic `/favicon.ico` request 404'd. *Fixed:* an inline SVG data-URI favicon (self-contained,
  no network request).
- ⓘ **B110 — Mood color/label at the threshold.** Re-examined: `moodColor` (`≥50 green, ≥25 orange, else
  red`) tracks `moodThresholdLabel` (`≥50 CONTENT, ≥25 NEUTRAL, …`) exactly — NEUTRAL = amber is by design,
  not a mismatch. No code change; a warmer NEUTRAL hue would be a palette-taste choice, not a defect.
- ✅ **B111 — Quest-return prose redundant/contradictory.** "The party trudges home… The party returns
  triumphant…" stitched a COMBAT:QUEST_RESOLVED travel line and a QUEST:COMPLETED outcome line for the same
  quest. *Fixed:* the chapter composer drops the redundant COMBAT travel line from the prose when the QUEST
  outcome is present (the raw log still shows both).

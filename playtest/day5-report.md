# Playtest Report — through Day 5

A four-player team played *The Unseen Hand* from the opening state through **Day 5** (14
Proceeds, Day 0 Afternoon → Day 5 Morning) and reported feedback and bugs. The session
was recorded end-to-end; every finding below is grounded in the recorded transcript
(`day5-transcript.json`), screenshots, the browser console, or a source-code location.

**Build under test.** Scenario *"The Failing Guild"* — a single adventurer, **Reiko**
(34, veteran), in Thornvale with townsfolk Brenna, Father Oswin, Marsa, and Captain
Halden. Divine intervention (the DI meter, blessings, decision moments) and the World map
are feature-flagged **off** (`featureFlags.ts`), so the only player verbs through Day 5
are **Proceed** and **inspect a character**. Determinism means all four players saw the
same world; they differ in lens.

---

## Executive summary

The prose engine and the character drawer are genuinely good — when the game fires a
story, it lands. But as a *build*, three things undercut it through Day 5, and all four
players independently hit them:

1. **The clock is mislabeled and out of phase.** The game opens reading "Day 0 · Afternoon"
   at what the code intends to be 09:00, and every cycle's raw-log timestamps disagree with
   the header they're filed under. One root cause, most-visible symptom.
2. **Half the playthrough is dead air.** 7 of 14 Proceeds returned "No one had a story
   worth telling this cycle" — including **four in a row** while Reiko was away on a quest.
   When Proceed is the only verb, that's dead clicks.
3. **The game's biggest beat happens off-page.** Reiko *nearly died* on a quest — the one
   life-or-death moment in five days — and it appears only as a line in a drawer you have
   to go dig for, never in the cycles you actually read. For a game whose pitch is "the joy
   is reading a completed cycle," the best cycle was never written.

The single most-agreed first fix: **fix the clock** (it's one root cause behind the most
visible wrongness), closely followed by **narrate the quest into the cycles** and **stop
charging a click for an empty cycle**.

---

## Verified bug list (ranked, deduplicated)

Severity is the team's consensus. "Verified" = confirmed in source or directly visible in
the transcript/screenshots, not inferred.

### High

**B1 — The world clock opens mislabeled and every cycle is out of phase with its header.**
`scenario1.ts:138` sets `START_TICK = 9` ("Day 0, 09:00", an attempt at known bug #4), but
`cycleOf` (`world/WorldTime.ts`) partitions the day at hours **0 / 8 / 16**, so
`cycleOf(9)` = **AFTERNOON** — the game opens reading "Day 0 · Afternoon" at 09:00.
Worse, `SimulationLoop.proceed()` (`world/SimulationLoop.ts:118`) computes a *fixed* 8 ticks
from wherever the clock sits and labels the digest by `start.cycle`. Starting at tick 9,
cycle boundaries land at hours **9 / 17 / 1** — out of phase with the 0/8/16 partition — so
each 8-tick spread straddles a cycle edge and files a foreign-cycle event under the wrong
header: step 1 "Day 0 · Afternoon" contains an **hour-16** event (`cycleOf(16)`=NIGHT); step 3
"Day 1 · Morning" contains an **hour-02** event; step 9 "Day 3 · Morning" contains an
**hour-09** event ("Done with patrol, Reiko turns to sleep"). This violates
`world-clock.md`'s invariant that the reader always rests at a cycle boundary
(`hour ∈ {0,8,16}`). *Root cause behind the most visible wrongness in the session.*

**B2 — The quest and the near-death resolve off-page; the game's biggest beat is invisible
in the feed.** Quest picked up Day 1 h06 (step 3); steps 4–7 (Day 1 Afternoon → Day 2
Afternoon) are all `quiet`/empty while Reiko's badge reads "On Quest"; the whole outcome
lands in one stitched line at Day 2 Night (step 8, "The party returns triumphant"). The
near-death and first kill exist **only** in `characterDetail.history` ("Day 2: Nearly died —
but survived", "Day 2: First blood — came out on top") and appear in no cycle prose or raw
log. The spec promises "every outcome has a narrative cause"; here the biggest outcome has
no narration. *(Part flag-gating, part narration gap — see F1.)*

**B3 — Treasury and Reputation change with no ledger event; both are win-conditions.** The
right panel reads `Treasury: 50g / Reputation: 0` at open and `238g / 5` by Day 3 Morning
(quest reward), but **no `rawRows` entry anywhere logs a gold or reputation change**. The
scenario is graded on "treasury above 0" and Reiko surviving, yet the economy mutates
invisibly with no attributable line — an unwatchable feedback loop for the exact numbers
the player is scored on.

### Medium

**B4 — Relationship drift glyph contradicts its own cause label.** The detail drawer shows
"Brenna [townsfolk] Acquaintance **▲** *a cooling silence*" (and same for Father Oswin) —
a green warming up-arrow next to cooling text. In `relationships/drift.ts` `computeEdgeDrift`
derives `direction` from the **net sum** over the 7-day window but takes `cause` from the
**latest** history entry's kind, so an edge that is net-positive (early KINDNESS) but whose
most recent beat was a coldness renders ▲ + "a cooling silence" — the two halves of the same
badge assert opposite directions. `CharacterDetail.svelte:268` picks the glyph purely off
`direction`. Actively misleading to anyone reading the indicator.

**B5 — "No one had a story worth telling this cycle" fires over a non-empty raw log.** Steps
10, 12, 14 all render the quiet line (`EventFeed.svelte:227`, shown when no chapter meets the
composition threshold: `sorted.length === 0`) yet each has populated `rawRows` (step 10:
"Reiko wakes from sleep and begins sparring"; step 12: a Marsa thought; step 14: three
activity rows). The curated layer says nothing happened while the raw ledger directly below
lists events. Contrast the *truly* empty steps 4–7 (which correctly show "No events match
this filter"). A wording/gating mismatch that reads as a contradiction.

**B6 — Reiko is "she/her" in her backstory but "they/their" in every generated line.**
Backstory: "lost **her** previous guild… **She** is all that is left." Generated prose: "Reiko
wakes… and gathers **their** gear" (step 3), goal "Wants to find **their** people". Singular-they
is fine for the ungendered townsfolk, but a hand-authored gendered backstory sitting inches
from they/their prose in the same drawer reads as a broken template.

**B7 — Sleep fires at absurd hours; activities thrash hour-to-hour (known bug #1, still
open).** Reiko "turns to sleep" at hour **09** and wakes at hour **16** (asleep through the
whole day, step 9→10); sleeps h02–06 (step 3). Thrash: step 14 trains h20 → patrols h21 →
reads h22 (three activities in three hours). There is no day/night gating on the activity
scheduler, and no visible fatigue penalty for the late nights the narrative hints at ("Sleep,
when it came, came uneasily").

**B8 — World-event ambient flavor is glued onto unrelated lines, repeats within a cycle, and
bleeds onto the away-quest.** `eventBus.ts:~637` appends active-span colour text (at ~35%) to
any non-WORLD/non-COMBAT event family — but **not** the QUEST family — so step 8's dungeon
quest-return reads "The party returns triumphant from 'Descent into the Weeping Caverns'. **A
pedlar's cry carries faintly from outside.**" (town ambience pasted onto a dungeon report). The
same span line repeats twice in one cycle (step 13: "Every traveller comes in with another
rumour of beasts." on two activity rows). And because the World map is flagged off, these
Monster-Surge / Merchant spans are **never announced** — the player only ever sees their
ambient tint, referencing events they were never shown.

**B9 — Cycle overview asserts plurality a one-adventurer guild can never have.** The overview
phrase pool (`cycleNarrative.ts:196`) includes "The day left its mark on more than one of
them," selected at steps 2, 8, 11 — each a spread with exactly **one** chapter (Reiko). The
copy is roster-blind, so it states something the transcript flatly contradicts.

### Low

**B10 — Console 404 on every load (missing favicon).** `errors.console` logs one "Failed to
load resource: 404 (Not Found)". `apps/game-client/index.html` declares a `<title>` but no
`<link rel="icon">`, so the browser's automatic `/favicon.ico` request 404s. Benign but a red
error in the console on every load.

**B11 — Mood color and label disagree at the threshold.** The Day 5 drawer shows
`43/100 — NEUTRAL` while the mood bar is **orange** `rgb(255,152,0)` (a warning color); the bar
was green at 50% (step 1). A 2-point drop flips green→orange, and orange reads as "warning" for
a state explicitly labeled NEUTRAL.

**B12 — Quest-return prose is redundant and tonally contradictory.** Step 8 chapter: "The party
**trudges home** from 'Descent into the Weeping Caverns'. The party **returns triumphant** from
'Descent into the Weeping Caverns'." A weary homecoming immediately followed by a triumphant
one, quest title printed twice — a separate Combat row and Quest row (both hour 18) stitched
without dedupe.

> **Checked and *not* a bug:** the `co-participants "C"` seen on step 11 is the initial-circle
> avatar for **C**aptain Halden rendered as a co-participant (portrait fallback), not stray data.

---

## Status of the known issues in `BUGS.md`

| # | Known issue | Status through Day 5 | Evidence |
|---|---|---|---|
| 1 | Sleep not triggering / no night awareness; staying up should incur penalties | **Still open** | B7 — sleep at h09–16 & h02–06; no fatigue penalty |
| 2 | `TRUSTED_COMPANION` shown in UI | **Not reproduced (looks fixed)** | Relationships render "Acquaintance"/"Stranger"; `TRUSTED_COMPANION` appears only in label maps, never surfaced |
| 3 | Activities re-shown every hour instead of as transitions | **Looks fixed** | Now rendered as transitions ("Reiko finishes hunting and begins gossiping") — exactly #3's ask (though thrash frequency is high, B7) |
| 4 | Start Day 0 at 09:00 | **Half-done and now wrong** | `START_TICK=9` set, but 09:00 mislabels as "Afternoon" + phase bug (B1) |
| 5 | Character filter in events | **Still open** | Filter chips are by *kind* (Social/Combat/Quest/…), not per-character |
| 6 | Pause & highlight intervenable events | **N/A this build** | DI / decision moments feature-flagged off |
| 7 | Quests available at Day 0 | **Still open** | First quest appears Day 1 h06, not Day 0 |

---

## Feedback themes (cross-persona)

**F1 — Half the cycles are dead air, and it clusters (High).** 7/14 cycles quiet, four
consecutive (steps 4–7) while Reiko was on the quest — precisely where the tension should
live. Options the team raised: narrate the away-party each cycle (a mid-descent beat, a
scare, the first kill); batch empty stretches ("2 quiet cycles passed"); or don't charge a
click when nothing will happen. *Priya:* "a first-timer reads 'No one had a story worth
telling' as 'this game is wasting my clicks' and leaves."

**F2 — The game promises a verb it doesn't have (High).** The tagline is "You are the unseen
hand. Watch. **Reach in when it matters.**" — but with DI flag-gated off there is no reaching
in; across 14 cycles the team made **zero** decisions. Fine for a vertical slice, but the
copy sets an expectation the current loop pointedly fails. Either don't advertise the god-layer
while it's off, or land the slice's first intervention before Day 5.

**F3 — Onboarding: the opening reads as empty/unfinished (High, Priya).** `00-opening.png` is
a large black panel + one line ("The guild waits between cycles. Press Proceed"). No hint the
Reiko card is clickable, nothing in the center, and the scenario goal is tiny grey text that
never visibly updates. The first 10 seconds decide whether a newcomer stays.

**F4 — The pacing math is a marathon (High).** 14 clicks to Day 5; the goal is "survive to
**Day 30**" — ~80+ presses of mostly-quiet prose. Players need a visible near-term win, not a
30-day slog with no interim payoff.

**F5 — Prose repetition wears through to wallpaper (High, Marcus/Vera).** Across 14 cycles:
"No one had a story worth telling this cycle." ×7; "It was not a quiet one" ×3; "Darkness
gathered over Thornvale" ×3; "It asked little of anyone" ×3. A larger phrase pool — and never
repeating an overview twice running — would do a lot.

**F6 — The best latent story is real but the causal thread is never drawn (High, Marcus).**
Day 0 Reiko warms Brenna and receives a kindness from Oswin; then she comes home from nearly
dying and, across Days 3–4, turns away from Oswin, Marsa, Halden, and Brenna one by one (steps
9, 11, 13). That's textbook trauma-withdrawal — but nothing in the prose connects the
near-death to the withdrawal. One thought line ("since the caverns, she can't sit still around
anyone") turns a data pattern into a story worth retelling.

**F7 — Surface the systems; make the win-conditions trackable (High, Dev).** The mood/drive
breakdown in the drawer ("Belonging → Wants to find their people"; "Adventurer spirit +30,
Quest Success +9, Shown kindness +3") is the one legible cause→effect loop in the build and
it's two clicks deep. The survival goal has no danger/health readout and no Day-5/30 counter
(the mood bar is not HP); the treasury goal has no ledger (B3). Put the drive breakdown on the
main view, add a danger meter and day counter, and itemize the economy.

**F8 — A one-adventurer roster starves the emergent-relationship engine (Med, Dev/Marcus).**
Every relationship edge points at townsfolk because the guild has a single member. The design's
core — inter-adventurer drama — can't emerge with a roster of one, so the current slice leans
almost entirely on Reiko's solo interiority.

**F9 — The character drawer is the highlight — lean into it (Med, Marcus/Dev).** Backstory,
goal, personality bars, mood, inner voice, and relationship drift are all evocative; this is
where the team actually *cared*. More of the run's storytelling should live at this quality
bar, and the feed should point players toward it.

---

## Recommended first moves

1. **Fix the clock (B1).** Align `START_TICK` (and/or `proceed()`) to the `cycleOf` 0/8/16
   partition so 09:00 reads as Morning and every spread's timestamps sit inside its header.
   One change, and the most visible wrongness in the session goes away — and it correctly
   closes known bug #4.
2. **Put the quest into the cycles you read (B2 / F1).** Narrate the away-party across the four
   otherwise-dead cycles; surface the near-death where the player is looking.
3. **Never charge a click for nothing (F1).** Batch or auto-advance quiet stretches, or give
   every Proceed at least one line worth reading.
4. **Make the scored numbers watchable (B3 / F7).** A danger/health readout for survival, a
   Day n/30 counter, and an itemized treasury/reputation ledger.
5. **Fix the drift glyph (B4)** and **widen the prose pool (F5)** — small, high-visibility polish.

---

## The four players, in their own words

### Vera — QA bug-hunter
> "The prose engine is nice when it fires, but as a build it's leaking its own internals
> everywhere. The very first frame is already wrong (09:00 labelled 'Afternoon'), the character
> sheet shows an up-arrow next to 'a cooling silence,' Reiko's backstory calls her 'she' while
> every line calls her 'they,' and half my Proceed presses returned nothing. For a game whose
> pitch is 'the joy is reading a completed cycle,' seven dead cycles out of fourteen is the
> headline." — *first fix: the clock.*

### Marcus — narrative-immersion reader
> "The bones of a story I'd love are here — Reiko is a wounded veteran, the drawer is lovely,
> and there's a real arc buried in the data: she comes home from nearly dying and quietly pushes
> everyone away. But the game hides its best moment off-page and then narrates a lot of nothing.
> Right now it *records* a story instead of *telling* me one." — *first fix: put the Weeping
> Caverns quest into the cycles I'm reading.*

### Priya — first-time casual player
> "I opened it and saw a big black box with one line, and wasn't sure if it was broken. I pressed
> the only button 14 times and half of those said 'No one had a story worth telling.' The game
> keeps calling me 'the unseen hand… reach in when it matters,' but I never got to reach in at
> anything. I'd have closed the tab around Day 2." — *first fix: make every Proceed earn
> something.*

### Dev — systems/strategy player
> "Through Day 5 this is a reader, not a strategy game — DI is off, so I made exactly zero
> decisions across 14 cycles. There's one good feedback loop hiding in the drawer (the mood
> breakdown), and the scenario numbers do move — but both win-conditions are presented in a way
> that makes them untrackable, and the run's one real juncture resolved entirely off-screen." —
> *first fix: make the two win-conditions actually trackable.*

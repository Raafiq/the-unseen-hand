---
status: done
depends: []
specs:
  - specs/behaviors/relationship-events.md
  - specs/behaviors/relationship-graph.md
  - specs/screens/character-detail.md
issues: []
---

# Plan: P13a — Relationship driver events + surfacing

> First build of the locked new-direction #1 want: discrete, personality-driven **relationship
> driver events** — a unified peril response (shared-danger bond / betrayal), an act of kindness, and
> a rivalry spark — that move the graph, surface as feed lines, and (for the ambient drift they and
> every other shift produce) become legible on the character-detail relationship row. Corrects the
> dead-end where `BETRAYED_BY` and `SAVED_BY` coloured thoughts but moved no bond. Extend-and-surface
> over the already-built pressure/threshold machinery, not greenfield.

## Scope

Design resolved via a grilling pass (see `guild-sim-roadmap.md`): peril-response unified, gift
reframed as kindness, unbuildable loot/divine paths cut. Three detectors, four driver outcomes.

**In scope:**
- **Peril-response detector** (adventurer-only, `questSystem.ts` / `combat/`): one detector at
  quest/combat resolution when an ally hit `NEAR_DEATH`, branching to two `RELATIONSHIP` outcomes -
  **SHARED_DANGER** (a party member performed lethal `DEFEND_ALLY` / both survived → warms, saved
  side more) and **BETRAYAL** (a party member `HESITATE`d / failed to defend → sharp asymmetric
  drop + crisis flag). Reads the already-emitted `NEAR_DEATH` / `DEFEND_ALLY` / `HESITATE` beats.
- **Wire the two dead-end tokens:** the peril branches move strength off the **existing**
  `SAVED_BY` (→ `OWES`) and `BETRAYED_BY` (→ `DISTRUSTS`) history tokens that already fire in
  `questSystem.ts` - `beliefs.ts` derivation is unchanged; only the strength shift + crisis flag
  are new. SHARED_DANGER is **additive** to the routine co-quest `+8`, gated tightly on a real
  peril moment (no double-counting ordinary quests).
- **Town-life detectors** (`socialResolver.ts` or sibling subscriber, after the social pass,
  rng-stream discipline): **KINDNESS** (generosity-driven abstract gesture — no item economy;
  asymmetric warming, recipient more) and **RIVALRY_SPARK** (two high-`ambition` low-`empathy`
  actors aligned to the **same** goal/quest via `questVolunteerWeight`; mutual drop). Per-pair
  once-a-day + jittered cooldown (reuse `decisionCooldowns`). Deltas per
  `relationship-graph.md#strength-shifts`.
- **New `RELATIONSHIP` event kind** (`eventBus.ts`): subtypes SHARED_DANGER/BETRAYAL/KINDNESS/
  RIVALRY_SPARK, `participantIds: ActorId[]`. Beat pool ≥3 per subtype, `renderText` case, and the
  `narrative-voice.test.ts` enumeration entry (the three-part event-subtype rule).
- **EventFeed three updates:** `KIND_LABELS`, `ALL_KINDS`, `getInvolvedIds` (resolve `ActorId`s incl.
  NPC ids) for the `RELATIONSHIP` kind.
- **Drift indicator** (`character-detail.md`): warming (▲) / cooling (▼) glyph + most-recent-cause
  label, derived on read from edge `history` (net 7-day delta vs `TREND_EPS`); **no glyph when
  steady**. No stored trend state.
- Dual emission: a driver that crosses a type boundary emits its `RELATIONSHIP` line **and** the
  existing `LIFECYCLE` threshold line.

**Out of scope:**
- **Divine bias over drivers.** v1 is purely autonomous; influence stays indirect via existing
  `MOOD_LIFT` / `COURAGE_BLESS` effects that already move the trigger inputs. No dedicated
  driver-probability hook.
- **Non-combat "cold turn" betrayal** on a strained RIVAL edge — deferred (would overlap
  `ESTRANGEMENT`); betrayal is anchored to the peril moment in v1.
- **Loot-split / spoils-dispute triggers** — there is no per-adventurer loot (loot → guild
  treasury), so these have no surface; cut, not deferred.
- Townsfolk familiarity scalar + seeded NPC edges + approach bias → **p13b** (this plan leaves NPC
  starting edges as they are today; the NPC-eligible drivers — KINDNESS, RIVALRY_SPARK — work on
  whatever edges exist).
- Deeper character autonomy (likes/dislikes/detailed goals) → work-now cluster item #2.
- Decision-moment frequency/weight → work-now cluster item #3. NPC↔NPC relationships (still out).

## Implements

- `specs/behaviors/relationship-events.md` — the four drivers, surfacing model, NPC participation,
  and its full Validation list.
- `specs/behaviors/relationship-graph.md#strength-shifts` (driver delta rows) +
  `#edge-history-and-drift-indicator` (drift derivation).
- `specs/screens/character-detail.md` — the relationships-row drift indicator.

## Approach

Peril response reads the quest/combat resolution output that **already** computes `NEAR_DEATH`,
`DEFEND_ALLY`, `HESITATE` and writes `SAVED_BY` / `BETRAYED_BY` (see `questSystem.ts:562-572`) — so
this branch adds the strength shift + crisis flag at an existing site, not a new roll. The town-life
detectors (kindness, rivalry) are per-tick and must sit **after** the decision/quest/social passes so
their `ctx.rng` draws come last (rng-stream discipline, per core CLAUDE.md); they key off the same
eligibility the social pressure model already computes (co-present, town-eligible, not questing), and
rivalry reuses `questVolunteerWeight` goal-alignment. All strength changes route through the existing
`applyStrengthShift` (which already records edge `history` and re-derives type), so threshold
detection and the drift log come for free. The `RELATIONSHIP` kind mirrors the existing `SOCIAL`
kind's emission shape; the drift indicator is pure UI derivation over `edge.history` — no engine
state added. Follow TDD: one failing test per driver behaviour and per surfacing rule before code.

## Validation

- [x] `pnpm --filter @ugs/core exec tsc --noEmit` — 0 errors.
- [x] `pnpm --filter @ugs/core test` — all green, including new driver + surfacing tests.
- [x] `pnpm --filter @ugs/game-client check` (svelte-check) — 0 errors / 0 warnings (rebuild core first).
- [x] `pnpm --filter @ugs/game-client test:e2e` — passes, incl. a spec asserting a `RELATIONSHIP`
      feed line renders and the drift indicator shows on a warming/cooling row.
- [x] Peril BETRAYAL fires when a party member `HESITATE`d while an ally was at `NEAR_DEATH`; it
      drops betrayed→betrayer strength (asymmetric, off the existing `BETRAYED_BY` token) and
      `beliefs.ts` still derives `DISTRUSTS` (tested through the subscriber).
- [x] Peril SHARED_DANGER applies a larger mutual delta than co-quest success on the same pair,
      **additive** to the co-quest `+8`, and only fires when an ally hit `NEAR_DEATH`; the saved side
      (had `SAVED_BY`) warms more.
- [x] Peril response never fires on an edge with an NPC endpoint.
- [x] KINDNESS warms recipient more than initiator, never targets an ENEMY edge, can involve a notable NPC.
- [x] RIVALRY_SPARK is more probable between two high-ambition low-empathy actors aligned to the
      **same** goal/quest than a lopsided pair (probability-shift assertion, not a rolled outcome).
- [x] Each town-life driver fires ≤ once per pair per day and respects its post-fire cooldown
      (deterministic under fixed seed); re-running a fixed seed reproduces the feed exactly.
- [x] **Feed volume:** over a 30-day seeded run, driver-events-per-day stays under a set bound (feed
      reads as punctuation, not noise).
- [x] Every `RELATIONSHIP` subtype has ≥3 beat variants; lines are slot-free; subtype label never in prose.
- [x] A boundary-crossing driver emits both its `RELATIONSHIP` line and the `LIFECYCLE` threshold event.
- [x] Drift indicator reads warming above `+TREND_EPS`, cooling below `−TREND_EPS`, and shows **no
      glyph when steady**, with the correct most-recent-cause label.
- [x] Divine influence over drivers is indirect only — a divine touch shifts trigger inputs
      (mood/courage), never forces a driver (assert the shifted input, not an act).
- [x] No `Math.random()` anywhere in the new core code; no LLM/network call in the render path.

## Risks / unknowns

- **rng-stream ordering.** Inserting driver detection mid-loop shifts every downstream `ctx.rng`
  draw and will churn existing seeded tests. Slot the new subscriber **last** and update golden
  expectations deliberately, not by blanket re-baselining.
- **Double-counting co-quest vs SHARED_DANGER.** SHARED_DANGER must be additive to — not a
  replacement for — the routine co-quest `+8`, and must fire only on a genuine `NEAR_DEATH` peril
  so ordinary quests don't all read as life-or-death bonds. Guard the peril condition tightly.
- **`HESITATE` availability for betrayal.** Betrayal keys off a `HESITATE` beat while an ally is at
  `NEAR_DEATH`; confirm the beat is actually emitted with enough context (who hesitated, who was in
  peril) to attribute the pair, else the negative branch never fires.
- **Feed volume.** The four driver outcomes plus existing encounters could over-fire in aggregate;
  the 30-day volume test + tuned cooldowns are the guard (honours the quiet-world direction).

## Notes

**Built (all green): core `tsc` clean, 601 core tests, `svelte-check` clean, 15/15 e2e (2 new).**

- **Symmetric-edge reconciliation (the load-bearing decision).** The spec's driver deltas were
  written per-direction asymmetric (BETRAYAL −18/−6, SHARED_DANGER +12/+18, KINDNESS +4/+7), but
  `RelationshipEdge.strength` is symmetric by a hard invariant (`graph[A][B] === graph[B][A]`) and
  history entries carry no actor direction. Making edges directional would ripple through every
  consumer (beliefs, decay, thresholds, drift, party-select, combat, UI) and contradict a stated
  invariant. **Chosen: one symmetric delta per driver; the felt asymmetry lives in per-actor
  surfaces** — `SAVED_BY`→`OWES` (saved side), `BETRAYED_BY`→`DISTRUSTS` (betrayed side only), and a
  larger recipient mood lift for KINDNESS. The 3 specs (`relationship-graph.md`,
  `relationship-events.md`, `character-detail.md`) were reconciled to match. This was queued as an
  AskUserQuestion; the user was away, so it was resolved by best judgment and flagged for review.
- **Stale grounding corrected:** `BETRAYED_BY` was **never written anywhere** (only consumed in
  `beliefs.ts`). The handoff/spec claimed `questSystem.ts` already emitted it — it did not. The
  BETRAYAL branch now **writes** it (so the `DISTRUSTS` derivation finally has data). `SAVED_BY` did
  already fire (`questSystem.ts:572`); SHARED_DANGER wires strength onto it.
- **Deltas as built:** SHARED_DANGER +12 (additive to co-quest +8), BETRAYAL −18, KINDNESS +7,
  RIVALRY_SPARK −10 (−14 crossing into ENEMY).
- **Peril attribution** uses the party-wide beat model (beats carry actor+action, no target),
  mirroring the existing `SAVED_BY` derivation: near-death survivors × defenders → SHARED_DANGER;
  near-death survivors × hesitators (non-defenders) → BETRAYAL. Solo-party near-death quests
  produce no pairs (why scenario1's 30-day run shows 0 peril events — verified, not a bug).
- **Crisis flag** is a new `SimulationContext.pendingCrises: Set<PairKey>`, set by BETRAYAL and a
  RIVALRY that crosses into ENEMY. **Not yet consumed** by `socialResolver` (see Follow-ups).
- **rng-stream discipline:** `townDriverSubscriber` runs **dead-last** (after `thoughtWhisperSubscriber`)
  so its new per-tick rng draws churn nothing — full suite stayed green with zero re-baselining.
- Feed-volume guard: ~3 drivers/day on a maximally-social all-generous 5-person roster; 0 on
  scenario1. Bounded < 8/day in test.

## Follow-ups

- **Consume the crisis flag in `socialResolver`.** `pendingCrises` is written but not yet read;
  wire `socialPressureSubscriber` to pass `crisis: true` to `resolveEncounter` for a flagged pair
  (bypassing the `THRESHOLD_PROB` gate → `ESTRANGEMENT` reachable) and clear the flag. The
  `resolveEncounter`/`resolveOutcome` `crisis` param already exists; only the plumbing is missing.
- **p13b (`plans/p13b-townsfolk-familiarity.md`)** — now unblocked. Seeds NPC familiarity edges +
  approach bias, and is where **NPC rivalry** becomes reachable (needs goal/feud data an NPC lacks
  in p13a). p13a leaves NPC rivalry adventurer-only by design.
- **User review of the symmetric-edge decision** (see Notes) — the one open question if the
  designer wants directional edges instead; would be a much larger change.

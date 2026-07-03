# Behavior: Relationship Events

## Rule

Relationships move for **narratable reasons**. Beyond the ambient drift already produced by
co-quests, social encounters, and separation decay (`relationship-graph.md`), a small set of
**discrete driver events** fire autonomously from character personality and world context. Three
detectors produce four feed-worthy driver outcomes:

- **Peril response** (adventurer-only) - when an ally is at death's door, one branch forges a
  **shared-danger bond** and the other is a **betrayal**.
- **Kindness** (adventurers + notable NPCs) - a deliberate generous gesture.
- **Rivalry spark** (adventurers + notable NPCs) - a competitive clash over a shared goal.

Each shifts relationship strength, may write/consume a history token, may cross a relationship
threshold, and **surfaces as a single feed line**. Ambient drift stays out of the feed but is made
legible on the character-detail relationship row. The player never triggers a driver directly;
divine influence is **indirect only** - existing effects (mood, courage) feed the trigger inputs,
but nothing biases a driver's odds directly.

## Applies To

- `packages/core/src/relationships/` - driver detection + strength application
- `packages/core/src/quests/questSystem.ts` and `packages/core/src/combat/` - the **peril-response**
  detector; hooks the already-emitted `NEAR_DEATH`, `DEFEND_ALLY`, and `HESITATE` combat beats and
  the `SAVED_BY` / `BETRAYED_BY` history tokens they write
- `packages/core/src/events/socialResolver.ts` - the **kindness** and **rivalry-spark** detectors
  (town/idle life), or a sibling driver subscriber running after the social pass
- `packages/core/src/events/eventBus.ts` - `RELATIONSHIP` event kind + beat pools
- `packages/core/src/thoughts/beliefs.ts` - `BETRAYED_BY` → `DISTRUSTS` and `SAVED_BY` → `OWES`
  already derive here; the drivers are what now also move strength off the same tokens
- `specs/behaviors/relationship-graph.md` - the canonical strength-delta table (driver rows added there)
- `specs/behaviors/npc-system.md` - Tier-A NPCs are eligible for the town-life drivers; familiarity seeds their starting edge
- `specs/behaviors/personality-system.md` - the axes that decide who initiates and what they do
- `specs/behaviors/narrative-voice.md` - grammar pools that render every driver line
- `specs/screens/character-detail.md` - the ambient-drift indicator on relationship rows

## Details

### Driver taxonomy

Three detectors, four driver outcomes. All initiation and target selection is
**personality-driven** and routed through `ctx.rng` - never `Math.random()`, never a flat schedule.
Deltas are defined canonically in `relationship-graph.md#strength-shifts`; the triggers and
surfacing are defined here. Each town-life driver fires at most once per (pair, day) and carries a
**jittered per-pair cooldown** after firing (reusing the `decisionCooldowns` mechanism, per the core
CLAUDE.md per-tick-detector rule); peril responses are gated by the combat moment itself.

#### Peril response — SHARED_DANGER and BETRAYAL (adventurer-only)

Betrayal and shared-danger are **two branches of one event**: an ally at death's door. The combat
machinery already emits the beats and history tokens; the peril-response detector reads them at
quest/combat resolution and **wires the two previously dead-end tokens to actually move the bond**
(today `SAVED_BY` → `OWES` and `BETRAYED_BY` → `DISTRUSTS` colour thought/belief but shift no
strength).

- **Trigger:** a quest/combat resolution in which an ally hit `NEAR_DEATH`. For each other party
  member present at that moment:
  - **SHARED_DANGER (positive branch):** they performed a `DEFEND_ALLY` under lethal threat, or both
    came through the `NEAR_DEATH` alive together. The saved actor already has a `SAVED_BY`
    `HistoryEvent` written (`saverIds`); this is where it also warms the edge - by a single symmetric
    `+12`, larger than and **additive to** the routine co-quest `+8` (that still applies separately
    for the quest itself). The saved side simply *feels* it more: its `SAVED_BY` token derives an
    `OWES` belief the defender does not carry (edges are symmetric, so the asymmetry is
    belief-mediated, not a directional strength). May cross `FRIENDSHIP_FORMED` /
    `TRUSTED_COMPANION_BOND_FORMED`.
  - **BETRAYAL (negative branch):** they `HESITATE`d or failed to defend while the ally was at
    `NEAR_DEATH`. This is where the peril-response **writes the `BETRAYED_BY` `HistoryEvent`** on the
    abandoned ally (naming the betrayer) - the token that was previously never emitted anywhere, so
    `beliefs.ts`'s `DISTRUSTS` derivation finally has data - and drops the bond by a single symmetric
    `−18`. The felt asymmetry is the token: the betrayed carries `BETRAYED_BY` → `DISTRUSTS`, the
    betrayer carries none. Carries a **crisis flag** into the social system (`social-system.md` §5),
    making a follow-up `ESTRANGEMENT` reachable, and emits a `BOND_BROKEN` / `RIVALRY_DEEPENED`
    `LIFECYCLE` event when the drop crosses a downward type boundary.
- **Personality:** who defends vs hesitates is already decided by the combat action model
  (`combat/` uses `loyalty`/`empathy`/`courage`); the driver reads the outcome, it does not
  re-roll it.
- **Adventurer-only.** Notable NPCs are not in combat and do not quest, so peril response never has
  an NPC endpoint (consistent with the co-quest exclusion, `relationship-graph.md`). A non-combat
  "cold turn" betrayal on a strained RIVAL edge is **deferred** - v1 anchors betrayal to peril to
  avoid overlapping `ESTRANGEMENT`.

#### KINDNESS (adventurers + notable NPCs)

A deliberate one-sided generous gesture that warms a bond - covering a shift, vouching for someone,
tending an injury, sharing a meal unprompted. There is **no item/coin economy**: kindness is an
abstract act, distinct from an ambient `SOLIDARITY`/`BREAKTHROUGH` chat precisely because it is a
one-directional gesture the initiator chooses to extend.

- **Initiator:** an actor with `empathy ≥ 55` **or** `loyalty ≥ 60`, biased further by low greed
  (`generosity = (empathy·0.5 + loyalty·0.3 + (100 − greed)·0.2) / 100`). Higher `generosity` → more
  readily gives.
- **Target:** drawn from the initiator's `ACQUAINTANCE`-or-higher edges, weighted toward edges the
  initiator is warming to (positive recent drift) - a friendly character actively deepens the bonds
  they value. Enemies (`strength ≤ −51`) are never targets.
- **Effect:** a single symmetric `+7` warm on the edge, plus an **asymmetric mood lift** - the
  **recipient** gets the larger boost (receiving reads as being valued; giving is quieter). Because
  edges are symmetric, "recipient warms more" lives in the mood factor, not a directional strength.
  May cross a threshold.
- **NPC-eligible:** a warm service NPC (seeded high familiarity, `npc-system.md`) can both extend and
  receive kindness.

#### RIVALRY_SPARK (adventurers + notable NPCs)

A competitive clash ignites or deepens a rivalry - **goal competition**, not mood-discharge (distinct
from a `social-system.md` `ARGUMENT`).

- **Trigger:** two co-present actors both strongly aligned to the **same quest or personal goal**
  (goal alignment is already computed by `questVolunteerWeight`, `personality-system.md`), with
  **clashing ambition** (`ambition ≥ 60` on both, or a large opposing-axis gap) and low mutual
  empathy, sharpened by mood strain. A lopsided contest (one ambitious, one indifferent) rarely
  sparks. (No "credit/spoils dispute" trigger - there is no loot split to contest.)
- **Effect:** a mutual `−` that can push `STRANGER`/`ACQUAINTANCE` toward `RIVAL`, or `RIVAL` toward
  `ENEMY` (`RIVALRY_DEEPENED`). Carries a crisis flag when it crosses into `ENEMY`.
- **NPC-eligible:** a rival-seeded NPC (low familiarity, or a scenario-flagged feud) can spark with
  an adventurer over a contested goal.

### Divine influence — indirect only

The player cannot fire any driver. There is **no dedicated driver-probability hook**, and v1 does
not add one. Influence is **indirect**: existing divine effects already move the inputs the triggers
read - `MOOD_LIFT` and `COURAGE_BLESS` shift the mood/axes that feed `generosity`, the combat action
model, and mood-strain terms - so a nudge can make a kindness likelier or a hesitation less likely
without ever selecting the act. This satisfies "nudge, never trigger" with no new mechanism. A
dedicated per-driver bias is out of scope (revisit only if playtest wants it).

### Surfacing

Two channels, matching the locked "quiet world" direction (`decision-moments.md` G-answer):
**meaningful moments are loud, ambient drift is quiet.**

#### Discrete drivers → feed line (loud)

Each driver outcome fires exactly one feed event of a new `RELATIONSHIP` kind:

```typescript
// Named RelationshipDriverEvent in code to avoid clashing with the existing edge-history
// `RelationshipEvent` (`{tick, kind, delta}`) in world/types.ts.
type RelationshipDriverEvent = EventBase & {
  kind: 'RELATIONSHIP';
  subtype: 'SHARED_DANGER' | 'BETRAYAL' | 'KINDNESS' | 'RIVALRY_SPARK';
  participantIds: ActorId[];   // both actors; ActorId so Tier-A NPCs participate (KINDNESS / RIVALRY_SPARK)
};
```

- `renderedText` is composed by the deterministic template grammar (`narrative-voice.md`): each
  subtype has a **beat pool of ≥ 3 variants** keyed `RELATIONSHIP:<subtype>`, selected via
  `ctx.rng`. The subtype label is **never** shown in prose - only the rendered line.
- The new kind requires the three EventFeed updates (per core CLAUDE.md + `event-bus.md`):
  `KIND_LABELS`, `ALL_KINDS`, and `getInvolvedIds` (resolving `ActorId`s including NPC ids), and
  the three eventBus updates (beat pool, `renderText` case, `narrative-voice.test.ts` enumeration).
- Threshold crossings still fire their own `LIFECYCLE` events as today - a driver that crosses a
  boundary produces **both** its `RELATIONSHIP` line and the `LIFECYCLE` threshold line (drivers are
  causes; thresholds are milestones).

#### Ambient drift → detail-row indicator (quiet)

Sub-threshold shifts (co-quest `+8`, banter `+3`, separation `−1`, and the driver deltas
themselves) are **not** individually surfaced in the feed. Instead the character-detail relationship
row (`character-detail.md`) shows a **drift indicator** derived from the edge's own `history`
(`{tick, kind, delta}`, already recorded by `applyStrengthShift`):

- **Trend:** net sum of `delta` over a recent window (last 7 in-game days = 168 ticks).
  `> +TREND_EPS` → **warming** (▲); `< −TREND_EPS` → **cooling** (▼). A **steady** edge shows **no
  glyph at all** - the indicator is signal, not decoration, so a settled bond stays visually quiet.
- **Most-recent cause:** the `kind` of the latest history entry, mapped to a short human label
  ("shared a quest", "an act of kindness", "drifted apart", "a betrayal"). No debug tokens.
- `TREND_EPS` and the window length are tunable constants.

This makes a warming or cooling bond legible **before** it flips a type, without a feed line per `+3`.

### NPC participation

Only the **town-life** drivers are NPC-eligible: **KINDNESS** and **RIVALRY_SPARK**. Peril response
is adventurer-only (NPCs are not in combat and do not quest). NPC starting edges are seeded from the
familiarity scalar (`npc-system.md`), so a warm service NPC is already an `ACQUAINTANCE` a kindness
can build on, and a rival-seeded NPC is primed to spark.

**Implementation status (p13a → p13b):** KINDNESS is NPC-eligible now — a notable NPC can extend or
receive it on any `ACQUAINTANCE`-or-higher edge. RIVALRY_SPARK keys off shared-goal alignment
(`questVolunteerWeight` / a matching personal goal), which an NPC does not carry until the
familiarity scalar and any scenario feud seed it (`p13b`); so in p13a a rivalry sparks between
**adventurers** only, and NPC rivalry lands with p13b's NPC edge/feud seeding.

## Validation

- A SHARED_DANGER bond applies a **larger** symmetric delta than an ordinary co-quest success on the
  same pair, **additive** to the co-quest `+8`, and only fires when an ally hit `NEAR_DEATH`; the
  **saved** side (that had `SAVED_BY` written) feels it more via an `OWES` belief the defender does
  not carry (the edge strength itself is symmetric).
- A BETRAYAL fires when a party member `HESITATE`d while an ally was at `NEAR_DEATH`; it **writes**
  the `BETRAYED_BY` token on the betrayed (previously never emitted), drops the symmetric bond
  strength, and `beliefs.ts` derives `DISTRUSTS` from that token on the betrayed side only.
- A boundary-crossing driver fires **both** its `RELATIONSHIP` line and the matching `LIFECYCLE`
  threshold event (e.g. SHARED_DANGER `ACQUAINTANCE`→`FRIEND` → `FRIENDSHIP_FORMED`; a BETRAYAL
  `RIVAL`→`ENEMY` → `RIVALRY_DEEPENED`).
- A BETRAYAL sets a crisis flag consumable by the social system.
- Peril response **never** fires on an edge whose endpoint is an NPC id.
- A KINDNESS from a high-`empathy` low-`greed` actor warms the symmetric edge and gives the
  **recipient** a larger mood lift than the giver, and never targets an `ENEMY` edge; it can involve
  a notable NPC.
- A RIVALRY_SPARK fires more often between two high-`ambition` low-`empathy` actors aligned to the
  **same** goal/quest than between an ambitious actor and an indifferent one (assert the probability
  shift, not a single rolled outcome); it can involve a rival-seeded NPC.
- Each town-life driver fires at most once per pair per day and respects its post-fire cooldown
  (deterministic under a fixed seed).
- Every `RELATIONSHIP` subtype has a beat pool of ≥ 3 variants; every driver line is non-empty and
  slot-free; the subtype label never appears in prose.
- `getInvolvedIds` resolves a `RELATIONSHIP` event's participants (including an NPC id) so it appears
  in each participant's character filter.
- **Feed volume:** over a 30-day (720-tick) seeded run, driver events plus existing social
  encounters read as punctuation, not noise - assert an upper bound on driver-events-per-day so the
  feed is not flooded (tune cooldowns to hold it).
- Re-running a fixed seed reproduces the driver events and their feed lines exactly (no
  `Math.random()`, no network/LLM call in the render path).
- The character-detail drift indicator reads **warming** for an edge whose last-7-day net delta
  exceeds `+TREND_EPS`, **cooling** below `−TREND_EPS`, and shows **no glyph** for a steady edge, plus
  the most-recent-cause label from the edge history.
- The player has no control that directly fires a driver; a divine touch changes only the trigger
  inputs (mood/courage) - assert the shifted input probability, not a forced act.

## Principles

**Inherited:**
- [Autonomy is the default; intervention is the exception](../principles.md#autonomy-is-the-default-intervention-is-the-exception) -
  every driver emerges from character personality and world context. The player witnesses bonds,
  betrayals, kindnesses, and rivalries; they cannot script them. Divine influence bends the trigger
  inputs, never the act.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) -
  each discrete driver renders a grammar sentence in the feed; the ambient drift it also produces is
  attributable on the detail row via the most-recent-cause label. No strength moves without a legible reason.
- [Emergence over control](../principles.md#emergence-over-control) - personality and context decide
  who defends, who hesitates, who gives, who clashes; `ctx.rng` picks the moment. The player cannot
  set strength directly.
- [Seeded determinism](../principles.md#seeded-determinism) - all driver detection, target
  selection, and firing flow through `ctx.rng`. `Math.random()` is forbidden in `packages/core/`.

**Local:**
- **Loud moments, quiet drift.** The drivers are the relationship beats worth a feed line; the
  steady accumulation of `+3`s and `−1`s is not. Surfacing every micro-shift would drown the feed
  and fight the quiet-world direction. The detail-row indicator is where drift becomes legible - on
  demand, and only when a bond is actually moving (no glyph on a settled edge).
- **A belief that changes no relationship is a bug, not flavour.** The old `BETRAYED_BY` and
  `SAVED_BY` tokens coloured thoughts (`DISTRUSTS`, `OWES`) while leaving the bond untouched - an
  emotion with no consequence. The peril-response driver exists to close that gap: the same moment
  that writes the memory now moves the graph.
- **One moment, two branches.** Betrayal and shared-danger are not independent systems - they are the
  positive and negative reading of a single event (an ally at death's door). Implementations must
  detect the peril moment once and branch, not build two unrelated detectors.
- **Drivers are causes; thresholds are milestones.** The `RELATIONSHIP` kind carries the *act*; the
  `LIFECYCLE` kind carries the *crossing* it may cause. Both fire when a driver crosses a boundary -
  do not collapse one into the other.

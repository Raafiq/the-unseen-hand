# Behavior: Social System

> **Supersedes** `behaviors/social-events.md` (old flat-outcome social event engine), which is
> now historical reference only.
>
> **Does NOT supersede `behaviors/llm-narrator.md`.** An earlier draft replaced the day-summary
> narrator with per-character card persistence; that direction was rejected in the events
> redesign. The day summary is retained as an LLM set-piece (see `behaviors/narrative-voice.md`
> and `behaviors/llm-narrator.md`). Social-encounter text is rendered by the deterministic
> template grammar (`behaviors/narrative-voice.md`), **not** by a per-scene LLM call.

## Rule

Adventurers living inside the guild lead autonomous daily lives. Each adventurer draws activities from a personality-weighted pool, sustains them for hours, and fires moment-to-moment micro-events within them. When two or more adventurers are in proximity, a social escalation check may fire — the approaching character's personality decides whether to join or interrupt. The encounter resolves to one of six outcomes on a valence × intensity grid. The deterministic template grammar (`behaviors/narrative-voice.md`) renders each encounter into feed prose at emission time. Significant social events surface in the character detail panel's history and the end-of-day summary. The player observes all of this without intervening.

## Applies To

- `packages/core/src/events/socialResolver.ts` — activity selection, escalation, outcome resolution
- `packages/core/src/events/eventBus.ts` — social-encounter line composition via the template grammar
- `packages/core/src/world/types.ts` — `SocialActivity`, `ActivityCluster`, `SocialOutcome`, extended `MoodFactor`
- `specs/behaviors/narrative-voice.md` — template grammar that renders encounter text
- `specs/behaviors/relationship-graph.md` — social outcome strength deltas (see cross-references below)

## Details

---

### 1. Activity system

#### Activity vocabulary

Thirteen named activities in three clusters:

| Cluster | Activities |
|---|---|
| **Physical** | `TRAINING`, `SPARRING`, `PATROL`, `HUNTING` |
| **Social** | `DRINKING`, `GAMBLING`, `COOKING`, `EATING`, `GOSSIPING` |
| **Private** | `READING`, `BROODING`, `RESTING`, `PRAYING`, `CRAFTING` |

An adventurer is always in exactly one activity. On completing or exiting an activity, they draw the next from the weighted pool.

#### Activity weight calculation

For each candidate activity, the effective weight is:

```
effectiveWeight = baseAffinity[personality][activity]
                × moodMultiplier(currentMood)
                × historyModifier(recentHistory)
                × sum(activeMoodFactors.activityWeights[activity] ?? 1.0)
```

**`baseAffinity` table** — personality axes (0–100) map to activity clusters:

| Personality high | Cluster favoured |
|---|---|
| `courage ≥ 60` | Physical (+1.5×) |
| `empathy ≥ 60` | Social (+1.5×) |
| `ambition ≥ 60` | Private: READING, CRAFTING, PRAYING (+1.4×) |
| `loyalty ≥ 70` | Physical: PATROL (+1.3×); Social: GOSSIPING (+1.2×) |
| all moderate | Weights roughly equal |

Individual activity affinities within a cluster are equal unless a personality trait overrides them. Full affinity table is defined in `socialResolver.ts` as a `Record<ActivityId, (p: Personality) => number>`.

**`moodMultiplier`** — applied per cluster:
- CONTENT (50–100): Physical ×1.2, Social ×1.2, Private ×0.9
- UNSATISFIED (10–24): Private ×1.4, BROODING ×2.0, Social ×0.8
- DESPAIRING (0–9): BROODING ×3.0, RESTING ×2.0, all others ×0.4

**`historyModifier`** — checks recent `HistoryEvent` entries (last 3 days):
- Completed DRINKING yesterday → `HANGOVER` MoodFactor active → `DRINKING` weight ×0.15 for today
- Quest injury recorded → `QUEST_INJURY` MoodFactor active → TRAINING/SPARRING/PATROL weight ×0.3 (except: if `stubborn ≥ 70`, `stubbornOverride: true` on the factor → weights are NOT reduced; injury worsening is possible)

#### MoodFactor extensions (Q5)

The `MoodFactor` type gains two optional fields:

```typescript
interface MoodFactor {
  id: string
  label: string
  value: number
  decayRate: number
  expiresAt?: number
  // New fields:
  activityWeights?: Partial<Record<ActivityId, number>>  // multipliers per activity
  stubbornOverride?: boolean  // if true, activityWeights are ignored when personality.stubborn ≥ 70
}
```

Existing MoodFactor behaviour is unchanged when these fields are absent.

New transient factors that carry activity weights:

| Factor id | Trigger | Mood value | Activity weights | Decay |
|---|---|---|---|---|
| `HANGOVER` | DRINKING activity completed | −8 | DRINKING ×0.15, TRAINING ×0.5 | 0.0 (expires next day) |
| `QUEST_INJURY` | Quest resolution with injury flag | −12 | TRAINING ×0.3, SPARRING ×0.3, PATROL ×0.5 | 0.05 |
| `WELL_RESTED` | RESTING activity completed with CONTENT mood | +10 | TRAINING ×1.4, SPARRING ×1.4 | 0.0 (expires next day) |

---

### 2. Activity duration

Each activity has a **base duration range** in simulated hours:

| Cluster | Base range |
|---|---|
| Physical | 1–3 hrs |
| Social | 1–4 hrs |
| Private | 2–6 hrs |

**Scaling factors:**
- `stubborn ≥ 70`: multiply upper bound ×1.5 (difficult to break off)
- `empathy ≥ 70`: Social activities extend by up to +1 hr when another character joins (see §3 JOIN outcome)
- CONTENT mood: physical activities extend by +1 hr (energy surplus)

**Exit triggers (either fires the exit):**
1. Simulated clock reaches the drawn duration endpoint.
2. Mood crosses a threshold during the activity (e.g. mood falls below 25 mid-TRAINING → exits; mood rises above 60 mid-BROODING → exits).

When a social encounter fires the JOIN result (§3), the target's current activity duration is extended by `rng.next() * 2 + 0.5` hours (0.5–2.5 hrs). The joining character inherits the remaining duration of the extended window.

---

### 3. Micro-events

Within each activity, micro-event lines fire at intervals of 1–2 simulated hours (drawn per tick via `rng`). Each micro-event is a single sentence in the event feed capturing an in-the-moment beat:

> "Bran drills the same sword form until his arm shakes." (TRAINING micro-event)
> "Kira loses two hands in a row and refills her drink." (GAMBLING micro-event)

Micro-events are rendered by the deterministic template grammar (`behaviors/narrative-voice.md`): each activity type has a beat pool of ≥ 3 variants (the existing `MICRO_TEMPLATES` in `activitySystem.ts` is the reference shape), selected via `ctx.rng`. Micro-events do not affect mood or relationships — they are flavour only.

---

### 4. Social escalation trigger

Social encounters do **not** fire on a fixed daily hour, and they are **not** a memoryless
per-tick coin-flip. Tension between two adventurers *builds* — from being near each other, from
mood strain, from relationship friction — and discharges at an organic, jittered moment once it
is high enough. After it discharges, the pair has a cooling-off period before tension can build
again. This is the same accumulate-then-cooldown shape used by decision moments
(`behaviors/decision-moments.md`); social encounters reuse that pattern rather than the old
`pairHour` daily gate or a flat per-tick probability.

#### Pressure accumulation

The context carries `socialPressure: Map<PairKey, number>` (keyed by sorted pair id `"A-B"`,
parallel to `lastSharedActivity`). Each tick, for each eligible pair:

1. **Relationship gate** — enemies (`strength ≤ −51`) never accumulate pressure voluntarily.
   Forced proximity (crisis event, shared mandatory activity) can override the enemy gate; no
   other condition can. A pair on an ESTRANGEMENT cooldown (§5) or a post-fire cooldown (below)
   accumulates no pressure.

2. **Eligibility** — both adventurers are in IDLE or a non-Private activity (a Private activity
   — READING, BROODING, PRAYING, etc. — contributes little or no proximity pressure; see the
   compatibility table). If not eligible, the pair's pressure **decays** by `DECAY` (a small
   bleed, e.g. −0.05/tick) toward 0 so stale tension does not persist forever.

3. **Pressure gain** — if eligible, add to the pair's pressure:
   ```
   gain = (proximity + moodStrain + relationshipTension) × compatibilityMult × empathyMult
   ```
   - `proximity`: a small base accrual for being co-present and eligible (e.g. 0.04/tick).
   - `moodStrain`: rises as either adventurer's mood is low or the mood gap is wide
     (`|moodA − moodB| / 100`, plus a term for low absolute mood) — strained people are more
     likely to have a scene.
   - `relationshipTension`: rises near a relationship inflection — RIVALs and near-threshold
     edges (about to break or about to bond) accrue faster than settled ACQUAINTANCEs.
   - `empathyMult`: `0.5 + (max(empathyA, empathyB) / 100)` → 0.5–1.5; a warm pair closes
     distance faster.
   - `compatibilityMult`: see table below — what they're each doing gates how readily proximity
     turns into a scene.

#### Discharge (jittered firing)

When a pair's pressure crosses `THRESHOLD` (a normalised constant, e.g. `1.0`), the encounter
becomes *due* but does not fire deterministically on that tick. Each subsequent tick it rolls:

```
fireProb = FIRE_BASE × min(2, pressure / THRESHOLD)   // overshoot makes it likelier, capped
rng.next() < fireProb → the encounter fires this tick
```

`FIRE_BASE` is low (e.g. 0.2), so the *moment* of discharge is spread organically across the
ticks after the threshold is reached rather than snapping the instant it is crossed. The more
overdue the pair, the likelier each tick — tension that has been building "wants" to release.

#### Post-fire cooldown

When an encounter fires, reset the pair's pressure to 0 and set a **jittered cooldown**:
`socialCooldowns.set(pairKey, tick + COOLDOWN_BASE + floor(rng.next() × COOLDOWN_JITTER))`
(e.g. base 8 ticks + 0–16 jitter). While `tick < cooldown`, the pair accumulates no pressure
and cannot fire. ESTRANGEMENT additionally imposes its own 5-day cooldown (§5), which is the
maximum of the two. This reuses the `decisionCooldowns` mechanism (see CLAUDE.md's per-tick
detector cooldown rule) so a discharged pair cannot immediately re-fire.

#### Compatibility table

The compatibility multiplier scales **pressure gain** (how fast proximity becomes a scene), not
a probability. The approacher is whichever of the pair is IDLE/between activities when discharge
fires; if both are mid-activity, the lower-mood one is treated as the approacher.

| Solo activity | Approacher state | Compatibility mult |
|---|---|---|
| DRINKING | DRINKING or between activities | 2.5 |
| COOKING | Between activities | 2.0 |
| TRAINING | Between activities | 1.0 |
| EATING | Any | 1.5 |
| GOSSIPING | Any | 1.8 |
| BROODING | Between activities | 1.2 |
| SPARRING | Between activities | 1.0 |
| READING | Any | 0.3 |
| PRAYING | Any | 0.2 |
| CRAFTING | Between activities | 0.6 |
| RESTING | Any | 0.15 |

"Between activities" means the approacher has just exited an activity and not yet drawn a new one.

#### Join vs interrupt decision

Once the approach fires, the **approaching character's personality** (not the activity pairing) determines the result:

| Approacher trait | Result |
|---|---|
| `empathy ≥ 55` | **JOIN** — attempts to integrate without disrupting |
| `empathy < 40 AND courage ≥ 60` | **INTERRUPT** — direct, unannounced |
| All other cases | **JOIN** if compatibility ≥ 1.5, else **INTERRUPT** |

**JOIN outcome** — the approaching character starts the same activity alongside the target. Target's duration extended (§2). Both are now in a shared activity window. Social event fires within that window.

**INTERRUPT outcome** — the target's current activity ends immediately. A social scene opens between them. Both return to the activity pool after the scene resolves.

#### Group scenes

When ≥ 2 approach checks fire against the same target within the same tick, all are processed as a single group scene (max 4 participants). Group scene prompts include all N character context cards. Relationship and mood effects apply between all pairs in the group.

---

### 5. Social outcome resolution

#### Valence and intensity

Every social encounter (post-approach) resolves to a **valence** and an **intensity**:

**Valence** (driven by mood and relationship):
```
moodAvg = (moodA + moodB) / 2   // or avg across group
valence = moodAvg > 55 AND relationshipStrength > 10  → POSITIVE
        = moodAvg < 25 OR relationshipStrength < −10  → NEGATIVE
        = otherwise                                    → NEUTRAL
```

**Intensity** (driven by gap and personality):
```
moodGap = |moodA − moodB|   // or max pairwise gap in group
clashScore = |personalityAxisDiff|.max   // largest axis difference
intensity = moodGap > 35 OR clashScore > 50  → STRONG
          = otherwise                          → MILD
```

#### Outcome grid

| | Mild | Strong |
|---|---|---|
| **Positive** | `BANTER` | `SOLIDARITY` |
| **Positive** (very high gap + positive) | — | `BREAKTHROUGH` |
| **Neutral** | `SILENT_DISTANCE` | `SILENT_DISTANCE` |
| **Negative** | `ARGUMENT` | `ARGUMENT` |
| **Negative** (very high gap + negative) | — | `ESTRANGEMENT` |

`BREAKTHROUGH` and `ESTRANGEMENT` additionally require:
- A **threshold modifier** that makes them harder to reach by default: an additional `rng.next() < thresholdProb` check fires. Default `thresholdProb: 0.4` (so only 40% of otherwise-qualifying encounters escalate to the rare outcome, the remainder falling back to SOLIDARITY or ARGUMENT respectively).
- The threshold is bypassed when a **crisis event flag** is present on the encounter (e.g. one character has insulted the other's deceased companion, a quest failure just resolved, a BOND_BROKEN event just fired). Crisis bypass makes BREAKTHROUGH and ESTRANGEMENT reachable at any relationship level.

#### Outcome effects

| Outcome | Relationship Δ | Mood factor | Mood value | Mood decay |
|---|---|---|---|---|
| `BANTER` | +3 | `SOCIAL_BANTER` | +5 | 0.20 |
| `SOLIDARITY` | +10 | `SOCIAL_SOLIDARITY` | +12 | 0.15 |
| `BREAKTHROUGH` | +18 | `SOCIAL_BREAKTHROUGH` | +22 | 0.08 |
| `SILENT_DISTANCE` | −1 | — | — | — |
| `ARGUMENT` | −10 | `SOCIAL_ARGUMENT` | −12 | 0.25 |
| `ESTRANGEMENT` | −22 | `SOCIAL_ESTRANGEMENT` | −25 | 0.07 |

**ESTRANGEMENT** additionally sets an approach cooldown on both participants: neither will pass the approach gate for the other for 5 simulated days, regardless of relationship score.

Relationship deltas apply to all pairs in a group scene.

---

### 6. Encounter text generation

Social-encounter and micro-event text is rendered by the **deterministic template grammar**
defined in `behaviors/narrative-voice.md`. There is no per-scene LLM call.

- Each of the six social outcomes has a **beat pool of ≥ 3 variants** keyed by
  `(kind: 'SOCIAL', subtype: outcome)`. The encounter's `renderedText` is composed as
  `subject ({A}/{B} or the group) + beat (outcome) + optional colour`, with every fragment
  selected via `ctx.rng`.
- **Colour** may be tinted by the participants' mood band and by any active world-event span
  (e.g. festival or storm colour; see `behaviors/world-expansion.md`), so encounters read
  differently under different conditions without any LLM involvement.
- Group scenes (2–4 participants) compose a subject naming the group; the same beat pools apply.
- The outcome label (`SOLIDARITY`, `ESTRANGEMENT`, …) is **never** shown in the prose — only
  the rendered line.

Because rendering is pure over `(event, ctx.rng)`, the social feed is fully replayable. The
LLM is involved only when an encounter is dramatic enough to be folded into a **set-piece**
(the end-of-day summary, or — if the encounter precipitates a decision moment — that card's
situation text). See `behaviors/narrative-voice.md` for the set-piece boundary.

---

### 7. Day-level continuity (no per-character card)

There is **no `CharacterContextCard`** and no per-character LLM memory layer — that mechanism
was rejected in the events redesign. Continuity is carried by structures the simulation already
maintains:

- The **history layer** (`behaviors/history-layer.md`) records each adventurer's significant
  events; the character detail panel's history and "recent" displays read from it (see
  `screens/character-detail.md`).
- The **end-of-day summary** (`behaviors/llm-narrator.md`) is the day's editorial set-piece; it
  reads the prior day's events and roster snapshot at generation time. It is retained, not
  replaced.

What counts as a **significant** social event (for history emphasis and the day summary's
input) is: BREAKTHROUGH, ESTRANGEMENT, any outcome that crosses a relationship type boundary,
and any outcome carrying a crisis flag. These are the social events worth remembering; ordinary
BANTER and SILENT_DISTANCE are feed flavour only.

---

### 8. Relationship to the LLM narrator

The end-of-day narrator (`behaviors/llm-narrator.md`) is **retained** as the day-summary
set-piece. The earlier plan to delete it in favour of inline generation + card persistence is
withdrawn. `getDayEvents` / `buildNarratorPrompt` and the `DaySummaryBlock` feed component
remain in service. The high-frequency social feed is rendered by the template grammar (§6); the
narrator sits above it as one of the three LLM set-pieces (`behaviors/narrative-voice.md`).

---

## Validation

- An adventurer's current activity changes no more frequently than its minimum duration allows.
- HANGOVER MoodFactor suppresses DRINKING weight to ≤ 15% of its baseline for the following day.
- An adventurer with `stubborn ≥ 70` and a QUEST_INJURY MoodFactor has `stubbornOverride: true` on the factor and does NOT have suppressed TRAINING/SPARRING weights.
- Enemy pairs (`strength ≤ −51`) accumulate zero pressure and never fire in a 24-tick run (absent crisis flag).
- A pair kept apart (one always in a Private activity) has its pressure decay toward 0 and never crosses THRESHOLD.
- A pair under sustained proximity + mood-strain accumulates pressure monotonically until it crosses THRESHOLD (measured on the accumulator, not on a rolled outcome).
- After an encounter fires, the pair's pressure is reset to 0 and a post-fire cooldown is set; the pair cannot fire again until `tick ≥ cooldown` (deterministic under fixed seed).
- An empathic approacher (`empathy ≥ 55`) always produces JOIN, never INTERRUPT (all else equal).
- BREAKTHROUGH fires on ≤ 40% of encounters that would otherwise qualify by valence/intensity alone (threshold gate), and fires on 100% when a crisis flag is present.
- ESTRANGEMENT sets a 5-day approach cooldown on both participants.
- Every social outcome has a beat pool of ≥ 3 variants; encounter `renderedText` is non-empty and slot-free (see `behaviors/narrative-voice.md`).
- No subscriber in `packages/core` issues an LLM/network call to render encounter text; re-running a fixed seed reproduces the social feed exactly.
- Significant social events (BREAKTHROUGH, ESTRANGEMENT, type-boundary crossings, crisis-flagged) appear in the adventurer's history layer for the day.
- Group scene with 3 participants produces 3 relationship pair updates (A↔B, A↔C, B↔C).

## Principles

**Inherited:**
- [Autonomy is the default; intervention is the exception](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — social encounters emerge from the simulation without any player trigger or input. The player is a witness, not a director.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — every encounter produces grammar-rendered text (`behaviors/narrative-voice.md`). No social event fires without a rendered sentence in the event feed. The outcome type (BANTER, ESTRANGEMENT, etc.) is never exposed as a label — only the rendered prose.
- [Emergence over control](../principles.md#emergence-over-control) — the player cannot trigger, block, or redirect social encounters. Character personality and relationships shape how fast pressure accumulates; the RNG still picks the moment of discharge.
- [Seeded determinism](../principles.md#seeded-determinism) — all randomness in activity selection, pressure discharge, join/interrupt, and outcome resolution flows through `ctx.rng`. `Math.random()` is forbidden in `packages/core/`.

**Local:**
- **The mechanics resolve before — and independently of — the prose.** Valence, intensity,
  outcome, relationship deltas, and mood factors are computed by the simulation. The template
  grammar then renders the line. The two never depend on each other: the outcome is identical
  whether or not the day-summary LLM ever runs. (See `behaviors/narrative-voice.md`: templates
  are load-bearing; the LLM is a set-piece spotlight.)
- **Memory lives in structures the sim already keeps, not a bespoke card.** There is no
  per-character LLM card. Continuity is the history layer plus the day summary. If nothing
  significant happened to a character, nothing is emphasised — the absence is correct.
- **Group scenes, not just pairs.** The system supports up to 4-character social scenes. Pair-only assumptions in the old system are explicitly wrong in this one — implementations must not hardcode pair logic.

# Behavior: Quest System

## Rule

Quests are the primary activity of adventurers. The quest board is autonomously seeded and adventurers autonomously volunteer for quests without player input. The player may influence party selection and outcomes via Divine Influence, but the system runs without them.

## Applies To

- `packages/core/src/quests/`

## Details

### Quest board seeding

- Each in-game **week** (every 168 ticks): seed `N` new quests onto the board.
- `N` is derived from: `baseRate(regionCount) + scenario.questPressure - currentBoardSize`.
- Quests have an `expiresAt` tick: base 7 days (168 ticks), adjusted by quest type and scenario context.
- If the board has had 0 available quests for 3 consecutive days, a `QUEST_DROUGHT` world event fires.

**Quest difficulty distribution per week:**
- 50% difficulty 1–4 (accessible)
- 35% difficulty 5–7 (challenging)
- 15% difficulty 8–10 (extreme)

This distribution shifts during `MONSTER_SURGE` world events (harder) and `WINDFALL` events (easier).

### Autonomous party selection

Runs each **day tick** (hour === 0) if:
- At least one quest on the board has `status: AVAILABLE` and no assigned party.
- At least `quest.requiredPartySize` adventurers are in `IDLE` state.

Algorithm:
1. For each available quest, compute `questVolunteerWeight(adventurer, quest)` for each idle adventurer.
2. Select the top `requiredPartySize` adventurers by weight (random tiebreak using seeded RNG).
3. Validate relationship compatibility: if the selected party contains an `ENEMY` pair, drop the lower-weighted adventurer and replace with the next candidate.
4. Assign party; transition adventurers to `ON_QUEST`.
5. Fire `QuestStarted` event with adventurer ids and quest details.

If no valid party can be formed for any available quest, no assignment is made that day.

### Decision moment surfacing for party selection

Before finalizing an autonomous party assignment, the `DecisionMomentDetector` may surface a `PARTY_SELECTION` decision moment if:
- The quest is difficulty ≥ 7, OR
- The selected party includes an `ENEMY` pair that could not be resolved, OR
- A `TRUSTED_COMPANION` pair was split across two different quests this tick.

The player may use `CHOOSE_OPTION` to override the assignment. If the decision expires, the autonomous assignment proceeds.

### Quest outcome resolver

`resolveQuest(quest, party, rng, diModifier): QuestOutcome`

1. **Base probability:** `1 - (quest.difficulty / 10)`, floored at 0.05.
2. **Party modifier:** `+0.05` per `FRIEND` or `TRUSTED_COMPANION` pair in the party; `−0.08` per `RIVAL` or `ENEMY` pair.
3. **Mood modifier:** `(averageMood / 100 - 0.5) * 0.2` — neutral mood contributes nothing.
4. **DI modifier:** from `diModifier` argument (output of `applyDivineShift`).
5. **Final probability:** sum of above, clamped to [0.05, 0.95].
6. Roll against final probability using seeded RNG.

**On success:** distribute `quest.reward` (loot), compute `reputationDelta`, apply `QUEST_SUCCESS` mood factors to all party members, strengthen party relationships.

**On failure:** apply `QUEST_FAILURE` mood factors, roll `quest.risk` for injuries and deaths, weaken relationships.

### Injury and death rolls

- `injuryChance` and `deathChance` are independent rolls per party member after a failed quest.
- Injured adventurers enter `RESTING` state for `difficulty * 2` ticks.
- Dead adventurers: state → `DEAD`; fire `AdventurerDied` lifecycle event; DI burst offered to player (see `behaviors/divine-influence.md`).

### Quest expiry

- Quests with `status: AVAILABLE` and `tick >= expiresAt` transition to `EXPIRED` at the start of each day tick.
- Expired quests are removed from the board. No event fires for individual expiry.
- If board expiry causes a drought condition (0 available quests for 3 days), `QUEST_DROUGHT` fires.

## Validation

- Quest board is seeded once per 168 ticks, not every tick.
- Autonomous selection never assigns `ENEMY` pairs if avoidable (valid alternative exists).
- `resolveQuest` with `difficulty: 10` and a solo party has `finalProbability ≤ 0.95` even with max DI.
- `resolveQuest` with `difficulty: 1` and a full `TRUSTED_COMPANION` party has `finalProbability ≤ 0.95`.
- A `QUEST_DROUGHT` event fires after exactly 72 consecutive ticks (3 days × 24 hours) with 0 available quests.

## Principles

**Inherited:**
- [Autonomy is the default](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — the board seeds and party assembles without player commands. DI intervention is an interruption.
- [Probability shift, not outcome override](../principles.md#probability-shift-not-outcome-override) — `diModifier` adjusts the probability before the roll; the roll is always taken.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — `QuestStarted` and `QuestOutcome` events must carry enough context to render a meaningful narrative string.

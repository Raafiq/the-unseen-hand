# Behavior: World Expansion

## Rule

New regions unlock when the player completes a scenario or when the guild's reputation crosses a threshold. Each region adds new quest types, a new adventurer recruitment pool, and new world event possibilities. Early-game complexity is low; late-game complexity scales with the number of unlocked regions.

## Applies To

- `packages/core/src/world/WorldExpansion.ts`

## Details

### Unlock triggers

A region unlock fires when **any** of the following are true:
- `ScenarioComplete` fires (always unlocks the next region in sequence).
- Guild reputation crosses a region's unlock threshold (see below).

Guild reputation: a value tracked in `SimulationContext` (added in Phase 4). Increases from quest completions and relationship milestones, decreases from quest failures and deaths. Range: 0–1000. Starting value: scenario-dependent.

### Region sequence

Regions are seeded at world generation. Three regions are defined at launch (Phase 4), more may be added later:

| Region id | Name | Difficulty base | Unlock condition | Added features |
|---|---|---|---|---|
| `THORNVALE` | Thornvale | 3 | Starting region (always unlocked) | Basic quest types; starting adventurer pool |
| `ASHWOOD` | The Ashwood | 5 | `ScenarioComplete` OR reputation ≥ 200 | `DUNGEON` and `INVESTIGATION` quests; `UNDEAD` enemy archetype; new adventurer pool |
| `STORMPASS` | Stormpass | 7 | Reputation ≥ 500 OR 2 scenarios complete | `POLITICAL` quests; `ELEMENTAL` enemy archetype; rare `RESCUE` variants |

### On region unlock

1. Set `region.unlocked = true`.
2. Fire `REGION_UNLOCKED` world event (renderedText describes the region).
3. Surface a discovery decision moment: player may spend 10 DI to send a scout (seeds 2 quests in the new region immediately) or let it populate naturally.
4. Begin including the region in quest board seeding (see `behaviors/quest-system.md`).
5. Add the region's adventurer pool to the recruitment pool (Phase 4 feature; adventurers do not appear automatically — they must be recruited via a future mechanic or seeded by scenario).

### Reputation tracking

| Event | Reputation delta |
|---|---|
| Quest success (difficulty 1–4) | +5 |
| Quest success (difficulty 5–7) | +10 |
| Quest success (difficulty 8–10) | +20 |
| Quest failure | −8 |
| Adventurer death (on a quest) | −15 |
| `TRUSTED_COMPANION` bond formed | +5 |
| Personal goal achieved | +10 |
| Scenario objective completed | +50 |

Reputation is clamped to [0, 1000].

### Complexity scaling intent

- 1 region (starting): 3–5 active quests at a time, 6 adventurers. Narrative is intimate.
- 2 regions: 6–8 active quests, recruitment pool grows. Harder to track everyone.
- 3 regions: 8–12 active quests, complex overlapping relationships. Late-game feel.

The UI must remain legible across all complexity levels. See `screens/world-panel.md`.

## Validation

- `THORNVALE` is unlocked at simulation start; `ASHWOOD` and `STORMPASS` are locked.
- `ScenarioComplete` unlocks `ASHWOOD` even if reputation < 200.
- Reputation reaching 200 unlocks `ASHWOOD` even without scenario completion.
- `REGION_UNLOCKED` fires a world event with non-empty `renderedText`.
- Region unlock does not re-fire if the region is already unlocked.

## Principles

**Inherited:**
- [Autonomy is the default](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — world expansion evaluates passively each tick against reputation and scenario state; no player action required to trigger it.
- [Emergence over control](../principles.md#emergence-over-control) — the player cannot directly unlock regions by spending DI. Expansion is a consequence of the world's story, not a purchase.

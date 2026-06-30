# Behavior: World Expansion

## Rule

New regions unlock when the player completes a scenario or when the guild's reputation crosses a threshold. Each region adds new quest types, a new adventurer recruitment pool, and new world event possibilities. Early-game complexity is low; late-game complexity scales with the number of unlocked regions.

## Applies To

- `packages/core/src/world/WorldExpansion.ts` — region unlocking, reputation, and the
  `worldEventSeedingSubscriber` (world-event spans, below)
- `specs/behaviors/event-bus.md` — `WorldEvent` START/END phases
- `specs/behaviors/narrative-voice.md` — active spans tint feed colour while live

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

### Active world events (stateful spans)

World events are not instantaneous announcements — the weighty ones **persist for a span** of
simulated time, during which other systems can read that a region is currently stormbound,
plague-ridden, or hosting a merchant. Each live span is a `WorldEventInstance`
(`{ type, startedAt, expiresAt }`) held in `Region.activeWorldEvents` — the field already
exists in the data model and is, until now, never populated. This section fills it.

#### Spanning vs instant

| Type | Kind | Duration roll (ticks; 24 ticks = 1 day) |
|---|---|---|
| `STORM` | span | 6–18 (≈ a quarter-day to most of a day) |
| `TRAVELLING_MERCHANT` | span | 24–72 (1–3 days) |
| `MONSTER_SURGE` | span | 48–120 (2–5 days) |
| `PLAGUE` | span | 72–192 (3–8 days) |
| `RUMOUR` | instant | — (single flavour line, no span) |
| `WINDFALL` | instant | — (single flavour line, no span) |

Duration is rolled once at seeding via `ctx.rng` over the inclusive tick range; `expiresAt =
startedAt + duration`. All randomness flows through `ctx.rng` — no `Math.random()`.

#### Lifecycle

`worldEventSeedingSubscriber` (the existing ~1/24-per-tick seeding roll is retained) handles
the span lifecycle each tick:

1. **Start.** When a spanning event is seeded for a region, roll its duration, push a
   `WorldEventInstance` onto `region.activeWorldEvents`, and emit a `WorldEvent` with
   `phase: 'START'`.
2. **Live.** While `startedAt ≤ tick < expiresAt`, the instance stays in
   `activeWorldEvents`. Other systems read it (below). No event is emitted per live tick.
3. **End.** On the first tick where `tick ≥ expiresAt`, remove the instance from
   `activeWorldEvents` and emit a `WorldEvent` with `phase: 'END'`.

Instant events (`RUMOUR`, `WINDFALL`) emit a single `WorldEvent` with no `phase` and never
touch `activeWorldEvents`.

A region may hold more than one active span at once (e.g. a `MONSTER_SURGE` during a `STORM`).
A new span of a type already active for that region is suppressed (no duplicate stacking of the
same type); the seeding roll simply no-ops for that type until the current one ends.

#### Consumers of active spans

Active spans are the mechanism by which the world "stays" in a state instead of blinking. Read
contracts:

- **Quest seeding / difficulty** (`behaviors/quest-system.md`): a live `MONSTER_SURGE` raises
  the region's effective threat (more combat-heavy quests, higher difficulty); a live `STORM`
  suppresses new departures and travel-type quests; a live `TRAVELLING_MERCHANT` enables
  trade/restock quest variants.
- **Narrative colour** (`behaviors/narrative-voice.md`): the grammar's colour pool may be
  tinted by an active span (storm-lashed, plague-shadowed, market-day), so unrelated feed lines
  pick up the region's current weather.
- **Departures** (`behaviors/departure-system.md`): a live `PLAGUE` is a standing mood-strain
  input while active, not a one-tick shock.

Each consumer reads `region.activeWorldEvents` directly; spans are never inferred from the
event log.

### Weighty social spans (feuds, festivals)

The same span model extends to a small set of **weighty social/town events** that are too
consequential to be single feed lines:

- A **FEUD** opens when two adventurers (or an adventurer and a notable NPC) reach
  `ESTRANGEMENT` under a crisis flag; it persists as a span during which their approach
  cooldown holds and their encounters read as cold/hostile (see `behaviors/social-system.md`
  §5, `behaviors/npc-system.md`).
- A **FESTIVAL** is a town-level span (see `behaviors/npc-system.md`) that raises Social-cluster
  activity weights and approach pressure guild-wide while live.

These spans follow the identical START → live → END lifecycle and emit START/END events. Their
detailed triggers live in `social-system.md` and `npc-system.md`; this spec owns only the
shared span mechanic. The concrete feud/festival duration rolls are defined in those specs.

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
- A seeded `STORM` adds one `WorldEventInstance` to `region.activeWorldEvents` with
  `expiresAt − startedAt ∈ [6, 18]`, and emits a `WorldEvent` with `phase: 'START'`.
- The span is removed from `activeWorldEvents` on the first tick `≥ expiresAt`, emitting exactly
  one `phase: 'END'` event (no per-tick events while live).
- `RUMOUR` and `WINDFALL` emit a single event with no `phase` and never appear in
  `activeWorldEvents`.
- A second `STORM` seeded for a region that already has a live `STORM` is suppressed (no
  duplicate of the same type).
- Span durations are reproducible under a fixed seed (rolled via `ctx.rng`, no `Math.random()`).

## Principles

**Inherited:**
- [Autonomy is the default](../principles.md#autonomy-is-the-default-intervention-is-the-exception) — world expansion evaluates passively each tick against reputation and scenario state; no player action required to trigger it.
- [Emergence over control](../principles.md#emergence-over-control) — the player cannot directly unlock regions by spending DI. Expansion is a consequence of the world's story, not a purchase.

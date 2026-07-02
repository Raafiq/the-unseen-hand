---
status: done
depends: []
specs:
  - specs/behaviors/npc-system.md
  - specs/data-model.md
  - specs/behaviors/mood-system.md
  - specs/behaviors/history-layer.md
---

# Plan: P12b — Tier-A NPC interiority

> Notable NPCs earn inner state: required live `mood` with decaying `moodFactors`, a 50-cap
> `history`, and a static hand-authored `want`. All writes are event-driven (encounters, bonded
> deaths/departures) — persistence stays earned, and no new subscriber is added.

## Scope

**In scope:**
- `NotableNpc` type: `mood` becomes required; add `moodFactors: MoodFactor[]`,
  `history: HistoryEvent[]`, `want: { id: string; text: string }`.
- Seed data for the 4 Thornvale NPCs (`scenarios/notableNpcs.ts`): `mood: 50`, empty
  factors/history, a hand-written `want` each (e.g. Brenna: "to see her blades come home
  carried, not sold").
- `moodSubscriber` day-tick pass extends to `ctx.notableNpcs` (decay factors, recalc mood; no
  `despairStreak`).
- `resolveEncounter` applies outcome mood factors to NPC participants.
- Bonded-witness history: adventurer death (quest resolution) and departure write sites append a
  `WITNESSED_DEATH`-kind `HistoryEvent` to NPCs with `|strength| ≥ 20` edges, via the existing
  `appendHistoryEvent` (50-cap FIFO).
- `npcToActor` reads live `npc.mood` directly (drop the `?? 50` default).

**Out of scope:**
- Thoughts/grammar (p12a), whispers (p12c), UI (p12d).
- Wants progressing/completing over time; NPC quests/departure/death; NPC↔NPC edges;
  `contextualModifier` for NPCs (stays adventurer-only).

## Implements

- `specs/behaviors/npc-system.md` — Interiority (earned, event-driven) section + new validation
  bullets.
- `specs/behaviors/mood-system.md` — NPC day-tick coverage.
- `specs/behaviors/history-layer.md#reuse-beyond-adventurers`.

## Approach

1. Type + seed data; `tsc` drives out every `NotableNpc` construction site.
2. TDD through subscribers (house rule): `resolveEncounter` applies the outcome mood factor to an
   NPC participant (force a deterministic outcome); `moodSubscriber` decays NPC factors on day
   ticks and recalculates `npc.mood`; despairing NPC has no streak/departure consequence; an
   adventurer death appends WITNESSED_DEATH to a bonded NPC's history and not to a stranger
   NPC's (route through `questResolutionSubscriber` with a rigged fatal quest); NPC history
   respects the 50-cap; `npc.want` unchanged across 500 ticks.
3. Spec amendments land with this slice (already drafted alongside).
4. Gates: `pnpm --filter @ugs/core exec tsc --noEmit`, full Vitest.

## Validation

- [x] All subscriber-routed tests above green (tests/npc-interiority.test.ts; 564 core tests).
- [x] Existing suite untouched (mood decay and history appends are roll-free — no rng
      re-baselines; scenario1-baseline unchanged).
- [x] npc-system.md exclusion/interiority sections merged (landed with the spec batch).
- [x] `grep -r "Math.random" packages/` clean.

## Risks / unknowns

- **NPC mood feedback loop**: live NPC mood now feeds encounter valence via `npcToActor` — a
  despairing NPC breeds arguments breeds despair. Same decaying `OUTCOME_EFFECTS` magnitudes as
  adventurers + daily decay should equilibrate; verify in a 30-day playtest before calling done.

## Notes

- Deliberately NOT a `PersonalGoal`: `want` has no milestones, no completion, no subscriber —
  it exists to feed the thought grammar's subject slot.
- NPC mood lives inside the existing `moodSubscriber` (one authoritative mood write site), not a
  parallel `npcMoodSubscriber` — per npc-system.md's "not a parallel system" local principle.

## Follow-ups

- p12c reads nothing from this slice directly, but whisper subjects get richer once NPC
  history/want exist.

---
status: planned
depends: [phase-1-foundation]
specs:
  - specs/behaviors/event-bus.md
  - specs/behaviors/quest-system.md
  - specs/behaviors/combat-resolution.md
  - specs/behaviors/social-events.md
  - specs/behaviors/departure-system.md
issues: []
---

# Plan: Phase 2 — The Autonomous World

## Scope

Add the systems that make the world run on its own without player input: typed event bus, quest
lifecycle (seeding + autonomous dispatch + resolution), beat-by-beat combat, social interactions,
and the departure system. After this phase the headless sim produces a continuous typed event
stream over many ticks with no empty `renderedText`.

**Out of scope:** divine influence and intervention, decision moments, scenario engine, UI.

## Implements

- **`specs/behaviors/event-bus.md`** — typed `SimulationEvent` union, `renderedText` non-empty
  invariant, template engine.
- **`specs/behaviors/quest-system.md`** — weekly board seeding, autonomous party selection,
  `resolveQuest` with probability composition.
- **`specs/behaviors/combat-resolution.md`** — beat generation consistent with pre-rolled
  outcome, personality-driven action table, ≥3 template variants per `BeatAction`,
  `personalityNote` generation.
- **`specs/behaviors/social-events.md`** — daily interaction roll, outcome effects.
- **`specs/behaviors/departure-system.md`** — `despairingDayCount` departure with DI-rescue
  moment.

## Approach

Build in TDD order:

1. **Event bus** — pulled first because quests, combat, social, and lifecycle all emit through
   it. Typed union + `renderedText` never-empty invariant + template engine.
2. **Quest system** — weekly seeding, autonomous party selection (volunteer weights from P1),
   `resolveQuest` (probability composition; assert shifted probability, not rolled outcome).
3. **Combat resolution** — beat generation consistent with pre-rolled outcome, personality-
   driven action table, ≥3 template variants per `BeatAction`, `personalityNote`.
4. **Social events + departure** — daily interaction roll, outcome effects,
   `despairingDayCount` departure with DI-rescue moment.

## Validation

- [ ] Every `SimulationEvent` has a non-empty `renderedText`.
- [ ] Template engine produces ≥3 distinct variants per `BeatAction`.
- [ ] Quest board seeded each week with the correct number of quests per spec.
- [ ] Autonomous party selection uses `questVolunteerWeight` from personality system.
- [ ] `resolveQuest` probability composition tests assert the shifted probability value, not the rolled outcome.
- [ ] Beat sequence is consistent with the pre-rolled quest outcome (success beats differ from failure beats).
- [ ] `personalityNote` attached when dominant axis < 35 or > 65 caused the action.
- [ ] Daily social interaction roll fires and updates relationship edges.
- [ ] Social outcome effects applied to adventurer mood and relationship graph.
- [ ] Adventurer with `mood < 10` for 3+ days enters departure roll.
- [ ] Running the headless sim for 30 days produces a non-empty typed event stream with zero empty `renderedText` entries.
- [ ] `/audit-spec-drift` shows no Phase-2 spec gap.

## Risks / unknowns

- **Template coverage** — every `BeatAction` and `SocialOutcome` must have ≥3 variants;
  missing coverage silently produces empty strings. Add a compile-time exhaustiveness check or
  a test that enumerates all action types.
- **Quest timing** — "weekly seeding" means every 7 days (168 ticks); verify the tick math
  doesn't drift due to off-by-one.

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)

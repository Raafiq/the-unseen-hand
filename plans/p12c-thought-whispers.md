---
status: pending
depends: [p12a-thought-grammar, p12b-npc-interiority]
specs:
  - specs/behaviors/thought-system.md
  - specs/behaviors/event-bus.md
  - specs/screens/event-feed.md
---

# Plan: P12c — THOUGHT whispers + feed support

> Thoughts surface into the world: a new `THOUGHT` event kind, a whisper subscriber registered
> dead-last, eventLog-tail anti-repetition, and the EventFeed three-update rule. This is the
> slice that consumes `ctx.rng` per tick — seed-sensitive test re-baselines are budgeted here.

## Scope

**In scope:**
- `ThoughtEvent` type (`kind: 'THOUGHT'; actorId: ActorId; subjectKey: string`) +
  `ThoughtEventInput`; `emitEvent` THOUGHT branch honouring **pre-rendered** text on the input
  (single append path preserved; whisper == panel byte-equality preserved).
- `thoughts/thoughtWhispers.ts`: `rollThoughtWhispers(ctx, chance)` + `thoughtWhisperSubscriber`;
  `THOUGHT_WHISPER_CHANCE = 0.01` (~1 whisper per actor per ~4 in-game days; tuning note below).
- Registration **after** `npcFlavourSubscriber` (new dead-last), with the stream-ordering comment
  mirroring the npcFlavour precedent.
- Eligibility: adventurers in town-eligible activities; Tier-A NPCs always; DEAD/RETIRED/ON_QUEST
  never.
- Anti-repetition: eventLog **tail** scan (last ~50 entries, window 96 ticks) suppressing the
  actor's recently-whispered `subjectKey`s via `renderThought`'s `suppressSubjects` option — no
  new `SimulationContext` state.
- EventFeed three updates: `KIND_LABELS` THOUGHT entry (muted tag, italic row text), `ALL_KINDS`,
  `getInvolvedIds` gains the `actorId` branch (only THOUGHT carries `actorId` at top level —
  verify against `NPCEvent.adventurerId` handling).
- 500-tick double-run byte-equality replay test including THOUGHT lines.
- Re-baseline seed-sensitive tests broken by the new per-tick rng draws; document old→new in
  Notes.

**Out of scope:**
- Detail-panel and decision-card surfaces (p12d).

## Implements

- `specs/behaviors/thought-system.md#thought-whispers`.
- `specs/behaviors/event-bus.md#thoughtevent`.
- `specs/screens/event-feed.md` — Thought tag/filter/involved-actor bullets.

## Approach

1. Types + `emitEvent` branch.
2. TDD `thought-whispers.test.ts` through the subscriber, chance forced via exported
   `rollThoughtWhispers` (the `rollTownFlavour` pattern; chance 1 and 0 both yield deterministic
   assertions): emits THOUGHT with non-empty slot-free text and `actorId`; whisper text equals
   `renderThought` output for same actor+tick; NPCs whisper too; DEAD/RETIRED/ON_QUEST never;
   just-used `subjectKey` suppressed next whisper when alternatives exist; `subjectKey` label
   never appears in renderedText; zero-chance roll returns ctx unchanged (referential).
3. Register subscriber dead-last + ordering comment.
4. Determinism: scenario1, 500 ticks, run twice, byte-identical eventLog.
5. EventFeed three updates + svelte-check/tsc; unit-level filter check that a THOUGHT whisper
   appears under the thinker's character filter.
6. Re-baseline (expected: playtest / scenario1-baseline / p2 / p4 headless validations).

## Validation

- [ ] Subscriber tests green (incl. equality + suppression + referential no-op).
- [ ] 500-tick replay byte-equality green.
- [ ] Three-update rule complete — `KIND_LABELS` (tsc-enforced), `ALL_KINDS` + `getInvolvedIds`
      (test-enforced; tsc does NOT catch these).
- [ ] Re-baselines documented in Notes (old → new values).
- [ ] Full core suite + `pnpm --filter @ugs/game-client check` green.

## Risks / unknowns

- **Seed-sensitive re-baselines** (highest-confidence risk): every per-tick rng draw displaces
  later draws across ticks. Contained by dead-last registration (intra-tick streams untouched);
  cross-tick displacement is the accepted cost, as with p10b/p10d.
- Whisper cadence feel: 0.01/tick may read chatty or sparse at 20× speed — constant is exported
  for tuning; revisit after playtest.

## Notes

- (fill at implementation: re-baselined values old → new)

## Follow-ups

- p12d surfaces.

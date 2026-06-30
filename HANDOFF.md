# Handoff — The Unseen Hand (guild-sim)

_Updated 2026-06-30. **p10c-social-pressure is DONE** (`a9d6736`). Next ready work in the DAG is
`p10b-world-event-durations` (recommended — it unblocks p10c's descoped FEUD span) or
`p10d-npc-system`. Tree is clean apart from this file. **Before p10b: read the p10c follow-ups
below — one needs a user decision (density tuning).**_

---

## What just landed (p10c)

Replaced the legacy memoryless `pairHour` social subscriber with the **pressure-accumulator +
jittered-discharge + cooldown** engine and the six-outcome (valence × intensity) grid. Commit
`a9d6736` (closeout); `chore` in-progress flip was `<prev>`. Specs were already amended last
session (`a279ce8`).

- `packages/core/src/events/socialResolver.ts` — full rewrite. `socialPressureSubscriber` (thin
  per-tick driver) + `resolveEncounter` (deep write site). Pure helpers `computePressureGain`,
  `decideApproach`, `resolveOutcome` exported + unit-tested.
- `SimulationContext` gained `socialPressure` + `socialCooldowns` (`PairKey`-keyed); init in
  `createSimulationContext` (all other sites spread `...base`).
- `SocialEvent` widened to six subtypes + `participantIds: ActorId[]` (new `ActorId`/`PairKey`/
  `SocialOutcomeType` aliases in `types.ts`). Grammar pools: added SOLIDARITY + ESTRANGEMENT,
  `POSITIVE_CHAT`→`BANTER`.
- Tests: new `tests/social-pressure.test.ts` (21); updated event-bus/narrative-voice/social-departure.
- Verified: **478 core Vitest green**, game-client `tsc` + `svelte-check` **0 errors**. All 11
  plan Validation boxes checked.

## p10c follow-ups (carried into the backlog — full text in `plans/p10c-social-pressure.md`)

1. **Density tuning — NEEDS A USER DECISION.** Synthetic 5-adv/30-day harness reads **~1.7/day**
   (mood on) vs the ~5/day target band (3–7). **Not changed**: constants are signed-off, and
   density is **unobservable in the shipping 1-adventurer scenario** so it has zero in-game effect
   today. The plan pre-authorised levers if you want to act: `PROXIMITY 0.05→0.06`,
   `DECAY 0.015→0.012`, or lower `THRESHOLD` in `socialResolver.ts`. Harness is a caveat-heavy lower
   bound (convergent moods). **Recommend: decide once recruitment exists** (multi-adventurer state).
2. **FEUD span — descoped, blocked on p10b.** ESTRANGEMENT-under-crisis should open a FEUD span, but
   the span lifecycle lives in `p10b-world-event-durations` (still `planned`). The crisis-bypass
   *logic* is built + tested; nothing opens a span or sets the crisis flag yet. **Wire it when doing
   p10b** — this is the main reason to pick p10b next.
3. **Join/interrupt side effects not wired.** `decideApproach` exists + tested, but the subscriber
   doesn't apply spec §3 JOIN duration-extension / INTERRUPT activity-termination.
4. **Group prose names only 2 of N.** One `SocialEvent` carries all N ids, but P10a beat pools
   (`{a}`/`{b}`) name only two. Needs a group-subject grammar (spec §6).
5. **Crisis flag source** still a forward slot — first real producer is the FEUD path (#2).

## Next steps

1. `specops next` → choose `p10b-world-event-durations` (recommended) or `p10d-npc-system`.
2. Read the chosen plan in full; mark `in-progress` (specops protocol); build via `/tdd`.
3. If p10b: when adding the span lifecycle, **circle back to p10c follow-up #2** and wire the FEUD
   span + crisis flag into `resolveEncounter`.

## Gotchas (still current)

- **`vitest run` "failed files" for Playwright specs = false alarm** (mis-collected). Run e2e via the
  game-client `test:e2e` script.
- **Map-init crashes**: any new `SimulationContext` field must be init'd at `createSimulationContext`;
  other sites spread `...base`. No compile guard for a missing `.get` on an undefined map.
- **`createSimulationContext()` needs a seed arg** (crashes in `xmur3` without one).
- **Rebuild core (`npm run build` in packages/core) before `svelte-check`** — the game-client resolves
  `@ugs/core` types from `dist/`, not source.
- **EventFeed.svelte** needs no change for new SOCIAL subtypes (keys on `kind` + `participantIds`),
  but DOES for any *new EventKind* (`KIND_LABELS` + `ALL_KINDS` + `getInvolvedIds`; tsc only catches
  the first).
- Clock: 1 tick = 1 hour, 24/day, 720 ticks = 30 days.

## Suggested skills

- **`/specops`** — pick next, mark in-progress, close out.
- **`/tdd`** — build test-first, one test per Validation box.
- **`/code-review`** or **`/simplify`** — after green, before closeout.

# Handoff — The Unseen Hand (guild-sim)

_Last updated: 2026-06-30 (backlog-triage session). Focus for next session: **build the
next Phase-10 plan — `p10c-social-pressure` (recommended) or `p10b-world-event-durations`.**_

---

## Where things stand

**The working tree is clean and fully committed.** A large multi-session backlog that had
accumulated uncommitted on `main` (everything from P7 through P10a) was triaged and landed
as a sequence of plan-grouped commits on `main`, in chronological order:

```
1eeef28 docs: project guardrails, roadmap, BUGS backlog
08f4074 feat(core): P10a — narrative-voice template grammar
0e8aafe docs(specs): P10 events-redesign spec batch + plan DAG
c400078 feat(core): P9a — activity system + social/mood, with P7-P9 core wiring
e012250 feat(ui): P8 world-map sidebar, DI deltas, narrator client + Playwright E2E
8712343 feat(core): P7a — departure shift wiring
<gitignore + earlier P4d/P5 history>
```

`.gitignore` now excludes `test-results/`, `playwright-report/`, and `.claude/worktrees/`.

### Verification at triage time
- `tsc --noEmit` clean (packages/core).
- **814 unit tests pass.** Note: `vitest run` from the repo root reports "5 failed test
  files" — those are the 5 Playwright `*.spec.ts` files under `apps/game-client/tests/`
  being mis-collected by vitest (they use `page.goto`). They are **not** real failures;
  run them via the `test:e2e` Playwright script, not vitest. **Follow-up worth doing:** add
  an exclude for `apps/game-client/tests/**` to the root vitest config so the suite is clean.

---

## Plan DAG (run `…/specops next` to confirm)

```
p10a-narrative-voice   DONE
p10b-world-event-durations   READY   (Durations #3 — unblocks nothing)
p10c-social-pressure         READY   (Timing #2 — unblocks p10d)   ← recommended next
   └─ p10d-npc-system        BLOCKED on p10c   (Town #4)
```

p9b/p9c are `cancelled` with successor pointers into Phase 10. Specs each plan implements
are in its `specs:` frontmatter.

Do not re-derive the Phase-10 design — it lives in:
- Decisions + rationale: memory `project-events-redesign.md`; artifact
  `.lavish/events-redesign-discussion.html` (now committed).
- Review artifact: `.lavish/phase-10-events-redesign-review.html`.

### Three scoping decisions carried forward from p10a (affect p10c/p10d)
1. **Social pools are the current 4-outcome set.** The 6-outcome pools (`SOLIDARITY`,
   `ESTRANGEMENT`, `BANTER`) are deferred to **p10c**, where emission changes (one-line-per-pool).
2. **`MICRO_EVENT` is dead code** in `activitySystem.ts` (never emitted). Wiring it through
   the grammar is a tracked follow-up (candidate to fold into p10c).
3. **Region attribution dropped from world line text** (still on `event.regionId`).

---

## Immediate next actions

1. **Build `p10c-social-pressure`** (recommended — unblocks p10d). Use `/tdd`: one failing
   test per behavior; route subscriber-owned behavior through the subscriber with a seeded
   `createSimulationContext('seed')`. p10c's pressure accumulator + discharge needs a
   `cooldownKey`/cooldown (per-tick detector rule below). Optionally `/grilling` first to
   stress-test the pressure tuning. Mark it `in-progress`, build, then close out per specops.
2. `p10b-world-event-durations` is the lower-leverage alternative (unblocks nothing).

---

## Invariants (full list in `CLAUDE.md`)

- No `Math.random()` in `packages/core/` — all randomness via `ctx.rng`.
- Tests assert **probability shifts / accumulator state, not rolled outcomes**.
- `tsc --noEmit` + `svelte-check` clean before any **Svelte** edit is "done".
- Test subscriber-owned behavior **through the subscriber**, seeded context.
- Per-tick detectors need a `cooldownKey`/cooldown — directly relevant to p10c's pressure discharge.
- EventFeed needs 3 updates per new EventKind (`KIND_LABELS`/`ALL_KINDS`/`getInvolvedIds`) —
  the new `NPC` kind in p10d; `getInvolvedIds` must resolve NPC actor ids.

## Suggested skills

- **`/tdd`** — primary for building p10c/p10b/p10d.
- **`/specops`** — close out each plan (freeze to `done`); `…/specops next` / `dag` to query.
- **`/grilling`** — optional, to stress-test p10c's pressure-accumulator tuning before building.

## State notes

- Everything is committed; `git status` is clean. The user has a `BUGS.md` backlog (7 items —
  night/sleep penalties, `TRUSTED_COMPANION` leaking into UI, hourly-activity spam, Day-0 start
  time/quests, character event filter, auto-pause-on-intervention) worth turning into specs/plans
  when the player-experience polish phase starts.
- No secrets or PII in this document.

# Handoff — Phase 15 COMPLETE (p15c + p15e shipped, committed + pushed)

Phase 15 is fully built. All 34 plans in the DAG are `status: done` (`specops next` → "0 ready · 0
in-progress"). This session built **p15c (cycle LLM tier)** and **p15e (app-shell Proceed
finalisation)**, then committed and pushed them.

## Committed this session (already on `origin/main`)

Three logical commits (p15c first because it carries `cycleNarrator.ts`, so the entangled shared
files build; p15e's engine-only files follow; portrait last):

1. `bf7b971` **p15c** — cycle LLM narrator tier. Carries `index.ts` + `simulationStore.svelte.ts`
   **wholesale** (they hold entangled p15c+p15e edits that can't be split per-hunk).
2. `f235c1f` **p15e** — real-time speed API removed; world is turn-paced via Proceed.
3. `bc85467` **portrait** — added Marsa (Innkeeper) portrait (`npcs/marsa-inn.webp`); retargeted the
   `character-portraits` fallback e2e to Captain Halden (now the only art-less notable NPC).

The **portrait commit was a bug the prior handoff missed**: the untracked `marsa-inn.webp` made Marsa
resolve to art, so the `character-portraits` spec (which used Marsa as its circle-fallback example)
failed. e2e was NOT actually green at the prior close. Fixed by retargeting to Halden (badge "Guard
Captain", initial "C").

## Verified state (all green after the portrait fix)

```
pnpm --filter @ugs/core exec tsc --noEmit      # clean
pnpm --filter @ugs/core test                   # 640 pass (was 642; -2 deprecated speed-API tests)
pnpm --filter @ugs/core build                  # clean  (REQUIRED before client vitest — resolves @ugs/core via dist)
pnpm --filter @ugs/game-client check           # 0 errors / 0 warnings
pnpm --filter @ugs/game-client test            # vitest 21 pass (9 new in cycleNarrator.test.ts)
cd apps/game-client && pnpm test:e2e           # 23 pass / 7 skip (6 flag-skips + 1 new DI-gated choice-card test)
pnpm build                                     # both packages green (Pixi chunk-size warning is pre-existing)
```

## What p15c built (LLM tier — additive over p15b templates)

- **Core pure prompt builders** (`packages/core/src/events/LLMNarrator.ts`): `buildCycleOverviewPrompt`
  + `buildCycleChapterPrompt` (exported from `index.ts`), sharing a `NARRATOR_VOICE` const with the
  retained `buildNarratorPrompt`. Chapter prompt carries personality axes + mood band
  (`moodThresholdLabel`) + top-3 relationships.
- **Client LLM tier** (`apps/game-client/src/lib/cycleNarrator.ts`, new): `enrichCycleReads(reads, ctx,
  handlers)` fires a bounded batch (1 overview + 1 per eventful chapter, ≤ rosterSize+1),
  fire-and-forget, degrade-safe (no key → no-op); pure `patchCycleReads(history, fromTick, patch)` does
  replace-in-place. Selects the SAME events as the template via `chapterEvents` (renamed+exported from
  the former private `cycleEventsFor`) + new `cycleOverviewEvents` (both in `cycleNarrative.ts`).
- **`narrator.ts`** refactored to low-level `callNarrator(prompt, apiKey)` + `resolveNarratorApiKey()`;
  the dead day-path (`fetchDaySummary`) and `simulationStore.daySummaries` were **deleted**.
- **Store** (`simulationStore.svelte.ts`): `proceed()` records template reads synchronously then fires
  enrichment; `onOverview`/`onChapter` → `applyCycleEnrichment` → `patchCycleReads`, reassigning
  `cycleReadsHistory` (keys `digest.fromTick` / `ch.actorId` stay stable ⇒ prose swaps in place, no
  reflow).
- **e2e** `narrator.spec.ts` re-enabled, retargeted at `.cycle-overview` + `.chapter-prose`
  (distinguishes overview vs chapter prompt by request-body system text, asserts each LLM passage
  replaces its template).

## What p15e built (speed API removed + boundary decisions)

- **Engine speed API fully deleted.** `WorldClock.ts` stripped to `worldTime`/`onTick`/`step`
  (no `SpeedMultiplier`/`INTERVAL_MS`/`currentSpeed`/`setSpeed`/`start`/`stop`/`pause`/`resume`).
  `SimulationLoop.ts` no longer holds a `WorldClock` (only hosted the shims; `proceed()`/`step()`
  advance time via `advanceTime`); its 5 deprecated methods gone. `SpeedMultiplier` un-exported from
  `index.ts`.
- **Store** dropped `speed`/`speedBeforePause`/`setSpeed`, the decision-moment auto-pause in the render
  observer, and the resume-on-`CHOOSE_OPTION` branch. Render observer now just mirrors `ctx`.
- **ChoiceCard.svelte** countdown → "Expires in N ticks · ~M cycles" (8 ticks/cycle); secondary chip has
  a cycles tooltip.
- **`apps/game-client/CLAUDE.md`** auto-pause guardrail replaced with "the world is turn-paced; no speed
  or pause control".
- Core deprecated-API tests removed (`world-clock.test.ts`, `simulation-loop.test.ts`).

## Open questions (all resolved this session)

1. **Top-bar clock vs. spread wording — RESOLVED (Option B).** The clock shows the cycle *poised on*
   (`ctx.worldTime.cycle`) while the newest spread header shows the cycle *just read* (`digest.cycle`),
   one behind. Settled with the user via a Lavish review (`.lavish/clock-wording-fork.html`): **keep the
   code** (the clock is a clock - it says where the world *is* and must advance each PROCEED) and
   **reword the spec** (`specs/screens/app-shell.md:25`) to describe the date as the cycle poised on,
   explicitly one ahead of the spread. No code change. p15e's plan follow-up marked RESOLVED.
2. **HANDOFF refresh** — this doc (done).

## Gotchas & dead ends

- **`bd05f37` (same-activity re-draw fix, pre-existing on `main`) made Day 0 · Night eventful.** The
  old handoff's "Day 0 · Night is quiet" fact is STALE. `cycle-reader.spec.ts` "no placeholder" test
  was retargeted to **Day 1 · Afternoon** (the first genuinely quiet cycle for lone-adventurer Reiko).
  Probe order if you need a quiet cycle again: cycles 0/1/2 eventful (KINDNESS t10, KINDNESS t19,
  QUEST_STARTED t30), **cycle 3 = Day 1 Afternoon = first empty**, then 4/5/6 empty.
- **Rebuild `@ugs/core` before client vitest** — resolves `@ugs/core` via `dist`, not `src`
  (`apps/game-client/CLAUDE.md`). `import type` is erased by esbuild, so **`check` — not vitest — is the
  authority** for cross-package type wiring.
- **Decision-moment / DI / ChoiceCard surface is behind `FEATURES.divineIntervention` (`false`,
  `apps/game-client/src/lib/featureFlags.ts`).** So the two new `choice-card.spec.ts` tests
  (non-gating boundary + ticks/cycles countdown) are **flag-skipped**, not live-green. The behavior is
  correct in code; re-enable the flag to exercise it. The `?e2e=decision` store seam injects a
  PARTY_SELECTION moment but App still gates render on the flag.
- **e2e that expected the world to auto-advance must click Proceed** (turn-paced; no clock). Already
  migrated, but watch for it if you touch specs.
- **Windows shell:** prefer the Bash tool. Run `specops` from repo root, quote the path:
  `"C:/Users/mdraa/.claude/skills/specops/scripts/specops" next` (NOT PowerShell `&`). Screenshots:
  throwaway Playwright spec via the harness (owns port 4173) — a hand-started `vite preview` collides.

## Key files & locations

- LLM tier: `apps/game-client/src/lib/cycleNarrator.ts` (+ `.test.ts`); core prompts
  `packages/core/src/events/LLMNarrator.ts`.
- Template tier + event selectors: `apps/game-client/src/lib/cycleNarrative.ts`
  (`chapterEvents`, `cycleOverviewEvents`, `composeCycleReads`).
- Store: `apps/game-client/src/lib/simulationStore.svelte.ts` (`proceed()`, `applyCycleEnrichment`).
- Reader: `apps/game-client/src/lib/components/EventFeed.svelte`; Shell: `apps/game-client/src/App.svelte`
  (`dateLabel`, `nextLabel`, dock `onSelect`).
- Engine: `packages/core/src/world/SimulationLoop.ts` (`proceed()`), `WorldClock.ts`.
- Decision UI: `apps/game-client/src/lib/components/ChoiceCard.svelte` (`cyclesLabel`).
- Plans (read the body, don't restate): `plans/p15c-cycle-llm-tier.md`, `plans/p15e-app-shell-proceed.md`
  — both `done`, Notes/Follow-ups filled.

## Likely next work (after commit) — not yet planned

- **No ready plans exist.** Phase 15 closes the events/cycle redesign. Next is a NEW phase — likely
  re-enabling flag-gated features (`divineIntervention`, `world` in `featureFlags.ts`) now the reader is
  stable, and/or a multi-adventurer scenario (scenario-1 is single-Reiko; shared-encounter chapters +
  two-POV overview + boundary ChoiceCard are covered only by unit fixtures, never live e2e). Use
  **specops** to scope + author the next plan set with the user before building.

## Suggested skills

- **specops** — `scripts/specops next|dag`; author the next phase's plans with the user.
- **tdd** — spec Validation section = the test list.
- **verify** — drive PROCEED e2e; toggle `FEATURES.divineIntervention` to exercise the decision surface.
- **lavish** — if the user wants to settle open question #1 (clock wording) as a reviewed fork.

## Reference (don't duplicate)

- Locked cycle-redesign design + rationale: memory `project-events-cycle-redesign`; `.lavish/*.html`.
- Plan bodies carry Scope/Implements/Approach/Validation/Risks/Notes/Follow-ups — read the file.

# The Unseen Hand — Agent Instructions

## Spec-driven development (specops)

This project uses spec-driven development. `specs/` is the source of truth for what
*should be true*; `plans/` is the work-in-flight DAG that bridges specs to merged code.
The **specops** skill carries the full methodology — invoke it (the skill triggers on
"spec", "plan", starting a feature, etc.) before writing specs, planning, or building.

- **Specs lead.** Before changing behavior, change the spec; bring code into conformance
  after. Spec↔code drift is a bug, not debt.
- **`plans/` is the planning system — not your built-in plan mode.** Every chunk of work
  lands as a file in `plans/` that freezes to `done` as the durable record of what got
  built. Don't let an ephemeral plan substitute for it, and don't skip it for "small"
  changes. (Classic trap: an ad-hoc plan of "write spec X, then build it" that ends with
  neither a reviewed spec nor a plan file — split those into the two real artifacts.)
- **When to author a plan depends on intent:** mapping out a batch of specs → finish the
  batch first, then propose a *set* of plans; speccing one bounded feature in a mature
  project → draft the spec change and its plan in tandem; intent unclear → ask. The skill
  details each mode.
- **A spec change ripples to its plans.** After editing a spec, review the plans that
  implement it (`grep -l '<spec-path>' plans/*.md`) and offer to update them.

Query the DAG:

```powershell
C:\Users\mdraa\.claude\skills\specops\scripts\specops next   # what to work on next
C:\Users\mdraa\.claude\skills\specops\scripts\specops dag    # dependency graph
```

Run `/audit-spec-drift` to compare specs against the implementation.

---

## Commands

Monorepo uses **pnpm** workspaces + **turbo**. Two packages: `@ugs/core`, `@ugs/game-client`.

```powershell
pnpm build                                  # turbo: build all
pnpm test                                   # turbo: test all
pnpm --filter @ugs/core test                # core unit tests (vitest run)
pnpm --filter @ugs/core exec tsc --noEmit   # core typecheck (guardrail)
pnpm --filter @ugs/game-client check        # svelte-check (guardrail)
pnpm --filter @ugs/game-client test:e2e     # Playwright e2e (builds first)
pnpm --filter @ugs/game-client dev          # vite dev server
```

## Git workflow

- Trunk-based: commit directly to `main`. Do not create a feature branch or PR
  for routine work unless explicitly asked (this overrides the default
  "branch first on the default branch" rule).

## Architecture

- **`packages/core`** (`@ugs/core`) — deterministic sim engine, no UI. Public API in
  `src/index.ts`. Domains: `adventurers/`, `combat/`, `quests/`, `divine/`,
  `relationships/`, `events/`, `world/`, `scenarios/`.
- **`apps/game-client`** (`@ugs/game-client`) — Svelte 5 + Pixi.js UI. E2E in `tests/`.
- **Determinism backbone:** `world/SimulationContext.ts` + `SeededRNG`. The loop drives
  **tick subscribers** (`SimulationLoop`), which are the authoritative write sites for
  side effects (milestones, DI bursts, `pendingShifts`, decision moments) — hence the
  "test through the subscriber" rule below.

---

## Project guardrails

**Package-specific guardrails live in each package's `CLAUDE.md`** and auto-load
when you work in that subtree:

- **`packages/core/CLAUDE.md`** — sim-engine rules: probability-shift testing,
  test-through-the-subscriber, no `Math.random()`, `createSimulationContext` seeds,
  roster-index arithmetic, decision-moment cooldown keys.
- **`apps/game-client/CLAUDE.md`** — UI rules: `tsc` + `svelte-check` gate, Svelte 5
  store pattern, `svelte.config.js` requirement, typed enum-label Records, the
  EventFeed three-update rule, no manual browser gates, auto-pause speed restore.

For a task that spans both packages, consult both files.

---

## Working from the Claude mobile app / web

This repo is set up for **Claude Code on the web** (claude.ai/code) — the same
backend the Claude mobile app uses. To send prompts against this repo remotely:
open the app or claude.ai/code → select `raafiq/the-unseen-hand` → start a
session and describe the change.

Each web/mobile session runs in a **fresh, ephemeral Linux container** (the repo
is cloned clean, no `node_modules`). The `.claude/hooks/session-start.sh`
SessionStart hook bootstraps it automatically — enabling pnpm `10.12.1`, running
`pnpm install --frozen-lockfile`, and building `@ugs/core` — so builds and tests
work from the first prompt. The hook is **cloud-only**: it early-exits unless
`CLAUDE_CODE_REMOTE_SESSION_ID` is set, so it no-ops on local devices (which
already have `node_modules` and may lack a bash interpreter on Windows). Node is pinned to `22` via `.nvmrc`. Commits push to a
working branch, and `.github/workflows/ci.yml` (typecheck, `svelte-check`, build,
test, and Playwright e2e) validates every push.

**Live preview from your phone:** `.github/workflows/preview.yml` builds the game
client and deploys it to **GitHub Pages** on every push — open
`https://raafiq.github.io/the-unseen-hand/` on any device to view the latest
pushed build (latest push wins; one-time repo setup: Settings → Pages → Source →
"GitHub Actions"). The Pages build sets `BASE_PATH=/the-unseen-hand/` so assets
resolve under the project-site subpath; local dev, `vite preview`, and e2e stay on
`/`. There is no live dev-server port-forwarding from cloud sessions — to *see* UI
changes mid-session, have Claude screenshot the app with Playwright (Chromium is
pre-provisioned).

**What does _not_ travel to web/mobile sessions:** only committed repo content is
cloned. Anything under your local `~/.claude/` — personal/global `CLAUDE.md`,
personal skills (e.g. specops), and personal commands — stays on your device and
is **absent** in web sessions. To use them from mobile they must be committed into
the repo (`.claude/skills/`, repo `CLAUDE.md`, etc.). The specops skill is
currently local-only (root references point at a `C:\Users\...` path); vendoring
it into the repo is tracked as follow-up work.

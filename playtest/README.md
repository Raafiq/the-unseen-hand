# Playtest — player-agent team

A repeatable playtest harness plus the team's findings. A small **team of player
personas** plays *The Unseen Hand* from the opening state through **Day 5**, then reports
feedback and bugs. Because the world is deterministic (fixed scenario + seed), every
player sees the same Day 0→5; the personas differ in *what they notice and want*.

## Contents

| File | What it is |
|---|---|
| `record-playthrough.mjs` | Playwright harness. Builds nothing itself — previews the current `dist` and drives **Proceed** through Day 5, capturing per-cycle narrative, the raw event ledger, roster snapshots, screenshots, and every console / page error. |
| `day5-transcript.json` | Committed evidence snapshot from one recorded run (the ground truth the report cites). |
| `day5-report.md` | The consolidated team report — four player personas + a verified, ranked bug list and known-bug status. |
| `out/` | Regenerated artifacts (transcript + `shots/`). Git-ignored. |

## Reproduce

```bash
pnpm --filter @ugs/game-client build      # produce a fresh dist to preview
node playtest/record-playthrough.mjs      # writes playtest/out/transcript.json + shots/
```

Env knobs: `PORT` (default 4188), `OUTDIR` (default `playtest/out`), `TARGET_DAY`
(default 5), `CHROMIUM_PATH` (auto-detected under `/opt/pw-browsers`, else Playwright's
default), `CLIENT_DIR`.

## The team

- **Vera** — QA bug-hunter (breaks games; code-verifies every defect).
- **Marcus** — narrative-immersion reader (Football Manager / Persona / Dwarf Fortress).
- **Priya** — first-time casual player (skims; needs to be told what to do).
- **Dev** — systems/strategy player (RimWorld / CK3; hunts for legible knobs).

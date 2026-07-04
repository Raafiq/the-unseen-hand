---
status: planned
depends: [p15b-cycle-narrative-engine]
specs:
  - specs/behaviors/llm-narrator.md
  - specs/behaviors/cycle-narrative.md
  - specs/behaviors/narrative-voice.md
issues: []
---

# Plan: P15c — Cycle LLM tier (per-character chapters + overview)

> Layers the LLM set-piece onto the deterministic chapters from P15b. Retargets the former
> end-of-day summary into a **per-cycle** batch: one overview prompt + one chapter prompt per
> eventful character, fired at each cycle boundary. Fully additive and degrades to the template
> tier — no key, an error, or a timeout leaves a coherent read.

## Scope

**In scope:**
- **Retarget the narrator** (`apps/game-client/src/lib/narrator.ts` → cycle-aware, or fold into
  `cycleNarrative.ts`): fire on the cycle digest returned by `PROCEED`, not on the day tick.
- **Batched prompts**: one **cycle-overview** prompt + one **per-character chapter** prompt per
  adventurer with meaningful cycle events. At most `rosterSize + 1` calls per `PROCEED`.
- **Prompt shape**: reuse the established narrator voice/system prompt; user prompt carries that
  character's cycle events (`[{type, text, involved}]`), personality axes, mood, key relationships.
- **Replace-on-arrival**: the LLM passage replaces that character's (or the overview's) template
  passage in `cycleChapters` when it resolves; until then the template passage shows.
- **Degraded mode / errors / timeout**: no key → template only, no error surfaced; API error or
  >10s timeout → template passage remains; never blocks `PROCEED`.

**Out of scope:**
- The reader UI (P15d) — this plan only feeds `cycleChapters`.
- Any change to the deterministic replay record (LLM output stays outside it).

## Implements

- `specs/behaviors/llm-narrator.md` — the per-cycle trigger, prompt shape, degraded mode, error/
  timeout handling, and token budget (now applied per cycle).
- `specs/behaviors/cycle-narrative.md` — the LLM tier and its replace-on-arrival + determinism-
  boundary rules.
- `specs/behaviors/narrative-voice.md` — the cycle set-piece (bounded batch, not per event).

## Approach

Because the world is halted between cycles, the async calls have a natural home: nothing is
ticking while they're in flight, so the player reads the template passages immediately and each
LLM passage swaps in when it lands, with no simulation coupling. The batch is bounded by roster
size at a player-paced boundary — the exact property that makes this affordable where the
rejected per-event call was not. Reuse of the existing narrator prompt/voice keeps the LLM layer a
thin retarget rather than a new subsystem.

## Validation

- [ ] With `CLAUDE_API_KEY` set: after a `PROCEED`, each eventful character's template passage is
      replaced by an LLM passage once it resolves; the overview likewise.
- [ ] Without a key: chapters are template-only, no error, no placeholder (identical to P15b output).
- [ ] API error / >10s timeout: the template passage remains; `PROCEED` never blocks.
- [ ] Calls are batched: ≤ `rosterSize + 1` per `PROCEED` (assert call count), never per event.
- [ ] A replay with the API absent is mechanically identical to one with it present (only prose
      artifacts differ).
- [ ] `pnpm --filter @ugs/game-client check` green.

## Risks / unknowns

- Latency of `rosterSize` parallel calls at a boundary — confirm concurrency/rate-limit handling is
  acceptable; consider a cap or sequential fallback if a large roster stalls.
- Model/token budget per chapter vs. the old single day summary — validate cost against the
  ~800–1500 token/day baseline now that it is per character per cycle.

## Notes

(populated at closeout)

## Follow-ups

(populated at closeout)

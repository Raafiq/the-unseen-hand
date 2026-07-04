# Behavior: LLM Narrator Layer

> **Status note (events redesign):** the day-summary narrator is **retained** as one of the
> LLM *set-pieces* defined in `behaviors/narrative-voice.md`. An earlier draft of
> `behaviors/social-system.md` claimed to supersede this layer (replacing it with per-character
> card persistence); that direction was **rejected**. The day summary stays; this spec is the
> authoritative definition of it.

> **Status note (cycle redesign, 2026-07-04):** the day-level summary is **generalised to a
> per-cycle read**. It now fires at each *cycle* boundary (not once per day) and produces the
> **cycle overview** plus the **per-character chapters** whose composition, POV rules, and
> determinism boundary live in `behaviors/cycle-narrative.md`. This file remains the
> authoritative definition of the LLM narrator's **voice, prompt shape, degraded mode, error
> handling, and token budget** — now applied per cycle. Where this file says "day", read
> "cycle" unless a passage is explicitly about the day-level rollup.

## Rule

At the end of each in-game day, the simulation collects that day's events and passes structured context to the Claude API to generate a 2–3 sentence narrative paragraph. The paragraph is inserted as a "day summary" block at the top of that day's event feed entries. The LLM layer is entirely additive — if no API key is present, no summary is generated and the template-rendered event feed remains fully functional.

The day summary is one of exactly three LLM **set-pieces** (with decision-moment situation
text and quest-climax dramatisation; see `behaviors/narrative-voice.md`). Like the others, it
is additive, async, and outside the deterministic replay record — it never feeds back into
simulation state, and the high-frequency feed is rendered entirely by the deterministic
template grammar, not the LLM.

## Applies To

- `packages/core/src/events/LLMNarrator.ts` (or `apps/game-client/src/lib/narrator.ts` if kept client-side)
- `screens/event-feed.md` (day summary block display)

## Details

### Trigger

At each **cycle boundary** — after a `PROCEED` resolves (see `behaviors/world-clock.md`), using the returned cycle digest — if `CLAUDE_API_KEY` is set in the environment:
- Collect the `SimulationEvent` entries for the just-completed cycle (the digest's `[fromTick, toTick]` range).
- Collect current adventurer states, personality axes, and active relationship edges.
- Build the narrator prompts (see below): one **cycle overview** prompt, plus one **per-character chapter** prompt per adventurer with meaningful cycle events (`behaviors/cycle-narrative.md`).
- Call the Claude API asynchronously. Because the world is halted between cycles, nothing is "ticking" while calls are in flight; the player may read the template-tier passages immediately and the LLM passages replace them as they arrive.
- When a response arrives, replace that character's (or the overview's) template passage in the reader.

The reads are generated asynchronously and never block `PROCEED`. Calls are **batched per cycle** (at most `rosterSize + 1`), never per event.

### Prompt structure

System prompt establishes the narrator's voice:
> "You are the voice of fate watching over a guild of adventurers. You write short, evocative prose summaries of a day's events — capturing the emotional truth of what happened, not just listing facts. Two to three sentences. No direct speech. Present tense. Tone: melancholy, watchful, occasionally darkly wry."

User prompt includes:
- The in-game date.
- The day's events as structured context: `[{type, text, involved}]` — a JSON list of rendered events.
- Current adventurer roster snapshot: name, state, mood, top 3 mood factors, personality axes (compact), key relationships.
- Any active decision moments that arose or resolved that day.

### Response handling

- Expected response: 2–3 sentences of prose. No headers, no bullet points.
- On success: insert as a `DaySummaryBlock` at the top of the day's event feed section.
- On API error (rate limit, network failure, malformed response): log a warning; display no summary. Do not retry automatically — retry on the next day's tick if the API becomes available.
- On timeout (> 10 seconds): treat as API error. Do not block.

### `DaySummaryBlock` display

Rendered in the event feed above that day's event entries:
- Visual distinction: slightly different background color or a left border rule.
- Label: "Day {day} — Fate's Record" (or similar) in small caps above the prose.
- Prose text: the LLM response, rendered as a paragraph.
- No interactive elements on the block.

### Degraded mode (no API key)

- No `DaySummaryBlock` is inserted.
- The event feed looks exactly the same as it does in Phase 2 — template-rendered events only.
- No error message, no placeholder, no "narrator unavailable" text. Absence is invisible.

### Token budget

Approximate context size per day prompt: ~800–1500 tokens depending on event density. Claude Haiku or Sonnet is appropriate; Opus is overkill for this task.

## Validation

- With API key set: a day summary block appears above the first event of each new in-game day in the event feed.
- Without API key: no summary block appears; no error is shown; event feed is otherwise identical.
- API timeout (>10s): simulation continues uninterrupted; no summary for that day; next day retries.
- Summary text is 2–3 sentences; no bullet points, no headers.

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the LLM narrator enriches the feed but does not replace it. Templates are the load-bearing narrative layer. The narrator is garnish.
- [Headless correctness first](../principles.md#headless-correctness-first-visual-representation-second) — the simulation runs correctly in the absence of the narrator. The narrator has no ability to affect simulation state — it is read-only prose generation.

# Behavior: LLM Narrator Layer

> **Status note (events redesign):** the day-summary narrator is **retained** as one of the
> LLM *set-pieces* defined in `behaviors/narrative-voice.md`. An earlier draft of
> `behaviors/social-system.md` claimed to supersede this layer (replacing it with per-character
> card persistence); that direction was **rejected**. The day summary stays; this spec is the
> authoritative definition of it.

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

At each day tick (tick where `worldTime.hour === 0`), after all tick subscribers have run, if `CLAUDE_API_KEY` is set in the environment:
- Collect all `SimulationEvent` entries from the previous day (ticks `day * 24 - 24` through `day * 24 - 1`).
- Collect current adventurer states, personality axes, and active relationship edges.
- Build the narrator prompt (see below).
- Call the Claude API asynchronously. The simulation continues ticking while the API call is in flight.
- When the response arrives, insert the day summary block into the event feed.

The day summary is generated asynchronously and does not block simulation advancement.

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

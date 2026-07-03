# Behavior: Narrative Voice

## Rule

Every event's `renderedText` is composed at emission time by a **deterministic template
grammar** — a subject + beat + colour assembly drawn from per-family fragment pools via
`ctx.rng`. This grammar is the load-bearing narrative layer for the high-frequency event
feed. The LLM is reserved for a small, enumerated set of **set-pieces** (decision moments,
quest climaxes, the end-of-day summary) and never renders ordinary feed lines. No event
in `packages/core` calls an LLM to produce its `renderedText`; the grammar always produces
a complete sentence offline, and the same seed + state always produces the same text.

## Applies To

- `packages/core/src/events/eventBus.ts` — `renderText()` (the grammar lives here; today it
  emits flat one-liners that this spec lifts to fragment composition)
- `packages/core/src/events/activitySystem.ts` — `MICRO_TEMPLATES` (the existing
  variant-pool quality bar this grammar generalises)
- `packages/core/src/events/socialResolver.ts` — social outcome line composition
- `apps/game-client/src/lib/narrator.ts` — the LLM set-piece tier (day summary today; see
  `behaviors/llm-narrator.md`)
- `specs/behaviors/event-bus.md` — `renderedText` is "template-rendered, never empty"; this
  spec defines *how* that rendering is composed
- `specs/behaviors/social-system.md` §6 — social-encounter text uses this grammar
- `specs/behaviors/llm-narrator.md` — the set-piece tier boundary

## Details

### Two tiers, one feed

| Tier | Who renders | When | Determinism |
|---|---|---|---|
| **Grammar** (default) | `ctx.rng` + fragment pools, in `packages/core` | Every emitted event | Seeded — replayable |
| **Set-piece** (LLM) | Claude API, client-side | Only the enumerated set-pieces below | Non-deterministic, async, additive |

The grammar is authoritative. A set-piece **enriches** the feed (adds a summary block,
narrates a climax) but never replaces a grammar line and never feeds back into simulation
state. If the LLM is absent or errors, the feed is fully intact (see
`behaviors/llm-narrator.md` degraded mode).

### The template grammar

Each grammar line is composed from up to three slots:

```
renderedText = subject + beat + colour
```

- **subject** — who/what the line is about: a name, a name pair, an NPC name or bare role,
  a region, "the guild", "the quest board". Resolved from the event's participant/region
  fields.
- **beat** — the core action or state change for this event subtype. Drawn from a
  **beat pool** keyed by `(kind, subtype)` — multiple phrasings per beat, so repeated events
  of the same subtype do not read identically.
- **colour** — an optional flavour fragment appended for texture (a sensory detail, a time-of-day
  phrase, a mood tint). Drawn from a **colour pool** that may be keyed by subtype, by the
  participants' mood band, or by an active world-event span (e.g. storm colour while a STORM
  span is active). Colour is omitted on a fraction of lines so the feed is not uniformly ornate.
  - **Span-tint scope.** A span tint represents the *guild-town region's* ambient weather/mood,
    so it only decorates **guild-local** lines. Two families never receive it: `WORLD` (the span
    announcement narrates itself and must not be self-tinted) and `COMBAT` (the away-quest fight
    report happens out in a dungeon, not the tinted town region — a live `FESTIVAL` must not append
    "laughter spills through the streets" to a `BEAT_LOG` line about a bloodied party trudging home).

Each pool is a `readonly string[]` (or a small keyed `Record`). Selection for **emitted
events** is via `ctx.rng` — never `Math.random()`. One carve-out exists: **on-demand thought
renders** (`thought-system.md`) select via a derived read-only stream hashed from
`(worldSeed, actorId, tick)`, precisely so UI reads can never perturb the replayable record;
`THOUGHT` whispers roll *whether* on `ctx.rng` but render their text through that same derived
stream. Name/region slots are filled by interpolation (`{a}`, `{b}`, `{subject}`, `{region}`);
a rendered line never leaves an unfilled slot.

> Flat (today): `"${a} and ${b} clash in a heated argument."`
> Grammar: subject `"{a} and {b}"` + beat (one of `["clash over {topic}", "trade sharp
> words", "let an old grievance boil over"]`) + colour (one of `["the table goes
> quiet around them", "neither backs down", ""]`).

### Pool coverage

Every `(kind, subtype)` that reaches the feed has a beat pool of **≥ 3 variants**. Families:

- **Social outcomes** — the six outcomes (`BANTER`, `SOLIDARITY`, `BREAKTHROUGH`,
  `SILENT_DISTANCE`, `ARGUMENT`, `ESTRANGEMENT`); see `behaviors/social-system.md` §5.
- **Micro-events** — per-activity beats; already realised as `MICRO_TEMPLATES` and the
  reference quality bar (`activitySystem.ts`).
- **Quest** — `STARTED` / `COMPLETED` / `FAILED` / `EXPIRED` / `DROUGHT`.
- **Lifecycle** — deaths, departures, the relationship threshold events, goal milestones.
- **World** — flavour and span START/END lines (see `behaviors/world-expansion.md`).
- **NPC** — interactions with notable and nameless town NPCs (see `behaviors/npc-system.md`).
- **Thought** — inner-monologue whispers; pools live in `packages/core/src/thoughts/`, not
  `eventBus.ts`, and compose `stance + subject + inflection? + hook?` rather than
  `subject + beat + colour` (see `behaviors/thought-system.md`).

The outcome label itself (`ARGUMENT`, `ESTRANGEMENT`, …) is **never** surfaced in the text —
only the rendered prose (see `principles.md#every-outcome-has-a-narrative-cause`).

### The set-piece tier (LLM)

The LLM renders **only** these, and only as enrichment:

1. **End-of-day summary** — the editorial paragraph at the top of each day's feed section
   (`behaviors/llm-narrator.md`).
2. **Decision-moment situation text** — optional richer framing of a decision card's
   `situationText` (see `behaviors/decision-moments.md`); the deterministic grammar provides
   the fallback so the card is always legible.
3. **Quest climax** — an optional one-paragraph dramatisation of a resolved quest's combat
   beats, shown in the combat replay; the grammar's `COMBAT` lines remain the fallback.

This list is exhaustive. Anything not on it is grammar-rendered. There is **no per-event LLM
call** and **no per-social-scene LLM call** — that path is explicitly rejected (cost, latency,
and it would break feed replay determinism).

### Determinism contract

- Grammar rendering is a pure function of `(event input, ctx.rng state)`. Re-running a seed
  reproduces every feed line exactly.
- Set-piece LLM output is **not** part of the replayable record. It is generated async,
  attached to the feed when it arrives, and never read back by any simulation subscriber.
  A replay with the API absent is mechanically identical to one with it present.

## Validation

- Every `(kind, subtype)` reaching the feed has a beat pool of ≥ 3 variants (asserted by a
  coverage test over the event-type union).
- Two events of the same subtype in one run do not always produce identical text (statistical
  check over a seeded run).
- A rendered line never contains an unfilled slot token (`{a}`, `{subject}`, …).
- Re-running a fixed seed reproduces the full feed text byte-for-byte (set-pieces excluded).
- No module in `packages/core` issues an LLM/network call inside `renderText` or any
  subscriber (grep: no fetch/Anthropic import under `packages/core/src/events/`).
- With the API key absent, the feed text is identical to an API-present run except for the
  three set-piece artifacts.

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the grammar is
  the load-bearing layer that makes this true offline. The LLM is garnish on top, never the
  substrate.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) —
  the grammar guarantees a complete, non-empty sentence for every event without depending on a
  network call. Outcome labels never leak into the prose.
- [Seeded determinism](../principles.md#seeded-determinism) — fragment selection flows through
  `ctx.rng`; the feed is replayable. LLM set-pieces sit outside the deterministic record by
  design.

**Local:**
- **Templates are load-bearing; the LLM is a set-piece spotlight, not the stage lighting.**
  The high-frequency feed must be vivid on templates alone. The LLM is spent only where a
  single, deliberate, lower-frequency moment earns the cost and latency — and even there it is
  additive, with a deterministic fallback. A design that routes ordinary feed lines through the
  LLM is wrong in this project, regardless of how good the prose is.

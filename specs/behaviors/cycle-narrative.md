# Behavior: Cycle Narrative (Per-Character Reads)

## Rule

When a cycle completes (a `PROCEED` resolves — see `behaviors/world-clock.md`), the events of that cycle are composed into **per-character chapters**: for each adventurer who had a meaningful event during the cycle, a short prose passage telling *their* story of that morning / afternoon / night. These chapters are the player's primary reading surface between cycles. A chapter is a **presentation layer over the deterministic event log** — it reorganises and narrates events that already happened; it never generates new simulation state and is never read back by any subscriber.

Chapters are produced in two tiers (**hybrid**): a rich **LLM** passage when an API key is present, and a **deterministic template composition** otherwise. The reading experience degrades gracefully — with no key, the player still gets a coherent multi-sentence chapter assembled from the cycle's grammar lines (the Wildermyth model: authored fragments + character data, no AI).

## Applies To

- `apps/game-client/src/lib/cycleNarrative.ts` (composition + LLM tier; client-side, like the day-summary narrator)
- `packages/core/src/events/` — the event log and grammar lines that are the deterministic substrate (read-only input)
- `screens/event-feed.md` — the surface that presents chapters
- `screens/app-shell.md` — the roster dock is the chapter selector
- `behaviors/narrative-voice.md` — the chapter LLM pass is a **set-piece**; the template tier reuses the grammar
- `behaviors/llm-narrator.md` — the per-cycle overview generalises the former day summary
- `behaviors/world-clock.md` — the cycle digest is the composition input
- `behaviors/character-detail.md` — the chapter supersedes the ad-hoc "Last Day Events" recap for the current cycle

## Details

### Input: the cycle digest

Composition consumes the digest returned by `PROCEED` (`{ fromTick, toTick, day, cycle }`) plus the `eventLog` slice for that tick range and the current adventurer/relationship snapshot. It never advances or mutates simulation state.

### What belongs in a character's chapter

An event belongs to adventurer A's chapter for the cycle if A is among its resolved involved ids (`getInvolvedIds` — the same resolution the feed uses, including a `THOUGHT` event's `actorId`). Selection rules:

- **Meaningful events only.** The chapter narrates events at or above the feed's significance bar for that character (combat beats they were in, social outcomes, relationship driver events, lifecycle events, quest outcomes, notable NPC encounters, and their own surfaced thoughts). Pure ambient world flavour with no personal involvement is excluded.
- **A chapter is per (character, cycle).** Its events are exactly those in `[fromTick, toTick]` involving that character.
- **Empty chapters are omitted.** A character with no meaningful cycle events has no chapter — no placeholder, no "a quiet morning" filler unless the template tier deliberately renders a quiet-beat line (see below).

### Shared encounters are POV-shaded, not deduplicated

When an event involves two or more adventurers (Kara and Mira argue; a party fights together), it appears in **each** participant's chapter, told from **that** character's point of view. The same underlying event yields a Kara-centred sentence in Kara's chapter and a Mira-centred sentence in Mira's. The event is one deterministic record; the two renderings are two presentations of it. This is intentional — a shared moment is part of both characters' stories.

### Two generation tiers (hybrid)

| Tier | Renderer | When | Determinism |
|---|---|---|---|
| **Template** (default/fallback) | Deterministic composition over the cycle's grammar lines, client-side | Always available; the sole tier when no API key | Reproducible from the event log |
| **LLM** (set-piece) | Claude API, per character per cycle | Only when an API key is present | Non-deterministic, async, additive |

**Template tier.** Composes the character's already-rendered grammar sentences (`renderedText`) for the cycle into a passage: an opening beat keyed by cycle (`MORNING`/`AFTERNOON`/`NIGHT`) and mood band, the significant event sentences in chronological order, and an optional closing colour fragment. This is a richer, multi-sentence generalisation of the character-detail "Last Day Events" list — same source data, passage form. It reuses the `behaviors/narrative-voice.md` fragment pools and selects via a **derived read-only stream** hashed from `(worldSeed, actorId, fromTick)`, exactly like on-demand thought renders, so composing (or re-composing) a chapter can never perturb the replayable record.

**LLM tier.** A **new set-piece** in `behaviors/narrative-voice.md`'s enumerated list. Batched: one prompt per character per cycle (bounded — at most `rosterSize` calls per `PROCEED`, not per event). The prompt carries that character's cycle events as structured context (the same `[{type, text, involved}]` shape the day-summary narrator uses), their personality axes, mood, and key relationships, and asks for a short first-or-close-third-person passage in the established narrator voice. The LLM passage **replaces the template passage in the reading UI when it arrives**, but the template passage is what renders until then and whenever the LLM is absent or errors.

### The cycle overview (generalises the day summary)

Alongside the per-character chapters, each cycle may carry one short **cycle overview** — a 1–2 sentence establishing paragraph for the whole guild that cycle (weather/world spans, the shape of the day). This is the direct descendant of the former end-of-day summary (`behaviors/llm-narrator.md`): same set-piece status, now per-cycle rather than per-day, and framing rather than the main read. It follows the same tiers (LLM when keyed, template otherwise) and the same additive/degraded rules.

### Determinism boundary (non-negotiable)

- The **event log is the source of truth** and is fully deterministic (`principles.md#seeded-determinism`). Re-running a seed reproduces every event and every grammar line byte-for-byte.
- **Template-tier chapters** are a pure function of `(cycle digest, event log, derived stream)` — reproducible, but they are a *view*, not part of simulation state.
- **LLM-tier chapters and the cycle overview** are outside the replayable record entirely — async, attached when they arrive, never read back by any subscriber. A replay with the API absent is mechanically identical to one with it present (only the prose artifacts differ).
- No module in `packages/core` issues an LLM/network call to build a chapter. Composition lives in the client layer.

### Reading is optional

Chapters are an invitation, never a gate. The player may read every chapter, one, or none, then `PROCEED`. Nothing about advancement depends on whether chapters were opened (`principles.md#autonomy-of-outcomes-player-controlled-tempo`). Unread chapters do not block, queue, or accumulate penalties; they simply scroll into history with the raw log.

### Length and voice

- Template chapter: typically 2–4 sentences; scales modestly with how eventful the cycle was for that character, capped so it stays a *read*, not a report.
- LLM chapter: 2–4 sentences, established narrator voice (`behaviors/llm-narrator.md` system voice), present or intimate past tense, no invented facts beyond the supplied events.
- The chapter never surfaces raw outcome labels (`ARGUMENT`, `ESTRANGEMENT`, …) or debug strings — only prose (`principles.md#every-outcome-has-a-narrative-cause`).

## Validation

- After a `PROCEED`, each adventurer with ≥ 1 meaningful cycle event has exactly one chapter; adventurers with none have zero chapters.
- A two-participant event appears in both participants' chapters, rendered from each POV; it is one event in the log.
- With no API key: every chapter is a complete, non-empty multi-sentence passage composed from the cycle's grammar lines; no error, no placeholder, no empty chapter for an eventful character.
- With an API key: the LLM passage replaces the template passage once it resolves; before it resolves the template passage is shown; on API error/timeout the template passage remains.
- Re-composing a template chapter for a fixed seed + tick range yields identical text (derived-stream determinism); doing so does not alter `eventLog` or any simulation state.
- No `packages/core` module issues a network call during chapter composition (grep: no fetch/Anthropic import in the composition path under `packages/core`).
- A chapter contains no unfilled slot tokens and no raw outcome-label strings.

## Principles

**Inherited:**
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — the reads are the primary interface now; they must be vivid on templates alone, with the LLM as garnish. The raw feed survives beneath as the audit trail (`screens/event-feed.md`).
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) — a chapter is exactly the causal story of a character's cycle, drawn from their events; it must read as cause-and-effect, never a stat dump.
- [Seeded determinism](../principles.md#seeded-determinism) — the substrate is deterministic; template chapters render through a derived read-only stream; LLM chapters sit outside the replay record by design.
- [Autonomy of outcomes; player-controlled tempo](../principles.md#autonomy-of-outcomes-player-controlled-tempo) — reading is optional and never gates `PROCEED`; the pause between cycles is the reading window.

**Local:**
- **A shared moment belongs to everyone who lived it.** Shared encounters are POV-shaded into each participant's chapter rather than deduplicated to one "owner". The cost (the same event narrated twice) is the point — each character's story is complete on its own.
- **Templates carry the read; the LLM enriches it.** Mirrors `narrative-voice.md`: the chapter must be a satisfying read with zero API calls. The LLM raises the ceiling on a bounded, per-cycle batch — it is never the floor, and never the thing that makes a chapter legible.

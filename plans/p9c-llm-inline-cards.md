---
status: cancelled
depends: [p9b-social-escalation]
specs:
  - specs/behaviors/social-system.md
  - specs/screens/character-detail.md
---

> **CANCELLED — direction rejected in the Events Redesign (2026-06-30).** Per-scene inline LLM
> generation and the per-character `CharacterContextCard` memory layer are not built. The
> high-frequency feed is rendered by the deterministic template grammar
> (`p10a-narrative-voice`), and the day-summary narrator (`llm-narrator.md`) is **retained**
> rather than deleted. The "Last Day Events" panel section now reads the deterministic
> event/history record instead of a card (`screens/character-detail.md`). See
> `behaviors/narrative-voice.md`.

# Plan: P9c — LLM Inline Generation & Character Card Persistence

## Scope

Implement character context cards, batched LLM generation for social event text, card persistence at end of day, and the "Last Day Events" section in the character detail panel. Remove the old editorial day-summary narrator layer.

**In scope:**
- `CharacterContextCard` type + generation function
- LLM batch queue: 5-item cap, 30-minute flush timer
- Inline generation prompt (system + batch user prompt)
- API call via Anthropic SDK (`claude-haiku-4-5` default, `VITE_CLAUDE_INLINE_MODEL` override)
- Fallback to pre-written templates on timeout (>8s) or API error
- Card persistence: end-of-day update of `recent` field from significant events
- Adventurer carries `contextCard: CharacterContextCard` in `SimulationContext`
- "Last Day Events" section in `CharacterDetail.svelte`
- Removal of `getDayEvents` / `buildNarratorPrompt` / `DaySummaryBlock` from old narrator
- E2E test for card contents updating across a simulated day boundary

**Out of scope:**
- Activity system (P9a) and escalation (P9b) — both must be done
- UI inspection of the full character card (deferred — no plan yet; only `recent` is visible)
- Voice tag authoring for existing adventurers (initial cards use a derived 3-word tag from personality axes; manual curation is future work)

## Implements

- `specs/behaviors/social-system.md` §6 (LLM event text generation), §7 (Character card persistence), §8 (Relationship to existing LLM narrator)
- `specs/screens/character-detail.md` — "Last Day Events" section

## Approach

### 1. Types (`packages/core/src/world/types.ts`)

```typescript
interface CharacterContextCard {
  adventurerId: AdventurerId
  voiceTag: string          // 3-word derived tag, e.g. "terse / stubborn / haunted"
  personalitySnapshot: string  // top-2 axes as adjective pairs
  moodLabel: 'CONTENT' | 'NEUTRAL' | 'UNSATISFIED' | 'DESPAIRING'
  keyRelationships: string  // up to 3 edges, prose, ≤ 60 chars
  recent: string            // up to 2 significant events from yesterday, prose
  updatedAtDay: number
}

// Extend Adventurer
interface Adventurer {
  // ...existing fields
  contextCard: CharacterContextCard
}
```

### 2. Card generation (`packages/core/src/events/LLMNarrator.ts` — repurposed)

```typescript
function generateContextCard(adventurer: Adventurer, ctx: SimulationContext): CharacterContextCard
```

- `voiceTag`: derived from personality axis profile via a small lookup table (e.g. courage ≥ 70 → "bold", empathy ≥ 70 → "warm", stubborn ≥ 70 → "stubborn" etc.; pick top 3 traits; fallback "measured / private / watchful").
- `personalitySnapshot`: top 2 axes by value, rendered as `"{high_trait} / {mid_trait}"`.
- `moodLabel`: from current mood threshold.
- `keyRelationships`: top 3 edges by `|strength|`, rendered as `"{name}: {type} ({oneWord})"`. Max 60 chars total; truncate to 2 if needed.
- `recent`: empty string initially; populated by end-of-day persistence.

Cards are generated at world initialisation for all adventurers and stored on the adventurer object.

### 3. Batch queue (`packages/core/src/events/LLMNarrator.ts`)

```typescript
interface InlineGenerationRequest {
  encounterRef: string     // event id to fill
  participants: CharacterContextCard[]
  outcome: SocialOutcomeType
  activityContext: string  // e.g. "both drinking at the bar"
  isMicroEvent: boolean
}
```

- `BatchQueue` accumulates requests. Flushes when `queue.length >= 5` OR `30 sim-minutes since first enqueue`.
- `flushBatch(queue, ctx)` — builds the prompt, calls the API, fills `renderedText` on each pending event. On timeout (>8s) or error: leave `renderedText` as the fallback template string already set by P9b; log warning; do not throw.

### 4. Prompt construction

```typescript
function buildInlineBatchPrompt(requests: InlineGenerationRequest[]): { system: string; user: string }
```

System prompt (once per batch, deduped character cards):
```
You write short, vivid scene lines for a fantasy guild simulation.
Each line is 1–2 sentences. Show, don't tell. No outcome labels or stat names.
Character voices must be distinct. Present tense.

Characters:
[Bran — terse, stubborn, haunted | Mira — warm, pragmatic | ...]
```

User prompt (one item per request, numbered):
```
[1] Characters: Bran, Mira. Activity: both drinking at the bar. Outcome: SOLIDARITY.
    Bran mood: UNSATISFIED. Mira mood: NEUTRAL. Relationship: growing trust.
[2] ...
```

Expected response: `[1] <line>\n[2] <line>\n...` — parse by item index.

### 5. Card persistence (`packages/core/src/events/LLMNarrator.ts`)

New `cardPersistenceSubscriber` fires at each day tick (hour === 0), after all other subscribers:

1. Collect previous day's `SocialEvent[]` for each adventurer.
2. Identify significant events: BREAKTHROUGH, ESTRANGEMENT, SOLIDARITY (if rel crossed type boundary), ARGUMENT (if rel crossed boundary), quest outcomes, ally deaths.
3. For each adventurer: update `contextCard.recent` with the prose of up to 2 most significant events; update `contextCard.moodLabel`; update `contextCard.updatedAtDay`.
4. No API call — persistence uses already-generated `renderedText` strings.

Register `cardPersistenceSubscriber` at position 15 in `SimulationLoop` (after `worldExpansionSubscriber`).

### 6. Remove old narrator layer

- Delete `getDayEvents`, `buildNarratorPrompt` from `LLMNarrator.ts`.
- Remove `DaySummaryBlock` from `EventFeed.svelte`.
- Remove `fetchDaySummary` from `apps/game-client/src/lib/narrator.ts` (or archive the file — the narrator.ts E2E test in `narrator.spec.ts` will need updating or removal).
- Update `specs/behaviors/llm-narrator.md` header to note it is superseded by `social-system.md`.

### 7. CharacterDetail.svelte — Last Day Events section

Between the History section and Divine Touch:

```svelte
{#if adventurer.contextCard.recent}
  <section class="last-day-events">
    <h3>Yesterday</h3>
    <p>{adventurer.contextCard.recent}</p>
  </section>
{/if}
```

Hidden entirely if `recent` is empty string.

### 8. Tests (TDD)

- `llm-narrator.test.ts` — new tests for card generation, batch prompt shape, card persistence.
- Token count utility: verify generated card ≤ 200 tokens (use `countTokens` from Anthropic SDK or a tiktoken approximation in tests).
- Playwright E2E: tick simulation through a day boundary with a SOLIDARITY outcome; assert "Last Day Events" section appears in CharacterDetail with non-empty text.

## Validation

- [ ] `CharacterContextCard` generated at world init for all adventurers; stored on each `Adventurer`.
- [ ] Character card token count ≤ 200 (measured in test; not a runtime check).
- [ ] Batch flushes when queue reaches 5 items (mock clock).
- [ ] Batch flushes when 30 sim-minutes elapse since first queued item (mock clock).
- [ ] API timeout (>8s): `renderedText` stays as fallback template; no error shown; no throw.
- [ ] After a day boundary tick with a SOLIDARITY outcome that crossed a relationship type boundary: the adventurer's `contextCard.recent` contains a non-empty string.
- [ ] "Last Day Events" section visible in CharacterDetail when `recent` is non-empty; hidden when empty.
- [ ] `DaySummaryBlock` no longer rendered in EventFeed.
- [ ] `narrator.spec.ts` E2E test updated or removed (no longer tests day-summary; updated to test card persistence or removed entirely).
- [ ] `tsc --noEmit` and `svelte-check` both pass with zero errors.
- [ ] All Vitest tests pass; remaining Playwright E2E tests pass.

## Risks / unknowns

- **Anthropic SDK in `packages/core/`** — the existing `LLMNarrator.ts` makes API calls from the client (`apps/game-client/src/lib/narrator.ts`). Inline generation needs to fire during simulation ticks, which run in `packages/core/`. Options: (a) keep API calls client-side and pass a callback into the subscriber, (b) move the batch queue to the client and feed it from a simulation event. Option (b) is cleaner (core stays pure); the subscriber emits a `SOCIAL_EVENT_TEXT_REQUESTED` event, the client picks it up and fires the API call. Decide at implementation time; document in Notes at closeout.
- **narrator.spec.ts removal** — this Playwright test verifies the `VITE_CLAUDE_API_KEY` path works. If we remove the day-summary layer, the test needs to be repurposed to test inline generation or card persistence. Verify what the test covers before deleting it.
- **`recent` field in card** — the card persistence uses `renderedText` from already-generated social events. If LLM generation failed (fallback used), `recent` will contain template text, not LLM prose. This is acceptable — the card reflects what happened, not how well it was narrated.
- **Token counting in tests** — Anthropic SDK token counting is async and requires an API key. Use a simple word-count proxy in unit tests (≤ 150 words ≈ ≤ 200 tokens) to keep tests offline-capable.

## Notes

(Populated at closeout.)

## Follow-ups

(Populated at closeout.)

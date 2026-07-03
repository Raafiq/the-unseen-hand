# Behavior: Thought System

## Rule

Every living actor — adventurer or notable (Tier A) NPC — has a **current thought**: a one-to-
three-sentence inner monologue composed by a **deterministic slot grammar** over state the
simulation already maintains (mood, episodic memory, derived beliefs, goal gaps or wants, recent
relationship motion). A thought is **rendered on demand** as a pure function that never consumes
`ctx.rng`; its randomness comes from a **derived stream** hashed from
`(worldSeed, actorId, tick)`, so the same actor at the same moment thinks the same thought
forever, and opening a UI panel can never perturb the simulation. Occasionally a thought
surfaces into the feed as a `THOUGHT` whisper, emitted by a tick subscriber that rolls on
`ctx.rng` like any other event system. Thought prose is grammar-only: there is **no LLM in this
system** — this deliberately honours the rejection of per-character LLM rendering
(`plans/p9c-llm-inline-cards.md`, cancelled) and stays inside the `narrative-voice.md`
set-piece boundary.

## Applies To

- `packages/core/src/thoughts/beliefs.ts` — `deriveBeliefs` (new)
- `packages/core/src/thoughts/thoughtGrammar.ts` — fragment pools + `renderThought` (new)
- `packages/core/src/thoughts/thoughtWhispers.ts` — `thoughtWhisperSubscriber` (new)
- `packages/core/src/world/types.ts` — `SimulationContext.worldSeed`, `ThoughtEvent`
- `packages/core/src/world/SimulationContext.ts` — `worldSeed` stored at creation
- `packages/core/src/world/SimulationLoop.ts` — whisper subscriber registered last
- `packages/core/src/events/eventBus.ts` — `THOUGHT` rendering path (pre-rendered text)
- `specs/behaviors/npc-system.md` — Tier A interiority (mood, history, want) the grammar reads
- `specs/behaviors/history-layer.md` — `HistoryEvent` salience feeds the subject slot
- `specs/behaviors/mood-system.md` — mood band + top factor feed the stance slot
- `specs/behaviors/relationship-graph.md` — edge strength/history feed beliefs and hooks
- `specs/behaviors/narrative-voice.md` — the grammar tier this system extends
- `specs/behaviors/event-bus.md` — `ThoughtEvent` kind
- `specs/screens/character-detail.md`, `specs/screens/choice-card.md`,
  `specs/screens/event-feed.md` — the three surfaces

## Details

### Two render paths, one grammar

| Path | Randomness source | `ctx.rng` consumed? | When |
|---|---|---|---|
| **On-demand render** (UI) | derived stream from `(worldSeed, actorId, tick)` | **Never** | Character detail, choice card |
| **Whisper emission** (subscriber) | `ctx.rng` decides *whether*; derived stream renders *what* | Yes (eligibility roll only) | Low-chance per actor per tick |

Because both paths render text through the same derived stream, a feed whisper at tick T for
actor A is **byte-identical** to what the detail panel would show for A at tick T. This
equality is a validation item.

### The derived stream

```typescript
const stream = new SeededRNG(`${ctx.worldSeed}:thought:${actorId}:${tick}`);
```

`SeededRNG`'s xmur3 seed hash already maps arbitrary strings to independent streams — the
constructor *is* the pure hash; no second randomness primitive is introduced. This requires
`worldSeed: string` on `SimulationContext` (see `data-model.md`): the world-gen seed, stored
read-only at creation, so read-only derived streams can be constructed without touching
`ctx.rng`.

### The slot grammar

```
thought = stance + subject + inflection? + hook?
```

- **stance** — emotional register opener, keyed by `moodThresholdLabel(mood)` (4 bands) and
  tinted by the sign/family of the actor's top mood factor.
- **subject** — the salient concern, drawn (derived-stream-weighted by salience) from
  candidates: the strongest **belief** about another actor; the heaviest recent **memory**
  (`history` entries, weight × recency); the **goal gap** (adventurers: `personalGoalProgress`
  milestones against the goal's requirement; NPCs: their static `want`).
- **inflection** — optional personality-register overlay, first match in fixed precedence:
  `stubborn ≥ 70` defiant → `empathy ≥ 60` wistful → `greed ≥ 70` acquisitive →
  `courage ≤ 30` fearful → `ambition ≥ 70` hungry; omitted if none match.
- **hook** — optional: the largest-|delta| `RelationshipEvent` on any of the actor's edges
  within the last 48 ticks, rendered as WARMED/COOLED phrasing; omitted if none.

Pool coverage matches the `narrative-voice.md` bar: every stance band, belief kind, memory
kind, goal, register, and hook direction has **≥ 3 fragment variants**, and a rendered thought
never contains an unfilled `{slot}` token. Belief/memory kind labels never surface in the
prose.

### Beliefs are derived, never stored

```typescript
type BeliefKind = 'TRUSTS' | 'DISTRUSTS' | 'ADMIRES' | 'RESENTS' | 'OWES' | 'FEARS';
type Belief = { aboutId: ActorId; kind: BeliefKind; conviction: number /* 0–1 */; sourceTick: number };
function deriveBeliefs(ctx: SimulationContext, actorId: ActorId): Belief[];
```

`deriveBeliefs` is a pure function over edge strength/type, the **tail** of
`RelationshipEdge.history` (scanned backwards with early exit at the window cutoff — never a
full-array pass), and the actor's own `history` (≤ 50 entries). It never reads `ctx.eventLog`.

| Kind | Derivation |
|---|---|
| TRUSTS | edge strength ≥ 40 |
| DISTRUSTS | edge strength ≤ −25, or `BETRAYED_BY` in actor history |
| RESENTS | ARGUMENT/ESTRANGEMENT edge-history entry within 14 days |
| ADMIRES | BREAKTHROUGH/SOLIDARITY edge-history entry within 14 days at strength ≥ 25 |
| OWES | `SAVED_BY` in actor history within 30 days |
| FEARS | edge strength ≤ −50 |

Conviction (0–1) derives from strength magnitude and recency.

### THOUGHT whispers

A new event kind (see `event-bus.md`):

```typescript
type ThoughtEvent = EventBase & {
  kind: 'THOUGHT';
  actorId: ActorId;      // the thinker — adventurer or Tier A NPC
  subjectKey: string;    // fragment-family id for anti-repetition; never rendered
};
```

- `thoughtWhisperSubscriber` rolls a low per-actor per-tick chance
  (`THOUGHT_WHISPER_CHANCE = 0.01`) on `ctx.rng` during whisper-eligible states: adventurers
  in the same town-eligible activities used by `npc-system.md` encounter eligibility; Tier A
  NPCs always eligible; DEAD/RETIRED/ON_QUEST actors never whisper.
- The subscriber is registered **last** in `SimulationLoop` (after `npcFlavourSubscriber`),
  for the same reason recorded there: it draws `ctx.rng` every tick, so it must not shift the
  intra-tick stream seen by earlier systems.
- Text is rendered through the derived stream and passed pre-rendered to `emitEvent` — keeping
  `emitEvent` the single append path while preserving whisper == panel byte-equality.
- **Anti-repetition:** each `ThoughtEvent` records its subject fragment family in
  `subjectKey`. The subscriber scans the **eventLog tail** (last ~50 entries, window 96 ticks)
  and suppresses subjects the actor whispered recently, when alternatives exist. No new
  cooldown state is added to `SimulationContext`.

### Surfaces

1. **Character detail — "Inner voice."** Adventurer and townsfolk detail views render the
   actor's current thought via the on-demand path.
2. **Feed whispers.** `THOUGHT` events appear in the event feed (muted/italic styling), filter
   to the thinker via `getInvolvedIds`, and follow the EventFeed three-update rule.
3. **Decision cards.** A decision moment's involved actors have their current thoughts shown
   on the card, rendered at display time (the loop auto-pauses while a card is up, so the tick
   — and therefore the text — is stable).

## Validation

- **RNG purity:** rendering N on-demand thoughts leaves the next `ctx.rng.next()` value
  identical to an untouched twin context built from the same seed.
- Same `(ctx, actorId)` → identical rendered text, every call.
- A whisper's `renderedText` equals `renderThought(...)` output for the same actor and tick.
- Re-running a fixed seed for 500 ticks twice produces a byte-identical `eventLog`,
  **including** THOUGHT lines.
- Every pool key has ≥ 3 variants (coverage test); no rendered thought contains an unfilled
  `{slot}` token across a 200-render sweep.
- A just-used `subjectKey` is suppressed on the actor's next whisper when alternatives exist.
- `subjectKey` and belief/memory kind labels never appear in rendered prose.
- DEAD/RETIRED/unknown actor ids render no thought (`undefined`) and never whisper.
- `deriveBeliefs` never reads `ctx.eventLog`; belief derivation is pure (identical inputs →
  identical output).
- No `Math.random()`, no network call anywhere in `packages/core/src/thoughts/`.

## Principles

**Inherited:**
- [Seeded determinism](../principles.md#seeded-determinism) — whisper timing flows through
  `ctx.rng`; thought text flows through a derived stream that is itself a pure function of the
  world seed. Both are replayable.
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) —
  every thought is assembled from real state (a memory, a belief, a goal, a relationship
  shift); nothing is decorative randomness.
- [The event feed is the game](../principles.md#the-event-feed-is-the-game) — whispers enrich
  the feed offline; no API, no key, no degradation.

**Local:**
- **The panel is a window, not a hand.** On-demand rendering must never advance simulation
  state — enforced mechanically by the derived stream. If a future surface needs thought text,
  it must use the same pure path; any design that draws `ctx.rng` at render time is wrong.
- **Minds are derived, not stored.** Beliefs, salience, and thought text are pure derivations
  over state the sim already keeps. The only new stored fields are `worldSeed` and the Tier A
  interiority granted by `npc-system.md`. Resist adding stored thought/belief state — derive it.
- **Grammar-only, by decision.** The cancelled `p9c-llm-inline-cards` precedent rejected
  per-character LLM memory and per-scene LLM calls; this system is deliberately outside that
  territory. An LLM "inner voice" set-piece, if ever wanted, would be a separate
  `narrative-voice.md` amendment layered on top of this grammar — never a replacement for it.

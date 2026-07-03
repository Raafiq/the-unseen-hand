# Behavior: Town NPC System

## Rule

The town around the guild is populated by NPCs in **two tiers**. **Tier A — notable NPCs** are
named, persistent characters (the blacksmith, the guard captain, the innkeeper) with a small
identity record and real relationships: their ids live in the adventurer relationship graph, so
the existing bond/decay/threshold machinery governs how adventurers feel about them. **Tier B —
nameless roles** (a gate guard, a shopkeeper, an urchin, a drunk at the bar) are ephemeral: a
role plus a template pool, with no persistent state. Adventurers encounter both as they go about
town life; notable NPCs can become friends, rivals, or fixtures of a character's story, while
nameless roles supply texture and never accumulate state.

## Applies To

- `packages/core/src/world/types.ts` — `NotableNpc`, `TownRole`, `ActorId` (id space shared
  with adventurers)
- `packages/core/src/events/socialResolver.ts` — Tier A NPCs as honorary actors in encounters
- `packages/core/src/events/eventBus.ts` — `NPCEvent` rendering (Tier B flavour)
- `packages/core/src/relationships/graph.ts` — NPC ids as graph nodes
- `specs/behaviors/relationship-graph.md` — NPC actor participation (cross-reference)
- `specs/behaviors/social-system.md` — encounter pressure/outcome model Tier A reuses
- `specs/behaviors/narrative-voice.md` — grammar pools for NPC lines
- `specs/behaviors/event-bus.md` — `NPCEvent` kind and widened `SocialEvent` participants
- `apps/game-client/src/lib/components/EventFeed.svelte` — `NPC` kind (3 updates per CLAUDE.md)

## Details

### Actor id space

Adventurers and Tier A NPCs share one **actor id space** so they can occupy the same
relationship graph and the same encounter participant lists:

```typescript
type NpcId = string;                 // distinct namespace, e.g. "npc:blacksmith"
type ActorId = AdventurerId | NpcId;
```

`isNpc(id)` is a cheap prefix/lookup test. Anywhere a system iterates "actors", it must
tolerate both — but NPCs lack the full `Adventurer` shape (no quests, no personal goal, no
divine touch), so adventurer-only logic must guard on `isNpc`.

### Tier A — notable NPCs

```typescript
type NotableNpc = {
  id: NpcId;
  name: string;
  role: TownRole;            // also a valid Tier-B role label
  traits: Partial<PersonalityAxes>;   // enough to drive encounter valence/intensity
  bio: string;               // 1–2 sentences, shown in UI; stable
  mood: number;              // 0–100; seeded 50; real mood-system citizen (day-tick decay)
  moodFactors: MoodFactor[]; // same decaying factors as adventurers; written by encounters
  history: HistoryEvent[];   // 50-cap FIFO, same shape as adventurers (see history-layer.md)
  want: { id: string; text: string };  // static longing; read by thought-system.md, never mutated
  familiarity: number;       // 0–100; static, seeded at world gen; how embedded in town life (see Townsfolk familiarity)
};
```

- Notable NPCs are seeded at world generation (scenario-defined; a starting town has a handful).
- They are **graph nodes.** Edges between an adventurer and a notable NPC are ordinary
  `RelationshipEdge`s with the same strength range, type thresholds, threshold events, and
  long-separation decay as adventurer↔adventurer edges (see `relationship-graph.md`).
- They **participate in social encounters** as honorary actors: the §4 pressure model and the §5
  valence × intensity outcome grid (`social-system.md`) apply, using the NPC's `traits` and live
  `mood` where an adventurer's personality/mood would be read. A notable NPC can reach
  FRIEND, RIVAL, even TRUSTED_COMPANION with an adventurer.
- **Interiority (earned, event-driven).** Notable NPCs carry real inner state, written only at
  event-driven sites — never by ambient accumulation:
  - `resolveEncounter` applies the outcome mood factor to NPC participants exactly as it does to
    adventurers; the day-tick mood pass (`mood-system.md`) decays NPC factors and recalculates
    `npc.mood`. NPCs have no `despairStreak` and no departure consequence at any mood.
  - When an adventurer with an edge of `|strength| ≥ 20` to the NPC dies or departs, a
    `WITNESSED_DEATH`-kind `HistoryEvent` is appended to the NPC's `history` (50-cap FIFO via the
    same `appendHistoryEvent`).
  - `want` is a static, hand-authored longing seeded at world generation. No subscriber mutates
    it; it exists to feed the thought grammar's subject slot (`thought-system.md`).
- **Exclusions.** Co-quest strength deltas never apply (NPCs do not quest). NPCs do not draw from
  the activity pool, do not have departures, do not have a `despairStreak` or personal goal, and
  do not die unless a scenario scripts it. Their edges are otherwise live (social deltas, decay).

### Townsfolk familiarity

Notable NPCs are **townsfolk**: they have lived alongside each other for years, while adventurers
are **newcomers** who just arrived at the guild. A townsperson does not treat a stranger the way one
stranger treats another - the innkeeper is already warm to a new face; the priest already offers
counsel. This is captured by a single **static familiarity scalar** per NPC, deliberately cheaper
than a live NPC↔NPC relationship graph (which remains out of scope).

- **`familiarity: number` (0–100)** is seeded per NPC at world generation and **never churns per
  tick**. It represents how embedded in town life that NPC is - service/social roles are high, a
  reclusive or newly-arrived rival is low.
- **Service-role warmth.** Service and craft roles (`INNKEEPER`, `PRIEST`, `SHOPKEEPER`,
  `MERCHANT`, `BARD`, `STABLEHAND`, `BLACKSMITH`) seed **high** familiarity - the town craftsperson
  everyone deals with is as embedded as the innkeeper; guarded/martial roles (`GUARD_CAPTAIN`,
  `GATE_GUARD`) seed **moderate**; marginal/transient roles (`URCHIN`, `DRUNK`, `BEGGAR`) seed
  **low**; and a scenario may seed any NPC low or negative-leaning as a **rival exception**. This is
  the fix for service NPCs reading as "too unfriendly": a warm service NPC no longer starts as a cold
  stranger.

**Familiarity does two things, both static — it does not evolve the way an edge does:**

1. **Seeds a warmer starting edge toward newcomer adventurers.** At world generation, each
   adventurer↔notable-NPC edge is created with an initial `strength` biased by `familiarity` (a high
   familiarity seeds an `ACQUAINTANCE`-band opening; a low or rival-flagged familiarity seeds
   `STRANGER` or a mild negative). Once seeded, that edge is an ordinary `RelationshipEdge` and
   evolves through the normal driver/encounter/decay machinery like any other — familiarity is the
   **starting condition**, not an ongoing force.
2. **Adds a small static approach bias.** A high-familiarity NPC contributes a small constant to the
   social-pressure `gain` (`social-system.md` §4) for their adventurer pairs, so an embedded,
   sociable NPC more readily strikes up encounters with newcomers. The bias is a fixed function of
   `familiarity`, applied every tick but never itself changing.

Familiarity is a scalar **on the NPC**, not a graph — there is no townsfolk↔townsfolk edge state. A
rival NPC is simply one seeded with low familiarity (and, if a scenario wants an active feud, a
seeded negative starting edge to a specific adventurer).

### Tier B — nameless roles

```typescript
type TownRole =
  | 'GATE_GUARD' | 'SHOPKEEPER' | 'URCHIN' | 'DRUNK' | 'PRIEST'
  | 'MERCHANT' | 'BEGGAR' | 'BARD' | 'STABLEHAND' | 'BLACKSMITH'
  | 'GUARD_CAPTAIN' | 'INNKEEPER';
```

- A Tier B interaction is **flavour only**: it renders one grammar line and changes nothing —
  no relationship edge, no mood factor, no persistent record beyond the event itself.
- Tier B NPCs are never instantiated as objects; a role label plus the grammar's role-keyed beat
  pool is the entire representation.
- A `TownRole` that is *also* a notable NPC's `role` (e.g. `BLACKSMITH`) is rendered as the
  notable NPC when that NPC is present and involved; otherwise the role is nameless texture.

### Encounter eligibility

Adventurers meet NPCs during **town-eligible activities** (non-Private activities representing
time among others — DRINKING, EATING, GOSSIPING, PATROL, etc.; the same eligibility used for
adventurer encounters in `social-system.md` §4):

- **Tier A:** the adventurer↔NPC pair accumulates social pressure exactly as an
  adventurer↔adventurer pair does (NPC traits feed `moodStrain`/`relationshipTension`). On
  discharge, a normal `SocialEvent` fires with the NPC as a participant.
- **Tier B:** at a low per-tick rng chance during a town-eligible activity, a flavour `NPCEvent`
  fires — a single grammar line involving a nameless role. No pressure, no cooldown, no outcome.

### Events

- **Tier A encounters reuse `SocialEvent`** with participants widened to `ActorId[]` (see
  `event-bus.md`). Everything else about the encounter is unchanged.
- **Tier B flavour uses a new `NPCEvent` kind:**

  ```typescript
  type NPCEvent = EventBase & {
    kind: 'NPC';
    subtype: 'TOWN_FLAVOUR';
    adventurerId: AdventurerId;
    role: TownRole;
  };
  ```

`renderedText` for both is composed by the template grammar (`narrative-voice.md`): Tier A from
the social-outcome pools (subject names the NPC), Tier B from role-keyed beat pools. The NPC's
name (Tier A) or role (Tier B) is the subject slot.

### UI — Townsfolk detail

A notable (Tier A) NPC is **inspectable**: the identity record that already exists (name, role,
traits, bio, optional mood) is surfaced in a read-only detail view so the player can learn who a
townsfolk is. This is the counterpart to the adventurer character-detail view and shares the same
detail drawer (`app-shell.md#detail-drawer`).

- **Entry points.** A townsfolk is opened by selecting it as an actor id (the same selection
  channel that opens an adventurer):
  - a townsfolk row in an adventurer's **Relationships** list is clickable (previously inert
    because the target was not an adventurer);
  - a notable-NPC **name in the event feed** is clickable, resolving through the same
    actor-id lookup as adventurer names.
- **Display rules.** The view shows: the NPC's `name`; a human-readable **role** label; a
  **Townsfolk** tag distinguishing it from a guild adventurer; the `bio` (1–2 sentences); the
  `traits` present on the NPC, each as a named 0–100 bar (only the axes the NPC defines — traits
  is `Partial<PersonalityAxes>`); the coarse `mood` **only if** defined; and a **Relationships**
  list built from the NPC's edges in the graph (`ctx.relationships.get(npcId)`), each row showing
  the other actor's name, relationship type, and strength, and clickable to re-target the drawer
  to that actor.
- **Exclusions (mirror the model's Tier-A exclusions).** A townsfolk has no personal goal, no
  full personality axes, no divine-touch actions, and no dispatch controls — NPCs are not
  commandable and do not quest. None of those sections render for a townsfolk. (NPC `history`
  exists as model state feeding thoughts, but no history timeline section renders.) The view
  additionally shows the NPC's `want` and current thought (see `thought-system.md`).
- A relationship row whose other endpoint is itself a notable NPC is displayed like any other but,
  since NPC↔NPC edges are not modelled, will not normally occur; if present it re-targets like an
  adventurer row.

### Festivals

A **FESTIVAL** is a town-level stateful span (see `world-expansion.md`): while live it raises
Social-cluster activity weights and social pressure gain guild-wide, and increases Tier B
flavour frequency. It emits START/END events and is the town's counterpart to a world-event
span. Festival cadence is scenario/seeding-driven; duration roll is defined where festivals are
seeded.

### UI — EventFeed

Per CLAUDE.md, the new `NPC` kind requires three EventFeed updates: `KIND_LABELS` (a typed
`Record` entry), `ALL_KINDS` (so it appears in the filter), and `getInvolvedIds` (which must
resolve **actor ids** — including NPC ids — and the `adventurerId` field on `NPCEvent`). A Tier A
NPC id appearing in a `SocialEvent.participantIds` must resolve to the NPC's name for display and
character-filtering.

## Validation

- An adventurer↔notable-NPC edge crosses to FRIEND at strength ≥ 40 and fires exactly one
  `FRIENDSHIP_FORMED` event, identical to an adventurer↔adventurer edge.
- Co-quest deltas are never applied to an edge whose other endpoint is an NPC.
- A notable NPC's edge decays under the 14-day long-separation rule like any other edge.
- A Tier A encounter emits a `SocialEvent` whose `participantIds` includes the NPC id and whose
  outcome/relationship delta follow the §5 grid.
- A Tier B flavour line emits an `NPCEvent` (`kind: 'NPC'`) with non-empty, slot-free
  `renderedText` and produces no relationship or mood change.
- `getInvolvedIds` resolves an NPC id in a `SocialEvent` to the NPC's name; the event appears in
  that NPC's and the adventurer's character filters.
- All NPC line selection flows through `ctx.rng`; no `Math.random()`.
- A live FESTIVAL span raises Social-cluster activity weight and social pressure gain while
  active, and reverts on END.
- `resolveEncounter` applies the outcome mood factor to an NPC participant; the day-tick mood
  pass decays NPC factors and recalculates `npc.mood`; a despairing NPC has no streak or
  departure consequence.
- An adventurer death/departure appends a `WITNESSED_DEATH` history entry to a bonded
  (`|strength| ≥ 20`) NPC and not to a stranger NPC; NPC `history` respects the 50-cap FIFO.
- `npc.want` is never mutated by any subscriber across a long seeded run.
- Clicking a townsfolk relationship row on an adventurer's detail opens the townsfolk detail
  view, which shows the NPC's name, role label, bio, and defined trait bars, and no goal /
  history / divine-touch / dispatch sections.
- The townsfolk detail's Relationships list is built from the NPC's own graph edges and each row
  re-targets the drawer to that actor; clicking the adventurer the townsfolk is bonded to returns
  to that adventurer's detail.
- A notable-NPC name in the event feed is clickable and opens that townsfolk's detail view.
- A high-familiarity service NPC (e.g. `INNKEEPER`) seeds adventurer edges in the `ACQUAINTANCE`
  band at world generation, not `STRANGER`; a rival-flagged low-familiarity NPC seeds `STRANGER` or
  a mild negative.
- `npc.familiarity` is never mutated by any subscriber across a long seeded run (static, like `want`).
- A high-familiarity NPC contributes a larger constant approach-bias to social-pressure gain than a
  low-familiarity NPC (assert the gain difference, not a rolled encounter).
- Once seeded, a townsfolk↔adventurer edge evolves through the ordinary driver/encounter/decay
  machinery (familiarity does not re-apply after seeding).

## Principles

**Inherited:**
- [Every outcome has a narrative cause](../principles.md#every-outcome-has-a-narrative-cause) —
  NPC interactions, like all events, render a sentence; notable-NPC relationship shifts fire the
  same threshold events as adventurers.
- [Emergence over control](../principles.md#emergence-over-control) — the player cannot script
  NPC relationships; they emerge from town life and the same pressure/outcome machinery.
- [Seeded determinism](../principles.md#seeded-determinism) — NPC encounter timing and flavour
  selection are `ctx.rng`-driven and replayable.

**Local:**
- **Two tiers, by design — persistence is earned, not default.** Most townsfolk are texture and
  must cost nothing to stand up: a role and a line, no object, no state. Only the few NPCs who
  are meant to matter carry identity and relationships. Implementations must not promote every
  encountered role into a stateful entity — the nameless tier exists precisely so the town can be
  populous without a state explosion.
- **Notable NPCs are honorary adventurers in the graph, not a parallel system.** They reuse the
  relationship graph, the encounter model, and the threshold events rather than duplicating them.
  The only differences are exclusions (no quests, no activity pool, no death-by-default), guarded
  by `isNpc`. Resist building a separate NPC-relationship subsystem.

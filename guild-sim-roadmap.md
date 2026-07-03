# Direction Notes: The Unseen Hand (working doc)

> Scratchpad for clarifying the new direction.
> Not a spec. Not a plan.
> We answer these together, then translate the finalised direction into `specs/` and `plans/`.
> Format: question, then your answer underneath. Leave blank for now if unsure.

---

## 0. The one-liner

**Q0.1 - In one or two sentences, what is the game now?**
Pretend you're pitching it to someone who has never heard of it.

> It is a game where you play as god. You do not control any characters including the adventurers. You will however be able to interfere using divine influence which may help steer the adventurers into the story/path that you wish.

**Q0.2 - What changed in your head since the original pitch?**
What stopped feeling right about the "unseen storyteller-god watching autonomous adventurers" framing?

> The original pitch still stands but the success end game goal eludes me. Maybe when a certain amount of adventurers achieve their goal in life.

---

## 1. The spine (core fantasy & tension)

**Q1.1 - Is the player still a god / unseen presence, or something else?**
(e.g. guildmaster, a specific character in the world, a narrator, multiple roles.)

> yes, they are still a god / unseen presence.

**Q1.2 - What is the core tension now?**
The old one was "every intervention costs Divine Influence; letting the world breathe makes you stronger."
Does that survive? Is there a new central tradeoff?

> Every intervention still cost Divine Influence, there's a god meter which decreases due to negative outcomes regardless of intervention. When at 0, the adventurers will start hating god and begin actively seeking ways to hunt god and cannot be easily interfered with. This will lead to a bad end scenario where they will fight you. It can also increase based on favourable outcomes. It increases even more for outcomes considered as miracles, usually because of the DI amount used to achieve it. This will result in bad end scenario where cultists who fervently worship u roam the world. They will make the lives of others harder as their delusion would be to bring you into existence as a character through means of senseless sacrifice and cannibalise u for power of god.

**Q1.3 - What is the primary _verb_ - what does the player spend most of their time actually doing?**

> Management of events.

**Q1.4 - What is the primary _joy_ - the feeling you want the player chasing?**

> Choices matter and characters will continue living off your choices. The joy would be the autonomous character storytelling that'd result from it, be it to acheive their life goal or to end you.

---

## LOCKED: The Spine (Set 1, resolved 2026-07-03)

The core is now a **two-meter tightrope**, not the original one-sided DI economy.

**Two distinct meters:**

- **Divine Influence (DI)** - the *spendable tool*.
  Trickles in passively; burned on interventions (nudges, touches, seeded events).
  Hitting zero just means you can't intervene until it refills - it is not a loss state.
- **Faith / Favour** - the *reputation tightrope*.
  A gauge of how the world regards god.
  Moves **only on world outcomes** (good / bad / miraculous), never on button-presses directly.
  This is the meter you are really managing.

**The wiring hook:** a big DI spend is what produces a *miracle*, and a miracle is what
shoves Faith toward the cultist cliff. Tool and tightrope are coupled - power used loudly
is power that damns you.

**Two bad ends, at opposite extremes of Faith (symmetric - both live threats all game):**

- **Faith → 0 (Hated):** adventurers turn on god, resist interference, actively hunt you.
  Bad end: they fight you.
- **Faith → max (Worshipped):** fanatic cultists roam, sacrificing and cannibalising to
  drag god into being. Bad end: their delusion warps the world.

**Faith resting behaviour:** wide neutral band, **no passive time-drift**. Left untouched
by events, Faith holds. (Note the live tension: in a dangerous world, autonomous bad
outcomes - deaths, failed quests - will still apply downward pressure even with no
time-decay. So "stable" means no clock-based drift, not no pressure.)

**Win goal:** orthogonal to the meters - shepherd enough adventurers to their life goals
while keeping Faith off both cliffs. (Exact threshold still open, see Q0.2.)

**Primary verb:** management of events. **Primary joy:** choices that compound into
autonomous character stories - whether a character reaches their life goal or turns to end you.

---

## 2. Keep / cut / change

We have a lot built already (Phases 1-6 + the newer events/NPC/thoughts work).
For each system, mark **KEEP / CUT / RETHINK** and a note.

**Q2.1 - Autonomous adventurers & personality axes**

> RETHINK, i am always looking to inprove the autononous nature of the adventurers and NPCs. They still feel scheduled and rigid. We may need to discuss on fleshing out character by giving them detailed personality, goals, like and dislikes which will help influence actions

**Q2.2 - Relationship graph & threshold events**

> RETHINK, right now there is no way to increase/decrease relationship points. Also for NPCs whose job is in service, they are too unfriendly. NPCs also should have a decently high familiarity with others in the town compared to adventurers who newly moved here. There can be exceptions e.g rival NPCs.

**Q2.3 - Beat-by-beat combat log**

> KEEP, defer to lower priority for improvements.

**Q2.4 - Quest system (board, auto-dispatch, outcomes)**

> KEEP, defer to lower priority for improvements

**Q2.5 - Divine Influence + probability shifting + divine touch**

> KEEP

**Q2.6 - Decision moments / choice cards**

> REVISIT, a bit too distracting when it popups and also disruptive because it pauses the world

**Q2.7 - Scenario engine (goals, win/lose, sandbox)**

> REVISIT, can refer to earlier questions

**Q2.8 - LLM narrator layer**

> REVISIT

**Q2.9 - The newer work: events redesign, NPC interiority, thought surfaces**

> KEEP

---

## LOCKED: Systems triage + work-now cluster (Set 2, resolved 2026-07-03)

**Triage of the nine existing systems:**

- **Keep as-is:** events/NPC-interiority/thoughts (Q2.9), Divine Influence + shifting + touch (Q2.5).
- **Keep but defer improvements:** combat log (Q2.3), quest system (Q2.4).
- **Rethink now (work-now cluster):** adventurer autonomy (Q2.1), relationship graph (Q2.2 + Q3.1).
- **Revisit:** decision moments (Q2.6), scenario engine (Q2.7), LLM narrator (Q2.8).

**Grounded finding (verified in packages/core, not assumed):**
Relationship movement is already wired - it is not missing.
Points move three ways today:

- co-quest success **+8** (`questSystem.ts`),
- social interactions **± variable** (`socialResolver.ts`, IDLE/RESTING pairs only),
- separation decay **-1/day** after 14 days apart (`graph.ts`).

Notable NPCs are projected into the graph as "honorary adventurers" and can bond with
adventurers, but **NPC↔NPC relationships are explicitly out of scope** (`socialResolver.ts:494`).
So the work is **extend + surface + decide the NPC boundary**, not build-from-scratch.

**Work-now cluster, in build order:**

1. **Social relationship events** (the #1 new want) - expand drivers (gifts, betrayals,
   shared danger, rivalry), bring service NPCs into the model, seed townsfolk with prior
   familiarity, and surface every shift in the feed.
2. **Deeper character autonomy** - richer per-character models (likes, dislikes, detailed
   goals) so choices stop feeling scheduled. This is what makes #1 read as character-driven.
3. **Non-disruptive decision moments** - see G below.

**Locked answers:**

- **D - relationship gap = all four at once:** shifts too quiet/invisible, service NPCs not
  in the model, missing event types, and no player-visible surfacing.
  **Plus the key thread:** interactions must be **personality-driven** - e.g. a friendly
  character actively approaches others to talk. Who initiates and what they do should flow
  from traits, not a flat schedule. (This binds D to F - it is one design spine.)
- **E - NPC↔NPC = lightweight familiarity scalar.** Townsfolk start with static prior
  acquaintance that seeds behaviour; it does **not** churn/evolve every tick. Deliberately
  cheaper than a full live NPC↔NPC graph.
- **F - rigidity fix = richer character models drive action selection.** Likes/dislikes/goals
  weight what a character chooses to do. (Primary lever; the other two - wider action menu,
  breaking day-tick lockstep - are secondary.)
- **G - decision moments keep pausing, but rarer and less intrusive.** Not "never pause" -
  the pause stays for moments that earn it; the fix is frequency and visual weight, so the
  world mostly keeps breathing.

---

## LOCKED: Guardrails + constraints (Set 3, resolved 2026-07-03)

Confirmation pass over Sections 5-6. Nothing here reopens the Set 1/2 direction; it fences it.

- **Four hard non-negotiables (no spec may break):** determinism + seeded RNG, emergent-not-scripted,
  no direct character control (god/unseen only), small world scope (one town + one guild).
- **LLM narrator = additive, not load-bearing.** Engine stays fully playable/testable with LLM off.
- **Tech stack unchanged:** pnpm + TS `@ugs/core` + Svelte 5 + Pixi.js.
- **Appetite = refinement.** Extend + surface existing systems; incremental specs, no new pillars.

These four bullets are the constraint envelope every forthcoming spec/plan must sit inside.

---

## LOCKED: Social-relationship-events spec decisions (2026-07-03)

Three spec-shaping decisions resolved before drafting the first spec. Grounding correction:
the pressure model, six-outcome social encounters, threshold LIFECYCLE feed events, and the
Tier-A/B NPC system are **already built** (p9-p12) - the handoff's "IDLE/RESTING only, half-built"
note was stale. The real gaps below are what the spec adds.

- **Surfacing (gap #2) = only meaningful moments.** Discrete driver events (gift/betrayal/
  shared-danger/rivalry) surface as feed lines; ambient drift (co-quest +8, banter +3, -1 decay)
  stays out of the feed but becomes legible on the character-detail relationship row (a
  warming/cooling indicator + most-recent cause). No feed spam per +3. Honours the G-answer
  (world breathes quietly).
- **Drivers (gap #1) = all four, autonomous, betrayal wired.** Gift, betrayal, shared-danger
  bonding, rivalry spark all fire autonomously from personality + context. `BETRAYED_BY` (today a
  dead-end thought/belief token that shifts no strength) gets wired to actually move the bond.
  Player influence stays indirect (divine touch can raise the odds); never a direct trigger -
  respects the "no direct control" non-negotiable.
- **Familiarity (gap #3) = static scalar that seeds an edge + biases approach.** A static per-NPC
  familiarity value seeds a warmer starting edge toward newcomer adventurers (service NPCs start
  ~ACQUAINTANCE not stranger; rival NPCs are seeded cold exceptions) and adds a small approach/
  pressure bias. Static - never churns per tick. No live NPC↔NPC graph (respects answer E).

Translated into: new `specs/behaviors/relationship-events.md` + edits to `relationship-graph.md`,
`npc-system.md`, `screens/character-detail.md`. Plans: `p13a` (drivers + surfacing), `p13b`
(familiarity), depends on p13a.

**Grilling refinements (2026-07-03, all recommendations accepted):** a code-grounded review pass
sharpened the driver design before build:

- **Peril response unifies betrayal + shared-danger.** They are two branches of one combat moment
  (an ally at `NEAR_DEATH`): a `DEFEND_ALLY` forges the bond, a `HESITATE` is the betrayal. Both wire
  the already-firing-but-dead-end `SAVED_BY` (→ `OWES`) and `BETRAYED_BY` (→ `DISTRUSTS`) tokens to
  actually move strength. One detector, two branches - adventurer-only (NPCs aren't in combat).
- **"Gift" → "Kindness."** No inventory/personal economy exists (loot → guild treasury), so a gift
  can't be an item. Reframed as an abstract generosity gesture. Driver set = { peril-response(±),
  kindness, rivalry-spark } → 4 `RELATIONSHIP` subtypes.
- **Cut the unbuildable paths:** loot-split betrayal and spoils-dispute rivalry (no per-adventurer
  loot); non-combat "cold turn" betrayal deferred (overlaps `ESTRANGEMENT`); dedicated divine-bias
  hook cut - influence stays indirect via existing `MOOD_LIFT`/`COURAGE_BLESS`.
- **Rivalry trigger = same-goal/quest competition** (reuses `questVolunteerWeight` alignment) between
  high-ambition low-empathy actors. **Drift indicator shows no glyph on a settled edge** (signal, not
  decoration). **Feed-volume test** over a 30-day run guards against flooding.

---

## 3. New direction specifics

**Q3.1 - What is the single most important NEW thing you want that doesn't exist yet?**

> social relationship increase/decrease events

**Q3.2 - Are there new pillars / systems you're imagining?**
List them loosely, we'll shape later.

> Can refer to earlier.

**Q3.3 - Does the scope of the world change?**
(More adventurers? A bigger map? Multiple guilds? Longer timescale? Generations?)

> Lets keep it small to one town with a guild and work on the core system first.

---

## 4. Player, session, and shape

**Q4.1 - What does a single play session look like now?**
How long, what's the arc of a sitting?

> Depends on the number of characters in roster and the difficulty of reaching their goal.

**Q4.2 - Is there a win state, an endless sim, a campaign, a roguelike loop, something else?**

> endless sim for now until adventurers reach their goal

**Q4.3 - Who is this for?**
Yourself, a specific kind of player, a genre audience?

> Myself

---

## 5. Non-negotiables & guardrails

**Q5.1 - What must stay true no matter what?**
(e.g. determinism, seeded RNG, emergent-not-scripted, permadeath, DOM-first UI.)

> All four hard guardrails are non-negotiable: (1) determinism + seeded RNG (no `Math.random()`),
> (2) emergent-not-scripted storytelling, (3) player never directly controls a character (god/unseen only),
> (4) small world scope - one town + one guild while the core systems are built.

**Q5.2 - What are you now willing to sacrifice that used to feel sacred?**

> Nothing major - the appetite is refinement, not sacrifice. Keep everything currently built.

---

## 6. Constraints

**Q6.1 - Tech stack changes?**
Still pnpm + TS core + Svelte 5 + Pixi? Anything you want to add or drop?

> No change. Keep pnpm workspaces + TS `@ugs/core` engine + Svelte 5 + Pixi.js client.

**Q6.2 - LLM ambition - bigger, smaller, or same?**
Is the AI narrator becoming load-bearing, or staying additive?

> Stays additive. Narrator flavors output but no system depends on it; engine must stay fully
> playable and testable with the LLM off. (Protects the determinism guardrail.)

**Q6.3 - Timeline / appetite - how big is this pivot?**
A refinement, a major expansion, or a near-rebuild?

> Refinement. Extend + surface existing systems (the relationship engine is half-built, not missing).
> Incremental specs, not new pillars or re-architecture.

---

## 7. Anything I didn't ask

**Q7.1 - What's on your mind that none of the above captured?**

> Nothing to add. Direction discovery complete (Sets 1-3 locked); translate to specs + plans next.

---

## Parking lot (open threads to resolve later)

- _(we'll drop unresolved tensions and follow-ups here as we go)_

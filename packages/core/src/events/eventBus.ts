/**
 * Event bus — typed event emission with rendered narrative text.
 *
 * Spec: specs/behaviors/event-bus.md
 * All events are appended to ctx.eventLog. renderedText is never empty.
 * IDs are generated via ctx.rng (seeded PRNG) for determinism.
 */
import type {
  SimulationContext,
  SimulationEvent,
  ActorId,
  AdventurerId,
  QuestId,
  RegionId,
  DecisionOption,
  ActivityId,
} from '../world/types.js';

// ---------------------------------------------------------------------------
// Input types (caller supplies these; emitEvent fills id, tick, renderedText)
// ---------------------------------------------------------------------------

export type SocialEventInput = {
  kind: 'SOCIAL';
  subtype: import('../world/types.js').SocialOutcomeType;
  participantIds: import('../world/types.js').ActorId[]; // 2–4 participants (group scenes)
  relationshipDelta: number;
};

export type NPCEventInput = {
  kind: 'NPC';
  subtype: 'TOWN_FLAVOUR';
  adventurerId: AdventurerId;
  role: import('../world/types.js').TownRole;
};

export type CombatEventInput = {
  kind: 'COMBAT';
  subtype: 'BEAT_LOG' | 'QUEST_RESOLVED';
  questId: QuestId;
  involvedIds: AdventurerId[];
  beats?: import('../world/types.js').CombatBeat[];
  success?: boolean;
};

export type QuestEventInput = {
  kind: 'QUEST';
  subtype: 'STARTED' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'DROUGHT';
  questId: QuestId;
  partyIds: AdventurerId[];
};

export type LifecycleEventInput = {
  kind: 'LIFECYCLE';
  subtype:
    | 'ADVENTURER_DIED'
    | 'ADVENTURER_DEPARTED'
    | 'FRIENDSHIP_FORMED'
    | 'TRUSTED_COMPANION_BOND_FORMED'
    | 'BOND_BROKEN'
    | 'RIVALRY_DEEPENED'
    | 'RECONCILIATION'
    | 'GOAL_MILESTONE'
    | 'GOAL_ACHIEVED';
  involvedIds: AdventurerId[];
};

export type RelationshipEventInput = {
  kind: 'RELATIONSHIP';
  subtype: import('../world/types.js').RelationshipDriverSubtype;
  participantIds: import('../world/types.js').ActorId[]; // both actors; ActorId so notable NPCs participate
};

export type WorldEventInput = {
  kind: 'WORLD';
  subtype:
    | 'STORM'
    | 'PLAGUE'
    | 'WINDFALL'
    | 'MONSTER_SURGE'
    | 'TRAVELLING_MERCHANT'
    | 'RUMOUR'
    | 'FEUD'
    | 'FESTIVAL'
    | 'QUEST_DROUGHT'
    | 'REGION_UNLOCKED'
    | 'SCENARIO_GOAL_ACHIEVED'
    | 'SCENARIO_COMPLETE'
    | 'SCENARIO_FAILED'
    | 'INTERNAL_ERROR';
  phase?: 'START' | 'END';       // present on spanning subtypes (world-expansion.md)
  regionId?: RegionId;
  goalId?: string;
};

export type DecisionMomentEventInput = {
  kind: 'DECISION_MOMENT';
  decisionId: string;
  situationText: string;
  options: DecisionOption[];
  expiresAt: number;
};

export type DivineInterventionEventInput = {
  kind: 'DIVINE';
  subtype: 'TOUCH' | 'SEED_EVENT' | 'SHIFT_DIFFICULTY' | 'OPTION_CHOSEN' | 'DI_GAINED' | 'DI_SPENT';
  diDelta: number;
  targetId?: string;
};

export type ActivityEventInput =
  | {
      kind: 'ACTIVITY';
      subtype: 'ACTIVITY_CHANGED';
      adventurerId: AdventurerId;
      activity: ActivityId;
      prevActivity?: ActivityId;
    }
  | {
      kind: 'ACTIVITY';
      subtype: 'MICRO_EVENT';
      adventurerId: AdventurerId;
      activity: ActivityId;
    }
  | {
      // Per-character beat as a drafted member readies to depart on a quest. `prevActivity` is the
      // activity they were pulled from (absent if they had not yet drawn one); a sleeper is roused.
      kind: 'ACTIVITY';
      subtype: 'PREPARES_FOR_QUEST';
      adventurerId: AdventurerId;
      prevActivity?: ActivityId;
    };

/** THOUGHT whispers arrive pre-rendered: the whisper subscriber composes the text
 *  through the derived (worldSeed, actorId, tick) stream so it byte-matches the
 *  on-demand render for the same actor and tick (thought-system.md). Passing it on
 *  the input keeps emitEvent the single append path. */
export type ThoughtEventInput = {
  kind: 'THOUGHT';
  actorId: ActorId;
  subjectKey: string;
  renderedText: string;
};

export type SimulationEventInput =
  | SocialEventInput
  | NPCEventInput
  | CombatEventInput
  | QuestEventInput
  | LifecycleEventInput
  | RelationshipEventInput
  | WorldEventInput
  | DecisionMomentEventInput
  | DivineInterventionEventInput
  | ActivityEventInput
  | ThoughtEventInput;

// ---------------------------------------------------------------------------
// Template grammar (spec: behaviors/narrative-voice.md)
//
// renderedText = subject + beat + optional colour. Beats and colours are drawn
// from per-family pools via ctx.rng, so repeated events of the same subtype do
// not read identically. Selection is always seeded — the feed is replayable.
// Slots ({a}, {b}, {who}, {region}, …) are filled from the supplied slot map.
// ---------------------------------------------------------------------------

type Slots = Record<string, string>;

/** rng-driven pick from a non-empty pool. */
function pick<T>(pool: readonly T[], ctx: SimulationContext): T {
  return pool[Math.floor(ctx.rng.next() * pool.length)]!;
}

/** Interpolate {slot} tokens; unknown slots are left intact so tests can catch gaps. */
function fill(template: string, slots: Slots): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => slots[key] ?? `{${key}}`);
}

/** Beat pools keyed by `${kind}:${subtype}` — ≥3 variants each (narrative-voice.md). */
const BEAT_POOLS: Record<string, readonly string[]> = {
  'SOCIAL:BANTER': [
    '{a} and {b} share a warm conversation over supper.',
    '{a} and {b} fall into easy talk by the fire.',
    '{a} swaps stories with {b} late into the evening.',
    '{a} and {b} pass an hour in good company.',
  ],
  'SOCIAL:SOLIDARITY': [
    '{a} and {b} find real common cause, and the bond shows.',
    '{a} stands shoulder to shoulder with {b} against the day\'s troubles.',
    '{a} and {b} close ranks — whatever comes, they face it together.',
    'A quiet loyalty hardens between {a} and {b}.',
  ],
  'SOCIAL:ARGUMENT': [
    '{a} and {b} clash in a heated argument.',
    '{a} and {b} trade sharp words until both fall silent.',
    'An old grievance boils over between {a} and {b}.',
    '{a} rounds on {b}, and the quarrel draws every eye in the room.',
  ],
  'SOCIAL:BREAKTHROUGH': [
    '{a} and {b} reach a moment of deep mutual understanding.',
    'Something unspoken finally settles between {a} and {b}.',
    '{a} and {b} find common ground they had both given up on.',
  ],
  'SOCIAL:SILENT_DISTANCE': [
    '{a} and {b} drift apart in awkward silence.',
    '{a} and {b} sit together saying nothing, a gulf between them.',
    '{a} turns away from {b} without a word.',
  ],
  'SOCIAL:ESTRANGEMENT': [
    'Something breaks for good between {a} and {b}.',
    '{a} and {b} fall out bitterly, past any mending.',
    '{a} writes {b} off entirely, and the cold sets in.',
    'Whatever was left between {a} and {b} curdles into open estrangement.',
  ],
  // Relationship driver lines (relationship-events.md). Both actors named ({a}/{b}); the
  // subtype label never appears in prose. Peril-response branches are adventurer-only; the
  // town-life drivers (KINDNESS / RIVALRY_SPARK) may name a notable NPC.
  'RELATIONSHIP:SHARED_DANGER': [
    '{a} and {b} come through death\'s door together, and the bond holds fast.',
    'Blood and terror shared, {a} and {b} trust each other as never before.',
    '{a} would not leave {b} to die — and neither forgets it.',
    'Having faced the end side by side, {a} and {b} are bound by it.',
  ],
  'RELATIONSHIP:BETRAYAL': [
    '{a} stood frozen while {b} bled — and {b} will not forget it.',
    'When it counted, {a} did nothing, and left {b} to face death alone.',
    'Something breaks in {b} as {a} fails to lift a hand to save them.',
    '{b} looked to {a} for help and found none — the bond is poisoned.',
  ],
  'RELATIONSHIP:KINDNESS': [
    '{a} quietly does {b} a kindness, asking nothing in return.',
    '{a} goes out of their way for {b}, and it is noticed.',
    '{a} extends {b} a small, unprompted generosity.',
    'A gesture of care from {a} warms {b}\'s regard.',
  ],
  'RELATIONSHIP:RIVALRY_SPARK': [
    '{a} and {b} clash over the same ambition, and the rivalry sharpens.',
    'Neither {a} nor {b} will yield the prize, and bad blood kindles.',
    '{a} and {b} set themselves against each other over a shared goal.',
    'A competitive edge hardens between {a} and {b}.',
  ],
  'QUEST:STARTED': [
    'A party sets out on {label}.',
    'Word goes round: a band has taken up {label}.',
    'The guild commits a party to {label}.',
  ],
  'QUEST:COMPLETED': [
    '{label} ends in success.',
    'The party returns triumphant from {label}.',
    '{label} is done, and done well.',
  ],
  'QUEST:FAILED': [
    '{label} ends in failure.',
    'The party limps back, {label} unfinished.',
    '{label} goes badly — the work is lost.',
  ],
  'QUEST:EXPIRED': [
    '{label} expires without a party.',
    'No one takes up {label}, and the chance passes.',
    '{label} slips off the board, unanswered.',
  ],
  'QUEST:DROUGHT': [
    'The quest board stands empty — no work to be found.',
    'The board is bare; the guild waits on word of work.',
    'Not a single notice hangs on the board today.',
  ],
  'LIFECYCLE:ADVENTURER_DIED': [
    '{who} has fallen.',
    '{who} draws a last breath, far from home.',
    'Death takes {who}.',
  ],
  'LIFECYCLE:ADVENTURER_DEPARTED': [
    '{who} has left the guild.',
    '{who} packs their things and walks out the gate for good.',
    '{who} turns their back on the guild and is gone.',
  ],
  'LIFECYCLE:FRIENDSHIP_FORMED': [
    '{who} and {other} forge a new friendship.',
    'A friendship takes root between {who} and {other}.',
    '{who} and {other} find they trust one another now.',
  ],
  'LIFECYCLE:TRUSTED_COMPANION_BOND_FORMED': [
    '{who} and {other} become trusted companions.',
    '{who} would stand at {other}\'s back through anything now.',
    'The bond between {who} and {other} hardens into true loyalty.',
  ],
  'LIFECYCLE:BOND_BROKEN': [
    'The bond between {who} and {other} shatters.',
    'Whatever held {who} and {other} together breaks apart.',
    '{who} and {other} are strangers again, and colder for it.',
  ],
  'LIFECYCLE:RIVALRY_DEEPENED': [
    'The rivalry between {who} and {other} darkens into enmity.',
    '{who} and {other} pass from rivals to something like hatred.',
    'Bad blood between {who} and {other} curdles.',
  ],
  'LIFECYCLE:RECONCILIATION': [
    '{who} and {other} begin to mend old wounds.',
    '{who} and {other} call an uneasy truce.',
    'Something thaws between {who} and {other}.',
  ],
  'LIFECYCLE:GOAL_MILESTONE': [
    '{who} marks progress toward their life goal.',
    '{who} takes a step closer to what they came here for.',
    'A private ambition of {who}\'s inches nearer.',
  ],
  'LIFECYCLE:GOAL_ACHIEVED': [
    '{who} has achieved their life\'s ambition.',
    '{who} finally grasps what they always wanted.',
    'The thing {who} has chased for so long is theirs at last.',
  ],
  'WORLD:STORM': [
    'A fierce storm sweeps across the land.',
    'Black clouds roll in and the rain comes sideways.',
    'A storm sets the shutters rattling and the roads to mud.',
  ],
  'WORLD:PLAGUE': [
    'A plague spreads through the region.',
    'Sickness moves house to house, and the healers are run ragged.',
    'A wasting fever takes hold among the people.',
  ],
  'WORLD:WINDFALL': [
    'Unexpected wealth flows through the region.',
    'Coin changes hands freely — fortune has smiled on someone.',
    'A sudden prosperity puts silver in every purse.',
  ],
  'WORLD:MONSTER_SURGE': [
    'A surge of monsters is reported.',
    'Beasts press in from the wilds in unnatural numbers.',
    'Something has stirred the dark places — the roads are not safe.',
  ],
  'WORLD:TRAVELLING_MERCHANT': [
    'A travelling merchant arrives.',
    'A laden cart rolls into town, its driver crying wares.',
    'A pedlar sets up a stall and the curious gather.',
  ],
  'WORLD:RUMOUR': [
    'Rumours stir among the populace.',
    'Whispers pass from table to table in the taverns.',
    'A strange tale is making the rounds — none can say if it\'s true.',
  ],
  // Spanning world events — START (the span opens) vs END (the span passes). Spec: world-expansion.md.
  'WORLD:STORM:START': [
    'A storm rolls in, black and sudden.',
    'The sky darkens and a storm breaks over the land.',
    'Thunder cracks as a storm sets in.',
  ],
  'WORLD:STORM:END': [
    'The storm passes, and the skies clear.',
    'The last of the rain blows over; the roads begin to dry.',
    'The storm spends itself at last.',
  ],
  'WORLD:PLAGUE:START': [
    'A plague takes hold across the region.',
    'Sickness begins to spread, house to house.',
    'A wasting fever sets in among the people.',
  ],
  'WORLD:PLAGUE:END': [
    'The plague finally burns itself out.',
    'The sickness recedes; the healers can rest.',
    'The fever loosens its grip on the region.',
  ],
  'WORLD:MONSTER_SURGE:START': [
    'Beasts begin pressing in from the wilds in unnatural numbers.',
    'A surge of monsters breaks against the borderlands.',
    'Something has stirred the dark places, and the roads turn deadly.',
  ],
  'WORLD:MONSTER_SURGE:END': [
    'The monster surge subsides; the wilds fall quiet again.',
    'The beasts thin out at last, and the roads grow safer.',
    'Whatever stirred the dark places settles, and the surge ends.',
  ],
  'WORLD:TRAVELLING_MERCHANT:START': [
    'A travelling merchant arrives and sets up shop.',
    'A laden caravan rolls into town to stay a while.',
    'A pedlar opens a stall, and trade picks up.',
  ],
  'WORLD:TRAVELLING_MERCHANT:END': [
    'The travelling merchant packs up and moves on.',
    'The caravan rolls out of town, its trading done.',
    'The pedlar strikes the stall and departs.',
  ],
  // Town-level festival span (npc-system.md) — START (opens) vs END (passes).
  'WORLD:FESTIVAL:START': [
    'A festival opens in the town square, and the streets fill with colour.',
    'Bunting goes up and the taverns throw their doors wide — the festival has begun.',
    'Music and lantern-light spill through the streets as the town gives itself to festival.',
  ],
  'WORLD:FESTIVAL:END': [
    'The festival winds down, and the town returns to its quieter round.',
    'The last stalls come down and the square empties — the festival is over.',
    'The music fades and the lanterns gutter out; the festival has passed.',
  ],
  // Feud span (world-expansion.md) — emitted by a p10c follow-up; grammar kept ahead of use.
  'WORLD:FEUD:START': [
    'A bitter feud hardens into the open.',
    'Old bad blood curdles into a standing quarrel.',
    'The cold war between them settles in for the long haul.',
  ],
  'WORLD:FEUD:END': [
    'The feud finally cools.',
    'The long quarrel burns itself out at last.',
    'Whatever fed the feud runs dry, and the cold eases.',
  ],
  // Tier B nameless-role town flavour (npc-system.md). Subject slot {who} = the adventurer.
  'NPC:GATE_GUARD': [
    'The gate guard waves {who} through with a bored nod.',
    'A gate guard stops {who} for a word before letting them pass.',
    '{who} trades a nod with the guard on the gate.',
  ],
  'NPC:SHOPKEEPER': [
    'A shopkeeper haggles cheerfully with {who} over a trifle.',
    '{who} lingers at a stall while the shopkeeper talks up the wares.',
    'The shopkeeper presses a small sample on {who} to try.',
  ],
  'NPC:URCHIN': [
    'A street urchin trails {who} for a few hopeful steps.',
    '{who} shoos off an urchin eyeing their purse.',
    'An urchin darts past {who}, quick as a sparrow.',
  ],
  'NPC:DRUNK': [
    'A drunk slurs a greeting at {who} from a doorway.',
    '{who} steps around a drunk sprawled across the lane.',
    'A tavern drunk tries to draw {who} into some rambling tale.',
  ],
  'NPC:PRIEST': [
    'A priest offers {who} a blessing as they pass the shrine.',
    '{who} pauses while a priest murmurs a few pious words.',
    'A roadside priest presses a token into {who}\'s hand.',
  ],
  'NPC:MERCHANT': [
    'A merchant hails {who}, eager to describe far-off wares.',
    '{who} listens to a merchant boast of goods from distant ports.',
    'A merchant tries to talk {who} into a bargain.',
  ],
  'NPC:BEGGAR': [
    'A beggar holds out a cupped hand as {who} passes.',
    '{who} drops a coin into a beggar\'s bowl.',
    'A beggar mutters a blessing after {who}.',
  ],
  'NPC:BARD': [
    'A bard strikes up a tune as {who} walks by.',
    '{who} catches a snatch of a bard\'s song in the square.',
    'A bard works {who}\'s guild into a verse, half in jest.',
  ],
  'NPC:STABLEHAND': [
    'A stablehand nods to {who} over a barrow of hay.',
    '{who} exchanges a word with a stablehand mucking out a stall.',
    'A stablehand leads a horse past {who}, whistling.',
  ],
  'NPC:BLACKSMITH': [
    'The clang of the smithy follows {who} down the lane.',
    'A blacksmith calls a greeting to {who} over the ring of the anvil.',
    '{who} pauses to watch a blacksmith draw glowing iron from the forge.',
  ],
  'NPC:GUARD_CAPTAIN': [
    'The guard captain gives {who} a curt, measuring look.',
    '{who} steps aside as the guard captain strides past on some errand.',
    'The guard captain trades a brief word with {who} about the roads.',
  ],
  'NPC:INNKEEPER': [
    'The innkeeper waves {who} toward a free table.',
    '{who} swaps the day\'s news with the innkeeper over the bar.',
    'The innkeeper sets a cup before {who} without being asked.',
  ],
  'WORLD:QUEST_DROUGHT': [
    'Work dries up across the region.',
    'The flow of work thins to nothing.',
    'Hard times — no one has coin to hire a blade.',
  ],
  'WORLD:REGION_UNLOCKED': [
    'New territory opens up.',
    'A road once closed now lies open to the guild.',
    'Word arrives of lands newly within reach.',
  ],
  'COMBAT:BEAT_LOG': [
    'The party returns from {label}.',
    'Bloodied but breathing, the party is back from {label}.',
    'The party trudges home from {label}.',
  ],
  'COMBAT:QUEST_RESOLVED': [
    '{label} has been resolved.',
    'The matter of {label} is settled.',
    '{label} is behind them now.',
  ],
  'DIVINE:TOUCH': [
    'The unseen hand reaches out to shape events.',
    'A subtle pressure bends the course of things.',
    'Unseen, a will presses upon the world.',
  ],
  'DIVINE:SEED_EVENT': [
    'A world event is seeded by divine will.',
    'Something is set in motion from beyond sight.',
    'The hand plants a seed that will bloom into event.',
  ],
  'DIVINE:SHIFT_DIFFICULTY': [
    'The difficulty of a region shifts.',
    'The odds in a region quietly tilt.',
    'Fate recalibrates the dangers of a region.',
  ],
  'DIVINE:OPTION_CHOSEN': [
    'A divine option is chosen.',
    'The hand selects, and a path closes.',
    'A choice is made from above.',
  ],
  'DIVINE:DI_GAINED': [
    'Divine influence grows.',
    'Power gathers to the unseen hand.',
    'The hand\'s reach lengthens.',
  ],
  'DIVINE:DI_SPENT': [
    'Divine influence is spent.',
    'The hand pays the price of its meddling.',
    'Power drains away in the act of shaping.',
  ],
  'ACTIVITY:CHANGED_FIRST': [
    '{who} begins {next}.',
    '{who} settles into {next}.',
    '{who} takes up {next}.',
  ],
  'ACTIVITY:CHANGED_NEXT': [
    '{who} finishes {prev} and begins {next}.',
    'Done with {prev}, {who} turns to {next}.',
    '{who} sets aside {prev} and moves on to {next}.',
  ],
  'ACTIVITY:CHANGED_WAKE': [
    '{who} wakes from sleep and begins {next}.',
    '{who} rises, shakes off sleep, and starts {next}.',
    'Newly woken, {who} sets to {next}.',
  ],
  // A drafted party member readying to depart. WAKE = pulled from sleep; the plain form = pulled
  // from a waking activity ({prev}); the bare form = no activity drawn yet.
  'ACTIVITY:PREPARES_FOR_QUEST_WAKE': [
    '{who} is roused from sleep and readies for the road.',
    '{who} wakes, shakes off sleep, and gathers their gear for the quest.',
    'Roused from a deep sleep, {who} rises and prepares to set out.',
  ],
  'ACTIVITY:PREPARES_FOR_QUEST': [
    '{who} sets aside {prev} and readies for the road.',
    '{who} breaks off {prev}, gathers their gear, and prepares to set out.',
    'Leaving {prev} behind, {who} readies for the quest.',
  ],
  'ACTIVITY:PREPARES_FOR_QUEST_PLAIN': [
    '{who} gathers their gear and readies for the road.',
    '{who} straps on their pack and prepares to set out.',
    '{who} makes ready for the quest ahead.',
  ],
};

/** Colour pools keyed by family or context — appended to a fraction of lines. */
const COLOUR_POOLS: Record<string, readonly string[]> = {
  SOCIAL: [
    'The hour grows late.',
    'Neither quite meets the other\'s eye.',
    'The common room hums around them.',
    'A candle gutters between them.',
  ],
};

/**
 * Span tint pools (P10b): while a world-event span is live in a region, unrelated feed
 * lines pick up the region's current weather/mood. Keyed by WorldEventType.
 */
const SPAN_COLOUR_POOLS: Record<string, readonly string[]> = {
  STORM: [
    'Rain hammers the roofs outside.',
    'Wind rattles the shutters as they speak.',
    'The storm howls on beyond the walls.',
  ],
  PLAGUE: [
    'A sick-house bell tolls somewhere across town.',
    'The air is thick with the tang of fever-herbs.',
    'Fewer faces than usual fill the room — the sickness keeps them home.',
  ],
  MONSTER_SURGE: [
    'The watch has been doubled on the walls.',
    'Talk keeps drifting to the things stirring in the wilds.',
    'Every traveller comes in with another rumour of beasts.',
  ],
  TRAVELLING_MERCHANT: [
    'Market-day clamour drifts in from the square.',
    'The smell of strange spices hangs in the air.',
    'A pedlar\'s cry carries faintly from outside.',
  ],
  FESTIVAL: [
    'Festival music drifts in from the square.',
    'Lantern-light and laughter spill through the streets outside.',
    'The festival crowd hums somewhere beyond the walls.',
  ],
};

/** Chance a live span tints an unrelated feed line. */
const SPAN_TINT_CHANCE = 0.35;

/** Collect tint lines for every span currently live in an unlocked region. */
function activeSpanColours(ctx: SimulationContext): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const region of ctx.activeRegions.values()) {
    if (!region.unlocked) continue;
    for (const span of region.activeWorldEvents) {
      if (seen.has(span.type)) continue;
      seen.add(span.type);
      const pool = SPAN_COLOUR_POOLS[span.type];
      if (pool) out.push(...pool);
    }
  }
  return out;
}

/**
 * Compose a feed line: pick a beat for `familyKey`, fill its slots, and on an
 * rng roll append a colour fragment. Falls back to the provided `fallback`
 * string when no beat pool exists yet (families ported incrementally).
 */
function compose(
  familyKey: string,
  slots: Slots,
  ctx: SimulationContext,
  fallback: string,
  opts?: { colourKey?: string; colourChance?: number },
): string {
  const beats = BEAT_POOLS[familyKey];
  if (!beats) return fallback;
  let line = fill(pick(beats, ctx), slots);
  const colours = COLOUR_POOLS[opts?.colourKey ?? familyKey];
  if (colours && ctx.rng.next() < (opts?.colourChance ?? 0.5)) {
    line += ' ' + fill(pick(colours, ctx), slots);
  }
  // Span tint: an active world span colours unrelated *guild-local* lines with the tinted
  // region's ambient weather/mood. Two families are excluded:
  //  - WORLD  — the span announcements themselves (a storm doesn't narrate itself as tinted);
  //  - COMBAT — the away-quest fight report happens out in a dungeon, not the guild-town region,
  //             so a live FESTIVAL's "laughter in the streets" must never bleed onto a combat
  //             line ("The party trudges home from X. Lantern-light and laughter spill…").
  // rng is only consumed when a span is live, so spanless feeds are unchanged.
  if (!familyKey.startsWith('WORLD') && !familyKey.startsWith('COMBAT')) {
    const spanColours = activeSpanColours(ctx);
    if (spanColours.length > 0 && ctx.rng.next() < SPAN_TINT_CHANCE) {
      line += ' ' + pick(spanColours, ctx);
    }
  }
  return line;
}

// ---------------------------------------------------------------------------
// Template engine
// ---------------------------------------------------------------------------

/** Resolve any actor id (adventurer or Tier A notable NPC) to a display name. */
function actorName(ctx: SimulationContext, id: string): string {
  return ctx.adventurers.get(id)?.identity.name ?? ctx.notableNpcs.get(id)?.name ?? id;
}

/** Human-readable label for a Tier B nameless town role (e.g. GATE_GUARD → "the gate guard"). */
const TOWN_ROLE_LABELS: Record<import('../world/types.js').TownRole, string> = {
  GATE_GUARD: 'the gate guard', SHOPKEEPER: 'the shopkeeper', URCHIN: 'a street urchin',
  DRUNK: 'a drunk', PRIEST: 'a priest', MERCHANT: 'a merchant', BEGGAR: 'a beggar',
  BARD: 'a bard', STABLEHAND: 'a stablehand', BLACKSMITH: 'the blacksmith',
  GUARD_CAPTAIN: 'the guard captain', INNKEEPER: 'the innkeeper',
};

function questLabel(ctx: SimulationContext, questId: QuestId): string {
  const quest = [...ctx.questBoard.available, ...ctx.questBoard.active].find(q => q.id === questId);
  // Wrap the title in quotation marks so it reads as a proper name in prose
  // rather than blending into the sentence (quest-system.md#quest-naming).
  return quest ? `“${quest.name}”` : questId;
}

function renderText(input: SimulationEventInput, ctx: SimulationContext): string {
  switch (input.kind) {
    case 'SOCIAL': {
      // 2–4 participants; the beat pools name the first two ({a}/{b}). Group scenes (3–4)
      // still fill both slots so the line is slot-free (3rd+ are carried on the event, not the prose).
      const a = actorName(ctx, input.participantIds[0] ?? 'someone');
      const b = actorName(ctx, input.participantIds[1] ?? 'another');
      const slots = { a, b };
      return compose(`SOCIAL:${input.subtype}`, slots, ctx, `${a} and ${b} share words.`, { colourKey: 'SOCIAL' });
    }
    case 'NPC': {
      // Tier B town flavour: the adventurer is the subject; the role supplies the beat pool.
      const who = actorName(ctx, input.adventurerId);
      const role = TOWN_ROLE_LABELS[input.role];
      return compose(`NPC:${input.role}`, { who, role }, ctx, `${who} crosses paths with ${role}.`);
    }
    case 'COMBAT': {
      const label = questLabel(ctx, input.questId);
      return compose(`COMBAT:${input.subtype}`, { label }, ctx, `${label} — the party's tale is told.`);
    }
    case 'QUEST': {
      const label = questLabel(ctx, input.questId);
      return compose(`QUEST:${input.subtype}`, { label }, ctx, `${label} — the quest board stirs.`);
    }
    case 'LIFECYCLE': {
      const who = input.involvedIds[0] ? actorName(ctx, input.involvedIds[0]) : 'An adventurer';
      const other = input.involvedIds[1] ? actorName(ctx, input.involvedIds[1]) : 'another';
      return compose(`LIFECYCLE:${input.subtype}`, { who, other }, ctx, `${who} reaches a turning point.`);
    }
    case 'RELATIONSHIP': {
      // A driver line names both actors ({a}/{b}); adventurers or Tier A notable NPCs.
      const a = actorName(ctx, input.participantIds[0] ?? 'someone');
      const b = actorName(ctx, input.participantIds[1] ?? 'another');
      return compose(`RELATIONSHIP:${input.subtype}`, { a, b }, ctx, `${a} and ${b} reach a turning point.`);
    }
    case 'WORLD': {
      // Scenario/system announcements are deliberately fixed, dignified lines — not pooled flavour.
      const FIXED: Partial<Record<WorldEventInput['subtype'], string>> = {
        SCENARIO_GOAL_ACHIEVED: `A scenario goal has been achieved${input.goalId ? ` (${input.goalId})` : ''}.`,
        SCENARIO_COMPLETE: `The scenario is complete — the guild has prevailed.`,
        SCENARIO_FAILED: `The scenario has ended in failure.`,
        INTERNAL_ERROR: `[Simulation error — prior state restored.]`,
      };
      // Spanning subtypes carry a phase → key on it ("A storm rolls in" vs "The storm passes").
      const phaseKey = input.phase ? `:${input.phase}` : '';
      return compose(`WORLD:${input.subtype}${phaseKey}`, {}, ctx, FIXED[input.subtype] ?? 'The world turns.');
    }
    case 'DECISION_MOMENT':
      return input.situationText;
    case 'DIVINE':
      return compose(`DIVINE:${input.subtype}`, {}, ctx, `The unseen hand stirs.`);
    case 'THOUGHT':
      // Pre-rendered by the thought grammar via the derived stream (thought-system.md);
      // must byte-match the on-demand render — never re-rendered here.
      return input.renderedText;
    case 'ACTIVITY': {
      const who = actorName(ctx, input.adventurerId);
      const ACTIVITY_NOUN: Record<ActivityId, string> = {
        TRAINING: 'training', SPARRING: 'sparring', PATROL: 'patrol', HUNTING: 'hunting',
        DRINKING: 'drinking', GAMBLING: 'gambling', COOKING: 'cooking', EATING: 'eating',
        GOSSIPING: 'gossiping', READING: 'reading', BROODING: 'brooding', RESTING: 'rest',
        PRAYING: 'prayer', CRAFTING: 'crafting', SLEEPING: 'sleep',
      };
      const ACTIVITY_GERUND: Record<ActivityId, string> = {
        TRAINING: 'training', SPARRING: 'sparring', PATROL: 'on patrol', HUNTING: 'hunting',
        DRINKING: 'drinking', GAMBLING: 'gambling', COOKING: 'cooking', EATING: 'eating',
        GOSSIPING: 'gossiping', READING: 'reading', BROODING: 'brooding', RESTING: 'resting',
        PRAYING: 'praying', CRAFTING: 'crafting', SLEEPING: 'sleeping',
      };
      switch (input.subtype) {
        case 'MICRO_EVENT':
          return `${who} is ${ACTIVITY_GERUND[input.activity]}.`;
        case 'PREPARES_FOR_QUEST': {
          if (!input.prevActivity) {
            return compose('ACTIVITY:PREPARES_FOR_QUEST_PLAIN', { who }, ctx, `${who} gathers their gear and readies for the road.`);
          }
          if (input.prevActivity === 'SLEEPING') {
            return compose('ACTIVITY:PREPARES_FOR_QUEST_WAKE', { who }, ctx, `${who} is roused from sleep and readies for the road.`);
          }
          const prev = ACTIVITY_NOUN[input.prevActivity];
          return compose('ACTIVITY:PREPARES_FOR_QUEST', { who, prev }, ctx, `${who} sets aside ${prev} and readies for the road.`);
        }
        case 'ACTIVITY_CHANGED': {
          const next = ACTIVITY_NOUN[input.activity];
          if (input.prevActivity) {
            const prev = ACTIVITY_NOUN[input.prevActivity];
            if (input.prevActivity === 'SLEEPING') {
              return compose('ACTIVITY:CHANGED_WAKE', { who, next }, ctx, `${who} wakes from sleep and begins ${next}.`);
            }
            return compose('ACTIVITY:CHANGED_NEXT', { who, prev, next }, ctx, `${who} finishes ${prev} and begins ${next}.`);
          }
          return compose('ACTIVITY:CHANGED_FIRST', { who, next }, ctx, `${who} begins ${next}.`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

function generateId(rng: SimulationContext['rng']): string {
  const hi = (rng.next() * 0xFFFFFF >>> 0).toString(16).padStart(6, '0');
  const lo = (rng.next() * 0xFFFFFF >>> 0).toString(16).padStart(6, '0');
  return `ev-${hi}${lo}`;
}

/** Appends a fully rendered event to ctx.eventLog. Returns the new context. */
export function emitEvent(ctx: SimulationContext, input: SimulationEventInput): SimulationContext {
  const id = generateId(ctx.rng);
  const renderedText = renderText(input, ctx);
  const event = { ...input, id, tick: ctx.worldTime.tick, renderedText } as SimulationEvent;
  return { ...ctx, eventLog: [...ctx.eventLog, event] };
}

/**
 * Thought grammar — deterministic inner monologue for living actors.
 *
 * Spec: specs/behaviors/thought-system.md
 *
 * thought = stance + subject + inflection? + hook?
 *
 * CRITICAL: renderThought never consumes ctx.rng. All randomness comes from a
 * derived stream hashed from (worldSeed, actorId, tick) — SeededRNG's xmur3
 * string hash IS the pure hash. Same actor + same tick → same thought, forever;
 * opening a UI panel can never perturb the simulation ("the panel is a window,
 * not a hand").
 */
import { SeededRNG } from '../world/SeededRNG.js';
import { moodThresholdLabel, topMoodFactors } from '../adventurers/mood.js';
import type { MoodLabel } from '../adventurers/mood.js';
import { deriveBeliefs } from './beliefs.js';
import type {
  ActorId,
  Adventurer,
  HistoryEvent,
  MoodFactor,
  NotableNpc,
  PersonalityAxes,
  SimulationContext,
} from '../world/types.js';

export type RenderedThought = {
  text: string;
  /** Fragment-family id (e.g. "BELIEF:DISTRUSTS:npc:halden") — for anti-repetition; never rendered. */
  subjectKey: string;
};

export type RenderThoughtOptions = {
  /** subjectKeys to avoid when alternatives exist (whisper anti-repetition). */
  suppressSubjects?: readonly string[];
};

// ---------------------------------------------------------------------------
// Fragment pools
// ---------------------------------------------------------------------------

type Tint = 'UP' | 'DOWN' | 'FLAT';

const STANCE_POOLS: Record<`${MoodLabel}:${Tint}`, readonly string[]> = {
  'CONTENT:UP': [
    '{self} carries the day lightly, for once.',
    'Something has gone right, and {self} lets it stay.',
    '{self} hums an old tune under their breath.',
  ],
  'CONTENT:DOWN': [
    '{self} is content, mostly — though one small ache refuses to close.',
    "A good day, {self} thinks, if one doesn't look too closely at it.",
    "{self} holds the day's warmth close, careful of the draught beneath it.",
  ],
  'CONTENT:FLAT': [
    '{self} is at ease, the hours passing without asking anything.',
    'A rare stillness has settled over {self}.',
    '{self} wants for little today, and knows better than to say so aloud.',
  ],
  'NEUTRAL:UP': [
    '{self} feels the day tilting, faintly, toward better.',
    'Nothing is wrong, exactly, and {self} counts that as a kind of win.',
    "{self} notices a lightness that wasn't there yesterday.",
  ],
  'NEUTRAL:DOWN': [
    '{self} moves through the day a half-step slower than usual.',
    'Something nags at {self}, low and quiet, like a stone in a boot.',
    "{self} can't name what's off — only that something is.",
  ],
  'NEUTRAL:FLAT': [
    'The day passes through {self} like weather.',
    '{self} keeps busy, which is almost the same as being well.',
    '{self} watches the hours go and lets them.',
  ],
  'UNSATISFIED:UP': [
    'It has been a thin stretch, but {self} feels it loosening.',
    '{self} is tired of waiting, though today the waiting weighs a little less.',
    'A small mercy has found {self}, and it almost helps.',
  ],
  'UNSATISFIED:DOWN': [
    '{self} is wearing thin, and knows it.',
    'The days keep taking more than they give, {self} thinks.',
    '{self} turns the same grievance over and over, finding no new side to it.',
  ],
  'UNSATISFIED:FLAT': [
    '{self} is restless in the old familiar way.',
    'Not enough — the words follow {self} through the day.',
    "{self} keeps waiting for the change that doesn't come.",
  ],
  'DESPAIRING:UP': [
    'From somewhere very low, {self} feels the first inch of climbing.',
    '{self} is hollowed out, but today the hollow echoes a little less.',
    'One thin thread of light, and {self} holds onto it.',
  ],
  'DESPAIRING:DOWN': [
    '{self} has stopped expecting the days to be kind.',
    'The dark has settled in {self} like it means to stay.',
    '{self} goes through the motions, and the motions barely notice.',
  ],
  'DESPAIRING:FLAT': [
    '{self} is very far away from everything today.',
    "There is a grey to {self}'s hours that nothing colours.",
    '{self} carries something heavy and has forgotten how to set it down.',
  ],
};

const SUBJECT_POOLS: Record<string, readonly string[]> = {
  'BELIEF:TRUSTS': [
    'If it all went wrong tomorrow, {other} is the one {self} would want at the door.',
    '{self} finds, without deciding to, that {other} has become load-bearing.',
    'Some people you check on; {other}, {self} simply believes in.',
  ],
  'BELIEF:DISTRUSTS': [
    "{self} keeps half an eye on {other}, and hates that it's necessary.",
    'Whatever {other} says lately, {self} weighs it twice.',
    'There is a door in {self} that {other} used to walk through freely. Not anymore.',
  ],
  'BELIEF:ADMIRES': [
    '{self} keeps returning to the way {other} handled it — steadier than most would have been.',
    'There is something in {other} lately that {self} is quietly studying.',
    '{self} would not say it aloud, but {other} has been better at this than anyone.',
  ],
  'BELIEF:RESENTS': [
    'The argument with {other} is over, but {self} keeps finding pieces of it.',
    '{self} rehearses what should have been said to {other}, too late to matter.',
    'Every time {other} laughs across the room, something in {self} tightens.',
  ],
  'BELIEF:OWES': [
    '{self} still owes {other} for that day, and the debt sits awkwardly.',
    '{other} did not have to do what they did. {self} has not forgotten.',
    "Somewhere in {self}'s ledger there is a line under {other}'s name that gold won't clear.",
  ],
  'BELIEF:FEARS': [
    '{self} has started planning the room around where {other} is standing.',
    "When {other}'s name comes up, {self} goes quiet and counts exits.",
    '{self} would rather face weather than whatever {other} is becoming.',
  ],
  'MEMORY:WITNESSED_DEATH': [
    "{other}'s last moments keep arriving uninvited, in the middle of ordinary things.",
    '{self} still sets a place in their mind where {other} used to stand.',
    'The world kept going after {other} fell. {self} has not entirely kept going with it.',
  ],
  'MEMORY:BETRAYED_BY': [
    '{self} replays the moment {other} turned, looking for the warning that was not there.',
    'Trust used to come easily to {self}. {other} saw to the end of that.',
    '{self} wonders what it cost {other} to do it — and suspects the answer is nothing.',
  ],
  'MEMORY:SAVED_BY': [
    '{self} is alive because {other} moved first. That fact rearranges things.',
    "In the quiet, {self} returns to the moment {other}'s hand found them.",
    '{self} has faced down worse than dying; being saved by {other} was somehow harder.',
  ],
  'MEMORY:FIRST_KILL': [
    'The first one never leaves, they said. They were right; {self} carries it still.',
    '{self} scrubbed the blade clean long ago. The rest does not scrub.',
    '{self} remembers exactly how quiet it went, after.',
  ],
  'MEMORY:NEAR_DEATH': [
    '{self} came within a breath of the end, and the breath is still held.',
    'Since that day, {self} notices doors, exits, the width of a blade.',
    'Death leaned close to {self} once and whispered. The words are gone; the weight is not.',
  ],
  'MEMORY:QUEST_TRIUMPH': [
    '{self} returns to the triumph like a coal to warm both hands on.',
    'For one day, at least, {self} was exactly who they set out to be.',
    'The songs got it mostly wrong, {self} thinks, but the winning was real.',
  ],
  'MEMORY:GOAL_ACHIEVED': [
    '{self} did the thing they came here to do. The strange part is the quiet after.',
    'The goal is behind {self} now, and the road ahead is unmarked.',
    '{self} built a whole self around wanting it. Now it wants replacing.',
  ],
  'MEMORY:LUCK_CURSE': [
    'The luck has been wrong lately, and {self} has begun to take it personally.',
    '{self} can feel the odds leaning, though no one else believes it.',
    'Somewhere, {self} is sure, a coin keeps landing against them.',
  ],
  'MEMORY:MARK_FOR_DEATH': [
    "A shadow has been following {self}'s name around, and {self} half knows it.",
    '{self} wakes some nights certain of being aimed at.',
    'Lately {self} checks the sky the way others check a wound.',
  ],
  'MEMORY:SEND_DREAM': [
    'The dream is days old now and still will not fold away.',
    '{self} keeps returning to the dream, certain it was addressed to them.',
    "Something visited {self}'s sleep and left the furniture moved.",
  ],
  'GOALGAP:HEROISM': [
    'The songs {self} means to earn are still unwritten, and the days keep passing.',
    '{self} measures the distance between who they are and the hero they intended.',
    'Every quiet week feels, to {self}, like a page torn from the legend.',
  ],
  'GOALGAP:WEALTH': [
    "{self} counts what's saved and finds, as always, that it isn't enough.",
    "The fortune {self} came for is still out there, in someone else's purse.",
    '{self} dreams in ledgers lately — columns that refuse to balance.',
  ],
  'GOALGAP:BELONGING': [
    "{self} watches the others' easy laughter and wonders what the trick of it is.",
    'This could be home, {self} thinks, if home would just look back.',
    '{self} is tired of being a guest in every room.',
  ],
  'GOALGAP:REVENGE': [
    'The name {self} keeps is sharp from handling. Someday it will be used.',
    'Patience, {self} counsels the old wound. Patience.',
    '{self} feeds the grudge daily, small meals, keeping it strong for the road.',
  ],
  'GOALGAP:WANDERLUST': [
    'The horizon has been calling {self} by name again.',
    "{self}'s feet have been restless; the town's edges feel closer every day.",
    'Somewhere unvisited is missing {self}, and {self} feels it.',
  ],
  'GOALGAP:PEACE': [
    'All {self} wants is a stretch of unremarkable days, and the world keeps declining.',
    '{self} guards the small calm like a candle in weather.',
    'Quiet — real quiet — is the only treasure {self} still counts.',
  ],
  WANT: [
    "Underneath the day's work, the old longing: {want}.",
    '{self} would trade much, quietly, {want}.',
    "Some wishes wear grooves from use. {self}'s: {want}.",
  ],
  MUSING: [
    'Mostly, today, {self} thinks about nothing at all — which is its own kind of thought.',
    '{self} tallies small things: the weather, the bread, the way the light comes in.',
    'An old memory surfaces in {self}, nameless, and sinks again.',
  ],
};

/** Subject pools whose fragments interpolate {other} — candidates lacking an
 *  other-actor are skipped for these. */
const SUBJECT_NEEDS_OTHER = new Set([
  'BELIEF:TRUSTS', 'BELIEF:DISTRUSTS', 'BELIEF:ADMIRES',
  'BELIEF:RESENTS', 'BELIEF:OWES', 'BELIEF:FEARS',
  'MEMORY:WITNESSED_DEATH', 'MEMORY:BETRAYED_BY', 'MEMORY:SAVED_BY',
]);

type Register = 'DEFIANT' | 'WISTFUL' | 'ACQUISITIVE' | 'FEARFUL' | 'HUNGRY';

const INFLECTION_POOLS: Record<Register, readonly string[]> = {
  DEFIANT: [
    'Let anyone try to talk {self} out of it.',
    "{self} has been wrong before. This isn't one of those times.",
    'Opinions have been offered. {self} declines them.',
  ],
  WISTFUL: [
    'Mostly {self} hopes the others are carrying their own days all right.',
    'It would be good, {self} thinks, if everyone came through this whole.',
    "{self} feels the room's weather as keenly as their own.",
  ],
  ACQUISITIVE: [
    'And somewhere in it, {self} is already counting what it might be worth.',
    'There is an angle in this somewhere; {self} just has not found the edge yet.',
    '{self} appraises even this, out of habit.',
  ],
  FEARFUL: [
    '{self} keeps near the walls today, just in case.',
    'Best not to be noticed, {self} decides. Best to be small.',
    '{self} rehearses the ways out, quietly, twice.',
  ],
  HUNGRY: [
    "It isn't enough. It's never quite enough, and {self} likes that about themselves.",
    '{self} can feel the next rung from here.',
    'Someday they will say the name {self} is building. Louder.',
  ],
};

const HOOK_POOLS: Record<'WARMED' | 'COOLED', readonly string[]> = {
  WARMED: [
    'And things with {other} are easier lately — {self} has noticed, and said nothing.',
    'Whatever shifted with {other}, {self} would like it to keep.',
    '{other} has been closer these days. It helps more than {self} admits.',
    'There is a new warmth in the direction of {other}, and {self} keeps glancing at it.',
  ],
  COOLED: [
    'And {other} has gone distant, which {self} pretends not to track.',
    'Something with {other} has cooled; {self} cannot find the moment it happened.',
    '{self} and {other} keep missing each other lately, in the way that is not chance.',
    'The silence from {other} has edges.',
  ],
};

/** Every pool, keyed for the coverage test (≥ 3 variants per key). */
export const THOUGHT_POOLS: Record<string, readonly string[]> = {
  ...Object.fromEntries(Object.entries(STANCE_POOLS).map(([k, v]) => [`STANCE:${k}`, v])),
  ...Object.fromEntries(Object.entries(SUBJECT_POOLS).map(([k, v]) => [`SUBJECT:${k}`, v])),
  ...Object.fromEntries(Object.entries(INFLECTION_POOLS).map(([k, v]) => [`INFLECTION:${k}`, v])),
  ...Object.fromEntries(Object.entries(HOOK_POOLS).map(([k, v]) => [`HOOK:${k}`, v])),
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const HOOK_WINDOW_TICKS = 48;
const MEMORY_HORIZON_TICKS = 30 * 24;
const INFLECTION_CHANCE = 0.7;
const HOOK_CHANCE = 0.75;

type SubjectCandidate = {
  key: string;        // full subjectKey, e.g. "BELIEF:DISTRUSTS:npc:halden"
  pool: string;       // SUBJECT_POOLS key, e.g. "BELIEF:DISTRUSTS"
  salience: number;
  otherId?: ActorId | undefined;
};

function pick<T>(arr: readonly T[], stream: SeededRNG): T {
  return arr[Math.floor(stream.next() * arr.length)]!;
}

function resolveName(ctx: SimulationContext, id: ActorId): string {
  return ctx.adventurers.get(id)?.identity.name ?? ctx.notableNpcs.get(id)?.name ?? 'someone';
}

function interpolate(
  fragment: string,
  slots: { self: string; other?: string | undefined; want?: string | undefined },
): string {
  return fragment
    .replaceAll('{self}', slots.self)
    .replaceAll('{other}', slots.other ?? 'someone')
    .replaceAll('{want}', slots.want ?? '');
}

function registerFor(p: PersonalityAxes): Register | undefined {
  if ((p.stubborn ?? 0) >= 70) return 'DEFIANT';
  if (p.empathy >= 60) return 'WISTFUL';
  if (p.greed >= 70) return 'ACQUISITIVE';
  if (p.courage <= 30) return 'FEARFUL';
  if (p.ambition >= 70) return 'HUNGRY';
  return undefined;
}

/** Fields the grammar reads from either actor shape. NPC interiority fields
 *  (history/moodFactors/want) are read defensively until p12b makes them real. */
type ActorView = {
  name: string;
  mood: number;
  moodFactors: MoodFactor[];
  personality: PersonalityAxes;
  history: HistoryEvent[];
  goal?: { goal: Adventurer['personalGoalProgress']['goal']; completed: boolean } | undefined;
  want?: string | undefined;
};

function viewActor(ctx: SimulationContext, actorId: ActorId): ActorView | undefined {
  const adv = ctx.adventurers.get(actorId);
  if (adv) {
    if (adv.state === 'DEAD' || adv.state === 'RETIRED') return undefined;
    return {
      name: adv.identity.name,
      mood: adv.mood,
      moodFactors: adv.moodFactors,
      personality: adv.personality,
      history: adv.history,
      goal: { goal: adv.personalGoalProgress.goal, completed: adv.personalGoalProgress.completed },
    };
  }
  const npc = ctx.notableNpcs.get(actorId) as
    | (NotableNpc & { moodFactors?: MoodFactor[]; history?: HistoryEvent[]; want?: { id: string; text: string } })
    | undefined;
  if (npc) {
    return {
      name: npc.name,
      mood: npc.mood ?? 50,
      moodFactors: npc.moodFactors ?? [],
      personality: {
        courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0,
        ...npc.traits,
      },
      history: npc.history ?? [],
      want: npc.want?.text,
    };
  }
  return undefined;
}

function subjectCandidates(
  ctx: SimulationContext,
  actorId: ActorId,
  view: ActorView,
): SubjectCandidate[] {
  const now = ctx.worldTime.tick;
  const candidates: SubjectCandidate[] = [];

  // Top beliefs (already sorted by conviction).
  for (const belief of deriveBeliefs(ctx, actorId).slice(0, 3)) {
    candidates.push({
      key: `BELIEF:${belief.kind}:${belief.aboutId}`,
      pool: `BELIEF:${belief.kind}`,
      salience: 1 + belief.conviction,
      otherId: belief.aboutId,
    });
  }

  // The heaviest recent memory (weight × recency).
  let best: { entry: HistoryEvent; salience: number } | undefined;
  for (const entry of view.history) {
    const age = now - entry.tick;
    const recency = Math.max(0.1, 1 - age / MEMORY_HORIZON_TICKS);
    const normalizedWeight = Math.min(Math.abs(entry.weight), 10) / 10;
    const salience = 0.4 + normalizedWeight * recency;
    if (!best || salience > best.salience) best = { entry, salience };
  }
  if (best && SUBJECT_POOLS[`MEMORY:${best.entry.kind}`]) {
    candidates.push({
      key: `MEMORY:${best.entry.kind}:${best.entry.tick}`,
      pool: `MEMORY:${best.entry.kind}`,
      salience: best.salience,
      otherId: best.entry.involvedIds.find(id => id !== actorId),
    });
  }

  // Goal gap (adventurers) / want (NPCs).
  if (view.goal && !view.goal.completed) {
    candidates.push({ key: `GOALGAP:${view.goal.goal}`, pool: `GOALGAP:${view.goal.goal}`, salience: 0.9 });
  }
  if (view.want) {
    candidates.push({ key: 'WANT', pool: 'WANT', salience: 0.9 });
  }

  // Fragments that interpolate {other} need one.
  const valid = candidates.filter(c => !SUBJECT_NEEDS_OTHER.has(c.pool) || c.otherId !== undefined);

  // Idle-mind fallback so a thought always renders.
  valid.push({ key: 'MUSING', pool: 'MUSING', salience: 0.25 });
  return valid;
}

function weightedPick(candidates: SubjectCandidate[], stream: SeededRNG): SubjectCandidate {
  const total = candidates.reduce((sum, c) => sum + c.salience, 0);
  let roll = stream.next() * total;
  for (const c of candidates) {
    roll -= c.salience;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1]!;
}

/** Largest-|delta| relationship-history entry within the hook window. */
function findHook(
  ctx: SimulationContext,
  actorId: ActorId,
): { otherId: ActorId; delta: number } | undefined {
  const edges = ctx.relationships.get(actorId);
  if (!edges) return undefined;
  const cutoff = ctx.worldTime.tick - HOOK_WINDOW_TICKS;
  let bestHook: { otherId: ActorId; delta: number } | undefined;
  for (const [otherId, edge] of edges) {
    for (let i = edge.history.length - 1; i >= 0; i--) {
      const entry = edge.history[i];
      if (!entry) continue;
      if (entry.tick < cutoff) break;
      if (entry.delta !== 0 && (!bestHook || Math.abs(entry.delta) > Math.abs(bestHook.delta))) {
        bestHook = { otherId, delta: entry.delta };
      }
    }
  }
  return bestHook;
}

/**
 * Render an actor's current thought. Pure: never consumes ctx.rng; randomness
 * comes from the derived (worldSeed, actorId, tick) stream. Returns undefined
 * for DEAD/RETIRED/unknown actors.
 */
export function renderThought(
  ctx: SimulationContext,
  actorId: ActorId,
  opts: RenderThoughtOptions = {},
): RenderedThought | undefined {
  const view = viewActor(ctx, actorId);
  if (!view) return undefined;

  const stream = new SeededRNG(`${ctx.worldSeed}:thought:${actorId}:${ctx.worldTime.tick}`);

  // Stance.
  const band = moodThresholdLabel(view.mood);
  const top = topMoodFactors(view.moodFactors, 1)[0];
  const tint: Tint = !top || top.value === 0 ? 'FLAT' : top.value > 0 ? 'UP' : 'DOWN';
  const stance = pick(STANCE_POOLS[`${band}:${tint}`], stream);

  // Subject (suppression only applies while alternatives remain).
  let candidates = subjectCandidates(ctx, actorId, view);
  if (opts.suppressSubjects?.length) {
    const suppressed = new Set(opts.suppressSubjects);
    const remaining = candidates.filter(c => !suppressed.has(c.key));
    if (remaining.length > 0) candidates = remaining;
  }
  const subject = weightedPick(candidates, stream);
  const subjectText = pick(SUBJECT_POOLS[subject.pool]!, stream);

  // Inflection.
  const register = registerFor(view.personality);
  const inflection =
    register && stream.next() < INFLECTION_CHANCE
      ? pick(INFLECTION_POOLS[register], stream)
      : undefined;

  // Hook (skipped when it would repeat the subject's counterpart).
  const hook = findHook(ctx, actorId);
  const hookText =
    hook && hook.otherId !== subject.otherId && stream.next() < HOOK_CHANCE
      ? pick(HOOK_POOLS[hook.delta > 0 ? 'WARMED' : 'COOLED'], stream)
      : undefined;

  const slots = {
    self: view.name,
    other: subject.otherId ? resolveName(ctx, subject.otherId) : undefined,
    want: view.want,
  };
  const parts = [
    interpolate(stance, slots),
    interpolate(subjectText, slots),
    inflection ? interpolate(inflection, slots) : undefined,
    hookText && hook
      ? interpolate(hookText, { self: view.name, other: resolveName(ctx, hook.otherId) })
      : undefined,
  ].filter((p): p is string => p !== undefined);

  return { text: parts.join(' '), subjectKey: subject.key };
}

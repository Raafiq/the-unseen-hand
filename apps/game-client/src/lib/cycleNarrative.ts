/**
 * Cycle narrative — the deterministic **template tier** of the per-character reads.
 *
 * Spec: specs/behaviors/cycle-narrative.md (template tier), specs/behaviors/narrative-voice.md
 *
 * Turns a PROCEED `CycleDigest` + the `eventLog` slice into per-character **chapters**
 * (a 2-4 sentence prose passage of that character's morning / afternoon / night) plus a
 * guild-level **cycle overview**. This is the Wildermyth model — authored fragment pools
 * selected through a derived read-only RNG stream, no AI. It is the sole tier when no API
 * key is present (P15c layers the LLM on top and replaces the passage when it arrives).
 *
 * Determinism boundary (non-negotiable, cycle-narrative.md §"Determinism boundary"):
 * composition is a pure *view* over the deterministic event log. It never mutates `eventLog`
 * or any simulation state, never touches `ctx.rng`, and issues no network/LLM call. Fragment
 * selection flows through a stream hashed from `(worldSeed, actorId, fromTick)` — exactly the
 * pattern on-demand thought renders use (thoughtGrammar.ts `renderThought`) — so composing (or
 * re-composing) a chapter can never perturb the replayable record.
 */
import {
  SeededRNG,
  moodThresholdLabel,
  type SimulationContext,
  type SimulationEvent,
  type CycleDigest,
  type Cycle,
  type MoodLabel,
} from '@ugs/core';
import { getInvolvedIds } from './eventInvolvement';
import { hiddenEventKinds } from './featureFlags';

type EventKind = SimulationEvent['kind'];

export interface CycleChapter {
  actorId: string;
  name: string;
  day: number;
  cycle: Cycle;
  text: string;
  eventCount: number; // how many significant events the chapter narrates
}

export interface CycleReads {
  digest: CycleDigest;
  overview: string;
  chapters: CycleChapter[];
}

// ---------------------------------------------------------------------------
// Significance — the single "does this belong in a chapter" bar
// ---------------------------------------------------------------------------

// The kinds that clear the chapter significance bar (cycle-narrative.md §"What belongs
// in a character's chapter"): combat beats, social outcomes, relationship driver events,
// lifecycle events, quest outcomes, notable-NPC encounters, and their own surfaced
// thoughts. Pure ambient world flavour (WORLD), divine bookkeeping (DIVINE), decision
// cards (DECISION_MOMENT) and low-signal activity churn (ACTIVITY) are excluded.
const MEANINGFUL_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  'COMBAT', 'SOCIAL', 'RELATIONSHIP', 'LIFECYCLE', 'QUEST', 'NPC', 'THOUGHT',
]);

/**
 * Whether an event is significant enough to narrate in `actorId`'s chapter. Combines the
 * meaningful-kind bar with `getInvolvedIds` (the same resolution the feed uses) and the
 * feed's `hiddenEventKinds` gate — so the chapter never surfaces a kind the feed hides,
 * and the two can't disagree about involvement.
 */
export function isSignificantForChapter(event: SimulationEvent, actorId: string): boolean {
  if (!MEANINGFUL_KINDS.has(event.kind)) return false;
  if (hiddenEventKinds().has(event.kind)) return false;
  return getInvolvedIds(event).includes(actorId);
}

/** The significant events for `actorId` within the digest's cycle window, chronological.
 *  Window is `(fromTick, toTick]`: a PROCEED advances then emits, so a cycle's events carry
 *  ticks `fromTick+1 .. toTick`; `fromTick` itself belongs to the prior cycle's boundary. */
function cycleEventsFor(ctx: SimulationContext, digest: CycleDigest, actorId: string): SimulationEvent[] {
  return ctx.eventLog
    .filter(e => e.tick > digest.fromTick && e.tick <= digest.toTick)
    .filter(e => isSignificantForChapter(e, actorId))
    .sort((a, b) => a.tick - b.tick);
}

// ---------------------------------------------------------------------------
// Fragment pools (narrative-voice.md grammar conventions: subject + beat + colour)
// ---------------------------------------------------------------------------

const pick = <T>(pool: readonly T[], rng: SeededRNG): T => pool[rng.nextInt(0, pool.length - 1)]!;

/** Pick avoiding fragments already used this chapter (anti-repetition), falling back to the
 *  full pool once every variant is spent. Deterministic — still drawn from the given stream. */
function pickFresh(pool: readonly string[], rng: SeededRNG, used: Set<string>): string {
  const fresh = pool.filter(p => !used.has(p));
  const choice = pick(fresh.length > 0 ? fresh : pool, rng);
  used.add(choice);
  return choice;
}

// A cycle chapter stays a *read*, not a report: cap how many event sentences it narrates
// (cycle-narrative.md §"Length and voice"). Extra events still count toward the overview's
// eventfulness but are not each spelled out.
const MAX_EVENT_SENTENCES = 4;

// Light transitions that break the "{Name}… {Name}… {Name}…" monotony of stacked POV
// sentences. Weighted toward empty so the feed is not uniformly ornate.
const TRANSITIONS: readonly string[] = ['', '', '', 'Later, ', 'Then ', 'Before long, '];

// Opening beat, keyed by (cycle, mood band). Names the character ({self}); sets the tone.
const OPENING_POOLS: Record<string, readonly string[]> = {
  'MORNING:CONTENT':     ['Morning came kindly to {self}.', '{self} met the morning with an easy heart.'],
  'MORNING:NEUTRAL':     ['{self} rose to an unremarkable morning.', 'The morning found {self} going through the motions.'],
  'MORNING:UNSATISFIED': ['{self} greeted the morning with a knot of unease.', 'Morning brought {self} little comfort.'],
  'MORNING:DESPAIRING':  ['{self} dragged themselves into a grey morning.', 'Morning weighed on {self} before it had begun.'],
  'AFTERNOON:CONTENT':     ['The afternoon treated {self} well.', '{self} moved through the afternoon lightly.'],
  'AFTERNOON:NEUTRAL':     ['{self} spent the afternoon much as any other.', 'The afternoon passed around {self} without event.'],
  'AFTERNOON:UNSATISFIED': ['{self} carried a restlessness through the afternoon.', 'The afternoon grated on {self}.'],
  'AFTERNOON:DESPAIRING':  ['{self} endured a long, heavy afternoon.', 'The afternoon closed in around {self}.'],
  'NIGHT:CONTENT':     ['Night settled gently over {self}.', '{self} came to the night at peace.'],
  'NIGHT:NEUTRAL':     ['Night found {self} winding down.', '{self} let the night arrive without ceremony.'],
  'NIGHT:UNSATISFIED': ['{self} met the night still ill at ease.', 'Night gave {self} no quarter.'],
  'NIGHT:DESPAIRING':  ['{self} faced the night hollowed out.', 'The night pressed down on {self}.'],
};

// Optional closing colour, keyed by cycle. Appended on a fraction of chapters so the read
// is not uniformly ornate (narrative-voice.md §colour).
const CLOSING_POOLS: Record<Cycle, readonly string[]> = {
  MORNING:   ['By midday it had folded into the day\'s work.', 'The morning gave way, and the guild pressed on.'],
  AFTERNOON: ['The afternoon light thinned toward evening.', 'And then the day tipped over into dusk.'],
  NIGHT:     ['Sleep, when it came, came uneasily.', 'The guild-hall went dark, one lamp at a time.'],
};
const CLOSING_CHANCE = 0.5;

// POV beat pools for **symmetric** shared events — outcomes both parties share equally, so
// framing either as the subject preserves the truth. Each fragment is a predicate clause;
// the sentence is `${selfName} ${clause}.`, with `{others}` filled by the co-participants'
// names. Directional events (BETRAYAL, KINDNESS giver/receiver) are deliberately absent — a
// naive POV frame would invert their meaning, so those fall back to the shared renderedText.
const POV_POOLS: Record<string, readonly string[]> = {
  'SOCIAL:BANTER':         ['shared an easy laugh with {others}', 'traded jokes with {others}', 'fell into easy banter with {others}'],
  'SOCIAL:SOLIDARITY':     ['stood shoulder to shoulder with {others}', 'found common ground with {others}', 'drew closer to {others}'],
  'SOCIAL:BREAKTHROUGH':   ['finally understood {others}', 'reached a new understanding with {others}', 'broke through to {others}'],
  'SOCIAL:SILENT_DISTANCE':['grew quiet around {others}', 'kept {others} at arm\'s length', 'let the distance to {others} widen'],
  'SOCIAL:ARGUMENT':       ['traded sharp words with {others}', 'let an old grievance with {others} boil over', 'clashed with {others}, and neither backed down'],
  'SOCIAL:ESTRANGEMENT':   ['turned away from {others} for good', 'let the rift with {others} harden', 'walked away from {others}'],
  'RELATIONSHIP:SHARED_DANGER': ['faced death beside {others}', 'survived the peril alongside {others}', 'came through the danger with {others}'],
  'LIFECYCLE:FRIENDSHIP_FORMED':          ['found a friend in {others}', 'struck up a friendship with {others}'],
  'LIFECYCLE:TRUSTED_COMPANION_BOND_FORMED': ['came to trust {others} completely', 'forged an unbreakable bond with {others}'],
  'LIFECYCLE:RECONCILIATION': ['made peace with {others}', 'mended things with {others}'],
  'LIFECYCLE:RIVALRY_DEEPENED': ['let the rivalry with {others} sharpen', 'squared off against {others} once more'],
  'LIFECYCLE:BOND_BROKEN':    ['saw the bond with {others} break', 'lost what they had with {others}'],
  'COMBAT:BEAT_LOG':      ['fought alongside {others}', 'held the line with {others}', 'traded blows in the dark beside {others}'],
  'COMBAT:QUEST_RESOLVED':['saw the quest through with {others}', 'came home from the field with {others}'],
  'QUEST:STARTED':   ['set out with {others}', 'took to the road alongside {others}'],
  'QUEST:COMPLETED': ['saw the work done with {others}', 'claimed the victory alongside {others}'],
  'QUEST:FAILED':    ['tasted defeat beside {others}', 'came up short alongside {others}'],
};

// Guild-level cycle overview — an establishing passage, always present. First sentence keyed
// by cycle; an optional second sentence reflects how eventful the cycle was for the guild.
const OVERVIEW_OPEN: Record<Cycle, readonly string[]> = {
  MORNING:   ['Morning broke over the guild-hall.', 'A new morning came to Thornvale.'],
  AFTERNOON: ['The afternoon wore on over the guild.', 'Thornvale settled into its afternoon.'],
  NIGHT:     ['Night drew in around the guild-hall.', 'Darkness gathered over Thornvale.'],
};
const OVERVIEW_ACTIVE: readonly string[] = [
  'It was not a quiet one.',
  'There was much to carry by its end.',
  'The day left its mark on more than one of them.',
];
const OVERVIEW_QUIET: readonly string[] = [
  'Little stirred, and the hours passed unremarked.',
  'It asked little of anyone.',
];

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const interpolate = (template: string, slots: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? `{${key}}`);

function resolveName(ctx: SimulationContext, id: string): string | undefined {
  return ctx.adventurers.get(id)?.identity.name ?? ctx.notableNpcs.get(id)?.name;
}

/** Oxford-joined display names: "A", "A and B", "A, B, and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Render one event as a sentence in `actorId`'s chapter. Symmetric shared events with a POV
 * pool are re-cast with the actor as subject (so the same event reads differently in each
 * participant's chapter); everything else falls back to the event's already-character-centric
 * grammar line (`renderedText`), which is complete prose by construction.
 */
function renderEventPOV(
  ctx: SimulationContext,
  event: SimulationEvent,
  actorId: string,
  rng: SeededRNG,
  index: number,
  usedByPool: Map<string, Set<string>>,
): string {
  const selfName = resolveName(ctx, actorId) ?? actorId;
  const poolKey = 'subtype' in event ? `${event.kind}:${event.subtype}` : undefined;
  const pool = poolKey ? POV_POOLS[poolKey] : undefined;
  if (pool && poolKey) {
    const others = getInvolvedIds(event)
      .filter(id => id !== actorId)
      .map(id => resolveName(ctx, id))
      .filter((n): n is string => Boolean(n));
    if (others.length > 0) {
      const used = usedByPool.get(poolKey) ?? new Set<string>();
      usedByPool.set(poolKey, used);
      const clause = interpolate(pickFresh(pool, rng, used), { self: selfName, others: joinNames(others) });
      const transition = index === 0 ? '' : pick(TRANSITIONS, rng);
      return `${transition}${selfName} ${clause}.`;
    }
  }
  // Fallback: the event's already-character-centric grammar line, complete prose by construction.
  return event.renderedText;
}

/** Compose a single character's chapter, or null when they had no meaningful cycle events. */
export function composeChapter(
  ctx: SimulationContext,
  digest: CycleDigest,
  actorId: string,
): CycleChapter | null {
  const adv = ctx.adventurers.get(actorId);
  if (!adv) return null;
  const events = cycleEventsFor(ctx, digest, actorId);
  if (events.length === 0) return null;

  // Derived read-only stream — never ctx.rng (thoughtGrammar.ts:476 pattern). Keyed on
  // fromTick (not toTick/wall-clock) so re-composition is byte-identical.
  const rng = new SeededRNG(`${ctx.worldSeed}:cycle:${actorId}:${digest.fromTick}`);
  const band: MoodLabel = moodThresholdLabel(adv.mood);
  const self = adv.identity.name;

  const opening = interpolate(pick(OPENING_POOLS[`${digest.cycle}:${band}`]!, rng), { self });
  const narrated = events.slice(0, MAX_EVENT_SENTENCES);
  const usedByPool = new Map<string, Set<string>>();
  const sentences = narrated.map((e, i) => renderEventPOV(ctx, e, actorId, rng, i, usedByPool));
  // Keep eventful chapters tight; grant the optional closing colour only to quiet ones so the
  // whole passage stays a ~2-4 sentence read (cycle-narrative.md §"Length and voice").
  const closing = narrated.length <= 2 && rng.next() < CLOSING_CHANCE ? pick(CLOSING_POOLS[digest.cycle], rng) : undefined;

  const text = [opening, ...sentences, closing].filter(Boolean).join(' ');
  return { actorId, name: self, day: digest.day, cycle: digest.cycle, text, eventCount: events.length };
}

/** Compose the whole cycle read: the guild overview plus one chapter per eventful character. */
export function composeCycleReads(ctx: SimulationContext, digest: CycleDigest): CycleReads {
  const chapters: CycleChapter[] = [];
  for (const id of ctx.adventurers.keys()) {
    const chapter = composeChapter(ctx, digest, id);
    if (chapter) chapters.push(chapter);
  }

  const overviewRng = new SeededRNG(`${ctx.worldSeed}:cycle-overview:${digest.fromTick}`);
  const anyEvents = chapters.length > 0;
  const overview = [
    pick(OVERVIEW_OPEN[digest.cycle], overviewRng),
    pick(anyEvents ? OVERVIEW_ACTIVE : OVERVIEW_QUIET, overviewRng),
  ].join(' ');

  return { digest, overview, chapters };
}

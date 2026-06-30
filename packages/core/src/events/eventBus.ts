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
  subtype: 'POSITIVE_CHAT' | 'ARGUMENT' | 'BREAKTHROUGH' | 'SILENT_DISTANCE';
  participantIds: [AdventurerId, AdventurerId];
  relationshipDelta: number;
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

export type WorldEventInput = {
  kind: 'WORLD';
  subtype:
    | 'STORM'
    | 'PLAGUE'
    | 'WINDFALL'
    | 'MONSTER_SURGE'
    | 'TRAVELLING_MERCHANT'
    | 'RUMOUR'
    | 'QUEST_DROUGHT'
    | 'REGION_UNLOCKED'
    | 'SCENARIO_GOAL_ACHIEVED'
    | 'SCENARIO_COMPLETE'
    | 'SCENARIO_FAILED'
    | 'INTERNAL_ERROR';
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

export type ActivityEventInput = {
  kind: 'ACTIVITY';
  subtype: 'ACTIVITY_CHANGED' | 'MICRO_EVENT';
  adventurerId: AdventurerId;
  activity: ActivityId;
  prevActivity?: ActivityId;
};

export type SimulationEventInput =
  | SocialEventInput
  | CombatEventInput
  | QuestEventInput
  | LifecycleEventInput
  | WorldEventInput
  | DecisionMomentEventInput
  | DivineInterventionEventInput
  | ActivityEventInput;

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
  'SOCIAL:POSITIVE_CHAT': [
    '{a} and {b} share a warm conversation over supper.',
    '{a} and {b} fall into easy talk by the fire.',
    '{a} swaps stories with {b} late into the evening.',
    '{a} and {b} pass an hour in good company.',
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
  return line;
}

// ---------------------------------------------------------------------------
// Template engine
// ---------------------------------------------------------------------------

function advName(ctx: SimulationContext, id: AdventurerId): string {
  return ctx.adventurers.get(id)?.identity.name ?? id;
}

function questLabel(ctx: SimulationContext, questId: QuestId): string {
  const quest = [...ctx.questBoard.available, ...ctx.questBoard.active].find(q => q.id === questId);
  return quest?.name ?? questId;
}

function renderText(input: SimulationEventInput, ctx: SimulationContext): string {
  switch (input.kind) {
    case 'SOCIAL': {
      const a = advName(ctx, input.participantIds[0]);
      const b = advName(ctx, input.participantIds[1]);
      const slots = { a, b };
      return compose(`SOCIAL:${input.subtype}`, slots, ctx, `${a} and ${b} share words.`, { colourKey: 'SOCIAL' });
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
      const who = input.involvedIds[0] ? advName(ctx, input.involvedIds[0]) : 'An adventurer';
      const other = input.involvedIds[1] ? advName(ctx, input.involvedIds[1]) : 'another';
      return compose(`LIFECYCLE:${input.subtype}`, { who, other }, ctx, `${who} reaches a turning point.`);
    }
    case 'WORLD': {
      // Scenario/system announcements are deliberately fixed, dignified lines — not pooled flavour.
      const FIXED: Partial<Record<WorldEventInput['subtype'], string>> = {
        SCENARIO_GOAL_ACHIEVED: `A scenario goal has been achieved${input.goalId ? ` (${input.goalId})` : ''}.`,
        SCENARIO_COMPLETE: `The scenario is complete — the guild has prevailed.`,
        SCENARIO_FAILED: `The scenario has ended in failure.`,
        INTERNAL_ERROR: `[Simulation error — prior state restored.]`,
      };
      return compose(`WORLD:${input.subtype}`, {}, ctx, FIXED[input.subtype] ?? 'The world turns.');
    }
    case 'DECISION_MOMENT':
      return input.situationText;
    case 'DIVINE':
      return compose(`DIVINE:${input.subtype}`, {}, ctx, `The unseen hand stirs.`);
    case 'ACTIVITY': {
      const who = advName(ctx, input.adventurerId);
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

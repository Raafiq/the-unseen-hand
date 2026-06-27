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
    | 'INTERNAL_ERROR';
  regionId?: RegionId;
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

export type SimulationEventInput =
  | SocialEventInput
  | CombatEventInput
  | QuestEventInput
  | LifecycleEventInput
  | WorldEventInput
  | DecisionMomentEventInput
  | DivineInterventionEventInput;

// ---------------------------------------------------------------------------
// Template engine
// ---------------------------------------------------------------------------

function renderText(input: SimulationEventInput): string {
  switch (input.kind) {
    case 'SOCIAL': {
      const [a, b] = input.participantIds;
      switch (input.subtype) {
        case 'POSITIVE_CHAT':    return `${a} and ${b} share a warm conversation over supper.`;
        case 'ARGUMENT':         return `${a} and ${b} clash in a heated argument.`;
        case 'BREAKTHROUGH':     return `${a} and ${b} reach a moment of deep mutual understanding.`;
        case 'SILENT_DISTANCE':  return `${a} and ${b} drift apart in awkward silence.`;
      }
    }
    case 'COMBAT': {
      switch (input.subtype) {
        case 'BEAT_LOG':       return `The party returns from battle — details in the quest log.`;
        case 'QUEST_RESOLVED': return `Quest ${input.questId} has been resolved.`;
      }
    }
    case 'QUEST': {
      switch (input.subtype) {
        case 'STARTED':   return `A party sets out on quest ${input.questId}.`;
        case 'COMPLETED': return `Quest ${input.questId} ends in success.`;
        case 'FAILED':    return `Quest ${input.questId} ends in failure.`;
        case 'EXPIRED':   return `Quest ${input.questId} expires without a party.`;
        case 'DROUGHT':   return `The quest board stands empty — no work to be found.`;
      }
    }
    case 'LIFECYCLE': {
      const who = input.involvedIds[0] ?? 'An adventurer';
      switch (input.subtype) {
        case 'ADVENTURER_DIED':               return `${who} has fallen.`;
        case 'ADVENTURER_DEPARTED':           return `${who} has left the guild.`;
        case 'FRIENDSHIP_FORMED':             return `${who} and ${input.involvedIds[1] ?? 'another'} forge a new friendship.`;
        case 'TRUSTED_COMPANION_BOND_FORMED': return `${who} and ${input.involvedIds[1] ?? 'another'} become trusted companions.`;
        case 'BOND_BROKEN':                   return `The bond between ${who} and ${input.involvedIds[1] ?? 'another'} shatters.`;
        case 'RIVALRY_DEEPENED':              return `The rivalry between ${who} and ${input.involvedIds[1] ?? 'another'} darkens into enmity.`;
        case 'RECONCILIATION':                return `${who} and ${input.involvedIds[1] ?? 'another'} begin to mend old wounds.`;
        case 'GOAL_MILESTONE':                return `${who} marks progress toward their life goal.`;
        case 'GOAL_ACHIEVED':                 return `${who} has achieved their life's ambition.`;
      }
    }
    case 'WORLD': {
      const region = input.regionId ? ` in ${input.regionId}` : '';
      switch (input.subtype) {
        case 'STORM':               return `A fierce storm sweeps across the land${region}.`;
        case 'PLAGUE':              return `A plague spreads through the region${region}.`;
        case 'WINDFALL':            return `Unexpected wealth flows through the region${region}.`;
        case 'MONSTER_SURGE':       return `A surge of monsters is reported${region}.`;
        case 'TRAVELLING_MERCHANT': return `A travelling merchant arrives${region}.`;
        case 'RUMOUR':              return `Rumours stir among the populace${region}.`;
        case 'QUEST_DROUGHT':       return `Work dries up across the region${region}.`;
        case 'REGION_UNLOCKED':     return `New territory opens up${region}.`;
        case 'INTERNAL_ERROR':      return `[Simulation error — prior state restored.]`;
      }
    }
    case 'DECISION_MOMENT':
      return input.situationText;
    case 'DIVINE': {
      switch (input.subtype) {
        case 'TOUCH':            return `The unseen hand reaches out to shape events.`;
        case 'SEED_EVENT':       return `A world event is seeded by divine will.`;
        case 'SHIFT_DIFFICULTY': return `The difficulty of a region shifts.`;
        case 'OPTION_CHOSEN':    return `A divine option is chosen.`;
        case 'DI_GAINED':        return `Divine influence grows.`;
        case 'DI_SPENT':         return `Divine influence is spent.`;
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
  const renderedText = renderText(input);
  const event = { ...input, id, tick: ctx.worldTime.tick, renderedText } as SimulationEvent;
  return { ...ctx, eventLog: [...ctx.eventLog, event] };
}

/**
 * Social event resolver — daily idle-adventurer interaction system.
 *
 * Spec: specs/behaviors/social-events.md
 * Runs on day ticks only. Each idle/resting pair rolls an interaction check,
 * then selects an outcome from weighted weights.
 */
import type {
  SimulationContext,
  Adventurer,
  AdventurerId,
  RelationshipEdge,
} from '../world/types.js';
import { strengthToType, applyStrengthShift, detectThresholdEvents, createEdge } from '../relationships/graph.js';
import { upsertMoodFactor } from '../adventurers/mood.js';
import { emitEvent } from './eventBus.js';
import { updateReputation } from '../world/WorldExpansion.js';
import { grantDI } from '../divine/DivineInfluence.js';

// ---------------------------------------------------------------------------
// Interaction probability
// ---------------------------------------------------------------------------

export function computeInteractionProbability(
  a1: Adventurer,
  a2: Adventurer,
  edge: RelationshipEdge | undefined,
): number {
  let prob = 0.15;
  // Sociability bonus from empathy
  prob += (a1.personality.empathy + a2.personality.empathy) / 200 * 0.20;
  // Mood modifiers
  if (a1.mood > 70 || a2.mood > 70) prob += 0.05;
  if (a1.mood < 25 || a2.mood < 25) prob -= 0.10;
  return Math.max(0, Math.min(1, prob));
}

// ---------------------------------------------------------------------------
// Outcome weights
// ---------------------------------------------------------------------------

type SocialOutcomeType = 'POSITIVE_CHAT' | 'ARGUMENT' | 'BREAKTHROUGH' | 'SILENT_DISTANCE';

export function computeOutcomeWeights(
  a1: Adventurer,
  a2: Adventurer,
  edge: RelationshipEdge | undefined,
): Record<SocialOutcomeType, number> {
  const edgeType = edge ? strengthToType(edge.strength) : 'STRANGER';
  const unsatisfied = a1.mood < 25 || a2.mood < 25;
  const friendOrAbove = edgeType === 'FRIEND' || edgeType === 'TRUSTED_COMPANION';
  const rivalOrEnemy = edgeType === 'RIVAL' || edgeType === 'ENEMY';

  return {
    POSITIVE_CHAT:   45,
    ARGUMENT:        25 + (unsatisfied ? 20 : 0),
    BREAKTHROUGH:    10 + (friendOrAbove ? 15 : 0),
    SILENT_DISTANCE: 20 + (rivalOrEnemy ? 15 : 0),
  };
}

function pickOutcome(weights: Record<SocialOutcomeType, number>, rng: SimulationContext['rng']): SocialOutcomeType {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const roll = rng.next() * total;
  let cum = 0;
  for (const [k, w] of Object.entries(weights) as [SocialOutcomeType, number][]) {
    cum += w;
    if (roll < cum) return k;
  }
  return 'POSITIVE_CHAT';
}

// ---------------------------------------------------------------------------
// Template engine
// ---------------------------------------------------------------------------

const SOCIAL_TEMPLATES: Record<SocialOutcomeType, string[]> = {
  POSITIVE_CHAT: [
    '{A} and {B} share a quiet evening together.',
    '{A} and {B} trade stories by the fire.',
    '{A} spots {B} alone and pulls up a chair.',
  ],
  ARGUMENT: [
    '{A} and {B} have a heated disagreement.',
    '{A} and {B} clash over something petty that turns serious.',
    'Tensions between {A} and {B} finally boil over.',
  ],
  BREAKTHROUGH: [
    '{A} and {B} have an unexpected moment of understanding.',
    '{A} and {B} find common ground they had not expected.',
    'Something shifts between {A} and {B} tonight.',
  ],
  SILENT_DISTANCE: [
    '{A} and {B} avoid each other\'s company.',
    '{A} and {B} pass in the hall without a word.',
    '{A} gives {B} a wide berth.',
  ],
};

function renderSocialText(
  outcome: SocialOutcomeType,
  nameA: string,
  nameB: string,
  tick: number,
): string {
  const templates = SOCIAL_TEMPLATES[outcome];
  const idx = (tick * 31 + nameA.charCodeAt(0)) % templates.length;
  return templates[idx]!.replace('{A}', nameA).replace('{B}', nameB);
}

// ---------------------------------------------------------------------------
// Effect application
// ---------------------------------------------------------------------------

type SocialOutcomeEffects = {
  relationshipDelta: number;
  moodFactorId?: string;
  moodLabel?: string;
  moodDecayRate?: number;
  moodValue?: number;
};

const EFFECTS: Record<SocialOutcomeType, SocialOutcomeEffects> = {
  POSITIVE_CHAT:   { relationshipDelta: +5,  moodFactorId: 'SOCIAL_POSITIVE', moodLabel: 'Social bond formed', moodDecayRate: 0.20, moodValue: +8 },
  ARGUMENT:        { relationshipDelta: -8,  moodFactorId: 'SOCIAL_ARGUMENT',  moodLabel: 'Social conflict',   moodDecayRate: 0.25, moodValue: -10 },
  BREAKTHROUGH:    { relationshipDelta: +15, moodFactorId: 'SOCIAL_POSITIVE', moodLabel: 'Social bond formed', moodDecayRate: 0.20, moodValue: +20 },
  SILENT_DISTANCE: { relationshipDelta: -3 },
};

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

export function socialEventSubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.worldTime.hour !== 0) return ctx;

  const eligibleIds = [...ctx.adventurers.values()]
    .filter(a => a.state === 'IDLE' || a.state === 'RESTING')
    .map(a => a.id);

  if (eligibleIds.length < 2) return ctx;

  const visitedPairs = new Set<string>();
  let updatedCtx = ctx;

  for (let i = 0; i < eligibleIds.length; i++) {
    for (let j = i + 1; j < eligibleIds.length; j++) {
      const idA = eligibleIds[i]!;
      const idB = eligibleIds[j]!;
      const key = [idA, idB].sort().join('-');
      if (visitedPairs.has(key)) continue;
      visitedPairs.add(key);

      const a1 = updatedCtx.adventurers.get(idA)!;
      const a2 = updatedCtx.adventurers.get(idB)!;
      const edge = updatedCtx.relationships.get(idA)?.get(idB);

      // Eligibility: must have existing edge (shared quest before)
      if (!edge) continue;

      const prob = computeInteractionProbability(a1, a2, edge);
      if (updatedCtx.rng.next() > prob) continue;

      const weights = computeOutcomeWeights(a1, a2, edge);
      const outcome = pickOutcome(weights, updatedCtx.rng);
      const effects = EFFECTS[outcome];

      // Update relationship
      let graph = updatedCtx.relationships;
      const priorStrength = edge.strength;
      graph = applyStrengthShift(graph, idA, idB, effects.relationshipDelta, ctx.worldTime.tick, outcome);
      const newStrength = graph.get(idA)!.get(idB)!.strength;

      // Apply mood factors
      const updatedAdventurers = new Map(updatedCtx.adventurers);
      if (effects.moodFactorId && effects.moodValue !== undefined) {
        const factor = {
          id: effects.moodFactorId,
          label: effects.moodLabel ?? effects.moodFactorId,
          value: effects.moodValue,
          decayRate: effects.moodDecayRate ?? 0.20,
        };
        updatedAdventurers.set(idA, { ...a1, moodFactors: upsertMoodFactor(a1.moodFactors, factor) });
        updatedAdventurers.set(idB, { ...a2, moodFactors: upsertMoodFactor(a2.moodFactors, factor) });
      }

      // Update lastSharedActivity
      const lastSharedActivity = { ...updatedCtx.lastSharedActivity, [key]: ctx.worldTime.tick };

      // Build updated context before emitting events
      updatedCtx = { ...updatedCtx, adventurers: updatedAdventurers, relationships: graph, lastSharedActivity };

      // Threshold events → lifecycle events; wire reputation and DI bursts on bond milestones
      const thresholdEvents = detectThresholdEvents(idA, idB, priorStrength, newStrength);
      for (const te of thresholdEvents) {
        updatedCtx = emitEvent(updatedCtx, {
          kind: 'LIFECYCLE',
          subtype: te.type,
          involvedIds: [te.adventurerId1, te.adventurerId2],
        });
        if (te.type === 'TRUSTED_COMPANION_BOND_FORMED') {
          updatedCtx = { ...updatedCtx, reputation: updateReputation(updatedCtx.reputation, { event: 'BOND_FORMED' }) };
          updatedCtx = grantDI(updatedCtx, 8);
        } else if (te.type === 'FRIENDSHIP_FORMED') {
          updatedCtx = grantDI(updatedCtx, 8);
        }
      }

      // Social event
      const nameA = a1.identity.name;
      const nameB = a2.identity.name;
      const renderedText = renderSocialText(outcome, nameA, nameB, ctx.worldTime.tick);
      updatedCtx = emitEvent(updatedCtx, {
        kind: 'SOCIAL',
        subtype: outcome,
        participantIds: [idA, idB],
        relationshipDelta: effects.relationshipDelta,
      });

      // Override the renderedText since emitEvent generates it from the template engine
      // (social has its own richer templates; override the last event)
      const lastIdx = updatedCtx.eventLog.length - 1;
      const overridden = updatedCtx.eventLog.map((e, i) =>
        i === lastIdx ? { ...e, renderedText } : e
      );
      updatedCtx = { ...updatedCtx, eventLog: overridden };
    }
  }

  return updatedCtx;
}

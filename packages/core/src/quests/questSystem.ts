/**
 * Quest system — board seeding, party selection, outcome resolution.
 *
 * Spec: specs/behaviors/quest-system.md
 * All randomness via SimulationContext.rng. No Math.random().
 * Tests assert probability shifts, not rolled outcomes.
 */
import type {
  SimulationContext,
  Quest,
  QuestType,
  Adventurer,
  AdventurerId,
  RelationshipGraph,
} from '../world/types.js';
import { strengthToType, createEdge, applyStrengthShift } from '../relationships/graph.js';
import { transitionState } from '../adventurers/stateMachine.js';
import { upsertMoodFactor } from '../adventurers/mood.js';
import { questVolunteerWeight } from '../adventurers/personality.js';
import { emitEvent } from '../events/eventBus.js';

// ---------------------------------------------------------------------------
// Probability composition
// ---------------------------------------------------------------------------

function allPairs(ids: AdventurerId[]): [AdventurerId, AdventurerId][] {
  const pairs: [AdventurerId, AdventurerId][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push([ids[i]!, ids[j]!]);
    }
  }
  return pairs;
}

/**
 * Compute the final success probability for a quest + party.
 * Pure — no RNG involved. Tests assert THIS value, not rolled outcomes.
 */
export function computeQuestProbability(
  quest: Quest,
  party: Adventurer[],
  graph: RelationshipGraph,
  diModifier: number,
): number {
  // 1. Base: 1 - difficulty/10, floored at 0.05
  let prob = Math.max(0.05, 1 - quest.difficulty / 10);

  // 2. Party modifier: +0.05 per FRIEND/TRUSTED_COMPANION pair; -0.08 per RIVAL/ENEMY pair
  for (const [idA, idB] of allPairs(party.map(a => a.id))) {
    const edge = graph.get(idA)?.get(idB);
    if (!edge) continue;
    const type = strengthToType(edge.strength);
    if (type === 'FRIEND' || type === 'TRUSTED_COMPANION') prob += 0.05;
    else if (type === 'RIVAL' || type === 'ENEMY') prob -= 0.08;
  }

  // 3. Mood modifier: neutral (50) contributes 0; ±0.1 at extremes
  const avgMood = party.reduce((s, a) => s + a.mood, 0) / party.length;
  prob += (avgMood / 100 - 0.5) * 0.2;

  // 4. DI modifier
  prob += diModifier;

  // 5. Clamp [0.05, 0.95]
  return Math.max(0.05, Math.min(0.95, prob));
}

// ---------------------------------------------------------------------------
// Quest generation helpers
// ---------------------------------------------------------------------------

const QUEST_TYPES: QuestType[] = ['BOUNTY', 'DUNGEON', 'ESCORT', 'FETCH', 'INVESTIGATION', 'RESCUE', 'POLITICAL'];

function pickDifficulty(roll: number): number {
  // 50% 1-4, 35% 5-7, 15% 8-10
  if (roll < 0.50) return Math.ceil(roll / 0.50 * 4);         // maps [0, 0.5) → 1-4
  if (roll < 0.85) return Math.ceil((roll - 0.50) / 0.35 * 3) + 4; // → 5-7
  return Math.ceil((roll - 0.85) / 0.15 * 3) + 7;            // → 8-10
}

function generateQuest(ctx: SimulationContext, index: number): Quest {
  const difficulty = Math.max(1, Math.min(10, pickDifficulty(ctx.rng.next())));
  const type = QUEST_TYPES[Math.floor(ctx.rng.next() * QUEST_TYPES.length)]!;
  const id = `q-${ctx.worldTime.tick}-${index}`;
  return {
    id, type,
    name: `${type.charAt(0) + type.slice(1).toLowerCase()} (d${difficulty})`,
    difficulty,
    duration: difficulty * 12,
    reward: difficulty * 50 + Math.floor(ctx.rng.next() * 50),
    risk: {
      injuryChance: difficulty * 0.04,
      deathChance: difficulty * 0.01,
      criticalFailChance: difficulty * 0.03,
    },
    requiredPartySize: difficulty >= 7 ? 3 : difficulty >= 4 ? 2 : 1,
    expiresAt: ctx.worldTime.tick + 168,
    assignedParty: null,
    status: 'AVAILABLE',
  };
}

function baseQuestRate(ctx: SimulationContext): number {
  const regionCount = ctx.activeRegions.size || 1;
  return Math.max(3, regionCount * 2);
}

// ---------------------------------------------------------------------------
// Board seeding subscriber (weekly — every 168 ticks)
// ---------------------------------------------------------------------------

export function questBoardSeedingSubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.worldTime.tick === 0 || ctx.worldTime.tick % 168 !== 0) return ctx;

  const currentBoardSize = ctx.questBoard.available.length;
  const questPressure = ctx.scenario ? 0 : 0; // Phase 4: scenario.questPressure
  const n = Math.max(1, baseQuestRate(ctx) + questPressure - currentBoardSize);

  const newQuests: Quest[] = [];
  for (let i = 0; i < n; i++) {
    newQuests.push(generateQuest(ctx, i));
  }

  return {
    ...ctx,
    questBoard: {
      ...ctx.questBoard,
      available: [...ctx.questBoard.available, ...newQuests],
    },
  };
}

// ---------------------------------------------------------------------------
// Quest expiry subscriber (day tick)
// ---------------------------------------------------------------------------

const DROUGHT_TICKS = 72; // 3 days

export function questExpirySubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.worldTime.hour !== 0) return ctx;

  const tick = ctx.worldTime.tick;
  const { expired, remaining } = ctx.questBoard.available.reduce(
    (acc, q) => {
      if (q.status === 'AVAILABLE' && tick >= q.expiresAt) acc.expired.push(q);
      else acc.remaining.push(q);
      return acc;
    },
    { expired: [] as Quest[], remaining: [] as Quest[] },
  );

  if (expired.length === 0) return ctx;

  let next: SimulationContext = { ...ctx, questBoard: { ...ctx.questBoard, available: remaining } };

  // Drought: if board empty for 3+ days, fire QUEST_DROUGHT
  if (remaining.length === 0) {
    const firstEmptyTick = ctx.worldTime.tick; // approximation; Phase 3 can track precisely
    if (tick - firstEmptyTick >= DROUGHT_TICKS) {
      next = emitEvent(next, { kind: 'WORLD', subtype: 'QUEST_DROUGHT' });
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Party selection subscriber (day tick)
// ---------------------------------------------------------------------------

export function partySelectionSubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.worldTime.hour !== 0) return ctx;

  const idleAdventurers = [...ctx.adventurers.values()].filter(a => a.state === 'IDLE');
  const availableQuests = ctx.questBoard.available.filter(
    q => q.status === 'AVAILABLE' && q.assignedParty === null,
  );

  if (availableQuests.length === 0 || idleAdventurers.length === 0) return ctx;

  let updatedCtx = ctx;

  for (const quest of availableQuests) {
    const idle = [...updatedCtx.adventurers.values()].filter(a => a.state === 'IDLE');
    if (idle.length < quest.requiredPartySize) continue;

    // Rank by volunteer weight
    const ranked = idle
      .map(a => ({ adv: a, weight: questVolunteerWeight(a, quest) }))
      .filter(x => x.weight > 0)
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        // Seeded tiebreak
        return updatedCtx.rng.next() - 0.5;
      });

    if (ranked.length < quest.requiredPartySize) continue;

    // Draft top N, replace ENEMY pairs with next candidate
    let draft = ranked.slice(0, quest.requiredPartySize).map(x => x.adv);
    const candidates = ranked.slice(quest.requiredPartySize).map(x => x.adv);

    let replaced = true;
    while (replaced) {
      replaced = false;
      for (const [idA, idB] of allPairs(draft.map(a => a.id))) {
        const edge = updatedCtx.relationships.get(idA)?.get(idB);
        if (edge && strengthToType(edge.strength) === 'ENEMY') {
          // Drop lower-weighted, pull next candidate
          const loserIdx = draft.findIndex(a => a.id === idB);
          const next = candidates.shift();
          if (next) { draft[loserIdx] = next; replaced = true; }
          else { draft = []; break; }
        }
      }
      if (draft.length === 0) break;
    }

    if (draft.length < quest.requiredPartySize) continue;

    const partyIds = draft.map(a => a.id);

    // Assign party + transition adventurers
    const updatedAdventurers = new Map(updatedCtx.adventurers);
    for (const adv of draft) {
      const next = transitionState(adv, 'ON_QUEST', { isDev: false, questId: quest.id });
      updatedAdventurers.set(adv.id, { ...next, currentQuestId: quest.id });
    }

    const updatedBoard = {
      ...updatedCtx.questBoard,
      available: updatedCtx.questBoard.available.map(q =>
        q.id === quest.id ? { ...q, assignedParty: partyIds, status: 'IN_PROGRESS' as const } : q,
      ),
      active: [
        ...updatedCtx.questBoard.active,
        { ...quest, assignedParty: partyIds, status: 'IN_PROGRESS' as const },
      ],
    };

    updatedCtx = emitEvent(
      { ...updatedCtx, adventurers: updatedAdventurers, questBoard: updatedBoard },
      { kind: 'QUEST', subtype: 'STARTED', questId: quest.id, partyIds },
    );
  }

  return updatedCtx;
}

// ---------------------------------------------------------------------------
// Quest outcome resolution
// ---------------------------------------------------------------------------

export type QuestOutcomeResult = {
  ctx: SimulationContext;
  success: boolean;
  injuries: AdventurerId[];
  deaths: AdventurerId[];
  loot: number;
};

export function resolveQuest(
  quest: Quest,
  party: Adventurer[],
  ctx: SimulationContext,
  diModifier: number,
): QuestOutcomeResult {
  const prob = computeQuestProbability(quest, party, ctx.relationships, diModifier);
  const roll = ctx.rng.next();
  const success = roll < prob;

  let updatedCtx = ctx;
  const updatedAdventurers = new Map(ctx.adventurers);
  const injuries: AdventurerId[] = [];
  const deaths: AdventurerId[] = [];

  if (success) {
    const loot = quest.reward;
    for (const adv of party) {
      const next = upsertMoodFactor(adv.moodFactors, {
        id: 'QUEST_SUCCESS', label: 'Quest Success', value: 15, decayRate: 0.1,
      });
      updatedAdventurers.set(adv.id, {
        ...transitionState(adv, 'IDLE', { isDev: false, questId: null }),
        moodFactors: next,
        currentQuestId: null,
      });
    }

    // Strengthen relationships for party pairs
    let graph = updatedCtx.relationships;
    for (const [idA, idB] of allPairs(party.map(a => a.id))) {
      if (!graph.get(idA)?.has(idB)) {
        graph = new Map(graph);
        graph.set(idA, new Map(graph.get(idA) ?? []).set(idB, createEdge(0)));
        graph.set(idB, new Map(graph.get(idB) ?? []).set(idA, createEdge(0)));
      }
      graph = applyStrengthShift(graph, idA, idB, 8, ctx.worldTime.tick, 'CO_QUEST_SUCCESS');
    }

    updatedCtx = emitEvent(
      { ...updatedCtx, adventurers: updatedAdventurers, relationships: graph },
      { kind: 'QUEST', subtype: 'COMPLETED', questId: quest.id, partyIds: party.map(a => a.id) },
    );

    return { ctx: updatedCtx, success: true, injuries, deaths, loot };
  } else {
    // Failure: injury + death rolls per party member
    for (const adv of party) {
      const injRoll = ctx.rng.next();
      const deathRoll = ctx.rng.next();

      if (deathRoll < quest.risk.deathChance) {
        deaths.push(adv.id);
        updatedAdventurers.set(adv.id, {
          ...transitionState(adv, 'DEAD', { isDev: false, questId: null }),
          moodFactors: adv.moodFactors,
          currentQuestId: null,
        });
        updatedCtx = emitEvent(updatedCtx, {
          kind: 'LIFECYCLE', subtype: 'ADVENTURER_DIED', involvedIds: [adv.id],
        });
      } else if (injRoll < quest.risk.injuryChance) {
        injuries.push(adv.id);
        updatedAdventurers.set(adv.id, {
          ...transitionState(adv, 'RESTING', { isDev: false, questId: null }),
          moodFactors: upsertMoodFactor(adv.moodFactors, {
            id: 'QUEST_FAILURE', label: 'Quest Failed', value: -10, decayRate: 0.1,
          }),
          currentQuestId: null,
        });
      } else {
        updatedAdventurers.set(adv.id, {
          ...transitionState(adv, 'IDLE', { isDev: false, questId: null }),
          moodFactors: upsertMoodFactor(adv.moodFactors, {
            id: 'QUEST_FAILURE', label: 'Quest Failed', value: -10, decayRate: 0.1,
          }),
          currentQuestId: null,
        });
      }
    }

    updatedCtx = emitEvent(
      { ...updatedCtx, adventurers: updatedAdventurers },
      { kind: 'QUEST', subtype: 'FAILED', questId: quest.id, partyIds: party.map(a => a.id) },
    );

    return { ctx: updatedCtx, success: false, injuries, deaths, loot: 0 };
  }
}

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
  GoalMilestone,
} from '../world/types.js';
import { strengthToType, createEdge, applyStrengthShift } from '../relationships/graph.js';
import { transitionState } from '../adventurers/stateMachine.js';
import { upsertMoodFactor } from '../adventurers/mood.js';
import { questVolunteerWeight } from '../adventurers/personality.js';
import { emitEvent } from '../events/eventBus.js';
import { appendHistoryEvent } from '../adventurers/HistoryLayer.js';
import { generateBeats } from '../combat/beatGenerator.js';
import { updateReputation } from '../world/WorldExpansion.js';
import { grantDI } from '../divine/DivineInfluence.js';

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
  const questPressure = ctx.scenario?.questPressure ?? 0;
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

/** Factory: creates a quest expiry subscriber with its own drought-tracking state. */
export function createQuestExpirySubscriber() {
  let firstEmptyTick: number | null = null;

  return function questExpirySubscriber(ctx: SimulationContext): SimulationContext {
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

    let next: SimulationContext = expired.length > 0
      ? { ...ctx, questBoard: { ...ctx.questBoard, available: remaining } }
      : ctx;

    // Drought: available board empty for DROUGHT_TICKS consecutive ticks (active quests don't suppress drought)
    const activelyEmpty = remaining.length === 0;
    if (activelyEmpty) {
      if (firstEmptyTick === null) firstEmptyTick = tick;
      if (tick - firstEmptyTick >= DROUGHT_TICKS) {
        next = emitEvent(next, { kind: 'WORLD', subtype: 'QUEST_DROUGHT' });
        firstEmptyTick = null; // reset after firing
      }
    } else {
      firstEmptyTick = null;
    }

    return next;
  };
}

/** Convenience singleton for use in SimulationLoop. */
export const questExpirySubscriber = createQuestExpirySubscriber();

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
        { ...quest, assignedParty: partyIds, status: 'IN_PROGRESS' as const, startedAt: updatedCtx.worldTime.tick },
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
        id: 'QUEST_SUCCESS', label: 'Quest Success', value: 15, decayRate: 0.15,
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
            id: 'QUEST_FAILURE', label: 'Quest Failed', value: -20, decayRate: 0.1,
          }),
          currentQuestId: null,
        });
      } else {
        updatedAdventurers.set(adv.id, {
          ...transitionState(adv, 'IDLE', { isDev: false, questId: null }),
          moodFactors: upsertMoodFactor(adv.moodFactors, {
            id: 'QUEST_FAILURE', label: 'Quest Failed', value: -20, decayRate: 0.1,
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

// ---------------------------------------------------------------------------
// Quest resolution subscriber (runs each tick after party selection)
// ---------------------------------------------------------------------------

/** Resolves quests whose duration has elapsed: credits treasury, fires beats, records history, updates reputation. */
export function questResolutionSubscriber(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick;
  const toResolve = ctx.questBoard.active.filter(
    q => q.startedAt !== undefined && tick >= q.startedAt + q.duration,
  );

  if (toResolve.length === 0) return ctx;

  let updatedCtx = ctx;

  for (const quest of toResolve) {
    const party = (quest.assignedParty ?? [])
      .map(id => updatedCtx.adventurers.get(id))
      .filter((a): a is Adventurer => a !== undefined);

    if (party.length === 0) {
      updatedCtx = {
        ...updatedCtx,
        questBoard: { ...updatedCtx.questBoard, active: updatedCtx.questBoard.active.filter(q2 => q2.id !== quest.id) },
      };
      continue;
    }

    // Collect pending DI shifts for this party and clear them
    const pendingShifts = new Map(updatedCtx.pendingShifts);
    const diModifier = party.reduce((acc, a) => acc + (pendingShifts.get(a.id) ?? 0), 0);
    party.forEach(a => pendingShifts.delete(a.id));
    updatedCtx = { ...updatedCtx, pendingShifts };

    // Resolve outcome (transitions adventurer states, advances RNG)
    const result = resolveQuest(quest, party, updatedCtx, diModifier);
    updatedCtx = result.ctx;

    // Generate beats (uses post-resolve RNG for deterministic continuation)
    const beats = generateBeats(quest, party, ctx.relationships, updatedCtx.rng, result.success);

    // Emit BEAT_LOG combat event
    updatedCtx = emitEvent(updatedCtx, {
      kind: 'COMBAT',
      subtype: 'BEAT_LOG',
      questId: quest.id,
      involvedIds: party.map(a => a.id),
    });

    // Credit treasury on success; grant DI burst
    updatedCtx = { ...updatedCtx, treasury: updatedCtx.treasury + result.loot };
    if (result.success) {
      updatedCtx = grantDI(updatedCtx, 5);
    }

    // Append history events and quest milestones to surviving party members
    const updatedAdventurers = new Map(updatedCtx.adventurers);
    for (const origAdv of party) {
      const adv = updatedAdventurers.get(origAdv.id);
      if (!adv || result.deaths.includes(adv.id)) continue;

      let history = adv.history;
      let goalProgress = adv.personalGoalProgress;

      // FIRST_KILL: quest succeeded, adventurer has no prior FIRST_KILL event
      if (result.success && !history.some(h => h.kind === 'FIRST_KILL')) {
        history = appendHistoryEvent(history, { tick, kind: 'FIRST_KILL', involvedIds: [], weight: 1 });
      }

      // WITNESSED_DEATH: another party member died this quest
      const witnessedDeaths = result.deaths.filter(id => id !== adv.id);
      if (witnessedDeaths.length > 0) {
        history = appendHistoryEvent(history, {
          tick, kind: 'WITNESSED_DEATH', involvedIds: witnessedDeaths, weight: 2, enemyArchetype: 'UNKNOWN',
        });
      }

      // NEAR_DEATH: beats show this adventurer was brought to the brink
      if (beats.some(b => b.actorId === adv.id && b.action === 'NEAR_DEATH')) {
        history = appendHistoryEvent(history, { tick, kind: 'NEAR_DEATH', involvedIds: [], weight: 2 });
      }

      // SAVED_BY: another party member performed DEFEND_ALLY
      const saverIds = beats
        .filter(b => b.action === 'DEFEND_ALLY' && b.actorId !== adv.id)
        .map(b => b.actorId);
      if (saverIds.length > 0) {
        history = appendHistoryEvent(history, { tick, kind: 'SAVED_BY', involvedIds: saverIds, weight: 1 });
      }

      // Quest milestones (success path only)
      if (result.success) {
        const goal = adv.identity.personalGoal;
        const newMilestones: GoalMilestone[] = [];

        if (goal === 'HEROISM') {
          // Each dungeon/rescue success adds a milestone; HEROISM needs 3 total
          if (quest.type === 'DUNGEON') {
            newMilestones.push({ tick, description: 'DUNGEON_SUCCESS' });
          }
          if (quest.type === 'RESCUE') {
            newMilestones.push({ tick, description: 'RESCUE_SUCCESS' });
          }
        }

        if (goal === 'WEALTH') {
          newMilestones.push({ tick, description: `GOLD_EARNED:${quest.reward}` });
        }

        if (newMilestones.length > 0) {
          goalProgress = { ...goalProgress, milestones: [...goalProgress.milestones, ...newMilestones] };
          for (const ms of newMilestones) {
            updatedCtx = emitEvent(updatedCtx, {
              kind: 'LIFECYCLE',
              subtype: 'GOAL_MILESTONE',
              involvedIds: [adv.id],
            });
            // Patch renderedText on the emitted event with the milestone description
            const lastIdx = updatedCtx.eventLog.length - 1;
            updatedCtx = {
              ...updatedCtx,
              eventLog: updatedCtx.eventLog.map((e, i) =>
                i === lastIdx ? { ...e, renderedText: `${adv.identity.name}: ${ms.description}` } : e
              ),
            };
          }
        }
      }

      if (history !== adv.history || goalProgress !== adv.personalGoalProgress) {
        updatedAdventurers.set(adv.id, { ...adv, history, personalGoalProgress: goalProgress });
      }
    }

    // DI burst for unannounced deaths (deaths with no DEATH_IMMINENT pending decision)
    for (const deadId of result.deaths) {
      const hasMoment = updatedCtx.pendingDecisions.some(
        d => d.kind === 'DEATH_IMMINENT' && d.subjectId === deadId,
      );
      if (!hasMoment) {
        updatedCtx = grantDI(updatedCtx, 5);
      }
    }

    updatedCtx = { ...updatedCtx, adventurers: updatedAdventurers };

    // Update reputation
    updatedCtx = {
      ...updatedCtx,
      reputation: updateReputation(
        updatedCtx.reputation,
        result.success ? { event: 'QUEST_SUCCESS', difficulty: quest.difficulty } : { event: 'QUEST_FAILURE' },
      ),
    };
    for (const _id of result.deaths) {
      updatedCtx = { ...updatedCtx, reputation: updateReputation(updatedCtx.reputation, { event: 'ADVENTURER_DEATH' }) };
    }

    // Remove from active board
    updatedCtx = {
      ...updatedCtx,
      questBoard: { ...updatedCtx.questBoard, active: updatedCtx.questBoard.active.filter(q2 => q2.id !== quest.id) },
    };
  }

  return updatedCtx;
}

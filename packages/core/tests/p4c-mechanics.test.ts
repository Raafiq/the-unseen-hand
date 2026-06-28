/**
 * P4c mechanics completion tests.
 *
 * Per spec: tests assert probability shifts and state values, NOT rolled outcomes.
 */
import { describe, it, expect } from 'vitest';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { dispatch } from '../src/divine/DivineTools.js';
import {
  computeQuestProbability,
  resolveQuest,
  questResolutionSubscriber,
  createQuestExpirySubscriber,
} from '../src/quests/questSystem.js';
import { checkGoalCompletion, applyGoalCompletion } from '../src/adventurers/PersonalGoals.js';
import { grantDI } from '../src/divine/DivineInfluence.js';
import { selectBeatActionWeights } from '../src/combat/beatGenerator.js';
import type {
  SimulationContext,
  Quest,
  Adventurer,
  DecisionMoment,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdventurer(
  id: string,
  goal: Adventurer['identity']['personalGoal'] = 'HEROISM',
  overrides: Partial<Adventurer> = {},
): Adventurer {
  return {
    id,
    identity: { id, name: id, age: 25, backstory: '', personalGoal: goal },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    mood: 60,
    moodFactors: [{ id: 'BASELINE', label: 'Baseline', value: 60, decayRate: 0 }],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal, milestones: [], completed: false },
    currentQuestId: null,
    ...overrides,
  };
}

function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q-test',
    type: 'DUNGEON',
    name: 'Test Quest',
    difficulty: 3,
    duration: 1,
    reward: 150,
    risk: { injuryChance: 0.1, deathChance: 0.01, criticalFailChance: 0.05 },
    requiredPartySize: 1,
    expiresAt: 99999,
    assignedParty: null,
    status: 'AVAILABLE',
    ...overrides,
  };
}

function seedCtx(ctx: SimulationContext, advs: Adventurer[]): SimulationContext {
  const adventurers = new Map(advs.map(a => [a.id, a]));
  return { ...ctx, adventurers };
}

/**
 * Place a quest on the active board that is ready to resolve at tick 1.
 * diModifier=1.0 is forced via pendingShifts on all party members so the quest always succeeds.
 */
function setupResolvableQuest(
  ctx: SimulationContext,
  quest: Quest,
  party: Adventurer[],
  forceSuccess = true,
): SimulationContext {
  const partyIds = party.map(a => a.id);
  const activeQuest: Quest = {
    ...quest,
    assignedParty: partyIds,
    status: 'IN_PROGRESS',
    startedAt: 0,
    duration: 1, // resolves at tick >= 1
  };
  let updCtx: SimulationContext = { ...ctx, worldTime: { tick: 1, day: 0, hour: 1 } };
  updCtx = seedCtx(updCtx, party);
  updCtx = { ...updCtx, questBoard: { available: [], active: [activeQuest] } };
  if (forceSuccess) {
    const shifts = new Map(partyIds.map(id => [id, 1.0] as [string, number]));
    updCtx = { ...updCtx, pendingShifts: shifts };
  }
  return updCtx;
}

// ---------------------------------------------------------------------------
// 1. pendingShifts / CHOOSE_OPTION wiring
// ---------------------------------------------------------------------------

describe('pendingShifts — CHOOSE_OPTION writes shift, quest resolver reads it', () => {
  it('chooseOption stores probabilityShift in pendingShifts keyed by subjectId', () => {
    let ctx = createSimulationContext('shift-test');
    ctx = { ...ctx, divineInfluence: 50 };

    const moment: DecisionMoment = {
      id: 'dm-1',
      kind: 'DEATH_IMMINENT',
      tick: 0,
      situationText: 'test',
      expiresAt: 100,
      subjectId: 'adv-1',
      options: [
        { label: 'nudge', description: '', diCost: 10, probabilityShift: 0.20, narrativeDistanceLabel: 'LOW' },
      ],
    };
    ctx = { ...ctx, pendingDecisions: [moment] };

    const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: 'dm-1', optionIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ctx.pendingShifts.get('adv-1')).toBe(0.20);
    expect(result.ctx.divineInfluence).toBe(40); // 50 - 10
    expect(result.ctx.pendingDecisions).toHaveLength(0);
  });

  it('chooseOption ignores probabilityShift when subjectId is absent', () => {
    let ctx = createSimulationContext('shift-no-subject');
    ctx = { ...ctx, divineInfluence: 50 };

    const moment: DecisionMoment = {
      id: 'dm-2',
      kind: 'OTHER',
      tick: 0,
      situationText: 'test',
      expiresAt: 100,
      // no subjectId
      options: [
        { label: 'pick', description: '', diCost: 5, probabilityShift: 0.10, narrativeDistanceLabel: 'LOW' },
      ],
    };
    ctx = { ...ctx, pendingDecisions: [moment] };

    const result = dispatch(ctx, { type: 'CHOOSE_OPTION', decisionId: 'dm-2', optionIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ctx.pendingShifts.size).toBe(0);
  });

  it('pendingShift raises effective quest probability', () => {
    const adv = makeAdventurer('adv-shift');
    const quest = makeQuest({ difficulty: 5 }); // base prob ≈ 0.50
    let ctx = createSimulationContext('shift-prob');
    ctx = seedCtx(ctx, [adv]);
    ctx = { ...ctx, pendingShifts: new Map([['adv-shift', 0.20]]) };

    const baseProb = computeQuestProbability(quest, [adv], ctx.relationships, 0);
    const shiftedProb = computeQuestProbability(quest, [adv], ctx.relationships, 0.20);

    expect(shiftedProb).toBeGreaterThan(baseProb);
    expect(shiftedProb - baseProb).toBeCloseTo(0.20, 5);
  });
});

// ---------------------------------------------------------------------------
// 2. Personal goal milestones — HEROISM
// ---------------------------------------------------------------------------

describe('HEROISM goal milestones', () => {
  it('DUNGEON quest success writes DUNGEON_SUCCESS milestone (via subscriber)', () => {
    const adv = makeAdventurer('hero-1', 'HEROISM');
    const quest = makeQuest({ type: 'DUNGEON', reward: 150 });
    let ctx = createSimulationContext('milestone-dungeon');
    ctx = setupResolvableQuest(ctx, quest, [adv]);

    const result = questResolutionSubscriber(ctx);
    const updated = result.adventurers.get('hero-1')!;

    // If the adventurer is no longer ON_QUEST the resolution ran
    if (updated.state !== 'ON_QUEST') {
      // Milestone written on success
      const milestones = updated.personalGoalProgress.milestones;
      // Either DUNGEON_SUCCESS was appended (success) or none (failure - acceptable)
      // Assert: probability shift of +1.0 raises success to 0.95+
      const prob = computeQuestProbability(quest, [adv], ctx.relationships, 1.0);
      expect(prob).toBeGreaterThanOrEqual(0.95);
      // With pendingShift=1.0 quest almost certainly succeeded
      expect(milestones.some(m => m.description === 'DUNGEON_SUCCESS')).toBe(true);
    }
  });

  it('RESCUE quest success writes RESCUE_SUCCESS milestone (via subscriber)', () => {
    const adv = makeAdventurer('hero-2', 'HEROISM');
    const quest = makeQuest({ id: 'q-rescue', type: 'RESCUE', reward: 200 });
    let ctx = createSimulationContext('milestone-rescue');
    ctx = setupResolvableQuest(ctx, quest, [adv]);

    const result = questResolutionSubscriber(ctx);
    const updated = result.adventurers.get('hero-2')!;

    if (updated.state !== 'ON_QUEST') {
      expect(
        updated.personalGoalProgress.milestones.some(m => m.description === 'RESCUE_SUCCESS'),
      ).toBe(true);
    }
  });

  it('probability shift test: +1.0 diModifier gives prob ≥ 0.95 on any quest', () => {
    const adv = makeAdventurer('hero-prob', 'HEROISM');
    const quest = makeQuest({ difficulty: 8 }); // hard quest
    const ctx = createSimulationContext('prob-shift');
    const prob = computeQuestProbability(quest, [adv], ctx.relationships, 1.0);
    expect(prob).toBeGreaterThanOrEqual(0.95);
  });

  it('HEROISM adventurer accumulates multiple DUNGEON_SUCCESS milestones', () => {
    let adv = makeAdventurer('hero-3', 'HEROISM');
    let ctx = createSimulationContext('milestone-multi');

    for (let i = 0; i < 3; i++) {
      const quest = makeQuest({ id: `q-d${i}`, type: 'DUNGEON' });
      ctx = setupResolvableQuest(ctx, quest, [adv]);
      ctx = questResolutionSubscriber(ctx);
      adv = ctx.adventurers.get('hero-3')!;
    }

    const count = adv.personalGoalProgress.milestones.filter(
      m => m.description === 'DUNGEON_SUCCESS',
    ).length;
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. WEALTH goal milestones
// ---------------------------------------------------------------------------

describe('WEALTH goal milestones', () => {
  it('quest success appends GOLD_EARNED:N milestone for WEALTH adventurer (via subscriber)', () => {
    const adv = makeAdventurer('wealth-1', 'WEALTH');
    const quest = makeQuest({ id: 'q-wealth', reward: 250 });
    let ctx = createSimulationContext('milestone-gold');
    ctx = setupResolvableQuest(ctx, quest, [adv]);

    const result = questResolutionSubscriber(ctx);
    const updated = result.adventurers.get('wealth-1')!;

    if (updated.state !== 'ON_QUEST') {
      expect(
        updated.personalGoalProgress.milestones.some(m => m.description === 'GOLD_EARNED:250'),
      ).toBe(true);
    }
  });

  it('BELONGING adventurer has no quest milestones after dungeon success', () => {
    const adv = makeAdventurer('belong-1', 'BELONGING');
    const quest = makeQuest({ id: 'q-belong', type: 'DUNGEON' });
    let ctx = createSimulationContext('no-milestone-belonging');
    ctx = setupResolvableQuest(ctx, quest, [adv]);

    const result = questResolutionSubscriber(ctx);
    const updated = result.adventurers.get('belong-1')!;
    expect(updated.personalGoalProgress.milestones).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. DI burst sources
// ---------------------------------------------------------------------------

describe('DI burst sources', () => {
  it('grantDI emits DI_GAINED event and updates divineInfluence', () => {
    let ctx = createSimulationContext('di-burst');
    ctx = { ...ctx, divineInfluence: 40 };

    const result = grantDI(ctx, 5);

    expect(result.divineInfluence).toBe(45);
    const diEvent = result.eventLog.find(e => e.kind === 'DIVINE' && (e as any).subtype === 'DI_GAINED');
    expect(diEvent).toBeDefined();
  });

  it('grantDI clamps at 100 and emits no event when already at cap', () => {
    let ctx = createSimulationContext('di-cap');
    ctx = { ...ctx, divineInfluence: 100 };

    const result = grantDI(ctx, 5);
    expect(result.divineInfluence).toBe(100);
    expect(result.eventLog).toHaveLength(0);
  });

  it('applyGoalCompletion uses grantDI (DI_GAINED event emitted)', () => {
    const adv = makeAdventurer('goal-di', 'BELONGING');
    let ctx = createSimulationContext('goal-di-test');
    ctx = seedCtx(ctx, [adv]);
    ctx = { ...ctx, divineInfluence: 50 };

    const result = applyGoalCompletion(ctx, adv);

    expect(result.divineInfluence).toBe(62); // 50 + 12
    const diEvent = result.eventLog.find(e => e.kind === 'DIVINE' && (e as any).subtype === 'DI_GAINED');
    expect(diEvent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. QUEST_DROUGHT fires regardless of active quests
// ---------------------------------------------------------------------------

describe('QUEST_DROUGHT — active quests do not suppress drought', () => {
  it('drought fires after 72 empty-available ticks even with active quests', () => {
    const expirySubscriber = createQuestExpirySubscriber();

    let ctx = createSimulationContext('drought-active');
    // Put a quest on the active board but none on available
    ctx = {
      ...ctx,
      questBoard: {
        available: [],
        active: [{ ...makeQuest(), id: 'active-q', status: 'IN_PROGRESS', assignedParty: ['adv1'], startedAt: 0 }],
      },
    };

    // Simulate 72 consecutive day ticks (hour=0) with empty available board
    let droughtFired = false;
    for (let day = 0; day < 4; day++) {
      ctx = { ...ctx, worldTime: { tick: day * 24, day, hour: 0 } };
      ctx = expirySubscriber(ctx);
      if (ctx.eventLog.some(e => e.kind === 'WORLD' && (e as any).subtype === 'QUEST_DROUGHT')) {
        droughtFired = true;
        break;
      }
    }

    expect(droughtFired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. personalityNote thresholds
// ---------------------------------------------------------------------------

describe('personalityNote threshold alignment with combat-resolution.md', () => {
  it('FLEE has higher weight for courage=25 (< 30 threshold)', () => {
    const lowCourage = makeAdventurer('low', 'HEROISM', {
      personality: { courage: 25, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    });
    const highCourage = makeAdventurer('high', 'HEROISM', {
      personality: { courage: 60, greed: 50, empathy: 50, loyalty: 50, ambition: 50 },
    });

    const loWeights = selectBeatActionWeights(lowCourage, [lowCourage], new Map(), false, 6, 10);
    const hiWeights = selectBeatActionWeights(highCourage, [highCourage], new Map(), false, 6, 10);

    expect(loWeights.FLEE).toBeGreaterThan(hiWeights.FLEE);
  });

  it('DEFEND_ALLY has higher weight for loyalty=80 (> 70 threshold)', () => {
    const ally = makeAdventurer('ally', 'HEROISM');
    const highLoyalty = makeAdventurer('defender', 'HEROISM', {
      personality: { courage: 50, greed: 50, empathy: 50, loyalty: 80, ambition: 50 },
    });
    const lowLoyalty = makeAdventurer('coward', 'HEROISM', {
      personality: { courage: 50, greed: 50, empathy: 50, loyalty: 40, ambition: 50 },
    });

    const hiWeights = selectBeatActionWeights(highLoyalty, [highLoyalty, ally], new Map(), false, 7, 10);
    const loWeights = selectBeatActionWeights(lowLoyalty, [lowLoyalty, ally], new Map(), false, 7, 10);

    expect(hiWeights.DEFEND_ALLY).toBeGreaterThan(loWeights.DEFEND_ALLY);
  });
});

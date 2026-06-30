/**
 * Scenario 1: "The Failing Guild"
 *
 * Spec: specs/behaviors/scenario-engine.md#scenario-1-the-failing-guild
 *
 * Single-adventurer prototype: Kara, 30-day time limit.
 * Registry-registered at module import time.
 */
import type { Scenario, SimulationContext, Adventurer } from '../world/types.js';
import { createSimulationContext } from '../world/SimulationContext.js';
import { registerScenario } from './ScenarioEngine.js';
import { createStartingRegions } from '../world/WorldExpansion.js';
import { seedQuestBoard } from '../quests/questSystem.js';

export const SCENARIO_1_ID = 'FAILING_GUILD';

const TIME_LIMIT = 720; // 30 days × 24 ticks

// ---------------------------------------------------------------------------
// Adventurer seed IDs (stable across context resets)
// ---------------------------------------------------------------------------

export const S1_IDS = {
  kara: 's1-kara',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function livingCount(ctx: SimulationContext): number {
  return [...ctx.adventurers.values()].filter(
    a => a.state !== 'DEAD' && a.state !== 'RETIRED',
  ).length;
}

// ---------------------------------------------------------------------------
// Scenario definition
// ---------------------------------------------------------------------------

const scenario1: Scenario = {
  id: SCENARIO_1_ID,
  title: 'The Failing Guild',
  premise:
    'Kara is all that remains of a once-proud guild. A harsh winter is coming and the treasury is nearly empty.',
  startingRoster: [], // populated separately in createScenario1Context
  startingDI: 40,
  timeLimit: TIME_LIMIT,

  goals: [
    {
      id: 'SURVIVAL',
      description: 'Kara survives through day 30',
      diReward: 25,
      condition: (ctx) => ctx.worldTime.tick === TIME_LIMIT && livingCount(ctx) >= 1,
      isImminent: (ctx) => ctx.worldTime.tick > 600 && livingCount(ctx) >= 1,
    },
    {
      id: 'SOLVENT',
      description: 'Treasury above 0 at day 30',
      diReward: 20,
      condition: (ctx) => ctx.worldTime.tick === TIME_LIMIT && ctx.treasury > 0,
      isImminent: (ctx) => ctx.worldTime.tick > 600 && ctx.treasury > 0,
    },
  ],

  failConditions: [
    {
      id: 'ROSTER_COLLAPSE',
      description: 'Kara falls or departs',
      condition: (ctx) => livingCount(ctx) < 1,
    },
    {
      id: 'BANKRUPTCY',
      description: 'Treasury below 0 for 7 consecutive days',
      condition: (ctx) => {
        const since = ctx.scenario?.treasuryNegativeSince;
        if (since === null || since === undefined) return false;
        return (ctx.worldTime.tick - since) >= 168;
      },
    },
  ],
};

registerScenario(scenario1);

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

function makeAdventurer(
  id: string,
  name: string,
  age: number,
  backstory: string,
  personalGoal: Adventurer['identity']['personalGoal'],
  personality: Adventurer['personality'],
): Adventurer {
  return {
    id,
    identity: { id, name, age, backstory, personalGoal },
    personality,
    mood: 50,
    moodFactors: [{ id: 'BASELINE', label: 'Adventurer spirit', value: 30, decayRate: 0 }],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: personalGoal, milestones: [], completed: false },
    currentQuestId: null,
  };
}

/**
 * Create a fresh SimulationContext pre-loaded with Scenario 1 state.
 * Seed defaults to 'scenario-1' for reproducibility.
 */
export function createScenario1Context(seed = 'scenario-1'): SimulationContext {
  const base = createSimulationContext(seed);

  const adventurers: Map<string, Adventurer> = new Map([
    [S1_IDS.kara, makeAdventurer(
      S1_IDS.kara, 'Kara', 34,
      'Veteran who lost her previous guild in a fire. She is all that is left.',
      'BELONGING',
      { courage: 70, loyalty: 80, empathy: 50, greed: 20, ambition: 50 },
    )],
  ]);

  const relationships: SimulationContext['relationships'] = new Map();

  const START_TICK = 9; // Day 0, 09:00

  const ctx: SimulationContext = {
    ...base,
    worldTime: { tick: START_TICK, day: 0, hour: START_TICK },
    adventurers,
    relationships,
    activeRegions: createStartingRegions(),
    treasury: 50,
    divineInfluence: 40,
    scenario: {
      scenarioId: SCENARIO_1_ID,
      startedAt: START_TICK,
      status: 'ACTIVE',
      treasuryNegativeSince: null,
      goals: scenario1.goals.map(g => ({
        id: g.id,
        description: g.description,
        completed: false,
        diReward: g.diReward,
      })),
      failConditions: scenario1.failConditions.map(f => ({
        id: f.id,
        description: f.description,
        triggered: false,
      })),
    },
  };

  // Seed the quest board at game start so players have work available immediately
  return seedQuestBoard(ctx, 4);
}

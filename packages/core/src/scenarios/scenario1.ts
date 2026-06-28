/**
 * Scenario 1: "The Failing Guild"
 *
 * Spec: specs/behaviors/scenario-engine.md#scenario-1-the-failing-guild
 *
 * 6 pre-seeded adventurers, 30-day time limit, tight win conditions.
 * Registry-registered at module import time.
 */
import type { Scenario, SimulationContext, Adventurer } from '../world/types.js';
import { createSimulationContext } from '../world/SimulationContext.js';
import { createEdge } from '../relationships/graph.js';
import { registerScenario } from './ScenarioEngine.js';
import { createStartingRegions } from '../world/WorldExpansion.js';

export const SCENARIO_1_ID = 'FAILING_GUILD';

const TIME_LIMIT = 720; // 30 days × 24 ticks

// ---------------------------------------------------------------------------
// Adventurer seed IDs (stable across context resets)
// ---------------------------------------------------------------------------

export const S1_IDS = {
  kara:    's1-kara',
  doran:   's1-doran',
  selin:   's1-selin',
  mira:    's1-mira',
  garrett: 's1-garrett',
  voss:    's1-voss',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function livingCount(ctx: SimulationContext): number {
  return [...ctx.adventurers.values()].filter(
    a => a.state !== 'DEAD' && a.state !== 'RETIRED',
  ).length;
}

function hasBondEvent(ctx: SimulationContext): boolean {
  return ctx.eventLog.some(
    e => e.kind === 'LIFECYCLE' && (e as any).subtype === 'TRUSTED_COMPANION_BOND_FORMED',
  );
}

// ---------------------------------------------------------------------------
// Scenario definition
// ---------------------------------------------------------------------------

const scenario1: Scenario = {
  id: SCENARIO_1_ID,
  title: 'The Failing Guild',
  premise:
    'A once-proud guild is down to 6 adventurers and a near-empty treasury. A harsh winter is coming.',
  startingRoster: [], // populated separately in createScenario1Context
  startingDI: 40,
  timeLimit: TIME_LIMIT,

  goals: [
    {
      id: 'SURVIVAL',
      description: 'Maintain ≥ 4 living (non-retired) adventurers through day 30',
      diReward: 25,
      condition: (ctx) => ctx.worldTime.tick === TIME_LIMIT && livingCount(ctx) >= 4,
    },
    {
      id: 'SOLVENT',
      description: 'Treasury above 0 at day 30',
      diReward: 20,
      condition: (ctx) => ctx.worldTime.tick === TIME_LIMIT && ctx.treasury > 0,
    },
    {
      id: 'BOND',
      description: 'Two adventurers form a TRUSTED_COMPANION bond',
      diReward: 30,
      optional: true,
      condition: (ctx) => hasBondEvent(ctx),
    },
  ],

  failConditions: [
    {
      id: 'ROSTER_COLLAPSE',
      description: 'Roster drops below 2 living adventurers',
      condition: (ctx) => livingCount(ctx) < 2,
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
    moodFactors: [],
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
      'Veteran who lost her previous guild in a fire.',
      'BELONGING',
      { courage: 70, loyalty: 80, empathy: 50, greed: 20, ambition: 50 },
    )],
    [S1_IDS.doran, makeAdventurer(
      S1_IDS.doran, 'Doran', 26,
      "Merchant's son seeking fortune.",
      'WEALTH',
      { courage: 50, loyalty: 40, empathy: 30, greed: 75, ambition: 65 },
    )],
    [S1_IDS.selin, makeAdventurer(
      S1_IDS.selin, 'Selin', 29,
      'Former healer turned adventurer after village raid.',
      'PEACE',
      { courage: 30, loyalty: 60, empathy: 85, greed: 10, ambition: 30 },
    )],
    [S1_IDS.mira, makeAdventurer(
      S1_IDS.mira, 'Mira', 22,
      'Youngest sibling proving herself.',
      'HEROISM',
      { courage: 55, loyalty: 50, empathy: 40, greed: 30, ambition: 80 },
    )],
    [S1_IDS.garrett, makeAdventurer(
      S1_IDS.garrett, 'Garrett', 38,
      'Sworn to protect Kara after she saved his life.',
      'BELONGING',
      { courage: 60, loyalty: 90, empathy: 60, greed: 20, ambition: 30 },
    )],
    [S1_IDS.voss, makeAdventurer(
      S1_IDS.voss, 'Voss', 31,
      'Exile seeking redemption through violence.',
      'REVENGE',
      { courage: 85, loyalty: 30, empathy: 15, greed: 40, ambition: 60 },
    )],
  ]);

  // Pre-existing relationship edges
  const relationships = new Map<string, Map<string, ReturnType<typeof createEdge>>>();

  // Garrett → Kara: TRUSTED_COMPANION (strength 75) — symmetric
  const garrettMap = new Map<string, ReturnType<typeof createEdge>>();
  garrettMap.set(S1_IDS.kara, createEdge(75));
  relationships.set(S1_IDS.garrett, garrettMap);

  const karaMap = new Map<string, ReturnType<typeof createEdge>>();
  karaMap.set(S1_IDS.garrett, createEdge(75));
  relationships.set(S1_IDS.kara, karaMap);

  // Voss → Mira: RIVAL (strength -30) — symmetric
  const vossMap = new Map<string, ReturnType<typeof createEdge>>();
  vossMap.set(S1_IDS.mira, createEdge(-30));
  relationships.set(S1_IDS.voss, vossMap);

  const miraMap = new Map<string, ReturnType<typeof createEdge>>();
  miraMap.set(S1_IDS.voss, createEdge(-30));
  relationships.set(S1_IDS.mira, miraMap);

  return {
    ...base,
    adventurers,
    relationships,
    activeRegions: createStartingRegions(),
    treasury: 50,
    divineInfluence: 40,
    scenario: {
      scenarioId: SCENARIO_1_ID,
      startedAt: 0,
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
}

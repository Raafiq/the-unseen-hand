import { describe, it, expect } from 'vitest';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { SimulationLoop } from '../src/world/SimulationLoop.js';
import type { Adventurer } from '../src/world/types.js';

function makeAdv(id: string, name: string): Adventurer {
  return {
    id,
    identity: { id, name, age: 25, backstory: 'A wanderer.', personalGoal: 'HEROISM' },
    personality: { courage: 55, greed: 40, empathy: 60, loyalty: 55, ambition: 50 },
    mood: 60, moodFactors: [], state: 'IDLE', history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
  };
}

describe('Phase 2 headless simulation — 30 days', () => {
  it('produces a non-empty event log after 30 days with 4 adventurers', () => {
    const ctx = createSimulationContext('p2-validation');
    const adventurers = new Map<string, Adventurer>([
      ['a1', makeAdv('a1', 'Aldric')],
      ['a2', makeAdv('a2', 'Britta')],
      ['a3', makeAdv('a3', 'Cael')],
      ['a4', makeAdv('a4', 'Dwyn')],
    ]);

    const loop = new SimulationLoop({ ...ctx, adventurers });

    for (let i = 0; i < 720; i++) {
      loop.step();
    }

    const finalCtx = loop.context;
    expect(finalCtx.worldTime.day).toBe(30);
    expect(finalCtx.eventLog.length).toBeGreaterThan(0);

    // Every event must have a non-empty renderedText
    for (const ev of finalCtx.eventLog) {
      expect(ev.renderedText).toBeTruthy();
    }
  });
});

import { describe, it, expect } from 'vitest';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import {
  createStartingRegions,
  worldExpansionSubscriber,
  updateReputation,
} from '../src/world/WorldExpansion.js';
import type { SimulationContext } from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctxWithReputation(reputation: number, scenariosComplete = 0): SimulationContext {
  const base = createSimulationContext('expansion-test');
  const regions = createStartingRegions();
  return {
    ...base,
    reputation,
    activeRegions: regions,
    // inject completed scenario count via a marker event in the log if needed
    eventLog: Array.from({ length: scenariosComplete }, (_, i) => ({
      id: `sc-${i}`,
      tick: i,
      renderedText: 'Scenario complete.',
      kind: 'WORLD' as const,
      subtype: 'SCENARIO_COMPLETE' as const,
    })),
  };
}

// ---------------------------------------------------------------------------
// createStartingRegions
// ---------------------------------------------------------------------------

describe('createStartingRegions', () => {
  it('THORNVALE starts unlocked', () => {
    const regions = createStartingRegions();
    expect(regions.get('THORNVALE')?.unlocked).toBe(true);
  });

  it('ASHWOOD starts locked', () => {
    const regions = createStartingRegions();
    expect(regions.get('ASHWOOD')?.unlocked).toBe(false);
  });

  it('STORMPASS starts locked', () => {
    const regions = createStartingRegions();
    expect(regions.get('STORMPASS')?.unlocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// worldExpansionSubscriber — ASHWOOD unlock
// ---------------------------------------------------------------------------

describe('worldExpansionSubscriber — ASHWOOD', () => {
  it('unlocks ASHWOOD when ScenarioComplete event is in log', () => {
    const ctx = ctxWithReputation(0, 1); // 1 scenario complete, rep 0
    const result = worldExpansionSubscriber(ctx);
    expect(result.activeRegions.get('ASHWOOD')?.unlocked).toBe(true);
  });

  it('fires REGION_UNLOCKED event when ASHWOOD unlocks', () => {
    const ctx = ctxWithReputation(0, 1);
    const result = worldExpansionSubscriber(ctx);
    const ev = result.eventLog.find(
      e => e.kind === 'WORLD' && (e as any).subtype === 'REGION_UNLOCKED',
    );
    expect(ev).toBeDefined();
    expect(ev!.renderedText).toBeTruthy();
  });

  it('unlocks ASHWOOD when reputation ≥ 200 (no scenario complete)', () => {
    const ctx = ctxWithReputation(200);
    const result = worldExpansionSubscriber(ctx);
    expect(result.activeRegions.get('ASHWOOD')?.unlocked).toBe(true);
  });

  it('does not unlock ASHWOOD when reputation = 199 and no scenario complete', () => {
    const ctx = ctxWithReputation(199);
    const result = worldExpansionSubscriber(ctx);
    expect(result.activeRegions.get('ASHWOOD')?.unlocked).toBe(false);
  });

  it('does not re-fire REGION_UNLOCKED if ASHWOOD already unlocked', () => {
    const ctx = ctxWithReputation(0, 1);
    // Pre-unlock ASHWOOD
    const ashwood = ctx.activeRegions.get('ASHWOOD')!;
    const regions = new Map(ctx.activeRegions);
    regions.set('ASHWOOD', { ...ashwood, unlocked: true });
    const ctxUnlocked = { ...ctx, activeRegions: regions };
    // Filter existing REGION_UNLOCKED events from base
    const result = worldExpansionSubscriber(ctxUnlocked);
    const newUnlockEvents = result.eventLog.filter(
      e => e.kind === 'WORLD' && (e as any).subtype === 'REGION_UNLOCKED',
    );
    expect(newUnlockEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// worldExpansionSubscriber — STORMPASS unlock
// ---------------------------------------------------------------------------

describe('worldExpansionSubscriber — STORMPASS', () => {
  it('unlocks STORMPASS when reputation ≥ 500', () => {
    const ctx = ctxWithReputation(500, 1); // also unlock ASHWOOD
    const result = worldExpansionSubscriber(ctx);
    expect(result.activeRegions.get('STORMPASS')?.unlocked).toBe(true);
  });

  it('unlocks STORMPASS when 2 scenarios complete (regardless of reputation)', () => {
    const ctx = ctxWithReputation(0, 2); // 2 scenarios complete
    const result = worldExpansionSubscriber(ctx);
    expect(result.activeRegions.get('STORMPASS')?.unlocked).toBe(true);
  });

  it('does not unlock STORMPASS at reputation 499 with only 1 scenario complete', () => {
    const ctx = ctxWithReputation(499, 1);
    const result = worldExpansionSubscriber(ctx);
    expect(result.activeRegions.get('STORMPASS')?.unlocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateReputation
// ---------------------------------------------------------------------------

describe('updateReputation', () => {
  it('adds +5 for low-difficulty quest success (difficulty 1–4)', () => {
    const result = updateReputation(100, { event: 'QUEST_SUCCESS', difficulty: 3 });
    expect(result).toBe(105);
  });

  it('adds +10 for mid-difficulty quest success (difficulty 5–7)', () => {
    const result = updateReputation(100, { event: 'QUEST_SUCCESS', difficulty: 6 });
    expect(result).toBe(110);
  });

  it('adds +20 for hard quest success (difficulty 8–10)', () => {
    const result = updateReputation(100, { event: 'QUEST_SUCCESS', difficulty: 9 });
    expect(result).toBe(120);
  });

  it('subtracts 8 for quest failure', () => {
    const result = updateReputation(100, { event: 'QUEST_FAILURE' });
    expect(result).toBe(92);
  });

  it('subtracts 15 for adventurer death', () => {
    const result = updateReputation(100, { event: 'ADVENTURER_DEATH' });
    expect(result).toBe(85);
  });

  it('adds +5 for TRUSTED_COMPANION bond formed', () => {
    const result = updateReputation(100, { event: 'BOND_FORMED' });
    expect(result).toBe(105);
  });

  it('adds +10 for personal goal achieved', () => {
    const result = updateReputation(100, { event: 'GOAL_ACHIEVED' });
    expect(result).toBe(110);
  });

  it('adds +50 for scenario objective completed', () => {
    const result = updateReputation(100, { event: 'SCENARIO_OBJECTIVE' });
    expect(result).toBe(150);
  });

  it('clamps reputation to [0, 1000]', () => {
    expect(updateReputation(5, { event: 'QUEST_FAILURE' })).toBe(0); // 5 - 8, clamped
    expect(updateReputation(990, { event: 'SCENARIO_OBJECTIVE' })).toBe(1000); // 990+50=1040, clamped
  });
});

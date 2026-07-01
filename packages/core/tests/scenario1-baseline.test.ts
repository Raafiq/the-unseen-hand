import { describe, it, expect } from 'vitest';
import { createScenario1Context } from '../src/scenarios/scenario1.js';
import { moodSubscriber } from '../src/adventurers/mood.js';

describe('Scenario 1 — adventurer baseline mood', () => {
  it('Reiko has mood ≥ 25 after the first day tick', () => {
    const ctx = createScenario1Context();
    // Advance to day 1, hour 0 — moodSubscriber fires on this tick
    const atDayOne = { ...ctx, worldTime: { tick: 24, day: 1, hour: 0 } };
    const next = moodSubscriber(atDayOne);
    for (const [id, adv] of next.adventurers) {
      expect(adv.mood, `${adv.identity.name} (${id}) mood should be ≥ 25 after first day tick`).toBeGreaterThanOrEqual(25);
    }
  });

  it('BASELINE mood factor has decayRate 0 and persists after multiple day ticks', () => {
    const ctx = createScenario1Context();
    // Run 10 day ticks
    let current = ctx;
    for (let day = 1; day <= 10; day++) {
      current = moodSubscriber({ ...current, worldTime: { tick: day * 24, day, hour: 0 } });
    }
    for (const adv of current.adventurers.values()) {
      const baseline = adv.moodFactors.find(f => f.id === 'BASELINE');
      expect(baseline, `${adv.identity.name} should still have BASELINE factor after 10 days`).toBeDefined();
      expect(baseline!.value).toBeGreaterThan(20);
    }
  });
});

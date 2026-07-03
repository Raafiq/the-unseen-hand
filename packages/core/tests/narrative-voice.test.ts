import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emitEvent, type SimulationEventInput } from '../src/events/eventBus.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';

// Spec: specs/behaviors/narrative-voice.md
// Plan: plans/p10a-narrative-voice.md
//
// The template grammar composes renderedText as subject + beat + colour, with
// every fragment selected via ctx.rng. Tests exercise it through the public
// emitEvent interface (renderedText is the observable contract).

/** Emit the same input `n` times through a single advancing context; collect distinct renderings. */
function distinctRenderings(seed: string, input: SimulationEventInput, n = 60): Set<string> {
  let ctx = createSimulationContext(seed);
  const set = new Set<string>();
  for (let i = 0; i < n; i++) {
    ctx = emitEvent(ctx, input);
    set.add(ctx.eventLog[ctx.eventLog.length - 1].renderedText);
  }
  return set;
}

describe('narrative-voice — grammar variety', () => {
  it('SOCIAL/ARGUMENT draws from a beat pool: repeated emissions yield ≥3 distinct lines', () => {
    const variants = distinctRenderings('voice-argument', {
      kind: 'SOCIAL', subtype: 'ARGUMENT',
      participantIds: ['alice', 'bob'], relationshipDelta: -10,
    });
    expect(variants.size).toBeGreaterThanOrEqual(3);
    for (const line of variants) expect(line.length).toBeGreaterThan(0);
  });

  it('every current SOCIAL subtype yields ≥3 distinct lines, each naming both participants', () => {
    const subtypes = ['BANTER', 'SOLIDARITY', 'BREAKTHROUGH', 'SILENT_DISTANCE', 'ARGUMENT', 'ESTRANGEMENT'] as const;
    for (const subtype of subtypes) {
      const variants = distinctRenderings(`voice-social-${subtype}`, {
        kind: 'SOCIAL', subtype, participantIds: ['alice', 'bob'], relationshipDelta: 0,
      });
      expect(variants.size, subtype).toBeGreaterThanOrEqual(3);
      for (const line of variants) {
        expect(line, subtype).toContain('alice');
        expect(line, subtype).toContain('bob');
      }
    }
  });

  it('appends a colour fragment to some lines: SOCIAL/BANTER yields more distinct forms than it has beats', () => {
    // 4 beats alone would cap distinct renderings at 4; an optional colour pool pushes it higher.
    const variants = distinctRenderings('voice-colour', {
      kind: 'SOCIAL', subtype: 'BANTER', participantIds: ['alice', 'bob'], relationshipDelta: 6,
    }, 120);
    expect(variants.size).toBeGreaterThanOrEqual(6);
  });

  it('every RELATIONSHIP subtype yields ≥3 distinct lines, each naming both participants', () => {
    const subtypes = ['SHARED_DANGER', 'BETRAYAL', 'KINDNESS', 'RIVALRY_SPARK'] as const;
    for (const subtype of subtypes) {
      const variants = distinctRenderings(`voice-rel-${subtype}`, {
        kind: 'RELATIONSHIP', subtype, participantIds: ['alice', 'bob'],
      });
      expect(variants.size, subtype).toBeGreaterThanOrEqual(3);
      for (const line of variants) {
        expect(line, subtype).toContain('alice');
        expect(line, subtype).toContain('bob');
      }
    }
  });

  it('every current QUEST subtype yields ≥3 distinct lines', () => {
    const subtypes = ['STARTED', 'COMPLETED', 'FAILED', 'EXPIRED', 'DROUGHT'] as const;
    for (const subtype of subtypes) {
      const variants = distinctRenderings(`voice-quest-${subtype}`, {
        kind: 'QUEST', subtype, questId: 'q1', partyIds: ['alice'],
      });
      expect(variants.size, subtype).toBeGreaterThanOrEqual(3);
    }
  });

  it('every current LIFECYCLE subtype yields ≥3 distinct lines', () => {
    const subtypes = [
      'ADVENTURER_DIED', 'ADVENTURER_DEPARTED', 'FRIENDSHIP_FORMED',
      'TRUSTED_COMPANION_BOND_FORMED', 'BOND_BROKEN', 'RIVALRY_DEEPENED',
      'RECONCILIATION', 'GOAL_MILESTONE', 'GOAL_ACHIEVED',
    ] as const;
    for (const subtype of subtypes) {
      const variants = distinctRenderings(`voice-life-${subtype}`, {
        kind: 'LIFECYCLE', subtype, involvedIds: ['alice', 'bob'],
      });
      expect(variants.size, subtype).toBeGreaterThanOrEqual(3);
    }
  });

  it('every narrative WORLD subtype yields ≥3 distinct lines', () => {
    // Scenario/error announcements (SCENARIO_*, INTERNAL_ERROR) are deliberately fixed lines.
    const subtypes = [
      'STORM', 'PLAGUE', 'WINDFALL', 'MONSTER_SURGE', 'TRAVELLING_MERCHANT',
      'RUMOUR', 'QUEST_DROUGHT', 'REGION_UNLOCKED',
    ] as const;
    for (const subtype of subtypes) {
      const variants = distinctRenderings(`voice-world-${subtype}`, { kind: 'WORLD', subtype });
      expect(variants.size, subtype).toBeGreaterThanOrEqual(3);
    }
  });

  it('every COMBAT subtype yields ≥3 distinct lines', () => {
    const subtypes = ['BEAT_LOG', 'QUEST_RESOLVED'] as const;
    for (const subtype of subtypes) {
      const variants = distinctRenderings(`voice-combat-${subtype}`, {
        kind: 'COMBAT', subtype, questId: 'q1', involvedIds: ['alice'],
      });
      expect(variants.size, subtype).toBeGreaterThanOrEqual(3);
    }
  });

  it('every DIVINE subtype yields ≥3 distinct lines', () => {
    const subtypes = ['TOUCH', 'SEED_EVENT', 'SHIFT_DIFFICULTY', 'OPTION_CHOSEN', 'DI_GAINED', 'DI_SPENT'] as const;
    for (const subtype of subtypes) {
      const variants = distinctRenderings(`voice-divine-${subtype}`, {
        kind: 'DIVINE', subtype, diDelta: subtype === 'DI_SPENT' ? -5 : 5,
      });
      expect(variants.size, subtype).toBeGreaterThanOrEqual(3);
    }
  });

  it('ACTIVITY_CHANGED yields ≥3 distinct lines for first-draw, transition, and wake forms', () => {
    const firstDraw = distinctRenderings('voice-act-first', {
      kind: 'ACTIVITY', subtype: 'ACTIVITY_CHANGED', adventurerId: 'alice', activity: 'TRAINING',
    });
    expect(firstDraw.size, 'first-draw').toBeGreaterThanOrEqual(3);

    const transition = distinctRenderings('voice-act-trans', {
      kind: 'ACTIVITY', subtype: 'ACTIVITY_CHANGED', adventurerId: 'alice', activity: 'TRAINING', prevActivity: 'DRINKING',
    });
    expect(transition.size, 'transition').toBeGreaterThanOrEqual(3);

    const wake = distinctRenderings('voice-act-wake', {
      kind: 'ACTIVITY', subtype: 'ACTIVITY_CHANGED', adventurerId: 'alice', activity: 'TRAINING', prevActivity: 'SLEEPING',
    });
    expect(wake.size, 'wake').toBeGreaterThanOrEqual(3);
  });

  it('PREPARES_FOR_QUEST yields ≥3 distinct lines for wake, break-off, and plain forms', () => {
    const roused = distinctRenderings('voice-prep-wake', {
      kind: 'ACTIVITY', subtype: 'PREPARES_FOR_QUEST', adventurerId: 'alice', prevActivity: 'SLEEPING',
    });
    expect(roused.size, 'wake').toBeGreaterThanOrEqual(3);
    for (const line of roused) {
      expect(line).toContain('alice');
      expect(line.toLowerCase()).toContain('sleep'); // sleeper is roused, not just "readies"
    }

    const breakOff = distinctRenderings('voice-prep-break', {
      kind: 'ACTIVITY', subtype: 'PREPARES_FOR_QUEST', adventurerId: 'alice', prevActivity: 'TRAINING',
    });
    expect(breakOff.size, 'break-off').toBeGreaterThanOrEqual(3);
    for (const line of breakOff) {
      expect(line).toContain('alice');
      expect(line).toContain('training'); // names the activity they left
    }

    const plain = distinctRenderings('voice-prep-plain', {
      kind: 'ACTIVITY', subtype: 'PREPARES_FOR_QUEST', adventurerId: 'alice',
    });
    expect(plain.size, 'plain').toBeGreaterThanOrEqual(3);
    for (const line of plain) expect(line).toContain('alice');
  });
});

describe('narrative-voice — determinism & integrity', () => {
  // A representative input per slot-bearing family, sampled many times each.
  const sampleInputs: SimulationEventInput[] = [
    { kind: 'SOCIAL', subtype: 'BANTER', participantIds: ['alice', 'bob'], relationshipDelta: 5 },
    { kind: 'QUEST', subtype: 'STARTED', questId: 'q1', partyIds: ['alice'] },
    { kind: 'LIFECYCLE', subtype: 'FRIENDSHIP_FORMED', involvedIds: ['alice', 'bob'] },
    { kind: 'WORLD', subtype: 'STORM' },
    { kind: 'COMBAT', subtype: 'BEAT_LOG', questId: 'q1', involvedIds: ['alice'] },
    { kind: 'DIVINE', subtype: 'TOUCH', diDelta: 0 },
    { kind: 'ACTIVITY', subtype: 'ACTIVITY_CHANGED', adventurerId: 'alice', activity: 'TRAINING', prevActivity: 'DRINKING' },
  ];

  it('never leaves an unfilled {slot} token in any rendered line', () => {
    for (const input of sampleInputs) {
      for (const line of distinctRenderings('slot-sweep', input, 40)) {
        expect(line, JSON.stringify(input)).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
  });

  it('replays the full feed text byte-for-byte under the same seed', () => {
    const render = () => {
      let ctx = createSimulationContext('replay-seed');
      for (const input of sampleInputs) {
        for (let i = 0; i < 5; i++) ctx = emitEvent(ctx, input);
      }
      return ctx.eventLog.map(e => e.renderedText);
    };
    expect(render()).toEqual(render());
  });

  it('no module under src/events/ imports an LLM SDK or issues a network call', () => {
    const dir = fileURLToPath(new URL('../src/events/', import.meta.url));
    const forbidden = [/@anthropic-ai/, /from ['"]anthropic['"]/, /\bfetch\s*\(/, /api\.anthropic\.com/, /openai/i];
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const src = readFileSync(new URL(`../src/events/${file}`, import.meta.url), 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(src)) offenders.push(`${file} :: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

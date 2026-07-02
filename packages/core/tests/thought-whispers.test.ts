/**
 * P12c — THOUGHT whispers (thought-system.md#thought-whispers).
 *
 * The subscriber rolls eligibility on ctx.rng; the text is rendered through the
 * derived stream so a whisper byte-matches the on-demand render for the same
 * actor, tick, and suppression set. Tested through rollThoughtWhispers with an
 * explicit chance (the rollTownFlavour pattern) — chance 1 and 0 both give
 * deterministic assertions.
 */
import { describe, it, expect } from 'vitest';
import { rollThoughtWhispers } from '../src/thoughts/thoughtWhispers.js';
import { renderThought } from '../src/thoughts/thoughtGrammar.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { SimulationLoop } from '../src/world/SimulationLoop.js';
import { createScenario1Context } from '../src/scenarios/scenario1.js';
import { makeNpcId } from '../src/world/actors.js';
import type {
  Adventurer,
  ActivityId,
  NotableNpc,
  SimulationContext,
  ThoughtEvent,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAdv(
  id: string,
  opts: Partial<{ state: Adventurer['state']; activity: ActivityId | null }> = {},
): Adventurer {
  const { state = 'IDLE', activity = 'EATING' } = opts;
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'A wanderer.', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0 },
    mood: 50, moodFactors: [], state, history: [], despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
    ...(activity
      ? { activityState: { current: activity, enteredAt: 0, scheduledExitAt: 9999, nextMicroEventAt: 9999 } }
      : {}),
  };
}

function makeNpc(slug: string): NotableNpc {
  return {
    id: makeNpcId(slug),
    name: `NPC-${slug}`,
    role: 'BLACKSMITH',
    traits: { empathy: 60 },
    bio: 'A townsperson.',
    mood: 50,
    moodFactors: [],
    history: [],
    want: { id: 'WANT_TEST', text: 'a quieter town' },
  };
}

function makeCtx(adventurers: Adventurer[], npcs: NotableNpc[] = [], tick = 100): SimulationContext {
  const base = createSimulationContext('whisper-seed');
  return {
    ...base,
    adventurers: new Map(adventurers.map(a => [a.id, a])),
    notableNpcs: new Map(npcs.map(n => [n.id, n])),
    worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 },
  };
}

const thoughtsOf = (ctx: SimulationContext): ThoughtEvent[] =>
  ctx.eventLog.filter((e): e is ThoughtEvent => e.kind === 'THOUGHT');

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

describe('rollThoughtWhispers — emission', () => {
  it('emits a THOUGHT event with non-empty, slot-free text and the thinker actorId', () => {
    const ctx = makeCtx([makeAdv('kara')]);
    const next = rollThoughtWhispers(ctx, 1);

    const whispers = thoughtsOf(next);
    expect(whispers).toHaveLength(1);
    expect(whispers[0]!.actorId).toBe('kara');
    expect(whispers[0]!.renderedText.length).toBeGreaterThan(0);
    expect(whispers[0]!.renderedText).not.toMatch(/\{[a-z]+\}/i);
  });

  it('whisper text equals the on-demand render for the same actor, tick, and suppression', () => {
    const ctx = makeCtx([makeAdv('kara')]);
    const next = rollThoughtWhispers(ctx, 1);

    const whisper = thoughtsOf(next)[0]!;
    const panel = renderThought(ctx, 'kara')!; // no prior whispers → empty suppression both ways
    expect(whisper.renderedText).toBe(panel.text);
    expect(whisper.subjectKey).toBe(panel.subjectKey);
  });

  it('NPCs whisper too', () => {
    const npc = makeNpc('smith');
    const ctx = makeCtx([], [npc]);
    const next = rollThoughtWhispers(ctx, 1);
    expect(thoughtsOf(next).some(t => t.actorId === npc.id)).toBe(true);
  });

  it('DEAD, RETIRED, and ON_QUEST actors never whisper', () => {
    const ctx = makeCtx([
      makeAdv('dead', { state: 'DEAD' }),
      makeAdv('gone', { state: 'RETIRED' }),
      makeAdv('away', { state: 'ON_QUEST', activity: null }),
    ]);
    expect(thoughtsOf(rollThoughtWhispers(ctx, 1))).toHaveLength(0);
  });

  it('adventurers without a town-eligible activity do not whisper', () => {
    const ctx = makeCtx([makeAdv('kara', { activity: null })]);
    expect(thoughtsOf(rollThoughtWhispers(ctx, 1))).toHaveLength(0);
  });

  it('a zero-chance roll returns ctx unchanged (referential)', () => {
    const ctx = makeCtx([makeAdv('kara')]);
    expect(rollThoughtWhispers(ctx, 0)).toBe(ctx);
  });

  it('subjectKey label never appears in renderedText', () => {
    const ctx = makeCtx([makeAdv('kara')]);
    for (let t = 100; t < 130; t++) {
      const at = { ...ctx, worldTime: { tick: t, day: Math.floor(t / 24), hour: t % 24 } };
      const whisper = thoughtsOf(rollThoughtWhispers(at, 1))[0];
      if (whisper) expect(whisper.renderedText).not.toContain(whisper.subjectKey);
    }
  });
});

// ---------------------------------------------------------------------------
// Anti-repetition
// ---------------------------------------------------------------------------

describe('rollThoughtWhispers — anti-repetition', () => {
  it('suppresses a just-whispered subjectKey on the next whisper when alternatives exist', () => {
    // History + goal gap give the actor several subject families.
    const kara = makeAdv('kara');
    kara.history = [{ tick: 95, kind: 'NEAR_DEATH', involvedIds: ['kara'], weight: 10 }];
    let ctx = makeCtx([kara], [], 100);

    ctx = rollThoughtWhispers(ctx, 1);
    const first = thoughtsOf(ctx)[0]!;

    // Advance a tick and whisper again — same window, first subject suppressed.
    ctx = { ...ctx, worldTime: { tick: 101, day: 4, hour: 5 } };
    ctx = rollThoughtWhispers(ctx, 1);
    const second = thoughtsOf(ctx)[1]!;

    expect(second.subjectKey).not.toBe(first.subjectKey);
  });
});

// ---------------------------------------------------------------------------
// Determinism — byte-identical replay including THOUGHT lines
// ---------------------------------------------------------------------------

describe('determinism — replay', () => {
  it('two 500-tick runs of the same seed produce byte-identical eventLogs (THOUGHT included)', () => {
    const run = (): string => {
      const loop = new SimulationLoop(createScenario1Context());
      for (let i = 0; i < 500; i++) loop.step();
      return loop.context.eventLog
        .map(e => `${e.tick}|${e.kind}|${e.renderedText}`)
        .join('\n');
    };
    const a = run();
    const b = run();
    expect(a).toBe(b);
    // And the run actually produced whispers (chance 0.01 × ~10 actors × 500 ticks).
    expect(a).toContain('|THOUGHT|');
  });
});

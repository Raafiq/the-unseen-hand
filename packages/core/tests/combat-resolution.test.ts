import { describe, it, expect } from 'vitest';
import {
  generateBeats,
  selectBeatActionWeights,
  renderBeat,
} from '../src/combat/beatGenerator.js';
import { SeededRNG } from '../src/world/SeededRNG.js';
import type { Quest, Adventurer, RelationshipGraph } from '../src/world/types.js';
import { createEdge } from '../src/relationships/graph.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdventurer(id: string, axes: Partial<{ courage: number; loyalty: number; empathy: number }> = {}): Adventurer {
  return {
    id, identity: { id, name: id, age: 25, backstory: '', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, ...axes },
    mood: 60, moodFactors: [], state: 'ON_QUEST', history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: 'q1',
  };
}

function makeQuest(difficulty: number): Quest {
  return {
    id: 'q1', type: 'DUNGEON', name: 'Test Quest', difficulty,
    duration: 48, reward: 100,
    risk: { injuryChance: 0.1, deathChance: 0.05, criticalFailChance: 0.05 },
    requiredPartySize: 2, expiresAt: 9999,
    assignedParty: null, status: 'IN_PROGRESS',
  };
}

const emptyGraph: RelationshipGraph = new Map();

// ---------------------------------------------------------------------------
// Beat count — tracer bullet
// ---------------------------------------------------------------------------

describe('generateBeats — beat count', () => {
  it('count is within ±20% of difficulty*3 + party.length*2', () => {
    const quest = makeQuest(5);
    const party = [makeAdventurer('a'), makeAdventurer('b')];
    const rng = new SeededRNG('beat-count');
    const beats = generateBeats(quest, party, emptyGraph, rng, true);
    const expected = quest.difficulty * 3 + party.length * 2; // 15+4 = 19
    expect(beats.length).toBeGreaterThanOrEqual(Math.floor(expected * 0.8));
    expect(beats.length).toBeLessThanOrEqual(Math.ceil(expected * 1.2));
  });

  it('every beat has a non-empty actorId and an outcome string', () => {
    const beats = generateBeats(makeQuest(3), [makeAdventurer('a'), makeAdventurer('b')], emptyGraph, new SeededRNG('beat-shape'), true);
    for (const b of beats) {
      expect(b.actorId).toBeTruthy();
      expect(b.outcome).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Action probability modifiers
// ---------------------------------------------------------------------------

describe('selectBeatActionWeights', () => {
  it('low-courage actor on failing quest has higher FLEE weight than base', () => {
    const coward = makeAdventurer('a', { courage: 10 });
    const brave  = makeAdventurer('b', { courage: 80 });
    const totalBeats = 20;
    const lateIndex = 15; // past 40%
    const cowardW = selectBeatActionWeights(coward, [coward], emptyGraph, false, lateIndex, totalBeats);
    const braveW  = selectBeatActionWeights(brave,  [brave],  emptyGraph, false, lateIndex, totalBeats);
    expect(cowardW.FLEE).toBeGreaterThan(braveW.FLEE);
  });

  it('RIVAL pair increases HESITATE weight vs no relationship', () => {
    const actor = makeAdventurer('a');
    const ally  = makeAdventurer('b');
    const rivalGraph: RelationshipGraph = new Map([
      ['a', new Map([['b', createEdge(-20)]])], // RIVAL
      ['b', new Map([['a', createEdge(-20)]])],
    ]);
    const totalBeats = 20;
    const lateIndex = 15;
    const withRival = selectBeatActionWeights(actor, [actor, ally], rivalGraph, false, lateIndex, totalBeats);
    const noRel     = selectBeatActionWeights(actor, [actor, ally], emptyGraph,  false, lateIndex, totalBeats);
    expect(withRival.HESITATE).toBeGreaterThan(noRel.HESITATE);
  });

  it('success outcome increases CRITICAL weight vs failure', () => {
    const actor = makeAdventurer('a');
    const successW = selectBeatActionWeights(actor, [actor], emptyGraph, true,  0, 10);
    const failureW = selectBeatActionWeights(actor, [actor], emptyGraph, false, 0, 10);
    expect(successW.CRITICAL).toBeGreaterThan(failureW.CRITICAL);
  });

  it('weights always sum to approximately 1.0', () => {
    const actor = makeAdventurer('a', { courage: 10 });
    const weights = selectBeatActionWeights(actor, [actor], emptyGraph, false, 15, 20);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// Template engine — renderBeat
// ---------------------------------------------------------------------------

describe('renderBeat', () => {
  const adventurerMap = new Map([
    ['hero', { identity: { name: 'Gareth' } } as unknown as Adventurer],
    ['ally', { identity: { name: 'Lyra' }   } as unknown as Adventurer],
  ]);

  it('every BeatAction produces a non-empty rendered string', () => {
    const actions: BeatAction[] = ['ATTACK','FLEE','DEFEND_ALLY','HESITATE','USE_ITEM','CRITICAL','NEAR_DEATH'];
    for (const action of actions) {
      const beat: import('../src/world/types.js').CombatBeat = { tick: 0, actorId: 'hero', action, outcome: 'test' };
      const rendered = renderBeat(beat, adventurerMap as Map<string, Adventurer>);
      expect(rendered).toBeTruthy();
      expect(rendered.length).toBeGreaterThan(0);
    }
  });

  it('rendered text contains actor name', () => {
    const beat: import('../src/world/types.js').CombatBeat = { tick: 1, actorId: 'hero', action: 'ATTACK', outcome: 'test' };
    const rendered = renderBeat(beat, adventurerMap as Map<string, Adventurer>);
    expect(rendered).toContain('Gareth');
  });

  it('DEFEND_ALLY beat contains ally name', () => {
    const beat: import('../src/world/types.js').CombatBeat = { tick: 2, actorId: 'hero', action: 'DEFEND_ALLY', outcome: 'test' };
    const rendered = renderBeat(beat, adventurerMap as Map<string, Adventurer>);
    expect(rendered).toContain('Lyra');
  });

  it('no unfilled {slot} markers remain in rendered text', () => {
    const actions: BeatAction[] = ['ATTACK','FLEE','DEFEND_ALLY','HESITATE','USE_ITEM','CRITICAL','NEAR_DEATH'];
    for (const action of actions) {
      const beat: import('../src/world/types.js').CombatBeat = { tick: 0, actorId: 'hero', action, outcome: 'test' };
      const rendered = renderBeat(beat, adventurerMap as Map<string, Adventurer>);
      expect(rendered).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('personalityNote is appended to rendered text when present', () => {
    const beat: import('../src/world/types.js').CombatBeat = {
      tick: 0, actorId: 'hero', action: 'FLEE', outcome: 'test',
      personalityNote: 'courage 12 — breaks before the odds',
    };
    const rendered = renderBeat(beat, adventurerMap as Map<string, Adventurer>);
    expect(rendered).toContain('courage 12');
  });
});

// ---------------------------------------------------------------------------
// Statistical: low-courage adventurer flees often on failing quest
// ---------------------------------------------------------------------------

describe('generateBeats — statistical checks', () => {
  it('coward on failing quest selects FLEE in > 20% of beats', () => {
    const coward = makeAdventurer('a', { courage: 10 });
    const quest = makeQuest(5);
    let totalBeats = 0;
    let fleeCount = 0;
    for (let seed = 0; seed < 10; seed++) {
      const beats = generateBeats(quest, [coward], emptyGraph, new SeededRNG(`coward-${seed}`), false);
      totalBeats += beats.length;
      fleeCount += beats.filter(b => b.action === 'FLEE').length;
    }
    expect(fleeCount / totalBeats).toBeGreaterThan(0.20);
  });
});

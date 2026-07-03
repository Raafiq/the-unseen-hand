import { describe, it, expect } from 'vitest';
import {
  familiarityForRole,
  openingStrengthForFamiliarity,
  familiarityApproachBias,
  seedFamiliarityEdges,
  FAMILIARITY_APPROACH_BIAS,
} from '../src/relationships/familiarity.js';
import { strengthToType } from '../src/relationships/graph.js';
import { computePressureGain, type EncounterActor } from '../src/events/socialResolver.js';
import { createScenario1Context } from '../src/scenarios/scenario1.js';
import { createThornvaleNpcs } from '../src/scenarios/notableNpcs.js';
import { isNpc } from '../src/world/actors.js';
import { SimulationLoop } from '../src/world/SimulationLoop.js';
import type { Adventurer, NotableNpc, PersonalityAxes, RelationshipGraph } from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const P = (over: Partial<PersonalityAxes> = {}): PersonalityAxes => ({
  courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0, ...over,
});

function adv(id: string, over: Partial<Adventurer> = {}): Adventurer {
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'x', personalGoal: 'HEROISM' },
    personality: P(),
    mood: 60,
    moodFactors: [],
    state: 'IDLE',
    history: [],
    despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
    ...over,
  };
}

const actor = (id: string, familiarity?: number): EncounterActor => ({
  id, mood: 50, personality: P(), state: 'IDLE', ...(familiarity !== undefined ? { familiarity } : {}),
});

// ---------------------------------------------------------------------------
// Role → familiarity seeding (npc-system.md — service-role warmth)
// ---------------------------------------------------------------------------

describe('familiarityForRole', () => {
  it('seeds service/craft roles high', () => {
    for (const role of ['INNKEEPER', 'PRIEST', 'SHOPKEEPER', 'MERCHANT', 'BARD', 'STABLEHAND', 'BLACKSMITH'] as const) {
      expect(familiarityForRole(role)).toBeGreaterThanOrEqual(70);
    }
  });

  it('seeds guarded/martial roles moderate (below service, above marginal)', () => {
    expect(familiarityForRole('GUARD_CAPTAIN')).toBeLessThan(familiarityForRole('INNKEEPER'));
    expect(familiarityForRole('GATE_GUARD')).toBeGreaterThan(familiarityForRole('DRUNK'));
  });

  it('seeds marginal/transient roles low', () => {
    for (const role of ['URCHIN', 'DRUNK', 'BEGGAR'] as const) {
      expect(familiarityForRole(role)).toBeLessThan(familiarityForRole('GUARD_CAPTAIN'));
    }
  });
});

// ---------------------------------------------------------------------------
// Familiarity → opening edge strength
// ---------------------------------------------------------------------------

describe('openingStrengthForFamiliarity', () => {
  it('opens a high-familiarity NPC in the ACQUAINTANCE band (not STRANGER)', () => {
    const s = openingStrengthForFamiliarity(familiarityForRole('INNKEEPER'));
    expect(strengthToType(s)).toBe('ACQUAINTANCE');
  });

  it('opens a moderate-familiarity NPC as a (warm) STRANGER, below the ACQUAINTANCE band', () => {
    const s = openingStrengthForFamiliarity(familiarityForRole('GUARD_CAPTAIN'));
    expect(strengthToType(s)).toBe('STRANGER');
    expect(s).toBeGreaterThan(0); // warmer than a cold zero-stranger
    expect(s).toBeLessThan(11);
  });

  it('opens a low/rival-flagged NPC as a STRANGER or mild negative — never FRIEND or ENEMY', () => {
    const low = openingStrengthForFamiliarity(familiarityForRole('URCHIN'));
    expect(['STRANGER', 'RIVAL']).toContain(strengthToType(low));
    const rival = openingStrengthForFamiliarity(0); // scenario rival exception
    expect(rival).toBeLessThan(0);
    expect(strengthToType(rival)).not.toBe('ENEMY');
  });

  it('never seeds a FRIEND-or-warmer opening even at max familiarity', () => {
    expect(openingStrengthForFamiliarity(100)).toBeLessThan(40);
    expect(strengthToType(openingStrengthForFamiliarity(100))).toBe('ACQUAINTANCE');
  });

  it('is monotonic in familiarity (warmer NPC → warmer opening)', () => {
    expect(openingStrengthForFamiliarity(80)).toBeGreaterThan(openingStrengthForFamiliarity(55));
    expect(openingStrengthForFamiliarity(55)).toBeGreaterThan(openingStrengthForFamiliarity(25));
  });
});

// ---------------------------------------------------------------------------
// Edge seeding at world generation
// ---------------------------------------------------------------------------

describe('seedFamiliarityEdges', () => {
  const npcs = new Map<string, NotableNpc>([
    ['npc:inn', { id: 'npc:inn', name: 'Inn', role: 'INNKEEPER', traits: {}, bio: '', mood: 50, moodFactors: [], history: [], want: { id: 'w', text: 't' }, familiarity: 82 }],
    ['npc:guard', { id: 'npc:guard', name: 'Guard', role: 'GUARD_CAPTAIN', traits: {}, bio: '', mood: 50, moodFactors: [], history: [], want: { id: 'w', text: 't' }, familiarity: 55 }],
  ]);
  const advs = new Map<string, Adventurer>([['a1', adv('a1')], ['a2', adv('a2')]]);

  it('creates a symmetric edge for every adventurer↔NPC pair, at the familiarity-derived opening', () => {
    const graph = seedFamiliarityEdges(advs, npcs);
    for (const aid of ['a1', 'a2']) {
      for (const [nid, npc] of npcs) {
        const expected = openingStrengthForFamiliarity(npc.familiarity);
        expect(graph.get(aid)!.get(nid)!.strength).toBe(expected);
        expect(graph.get(nid)!.get(aid)!.strength).toBe(expected); // symmetric
      }
    }
    // The innkeeper opens warmer than the guard captain.
    expect(graph.get('a1')!.get('npc:inn')!.strength)
      .toBeGreaterThan(graph.get('a1')!.get('npc:guard')!.strength);
  });

  it('seeds no adventurer↔adventurer and no NPC↔NPC edges (familiarity is a townsfolk→newcomer bias only)', () => {
    const graph = seedFamiliarityEdges(advs, npcs);
    expect(graph.get('a1')?.get('a2')).toBeUndefined();
    expect(graph.get('npc:inn')?.get('npc:guard')).toBeUndefined();
  });

  it('seeds ordinary edges (empty history, derived type) that then evolve through normal machinery', () => {
    const graph = seedFamiliarityEdges(advs, npcs);
    const edge = graph.get('a1')!.get('npc:inn')!;
    expect(edge.history).toEqual([]);
    expect(edge.type).toBe(strengthToType(edge.strength));
  });
});

// ---------------------------------------------------------------------------
// Static approach bias in the pressure gain
// ---------------------------------------------------------------------------

describe('familiarity approach bias (computePressureGain)', () => {
  it('a high-familiarity NPC contributes a larger approach bias than a low-familiarity one (gain delta, not a rolled encounter)', () => {
    const a = actor('a1');
    const warm = computePressureGain(a, actor('npc:high', 90), undefined);
    const cool = computePressureGain(a, actor('npc:low', 20), undefined);
    expect(warm).toBeGreaterThan(cool);
  });

  it('leaves adventurer↔adventurer pairs unaffected (no familiarity on either side)', () => {
    const withNpc = computePressureGain(actor('a1'), actor('npc:x', 80), undefined);
    const advOnly = computePressureGain(actor('a1'), actor('a2'), undefined);
    expect(withNpc).toBeGreaterThan(advOnly);
    // The adventurer-only gain equals the same pair with a zero-familiarity partner.
    expect(computePressureGain(actor('a1'), actor('a2', 0), undefined)).toBeCloseTo(advOnly, 10);
  });

  it('the bias is small — never swamps the mood/relationship terms', () => {
    expect(familiarityApproachBias(100)).toBeLessThanOrEqual(FAMILIARITY_APPROACH_BIAS);
    expect(familiarityApproachBias(100)).toBeLessThan(0.05);
    expect(familiarityApproachBias(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Wiring + static invariant (through the loop)
// ---------------------------------------------------------------------------

describe('scenario1 wiring + static invariant', () => {
  it('seeds non-empty adventurer↔NPC edges at world generation', () => {
    const ctx = createScenario1Context('fam-seed');
    const advIds = [...ctx.adventurers.keys()];
    const npcIds = [...ctx.notableNpcs.keys()];
    expect(advIds.length).toBeGreaterThan(0);
    expect(npcIds.length).toBeGreaterThan(0);
    for (const aid of advIds) {
      for (const nid of npcIds) {
        expect(ctx.relationships.get(aid)?.get(nid)).toBeDefined();
      }
    }
  });

  it('every notable NPC carries a static familiarity that survives a multi-day run through the loop', () => {
    const ctx = createScenario1Context('fam-invariant');
    const seed = new Map([...ctx.notableNpcs].map(([id, n]) => [id, n.familiarity]));
    expect([...seed.values()].every(v => typeof v === 'number')).toBe(true);

    const loop = new SimulationLoop(ctx);
    for (let i = 0; i < 72; i++) loop.step(); // ~3 days
    for (const [id, npc] of loop.context.notableNpcs) {
      expect(npc.familiarity).toBe(seed.get(id));
    }
  });

  it('the Thornvale service NPCs seed high familiarity; the guard captain seeds lower', () => {
    const npcs = createThornvaleNpcs();
    const byRole = new Map([...npcs.values()].map(n => [n.role, n.familiarity]));
    expect(byRole.get('INNKEEPER')!).toBeGreaterThanOrEqual(70);
    expect(byRole.get('PRIEST')!).toBeGreaterThanOrEqual(70);
    expect(byRole.get('GUARD_CAPTAIN')!).toBeLessThan(byRole.get('INNKEEPER')!);
    for (const npc of npcs.values()) expect(isNpc(npc.id)).toBe(true);
  });
});

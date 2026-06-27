import { describe, it, expect } from 'vitest';
import { emitEvent, type SimulationEventInput } from '../src/events/eventBus.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';

// ---------------------------------------------------------------------------
// Tracer bullet — SOCIAL/POSITIVE_CHAT
// ---------------------------------------------------------------------------

describe('emitEvent — SOCIAL', () => {
  it('appends event to eventLog with non-empty renderedText', () => {
    const ctx = createSimulationContext('bus-test');
    const result = emitEvent(ctx, {
      kind: 'SOCIAL',
      subtype: 'POSITIVE_CHAT',
      participantIds: ['alice', 'bob'],
      relationshipDelta: 5,
    });
    expect(result.eventLog).toHaveLength(1);
    expect(result.eventLog[0].renderedText).toBeTruthy();
    expect(result.eventLog[0].renderedText.length).toBeGreaterThan(0);
  });

  it('emitted event carries correct kind, subtype, participantIds, and relationshipDelta', () => {
    const ctx = createSimulationContext('shape-test');
    const result = emitEvent(ctx, {
      kind: 'SOCIAL',
      subtype: 'ARGUMENT',
      participantIds: ['zara', 'finn'],
      relationshipDelta: -8,
    });
    const ev = result.eventLog[0] as import('../src/world/types.js').SocialEvent;
    expect(ev.kind).toBe('SOCIAL');
    expect(ev.subtype).toBe('ARGUMENT');
    expect(ev.participantIds).toEqual(['zara', 'finn']);
    expect(ev.relationshipDelta).toBe(-8);
  });

  it('tick field matches ctx.worldTime.tick at emission time', () => {
    const ctx = createSimulationContext('tick-test');
    // Advance to tick 5 manually
    const advanced = { ...ctx, worldTime: { tick: 5, day: 0, hour: 5 } };
    const result = emitEvent(advanced, {
      kind: 'SOCIAL',
      subtype: 'POSITIVE_CHAT',
      participantIds: ['a', 'b'],
      relationshipDelta: 5,
    });
    expect(result.eventLog[0].tick).toBe(5);
  });

  it('does not mutate the prior eventLog — prior events are preserved', () => {
    const ctx = createSimulationContext('append-test');
    const ctx1 = emitEvent(ctx, {
      kind: 'SOCIAL', subtype: 'POSITIVE_CHAT',
      participantIds: ['a', 'b'], relationshipDelta: 5,
    });
    const ctx2 = emitEvent(ctx1, {
      kind: 'SOCIAL', subtype: 'ARGUMENT',
      participantIds: ['a', 'b'], relationshipDelta: -8,
    });
    expect(ctx2.eventLog).toHaveLength(2);
    expect(ctx2.eventLog[0].renderedText).toBeTruthy();
    expect(ctx2.eventLog[1].renderedText).toBeTruthy();
    expect(ctx.eventLog).toHaveLength(0); // original unchanged
  });

  it('two events emitted in sequence get different IDs', () => {
    const ctx = createSimulationContext('id-test');
    const ctx1 = emitEvent(ctx, {
      kind: 'SOCIAL', subtype: 'POSITIVE_CHAT',
      participantIds: ['a', 'b'], relationshipDelta: 5,
    });
    const ctx2 = emitEvent(ctx1, {
      kind: 'SOCIAL', subtype: 'ARGUMENT',
      participantIds: ['a', 'b'], relationshipDelta: -8,
    });
    expect(ctx2.eventLog[0].id).not.toBe(ctx2.eventLog[1].id);
  });

  it('same seed replays to same IDs (determinism)', () => {
    const input = {
      kind: 'SOCIAL' as const, subtype: 'POSITIVE_CHAT' as const,
      participantIds: ['a', 'b'] as [string, string], relationshipDelta: 5,
    };
    const id1 = emitEvent(createSimulationContext('det-test'), input).eventLog[0].id;
    const id2 = emitEvent(createSimulationContext('det-test'), input).eventLog[0].id;
    expect(id1).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// renderedText invariant across every kind/subtype
// ---------------------------------------------------------------------------

describe('emitEvent — renderedText never empty', () => {
  const ctx = createSimulationContext('coverage-test');

  const allInputs: SimulationEventInput[] = [
    // SOCIAL
    { kind: 'SOCIAL', subtype: 'POSITIVE_CHAT',   participantIds: ['a', 'b'], relationshipDelta: 5 },
    { kind: 'SOCIAL', subtype: 'ARGUMENT',         participantIds: ['a', 'b'], relationshipDelta: -8 },
    { kind: 'SOCIAL', subtype: 'BREAKTHROUGH',     participantIds: ['a', 'b'], relationshipDelta: 15 },
    { kind: 'SOCIAL', subtype: 'SILENT_DISTANCE',  participantIds: ['a', 'b'], relationshipDelta: -3 },
    // COMBAT
    { kind: 'COMBAT', subtype: 'BEAT_LOG',         questId: 'q1', involvedIds: ['a'] },
    { kind: 'COMBAT', subtype: 'QUEST_RESOLVED',   questId: 'q1', involvedIds: ['a'] },
    // QUEST
    { kind: 'QUEST', subtype: 'STARTED',   questId: 'q1', partyIds: ['a'] },
    { kind: 'QUEST', subtype: 'COMPLETED', questId: 'q1', partyIds: ['a'] },
    { kind: 'QUEST', subtype: 'FAILED',    questId: 'q1', partyIds: ['a'] },
    { kind: 'QUEST', subtype: 'EXPIRED',   questId: 'q1', partyIds: [] },
    { kind: 'QUEST', subtype: 'DROUGHT',   questId: '',    partyIds: [] },
    // LIFECYCLE
    { kind: 'LIFECYCLE', subtype: 'ADVENTURER_DIED',               involvedIds: ['a'] },
    { kind: 'LIFECYCLE', subtype: 'ADVENTURER_DEPARTED',           involvedIds: ['a'] },
    { kind: 'LIFECYCLE', subtype: 'FRIENDSHIP_FORMED',             involvedIds: ['a', 'b'] },
    { kind: 'LIFECYCLE', subtype: 'TRUSTED_COMPANION_BOND_FORMED', involvedIds: ['a', 'b'] },
    { kind: 'LIFECYCLE', subtype: 'BOND_BROKEN',                   involvedIds: ['a', 'b'] },
    { kind: 'LIFECYCLE', subtype: 'RIVALRY_DEEPENED',              involvedIds: ['a', 'b'] },
    { kind: 'LIFECYCLE', subtype: 'RECONCILIATION',                involvedIds: ['a', 'b'] },
    { kind: 'LIFECYCLE', subtype: 'GOAL_MILESTONE',                involvedIds: ['a'] },
    { kind: 'LIFECYCLE', subtype: 'GOAL_ACHIEVED',                 involvedIds: ['a'] },
    // WORLD
    { kind: 'WORLD', subtype: 'STORM' },
    { kind: 'WORLD', subtype: 'PLAGUE' },
    { kind: 'WORLD', subtype: 'WINDFALL' },
    { kind: 'WORLD', subtype: 'MONSTER_SURGE' },
    { kind: 'WORLD', subtype: 'TRAVELLING_MERCHANT' },
    { kind: 'WORLD', subtype: 'RUMOUR' },
    { kind: 'WORLD', subtype: 'QUEST_DROUGHT' },
    { kind: 'WORLD', subtype: 'REGION_UNLOCKED', regionId: 'r1' },
    { kind: 'WORLD', subtype: 'INTERNAL_ERROR' },
    // DECISION_MOMENT
    { kind: 'DECISION_MOMENT', decisionId: 'd1', situationText: 'Something happens.',
      options: [], expiresAt: 999 },
    // DIVINE
    { kind: 'DIVINE', subtype: 'TOUCH',            diDelta: 0 },
    { kind: 'DIVINE', subtype: 'SEED_EVENT',        diDelta: 0 },
    { kind: 'DIVINE', subtype: 'SHIFT_DIFFICULTY',  diDelta: 0 },
    { kind: 'DIVINE', subtype: 'OPTION_CHOSEN',     diDelta: -5 },
    { kind: 'DIVINE', subtype: 'DI_GAINED',         diDelta: 10 },
    { kind: 'DIVINE', subtype: 'DI_SPENT',          diDelta: -5 },
  ];

  for (const input of allInputs) {
    const label = `kind=${input.kind} subtype=${'subtype' in input ? input.subtype : 'n/a'}`;
    it(`${label} produces non-empty renderedText`, () => {
      const result = emitEvent(ctx, input);
      const ev = result.eventLog[result.eventLog.length - 1];
      expect(ev.renderedText).toBeTruthy();
      expect(ev.renderedText.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Per-kind shape checks
// ---------------------------------------------------------------------------

describe('emitEvent — event shapes', () => {
  const ctx = createSimulationContext('shape-checks');

  it('COMBAT QUEST_RESOLVED carries questId and involvedIds', () => {
    const result = emitEvent(ctx, { kind: 'COMBAT', subtype: 'QUEST_RESOLVED', questId: 'q42', involvedIds: ['hero'] });
    const ev = result.eventLog[0] as import('../src/world/types.js').CombatEvent;
    expect(ev.kind).toBe('COMBAT');
    expect(ev.questId).toBe('q42');
    expect(ev.involvedIds).toContain('hero');
  });

  it('QUEST COMPLETED carries questId and partyIds', () => {
    const result = emitEvent(ctx, { kind: 'QUEST', subtype: 'COMPLETED', questId: 'q7', partyIds: ['a', 'b'] });
    const ev = result.eventLog[0] as import('../src/world/types.js').QuestEvent;
    expect(ev.questId).toBe('q7');
    expect(ev.partyIds).toEqual(['a', 'b']);
  });

  it('LIFECYCLE ADVENTURER_DIED carries involvedIds', () => {
    const result = emitEvent(ctx, { kind: 'LIFECYCLE', subtype: 'ADVENTURER_DIED', involvedIds: ['fallen'] });
    const ev = result.eventLog[0] as import('../src/world/types.js').LifecycleEvent;
    expect(ev.involvedIds).toContain('fallen');
  });

  it('WORLD STORM with regionId includes regionId', () => {
    const result = emitEvent(ctx, { kind: 'WORLD', subtype: 'STORM', regionId: 'darkwood' });
    const ev = result.eventLog[0] as import('../src/world/types.js').WorldEvent;
    expect(ev.regionId).toBe('darkwood');
  });

  it('DIVINE DI_SPENT carries negative diDelta', () => {
    const result = emitEvent(ctx, { kind: 'DIVINE', subtype: 'DI_SPENT', diDelta: -5 });
    const ev = result.eventLog[0] as import('../src/world/types.js').DivineInterventionEvent;
    expect(ev.diDelta).toBeLessThan(0);
  });
});

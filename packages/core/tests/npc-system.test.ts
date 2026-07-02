/**
 * Town NPC system (p10d) — Tier A notable-NPC encounters, Tier B flavour, and the
 * FESTIVAL town span.
 *
 * Spec: specs/behaviors/npc-system.md. Plan: plans/p10d-npc-system.md.
 * Encounter side effects route through `resolveEncounter`; accumulation through
 * `socialPressureSubscriber` (CLAUDE.md subscriber rule). Tier B flavour through
 * `npcFlavourSubscriber`; festival effects through the span helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  socialPressureSubscriber,
  resolveEncounter,
  computePressureGain,
  actorView,
  festivalPressureMultiplier,
} from '../src/events/socialResolver.js';
import { rollTownFlavour, townFlavourChance, TOWN_ROLES } from '../src/events/npcFlavour.js';
import { computeActivityWeights } from '../src/events/activitySystem.js';
import { resolveQuest } from '../src/quests/questSystem.js';
import { applyDayTickDecay } from '../src/relationships/graph.js';
import { createSimulationContext } from '../src/world/SimulationContext.js';
import { createEdge } from '../src/relationships/graph.js';
import { makeNpcId, isNpc } from '../src/world/actors.js';
import { openFestivalSpan, hasActiveSpan } from '../src/world/WorldExpansion.js';
import { createStartingRegions } from '../src/world/WorldExpansion.js';
import type {
  Adventurer,
  ActivityId,
  NotableNpc,
  Quest,
  RelationshipGraph,
  SimulationContext,
} from '../src/world/types.js';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function makeAdv(id: string, opts: Partial<{ mood: number; activity: ActivityId | null; state: Adventurer['state'] }> = {}): Adventurer {
  const { mood = 50, activity = 'EATING', state = 'IDLE' } = opts;
  return {
    id,
    identity: { id, name: id, age: 25, backstory: 'A wanderer.', personalGoal: 'HEROISM' },
    personality: { courage: 50, greed: 50, empathy: 50, loyalty: 50, ambition: 50, stubborn: 0 },
    mood, moodFactors: [], state, history: [], despairStreak: 0,
    personalGoalProgress: { goal: 'HEROISM', milestones: [], completed: false },
    currentQuestId: null,
    activityState: activity ? { current: activity, enteredAt: 0, scheduledExitAt: 9999, nextMicroEventAt: 9999 } : undefined,
  };
}

function makeNpc(slug: string, traits: Partial<NotableNpc['traits']> = {}, mood = 50): NotableNpc {
  return {
    id: makeNpcId(slug),
    name: `NPC-${slug}`,
    role: 'BLACKSMITH',
    traits: { empathy: 60, courage: 50, ...traits },
    bio: 'A townsperson.',
    mood,
    moodFactors: [],
    history: [],
    want: { id: 'WANT_TEST', text: 'a quieter town' },
  };
}

function graphWithEdges(edges: Array<[string, string, number]>): RelationshipGraph {
  const g: RelationshipGraph = new Map();
  const set = (a: string, b: string, s: number): void => {
    const inner = g.get(a) ?? new Map();
    inner.set(b, createEdge(s));
    g.set(a, inner);
  };
  for (const [a, b, s] of edges) { set(a, b, s); set(b, a, s); }
  return g;
}

function ctxWith(
  advs: Adventurer[],
  npcs: NotableNpc[],
  edges: Array<[string, string, number]> = [],
  seed = 'npc',
): SimulationContext {
  const base = createSimulationContext(seed);
  return {
    ...base,
    adventurers: new Map(advs.map(a => [a.id, a])),
    notableNpcs: new Map(npcs.map(n => [n.id, n])),
    relationships: graphWithEdges(edges),
    activeRegions: createStartingRegions(),
  };
}

const socialEvents = (ctx: SimulationContext) => ctx.eventLog.filter(e => e.kind === 'SOCIAL');
const npcEvents = (ctx: SimulationContext) => ctx.eventLog.filter(e => e.kind === 'NPC');
const lifecycleOf = (ctx: SimulationContext, subtype: string) =>
  ctx.eventLog.filter(e => e.kind === 'LIFECYCLE' && (e as { subtype: string }).subtype === subtype);

// ---------------------------------------------------------------------------
// Tier A — notable NPCs as honorary graph actors
// ---------------------------------------------------------------------------

describe('Tier A — notable-NPC relationship edges', () => {
  it('an adventurer↔notable-NPC edge crosses to FRIEND at ≥40 and fires exactly one FRIENDSHIP_FORMED', () => {
    const adv = makeAdv('a');
    const npc = makeNpc('smith');
    // Start at ACQUAINTANCE (32); BREAKTHROUGH (+18) → 50 → FRIEND.
    const ctx = ctxWith([adv], [npc], [[adv.id, npc.id, 32]]);
    const next = resolveEncounter(ctx, [adv.id, npc.id], { forceOutcome: 'BREAKTHROUGH' });

    expect(next.relationships.get(adv.id)!.get(npc.id)!.strength).toBe(50);
    expect(next.relationships.get(adv.id)!.get(npc.id)!.type).toBe('FRIEND');
    expect(lifecycleOf(next, 'FRIENDSHIP_FORMED')).toHaveLength(1);
  });

  it('a Tier A encounter emits a SocialEvent with the NPC id in participantIds and the six-outcome delta', () => {
    const adv = makeAdv('a');
    const npc = makeNpc('smith');
    const ctx = ctxWith([adv], [npc], [[adv.id, npc.id, 20]]);
    const next = resolveEncounter(ctx, [adv.id, npc.id], { forceOutcome: 'ARGUMENT' });

    const evs = socialEvents(next);
    expect(evs).toHaveLength(1);
    const ev = evs[0] as { participantIds: string[]; relationshipDelta: number; renderedText: string };
    expect(ev.participantIds).toContain(npc.id);
    expect(ev.relationshipDelta).toBe(-10); // ARGUMENT (social-system.md §5)
    // The NPC's name, not its raw id, appears in the rendered line.
    expect(ev.renderedText).toContain(npc.name);
    expect(ev.renderedText).not.toContain(npc.id);
  });

  it('a notable-NPC edge decays under the 14-day long-separation rule', () => {
    const adv = makeAdv('a');
    const npc = makeNpc('smith');
    const graph = graphWithEdges([[adv.id, npc.id, 50]]);
    const advMap = new Map([[adv.id, { state: adv.state }]]);
    // 15 days since last shared activity (lastActivity defaults to tick 0).
    const decayed = applyDayTickDecay(graph, {}, 15 * 24, advMap);
    expect(decayed.get(adv.id)!.get(npc.id)!.strength).toBe(49);
  });

  it('NPCs accumulate social pressure with adventurers, but NPC↔NPC pairs never do', () => {
    const adv = makeAdv('a', { activity: 'DRINKING' });
    const npc1 = makeNpc('smith');
    const npc2 = makeNpc('guard');
    let ctx = ctxWith([adv], [npc1, npc2], [[adv.id, npc1.id, 20], [npc1.id, npc2.id, 20]]);

    for (let i = 0; i < 5; i++) {
      const tick = ctx.worldTime.tick + 1;
      ctx = socialPressureSubscriber({ ...ctx, worldTime: { tick, day: Math.floor(tick / 24), hour: tick % 24 } });
    }

    const advNpcKey = [adv.id, npc1.id].sort().join('-');
    const npcNpcKey = [npc1.id, npc2.id].sort().join('-');
    expect(ctx.socialPressure.get(advNpcKey) ?? 0).toBeGreaterThan(0);
    expect(ctx.socialPressure.has(npcNpcKey)).toBe(false); // NPC↔NPC skipped entirely
  });

  it('actorView projects a notable NPC into an encounter actor (partial traits filled to midpoint)', () => {
    const npc = makeNpc('smith', { empathy: 80 });
    const ctx = ctxWith([], [npc]);
    const view = actorView(ctx, npc.id)!;
    expect(view.id).toBe(npc.id);
    expect(view.personality.empathy).toBe(80);
    expect(view.personality.loyalty).toBe(50); // unset trait → neutral midpoint
    expect(isNpc(view.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Co-quest exclusion
// ---------------------------------------------------------------------------

describe('Tier A — co-quest delta exclusion', () => {
  it('a co-quest success delta is never applied to an edge with an NPC endpoint', () => {
    const advA = makeAdv('a');
    const advB = makeAdv('b');
    const npcMember = makeAdv(makeNpcId('smith')); // NPC id smuggled into a party — the guard must skip it
    const ctx = ctxWith(
      [advA, advB, npcMember], [],
      [[advA.id, advB.id, 20], [advA.id, npcMember.id, 20]],
    );
    const quest: Quest = {
      id: 'q1', type: 'BOUNTY', name: 'Test Bounty', difficulty: 0, duration: 4, reward: 10,
      risk: { injuryChance: 0, deathChance: 0, criticalFailChance: 0 },
      requiredPartySize: 3, expiresAt: 999, assignedParty: [advA.id, advB.id, npcMember.id], status: 'IN_PROGRESS',
    };
    const result = resolveQuest(quest, [advA, advB, npcMember], ctx, 0);
    expect(result.success).toBe(true); // difficulty 0 → guaranteed

    // Adventurer↔adventurer pair strengthened (+8); NPC-endpoint edge untouched.
    expect(result.ctx.relationships.get(advA.id)!.get(advB.id)!.strength).toBe(28);
    expect(result.ctx.relationships.get(advA.id)!.get(npcMember.id)!.strength).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Tier B — nameless-role flavour
// ---------------------------------------------------------------------------

describe('Tier B — town flavour', () => {
  it('emits an NPCEvent with non-empty, slot-free renderedText and no relationship/mood change', () => {
    const adv = makeAdv('a', { activity: 'DRINKING' });
    // chance = 1 forces a flavour line every eligible tick (deterministic).
    let ctx = ctxWith([adv], []);
    const before = ctx.relationships;
    ctx = rollTownFlavour(ctx, 1); // chance 1 → deterministic fire

    const evs = npcEvents(ctx);
    expect(evs.length).toBeGreaterThan(0);
    const ev = evs[0] as { subtype: string; role: string; adventurerId: string; renderedText: string };
    expect(ev.subtype).toBe('TOWN_FLAVOUR');
    expect(ev.adventurerId).toBe(adv.id);
    expect(TOWN_ROLES).toContain(ev.role);
    expect(ev.renderedText.length).toBeGreaterThan(0);
    expect(ev.renderedText).not.toMatch(/\{[a-z]+\}/); // no unfilled slots
    // No relationship or mood mutation.
    expect(ctx.relationships).toBe(before);
    expect(ctx.adventurers.get(adv.id)!.moodFactors).toHaveLength(0);
  });

  it('does not fire during a PRIVATE (non-town) activity', () => {
    const adv = makeAdv('a', { activity: 'READING' });
    let ctx = ctxWith([adv], []);
    ctx = rollTownFlavour(ctx, 1);
    expect(npcEvents(ctx)).toHaveLength(0);
  });

  it('a live FESTIVAL raises the Tier B flavour chance', () => {
    const base = ctxWith([makeAdv('a')], []);
    const festive = openFestivalSpan(base);
    expect(townFlavourChance(festive)).toBeGreaterThan(townFlavourChance(base));
  });
});

// ---------------------------------------------------------------------------
// FESTIVAL town span
// ---------------------------------------------------------------------------

describe('FESTIVAL town span', () => {
  it('a live FESTIVAL raises social pressure gain and reverts when it ends', () => {
    const base = ctxWith([makeAdv('a')], [], []);
    expect(festivalPressureMultiplier(base)).toBe(1);

    const festive = openFestivalSpan(base);
    expect(hasActiveSpan(festive, 'FESTIVAL')).toBe(true);
    expect(festivalPressureMultiplier(festive)).toBeGreaterThan(1);

    // Pressure gain is scaled by the festival multiplier in the subscriber.
    const a = makeAdv('a', { activity: 'DRINKING' });
    const npc = makeNpc('smith');
    const plain = ctxWith([a], [npc], [[a.id, npc.id, 20]]);
    const festivePair = openFestivalSpan(plain);
    const gain = computePressureGain(a, actorView(plain, npc.id)!, plain.relationships.get(a.id)!.get(npc.id));
    expect(gain * festivalPressureMultiplier(festivePair)).toBeGreaterThan(gain);
  });

  it('a live FESTIVAL raises Social-cluster activity weight, and reverts on END', () => {
    const adv = makeAdv('a');
    const plain = ctxWith([adv], []);
    const festive = openFestivalSpan(plain);
    const plainW = computeActivityWeights(adv, plain).DRINKING;
    const festiveW = computeActivityWeights(adv, festive).DRINKING;
    expect(festiveW).toBeGreaterThan(plainW);

    // Force-expire the span → weight reverts to baseline.
    const region = festive.activeRegions.get('THORNVALE')!;
    const ended: SimulationContext = {
      ...festive,
      activeRegions: new Map(festive.activeRegions).set('THORNVALE', { ...region, activeWorldEvents: [] }),
    };
    expect(computeActivityWeights(adv, ended).DRINKING).toBe(plainW);
  });
});

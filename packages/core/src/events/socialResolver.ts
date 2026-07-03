/**
 * Social pressure resolver — the accumulate-then-discharge social escalation engine.
 *
 * Spec: specs/behaviors/social-system.md §4 (pressure trigger), §5 (six-outcome resolution).
 * Plan: plans/p10c-social-pressure.md (constants frozen in its Notes block).
 *
 * Replaces the legacy memoryless `pairHour` per-tick coin-flip. Tension between two
 * adventurers *builds* each tick (proximity + mood strain + relationship friction, gated by
 * what they are each doing) and discharges at a jittered moment once it crosses THRESHOLD.
 * After firing, the pair cools off. Encounters resolve to one of six outcomes on a
 * valence × intensity grid and are rendered by the P10a template grammar (no per-scene LLM).
 *
 * Module shape: `socialPressureSubscriber` is a thin per-tick driver that decides which pairs
 * accumulate / discharge; `resolveEncounter` is the deep write site that applies every side
 * effect (relationship deltas, mood factors, threshold lifecycle events, pressure reset +
 * cooldown, the single SocialEvent). Tests route encounter behaviour through `resolveEncounter`
 * and accumulation/discharge through the subscriber (per CLAUDE.md's subscriber-test rule).
 */
import type {
  SimulationContext,
  ActorId,
  ActivityId,
  ActivityState,
  AdventurerState,
  NotableNpc,
  PairKey,
  RelationshipEdge,
  RelationshipGraph,
  SocialOutcomeType,
  PersonalityAxes,
  MoodFactor,
} from '../world/types.js';
import {
  strengthToType,
  applyStrengthShift,
  detectThresholdEvents,
  createEdge,
} from '../relationships/graph.js';
import { isNpc } from '../world/actors.js';
import { upsertMoodFactor } from '../adventurers/mood.js';
import { emitEvent } from './eventBus.js';
import { updateReputation, hasActiveSpan } from '../world/WorldExpansion.js';
import { grantDI } from '../divine/DivineInfluence.js';

// ---------------------------------------------------------------------------
// Encounter actors — adventurers and Tier A notable NPCs both participate in
// encounters. An `EncounterActor` is the minimal shape the pressure/stats/outcome
// machinery reads; an Adventurer satisfies it structurally, and a notable NPC is
// projected into it (npc-system.md — "honorary adventurers in the graph").
// ---------------------------------------------------------------------------

export type EncounterActor = {
  id: ActorId;
  mood: number;
  personality: PersonalityAxes;
  state: AdventurerState;
  activityState?: ActivityState;
};

/** Neutral fill for a notable NPC's partial trait axes (NPCs carry only enough to
 *  drive encounter valence/intensity; unset axes read as the 50 midpoint). */
function npcPersonality(traits: Partial<PersonalityAxes>): PersonalityAxes {
  return {
    courage: traits.courage ?? 50,
    greed: traits.greed ?? 50,
    empathy: traits.empathy ?? 50,
    loyalty: traits.loyalty ?? 50,
    ambition: traits.ambition ?? 50,
    stubborn: traits.stubborn ?? 0,
  };
}

/** Project a notable NPC into an encounter actor. NPCs are always present and awake
 *  (no activity pool); mood is live (day-tick decayed, encounter-written). */
function npcToActor(npc: NotableNpc): EncounterActor {
  return { id: npc.id, mood: npc.mood, personality: npcPersonality(npc.traits), state: 'IDLE' };
}

/** Resolve an actor id to its encounter view — a real adventurer or a projected NPC. */
export function actorView(ctx: SimulationContext, id: ActorId): EncounterActor | undefined {
  const adv = ctx.adventurers.get(id);
  if (adv) return adv;
  const npc = ctx.notableNpcs.get(id);
  return npc ? npcToActor(npc) : undefined;
}

// ---------------------------------------------------------------------------
// Tuning constants — frozen by the pressure-accumulator grill (plan Notes D1–D7).
// Confirm/adjust against a 30-day playtest at closeout.
// ---------------------------------------------------------------------------

const PROXIMITY = 0.05;          // flat per-tick floor for being co-present & awake (D2)
const DECAY = 0.015;             // net-flow decay floor; below public gain, above withdrawn gain (D3)
const THRESHOLD = 1.0;           // pressure level at which an encounter becomes "due" (D4)
const FIRE_BASE = 0.2;           // base per-tick discharge probability once due (D4)
const OVERSHOOT_CAP = 2.0;       // overshoot multiplier cap → max fireProb 0.4 (D4)
const COOLDOWN_BASE = 8;         // post-fire cooldown floor, ticks (D5)
const COOLDOWN_JITTER = 16;      // post-fire cooldown jitter span → window [8, 24) (D5)
const ESTRANGEMENT_COOLDOWN = 120; // 5-day approach lock after ESTRANGEMENT (D5)
const THRESHOLD_PROB = 0.4;      // rare-outcome (BREAKTHROUGH/ESTRANGEMENT) escalation gate (D6)
const ENEMY_FLOOR = -51;         // strength ≤ this never accumulates voluntarily (spec §4 step 1)
const MAX_GROUP = 4;             // group scene participant cap (spec §3)

/** While a FESTIVAL town span is live, social pressure builds faster guild-wide
 *  (npc-system.md — festivals raise approach pressure). */
export const FESTIVAL_PRESSURE_MULT = 1.5;

/** Per-tick pressure-gain multiplier for the current festival state. */
export function festivalPressureMultiplier(ctx: SimulationContext): number {
  return hasActiveSpan(ctx, 'FESTIVAL') ? FESTIVAL_PRESSURE_MULT : 1;
}

/** Compatibility multiplier per solo activity (spec §4 table). Scales how readily proximity
 *  becomes a scene. Unlisted activities (PATROL/HUNTING/GAMBLING/SLEEPING) take sensible
 *  defaults; SLEEPING never accumulates anyway (frozen). */
const COMPAT: Record<ActivityId, number> = {
  DRINKING: 2.5,
  COOKING: 2.0,
  GOSSIPING: 1.8,
  GAMBLING: 1.8,
  EATING: 1.5,
  BROODING: 1.2,
  TRAINING: 1.0,
  SPARRING: 1.0,
  CRAFTING: 0.6,
  PATROL: 0.5,
  HUNTING: 0.3,
  READING: 0.3,
  PRAYING: 0.2,
  RESTING: 0.15,
  SLEEPING: 0.0,
};

// ---------------------------------------------------------------------------
// Keys & small helpers
// ---------------------------------------------------------------------------

/** Canonical sorted pair key "A-B". */
export function pairKey(idA: ActorId, idB: ActorId): PairKey {
  return [idA, idB].sort().join('-');
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Relationship strength inflection points; an edge within ±5 of one is "near boundary". */
const BOUNDARIES = [70, 40, 11, -10, -50];
function isNearBoundary(strength: number): boolean {
  return BOUNDARIES.some(b => Math.abs(strength - b) <= 5);
}

function activityCompat(adv: EncounterActor): number {
  const act = adv.activityState?.current;
  return act !== undefined ? COMPAT[act] : 1.0;
}

/** Pair compatibility = the more-withdrawn member gates the pair (min of the two). */
function compatibilityFor(a: EncounterActor, b: EncounterActor): number {
  return Math.min(activityCompat(a), activityCompat(b));
}

function isAwake(adv: EncounterActor): boolean {
  return adv.activityState?.current !== 'SLEEPING';
}

/** Present = available to socialise this tick (not away on a quest, not gone). */
function isPresent(adv: EncounterActor): boolean {
  return adv.state !== 'ON_QUEST'
    && adv.state !== 'IN_DUNGEON'
    && adv.state !== 'DEAD'
    && adv.state !== 'RETIRED';
}

// ---------------------------------------------------------------------------
// Pressure gain (spec §4 step 3 / plan D2)
// ---------------------------------------------------------------------------

/**
 * Per-tick pressure gain (before the DECAY floor). Three commensurable additive terms
 * (hundredths) scaled by empathy and activity compatibility:
 *   gain = (proximity + moodStrain + relationshipTension) × compatibilityMult × empathyMult
 */
export function computePressureGain(
  a: EncounterActor,
  b: EncounterActor,
  edge: RelationshipEdge | undefined,
): number {
  const proximity = PROXIMITY;

  const moodGap = Math.abs(a.mood - b.mood);
  const minMood = Math.min(a.mood, b.mood);
  const moodStrain = 0.03 * (moodGap / 100) + 0.03 * clamp((40 - minMood) / 40, 0, 1);

  const isRival = edge !== undefined && strengthToType(edge.strength) === 'RIVAL';
  const nearBoundary = edge !== undefined && isNearBoundary(edge.strength);
  const relationshipTension = 0.005 + (isRival ? 0.025 : 0) + (nearBoundary ? 0.015 : 0);

  const empathyMult = 0.5 + Math.max(a.personality.empathy, b.personality.empathy) / 100;
  const compatibilityMult = compatibilityFor(a, b);

  return (proximity + moodStrain + relationshipTension) * compatibilityMult * empathyMult;
}

// ---------------------------------------------------------------------------
// Join vs interrupt (spec §3) — driven by the approaching character's personality
// ---------------------------------------------------------------------------

export type ApproachResult = 'JOIN' | 'INTERRUPT';

export function decideApproach(approacher: EncounterActor, compatibility: number): ApproachResult {
  const { empathy, courage } = approacher.personality;
  if (empathy >= 55) return 'JOIN';
  if (empathy < 40 && courage >= 60) return 'INTERRUPT';
  return compatibility >= 1.5 ? 'JOIN' : 'INTERRUPT';
}

// ---------------------------------------------------------------------------
// Outcome resolution (spec §5)
// ---------------------------------------------------------------------------

export type EncounterStats = {
  moodAvg: number;
  moodGap: number;   // max pairwise gap in a group
  clashScore: number; // max pairwise personality-axis difference
  strength: number;   // average pairwise relationship strength
};

/**
 * Resolve a (post-approach) encounter to one of the six outcomes. Pure over
 * `(stats, rng, crisis)`. The two rare outcomes (BREAKTHROUGH / ESTRANGEMENT) require a
 * very-high gap AND pass an rng `THRESHOLD_PROB` gate — bypassed when a crisis flag is set.
 */
export function resolveOutcome(
  stats: EncounterStats,
  rng: SimulationContext['rng'],
  crisis = false,
): SocialOutcomeType {
  const { moodAvg, moodGap, clashScore, strength } = stats;

  const valence: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' =
    moodAvg > 55 && strength > 10 ? 'POSITIVE'
    : moodAvg < 25 || strength < -10 ? 'NEGATIVE'
    : 'NEUTRAL';

  const strong = moodGap > 35 || clashScore > 50;
  const veryHighGap = moodGap > 50 || clashScore > 70; // always implies STRONG

  const escalate = (): boolean => crisis || rng.next() < THRESHOLD_PROB;

  if (valence === 'POSITIVE') {
    if (!strong) return 'BANTER';
    if (veryHighGap && escalate()) return 'BREAKTHROUGH';
    return 'SOLIDARITY';
  }
  if (valence === 'NEGATIVE') {
    if (veryHighGap && escalate()) return 'ESTRANGEMENT';
    return 'ARGUMENT';
  }
  return 'SILENT_DISTANCE';
}

// ---------------------------------------------------------------------------
// Outcome effects (spec §5 table / plan D7)
// ---------------------------------------------------------------------------

type OutcomeEffect = {
  relationshipDelta: number;
  moodId?: string;
  moodLabel?: string;
  moodValue?: number;
  moodDecay?: number;
};

const OUTCOME_EFFECTS: Record<SocialOutcomeType, OutcomeEffect> = {
  BANTER:          { relationshipDelta: +3,  moodId: 'SOCIAL_BANTER',       moodLabel: 'Good company',      moodValue: +5,  moodDecay: 0.20 },
  SOLIDARITY:      { relationshipDelta: +10, moodId: 'SOCIAL_SOLIDARITY',   moodLabel: 'Solidarity',        moodValue: +12, moodDecay: 0.15 },
  BREAKTHROUGH:    { relationshipDelta: +18, moodId: 'SOCIAL_BREAKTHROUGH', moodLabel: 'A breakthrough',    moodValue: +22, moodDecay: 0.08 },
  SILENT_DISTANCE: { relationshipDelta: -1 },
  ARGUMENT:        { relationshipDelta: -10, moodId: 'SOCIAL_ARGUMENT',     moodLabel: 'A bitter argument', moodValue: -12, moodDecay: 0.25 },
  ESTRANGEMENT:    { relationshipDelta: -22, moodId: 'SOCIAL_ESTRANGEMENT', moodLabel: 'Estrangement',      moodValue: -25, moodDecay: 0.07 },
};

// ---------------------------------------------------------------------------
// Encounter resolution — the authoritative write site
// ---------------------------------------------------------------------------

function maxAxisDiff(pa: PersonalityAxes, pb: PersonalityAxes): number {
  const axes: Array<keyof PersonalityAxes> = ['courage', 'greed', 'empathy', 'loyalty', 'ambition', 'stubborn'];
  let max = 0;
  for (const ax of axes) {
    const diff = Math.abs((pa[ax] ?? 0) - (pb[ax] ?? 0));
    if (diff > max) max = diff;
  }
  return max;
}

/** Aggregate per-encounter stats across 2–4 participants. */
function computeStats(participants: EncounterActor[], graph: RelationshipGraph): EncounterStats {
  const moods = participants.map(p => p.mood);
  const moodAvg = moods.reduce((s, m) => s + m, 0) / moods.length;

  let moodGap = 0;
  let clashScore = 0;
  let strengthSum = 0;
  let pairCount = 0;
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i]!;
      const b = participants[j]!;
      moodGap = Math.max(moodGap, Math.abs(a.mood - b.mood));
      clashScore = Math.max(clashScore, maxAxisDiff(a.personality, b.personality));
      strengthSum += graph.get(a.id)?.get(b.id)?.strength ?? 0;
      pairCount++;
    }
  }
  return { moodAvg, moodGap, clashScore, strength: pairCount > 0 ? strengthSum / pairCount : 0 };
}

/** Ensure a symmetric edge exists for the pair (default STRANGER strength 0). */
function ensureEdge(graph: RelationshipGraph, idA: ActorId, idB: ActorId): RelationshipGraph {
  if (graph.get(idA)?.get(idB) && graph.get(idB)?.get(idA)) return graph;
  const next = new Map(graph);
  const a = new Map(next.get(idA) ?? []);
  const b = new Map(next.get(idB) ?? []);
  if (!a.get(idB)) a.set(idB, createEdge(0));
  if (!b.get(idA)) b.set(idA, createEdge(0));
  next.set(idA, a);
  next.set(idB, b);
  return next;
}

export type ResolveEncounterOptions = {
  crisis?: boolean;
  /** Override the rolled outcome (testing only). */
  forceOutcome?: SocialOutcomeType;
};

/**
 * Resolve one social encounter among 2–4 participants and apply every side effect:
 * relationship deltas + threshold lifecycle events on all pairs, a mood factor per
 * participant, the single SocialEvent, and a pressure reset + post-fire cooldown for every
 * involved pair (ESTRANGEMENT extends the cooldown to its 5-day approach lock).
 */
export function resolveEncounter(
  ctx: SimulationContext,
  participantIds: ActorId[],
  opts: ResolveEncounterOptions = {},
): SimulationContext {
  const ids = participantIds.slice(0, MAX_GROUP);
  const participants = ids.map(id => actorView(ctx, id)).filter((a): a is EncounterActor => a !== undefined);
  if (participants.length < 2) return ctx;

  const tick = ctx.worldTime.tick;
  const stats = computeStats(participants, ctx.relationships);
  const outcome = opts.forceOutcome ?? resolveOutcome(stats, ctx.rng, opts.crisis);
  const effect = OUTCOME_EFFECTS[outcome];

  let next = ctx;
  let graph = next.relationships;
  const lastShared = { ...next.lastSharedActivity };
  const pressure = new Map(next.socialPressure);
  const cooldowns = new Map(next.socialCooldowns);

  // Cooldown horizon for this fire (jittered); ESTRANGEMENT extends to its approach lock.
  const baseCooldown = tick + COOLDOWN_BASE + Math.floor(next.rng.next() * COOLDOWN_JITTER);
  const cooldownExpiry = outcome === 'ESTRANGEMENT'
    ? Math.max(baseCooldown, tick + ESTRANGEMENT_COOLDOWN)
    : baseCooldown;

  // --- Relationship deltas + threshold events for every pair in the scene ---
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const idA = participants[i]!.id;
      const idB = participants[j]!.id;
      const key = pairKey(idA, idB);

      graph = ensureEdge(graph, idA, idB);
      const priorStrength = graph.get(idA)!.get(idB)!.strength;
      graph = applyStrengthShift(graph, idA, idB, effect.relationshipDelta, tick, outcome);
      const newStrength = graph.get(idA)!.get(idB)!.strength;

      lastShared[key] = tick;
      pressure.set(key, 0);
      cooldowns.set(key, cooldownExpiry);

      next = { ...next, relationships: graph, lastSharedActivity: lastShared, socialPressure: pressure, socialCooldowns: cooldowns };

      // Threshold lifecycle events (bond formed/broken etc.) — preserved from the legacy
      // resolver so social outcomes still drive friendship/rivalry milestones, DI and reputation.
      for (const te of detectThresholdEvents(idA, idB, priorStrength, newStrength)) {
        next = emitEvent(next, { kind: 'LIFECYCLE', subtype: te.type, involvedIds: [te.adventurerId1, te.adventurerId2] });
        if (te.type === 'TRUSTED_COMPANION_BOND_FORMED') {
          next = { ...next, reputation: updateReputation(next.reputation, { event: 'BOND_FORMED' }) };
          next = grantDI(next, 8);
        } else if (te.type === 'FRIENDSHIP_FORMED') {
          next = grantDI(next, 8);
        }
      }
    }
  }

  // --- Mood factor per participant (adventurers and notable NPCs alike) ---
  if (effect.moodId && effect.moodValue !== undefined) {
    const factor: MoodFactor = {
      id: effect.moodId,
      label: effect.moodLabel ?? effect.moodId,
      value: effect.moodValue,
      decayRate: effect.moodDecay ?? 0.2,
    };
    const updated = new Map(next.adventurers);
    const updatedNpcs = new Map(next.notableNpcs);
    let npcTouched = false;
    for (const id of ids) {
      const adv = updated.get(id);
      if (adv) {
        updated.set(id, { ...adv, moodFactors: upsertMoodFactor(adv.moodFactors, factor) });
        continue;
      }
      const npc = updatedNpcs.get(id);
      if (npc) {
        updatedNpcs.set(id, { ...npc, moodFactors: upsertMoodFactor(npc.moodFactors, factor) });
        npcTouched = true;
      }
    }
    next = { ...next, adventurers: updated, ...(npcTouched ? { notableNpcs: updatedNpcs } : {}) };
  }

  // --- The single SocialEvent (rendered by the P10a grammar via emitEvent) ---
  next = emitEvent(next, {
    kind: 'SOCIAL',
    subtype: outcome,
    participantIds: ids,
    relationshipDelta: effect.relationshipDelta,
  });

  return next;
}

// ---------------------------------------------------------------------------
// Group aggregation — union-find over pairs firing in the same tick
// ---------------------------------------------------------------------------

function groupFiringPairs(firing: Array<[ActorId, ActorId]>): ActorId[][] {
  const parent = new Map<ActorId, ActorId>();
  const find = (x: ActorId): ActorId => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (x: ActorId, y: ActorId): void => {
    if (parent.get(x) === undefined) parent.set(x, x);
    if (parent.get(y) === undefined) parent.set(y, y);
    parent.set(find(x), find(y));
  };
  for (const [a, b] of firing) union(a, b);

  const groups = new Map<ActorId, ActorId[]>();
  const members = new Set<ActorId>();
  for (const [a, b] of firing) { members.add(a); members.add(b); }
  for (const m of members) {
    const root = find(m);
    const list = groups.get(root) ?? [];
    list.push(m);
    groups.set(root, list);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Subscriber — per-tick accumulation, decay, and jittered discharge
// ---------------------------------------------------------------------------

export function socialPressureSubscriber(ctx: SimulationContext): SimulationContext {
  // Adventurers present this tick + all notable NPCs (always present as honorary actors).
  const actors: EncounterActor[] = [
    ...[...ctx.adventurers.values()].filter(isPresent),
    ...[...ctx.notableNpcs.values()].map(npcToActor),
  ];
  if (actors.length < 2) return ctx;

  const tick = ctx.worldTime.tick;
  const festivalMult = festivalPressureMultiplier(ctx);
  const pressure = new Map(ctx.socialPressure);
  const firing: Array<[ActorId, ActorId]> = [];

  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i]!;
      const b = actors[j]!;

      // No NPC↔NPC relationships in scope (npc-system.md) — skip NPC-only pairs.
      if (isNpc(a.id) && isNpc(b.id)) continue;

      const key = pairKey(a.id, b.id);

      // Post-fire / ESTRANGEMENT cooldown — no accumulation while active.
      if ((ctx.socialCooldowns.get(key) ?? 0) > tick) continue;

      const edge = ctx.relationships.get(a.id)?.get(b.id);

      // Enemy gate — enemies never accumulate pressure voluntarily (no crisis path yet).
      if (edge && edge.strength <= ENEMY_FLOOR) continue;

      // Frozen when either is asleep — sleep is a nightly pause, not a reset.
      if (!isAwake(a) || !isAwake(b)) continue;

      const gain = computePressureGain(a, b, edge) * festivalMult;
      const nextP = Math.max(0, (pressure.get(key) ?? 0) + gain - DECAY);
      pressure.set(key, nextP);

      if (nextP >= THRESHOLD) {
        const fireProb = FIRE_BASE * Math.min(OVERSHOOT_CAP, nextP / THRESHOLD);
        if (ctx.rng.next() < fireProb) firing.push([a.id, b.id]);
      }
    }
  }

  let next: SimulationContext = { ...ctx, socialPressure: pressure };
  if (firing.length === 0) return next;

  // Resolve each connected group of firing pairs as one encounter (≤ 4 participants).
  for (const group of groupFiringPairs(firing)) {
    next = resolveEncounter(next, group.slice(0, MAX_GROUP));
  }
  return next;
}

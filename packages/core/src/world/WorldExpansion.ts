/**
 * World Expansion — region unlocks driven by reputation and scenario completion.
 *
 * Spec: specs/behaviors/world-expansion.md
 *
 * Region unlock triggers:
 *   ASHWOOD  — ScenarioComplete OR reputation ≥ 200
 *   STORMPASS — reputation ≥ 500 OR 2 scenarios complete
 *
 * Unlock is idempotent: already-unlocked regions are not re-fired.
 */
import type {
  SimulationContext,
  Region,
  RegionId,
  WorldEventType,
  WorldEventInstance,
} from './types.js';
import { emitEvent } from '../events/eventBus.js';

// ---------------------------------------------------------------------------
// Starting regions
// ---------------------------------------------------------------------------

export function createStartingRegions(): Map<RegionId, Region> {
  return new Map<RegionId, Region>([
    ['THORNVALE', {
      id: 'THORNVALE',
      name: 'Thornvale',
      difficulty: 3,
      activeWorldEvents: [],
      unlocked: true,
    }],
    ['ASHWOOD', {
      id: 'ASHWOOD',
      name: 'The Ashwood',
      difficulty: 5,
      activeWorldEvents: [],
      unlocked: false,
    }],
    ['STORMPASS', {
      id: 'STORMPASS',
      name: 'Stormpass',
      difficulty: 7,
      activeWorldEvents: [],
      unlocked: false,
    }],
  ]);
}

// ---------------------------------------------------------------------------
// Reputation helpers
// ---------------------------------------------------------------------------

export type ReputationEvent =
  | { event: 'QUEST_SUCCESS'; difficulty: number }
  | { event: 'QUEST_FAILURE' }
  | { event: 'ADVENTURER_DEATH' }
  | { event: 'BOND_FORMED' }
  | { event: 'GOAL_ACHIEVED' }
  | { event: 'SCENARIO_OBJECTIVE' };

/** Returns the new reputation value after applying the event delta, clamped [0, 1000]. */
export function updateReputation(current: number, reputationEvent: ReputationEvent): number {
  let delta = 0;
  switch (reputationEvent.event) {
    case 'QUEST_SUCCESS': {
      const d = reputationEvent.difficulty;
      delta = d <= 4 ? 5 : d <= 7 ? 10 : 20;
      break;
    }
    case 'QUEST_FAILURE':       delta = -8;  break;
    case 'ADVENTURER_DEATH':    delta = -15; break;
    case 'BOND_FORMED':         delta = 5;   break;
    case 'GOAL_ACHIEVED':       delta = 10;  break;
    case 'SCENARIO_OBJECTIVE':  delta = 50;  break;
  }
  return Math.min(1000, Math.max(0, current + delta));
}

// ---------------------------------------------------------------------------
// Unlock helpers
// ---------------------------------------------------------------------------

function scenariosCompleteCount(ctx: SimulationContext): number {
  return ctx.eventLog.filter(
    e => e.kind === 'WORLD' && (e as any).subtype === 'SCENARIO_COMPLETE',
  ).length;
}

function unlock(ctx: SimulationContext, regionId: RegionId): SimulationContext {
  const region = ctx.activeRegions.get(regionId);
  if (!region || region.unlocked) return ctx;

  const updatedRegions = new Map(ctx.activeRegions);
  updatedRegions.set(regionId, { ...region, unlocked: true });
  let next = { ...ctx, activeRegions: updatedRegions };
  next = emitEvent(next, { kind: 'WORLD', subtype: 'REGION_UNLOCKED', regionId });
  return next;
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// World event seeding subscriber
// ---------------------------------------------------------------------------

// Weighted table for autonomous world event selection.
const WORLD_EVENT_TABLE: { subtype: WorldEventType; weight: number }[] = [
  { subtype: 'RUMOUR',              weight: 35 },
  { subtype: 'TRAVELLING_MERCHANT', weight: 25 },
  { subtype: 'MONSTER_SURGE',       weight: 20 },
  { subtype: 'STORM',               weight: 10 },
  { subtype: 'WINDFALL',            weight: 7  },
  { subtype: 'PLAGUE',              weight: 3  },
];
const WORLD_EVENT_TOTAL_WEIGHT = WORLD_EVENT_TABLE.reduce((s, e) => s + e.weight, 0);
const WORLD_EVENT_TRIGGER_PROB = 1 / 24; // ~1 flavour event per in-game day on average

/**
 * Span duration ranges in ticks (24 ticks = 1 day), inclusive. `null` = instant
 * (single flavour line, no span). Spec: world-expansion.md (Spanning vs instant).
 */
export const SPAN_DURATIONS: Record<WorldEventType, [number, number] | null> = {
  STORM: [6, 18],
  TRAVELLING_MERCHANT: [24, 72],
  MONSTER_SURGE: [48, 120],
  PLAGUE: [72, 192],
  RUMOUR: null,
  WINDFALL: null,
  FESTIVAL: [48, 96], // 2–4 days; town-level span (npc-system.md), seeded separately
};

/** Roll a span duration via ctx.rng over the inclusive range; null for instant types. */
export function rollSpanDuration(type: WorldEventType, ctx: SimulationContext): number | null {
  const range = SPAN_DURATIONS[type];
  if (range === null) return null;
  const [lo, hi] = range;
  return lo + Math.floor(ctx.rng.next() * (hi - lo + 1));
}

/** All live span instances across the unlocked regions. */
export function activeSpans(ctx: SimulationContext): WorldEventInstance[] {
  const spans: WorldEventInstance[] = [];
  for (const region of ctx.activeRegions.values()) {
    if (!region.unlocked) continue;
    spans.push(...region.activeWorldEvents);
  }
  return spans;
}

/** True if any unlocked region currently hosts a live span of `type`. */
export function hasActiveSpan(ctx: SimulationContext, type: WorldEventType): boolean {
  return activeSpans(ctx).some(s => s.type === type);
}

/** Difficulty bonus applied to newly-seeded quests while a MONSTER_SURGE span is live. */
export const MONSTER_SURGE_THREAT_BONUS = 2;

/** Quest-threat modifier (consumer of active spans): live MONSTER_SURGE raises difficulty. */
export function monsterSurgeThreatBonus(ctx: SimulationContext): number {
  return hasActiveSpan(ctx, 'MONSTER_SURGE') ? MONSTER_SURGE_THREAT_BONUS : 0;
}

/** rng-pick a single unlocked region id; null if none are unlocked. */
function pickUnlockedRegion(ctx: SimulationContext): RegionId | null {
  const unlocked = [...ctx.activeRegions.values()].filter(r => r.unlocked);
  if (unlocked.length === 0) return null;
  return unlocked[Math.floor(ctx.rng.next() * unlocked.length)]!.id;
}

/**
 * END-sweep: drop every instance whose span has elapsed (`tick >= expiresAt`) and
 * emit exactly one `phase:'END'` per dropped instance. Runs every tick, BEFORE the
 * seed-roll early-return — otherwise spans would never expire on the ~96% of ticks
 * that don't seed.
 */
function sweepExpiredSpans(ctx: SimulationContext): SimulationContext {
  const tick = ctx.worldTime.tick;
  const ended: { regionId: RegionId; type: WorldEventType }[] = [];
  const regions = new Map(ctx.activeRegions);

  for (const [regionId, region] of ctx.activeRegions) {
    const expired = region.activeWorldEvents.filter(s => tick >= s.expiresAt);
    if (expired.length === 0) continue;
    regions.set(regionId, {
      ...region,
      activeWorldEvents: region.activeWorldEvents.filter(s => tick < s.expiresAt),
    });
    for (const s of expired) ended.push({ regionId, type: s.type });
  }

  if (ended.length === 0) return ctx;

  let next: SimulationContext = { ...ctx, activeRegions: regions };
  for (const { regionId, type } of ended) {
    next = emitEvent(next, { kind: 'WORLD', subtype: type, phase: 'END', regionId });
  }
  return next;
}

/** The town's home region for town-level spans (festivals) — the starting region if unlocked,
 *  else the first unlocked region. */
function townRegionId(ctx: SimulationContext): RegionId | null {
  if (ctx.activeRegions.get('THORNVALE')?.unlocked) return 'THORNVALE';
  const firstUnlocked = [...ctx.activeRegions.values()].find(r => r.unlocked);
  return firstUnlocked?.id ?? null;
}

/**
 * Open a FESTIVAL town span (npc-system.md) via the shared span lifecycle. A festival is a
 * town-level span attached to the town's home region; while live it raises Social-cluster
 * activity weights, social pressure gain, and Tier B flavour frequency (its consumers read
 * `hasActiveSpan(ctx, 'FESTIVAL')`). No-ops if a festival is already live. The END phase is
 * swept by `worldEventSeedingSubscriber` like any other span.
 */
export function openFestivalSpan(ctx: SimulationContext): SimulationContext {
  const regionId = townRegionId(ctx);
  if (regionId === null) return ctx;
  const region = ctx.activeRegions.get(regionId)!;
  if (region.activeWorldEvents.some(s => s.type === 'FESTIVAL')) return ctx; // no stacking
  return openSpan(ctx, 'FESTIVAL', regionId);
}

/** Autonomous festival cadence — a low per-tick roll to open a town festival. */
export const FESTIVAL_SEED_PROB = 1 / 1440; // ≈ once per 60 in-game days on average

/** Per-tick festival seeder. Register in the loop; the END phase is handled by the span sweep. */
export function festivalSeedingSubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.rng.next() >= FESTIVAL_SEED_PROB) return ctx;
  return openFestivalSpan(ctx);
}

/** Open a span: roll duration, push a WorldEventInstance, and emit `phase:'START'`. */
function openSpan(ctx: SimulationContext, type: WorldEventType, regionId: RegionId): SimulationContext {
  const duration = rollSpanDuration(type, ctx)!; // caller guarantees a spanning type
  const startedAt = ctx.worldTime.tick;
  const instance: WorldEventInstance = { type, startedAt, expiresAt: startedAt + duration };

  const regions = new Map(ctx.activeRegions);
  const region = regions.get(regionId)!;
  regions.set(regionId, { ...region, activeWorldEvents: [...region.activeWorldEvents, instance] });

  const next: SimulationContext = { ...ctx, activeRegions: regions };
  return emitEvent(next, { kind: 'WORLD', subtype: type, phase: 'START', regionId });
}

/**
 * Fires autonomous world events spread across the clock and drives the span lifecycle.
 * Register before worldExpansion. Each tick: (1) sweep expired spans, (2) on the ~1/24
 * seed roll, either open a span (spanning type, region with no live instance of that type)
 * or emit a single phase-less flavour line (instant type).
 */
export function worldEventSeedingSubscriber(ctx: SimulationContext): SimulationContext {
  // (1) Span END-sweep runs unconditionally, before the seed-roll early-return.
  let next = sweepExpiredSpans(ctx);

  // (2) Seed roll.
  if (next.rng.next() >= WORLD_EVENT_TRIGGER_PROB) return next;
  const pick = next.rng.next() * WORLD_EVENT_TOTAL_WEIGHT;
  let cum = 0;
  let subtype: WorldEventType | null = null;
  for (const entry of WORLD_EVENT_TABLE) {
    cum += entry.weight;
    if (pick < cum) { subtype = entry.subtype; break; }
  }
  if (subtype === null) return next;

  // Instant types: single phase-less line, no instance.
  if (SPAN_DURATIONS[subtype] === null) {
    return emitEvent(next, { kind: 'WORLD', subtype });
  }

  // Spanning types: attach to one rng-picked unlocked region.
  const regionId = pickUnlockedRegion(next);
  if (regionId === null) return next; // no unlocked region to host the span
  const region = next.activeRegions.get(regionId)!;
  // Same-type suppression: no duplicate stacking of a type already live in that region.
  if (region.activeWorldEvents.some(s => s.type === subtype)) return next;

  return openSpan(next, subtype, regionId);
}

// ---------------------------------------------------------------------------
// Region unlock subscriber
// ---------------------------------------------------------------------------

/** Per-tick world expansion check. Register in SimulationLoop after scenarioEvaluator. */
export function worldExpansionSubscriber(
  ctx: SimulationContext,
  _delta = 1,
): SimulationContext {
  let next = ctx;
  const rep = next.reputation;
  const scenariosComplete = scenariosCompleteCount(next);

  // ASHWOOD: ScenarioComplete OR reputation ≥ 200
  if (!next.activeRegions.get('ASHWOOD')?.unlocked) {
    if (scenariosComplete >= 1 || rep >= 200) {
      next = unlock(next, 'ASHWOOD');
    }
  }

  // STORMPASS: reputation ≥ 500 OR 2 scenarios complete
  if (!next.activeRegions.get('STORMPASS')?.unlocked) {
    if (rep >= 500 || scenariosComplete >= 2) {
      next = unlock(next, 'STORMPASS');
    }
  }

  return next;
}

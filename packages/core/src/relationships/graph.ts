/**
 * Relationship graph operations.
 *
 * Spec: specs/behaviors/relationship-graph.md
 * - Type is derived from strength on read (never stored independently).
 * - All updates maintain symmetry: graph[A][B] === graph[B][A].
 * - Separation decay: -1/day for edges inactive > 14 days; not below STRANGER floor.
 */
import type {
  AdventurerId,
  RelationshipGraph,
  RelationshipEdge,
  RelationshipEvent,
  RelationshipType,
  LastSharedActivity,
  SimulationContext,
} from '../world/types.js';

// ---------------------------------------------------------------------------
// Type derivation
// ---------------------------------------------------------------------------

export function strengthToType(strength: number): RelationshipType {
  if (strength >= 70) return 'TRUSTED_COMPANION';
  if (strength >= 40) return 'FRIEND';
  if (strength >= 11) return 'ACQUAINTANCE';
  if (strength >= -10) return 'STRANGER';
  if (strength >= -50) return 'RIVAL';
  return 'ENEMY';
}

export function createEdge(strength: number): RelationshipEdge {
  return { strength, type: strengthToType(strength), history: [] };
}

// ---------------------------------------------------------------------------
// Strength shifts
// ---------------------------------------------------------------------------

/** Apply a delta to a symmetric edge, clamp to [-100,+100], re-derive type, optionally append history. */
export function applyStrengthShift(
  graph: RelationshipGraph,
  idA: AdventurerId,
  idB: AdventurerId,
  delta: number,
  tick?: number,
  kind?: string,
): RelationshipGraph {
  const edgeAB = graph.get(idA)?.get(idB);
  const edgeBA = graph.get(idB)?.get(idA);
  if (!edgeAB || !edgeBA) return graph;

  const newStrength = Math.max(-100, Math.min(100, edgeAB.strength + delta));
  const newType = strengthToType(newStrength);

  const entry: RelationshipEvent | undefined =
    tick !== undefined && kind !== undefined ? { tick, kind, delta } : undefined;

  const nextAB = { ...edgeAB, strength: newStrength, type: newType,
    history: entry ? [...edgeAB.history, entry] : edgeAB.history };
  const nextBA = { ...edgeBA, strength: newStrength, type: newType,
    history: entry ? [...edgeBA.history, entry] : edgeBA.history };

  const next = new Map(graph);
  next.set(idA, new Map(graph.get(idA)).set(idB, nextAB));
  next.set(idB, new Map(graph.get(idB)).set(idA, nextBA));
  return next;
}

// ---------------------------------------------------------------------------
// Threshold events
// ---------------------------------------------------------------------------

export type ThresholdEventType =
  | 'FRIENDSHIP_FORMED'
  | 'TRUSTED_COMPANION_BOND_FORMED'
  | 'BOND_BROKEN'
  | 'RIVALRY_DEEPENED'
  | 'RECONCILIATION';

export type ThresholdEvent = {
  type: ThresholdEventType;
  adventurerId1: AdventurerId;
  adventurerId2: AdventurerId;
  newType: RelationshipType;
  priorType: RelationshipType;
  strength: number;
};

export function detectThresholdEvents(
  idA: AdventurerId,
  idB: AdventurerId,
  priorStrength: number,
  newStrength: number,
): ThresholdEvent[] {
  const prior = strengthToType(priorStrength);
  const next = strengthToType(newStrength);
  if (prior === next) return [];

  const events: ThresholdEvent[] = [];
  const base = { adventurerId1: idA, adventurerId2: idB, newType: next, priorType: prior, strength: newStrength };

  if (next === 'FRIEND' && (prior === 'STRANGER' || prior === 'ACQUAINTANCE')) {
    events.push({ ...base, type: 'FRIENDSHIP_FORMED' });
  } else if (next === 'TRUSTED_COMPANION') {
    events.push({ ...base, type: 'TRUSTED_COMPANION_BOND_FORMED' });
  } else if ((next === 'RIVAL' || next === 'ENEMY') && (prior === 'FRIEND' || prior === 'TRUSTED_COMPANION')) {
    events.push({ ...base, type: 'BOND_BROKEN' });
  } else if (next === 'ENEMY' && prior === 'RIVAL') {
    events.push({ ...base, type: 'RIVALRY_DEEPENED' });
  } else if ((prior === 'ENEMY' || prior === 'RIVAL')
    && next !== 'RIVAL' && next !== 'ENEMY') {
    events.push({ ...base, type: 'RECONCILIATION' });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Separation decay
// ---------------------------------------------------------------------------

function edgeKey(a: AdventurerId, b: AdventurerId): string {
  return [a, b].sort().join('-');
}

const SEPARATION_DAYS = 14;

/** Apply −1 separation decay this day tick if inactive for > 14 days. No decay in STRANGER range.
 *  Edges involving dead/retired adventurers are frozen (skipped). */
export function applyDayTickDecay(
  graph: RelationshipGraph,
  lastActivity: LastSharedActivity,
  currentTick: number,
  adventurers?: Map<AdventurerId, { state: string }>,
): RelationshipGraph {
  let next = graph;
  const visitedPairs = new Set<string>();

  for (const [idA, edges] of graph) {
    for (const [idB] of edges) {
      const key = edgeKey(idA, idB);
      if (visitedPairs.has(key)) continue;
      visitedPairs.add(key);

      const edge = graph.get(idA)!.get(idB)!;

      if (edge.strength <= 10) continue;

      // Freeze edges involving dead or retired adventurers
      if (adventurers) {
        const aState = adventurers.get(idA)?.state;
        const bState = adventurers.get(idB)?.state;
        if (aState === 'DEAD' || aState === 'RETIRED' || bState === 'DEAD' || bState === 'RETIRED') continue;
      }

      const lastTick = lastActivity[key] ?? 0;
      const daysSinceActivity = Math.floor((currentTick - lastTick) / 24);
      if (daysSinceActivity <= SEPARATION_DAYS) continue;

      next = applyStrengthShift(next, idA, idB, -1, currentTick, 'SEPARATION_DECAY');
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

/** Day-tick subscriber: applies separation decay to all relationship edges. */
export function relationshipDecaySubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.worldTime.hour !== 0) return ctx;
  const next = applyDayTickDecay(
    ctx.relationships,
    ctx.lastSharedActivity,
    ctx.worldTime.tick,
    ctx.adventurers,
  );
  if (next === ctx.relationships) return ctx;
  return { ...ctx, relationships: next };
}

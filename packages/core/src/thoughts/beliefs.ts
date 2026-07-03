/**
 * Beliefs — derived opinions an actor holds about other actors.
 *
 * Spec: specs/behaviors/thought-system.md#beliefs-are-derived-never-stored
 *
 * Pure derivation over relationship edges (strength/type + the tail of
 * edge.history) and the actor's own HistoryEvent[] (≤ 50 entries). Never reads
 * ctx.eventLog, never consumes ctx.rng, never stores anything — "minds are
 * derived, not stored."
 */
import type { ActorId, HistoryEvent, RelationshipEdge, SimulationContext } from '../world/types.js';

export type BeliefKind = 'TRUSTS' | 'DISTRUSTS' | 'ADMIRES' | 'RESENTS' | 'OWES' | 'FEARS';

export type Belief = {
  aboutId: ActorId;
  kind: BeliefKind;
  conviction: number; // 0–1
  sourceTick: number;
};

const RESENT_WINDOW_TICKS = 14 * 24;  // 14 days
const ADMIRE_WINDOW_TICKS = 14 * 24;
const OWE_WINDOW_TICKS = 30 * 24;     // 30 days

const RESENT_KINDS = new Set(['ARGUMENT', 'ESTRANGEMENT']);
const ADMIRE_KINDS = new Set(['BREAKTHROUGH', 'SOLIDARITY']);

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Scan an edge's history backwards for the most recent entry of one of `kinds`
 * within `windowTicks` of `now`. Early-exits at the window cutoff — edge
 * history is append-only and unbounded, so a full-array pass is forbidden.
 */
function latestEdgeEventWithin(
  edge: RelationshipEdge,
  kinds: Set<string>,
  now: number,
  windowTicks: number,
): { tick: number; delta: number } | undefined {
  const cutoff = now - windowTicks;
  for (let i = edge.history.length - 1; i >= 0; i--) {
    const entry = edge.history[i];
    if (!entry) continue;
    if (entry.tick < cutoff) return undefined;
    if (kinds.has(entry.kind)) return { tick: entry.tick, delta: entry.delta };
  }
  return undefined;
}

/** Most recent own-history event of `kind` involving `otherId` within the window. */
function latestHistoryEventWithin(
  history: HistoryEvent[],
  kind: HistoryEvent['kind'],
  otherId: ActorId,
  now: number,
  windowTicks: number,
): HistoryEvent | undefined {
  const cutoff = now - windowTicks;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry && entry.kind === kind && entry.tick >= cutoff && entry.involvedIds.includes(otherId)) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Derive the actor's current beliefs about every actor it shares an edge with.
 *
 * Kind table (thought-system.md):
 *   TRUSTS    — strength ≥ 40
 *   DISTRUSTS — strength ≤ −25, or BETRAYED_BY in own history
 *   RESENTS   — ARGUMENT/ESTRANGEMENT edge-history entry within 14 days
 *   ADMIRES   — BREAKTHROUGH/SOLIDARITY within 14 days at strength ≥ 25
 *   OWES      — SAVED_BY in own history within 30 days
 *   FEARS     — strength ≤ −50
 *
 * Returned sorted by conviction descending (ties: aboutId, then kind — stable
 * across identical inputs).
 */
export function deriveBeliefs(ctx: SimulationContext, actorId: ActorId): Belief[] {
  const edges = ctx.relationships.get(actorId);
  if (!edges) return [];

  const now = ctx.worldTime.tick;
  const ownHistory: HistoryEvent[] =
    ctx.adventurers.get(actorId)?.history ??
    (ctx.notableNpcs.get(actorId) as { history?: HistoryEvent[] } | undefined)?.history ??
    [];

  const beliefs: Belief[] = [];

  for (const [aboutId, edge] of edges) {
    const s = edge.strength;

    if (s >= 40) {
      beliefs.push({ aboutId, kind: 'TRUSTS', conviction: clamp01(s / 100), sourceTick: now });
    }

    if (s <= -50) {
      beliefs.push({ aboutId, kind: 'FEARS', conviction: clamp01(-s / 100), sourceTick: now });
    } else if (s <= -25) {
      beliefs.push({ aboutId, kind: 'DISTRUSTS', conviction: clamp01(-s / 100), sourceTick: now });
    }

    const betrayal = latestHistoryEventWithin(ownHistory, 'BETRAYED_BY', aboutId, now, Number.POSITIVE_INFINITY);
    if (betrayal && !beliefs.some(b => b.aboutId === aboutId && b.kind === 'DISTRUSTS')) {
      beliefs.push({ aboutId, kind: 'DISTRUSTS', conviction: 0.8, sourceTick: betrayal.tick });
    }

    const resent = latestEdgeEventWithin(edge, RESENT_KINDS, now, RESENT_WINDOW_TICKS);
    if (resent) {
      beliefs.push({
        aboutId,
        kind: 'RESENTS',
        conviction: clamp01(Math.abs(resent.delta) / 10),
        sourceTick: resent.tick,
      });
    }

    if (s >= 25) {
      const admire = latestEdgeEventWithin(edge, ADMIRE_KINDS, now, ADMIRE_WINDOW_TICKS);
      if (admire) {
        beliefs.push({
          aboutId,
          kind: 'ADMIRES',
          conviction: clamp01(Math.abs(admire.delta) / 10),
          sourceTick: admire.tick,
        });
      }
    }

    const saved = latestHistoryEventWithin(ownHistory, 'SAVED_BY', aboutId, now, OWE_WINDOW_TICKS);
    if (saved) {
      beliefs.push({ aboutId, kind: 'OWES', conviction: 0.9, sourceTick: saved.tick });
    }
  }

  return beliefs.sort(
    (a, b) =>
      b.conviction - a.conviction ||
      String(a.aboutId).localeCompare(String(b.aboutId)) ||
      a.kind.localeCompare(b.kind),
  );
}

/**
 * Drift indicator — a pure, derived-on-read summary of an edge's recent movement, used by the
 * character-detail relationship row (`specs/screens/character-detail.md`). It is the *quiet*
 * surface for ambient sub-threshold drift that is deliberately kept out of the event feed
 * (`relationship-events.md#surfacing`): a warming/cooling glyph plus a short most-recent-cause
 * label, shown only when the bond is actually moving.
 *
 * No engine state is stored — everything is derived from the edge's own `history`
 * (`relationship-graph.md#edge-history-and-drift-indicator`).
 */
import type { RelationshipEdge } from '../world/types.js';

/** Recent window for the trend: last 7 in-game days = 168 ticks. Tunable. */
export const DRIFT_WINDOW_TICKS = 168;
/** Dead-band that keeps a single stray ±1 from reading as a trend. Tunable. */
export const TREND_EPS = 2;

export type DriftDirection = 'warming' | 'cooling' | 'steady';

export type EdgeDrift = {
  direction: DriftDirection;
  /** Short human label for the most-recent cause, or null when there is no recent movement. */
  cause: string | null;
};

/** Map a history-entry `kind` to a short human phrase. Never surfaces a raw token. */
const DRIFT_CAUSE_LABELS: Record<string, string> = {
  // Drivers (relationship-events.md)
  KINDNESS: 'an act of kindness',
  BETRAYAL: 'a betrayal',
  SHARED_DANGER: 'a danger faced together',
  RIVALRY_SPARK: 'a rivalry',
  // Ambient shifts (relationship-graph.md)
  CO_QUEST_SUCCESS: 'shared a quest',
  SEPARATION_DECAY: 'drifted apart',
  // Social outcomes (social-system.md)
  BANTER: 'easy company',
  SOLIDARITY: 'standing together',
  BREAKTHROUGH: 'a moment of understanding',
  SILENT_DISTANCE: 'a cooling silence',
  ARGUMENT: 'a quarrel',
  ESTRANGEMENT: 'a falling out',
};

function causeLabel(kind: string): string {
  return DRIFT_CAUSE_LABELS[kind] ?? 'a recent change';
}

/**
 * Derive the drift indicator for an edge as of `now`. Trend is the net sum of history deltas in
 * the last `DRIFT_WINDOW_TICKS`: above `+TREND_EPS` is warming, below `−TREND_EPS` is cooling,
 * otherwise steady (the caller shows no glyph). `cause` is the label of the latest windowed entry,
 * or null when there is no movement in the window.
 */
export function computeEdgeDrift(edge: RelationshipEdge, now: number): EdgeDrift {
  const windowed = edge.history.filter(h => h.tick > now - DRIFT_WINDOW_TICKS);
  if (windowed.length === 0) return { direction: 'steady', cause: null };

  const net = windowed.reduce((sum, h) => sum + h.delta, 0);
  const direction: DriftDirection = net > TREND_EPS ? 'warming' : net < -TREND_EPS ? 'cooling' : 'steady';
  const latest = windowed[windowed.length - 1]!;
  return { direction, cause: causeLabel(latest.kind) };
}

/**
 * Townsfolk familiarity.
 *
 * Spec: specs/behaviors/npc-system.md#townsfolk-familiarity
 *
 * Notable NPCs are townsfolk who have lived alongside each other for years; adventurers are
 * newcomers who just arrived. A single static per-NPC `familiarity` scalar (0–100, seeded at
 * world generation, never churned per tick) captures how embedded in town life an NPC is, and
 * does two things — both static, neither evolving the way an edge does:
 *
 *   1. Seeds a warmer *starting* edge toward newcomer adventurers (`openingStrengthForFamiliarity`
 *      + `seedFamiliarityEdges`). Once seeded, the edge is an ordinary `RelationshipEdge` and
 *      evolves through the normal driver/encounter/decay machinery.
 *   2. Adds a small static approach bias to the social-pressure gain (`familiarityApproachBias`,
 *      consumed by `computePressureGain`) so an embedded, sociable NPC more readily strikes up
 *      encounters with newcomers.
 *
 * Familiarity is a scalar *on the NPC*, not a graph — there is no townsfolk↔townsfolk edge state.
 * A rival NPC is simply one seeded with low familiarity (and, if a scenario wants an active feud,
 * a seeded negative starting edge to a specific adventurer).
 */
import type {
  ActorId,
  NotableNpc,
  NpcId,
  RelationshipGraph,
  TownRole,
} from '../world/types.js';
import { createEdge } from './graph.js';

// ---------------------------------------------------------------------------
// Role → familiarity (service-role warmth)
// ---------------------------------------------------------------------------

/** Tier defaults. Service/craft townsfolk are deeply embedded (high); guarded/martial roles keep
 *  the town at arm's length (moderate); marginal/transient roles are barely known (low). A scenario
 *  may override any single NPC's seeded familiarity — e.g. a rival exception seeded low/negative. */
const FAMILIARITY_HIGH = 80;     // service/craft: known to everyone, part of daily life
const FAMILIARITY_MODERATE = 55; // guarded/martial: present but not sociable
const FAMILIARITY_LOW = 25;      // marginal/transient: barely embedded

const HIGH_ROLES: ReadonlySet<TownRole> = new Set([
  'INNKEEPER', 'PRIEST', 'SHOPKEEPER', 'MERCHANT', 'BARD', 'STABLEHAND', 'BLACKSMITH',
]);
const MODERATE_ROLES: ReadonlySet<TownRole> = new Set(['GUARD_CAPTAIN', 'GATE_GUARD']);

/** The default familiarity a role seeds at world generation (before any scenario override). */
export function familiarityForRole(role: TownRole): number {
  if (HIGH_ROLES.has(role)) return FAMILIARITY_HIGH;
  if (MODERATE_ROLES.has(role)) return FAMILIARITY_MODERATE;
  return FAMILIARITY_LOW;
}

// ---------------------------------------------------------------------------
// Familiarity → opening edge strength
// ---------------------------------------------------------------------------

// Linear map anchored so a high-familiarity service NPC opens in the low-ACQUAINTANCE band
// (room left for drivers to build toward FRIEND) and a low/rival one opens STRANGER-or-mild-negative.
// Clamped so seeding never lands a FRIEND-or-warmer or ENEMY opening at world gen.
//   f=100 → 26 (ACQUAINTANCE)   f=80 → 18 (ACQUAINTANCE)   f=55 → 8 (warm STRANGER)
//   f=25  → −4 (cool STRANGER)  f=0  → −14 (mild RIVAL)
const OPENING_SLOPE = 0.4;
const OPENING_OFFSET = -14;
const OPENING_MIN = -30; // never below a mild RIVAL
const OPENING_MAX = 39;  // never a FRIEND (≥40) at seed time

export function openingStrengthForFamiliarity(familiarity: number): number {
  const raw = Math.round(OPENING_SLOPE * familiarity + OPENING_OFFSET);
  return Math.max(OPENING_MIN, Math.min(OPENING_MAX, raw));
}

// ---------------------------------------------------------------------------
// Edge seeding (world generation)
// ---------------------------------------------------------------------------

/**
 * Seed one symmetric adventurer↔notable-NPC edge per pair, opened at the NPC's familiarity-derived
 * strength. Runs once at world generation. No adventurer↔adventurer or NPC↔NPC edges are created —
 * familiarity is strictly a townsfolk→newcomer starting bias. The returned graph is fresh; callers
 * with a pre-existing graph should seed before adding other edges (scenario1 starts empty).
 */
export function seedFamiliarityEdges(
  adventurers: Map<ActorId, unknown>,
  npcs: Map<NpcId, NotableNpc>,
): RelationshipGraph {
  const graph: RelationshipGraph = new Map();
  for (const npc of npcs.values()) {
    const strength = openingStrengthForFamiliarity(npc.familiarity);
    for (const advId of adventurers.keys()) {
      const forAdv = graph.get(advId) ?? new Map();
      const forNpc = graph.get(npc.id) ?? new Map();
      forAdv.set(npc.id, createEdge(strength));
      forNpc.set(advId, createEdge(strength));
      graph.set(advId, forAdv);
      graph.set(npc.id, forNpc);
    }
  }
  return graph;
}

// ---------------------------------------------------------------------------
// Approach bias (social-pressure gain)
// ---------------------------------------------------------------------------

/** Max per-tick approach-bias contribution (at familiarity 100), parallel to the PROXIMITY floor.
 *  Small by design so it never swamps the mood/relationship terms (npc-system.md). */
export const FAMILIARITY_APPROACH_BIAS = 0.03;

/** The static approach bias an NPC of the given familiarity adds to a pair's pressure gain.
 *  A fixed function of familiarity, applied every tick, never itself changing. Zero for a
 *  familiarity of 0 (and for adventurer↔adventurer pairs, which carry no familiarity). */
export function familiarityApproachBias(familiarity: number): number {
  return FAMILIARITY_APPROACH_BIAS * (familiarity / 100);
}

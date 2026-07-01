/**
 * Actor id space — adventurers and Tier A notable NPCs share one node space so they
 * can occupy the same relationship graph and the same encounter participant lists.
 *
 * Spec: specs/behaviors/npc-system.md#actor-id-space
 * NPC ids carry a distinct namespace prefix ("npc:"); `isNpc` is the cheap membership test.
 */
import type { ActorId, NpcId } from './types.js';

/** Namespace prefix distinguishing notable-NPC ids from adventurer ids. */
export const NPC_ID_PREFIX = 'npc:';

/** True if the actor id belongs to a notable NPC (Tier A), not an adventurer. */
export function isNpc(id: ActorId): boolean {
  return id.startsWith(NPC_ID_PREFIX);
}

/** Build a canonical NPC id from a bare role/name slug (e.g. "blacksmith" → "npc:blacksmith"). */
export function makeNpcId(slug: string): NpcId {
  return `${NPC_ID_PREFIX}${slug}`;
}

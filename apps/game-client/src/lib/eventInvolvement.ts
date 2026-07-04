/**
 * Single source for "which actors does this event involve" — shared by the event
 * feed (row portraits + character filter) and the cycle-narrative composer (whose
 * chapter an event belongs to). Keeping one resolver means the feed and the reads
 * can never disagree about involvement (cycle-narrative.md §"What belongs in a
 * character's chapter").
 *
 * Mirrors the participant fields across the SimulationEvent union: THOUGHT's
 * `actorId` (the thinker), and `involvedIds` / `participantIds` / `partyIds` /
 * `adventurerId` on the rest. Events with none (WORLD, DECISION_MOMENT, DIVINE)
 * resolve to no actors.
 */
import type { SimulationEvent } from '@ugs/core';

export function getInvolvedIds(event: SimulationEvent): string[] {
  if ('actorId' in event) return [event.actorId]; // THOUGHT — the thinker
  if ('involvedIds' in event) return event.involvedIds ?? [];
  if ('participantIds' in event) return event.participantIds ?? [];
  if ('partyIds' in event) return event.partyIds ?? [];
  if ('adventurerId' in event) return [event.adventurerId];
  return [];
}

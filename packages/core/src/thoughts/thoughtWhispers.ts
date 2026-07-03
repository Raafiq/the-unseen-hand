/**
 * THOUGHT whispers — inner monologue surfacing into the event feed.
 *
 * Spec: specs/behaviors/thought-system.md#thought-whispers
 *
 * The subscriber rolls *whether* an actor whispers on ctx.rng (like every other
 * event system); the text itself is rendered through the derived
 * (worldSeed, actorId, tick) stream by renderThought, so a whisper byte-matches
 * the on-demand render for the same actor, tick, and suppression set.
 * Anti-repetition scans the eventLog tail for the actor's recent subjectKeys —
 * no new cooldown state on SimulationContext.
 */
import type { ActorId, SimulationContext } from '../world/types.js';
import { emitEvent } from '../events/eventBus.js';
import { isTownEligible } from '../events/activitySystem.js';
import { renderThought } from './thoughtGrammar.js';

/** Per-actor, per-tick whisper chance (~one whisper per actor every ~4 in-game days). */
export const THOUGHT_WHISPER_CHANCE = 0.01;

/** A subject whispered within this window is suppressed when alternatives exist. */
const SUPPRESS_WINDOW_TICKS = 96;

/** Anti-repetition scans at most this many eventLog-tail entries (O(50), bounded). */
const TAIL_SCAN = 50;

/** The actor's subjectKeys whispered within the suppression window (eventLog tail scan). */
function recentSubjects(ctx: SimulationContext, actorId: ActorId): string[] {
  const cutoff = ctx.worldTime.tick - SUPPRESS_WINDOW_TICKS;
  const out: string[] = [];
  const log = ctx.eventLog;
  for (let i = log.length - 1, scanned = 0; i >= 0 && scanned < TAIL_SCAN; i--, scanned++) {
    const event = log[i];
    if (!event) continue;
    if (event.tick < cutoff) break;
    if (event.kind === 'THOUGHT' && event.actorId === actorId) out.push(event.subjectKey);
  }
  return out;
}

/** Adventurers whisper during town-eligible activities; notable NPCs are always
 *  whisper-eligible (no activity pool). DEAD/RETIRED/questing actors never whisper. */
function adventurerEligible(ctx: SimulationContext, actorId: ActorId): boolean {
  const adv = ctx.adventurers.get(actorId);
  if (!adv) return false;
  if (adv.state === 'DEAD' || adv.state === 'RETIRED' || adv.state === 'ON_QUEST' || adv.state === 'IN_DUNGEON') {
    return false;
  }
  const activity = adv.activityState?.current;
  return activity !== undefined && isTownEligible(activity);
}

function whisper(ctx: SimulationContext, actorId: ActorId): SimulationContext {
  const thought = renderThought(ctx, actorId, { suppressSubjects: recentSubjects(ctx, actorId) });
  if (!thought) return ctx;
  return emitEvent(ctx, {
    kind: 'THOUGHT',
    actorId,
    subjectKey: thought.subjectKey,
    renderedText: thought.text,
  });
}

/**
 * Roll whispers for every eligible actor at the given per-tick chance. Exposed
 * (with an explicit chance) so tests can drive it deterministically; the
 * subscriber calls it with THOUGHT_WHISPER_CHANCE.
 */
export function rollThoughtWhispers(ctx: SimulationContext, chance: number): SimulationContext {
  if (chance <= 0) return ctx;
  let next = ctx;
  for (const adv of ctx.adventurers.values()) {
    if (!adventurerEligible(next, adv.id)) continue;
    if (next.rng.next() >= chance) continue;
    next = whisper(next, adv.id);
  }
  for (const npc of ctx.notableNpcs.values()) {
    if (next.rng.next() >= chance) continue;
    next = whisper(next, npc.id);
  }
  return next;
}

/** Per-tick whisper subscriber. Registered dead-last in SimulationLoop — it draws
 *  ctx.rng every tick, so it must never shift the intra-tick stream seen by the
 *  decision/quest/social systems (same rationale as npcFlavourSubscriber). */
export function thoughtWhisperSubscriber(ctx: SimulationContext): SimulationContext {
  return rollThoughtWhispers(ctx, THOUGHT_WHISPER_CHANCE);
}

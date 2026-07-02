/**
 * Mood system — factor decay and day-tick recalculation.
 *
 * Spec: specs/behaviors/mood-system.md
 * Mood is recalculated only on day ticks (hour === 0).
 * Factors decay by (value * decayRate) each day; removed when |value| < 1.
 * Same id always overwrites — no stacking.
 */
import type { Adventurer, MoodFactor, WorldTime, SimulationContext } from '../world/types.js';

export type MoodLabel = 'CONTENT' | 'NEUTRAL' | 'UNSATISFIED' | 'DESPAIRING';

export function upsertMoodFactor(factors: MoodFactor[], next: MoodFactor): MoodFactor[] {
  const existing = factors.findIndex(f => f.id === next.id);
  if (existing === -1) return [...factors, next];
  return factors.map((f, i) => (i === existing ? next : f));
}

export function decayMoodFactors(factors: MoodFactor[], currentTick?: number): MoodFactor[] {
  return factors
    .filter(f => currentTick === undefined || f.expiresAt === undefined || f.expiresAt > currentTick)
    .map(f => ({ ...f, value: f.value * (1 - f.decayRate) }))
    .filter(f => Math.abs(f.value) >= 1);
}

export function recalculateMood(factors: MoodFactor[]): number {
  const sum = factors.reduce((acc, f) => acc + f.value, 0);
  return Math.max(0, Math.min(100, sum));
}

export function moodThresholdLabel(mood: number): MoodLabel {
  if (mood >= 50) return 'CONTENT';
  if (mood >= 25) return 'NEUTRAL';
  if (mood >= 10) return 'UNSATISFIED';
  return 'DESPAIRING';
}

export function topMoodFactors(factors: MoodFactor[], n: number): MoodFactor[] {
  return [...factors]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

/** Day-tick subscriber: applies mood decay and recalculation to all adventurers
 *  and notable NPCs (npc-system.md — NPCs are mood-system citizens with no
 *  despairStreak and no departure consequence). */
export function moodSubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.worldTime.hour !== 0) return ctx;
  let next = ctx;

  if (ctx.adventurers.size > 0) {
    let changed = false;
    const updated = new Map(ctx.adventurers);
    for (const [id, adv] of ctx.adventurers) {
      const nextAdv = applyDayTickMood(adv, ctx.worldTime);
      if (nextAdv !== adv) { updated.set(id, nextAdv); changed = true; }
    }
    if (changed) next = { ...next, adventurers: updated };
  }

  if (ctx.notableNpcs.size > 0) {
    let changed = false;
    const updated = new Map(ctx.notableNpcs);
    for (const [id, npc] of ctx.notableNpcs) {
      const decayed = decayMoodFactors(npc.moodFactors, ctx.worldTime.tick);
      const mood = recalculateMood(decayed);
      if (mood !== npc.mood || decayed.length !== npc.moodFactors.length) {
        updated.set(id, { ...npc, moodFactors: decayed, mood });
        changed = true;
      }
    }
    if (changed) next = { ...next, notableNpcs: updated };
  }

  return next;
}

/** Apply mood decay + recalculation on day ticks only. Updates despairStreak. */
export function applyDayTickMood(adventurer: Adventurer, worldTime: WorldTime): Adventurer {
  if (worldTime.hour !== 0) return adventurer;

  const decayed = decayMoodFactors(adventurer.moodFactors, worldTime.tick);
  const mood = recalculateMood(decayed);
  const despairStreak = mood < 10 ? adventurer.despairStreak + 1 : 0;

  return { ...adventurer, moodFactors: decayed, mood, despairStreak };
}

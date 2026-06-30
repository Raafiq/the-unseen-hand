/**
 * Activity system — per-adventurer activity pool, duration, micro-events.
 *
 * Spec: specs/behaviors/social-system.md §1–3
 * All randomness via ctx.rng. No Math.random().
 */
import type {
  SimulationContext,
  Adventurer,
  ActivityId,
  ActivityCluster,
  ActivityState,
  MoodFactor,
} from '../world/types.js';
import { upsertMoodFactor } from '../adventurers/mood.js';
import { emitEvent } from './eventBus.js';

// ---------------------------------------------------------------------------
// Activity catalogue
// ---------------------------------------------------------------------------

export const ALL_ACTIVITY_IDS: ActivityId[] = [
  'TRAINING', 'SPARRING', 'PATROL', 'HUNTING',
  'DRINKING', 'GAMBLING', 'COOKING', 'EATING', 'GOSSIPING',
  'READING', 'BROODING', 'RESTING', 'PRAYING', 'CRAFTING',
  'SLEEPING',
];

const CLUSTER: Record<ActivityId, ActivityCluster> = {
  TRAINING: 'PHYSICAL', SPARRING: 'PHYSICAL', PATROL: 'PHYSICAL', HUNTING: 'PHYSICAL',
  DRINKING: 'SOCIAL',   GAMBLING: 'SOCIAL',   COOKING: 'SOCIAL',  EATING: 'SOCIAL',  GOSSIPING: 'SOCIAL',
  READING: 'PRIVATE',   BROODING: 'PRIVATE',  RESTING: 'PRIVATE', PRAYING: 'PRIVATE', CRAFTING: 'PRIVATE',
  SLEEPING: 'PRIVATE',
};

// Base duration ranges in ticks (1 tick = 1 simulated hour)
const DURATION_RANGE: Record<ActivityCluster, [number, number]> = {
  PHYSICAL: [1, 3],
  SOCIAL:   [1, 4],
  PRIVATE:  [2, 6],
};

// Sleep type drives duration: SHORT sleepers 4–6 hrs, NORMAL 6–9 hrs, HEAVY 8–11 hrs
export type SleepType = 'SHORT' | 'NORMAL' | 'HEAVY';

export function sleepTypeFor(adv: Adventurer): SleepType {
  const { ambition, empathy, courage } = adv.personality;
  if (ambition >= 65) return 'SHORT';
  if (empathy >= 65 && courage <= 40) return 'HEAVY';
  return 'NORMAL';
}

const SLEEP_DURATION: Record<SleepType, [number, number]> = {
  SHORT:  [4, 6],
  NORMAL: [6, 9],
  HEAVY:  [8, 11],
};

// ---------------------------------------------------------------------------
// Base affinity table
// ---------------------------------------------------------------------------

function baseAffinity(id: ActivityId, adv: Adventurer): number {
  const { courage, empathy, ambition, loyalty } = adv.personality;
  const cluster = CLUSTER[id];

  let weight = 1.0;

  // Cluster boosts from personality
  if (cluster === 'PHYSICAL' && courage >= 60) weight *= 1.5;
  if (cluster === 'SOCIAL'   && empathy >= 60) weight *= 1.5;
  if (cluster === 'PRIVATE'  && ambition >= 60 &&
      (id === 'READING' || id === 'CRAFTING' || id === 'PRAYING')) weight *= 1.4;
  if (id === 'PATROL'    && loyalty >= 70) weight *= 1.3;
  if (id === 'GOSSIPING' && loyalty >= 70) weight *= 1.2;

  // SHORT sleepers resist sleep (high ambition drives them past tiredness)
  if (id === 'SLEEPING' && sleepTypeFor(adv) === 'SHORT') weight *= 0.7;
  // HEAVY sleepers are drawn to sleep
  if (id === 'SLEEPING' && sleepTypeFor(adv) === 'HEAVY') weight *= 1.4;

  return weight;
}

// ---------------------------------------------------------------------------
// Mood multipliers
// ---------------------------------------------------------------------------

function moodMultiplier(id: ActivityId, mood: number): number {
  const cluster = CLUSTER[id];
  if (mood >= 50) {
    // CONTENT
    if (id === 'SLEEPING') return 0.6;   // less tired when content
    if (cluster === 'PHYSICAL') return 1.2;
    if (cluster === 'SOCIAL')   return 1.2;
    if (cluster === 'PRIVATE')  return 0.9;
  } else if (mood >= 10) {
    // NEUTRAL (25–49) or UNSATISFIED (10–24)
    if (id === 'SLEEPING') return mood < 25 ? 1.5 : 1.0; // more tired when unsatisfied
    if (mood < 25) {
      if (cluster === 'PRIVATE')  return 1.4;
      if (id === 'BROODING')      return 2.0;
      if (cluster === 'SOCIAL')   return 0.8;
    }
  } else {
    // DESPAIRING (< 10)
    if (id === 'SLEEPING') return 2.5;  // exhaustion pulls toward sleep
    if (id === 'BROODING') return 3.0;
    if (id === 'RESTING')  return 2.0;
    return 0.4;
  }
  return 1.0;
}

// ---------------------------------------------------------------------------
// Activity weight calculation (exported for testing)
// ---------------------------------------------------------------------------

export function computeActivityWeights(
  adv: Adventurer,
  ctx: SimulationContext,
): Record<ActivityId, number> {
  const stubborn = adv.personality.stubborn ?? 0;
  const hour = ctx.worldTime.hour;
  const isNight = hour >= 22 || hour <= 5;

  const result: Partial<Record<ActivityId, number>> = {};
  for (const id of ALL_ACTIVITY_IDS) {
    let w = baseAffinity(id, adv) * moodMultiplier(id, adv.mood);

    // Night-time pressure: strongly pull towards sleep in night hours
    if (isNight) {
      if (id === 'SLEEPING') w *= 12;
      else if (CLUSTER[id] === 'PHYSICAL') w *= 0.25;
    }

    // Apply MoodFactor activityWeights multipliers
    for (const factor of adv.moodFactors) {
      if (!factor.activityWeights) continue;
      // stubbornOverride: if factor has override AND adventurer is stubborn, skip the weight suppression
      if (factor.stubbornOverride && stubborn >= 70) continue;
      const mult = factor.activityWeights[id];
      if (mult !== undefined) w *= mult;
    }

    result[id] = Math.max(0, w);
  }
  return result as Record<ActivityId, number>;
}

// ---------------------------------------------------------------------------
// Weighted draw via ctx.rng
// ---------------------------------------------------------------------------

function drawActivity(adv: Adventurer, ctx: SimulationContext): ActivityId {
  const weights = computeActivityWeights(adv, ctx);
  const total = ALL_ACTIVITY_IDS.reduce((s, id) => s + weights[id], 0);
  let roll = ctx.rng.next() * total;
  for (const id of ALL_ACTIVITY_IDS) {
    roll -= weights[id];
    if (roll <= 0) return id;
  }
  return ALL_ACTIVITY_IDS[ALL_ACTIVITY_IDS.length - 1]!;
}

// ---------------------------------------------------------------------------
// Duration scheduler
// ---------------------------------------------------------------------------

function scheduleDuration(activity: ActivityId, adv: Adventurer, now: number, ctx: SimulationContext): number {
  let lo: number;
  let hi: number;

  if (activity === 'SLEEPING') {
    [lo, hi] = SLEEP_DURATION[sleepTypeFor(adv)];
  } else {
    const cluster = CLUSTER[activity];
    [lo, hi] = DURATION_RANGE[cluster];
    const stubborn = adv.personality.stubborn ?? 0;
    if (stubborn >= 70) hi = Math.ceil(hi * 1.5);
    if (adv.mood >= 50 && cluster === 'PHYSICAL') hi += 1;
  }

  const duration = Math.max(1, Math.round(ctx.rng.next() * (hi - lo) + lo));
  return now + duration;
}

function scheduleNextMicroEvent(now: number, ctx: SimulationContext): number {
  return now + Math.floor(ctx.rng.next() * 2) + 3; // 3–4 ticks
}

// ---------------------------------------------------------------------------
// Transient MoodFactor helpers
// ---------------------------------------------------------------------------

function applyHangover(adv: Adventurer, ctx: SimulationContext): Adventurer {
  const expiresAt = (ctx.worldTime.day + 2) * 24;
  const factor: MoodFactor = {
    id: 'HANGOVER',
    label: 'Hangover',
    value: -8,
    decayRate: 0.0,
    expiresAt,
    activityWeights: { DRINKING: 0.15, TRAINING: 0.5 },
  };
  return { ...adv, moodFactors: upsertMoodFactor(adv.moodFactors, factor) };
}

function applyWellRested(adv: Adventurer, ctx: SimulationContext): Adventurer {
  const expiresAt = (ctx.worldTime.day + 2) * 24;
  const factor: MoodFactor = {
    id: 'WELL_RESTED',
    label: 'Well Rested',
    value: 10,
    decayRate: 0.0,
    expiresAt,
    activityWeights: { TRAINING: 1.4, SPARRING: 1.4 },
  };
  return { ...adv, moodFactors: upsertMoodFactor(adv.moodFactors, factor) };
}

// ---------------------------------------------------------------------------
// Sleep: no early exit, no micro-events
// ---------------------------------------------------------------------------

function isSleeping(activity: ActivityId): boolean {
  return activity === 'SLEEPING';
}

// ---------------------------------------------------------------------------
// Mood-threshold exit check (not applied during SLEEPING)
// ---------------------------------------------------------------------------

function shouldExitEarly(activity: ActivityId, mood: number): boolean {
  if (isSleeping(activity)) return false; // sleep through mood changes
  const cluster = CLUSTER[activity];
  if (cluster === 'PHYSICAL' && mood < 25) return true;
  if (activity === 'BROODING' && mood > 60) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Micro-event templates (SLEEPING has no micro-events; entry kept for type safety)
// ---------------------------------------------------------------------------

const MICRO_TEMPLATES: Record<ActivityId, string[]> = {
  TRAINING:  [
    '{name} drills the same sword form until their arm shakes.',
    '{name} practices footwork with grim determination.',
    '{name} pushes through exhaustion for one more round.',
  ],
  SPARRING:  [
    '{name} exchanges blows in a flurry of controlled strikes.',
    '{name} calls a pause to catch their breath before resuming.',
    '{name} switches grips and tries a new angle of attack.',
  ],
  PATROL:    [
    '{name} makes a slow circuit of the guild perimeter.',
    '{name} checks the eastern gate and finds nothing unusual.',
    '{name} pauses at the watch-post, scanning the treeline.',
  ],
  HUNTING:   [
    '{name} moves quietly through the undergrowth, tracking fresh prints.',
    '{name} settles into a blind and waits with practised patience.',
    '{name} spots movement and holds still, barely breathing.',
  ],
  DRINKING:  [
    '{name} refills their cup without looking up from the table.',
    '{name} laughs at something nobody else can quite make out.',
    '{name} nurses the same drink, staring at the middle distance.',
  ],
  GAMBLING:  [
    '{name} rolls the dice with practised ease and watches them land.',
    '{name} pushes their remaining coins to the centre of the table.',
    '{name} folds without a word and leans back to watch the next hand.',
  ],
  COOKING:   [
    '{name} adjusts the fire and stirs something that smells of onions.',
    '{name} tastes the broth and decides it needs more salt.',
    '{name} chops herbs with the rhythmic calm of long practice.',
  ],
  EATING:    [
    '{name} tears off a hunk of bread and chews in comfortable silence.',
    '{name} scrapes the bowl clean and considers going back for more.',
    '{name} eats quickly, eyes on the door.',
  ],
  GOSSIPING: [
    '{name} leans in and lowers their voice conspiratorially.',
    '{name} raises an eyebrow at what they\'ve just heard.',
    '{name} laughs and adds a detail of their own to the story.',
  ],
  READING:   [
    '{name} turns a page and marks a passage with a thumbnail.',
    '{name} reads the same line twice and still isn\'t sure what it means.',
    '{name} closes the book for a moment, thinking.',
  ],
  BROODING:  [
    '{name} stares into the fire without blinking.',
    '{name} turns something over in their mind and finds no answer.',
    '{name} sits apart from the others, arms folded, saying nothing.',
  ],
  RESTING:   [
    '{name} lies on their bunk staring at the ceiling.',
    '{name} drifts in and out of a shallow sleep.',
    '{name} turns onto their side and pulls the blanket up.',
  ],
  PRAYING:   [
    '{name} kneels with hands clasped and lips barely moving.',
    '{name} lights a small candle and watches the flame settle.',
    '{name} remains still for a long moment after finishing.',
  ],
  CRAFTING:  [
    '{name} works with careful strokes, checking the grain of the wood.',
    '{name} holds the piece up to the light and squints at a seam.',
    '{name} sets the tools aside and stretches their fingers before continuing.',
  ],
  // SLEEPING has no micro-events; this entry satisfies the exhaustive Record type
  SLEEPING:  [],
};

function renderMicroTemplate(activity: ActivityId, name: string, ctx: SimulationContext): string {
  const templates = MICRO_TEMPLATES[activity];
  const idx = Math.floor(ctx.rng.next() * templates.length);
  return templates[idx]!.replace('{name}', name);
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

export function activitySubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.adventurers.size === 0) return ctx;

  let updatedCtx = ctx;
  const updatedAdventurers = new Map(ctx.adventurers);

  for (const [id, adv] of ctx.adventurers) {
    // Only process living, non-questing adventurers
    if (adv.state === 'DEAD' || adv.state === 'RETIRED' || adv.state === 'ON_QUEST' || adv.state === 'IN_DUNGEON') {
      continue;
    }

    const now = ctx.worldTime.tick;
    let current = adv;

    // --- Initial draw ---
    if (!current.activityState) {
      const activity = drawActivity(current, updatedCtx);
      current = {
        ...current,
        activityState: {
          current: activity,
          enteredAt: now,
          scheduledExitAt: scheduleDuration(activity, current, now, updatedCtx),
          nextMicroEventAt: scheduleNextMicroEvent(now, updatedCtx),
        },
      };
      updatedCtx = emitEvent(updatedCtx, {
        kind: 'ACTIVITY',
        subtype: 'ACTIVITY_CHANGED',
        adventurerId: id,
        activity,
      });
      updatedAdventurers.set(id, current);
      continue;
    }

    const { current: currActivity, scheduledExitAt, nextMicroEventAt } = current.activityState;
    const sleeping = isSleeping(currActivity);

    // --- Mood-threshold exit check (skipped during SLEEPING) ---
    const exitEarly = shouldExitEarly(currActivity, current.mood);

    // --- Duration exit ---
    const exitOnDuration = now >= scheduledExitAt;

    if (exitEarly || exitOnDuration) {
      // Apply transient factors on exit
      if (currActivity === 'DRINKING') {
        current = applyHangover(current, updatedCtx);
      } else if (currActivity === 'RESTING' && current.mood >= 50) {
        current = applyWellRested(current, updatedCtx);
      }

      const prevActivity = currActivity;
      const nextActivity = drawActivity(current, updatedCtx);

      // Sleep deprivation: staying up during the deep-night hours (00:00–04:00) incurs a penalty
      const hour = ctx.worldTime.hour;
      if (nextActivity !== 'SLEEPING' && hour <= 4) {
        const factor: MoodFactor = {
          id: 'SLEEP_DEPRIVED',
          label: 'Sleep Deprived',
          value: -12,
          decayRate: 0.0,
          expiresAt: (ctx.worldTime.day + 1) * 24 + 18,
          activityWeights: { TRAINING: 0.5, SPARRING: 0.4, PATROL: 0.6 },
        };
        current = { ...current, moodFactors: upsertMoodFactor(current.moodFactors, factor) };
      }

      current = {
        ...current,
        activityState: {
          current: nextActivity,
          enteredAt: now,
          scheduledExitAt: scheduleDuration(nextActivity, current, now, updatedCtx),
          nextMicroEventAt: scheduleNextMicroEvent(now, updatedCtx),
        },
      };

      updatedAdventurers.set(id, current);
      updatedCtx = { ...updatedCtx, adventurers: updatedAdventurers };
      updatedCtx = emitEvent(updatedCtx, {
        kind: 'ACTIVITY',
        subtype: 'ACTIVITY_CHANGED',
        adventurerId: id,
        activity: nextActivity,
        prevActivity,
      });
      continue;
    }

    // --- Advance micro-event timer (no event emitted — transitions tell the story) ---
    if (!sleeping && now >= nextMicroEventAt) {
      current = {
        ...current,
        activityState: {
          ...current.activityState!,
          nextMicroEventAt: scheduleNextMicroEvent(now, updatedCtx),
        },
      };
      updatedAdventurers.set(id, current);
      updatedCtx = { ...updatedCtx, adventurers: updatedAdventurers };
    }
  }

  return { ...updatedCtx, adventurers: updatedAdventurers };
}

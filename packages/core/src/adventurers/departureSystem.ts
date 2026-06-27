/**
 * Departure system — adventurers who sustain despair depart the guild.
 *
 * Spec: specs/behaviors/departure-system.md
 * Departure check runs on day ticks for IDLE, RESTING, SOCIALIZING adventurers.
 * despairStreak (stored on Adventurer) tracks consecutive despairing days.
 */
import type { SimulationContext, Adventurer } from '../world/types.js';
import { transitionState } from './stateMachine.js';
import { topMoodFactors } from './mood.js';
import { emitEvent } from '../events/eventBus.js';

// ---------------------------------------------------------------------------
// Departure probability
// ---------------------------------------------------------------------------

/**
 * Probability of departure at the current despairStreak.
 * Only meaningful when despairStreak >= 3.
 */
export function computeDepartureProbability(adventurer: Adventurer): number {
  const { despairStreak, personality } = adventurer;
  if (despairStreak < 3) return 0;
  let prob = 0.10 + (despairStreak - 3) * 0.05;
  prob = Math.min(0.40, prob);
  if (personality.loyalty > 60) prob -= 0.10;
  return Math.max(0, prob);
}

// ---------------------------------------------------------------------------
// Departure reason rendering
// ---------------------------------------------------------------------------

function renderDepartureReason(topFactors: Adventurer['moodFactors']): string {
  if (topFactors.length === 0) return 'The weight of it all became too much.';
  const main = topFactors[0]!;
  const reasons: Record<string, string> = {
    QUEST_FAILURE: 'Too many failures left their mark.',
    ALLY_DIED:     'The loss of a companion was the final blow.',
    SOCIAL_ARGUMENT: 'The constant conflict wore them down.',
    IDLE_TOO_LONG:   'Too many idle days with no purpose.',
    LONELY:          'Isolation finally broke their resolve.',
  };
  return reasons[main.id] ?? `${main.label} proved too much to bear.`;
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

const DEPARTURE_ELIGIBLE: ReadonlySet<Adventurer['state']> = new Set(['IDLE', 'RESTING', 'SOCIALIZING']);

export function departureSubscriber(ctx: SimulationContext): SimulationContext {
  if (ctx.worldTime.hour !== 0) return ctx;

  let updatedCtx = ctx;

  for (const [id, adv] of ctx.adventurers) {
    if (!DEPARTURE_ELIGIBLE.has(adv.state)) continue;

    // despairStreak is maintained by moodSubscriber; check it here
    if (adv.despairStreak < 3) continue;

    const prob = computeDepartureProbability(adv);
    if (updatedCtx.rng.next() >= prob) continue;

    // Departure fires
    const top2 = topMoodFactors(adv.moodFactors.filter(f => f.value < 0), 2);
    const departureReason = renderDepartureReason(top2);

    const retired = transitionState(adv, 'RETIRED', { isDev: false, questId: null });
    const updatedAdventurers = new Map(updatedCtx.adventurers).set(id, { ...retired, currentQuestId: null });

    updatedCtx = emitEvent(
      { ...updatedCtx, adventurers: updatedAdventurers },
      { kind: 'LIFECYCLE', subtype: 'ADVENTURER_DEPARTED', involvedIds: [id] },
    );

    // Override renderedText with contextual departure reason
    const lastIdx = updatedCtx.eventLog.length - 1;
    const renderedText = `${adv.identity.name} has left the guild. ${departureReason}`;
    updatedCtx = {
      ...updatedCtx,
      eventLog: updatedCtx.eventLog.map((e, i) => i === lastIdx ? { ...e, renderedText } : e),
    };
  }

  return updatedCtx;
}
